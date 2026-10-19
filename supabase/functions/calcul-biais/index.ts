// Biais quotidien du S&P 500 et du Nasdaq-100, calculé une seule fois pour tout le
// monde à partir des données déjà en base (aucun appel d'API externe), uniquement sur
// des données concrètes. Score : révision des anticipations de la Fed, surprises macro, peur
// sur les options ; le reste (taux longs, régime, liquidité, dollar, courbe, conditions,
// positionnement) est affiché comme contexte. Aucune analyse technique (voir regles.ts).
// Biais intraday : séance de New York (9 h 30 - 16 h), voir _shared/sessions.ts. Modes :
// « auto » (pg_cron, 9 h 05 heure de New York), « manuel » (bouton, limité par utilisateur
// côté serveur), « historique » (règles rejouées sur un trimestre).
import { servirTacheProtegee } from "../_shared/garde.ts";
import { json } from "../_shared/http.ts";
import { executerTache } from "../_shared/journal.ts";
import { type Famille, SENS_ACTIONS } from "../_shared/publications.ts";
import { debutPublications, type Session } from "../_shared/sessions.ts";
import { admin } from "../_shared/supabase.ts";
import {
  combiner,
  facteurConditions,
  facteurCourbe,
  facteurDollar,
  facteurFed,
  facteurLiquidite,
  facteurMacro,
  facteurPositionnement,
  facteurPublications,
  facteurRegimeMacro,
  facteurRisque,
  facteurTaux,
  type PointMacro,
  type PointTaux,
  type PositionCot,
  type PublicationConsensus,
  type PublicationMacro,
  seanceVisee,
  type SurpriseConsensus,
} from "./facteurs.ts";
import { type DonneesHistoriques, rejouer, statistiques } from "./historique.ts";
import { type CleIndice, REGLES_BIAIS } from "./regles.ts";

const jourMoins = (jours: number) => new Date(Date.now() - jours * 86_400_000).toISOString().slice(0, 10);
const SERIES_CYCLE = { emplois: "NONFARM_PAYROLL", chomage: "UNEMPLOYMENT", pib: "REAL_GDP", cpi: "CPI", pce: "CORE_PCE" } as const;
const SYMBOLES_LIQUIDITE = ["WALCL", "TGA", "RRP", "M2"];

// Lecture paginée (PostgREST renvoie au plus 1000 lignes par requête).
async function toutLire<T>(requete: (debut: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, nom: string): Promise<T[]> {
  const lignes: T[] = [];
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await requete(debut);
    if (error) throw new Error(`Lecture ${nom} impossible : ${error.message}`);
    lignes.push(...(data ?? []));
    if ((data ?? []).length < 1000) return lignes;
  }
}

async function lireSeries(ids: Map<string, string>, symboles: string[], du: string, au?: string): Promise<Record<string, PointTaux[]>> {
  const series: Record<string, PointTaux[]> = {};
  for (const symbole of symboles) {
    const id = ids.get(symbole);
    if (!id) continue;
    const lignes = await toutLire<{ date: string; cloture: number }>((debut) => {
      let q = admin().from("prix_historique").select("date, cloture").eq("ticker_id", id).gte("date", du);
      if (au) q = q.lte("date", au);
      return q.order("date").range(debut, debut + 999);
    }, symbole);
    series[symbole] = lignes.map((p) => ({ date: p.date, taux: Number(p.cloture) }));
  }
  return series;
}

async function lireCot(codes: string[], du: string): Promise<Record<string, PositionCot[]>> {
  const lignes = await toutLire<{ date: string; code: string; interet_ouvert: number; fonds_long: number; fonds_court: number }>(
    (debut) => admin().from("positions_cot").select("date, code, interet_ouvert, fonds_long, fonds_court").in("code", codes).gte("date", du).order("date").range(debut, debut + 999),
    "du rapport COT",
  );
  const cot: Record<string, PositionCot[]> = {};
  for (const l of lignes) (cot[l.code] ??= []).push({ date: l.date, interet_ouvert: Number(l.interet_ouvert), fonds_long: Number(l.fonds_long), fonds_court: Number(l.fonds_court) });
  return cot;
}

async function lireMacro(du: string): Promise<Record<string, PointMacro[]>> {
  const cles = [...new Set([...Object.keys(REGLES_BIAIS.macro.indicateurs), ...Object.values(SERIES_CYCLE)])];
  const lignes = await toutLire<{ indicateur: string; date: string; valeur: number }>(
    (debut) => admin().from("indicateurs_macro").select("indicateur, date, valeur").in("indicateur", cles).gte("date", du).order("date").range(debut, debut + 999),
    "de la macro américaine",
  );
  const macro: Record<string, PointMacro[]> = {};
  for (const l of lignes) (macro[l.indicateur] ??= []).push({ date: l.date, valeur: Number(l.valeur) });
  return macro;
}

async function idsTickers(symboles: string[]): Promise<Map<string, string>> {
  const { data, error } = await admin().from("tickers_suivis").select("id, symbole").in("symbole", symboles);
  if (error) throw new Error(`Lecture des instruments impossible : ${error.message}`);
  return new Map((data ?? []).map((t) => [t.symbole, t.id]));
}

const decisionsFed = async (du: string) => {
  const { data, error } = await admin().from("taux_directeurs").select("date, taux").eq("devise", "USD").gte("date", du).order("date");
  if (error) throw new Error(`Lecture des décisions de la Fed impossible : ${error.message}`);
  return (data ?? []).map((d) => ({ date: d.date, taux: Number(d.taux) }));
};

// ---------------------------------------------------------------------------- Historique

async function calculerHistorique(annee: number, trimestre: number | null) {
  const du = trimestre ? `${annee}-${String((trimestre - 1) * 3 + 1).padStart(2, "0")}-01` : `${annee}-01-01`;
  const au = trimestre ? new Date(Date.UTC(annee, trimestre * 3, 0)).toISOString().slice(0, 10) : `${annee}-12-31`;
  const periode = trimestre ? `T${trimestre} ${annee}` : `${annee}`;
  const indices = Object.keys(REGLES_BIAIS.indices) as CleIndice[];
  const symboles = [...new Set([
    ...indices, "VIX", "VIX3M", "US1Y", "US2Y", "US3M", "US10Y", "US10R", "FFR", REGLES_BIAIS.risque.credit,
    REGLES_BIAIS.conditions.serie, REGLES_BIAIS.dollar.serie, "WTI", ...SYMBOLES_LIQUIDITE,
  ])];
  const ids = await idsTickers(symboles);
  const donnees: DonneesHistoriques = {
    series: await lireSeries(ids, symboles, `${annee - 2}-01-01`, `${annee + 1}-02-15`),
    decisions: await decisionsFed(`${annee - 5}-01-01`),
    macro: await lireMacro(`${annee - 3}-01-01`),
    cot: await lireCot(indices.map((i) => REGLES_BIAIS.indices[i].cot), `${annee - 4}-01-01`),
  };
  const { lignes, regimes } = rejouer(donnees, du, au);
  const version = REGLES_BIAIS.version;
  for (let i = 0; i < lignes.length; i += 500) {
    const { error } = await admin().from("historique_biais").upsert(lignes.slice(i, i + 500).map((l) => ({ ...l, version })), { onConflict: "version,indice,date" });
    if (error) throw new Error(`Écriture de l'historique impossible : ${error.message}`);
  }
  if (regimes.length) {
    const { error } = await admin().from("regimes_historiques").upsert(regimes.map((r) => ({ ...r, version })), { onConflict: "version,mois" });
    if (error) throw new Error(`Écriture des régimes impossible : ${error.message}`);
  }
  const s = statistiques(lignes.filter((l) => l.indice === "SPX"));
  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)} %`);
  return {
    message: `${periode} (règles ${version}) : ${lignes.length} séances rejouées, ${regimes.length} mois ; S&P 500 : réussite haussier ${pct(s.haussier.reussite)} sur ${s.haussier.seances}, baissier ${pct(s.baissier.reussite)} sur ${s.baissier.seances}`,
    details: { annee, trimestre, version, seances: lignes.length, statistiques_spx: s },
  };
}

// ---------------------------------------------------------------------------- Biais du jour

async function calculerJour(origine: "auto" | "manuel") {
  const db = admin();
  const maintenant = new Date();
  const seance = seanceVisee(maintenant);
  const session: Session = "new_york";
  const aujourdhui = maintenant.toISOString().slice(0, 10);
  const { macro: rMacro, taux: rTaux, risque: rRisque, conditions: rConditions, dollar: rDollar } = REGLES_BIAIS;
  const indices = Object.keys(REGLES_BIAIS.indices) as CleIndice[];
  const symboles = [...new Set([
    rRisque.credit, "VIX", "VIX3M", "US1Y", "US2Y", "FFR", "US10R", rConditions.serie, rDollar.serie, "WTI", ...SYMBOLES_LIQUIDITE,
  ])];

  // Version des règles conservée telle quelle (traçabilité des pondérations).
  await db.from("regles_versions").upsert({ version: REGLES_BIAIS.version, regles: REGLES_BIAIS }, { onConflict: "version", ignoreDuplicates: true });

  const [ids, taux, tauxCourts, publications, decisions, consensus] = await Promise.all([
    idsTickers([...indices, ...symboles]),
    db.from("taux_tresor").select("date, taux, source_donnee").eq("maturite", rTaux.maturite).gte("date", jourMoins(60)).order("date"),
    db.from("taux_tresor").select("date, maturite, taux").in("maturite", ["3month", "2year"]).gte("date", jourMoins(30)).order("date"),
    db.from("calendrier_economique")
      .select("indicateur, date_reference, date_evenement, valeur, variation")
      .eq("type_evenement", "publication")
      .gte("date_evenement", jourMoins(rMacro.fenetreJours))
      .order("date_evenement", { ascending: false }),
    decisionsFed(jourMoins(3 * 366)),
    db.from("publications_consensus").select("devise, libelle, publie, prevision, unite, surprise, famille, instant")
      .gte("instant", new Date(Date.now() - rMacro.fenetreConsensusJours * 86_400_000).toISOString()),
  ]);
  for (const [nom, r] of [["taux", taux], ["taux courts", tauxCourts], ["calendrier", publications], ["consensus", consensus]] as const) {
    if (r.error) throw new Error(`Lecture ${nom} impossible : ${r.error.message}`);
  }
  // M2 (mensuel) : 14 mois au moins pour sa croissance sur 1 an.
  const series = {
    ...await lireSeries(ids, symboles.filter((s) => s !== "M2"), jourMoins(rRisque.joursMediane + 30)),
    ...await lireSeries(ids, ["M2"], jourMoins(500)),
  };
  const macroUs = await lireMacro(jourMoins(2 * 366));
  const cot = await lireCot(indices.map((i) => REGLES_BIAIS.indices[i].cot), jourMoins(3 * 366 + 30));

  const dernieres = new Map<string, PublicationMacro>();
  for (const p of publications.data ?? []) {
    if (dernieres.has(p.indicateur)) continue;
    dernieres.set(p.indicateur, {
      indicateur: p.indicateur,
      periode: p.date_reference,
      detecteeLe: p.date_evenement,
      valeur: p.valeur === null ? null : Number(p.valeur),
      variation: p.variation === null ? null : Number(p.variation),
    });
  }
  const toutes: PublicationConsensus[] = (consensus.data ?? []).map((c) => ({
    devise: c.devise, libelle: c.libelle, publie: Number(c.publie), prevision: Number(c.prevision), unite: c.unite,
    surprise: Number(c.surprise), instant: c.instant,
  }));
  const depuis = debutPublications(seance);
  const surprises: SurpriseConsensus[] = (consensus.data ?? []).filter((c) => c.devise === "USD").map((c) => ({
    libelle: c.libelle, publie: Number(c.publie), prevision: Number(c.prevision), unite: c.unite, surprise: Number(c.surprise),
    sens: SENS_ACTIONS[c.famille as Famille] ?? 0, instant: c.instant,
  }));
  const serieTaux = (taux.data ?? []).map((p) => ({ date: p.date, taux: Number(p.taux) }));
  const serie = (s: string) => series[s] ?? [];
  const courts = (m: string) => (tauxCourts.data ?? []).filter((p) => p.maturite === m).map((p) => ({ date: p.date, taux: Number(p.taux) }));
  const seriesCycle = {
    emplois: macroUs[SERIES_CYCLE.emplois] ?? [], chomage: macroUs[SERIES_CYCLE.chomage] ?? [], pib: macroUs[SERIES_CYCLE.pib] ?? [],
    cpi: macroUs[SERIES_CYCLE.cpi] ?? [], pce: macroUs[SERIES_CYCLE.pce] ?? [],
  };

  const bilan: Record<string, string> = {};
  for (const indice of indices) {
    const tickerId = ids.get(indice);
    if (!tickerId) continue;
    const regles = REGLES_BIAIS.indices[indice];
    const r = combiner([
      facteurFed(indice, serie("US2Y"), serie("FFR"), decisions, aujourdhui, serie("US1Y")),
      facteurTaux(indice, serieTaux, serie("US10R"), aujourdhui, "FRED (DGS10, DFII10)"),
      facteurMacro(indice, [...dernieres.values()], aujourdhui, "FRED (BLS, BEA)", surprises),
      facteurRegimeMacro(indice, seriesCycle, serie("WTI"), aujourdhui),
      facteurLiquidite(indice, serie("WALCL"), serie("TGA"), serie("RRP"), serie("M2"), aujourdhui),
      facteurDollar(indice, serie(rDollar.serie), aujourdhui),
      facteurCourbe(indice, courts("3month"), courts("2year"), serieTaux, aujourdhui),
      facteurRisque(indice, serie("VIX"), serie("VIX3M"), aujourdhui, serie(rRisque.credit)),
      facteurConditions(indice, serie(rConditions.serie), aujourdhui),
      facteurPositionnement(indice, cot[regles.cot] ?? [], aujourdhui),
      facteurPublications(indice, toutes, depuis, maintenant.toISOString()),
    ]);
    if (!r.ok) {
      bilan[indice] = `non publié : ${r.raison}`;
      continue;
    }

    // Données inchangées depuis le biais actif : rien à remplacer.
    const { data: actif } = await db.from("biais_quotidien").select("id, facteurs")
      .eq("ticker_id", tickerId).eq("date", seance).eq("session", session).eq("statut", "actif").maybeSingle();
    const empreinte = (f: { cle: string; statut: string; note: number | null; texte: string; texte_en?: string }[]) =>
      JSON.stringify(f.map((x) => [x.cle, x.statut, x.note, x.texte, x.texte_en ?? ""]));
    if (actif && empreinte(actif.facteurs ?? []) === empreinte(r.facteurs)) {
      bilan[indice] = `${r.biais} (${r.score}), inchangé`;
      continue;
    }

    const { error } = await db.rpc("remplacer_biais", {
      p_biais: {
        date: seance, session, ticker_id: tickerId, biais: r.biais, score_numerique: r.score, raisons: r.raisons, facteurs: r.facteurs,
        sources_citees: r.sources, origine, version_regles: REGLES_BIAIS.version,
      },
    });
    if (error) throw new Error(`Écriture du biais ${indice} impossible : ${error.message}`);
    bilan[indice] = `${r.biais} (${r.score})${actif ? ", remplace le précédent" : ""}`;
  }

  if (Object.keys(bilan).length === 0) throw new Error("Aucun indice prioritaire trouvé (SPX, NDX).");
  if (Object.values(bilan).every((b) => b.startsWith("non publié"))) {
    throw new Error(`Aucun biais publié : ${Object.entries(bilan).map(([i, b]) => `${i} ${b}`).join(" ; ")}`);
  }
  return {
    message: `Séance du ${seance}, intraday (${origine}) : ${Object.entries(bilan).map(([i, b]) => `${i} ${b}`).join(" ; ")}`,
    details: { seance, session, origine, bilan },
  };
}

servirTacheProtegee(async (corps) => {
  if (corps.mode === "historique") {
    const annee = Number(corps.annee);
    if (!Number.isInteger(annee) || annee < 2000 || annee > 2100) return json({ ok: false, message: "Année invalide." }, 400);
    const trimestre = corps.trimestre === undefined ? null : Number(corps.trimestre);
    if (trimestre !== null && ![1, 2, 3, 4].includes(trimestre)) return json({ ok: false, message: "Trimestre invalide." }, 400);
    const resultat = await executerTache("calcul-biais:historique", () => calculerHistorique(annee, trimestre));
    return json(resultat, resultat.ok ? 200 : 500);
  }
  const origine = corps.mode === "manuel" ? "manuel" : "auto";
  const resultat = await executerTache("calcul-biais", () => calculerJour(origine));
  return json(resultat, resultat.ok ? 200 : 500);
});
