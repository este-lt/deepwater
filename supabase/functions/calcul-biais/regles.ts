// Règles du biais quotidien : fichier de configuration modifiable.
// Chaque facteur donne une note entre -1 (baissier) et +1 (haussier). Le score final
// est la moyenne pondérée des facteurs disponibles ; un facteur sans donnée récente
// est marqué « indisponible » et son poids est retiré du calcul (jamais de valeur inventée).
//
// Après modification : relancer les tests (deno test supabase/functions/calcul-biais),
// redéployer la fonction calcul-biais et changer `version` pour tracer les biais concernés.

export const REGLES_BIAIS = {
  version: "2026-10-16",

  // Conversion du score (entre -1 et +1) en biais.
  seuils: { haussier: 0.2, baissier: -0.2 },

  // Le biais n'est publié que si au moins cette part du poids total est disponible,
  // et jamais sans le facteur « tendance » (cours de l'indice).
  partPoidsMinimale: 0.5,

  indices: {
    SPX: {
      libelle: "S&P 500",
      poids: { tendance: 0.35, taux: 0.25, macro: 0.2, flux: 0.2 },
      // Entreprises dont les flux d'initiés et d'institutions sont pris en compte (null = toutes celles suivies).
      entreprises: null as string[] | null,
    },
    NDX: {
      libelle: "Nasdaq-100",
      // Les valeurs technologiques réagissent davantage aux taux longs.
      poids: { tendance: 0.35, taux: 0.3, macro: 0.15, flux: 0.2 },
      entreprises: ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "AVGO", "TSLA", "COST", "NFLX"] as string[] | null,
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
      UNEMPLOYMENT: { libelle: "Chômage", sens: -1, ecartPlein: 0.2, unite: "pt" },
      NONFARM_PAYROLL: { libelle: "Emplois créés", sens: 1, ecartPlein: 100, unite: "k" },
      REAL_GDP: { libelle: "Croissance du PIB", sens: 1, ecartPlein: 1, unite: "pt" },
    } as Record<string, { libelle: string; sens: 1 | -1; ecartPlein: number; unite: "pt" | "k" }>,
  },

  // Flux nets des initiés (formulaires 4, date de dépôt) et des institutions (13F déposés).
  flux: {
    joursRecents: 7,
    semainesReference: 13,
    zPlein: 2, // flux net à 2 écarts-types de la moyenne hebdomadaire -> note ±1
    partInities: 0.5,
    variationPleineInstitutionsPct: 2, // +2 % de titres détenus en net -> note +1
  },
};

export type CleIndice = keyof typeof REGLES_BIAIS.indices;
export type CleFacteur = "tendance" | "taux" | "macro" | "flux";
