// Traitements par type de donnée Alpha Vantage : chaque "cible" transforme une
// réponse validée en lignes de la base. Les étapes suivantes en ajoutent.
import { extraireSerieQuotidienne } from "../_shared/alpha-vantage.ts";
import { enregistrerPrix } from "../_shared/prix.ts";
import { admin } from "../_shared/supabase.ts";

export interface Collecte {
  id: string;
  cle: string;
  libelle: string;
  parametres: Record<string, unknown>;
  priorite: number;
  intervalle: string;
  ttl_cache: string;
  ticker_id: string | null;
}

type Traitement = (collecte: Collecte, donnees: Record<string, unknown>) => Promise<string>;

// "None", "", "-" -> null ; jamais de valeur inventée.
const nombre = (v: unknown): number | null => {
  if (v === undefined || v === null || v === "" || v === "None" || v === "-") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

type Rapport = Record<string, string>;

// Écrit une partie des états financiers (chaque endpoint ne remplit que ses colonnes),
// puis recalcule les ratios de l'entreprise.
async function enregistrerEtats(
  symbole: string,
  donnees: Record<string, unknown>,
  colonnes: (r: Rapport) => Record<string, number | null>,
): Promise<string> {
  const lignes: Record<string, unknown>[] = [];
  for (const [cle, periode] of [["annualReports", "annuel"], ["quarterlyReports", "trimestriel"]] as const) {
    for (const r of (donnees[cle] as Rapport[] | undefined) ?? []) {
      if (!r.fiscalDateEnding) continue;
      lignes.push({
        entreprise: symbole,
        date_cloture: r.fiscalDateEnding,
        periode,
        devise: r.reportedCurrency ?? null,
        source_donnee: "alpha_vantage",
        ...colonnes(r),
      });
    }
  }
  if (lignes.length === 0) throw new Error("Aucun état financier dans la réponse.");
  const { error } = await admin().from("fondamentales").upsert(lignes, { onConflict: "entreprise,date_cloture,periode" });
  if (error) throw new Error(`Écriture des fondamentales impossible : ${error.message}`);
  const { error: erreurRatios } = await admin().rpc("recalculer_ratios", { p_entreprise: symbole });
  if (erreurRatios) throw new Error(`Calcul des ratios impossible : ${erreurRatios.message}`);
  return `${lignes.length} périodes`;
}

export const CIBLES: Record<string, Traitement> = {
  async prix_quotidiens(collecte, donnees) {
    if (!collecte.ticker_id) throw new Error("Collecte de prix sans ticker.");
    const barres = extraireSerieQuotidienne(donnees);
    if (barres.length === 0) throw new Error("Série de prix vide ou format inattendu.");
    const fonction = String(collecte.parametres.function ?? "");
    const { lignes } = await enregistrerPrix(collecte.ticker_id, barres, `alpha_vantage:${fonction}`);
    const derniere = barres[barres.length - 1];
    return `${lignes} séances, dernière clôture ${derniere.cloture} (${derniere.date})`;
  },

  compte_resultat(collecte, donnees) {
    return enregistrerEtats(String(collecte.parametres.symbol), donnees, (r) => ({
      chiffre_affaires: nombre(r.totalRevenue),
      resultat_net: nombre(r.netIncome),
    }));
  },

  bilan(collecte, donnees) {
    return enregistrerEtats(String(collecte.parametres.symbol), donnees, (r) => ({
      capitaux_propres: nombre(r.totalShareholderEquity),
      dette_totale: nombre(r.shortLongTermDebtTotal) ??
        (nombre(r.longTermDebt) !== null || nombre(r.shortTermDebt) !== null
          ? (nombre(r.longTermDebt) ?? 0) + (nombre(r.shortTermDebt) ?? 0)
          : null),
      actions_en_circulation: nombre(r.commonStockSharesOutstanding),
    }));
  },

  flux_tresorerie(collecte, donnees) {
    return enregistrerEtats(String(collecte.parametres.symbol), donnees, (r) => ({
      flux_tresorerie_operationnel: nombre(r.operatingCashflow),
    }));
  },

  // Aperçu : ratios publiés par Alpha Vantage à la date du dernier trimestre (ligne "instantane").
  async apercu_entreprise(collecte, donnees) {
    const symbole = String(collecte.parametres.symbol);
    const dateRef = typeof donnees.LatestQuarter === "string" ? donnees.LatestQuarter : null;
    if (!dateRef) throw new Error("Aperçu sans date de référence (LatestQuarter).");
    const { error } = await admin().from("fondamentales").upsert(
      {
        entreprise: symbole,
        date_cloture: dateRef,
        periode: "instantane",
        devise: typeof donnees.Currency === "string" ? donnees.Currency : null,
        per: nombre(donnees.PERatio),
        roe: nombre(donnees.ReturnOnEquityTTM),
        marge_nette: nombre(donnees.ProfitMargin),
        bpa: nombre(donnees.EPS),
        actions_en_circulation: nombre(donnees.SharesOutstanding),
        chiffre_affaires: nombre(donnees.RevenueTTM),
        source_donnee: "alpha_vantage:OVERVIEW",
        maj_le: new Date().toISOString(),
      },
      { onConflict: "entreprise,date_cloture,periode" },
    );
    if (error) throw new Error(`Écriture de l'aperçu impossible : ${error.message}`);
    return `aperçu au ${dateRef} (PER ${donnees.PERatio}, ROE ${donnees.ReturnOnEquityTTM})`;
  },
};
