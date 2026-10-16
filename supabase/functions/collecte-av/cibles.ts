// Traitements par type de donnée Alpha Vantage : chaque "cible" transforme une
// réponse validée en lignes de la base. Les étapes suivantes en ajoutent.
import { extraireSerieData, extraireSerieQuotidienne } from "../_shared/alpha-vantage.ts";
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

// Séries longues (taux quotidiens depuis 1962...) : 3 ans au premier passage, 60 jours ensuite.
async function fenetreDepuis(table: "taux_tresor" | "indicateurs_macro" | "matieres_premieres", filtre: [string, string]): Promise<string> {
  const { count, error } = await admin().from(table).select("id", { count: "exact", head: true }).eq(filtre[0], filtre[1]);
  if (error) throw new Error(`Lecture de ${table} impossible : ${error.message}`);
  const jours = (count ?? 0) > 0 ? 60 : 3 * 366;
  return new Date(Date.now() - jours * 86_400_000).toISOString().slice(0, 10);
}

const derniere = <T extends { date: string }>(points: T[]) => points[points.length - 1];

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

  async taux_tresor(collecte, donnees) {
    const maturite = String(collecte.parametres.maturity);
    const { points } = extraireSerieData(donnees);
    if (points.length === 0) throw new Error("Série de taux vide.");
    const depuis = await fenetreDepuis("taux_tresor", ["maturite", maturite]);
    const lignes = points.filter((p) => p.date >= depuis).map((p) => ({
      date: p.date,
      maturite,
      taux: p.valeur,
      source_donnee: "alpha_vantage:TREASURY_YIELD",
      maj_le: new Date().toISOString(),
    }));
    const { error } = await admin().from("taux_tresor").upsert(lignes, { onConflict: "date,maturite" });
    if (error) throw new Error(`Écriture des taux impossible : ${error.message}`);
    const { error: erreurSpreads } = await admin().rpc("recalculer_spreads", { p_depuis: depuis });
    if (erreurSpreads) throw new Error(`Calcul des écarts de taux impossible : ${erreurSpreads.message}`);
    const d = derniere(points);
    return `${lignes.length} jours, ${maturite} à ${d.valeur} % (${d.date})`;
  },

  async indicateur_macro(collecte, donnees) {
    const indicateur = String(collecte.parametres.indicateur);
    const { unite, points } = extraireSerieData(donnees);
    if (points.length === 0) throw new Error("Série macro vide.");
    const depuis = await fenetreDepuis("indicateurs_macro", ["indicateur", indicateur]);
    // Séries mensuelles/trimestrielles : on garde 6 ans pour les variations sur un an.
    const seuil = indicateur === "FEDERAL_FUNDS_RATE" ? depuis : new Date(Date.now() - 6 * 366 * 86_400_000).toISOString().slice(0, 10);
    const lignes = points.filter((p) => p.date >= seuil).map((p) => ({
      indicateur,
      date: p.date,
      valeur: p.valeur,
      unite,
      source_donnee: `alpha_vantage:${indicateur}`,
      maj_le: new Date().toISOString(),
    }));
    const { error } = await admin().from("indicateurs_macro").upsert(lignes, { onConflict: "indicateur,date" });
    if (error) throw new Error(`Écriture de ${indicateur} impossible : ${error.message}`);
    const d = derniere(points);
    return `${lignes.length} points, dernier ${d.valeur} (${d.date})`;
  },

  async matiere_premiere(collecte, donnees) {
    const nom = String(collecte.parametres.nom);
    const { unite, points } = extraireSerieData(donnees);
    if (points.length === 0) throw new Error("Série de prix vide.");
    const depuis = await fenetreDepuis("matieres_premieres", ["nom", nom]);
    // Les 3 ans chargés au premier passage permettent la variation sur 1 an.
    const lignes = points.filter((p) => p.date >= depuis).map((p) => ({
      nom,
      date: p.date,
      prix: p.valeur,
      unite,
      source_donnee: `alpha_vantage:${nom}`,
      maj_le: new Date().toISOString(),
    }));
    const { error } = await admin().from("matieres_premieres").upsert(lignes, { onConflict: "nom,date" });
    if (error) throw new Error(`Écriture de ${nom} impossible : ${error.message}`);
    const { error: erreurVar } = await admin().rpc("recalculer_variations_matieres", { p_nom: nom });
    if (erreurVar) throw new Error(`Calcul des variations impossible : ${erreurVar.message}`);
    const d = derniere(points);
    return `${lignes.length} points, ${d.valeur} ${unite ?? ""} (${d.date})`;
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
