// Contrôle croisé Alpha Vantage / SEC EDGAR : pour chaque exercice annuel stocké,
// compare les montants aux faits XBRL du 10-K correspondant (source officielle).
import { lireConcept, valeurAnnuelle, type FaitXbrl } from "../_shared/sec.ts";
import { admin } from "../_shared/supabase.ts";

const SEUIL_COHERENCE_PCT = 1;

// Le chiffre d'affaires est publié sous des concepts différents selon les entreprises.
const CONCEPTS = {
  chiffre_affaires: { concepts: ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"], flux: true },
  resultat_net: { concepts: ["NetIncomeLoss"], flux: true },
  capitaux_propres: { concepts: ["StockholdersEquity"], flux: false },
  flux_tresorerie_operationnel: { concepts: ["NetCashProvidedByUsedInOperatingActivities"], flux: true },
} as const;

type Champ = keyof typeof CONCEPTS;

export async function controlerFondamentales(): Promise<{ message: string; details: Record<string, unknown> }> {
  const { data: actions, error } = await admin()
    .from("tickers_suivis")
    .select("symbole, symboles_source")
    .eq("classe_actif", "action")
    .eq("actif_bool", true);
  if (error) throw new Error(`Lecture des actions impossible : ${error.message}`);

  const details: Record<string, unknown> = {};
  for (const action of actions ?? []) {
    const cik = (action.symboles_source as { cik?: string }).cik;
    if (!cik) continue;
    const { data: exercices, error: erreurEx } = await admin()
      .from("fondamentales")
      .select("id, date_cloture, chiffre_affaires, resultat_net, capitaux_propres, flux_tresorerie_operationnel")
      .eq("entreprise", action.symbole)
      .eq("periode", "annuel")
      .order("date_cloture", { ascending: false })
      .limit(5);
    if (erreurEx) throw new Error(`Lecture des exercices ${action.symbole} impossible : ${erreurEx.message}`);
    if (!exercices?.length) {
      details[action.symbole] = "aucun exercice Alpha Vantage à contrôler";
      continue;
    }

    // 4 à 6 requêtes SEC par entreprise (concepts), réutilisées pour tous les exercices.
    const faits: Partial<Record<Champ, { concept: string; faits: FaitXbrl[] }[]>> = {};
    for (const champ of Object.keys(CONCEPTS) as Champ[]) {
      faits[champ] = [];
      for (const concept of CONCEPTS[champ].concepts) {
        const liste = await lireConcept(cik, concept);
        if (liste.length) faits[champ]!.push({ concept, faits: liste });
      }
    }

    let coherents = 0;
    for (const ex of exercices) {
      const champs: Record<string, unknown> = {};
      let formulaire: FaitXbrl | null = null;
      let ecartMax = 0;
      let compares = 0;
      for (const champ of Object.keys(CONCEPTS) as Champ[]) {
        const av = ex[champ] === null ? null : Number(ex[champ]);
        let trouve: { concept: string; fait: FaitXbrl } | null = null;
        for (const source of faits[champ] ?? []) {
          const fait = valeurAnnuelle(source.faits, ex.date_cloture, CONCEPTS[champ].flux);
          if (fait) {
            trouve = { concept: source.concept, fait };
            break;
          }
        }
        if (!trouve || av === null) {
          champs[champ] = { av, sec: trouve?.fait.val ?? null, statut: "non comparable" };
          continue;
        }
        const ecart = trouve.fait.val === 0 ? 0 : ((av - trouve.fait.val) / Math.abs(trouve.fait.val)) * 100;
        ecartMax = Math.max(ecartMax, Math.abs(ecart));
        compares++;
        formulaire ??= trouve.fait;
        champs[champ] = { av, sec: trouve.fait.val, ecart_pct: Math.round(ecart * 1000) / 1000, concept: trouve.concept };
      }
      const coherent = compares > 0 && ecartMax < SEUIL_COHERENCE_PCT;
      if (coherent) coherents++;
      const { error: erreurMaj } = await admin()
        .from("fondamentales")
        .update({
          controle_sec: {
            compare_le: new Date().toISOString(),
            coherent,
            ecart_max_pct: Math.round(ecartMax * 1000) / 1000,
            seuil_pct: SEUIL_COHERENCE_PCT,
            formulaire: formulaire?.form ?? null,
            numero_acces: formulaire?.accn ?? null,
            depose_le: formulaire?.filed ?? null,
            champs,
          },
        })
        .eq("id", ex.id);
      if (erreurMaj) throw new Error(`Écriture du contrôle impossible : ${erreurMaj.message}`);
    }
    details[action.symbole] = `${coherents}/${exercices.length} exercices cohérents (écart < ${SEUIL_COHERENCE_PCT} %)`;
  }
  const resume = Object.entries(details).map(([s, d]) => `${s} : ${d}`).join(" | ");
  return { message: `Contrôle SEC des fondamentales — ${resume || "aucune action active"}`, details };
}
