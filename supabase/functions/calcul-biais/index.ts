// Biais quotidien du S&P 500 et du Nasdaq-100, calculé une seule fois pour tout le
// monde à partir des données déjà en base (aucun appel d'API externe).
// Appelé par pg_cron (mode "auto", si au moins un utilisateur l'a activé) ou par le
// bouton de calcul manuel (mode "manuel", limité par utilisateur côté serveur).
import { servirTacheProtegee } from "../_shared/garde.ts";
import { json } from "../_shared/http.ts";
import { executerTache } from "../_shared/journal.ts";
import { admin } from "../_shared/supabase.ts";
import {
  combiner,
  facteurFlux,
  facteurMacro,
  facteurTaux,
  facteurTendance,
  type MouvementInstitution,
  type PublicationMacro,
  seanceVisee,
  type TransactionInitie,
} from "./facteurs.ts";
import { type CleIndice, REGLES_BIAIS } from "./regles.ts";

const jourMoins = (jours: number) => new Date(Date.now() - jours * 86_400_000).toISOString().slice(0, 10);

// Lecture paginée (PostgREST plafonne à 1 000 lignes par requête).
async function toutLire<T>(requete: (de: number, a: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const lignes: T[] = [];
  for (let de = 0;; de += 1000) {
    const { data, error } = await requete(de, de + 999);
    if (error) throw new Error(error.message);
    lignes.push(...(data ?? []));
    if (!data || data.length < 1000) return lignes;
  }
}

servirTacheProtegee(async (corps) => {
  const origine = corps.mode === "manuel" ? "manuel" : "auto";
  const resultat = await executerTache("calcul-biais", async () => {
    const db = admin();
    const seance = seanceVisee(new Date());
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const { flux: rFlux, macro: rMacro, taux: rTaux } = REGLES_BIAIS;

    const [tickers, taux, publications, inities, institutions] = await Promise.all([
      db.from("tickers_suivis").select("id, symbole").in("symbole", Object.keys(REGLES_BIAIS.indices)),
      db.from("taux_tresor").select("date, taux, source_donnee").eq("maturite", rTaux.maturite).gte("date", jourMoins(rTaux.joursMoyenne + 30)).order("date"),
      db.from("calendrier_economique")
        .select("indicateur, date_reference, date_evenement, valeur, variation")
        .eq("type_evenement", "publication")
        .gte("date_evenement", jourMoins(rMacro.fenetreJours))
        .order("date_evenement", { ascending: false }),
      toutLire<{ entreprise: string; code_transaction: string; montant: number | null; date_depot: string }>((de, a) =>
        db.from("flux_inities")
          .select("entreprise, code_transaction, montant, date_depot")
          .in("code_transaction", ["P", "S"])
          .gte("date_depot", jourMoins(rFlux.joursRecents * (rFlux.semainesReference + 1)))
          .order("id")
          .range(de, a)
      ),
      db.from("positions_institutionnelles")
        .select("entreprise, variation_trimestre, valeur_usd, nombre_parts, date_depot")
        .not("variation_trimestre", "is", null)
        .gte("date_depot", jourMoins(rFlux.joursRecents)),
    ]);
    for (const [nom, r] of [["tickers", tickers], ["taux", taux], ["calendrier", publications], ["13F", institutions]] as const) {
      if (r.error) throw new Error(`Lecture ${nom} impossible : ${r.error.message}`);
    }

    // Dernière publication de chaque indicateur.
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
    const transactions: TransactionInitie[] = inities.map((t) => ({
      entreprise: t.entreprise, code: t.code_transaction, montant: t.montant === null ? null : Number(t.montant), date_depot: t.date_depot,
    }));
    const mouvements: MouvementInstitution[] = (institutions.data ?? []).map((m) => ({
      entreprise: m.entreprise,
      variation: Number(m.variation_trimestre),
      valeur: m.valeur_usd === null ? null : Number(m.valeur_usd),
      parts: Number(m.nombre_parts),
      date_depot: m.date_depot,
    }));
    const serieTaux = (taux.data ?? []).map((p) => ({ date: p.date, taux: Number(p.taux) }));
    const sourceTaux = taux.data?.at(-1)?.source_donnee ?? "alpha_vantage:TREASURY_YIELD";

    const bilan: Record<string, string> = {};
    for (const ticker of tickers.data ?? []) {
      const indice = ticker.symbole as CleIndice;
      const { data: prix, error: erreurPrix } = await db
        .from("prix_historique")
        .select("date, cloture, mm20, mm50, source_donnee")
        .eq("ticker_id", ticker.id)
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (erreurPrix) throw new Error(`Lecture des cours ${indice} impossible : ${erreurPrix.message}`);

      const r = combiner([
        facteurTendance(
          indice,
          prix && { date: prix.date, cloture: Number(prix.cloture), mm20: prix.mm20 === null ? null : Number(prix.mm20), mm50: prix.mm50 === null ? null : Number(prix.mm50), source: prix.source_donnee },
          aujourdhui,
        ),
        facteurTaux(indice, serieTaux, aujourdhui, sourceTaux),
        facteurMacro(indice, [...dernieres.values()], aujourdhui, "alpha_vantage (BLS, BEA)"),
        facteurFlux(indice, transactions, mouvements, aujourdhui),
      ]);
      if (!r.ok) {
        bilan[indice] = `non publié : ${r.raison}`;
        continue;
      }

      // Données inchangées depuis le biais actif : rien à remplacer.
      const { data: actif } = await db
        .from("biais_quotidien")
        .select("id, facteurs")
        .eq("ticker_id", ticker.id)
        .eq("date", seance)
        .eq("statut", "actif")
        .maybeSingle();
      const empreinte = (f: { cle: string; statut: string; note: number | null; texte: string }[]) =>
        JSON.stringify(f.map((x) => [x.cle, x.statut, x.note, x.texte]));
      if (actif && empreinte(actif.facteurs ?? []) === empreinte(r.facteurs)) {
        bilan[indice] = `${r.biais} (${r.score}), inchangé`;
        continue;
      }

      const { error } = await db.rpc("remplacer_biais", {
        p_biais: {
          date: seance,
          ticker_id: ticker.id,
          biais: r.biais,
          score_numerique: r.score,
          raisons: r.raisons,
          facteurs: r.facteurs,
          sources_citees: r.sources,
          origine,
          version_regles: REGLES_BIAIS.version,
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
      message: `Séance du ${seance} (${origine}) : ${Object.entries(bilan).map(([i, b]) => `${i} ${b}`).join(" ; ")}`,
      details: { seance, origine, bilan },
    };
  });
  return json(resultat, resultat.ok ? 200 : 500);
});
