// Règles du biais quotidien : fichier de configuration modifiable.
// Uniquement des données fondamentales et de marché concrètes : aucun indicateur ni concept
// d'analyse technique (ni moyenne mobile, ni momentum, ni niveau de prix).
// Chaque facteur donne une note entre -1 (baissier) et +1 (haussier). Le score final
// est la moyenne pondérée des facteurs disponibles ; un facteur sans donnée récente
// est marqué « indisponible » et son poids est retiré du calcul (jamais de valeur inventée).
//
// Version d (19/10/2026), fondée sur la mesure : chaque facteur a été rejoué de 2021 à 2026
// et comparé aux séances suivantes, séparément sur 2021-2023 et 2024-2026. Seuls trois
// facteurs annoncent la séance dans le même sens sur les deux périodes et les deux indices :
// la révision des anticipations de la Fed (taux à 1 et 2 ans sur 5 séances), les surprises
// macro et la peur mesurée par les options (VIX face à sa médiane, VIX / VIX3M), qui
// précède en moyenne une hausse. Les niveaux (hausses déjà anticipées, inflation, taux réel)
// sont déjà dans les prix et rendaient le biais baissier pendant des mois de hausse ; le
// dollar, la courbe, les conditions financières, la liquidité et le COT n'annoncent rien de
// stable sur la séance. Ils restent affichés comme contexte, avec un poids nul.
//
// Après modification : relancer les tests (deno test supabase/functions/calcul-biais),
// redéployer la fonction calcul-biais et changer `version` pour tracer les biais concernés.

export const REGLES_BIAIS = {
  version: "2026-10-19d",

  // Conversion du score (entre -1 et +1) en biais. Seuils asymétriques : le marché monte
  // environ 55 % des séances, un biais baissier n'est juste que sur un score très négatif
  // (2021-2026 : score >= +0,2 suivi d'une hausse 55 à 65 % du temps ; score <= -0,45
  // suivi d'une baisse 62 % du temps ; entre -0,45 et -0,2, la baisse n'était pas plus
  // probable que la hausse).
  seuils: { haussier: 0.2, baissier: -0.45 },

  // Le biais n'est publié que si au moins cette part du poids total est disponible.
  partPoidsMinimale: 0.5,

  indices: {
    SPX: {
      libelle: "S&P 500",
      // Poids nul : facteur affiché comme contexte, hors score.
      poids: { fed: 0.3, macro: 0.3, risque: 0.4, taux: 0, cycle: 0, liquidite: 0, dollar: 0, courbe: 0, conditions: 0, positionnement: 0, publications: 0 },
      // Contrat à terme du rapport COT de la CFTC (positionnement).
      cot: "13874A",
    },
    NDX: {
      libelle: "Nasdaq-100",
      // Mêmes poids : la mesure ne justifie aucune différence entre les deux indices.
      poids: { fed: 0.3, macro: 0.3, risque: 0.4, taux: 0, cycle: 0, liquidite: 0, dollar: 0, courbe: 0, conditions: 0, positionnement: 0, publications: 0 },
      cot: "209742",
    },
  },

  // Anticipations de la Fed : révision sur 5 séances de la moyenne des taux à 1 et 2 ans.
  // Des anticipations qui montent (plus de hausses ou moins de baisses) = baissier. Le niveau
  // face aux Fed funds et la dernière décision sont affichés, sans entrer dans la note.
  fed: {
    seancesVariation: 5,
    variationPleinePts: 0.15, // +15 pb en 5 séances -> note -1
    joursDecisionRecente: 200,
    ageMaxJours: 7,
  },

  // Taux longs : le coût de l'argent pèse sur les actions, par son évolution récente (taux
  // nominal et taux réel à 10 ans sur 5 séances) et par son niveau (taux réel à 10 ans,
  // obligations indexées sur l'inflation, face à un repère neutre fixe).
  taux: {
    maturite: "10year",
    libelle: "Taux à 10 ans",
    libelle_en: "10-year yield",
    seancesVariation: 5,
    variationPleinePts: 0.2, // +0,20 pt en 5 séances -> note -1
    partNominal: 0.6, // dans la note de variation
    reelNeutre: 1.5, // taux réel à 10 ans jugé neutre (%)
    ecartPleinNiveauPts: 1, // taux réel 1 pt au-dessus du repère -> note de niveau -1
    partNiveau: 0.5, // part du niveau dans la note du facteur (le reste : la variation)
    ageMaxJours: 7,
  },

  // Surprise macro : écart au consensus des chiffres américains publiés (fil instantané) et
  // écart de la dernière publication FRED par rapport à la précédente.
  // sens : +1 si une hausse est favorable aux actions, -1 si elle est défavorable.
  macro: {
    fenetreJours: 45,
    fenetreConsensusJours: 30,
    partConsensus: 0.6, // quand des surprises face au consensus existent
    indicateurs: {
      CPI: { libelle: "Inflation", libelle_en: "Inflation", sens: -1, ecartPlein: 0.3, unite: "pt" },
      CORE_CPI: { libelle: "Inflation sous-jacente", libelle_en: "Core inflation", sens: -1, ecartPlein: 0.2, unite: "pt" },
      CORE_PCE: { libelle: "PCE sous-jacent", libelle_en: "Core PCE", sens: -1, ecartPlein: 0.2, unite: "pt" },
      PPI: { libelle: "Prix à la production", libelle_en: "Producer prices", sens: -1, ecartPlein: 1, unite: "pt" },
      UNEMPLOYMENT: { libelle: "Chômage", libelle_en: "Unemployment", sens: -1, ecartPlein: 0.2, unite: "pt" },
      NONFARM_PAYROLL: { libelle: "Emplois créés", libelle_en: "Payrolls", sens: 1, ecartPlein: 100, unite: "k" },
      JOBLESS_CLAIMS: { libelle: "Inscriptions au chômage", libelle_en: "Jobless claims", sens: -1, ecartPlein: 25, unite: "k" },
      RETAIL_SALES: { libelle: "Ventes au détail", libelle_en: "Retail sales", sens: 1, ecartPlein: 0.5, unite: "pt" },
      REAL_GDP: { libelle: "Croissance du PIB", libelle_en: "GDP growth", sens: 1, ecartPlein: 1, unite: "pt" },
    } as Record<string, { libelle: string; libelle_en: string; sens: 1 | -1; ecartPlein: number; unite: "pt" | "k" }>,
  },

  // Régime macroéconomique (croissance × inflation : expansion, reflation, déflation,
  // stagflation). Croissance : emplois créés (moyenne sur 3 mois), évolution du chômage sur
  // 3 mois, PIB annualisé. Inflation : PCE sous-jacent face à la cible de 2 % de la Fed
  // (mandat), accélération du CPI sur 3 mois, pétrole sur 3 mois (anticipation). Les actions
  // aiment la croissance et craignent l'inflation : note = 0,6 x croissance - 0,4 x inflation.
  cycle: {
    emploisNeutresK: 100, // emplois créés par mois jugés neutres (milliers)
    emploisPleinsK: 100, // écart à ce niveau qui donne une note pleine
    chomagePleinPts: 0.3, // hausse du chômage sur 3 mois -> note -1
    pibNeutre: 2, // croissance annualisée jugée neutre (%)
    pibPlein: 2,
    cibleInflation: 2, // cible de la Fed (PCE)
    inflationPleinePts: 1.5, // PCE sous-jacent 1,5 pt au-dessus de la cible -> note +1
    tendanceCpiPleinePts: 0.5, // CPI sur 1 an +0,5 pt en 3 mois -> note +1
    petroleSeances: 63, // environ 3 mois
    petrolePleinPct: 30,
    partCroissance: 0.6,
    ageMaxJoursMensuel: 95, // le PCE d'un mois paraît environ deux mois après son début
    ageMaxJoursTrimestriel: 200,
    ageMaxJoursPetrole: 10,
  },

  // Dollar (indice large de la Fed, DXY) : contexte seulement. Dollar et actions évoluent
  // souvent en sens inverse le même jour, mais aucun effet stable n'a été mesuré sur la
  // séance suivante (2021-2026).
  dollar: {
    serie: "DXY",
    seancesVariation: 20,
    variationPleinePct: 2, // +2 % en 20 séances -> note -1
    ageMaxJours: 14, // série publiée chaque semaine
  },

  // Courbe des taux : une courbe inversée (taux courts au-dessus du 10 ans) annonce
  // historiquement un ralentissement ; une pente normale est légèrement favorable.
  courbe: {
    inversionPleinePts: 0.5, // 10 ans 0,5 pt sous le taux court -> note -1
    pentePleinePts: 1.5,
    plafondPositif: 0.5, // une pente normale ne donne jamais plus de +0,5
    ageMaxJours: 7,
  },

  // Liquidité de la Fed : liquidité nette (bilan de la Fed moins compte du Trésor moins
  // prises en pension inversées) sur 4 semaines, et croissance de la masse monétaire M2.
  liquidite: {
    semaines: 4,
    variationPleineMd: 150, // +150 Md$ de liquidité nette en 4 semaines -> note +1
    m2Neutre: 4, // croissance de M2 sur 1 an jugée neutre (%)
    m2Plein: 4,
    partNette: 0.7,
    ageMaxJours: 14,
    ageMaxJoursM2: 95, // M2 d'un mois paraît environ quatre semaines après sa fin
  },

  // Positionnement (rapport COT de la CFTC) : position nette des fonds à effet de levier en
  // part de l'intérêt ouvert, comparée à ses 3 dernières années. Contexte seulement : la
  // lecture contrarienne (très acheteurs = baissier) a été démentie par la mesure 2024-2026.
  positionnement: {
    semainesHistorique: 156,
    ecartPlein: 0.4, // centile 90 % (0,5 + 0,4) -> note -1
    ageMaxJours: 14,
  },

  // Peur sur les options (VIX, pour les deux indices) : VIX face à sa médiane d'un an et
  // structure VIX / VIX3M. Une peur au-dessus de la normale a été suivie en moyenne d'une
  // hausse (2021-2026, les deux périodes, les deux indices) : note positive. Le spread de
  // crédit à haut rendement est affiché, sans entrer dans la note.
  risque: {
    joursMediane: 365,
    ecartPleinVolPts: 8, // VIX 8 points au-dessus de sa médiane -> moitié de note +1
    structureNeutre: 0.9, // VIX / VIX3M habituel
    structurePleine: 0.15, // ratio 1,05 -> moitié de note +1 ; 0,75 -> moitié de note -1
    credit: "HY",
    ageMaxJours: 7,
  },

  // Conditions financières (indice NFCI de la Fed de Chicago, hebdomadaire) : au-dessus de
  // zéro, plus tendues que la moyenne ; un resserrement sur 4 semaines est baissier.
  conditions: {
    serie: "NFCI",
    niveauPlein: 0.5,
    variationPleine: 0.15,
    semainesVariation: 4,
    partNiveau: 0.6,
    ageMaxJours: 14,
  },
};

export type CleIndice = keyof typeof REGLES_BIAIS.indices;
export type CleFacteur = "fed" | "taux" | "macro" | "cycle" | "liquidite" | "dollar" | "courbe" | "risque" | "conditions" | "positionnement" | "publications";
