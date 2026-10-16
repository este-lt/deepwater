// Collecteur multi-actifs, sources gratuites et officielles, sans quota :
//   fred       : indices, volatilité, taux, crédit, pétrole, gaz, crypto (clôtures), macro
//   bce        : cours de référence des devises
//   crypto     : cours du moment (CoinGecko)
//   calendrier : dates des prochaines publications macro (API FRED, clé gratuite)
// Une série en panne est journalisée et ignorée sans bloquer les autres.
import { type Calcul, lireCoursBce, paire } from "../_shared/bce.ts";
import { enregistrerPublication, PUBLICATIONS } from "../_shared/calendrier.ts";
import { lireCoursCrypto } from "../_shared/coingecko.ts";
import { appelerApiFred, lireSerieFred } from "../_shared/fred.ts";
import { servirTacheProtegee } from "../_shared/garde.ts";
import { attendre, json } from "../_shared/http.ts";
import { executerTache } from "../_shared/journal.ts";
import { derniereDatePrix, enregistrerPrix } from "../_shared/prix.ts";
import { admin } from "../_shared/supabase.ts";

const HISTORIQUE_ANS = 10;
const RECHARGE_JOURS = 30;
const PAUSE_FRED_MS = 250;

const jourIso = (d: Date) => d.toISOString().slice(0, 10);
const ilYa = (jours: number) => jourIso(new Date(Date.now() - jours * 86_400_000));

interface Ticker {
  id: string;
  symbole: string;
  prioritaire: boolean;
  source_principale: string;
  symboles_source: { fred?: string; alpha_vantage?: string; coingecko?: string; bce?: { devise: string; calcul: Calcul } };
}

async function lireTickers(): Promise<Ticker[]> {
  const { data, error } = await admin()
    .from("tickers_suivis")
    .select("id, symbole, prioritaire, source_principale, symboles_source")
    .eq("actif_bool", true)
    .order("ordre");
  if (error) throw new Error(`Lecture des instruments impossible : ${error.message}`);
  return (data ?? []) as Ticker[];
}

// Premier passage : 10 ans d'historique ; ensuite les 30 derniers jours (révisions comprises).
async function debutChargement(tickerId: string): Promise<string> {
  const derniere = await derniereDatePrix(tickerId);
  return derniere ? ilYa(RECHARGE_JOURS) : ilYa(HISTORIQUE_ANS * 366);
}

const barre = (date: string, cloture: number) => ({ date, ouverture: null, plus_haut: null, plus_bas: null, cloture, volume: null });

type Bilan = Record<string, string>;

// ---------------------------------------------------------------------------- FRED

const MATURITES: [string, string][] = [
  ["3month", "DGS3MO"], ["2year", "DGS2"], ["5year", "DGS5"], ["7year", "DGS7"], ["10year", "DGS10"], ["30year", "DGS30"],
];

async function collecterFred(bilan: Bilan, erreurs: string[]): Promise<void> {
  // Abonnement Alpha Vantage premium : les indices prioritaires passent sur INDEX_DATA.
  const { data: config } = await admin().from("config_app").select("valeur").eq("cle", "av_premium").maybeSingle();
  const premium = config?.valeur === true;
  await admin().from("collectes_planifiees").update({ actif: premium }).eq("groupe", "premium:indices");

  const essayer = async (cle: string, travail: () => Promise<string>) => {
    try {
      bilan[cle] = await travail();
    } catch (erreur) {
      const message = erreur instanceof Error ? erreur.message : String(erreur);
      erreurs.push(`${cle} : ${message}`);
      bilan[cle] = `échec : ${message}`;
    }
    await attendre(PAUSE_FRED_MS);
  };

  for (const t of await lireTickers()) {
    const serie = t.symboles_source.fred;
    if (t.source_principale !== "fred" || !serie) continue;
    if (premium && t.prioritaire && t.symboles_source.alpha_vantage) {
      bilan[t.symbole] = "Alpha Vantage premium";
      continue;
    }
    await essayer(t.symbole, async () => {
      const observations = await lireSerieFred(serie, await debutChargement(t.id));
      const { lignes } = await enregistrerPrix(t.id, observations.map(([d, v]) => barre(d, v)), `fred:${serie}`);
      const [d, v] = observations[observations.length - 1];
      return `${v} (${d}), ${lignes} lignes`;
    });
  }

  // Courbe des taux du Trésor (carte « Taux » et biais).
  let depuisSpreads = ilYa(RECHARGE_JOURS);
  for (const [maturite, serie] of MATURITES) {
    await essayer(`taux:${maturite}`, async () => {
      const { count } = await admin().from("taux_tresor").select("id", { count: "exact", head: true })
        .eq("maturite", maturite).like("source_donnee", "fred:%");
      const depuis = (count ?? 0) > 0 ? ilYa(RECHARGE_JOURS) : ilYa(3 * 366);
      if (depuis < depuisSpreads) depuisSpreads = depuis;
      const observations = await lireSerieFred(serie, depuis);
      const { error } = await admin().from("taux_tresor").upsert(
        observations.map(([date, taux]) => ({ date, maturite, taux, source_donnee: `fred:${serie}`, maj_le: new Date().toISOString() })),
        { onConflict: "date,maturite" },
      );
      if (error) throw new Error(error.message);
      return `${observations.length} jours`;
    });
  }
  const { error: erreurSpreads } = await admin().rpc("recalculer_spreads", { p_depuis: depuisSpreads });
  if (erreurSpreads) erreurs.push(`écarts de taux : ${erreurSpreads.message}`);

  // Statistiques macro + détection des nouvelles publications pour le calendrier.
  for (const [indicateur, def] of Object.entries(PUBLICATIONS)) {
    await essayer(`macro:${indicateur}`, async () => {
      const observations = await lireSerieFred(def.serie, ilYa(6 * 366));
      const { data: avant } = await admin().from("indicateurs_macro").select("date")
        .eq("indicateur", indicateur).order("date", { ascending: false }).limit(1).maybeSingle();
      const { error } = await admin().from("indicateurs_macro").upsert(
        observations.map(([date, valeur]) => ({
          indicateur, date, valeur, unite: null, source_donnee: `fred:${def.serie}`, maj_le: new Date().toISOString(),
        })),
        { onConflict: "indicateur,date" },
      );
      if (error) throw new Error(error.message);
      const nouvelle = await enregistrerPublication(
        indicateur,
        observations.map(([date, valeur]) => ({ date, valeur })),
        avant?.date ?? null,
      );
      const [d, v] = observations[observations.length - 1];
      return `${v} (${d})${nouvelle ? ", publication ajoutée" : ""}`;
    });
  }
}

// ---------------------------------------------------------------------------- BCE

async function collecterBce(bilan: Bilan, erreurs: string[]): Promise<void> {
  const tickers = (await lireTickers()).filter((t) => t.source_principale === "bce" && t.symboles_source.bce);
  if (tickers.length === 0) return;
  const debuts = new Map<string, string>();
  for (const t of tickers) debuts.set(t.id, await debutChargement(t.id));
  const depuis = [...debuts.values()].sort()[0];
  const devises = [...new Set(["USD", ...tickers.map((t) => t.symboles_source.bce!.devise)])];
  const cours = await lireCoursBce(devises, depuis);
  for (const t of tickers) {
    try {
      const { devise, calcul } = t.symboles_source.bce!;
      const points = paire(cours, devise, calcul).filter(([d]) => d >= debuts.get(t.id)!);
      if (points.length === 0) throw new Error("aucun cours");
      await enregistrerPrix(t.id, points.map(([d, v]) => barre(d, v)), "bce:EXR");
      const [d, v] = points[points.length - 1];
      bilan[t.symbole] = `${v} (${d})`;
    } catch (erreur) {
      const message = erreur instanceof Error ? erreur.message : String(erreur);
      erreurs.push(`${t.symbole} : ${message}`);
      bilan[t.symbole] = `échec : ${message}`;
    }
  }
}

// ---------------------------------------------------------------------------- Crypto

async function collecterCrypto(bilan: Bilan): Promise<void> {
  const tickers = (await lireTickers()).filter((t) => t.symboles_source.coingecko);
  const cours = await lireCoursCrypto(tickers.map((t) => t.symboles_source.coingecko!));
  for (const t of tickers) {
    const c = cours.get(t.symboles_source.coingecko!);
    if (!c) {
      bilan[t.symbole] = "absent de la réponse";
      continue;
    }
    // Ligne du jour (UTC) ; la clôture officielle Coinbase (FRED) la remplace le lendemain.
    await enregistrerPrix(t.id, [barre(jourIso(c.majLe), c.prix)], "coingecko");
    bilan[t.symbole] = `${c.prix} à ${c.majLe.toISOString().slice(11, 16)} UTC`;
  }
  if (Object.keys(bilan).length === 0) throw new Error("Aucun cours crypto reçu.");
}

// ---------------------------------------------------------------------------- Calendrier

// Publications suivies : une par communiqué officiel (le CPI et le CPI sous-jacent partagent le leur).
// Heure : 8 h 30 à New York pour toutes (BLS, BEA, ministère du Travail).
const PREVUES = [
  { cle: "REL:CPI", serie: "CPIAUCNS", libelle: "Inflation (CPI)", impact: "fort", nombre: 1 },
  { cle: "REL:EMPLOI", serie: "PAYEMS", libelle: "Rapport sur l'emploi (créations d'emplois, chômage)", impact: "fort", nombre: 1 },
  { cle: "REL:PCE", serie: "PCEPILFE", libelle: "Inflation PCE (revenus et dépenses des ménages)", impact: "fort", nombre: 1 },
  { cle: "REL:PIB", serie: "GDPC1", libelle: "PIB", impact: "fort", nombre: 1 },
  { cle: "REL:PPI", serie: "PPIFID", libelle: "Prix à la production (PPI)", impact: "moyen", nombre: 1 },
  { cle: "REL:VENTES", serie: "RSAFS", libelle: "Ventes au détail", impact: "moyen", nombre: 1 },
  { cle: "REL:INSCRIPTIONS", serie: "ICSA", libelle: "Inscriptions au chômage", impact: "moyen", nombre: 2 },
] as const;

async function collecterCalendrier(bilan: Bilan, erreurs: string[]): Promise<string | null> {
  const aujourdhui = jourIso(new Date());
  const fin = ilYa(-120);
  for (const p of PREVUES) {
    try {
      const rel = await appelerApiFred<{ releases?: { id: number; name: string }[] }>("series/release", { series_id: p.serie });
      if (rel === null) return "Clé API FRED absente du coffre Supabase : dates des prochaines publications indisponibles.";
      const release = rel.releases?.[0];
      if (!release) throw new Error("communiqué introuvable");
      const dates = await appelerApiFred<{ release_dates?: { date: string }[] }>("release/dates", {
        release_id: String(release.id),
        realtime_start: aujourdhui,
        realtime_end: fin,
        include_release_dates_with_no_data: "true",
        sort_order: "asc",
        limit: "10",
      });
      const prochaines = [...new Set((dates?.release_dates ?? []).map((d) => d.date))]
        .filter((d) => d >= aujourdhui)
        .slice(0, p.nombre);
      if (prochaines.length) {
        const { error } = await admin().from("calendrier_economique").upsert(
          prochaines.map((date) => ({
            indicateur: p.cle,
            libelle: p.libelle,
            type_evenement: "publication_prevue",
            date_evenement: date,
            date_estimee: false,
            impact: p.impact,
            source_donnee: `fred:release:${release.id}`,
            maj_le: new Date().toISOString(),
          })),
          { onConflict: "indicateur,type_evenement,date_evenement" },
        );
        if (error) throw new Error(error.message);
      }
      bilan[p.cle] = prochaines.join(", ") || "aucune date annoncée";
    } catch (erreur) {
      const message = erreur instanceof Error ? erreur.message : String(erreur);
      erreurs.push(`${p.cle} : ${message}`);
      bilan[p.cle] = `échec : ${message}`;
    }
  }
  await admin().from("calendrier_economique").delete().eq("type_evenement", "publication_prevue").lt("date_evenement", aujourdhui);
  return null;
}

// ---------------------------------------------------------------------------- Point d'entrée

const SOURCES = ["fred", "bce", "crypto", "calendrier"] as const;

servirTacheProtegee(async (corps) => {
  const source = SOURCES.find((s) => s === corps.source);
  if (!source) return json({ ok: false, message: `Source inconnue : ${String(corps.source)}` }, 400);
  const resultat = await executerTache(`collecte-marches:${source}`, async () => {
    const bilan: Bilan = {};
    const erreurs: string[] = [];
    let remarque: string | null = null;
    if (source === "fred") await collecterFred(bilan, erreurs);
    if (source === "bce") await collecterBce(bilan, erreurs);
    if (source === "crypto") await collecterCrypto(bilan);
    if (source === "calendrier") remarque = await collecterCalendrier(bilan, erreurs);
    const total = Object.keys(bilan).length;
    if (total > 0 && erreurs.length === total) throw new Error(`Toutes les séries en échec : ${erreurs.join(" | ")}`);
    const resume = remarque ?? Object.entries(bilan).map(([c, b]) => `${c} ${b}`).join(" ; ");
    return { message: `${total - erreurs.length}/${total} à jour${erreurs.length ? ` (${erreurs.length} en échec)` : ""} : ${resume}`, details: { bilan, erreurs } };
  });
  return json(resultat, resultat.ok ? 200 : 500);
});
