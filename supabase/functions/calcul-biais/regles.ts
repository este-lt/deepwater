// Règles du biais intraday (S&P 500, Nasdaq-100) : fichier de configuration modifiable.
//
// Le biais est l'analyse des informations de la liste « feux tricolores » de l'utilisateur :
// 🔴 prioritaire, 🟠 secondaire, 🟢 complémentaire. Chaque élément de la liste disponible en
// base donne une note entre -1 (baissier) et +1 (haussier), pondérée par sa couleur
// (🔴 3, 🟠 2, 🟢 1). Le score est la moyenne pondérée des facteurs disponibles ; un facteur
// sans donnée récente est « indisponible » et son poids est retiré (jamais de valeur inventée).
//
// Lecture « priced in » (🔴 Mécanisme d'anticipation, Notion de « Priced In », Misprice &
// Repricing) : ce qui compte est ce qui change par rapport à ce que le marché attendait
// (surprise face au consensus, révision des anticipations, variation récente), pas le
// niveau, déjà dans les prix. Les niveaux restent cités dans les explications.
//
// Aucune analyse technique (ni moyenne mobile, ni momentum, ni niveau de prix des indices).
// Éléments de la liste sans donnée gratuite en base, donc absents du calcul : projections
// (SEP) et déclarations du FOMC, « buy the rumor, sell the news », événements géopolitiques,
// politique fiscale et dette, rotations sectorielles, sentiment des particuliers, ratios de
// valorisation (CAPE, Price to Book, Market Cap / M2).
//
// Après modification : relancer les tests (deno test supabase/functions/calcul-biais),
// redéployer la fonction calcul-biais et changer `version` pour tracer les biais concernés.

export type Priorite = "rouge" | "orange" | "vert" | "contexte";
export const VALEURS_PRIORITE: Record<Priorite, number> = { rouge: 3, orange: 2, vert: 1, contexte: 0 };

export type CleFacteur =
  | "fed" | "macro" | "taux" | "dollar" | "petrole" | "liquidite" | "cycle"
  | "risque" | "courbe" | "positionnement" | "conditions" | "publications";

// Couleur de chaque facteur : la plus haute des éléments de la liste qu'il analyse.
export const PRIORITES: Record<CleFacteur, Priorite> = {
  fed: "rouge", // 🔴 taux directeurs, postures hawkish / dovish ; 🟠 anticipations de taux, mandat
  macro: "rouge", // 🔴 CPI, PCE, PIB, NFP, chômage ; 🟠 PPI, salaires, PMI, ventes au détail, consensus
  taux: "rouge", // 🔴 obligations d'État (Treasuries, Bunds), yields ; 🟠 rendements réels
  dollar: "rouge", // 🔴 indice dollar (DXY), yield spread (différentiel de taux)
  petrole: "rouge", // 🔴 pétrole
  liquidite: "rouge", // 🔴 masse monétaire M2 et liquidité ; 🟠 QE / QT
  cycle: "rouge", // 🔴 régimes macroéconomiques ; 🟠 mandat ; 🟢 cycle économique
  risque: "orange", // 🟠 sentiment risk-on / risk-off, actifs refuges (or, yen, franc suisse)
  courbe: "orange", // 🟠 inversion de la courbe des taux
  positionnement: "vert", // 🟢 COT, positionnement des institutionnels
  conditions: "contexte", // hors liste : affiché seulement
  publications: "contexte", // chiffres de la nuit, toutes économies (les américains sont dans « macro »)
};

const CLES = Object.keys(PRIORITES) as CleFacteur[];
const TOTAL = CLES.reduce((s, k) => s + VALEURS_PRIORITE[PRIORITES[k]], 0);
// Poids normalisés (somme 1) : 🔴 3/26, 🟠 2/26, 🟢 1/26.
const POIDS = Object.fromEntries(CLES.map((k) => [k, VALEURS_PRIORITE[PRIORITES[k]] / TOTAL])) as Record<CleFacteur, number>;

export const REGLES_BIAIS = {
  version: "2026-10-20b",

  // Conversion du score (entre -1 et +1) en biais.
  seuils: { haussier: 0.2, baissier: -0.2 },

  // Le biais n'est publié que si au moins cette part du poids total est disponible.
  partPoidsMinimale: 0.5,

  indices: {
    // Mêmes poids pour les deux indices : ceux de la liste.
    SPX: { libelle: "S&P 500", poids: POIDS, cot: "13874A" },
    NDX: { libelle: "Nasdaq-100", poids: POIDS, cot: "209742" },
  },

  // Politique monétaire : révision sur 5 séances de la moyenne des taux à 1 et 2 ans (ce que
  // le marché change dans ses anticipations de la Fed). Plus hawkish = baissier. Le niveau face
  // aux Fed funds et la dernière décision sont déjà dans les prix : cités, hors note.
  fed: {
    seancesVariation: 5,
    variationPleinePts: 0.15, // +15 pb en 5 séances -> note -1
    joursDecisionRecente: 200,
    ageMaxJours: 7,
  },

  // Obligations d'État : variation sur 5 séances du 10 ans américain (50 %), du taux réel à
  // 10 ans (25 %) et du taux européen AAA à 10 ans (courbe de la BCE, proche du Bund, 25 %).
  // Des rendements qui montent = baissier.
  taux: {
    maturite: "10year",
    libelle: "Taux à 10 ans",
    libelle_en: "10-year yield",
    seancesVariation: 5,
    variationPleinePts: 0.15, // +0,15 pt en 5 séances -> note -1
    partUs: 0.5,
    partReel: 0.25,
    partBund: 0.25,
    ageMaxJours: 7,
  },

  // Statistiques face au consensus : chiffres américains publiés (fil instantané) et écart de
  // la dernière publication FRED par rapport à la précédente.
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
  // (mandat), accélération du CPI sur 3 mois, pétrole sur 3 mois. Les actions aiment la
  // croissance et craignent l'inflation : note = 0,6 x croissance - 0,4 x inflation.
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

  // Dollar : variation de l'indice large de la Fed (DXY) sur 20 séances (70 %) et du
  // différentiel de taux à 10 ans États-Unis - zone euro AAA (30 %). Un dollar qui monte, ou
  // un écart qui se creuse en faveur du dollar, pèse sur les actions.
  dollar: {
    serie: "DXY",
    seancesVariation: 20,
    variationPleinePct: 2, // +2 % en 20 séances -> note -1
    ecartPleinPts: 0.3, // écart +0,30 pt en 20 séances -> note -1
    partDxy: 0.7,
    ageMaxJours: 14, // série publiée chaque semaine
  },

  // Pétrole (WTI) sur 20 séances : une hausse nourrit l'inflation et pèse sur les marges.
  petrole: {
    serie: "WTI",
    seancesVariation: 20,
    variationPleinePct: 15, // +15 % en 20 séances -> note -1
    ageMaxJours: 10,
  },

  // Courbe des taux : une courbe inversée (taux courts au-dessus du 10 ans) annonce
  // historiquement un ralentissement ; une pente normale est légèrement favorable.
  courbe: {
    inversionPleinePts: 0.5, // 10 ans 0,5 pt sous le taux court -> note -1
    pentePleinePts: 1.5,
    plafondPositif: 0.5, // une pente normale ne donne jamais plus de +0,5
    ageMaxJours: 7,
  },

  // Liquidité : liquidité nette (bilan de la Fed moins compte du Trésor moins prises en
  // pension inversées) sur 4 semaines (QE / QT compris), et croissance de M2.
  liquidite: {
    semaines: 4,
    variationPleineMd: 150, // +150 Md$ de liquidité nette en 4 semaines -> note +1
    m2Neutre: 4, // croissance de M2 sur 1 an jugée neutre (%)
    m2Plein: 4,
    partNette: 0.7,
    bilanSeuilMd: 25, // bilan de la Fed qui varie de moins de 25 Md$ en 4 semaines : stable
    ageMaxJours: 14,
    ageMaxJoursM2: 95, // M2 d'un mois paraît environ quatre semaines après sa fin
  },

  // Positionnement (rapport COT de la CFTC) : variation sur 4 semaines de la position nette
  // des gérants d'actifs (institutionnels), en contrats, rapportée à l'intérêt ouvert actuel.
  // Des institutionnels qui renforcent leurs achats = haussier. Les fonds à effet de levier
  // sont cités.
  positionnement: {
    semainesVariation: 4,
    variationPleine: 0.03, // +3 points de l'intérêt ouvert en 4 semaines -> note +1
    semainesHistorique: 156,
    ageMaxJours: 14,
  },

  // Sentiment risk-on / risk-off : volatilité implicite (VIX face à sa médiane d'un an et sur
  // 5 séances, 35 %), structure VIX / VIX3M (15 %), spread de crédit à haut rendement sur
  // 5 séances (25 %), demande de valeurs refuges sur 5 séances (or, yen, franc suisse, 25 %).
  // Risk-off = baissier.
  risque: {
    seancesVariation: 5,
    joursMediane: 365,
    ecartPleinVolPts: 8, // VIX 8 points au-dessus de sa médiane -> note -1
    variationPleineVolPts: 5, // +5 points en 5 séances -> note -1
    structureNeutre: 0.9, // VIX / VIX3M habituel
    structurePleine: 0.15, // ratio 1,05 -> note -1 ; 0,75 -> note +1
    credit: "HY",
    variationPleineCreditPts: 0.4, // spread +0,40 pt en 5 séances -> note -1
    refugeOrPct: 3, // or +3 % en 5 séances -> refuge plein
    refugeDevisePct: 2, // yen ou franc suisse +2 % face au dollar en 5 séances -> refuge plein
    parts: { volatilite: 0.35, structure: 0.15, credit: 0.25, refuges: 0.25 },
    ageMaxJours: 7,
  },

  // Conditions financières (indice NFCI de la Fed de Chicago) : hors liste, affiché seulement.
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
