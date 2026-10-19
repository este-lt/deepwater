// Règles du biais quotidien : fichier de configuration modifiable.
// Uniquement des données fondamentales et de marché concrètes (politique de la Fed, taux,
// statistiques publiées, régime macroéconomique, dollar, courbe des taux, volatilité
// implicite, crédit, conditions financières) : aucun
// indicateur ni concept d'analyse technique (ni moyenne mobile, ni momentum, ni niveau de prix).
// Chaque facteur donne une note entre -1 (baissier) et +1 (haussier). Le score final
// est la moyenne pondérée des facteurs disponibles ; un facteur sans donnée récente
// est marqué « indisponible » et son poids est retiré du calcul (jamais de valeur inventée).
//
// Après modification : relancer les tests (deno test supabase/functions/calcul-biais),
// redéployer la fonction calcul-biais et changer `version` pour tracer les biais concernés.

export const REGLES_BIAIS = {
  version: "2026-10-19c",

  // Conversion du score (entre -1 et +1) en biais.
  seuils: { haussier: 0.2, baissier: -0.2 },

  // Le biais n'est publié que si au moins cette part du poids total est disponible.
  partPoidsMinimale: 0.5,

  indices: {
    SPX: {
      libelle: "S&P 500",
      poids: { fed: 0.18, taux: 0.14, macro: 0.14, cycle: 0.12, liquidite: 0.1, dollar: 0.08, courbe: 0.04, risque: 0.1, conditions: 0.05, positionnement: 0.05 },
      // Contrat à terme du rapport COT de la CFTC (positionnement).
      cot: "13874A",
      // Indice de volatilité implicite propre à l'indice.
      volatilite: "VIX",
    },
    NDX: {
      libelle: "Nasdaq-100",
      // Les valeurs technologiques réagissent davantage aux taux longs.
      poids: { fed: 0.18, taux: 0.18, macro: 0.1, cycle: 0.12, liquidite: 0.1, dollar: 0.08, courbe: 0.04, risque: 0.1, conditions: 0.05, positionnement: 0.05 },
      cot: "209742",
      volatilite: "VXN",
    },
  },

  // Politique de la Fed : ce que le marché anticipe (taux à 1 an et à 2 ans contre taux
  // effectif des Fed funds) et le sens de la dernière décision. Hausse anticipée ou décidée
  // = baissier.
  fed: {
    ecartPleinPts: 0.5, // 1 an et 2 ans 0,5 pt au-dessus des Fed funds -> note -1 (hausses anticipées)
    partAnticipation: 0.6,
    joursDecisionRecente: 200,
    joursMemeSens: 365,
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

  // Dollar (indice large de la Fed, DXY) : fiche de corrélations, un dollar qui monte fait
  // baisser le S&P 500 (résultats des multinationales, conditions financières mondiales).
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
  // part de l'intérêt ouvert, comparée à ses 3 dernières années. Un positionnement extrême
  // est fragile (lecture contrarienne) : très acheteurs = baissier, très vendeurs = haussier.
  positionnement: {
    semainesHistorique: 156,
    ecartPlein: 0.4, // centile 90 % (0,5 + 0,4) -> note -1
    ageMaxJours: 14,
  },

  // Appétit pour le risque : volatilité implicite des options (VIX ou VXN), structure par
  // terme (VIX contre VIX à 3 mois) et spread de crédit à haut rendement. Une volatilité
  // au-dessus de sa médiane d'un an, une structure inversée ou un spread qui s'écarte =
  // baissier.
  risque: {
    seancesVariation: 5,
    joursMediane: 365,
    ecartPleinVolPts: 8, // volatilité 8 points au-dessus de sa médiane -> note -1
    variationPleineVolPts: 5, // +5 points en 5 séances -> note -1
    credit: "HY",
    variationPleineCreditPts: 0.4, // spread +0,40 pt en 5 séances -> note -1
    partVolatilite: 0.45,
    partStructure: 0.2, // le reste : crédit
    structureNeutre: 0.9, // VIX / VIX3M habituel (structure normale)
    structurePleine: 0.15, // ratio 1,05 -> note -1 ; 0,75 -> note +1
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
export type CleFacteur = "fed" | "taux" | "macro" | "cycle" | "liquidite" | "dollar" | "courbe" | "risque" | "conditions" | "positionnement";
