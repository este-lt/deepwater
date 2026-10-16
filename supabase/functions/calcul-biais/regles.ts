// Règles du biais quotidien : fichier de configuration modifiable.
// Chaque facteur donne une note entre -1 (baissier) et +1 (haussier). Le score final
// est la moyenne pondérée des facteurs disponibles ; un facteur sans donnée récente
// est marqué « indisponible » et son poids est retiré du calcul (jamais de valeur inventée).
//
// Après modification : relancer les tests (deno test supabase/functions/calcul-biais),
// redéployer la fonction calcul-biais et changer `version` pour tracer les biais concernés.

export const REGLES_BIAIS = {
  version: "2026-10-17",

  // Conversion du score (entre -1 et +1) en biais.
  seuils: { haussier: 0.2, baissier: -0.2 },

  // Le biais n'est publié que si au moins cette part du poids total est disponible,
  // et jamais sans le facteur « tendance » (cours de l'indice).
  partPoidsMinimale: 0.5,

  indices: {
    SPX: {
      libelle: "S&P 500",
      poids: { tendance: 0.35, taux: 0.2, macro: 0.15, risque: 0.3 },
      // Indice de volatilité implicite propre à l'indice.
      volatilite: "VIX",
    },
    NDX: {
      libelle: "Nasdaq-100",
      // Les valeurs technologiques réagissent davantage aux taux longs.
      poids: { tendance: 0.35, taux: 0.25, macro: 0.1, risque: 0.3 },
      volatilite: "VXN",
    },
  },

  // Position de la clôture par rapport aux moyennes mobiles : note pleine (±1) à partir de ces écarts.
  tendance: {
    ecartPleinMm20Pct: 2,
    ecartPleinMm50Pct: 4,
    partMm20: 0.5,
    ageMaxJours: 5,
  },

  // Taux longs : une hausse rapide ou un niveau élevé pèse sur les actions.
  taux: {
    maturite: "10year",
    libelle: "Taux à 10 ans",
    seancesVariation: 5,
    variationPleinePts: 0.2, // +0,20 pt en 5 séances -> note -1
    partVariation: 0.7,
    joursMoyenne: 365,
    ecartPleinMoyennePts: 0.5, // 0,5 pt au-dessus de la moyenne d'un an -> note -1
    ageMaxJours: 7,
  },

  // Surprise macro : écart de la dernière publication par rapport à la précédente
  // (le consensus des économistes n'est pas disponible gratuitement).
  // sens : +1 si une hausse est favorable aux actions, -1 si elle est défavorable.
  macro: {
    fenetreJours: 45,
    indicateurs: {
      CPI: { libelle: "Inflation", sens: -1, ecartPlein: 0.3, unite: "pt" },
      CORE_CPI: { libelle: "Inflation sous-jacente", sens: -1, ecartPlein: 0.2, unite: "pt" },
      CORE_PCE: { libelle: "PCE sous-jacent", sens: -1, ecartPlein: 0.2, unite: "pt" },
      PPI: { libelle: "Prix à la production", sens: -1, ecartPlein: 1, unite: "pt" },
      UNEMPLOYMENT: { libelle: "Chômage", sens: -1, ecartPlein: 0.2, unite: "pt" },
      NONFARM_PAYROLL: { libelle: "Emplois créés", sens: 1, ecartPlein: 100, unite: "k" },
      JOBLESS_CLAIMS: { libelle: "Inscriptions au chômage", sens: -1, ecartPlein: 25, unite: "k" },
      RETAIL_SALES: { libelle: "Ventes au détail", sens: 1, ecartPlein: 0.5, unite: "pt" },
      REAL_GDP: { libelle: "Croissance du PIB", sens: 1, ecartPlein: 1, unite: "pt" },
    } as Record<string, { libelle: string; sens: 1 | -1; ecartPlein: number; unite: "pt" | "k" }>,
  },

  // Appétit pour le risque : volatilité implicite (VIX ou VXN) et spread de crédit à haut
  // rendement. Une volatilité au-dessus de sa médiane d'un an ou un spread qui s'écarte = baissier.
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
};

export type CleIndice = keyof typeof REGLES_BIAIS.indices;
export type CleFacteur = "tendance" | "taux" | "macro" | "risque";
