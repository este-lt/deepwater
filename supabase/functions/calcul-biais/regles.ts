// Règles du biais quotidien : fichier de configuration modifiable.
// Uniquement des données fondamentales et de marché concrètes (politique de la Fed, taux,
// statistiques publiées, volatilité implicite, crédit, conditions financières) : aucun
// indicateur ni concept d'analyse technique (ni moyenne mobile, ni momentum, ni niveau de prix).
// Chaque facteur donne une note entre -1 (baissier) et +1 (haussier). Le score final
// est la moyenne pondérée des facteurs disponibles ; un facteur sans donnée récente
// est marqué « indisponible » et son poids est retiré du calcul (jamais de valeur inventée).
//
// Après modification : relancer les tests (deno test supabase/functions/calcul-biais),
// redéployer la fonction calcul-biais et changer `version` pour tracer les biais concernés.

export const REGLES_BIAIS = {
  version: "2026-10-19",

  // Conversion du score (entre -1 et +1) en biais.
  seuils: { haussier: 0.2, baissier: -0.2 },

  // Le biais n'est publié que si au moins cette part du poids total est disponible.
  partPoidsMinimale: 0.5,

  indices: {
    SPX: {
      libelle: "S&P 500",
      poids: { fed: 0.25, taux: 0.2, macro: 0.2, risque: 0.2, conditions: 0.15 },
      // Indice de volatilité implicite propre à l'indice.
      volatilite: "VIX",
    },
    NDX: {
      libelle: "Nasdaq-100",
      // Les valeurs technologiques réagissent davantage aux taux longs.
      poids: { fed: 0.25, taux: 0.25, macro: 0.15, risque: 0.2, conditions: 0.15 },
      volatilite: "VXN",
    },
  },

  // Politique de la Fed : ce que le marché anticipe (taux à 2 ans contre taux effectif des
  // Fed funds) et le sens de la dernière décision. Hausse anticipée ou décidée = baissier.
  fed: {
    ecartPleinPts: 0.5, // 2 ans 0,5 pt au-dessus des Fed funds -> note -1 (hausses anticipées)
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

  // Surprise macro : écart de la dernière publication par rapport à la précédente.
  // sens : +1 si une hausse est favorable aux actions, -1 si elle est défavorable.
  macro: {
    fenetreJours: 45,
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

  // Appétit pour le risque : volatilité implicite des options (VIX ou VXN) et spread de
  // crédit à haut rendement. Une volatilité au-dessus de sa médiane d'un an ou un spread
  // qui s'écarte = baissier.
  risque: {
    seancesVariation: 5,
    joursMediane: 365,
    ecartPleinVolPts: 8, // volatilité 8 points au-dessus de sa médiane -> note -1
    variationPleineVolPts: 5, // +5 points en 5 séances -> note -1
    credit: "HY",
    variationPleineCreditPts: 0.4, // spread +0,40 pt en 5 séances -> note -1
    partVolatilite: 0.6,
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
export type CleFacteur = "fed" | "taux" | "macro" | "risque" | "conditions";
