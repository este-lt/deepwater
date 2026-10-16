// Filtre strict des actualités : ne garder que ce qui peut faire bouger les marchés
// suivis. Règles modifiables ci-dessous (REGLES). Un article est gardé si son titre
// ou son extrait correspond à au moins une catégorie, et à aucun motif de rejet.
//
// Catégories gardées (cahier des charges, étape 6) :
//   mouvements de cours significatifs, publications de résultats, fusions-acquisitions,
//   décisions de banques centrales, mouvements marquants d'initiés ou d'institutions,
//   + grandes statistiques macro publiées (CPI, PPI, emploi, PIB, ventes au détail),
//   utilisées par le calendrier et le biais.
// Rejet : opinion, conseils personnels, faits divers, culture, politique locale.

export type Categorie =
  | "banque_centrale"
  | "statistique_macro"
  | "mouvement_marche"
  | "resultats"
  | "fusion_acquisition"
  | "initie_institution";

export type Impact = "fort" | "moyen" | "faible";

interface RegleCategorie {
  cle: Categorie;
  libelle: string;
  impact: Impact;
  motifs: RegExp[];
  exclusions?: RegExp[];
  // "titre" : le titre seul fait foi (les extraits citent souvent des chiffres anciens).
  champ?: "titre" | "tout";
}

// Formulations conditionnelles ou prospectives : ce n'est pas (encore) un fait de marché.
const CONDITIONNEL = /\b(could|might|may|unlikely|likely to|expected to|would|set to|poised to|risk of|fears? of)\b/i;

// Actions et indices : toute variation de séance est retenue (marchés suivis).
const ACTIONS = String.raw`(?:stocks?|shares|equities|index|indexes|indices|S&P(?: 500)?|Nasdaq|Dow)`;
// Taux, devises, matières premières : seulement les mouvements forts (les hausses et
// baisses ordinaires de l'or ou du dollar sont quotidiennes et non significatives).
const AUTRES_ACTIFS = String.raw`(?:Treasur(?:y|ies)|bonds?|yields?|oil|crude|dollar|euro|yen|sterling|gold|copper|bitcoin|futures)`;
const ACTIF = String.raw`(?:${ACTIONS.slice(3, -1)}|${AUTRES_ACTIFS.slice(3, -1)})`;
const VERBE = String.raw`(?:rall(?:y|ies|ied)|surge[sd]?|soar(?:s|ed)?|plunge[sd]?|tumble[sd]?|slump(?:s|ed)?|sinks?|sank|crash(?:es|ed)?|jump(?:s|ed)?|slide[sd]?|slid|drop(?:s|ped)?|falls?|fell|gain(?:s|ed)?|rise[sd]?|rose|climb(?:s|ed)?|mixed|recover(?:s|ed)?|rebound(?:s|ed)?)`;
const VERBE_FORT = String.raw`(?:rall(?:y|ies|ied)|surge[sd]?|soar(?:s|ed)?|plunge[sd]?|tumble[sd]?|slump(?:s|ed)?|sinks?|sank|crash(?:es|ed)?)`;
// Seuil de mouvement significatif (cahier des charges : plus de 2 % en séance).
const SEUIL_MOUVEMENT_PCT = 2;

export const REGLES = {
  version: "2026-10-16",

  // Sources officielles : seuls les communiqués de politique monétaire sont gardés.
  sourcesOfficielles: {
    "Fed": [/FOMC statement/i, /Minutes of the Federal Open Market Committee/i, /release economic projections/i, /Federal Reserve (raises|lowers|cuts|maintains)/i],
    "BCE": [/^Monetary policy decisions/i, /^Combined monetary policy decisions/i, /^Meeting of \d/i, /^Account of the monetary policy meeting/i, /^Monetary policy statement/i],
  } as Record<string, RegExp[]>,

  categories: [
    {
      cle: "banque_centrale",
      libelle: "Banque centrale",
      impact: "fort",
      champ: "titre",
      motifs: [
        /\bFOMC\b/,
        /\b(Fed|Federal Reserve|ECB|European Central Bank|Bank of England|BoE|Bank of Japan|BoJ|SNB|central bank)\b.{0,40}\b(raises?|hikes?|cuts?|lowers?|holds?|keeps?|leaves)\b.{0,25}\brates?\b/i,
        /\brate[- ](hike|cut) (bets|decision)\b/i,
        /\binterest[- ]rate decision\b/i,
      ],
      exclusions: [CONDITIONNEL],
    },
    {
      cle: "statistique_macro",
      libelle: "Statistique macro",
      impact: "fort",
      motifs: [
        /\b(CPI|PPI)\b/,
        /\b(consumer|producer|wholesale) prices? (rose|rise|rises|fell|falls|climbed|jumped|increased|decreased|eased)\b/i,
        /\b(nonfarm payrolls|jobs report|payrolls (rose|grew|fell|jumped))\b/i,
        /\bunemployment rate (rose|fell|climbed|ticked|held)\b/i,
        /\beconomy (grew|shrank|contracted|expanded)\b/i,
        /\bGDP\b.{0,30}\b(grew|rose|fell|shrank|contracted|expanded)\b/i,
        /\bretail sales (rose|fell|jumped|slumped|climbed)\b/i,
      ],
      exclusions: [/\bexpected to\b|\bahead of\b|\bpreview\b|\bwhat to (watch|expect)\b|\bforecasts?\b/i],
    },
    {
      cle: "mouvement_marche",
      libelle: "Mouvement de marché",
      impact: "moyen",
      champ: "titre",
      motifs: [
        /\bbiggest moves\b/i,
        /\bstock market today\b/i,
        new RegExp(String.raw`\b${ACTIONS}\b.{0,30}\b${VERBE}\b`, "i"),
        new RegExp(String.raw`\b${AUTRES_ACTIFS}\b.{0,30}\b${VERBE_FORT}\b`, "i"),
        new RegExp(String.raw`\b(dump(?:s|ed)?|flee(?:s)?|fled|shun(?:s|ned)?)\b.{0,30}\b${ACTIF}\b`, "i"),
        /\bsell-?off\b|\brout\b|\bmeltdown\b|\bcrash(es|ing)?\b/i,
        /\b(best|worst) (day|week|month|session)\b/i,
        /\brecord (high|low|close)\b/i,
      ],
      exclusions: [CONDITIONNEL],
    },
    {
      cle: "resultats",
      libelle: "Résultats",
      impact: "moyen",
      motifs: [
        /\b(first|second|third|fourth|q[1-4])[- ]quarter (results|earnings|profit|revenue|sales)\b/i,
        /\bquarterly (results|earnings|profit|revenue)\b/i,
        /\bearnings (beat|miss|top|surge|slump|jump|fall)/i,
        /\b(beats?|miss(es)?|tops?) (estimates|expectations|forecasts)\b/i,
        /\b(weak|strong|record|disappointing) (earnings|results|profit)\b/i,
        /\bprofit (jumps|falls|rises|drops|surges|slumps|beats|misses|doubles)\b/i,
        /\b(raises|cuts|lowers) (its |full-year )?(guidance|outlook|forecast)\b/i,
      ],
    },
    {
      cle: "fusion_acquisition",
      libelle: "Fusion-acquisition",
      impact: "moyen",
      motifs: [
        /\bto acquire\b|\bacquires\b|\bacquisition of\b|\bagrees? to (buy|acquire|merge)\b/i,
        /\bmerger\b|\btakeover\b|\bbuyout\b/i,
        /[$€£]\s?\d+(\.\d+)?\s?(bn|billion|mn|million)\b.{0,40}\b(deal|sale|bid|offer)\b/i,
        /\b(deal|sale|bid|offer)\b.{0,40}[$€£]\s?\d+(\.\d+)?\s?(bn|billion)\b/i,
        /\bconsider(s|ing)? offers\b|\btakeover bid\b|\bbid for\b/i,
        /\bIPO\b|\bfloat\b/,
      ],
      exclusions: [/\bspeculation\b|\brumou?rs?\b/i],
    },
    {
      cle: "initie_institution",
      libelle: "Initiés / institutions",
      impact: "moyen",
      motifs: [
        /\binsider (buying|selling|sale|purchase)s?\b/i,
        /\b13F\b/,
        /\bactivist\b|\btakes? (a )?\d+(\.\d+)?% stake\b|\bstake (raised|cut|increased|reduced)\b/i,
        /\bBerkshire (buys|sells|boosts|trims|cuts|adds)\b/i,
      ],
    },
  ] as RegleCategorie[],

  // Rejet prioritaire : rubriques non informatives pour un investisseur.
  rejets: [
    /\binterview\b|\bpodcast\b|\bnewsletter\b|\broundup\b|\bmarket talk\b|\byou asked\b/i,
    /\byour (portfolio|money|taxes|retirement|etf)\b|\byou think\b|\bhow to\b/i,
    /\blifestyle\b|\bwellness\b|\bmust-see\b|\bexhibition|\brecipe\b|\btournament\b/i,
    /\baccident\b|\binjured\b|\bsentenced\b|\bcriminals?\b|\bstole\b/i,
    /\?\s*$/, // titres en question : quasi toujours des analyses ou tribunes
    /^(why|how|what|here.s (how|why|what))\b/i, // « Pourquoi... », « Voici comment... » : analyses, pas des faits
  ],
};

// Entreprises et indices reconnus dans le texte (tickers liés).
const ENTITES: [RegExp, string][] = [
  [/\bS&P(?: 500)?\b|\bWall Street\b|\bU\.?S\.? stocks\b/i, "SPX"],
  [/\bNasdaq\b/i, "NDX"],
  [/\bApple\b/, "AAPL"], [/\bMicrosoft\b/, "MSFT"], [/\bNvidia\b/i, "NVDA"], [/\bBroadcom\b/, "AVGO"],
  [/\bAmazon\b/, "AMZN"], [/\bTesla\b/, "TSLA"], [/\bAlphabet\b|\bGoogle\b/, "GOOGL"], [/\bMeta( Platforms)?\b/, "META"],
  [/\bNetflix\b/, "NFLX"], [/\bCostco\b/, "COST"], [/\bJPMorgan\b/, "JPM"], [/\bEli Lilly\b|\bLilly\b/, "LLY"],
];

const EUROPE = /\b(ECB|eurozone|euro area|European|Europe|EU|UK|U\.K\.|Britain|British|Germany|German|France|French|Italy|Italian|Spain|Spanish|Swiss|Switzerland|FTSE|DAX|CAC|Stoxx|Lufthansa|London)\b/i;
// Hors États-Unis et Europe : les sources sont américaines, donc « US » par défaut.
const AUTRES_PAYS = /\b(India|Indian|China|Chinese|Japan|Japanese|Asia|Asian|Indonesia|Indonesian|Korea|Korean|Australia|Australian|Brazil|Mexico|Canada|Canadian|LatAm|Hong Kong|Taiwan|Philippine|Saudi|Gulf|Turkey|Russia|Russian)\b/i;

export interface ArticleBrut {
  source: string;
  titre: string;
  extrait: string;
}

export interface Decision {
  garder: boolean;
  categorie: Categorie | null;
  impact: Impact;
  raison: string;
  tickers: string[];
  region: "US" | "Europe" | "Monde";
}

export function classerArticle(a: ArticleBrut): Decision {
  const texte = `${a.titre} ${a.extrait}`;
  const tickers = [...new Set(ENTITES.filter(([m]) => m.test(texte)).map(([, t]) => t))];
  const region = a.source === "BCE" || a.source === "FT Europe" || EUROPE.test(a.titre)
    ? "Europe"
    : AUTRES_PAYS.test(a.titre)
    ? "Monde"
    : "US";
  const base = { tickers, region } as const;

  const officielles = REGLES.sourcesOfficielles[a.source];
  if (officielles) {
    const ok = officielles.some((m) => m.test(a.titre));
    return ok
      ? { ...base, garder: true, categorie: "banque_centrale", impact: "fort", raison: "communiqué de politique monétaire" }
      : { ...base, garder: false, categorie: null, impact: "faible", raison: "communiqué officiel hors décision (discours, enquête...)" };
  }

  const rejet = REGLES.rejets.find((m) => m.test(a.titre));
  if (rejet) return { ...base, garder: false, categorie: null, impact: "faible", raison: `rubrique écartée (${rejet.source.slice(0, 30)})` };

  for (const c of REGLES.categories) {
    const motif = c.motifs.find((m) => m.test(c.champ === "titre" ? a.titre : texte));
    if (!motif) continue;
    if (c.exclusions?.some((m) => m.test(a.titre))) continue;
    // Variation chiffrée sous le seuil (« Dollar Index Falls 0.32% ») : pas significative.
    if (c.cle === "mouvement_marche") {
      const pourcentages = [...a.titre.matchAll(/(\d+(?:[.,]\d+)?)\s?%/g)].map((m) => Number(m[1].replace(",", ".")));
      if (pourcentages.length && Math.max(...pourcentages) < SEUIL_MOUVEMENT_PCT) continue;
    }
    // Un événement hors États-Unis et Europe (ex. banque centrale indienne) pèse moins sur les indices suivis.
    const impact: Impact = region === "Monde" && c.impact === "fort" ? "moyen" : c.impact;
    return { ...base, garder: true, categorie: c.cle, impact, raison: c.libelle };
  }
  return { ...base, garder: false, categorie: null, impact: "faible", raison: "aucune catégorie de marché" };
}
