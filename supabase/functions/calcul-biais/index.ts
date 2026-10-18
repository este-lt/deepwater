// Biais quotidien du S&P 500 et du Nasdaq-100, calculé une seule fois pour tout le
// monde à partir des données déjà en base (aucun appel d'API externe), uniquement sur
// des données concrètes : politique de la Fed, taux, statistiques, régime macroéconomique,
// dollar, courbe des taux, volatilité implicite, crédit, conditions financières. Aucune
// analyse technique.
// Appelé par pg_cron (mode "auto", si au moins un utilisateur l'a activé) ou par le
// bouton de calcul manuel (mode "manuel", limité par utilisateur côté serveur).
import { servirTacheProtegee } from "../_shared/garde.ts";
import { json } from "../_shared/http.ts";
import { executerTache } from "../_shared/journal.ts";
import { admin } from "../_shared/supabase.ts";
import {
  combiner,
  facteurConditions,
  facteurCourbe,
  facteurDollar,
  facteurFed,
  facteurMacro,
  facteurRegimeMacro,
  facteurRisque,
  facteurTaux,
  type PointMacro,
  type PointTaux,
  type PublicationMacro,
  seanceVisee,
} from "./facteurs.ts";
import { type CleIndice, REGLES_BIAIS } from "./regles.ts";

const jourMoins = (jours: number) => new Date(Date.now() - jours * 86_400_000).toISOString().slice(0, 10);

servirTacheProtegee(async (corps) => {
  const origine = corps.mode === "manuel" ? "manuel" : "auto";
  const resultat = await executerTache("calcul-biais", async () => {
    const db = admin();
    const seance = seanceVisee(new Date());
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const { macro: rMacro, taux: rTaux, risque: rRisque, conditions: rConditions, dollar: rDollar } = REGLES_BIAIS;
    const volatilites = Object.values(REGLES_BIAIS.indices).map((i) => i.volatilite);
    const symboles = [...new Set([rRisque.credit, ...volatilites, "US2Y", "FFR", "US10R", rConditions.serie, rDollar.serie, "WTI"])];
    // Séries macro américaines brutes (FRED) du régime macroéconomique.
    const SERIES_CYCLE = { emplois: "NONFARM_PAYROLL", chomage: "UNEMPLOYMENT", pib: "REAL_GDP", cpi: "CPI", pce: "CORE_PCE" } as const;

    const [tickers, taux, tauxCourts, publications, decisions, macroUs] = await Promise.all([
      db.from("tickers_suivis").select("id, symbole").in("symbole", [...Object.keys(REGLES_BIAIS.indices), ...symboles]),
      db.from("taux_tresor").select("date, taux, source_donnee").eq("maturite", rTaux.maturite).gte("date", jourMoins(60)).order("date"),
      db.from("taux_tresor").select("date, maturite, taux").in("maturite", ["3month", "2year"]).gte("date", jourMoins(30)).order("date"),
      db.from("calendrier_economique")
        .select("indicateur, date_reference, date_evenement, valeur, variation")
        .eq("type_evenement", "publication")
        .gte("date_evenement", jourMoins(rMacro.fenetreJours))
        .order("date_evenement", { ascending: false }),
      db.from("taux_directeurs").select("date, taux").eq("devise", "USD").gte("date", jourMoins(3 * 366)).order("date"),
      db.from("indicateurs_macro").select("indicateur, date, valeur").in("indicateur", Object.values(SERIES_CYCLE)).gte("date", jourMoins(2 * 366)).order("date"),
    ]);
    for (
      const [nom, r] of [
        ["instruments", tickers], ["taux", taux], ["taux courts", tauxCourts], ["calendrier", publications],
        ["décisions de la Fed", decisions], ["macro américaine", macroUs],
      ] as const
    ) {
      if (r.error) throw new Error(`Lecture ${nom} impossible : ${r.error.message}`);
    }
    const idDe = new Map((tickers.data ?? []).map((t) => [t.symbole, t.id]));

    // Séries concrètes sur un an (médiane de la volatilité) : VIX, VXN, spread HY, taux à
    // 2 ans, Fed funds effectif, taux réel à 10 ans, conditions financières.
    const series = new Map<string, PointTaux[]>();
    for (const symbole of symboles) {
      const id = idDe.get(symbole);
      if (!id) continue;
      const { data, error } = await db.from("prix_historique").select("date, cloture")
        .eq("ticker_id", id).gte("date", jourMoins(rRisque.joursMediane + 30)).order("date");
      if (error) throw new Error(`Lecture de ${symbole} impossible : ${error.message}`);
      series.set(symbole, (data ?? []).map((p) => ({ date: p.date, taux: Number(p.cloture) })));
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
    const serieTaux = (taux.data ?? []).map((p) => ({ date: p.date, taux: Number(p.taux) }));
    const sourceTaux = "FRED (DGS10, DFII10)";
    const decisionsFed = (decisions.data ?? []).map((d) => ({ date: d.date, taux: Number(d.taux) }));
    const serie = (s: string) => series.get(s) ?? [];
    const courts = (m: string) => (tauxCourts.data ?? []).filter((p) => p.maturite === m).map((p) => ({ date: p.date, taux: Number(p.taux) }));
    const macro = (cle: string): PointMacro[] =>
      (macroUs.data ?? []).filter((p) => p.indicateur === cle).map((p) => ({ date: p.date, valeur: Number(p.valeur) }));
    const seriesCycle = {
      emplois: macro(SERIES_CYCLE.emplois), chomage: macro(SERIES_CYCLE.chomage), pib: macro(SERIES_CYCLE.pib),
      cpi: macro(SERIES_CYCLE.cpi), pce: macro(SERIES_CYCLE.pce),
    };

    const bilan: Record<string, string> = {};
    for (const indice of Object.keys(REGLES_BIAIS.indices) as CleIndice[]) {
      const tickerId = idDe.get(indice);
      if (!tickerId) continue;

      const r = combiner([
        facteurFed(indice, serie("US2Y"), serie("FFR"), decisionsFed, aujourdhui),
        facteurTaux(indice, serieTaux, serie("US10R"), aujourdhui, sourceTaux),
        facteurMacro(indice, [...dernieres.values()], aujourdhui, "FRED (BLS, BEA)"),
        facteurRegimeMacro(indice, seriesCycle, serie("WTI"), aujourdhui),
        facteurDollar(indice, serie(rDollar.serie), aujourdhui),
        facteurCourbe(indice, courts("3month"), courts("2year"), serieTaux, aujourdhui),
        facteurRisque(indice, serie(REGLES_BIAIS.indices[indice].volatilite), serie(rRisque.credit), aujourdhui),
        facteurConditions(indice, serie(rConditions.serie), aujourdhui),
      ]);
      if (!r.ok) {
        bilan[indice] = `non publié : ${r.raison}`;
        continue;
      }

      // Données inchangées depuis le biais actif : rien à remplacer.
      const { data: actif } = await db
        .from("biais_quotidien")
        .select("id, facteurs")
        .eq("ticker_id", tickerId)
        .eq("date", seance)
        .eq("statut", "actif")
        .maybeSingle();
      const empreinte = (f: { cle: string; statut: string; note: number | null; texte: string; texte_en?: string }[]) =>
        JSON.stringify(f.map((x) => [x.cle, x.statut, x.note, x.texte, x.texte_en ?? ""]));
      if (actif && empreinte(actif.facteurs ?? []) === empreinte(r.facteurs)) {
        bilan[indice] = `${r.biais} (${r.score}), inchangé`;
        continue;
      }

      const { error } = await db.rpc("remplacer_biais", {
        p_biais: {
          date: seance,
          ticker_id: tickerId,
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
