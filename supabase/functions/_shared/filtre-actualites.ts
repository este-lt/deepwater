// Filtre strict des actualités : ne garder que ce qui fait bouger les marchés dans leur
// ensemble (indices, taux, devises, matières premières, crypto). Règles modifiables
// ci-dessous (REGLES). Un article est gardé si son titre correspond à une catégorie et
// à aucun motif de rejet.
//
// Gardé : décisions et messages des banques centrales, statistiques macro publiées,
// mouvements de marché d'ensemble, politique économique qui touche les marchés
// (droits de douane, shutdown, plafond de la dette, OPEP, sanctions…).
// Rejeté : tout ce qui concerne une entreprise en particulier (résultats, fusions,
// introductions en Bourse, listes de valeurs), la politique locale, l'opinion, les
// conseils personnels, les faits divers.

export type Categorie = "banque_centrale" | "statistique_macro" | "marche" | "politique_eco";

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

// Marché actions dans son ensemble : indices, « Wall Street », « les actions » d'un pays.
const SECTEURS = String.raw`(?:tech|bank|banking|chip|energy|defen[cs]e|retail|airline|auto|mining|oil|pharma|biotech|software|ai|utility|utilities|growth|value|small-cap|meme|property|luxury)`;
const MARCHE_ACTIONS = new RegExp(
  String.raw`(?:\bS&P(?: 500)?\b|\bNasdaq\b|\bDow\b|\bWall Street\b|\bRussell 2000\b|\bstock market\b|\bU\.?S\.? stocks\b|\bglobal stocks\b|\bworld stocks\b|\bequities\b|\bStoxx\b|\bFTSE\b|\bDAX\b|\bCAC\b|\bNikkei\b|\bHang Seng\b|^(?!${SECTEURS}\s)[A-Z][\w-]* stocks\b|^stocks\b)`,
  "i",
);
// Taux, devises, matières premières, crypto : seulement les mouvements forts.
const AUTRES_ACTIFS = String.raw`(?:Treasur(?:y|ies)|bonds?|yields?|gilts?|bunds?|oil|crude|Brent|dollar|euro|yen|sterling|pound|yuan|gold|silver|copper|bitcoin|crypto(?:currencies)?|futures)`;
const VERBE = String.raw`(?:rall(?:y|ies|ied)|surge[sd]?|soar(?:s|ed)?|plunge[sd]?|tumble[sd]?|slump(?:s|ed)?|sinks?|sank|crash(?:es|ed)?|jump(?:s|ed)?|slide[sd]?|slid|drop(?:s|ped)?|falls?|fell|gain(?:s|ed)?|rise[sd]?|rose|climb(?:s|ed)?|mixed|recover(?:s|ed)?|rebound(?:s|ed)?|edge[sd]? (?:up|down|higher|lower)|steady)`;
const VERBE_FORT = String.raw`(?:rall(?:y|ies|ied)|surge[sd]?|soar(?:s|ed)?|plunge[sd]?|tumble[sd]?|slump(?:s|ed)?|sinks?|sank|crash(?:es|ed)?|spike[sd]?)`;
// Seuil de mouvement significatif quand le titre donne un pourcentage.
const SEUIL_MOUVEMENT_PCT = 2;

export const REGLES = {
  version: "2026-10-17",

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
        /\b(Fed|Federal Reserve|ECB|European Central Bank|Bank of England|BoE|Bank of Japan|BoJ|SNB|PBOC|central bank)\b.{0,40}\b(raises?|hikes?|cuts?|lowers?|holds?|keeps?|leaves)\b.{0,25}\brates?\b/i,
        /\brate[- ](hike|cut) (bets|decision|expectations)\b/i,
        /\binterest[- ]rate decision\b/i,
        /\b(Powell|Warsh|Lagarde|Fed chair(man)?|ECB president|Ueda|Bailey)\b.{0,50}\b(says|signals|warns|hints|rules out|opens door)\b/i,
        /\b(Fed|ECB)\b.{0,30}\b(minutes|balance sheet|quantitative)\b/i,
      ],
      exclusions: [CONDITIONNEL],
    },
    {
      cle: "statistique_macro",
      libelle: "Statistique macro",
      impact: "fort",
      champ: "titre",
      motifs: [
        /\b(CPI|PPI|PCE|ISM|PMI)\b/,
        /\b(consumer|producer|wholesale|import) prices? (rose|rise|rises|fell|falls|climbed|jumped|increased|decreased|eased)\b/i,
        /\binflation (rose|fell|accelerat\w+|slow\w+|cool\w+|ease[sd]|jump\w*|hit|unexpectedly)\b/i,
        /\b(nonfarm payrolls|jobs report|payrolls (rose|grew|fell|jumped)|jobless claims|job openings|JOLTS)\b/i,
        /\bunemployment rate (rose|fell|climbed|ticked|held|rises|falls)\b/i,
        /\beconomy (grew|shrank|contracted|expanded)\b/i,
        /\bGDP\b.{0,30}\b(grew|rose|fell|shrank|contracted|expanded)\b/i,
        /\bretail sales (rose|fell|jumped|slumped|climbed|rise|fall)\b/i,
      ],
      exclusions: [/\bexpected to\b|\bahead of\b|\bpreview\b|\bwhat to (watch|expect)\b|\bforecasts?\b/i],
    },
    {
      cle: "marche",
      libelle: "Marchés",
      impact: "moyen",
      champ: "titre",
      motifs: [
        /\bstock market today\b/i,
        new RegExp(String.raw`${MARCHE_ACTIONS.source}.{0,40}\b${VERBE}\b`, "i"),
        new RegExp(String.raw`\b${AUTRES_ACTIFS}\b.{0,30}\b${VERBE_FORT}\b`, "i"),
        new RegExp(String.raw`\b(dump(?:s|ed)?|flee(?:s)?|fled|shun(?:s|ned)?)\b.{0,30}\b(${AUTRES_ACTIFS.slice(3, -1)}|stocks|equities)\b`, "i"),
        /\bsell-?off\b|\brout\b|\bmeltdown\b|\bcrash(es|ing)?\b/i,
        /\b(best|worst) (day|week|month|quarter|session)\b/i,
        /\brecord (high|low|close)\b/i,
        /\bVIX\b|\bvolatility (spikes?|surges?|jumps?)\b/i,
      ],
      exclusions: [CONDITIONNEL],
    },
    {
      cle: "politique_eco",
      libelle: "Politique économique",
      impact: "moyen",
      champ: "titre",
      motifs: [
        /\btariffs?\b/i,
        /\btrade (war|deal|talks|truce|tensions|pact)\b/i,
        /\bsanctions?\b/i,
        /\bOPEC\+?/,
        /\b(government )?shutdown\b/i,
        /\bdebt (ceiling|limit)\b/i,
        /\bTreasury (auction|refunding|issuance)\b/i,
        /\b(budget|fiscal) deficit\b/i,
        /\bexport (controls|curbs|ban)\b/i,
        /\bStrait of Hormuz\b|\boil supply\b|\bsupply disruption\b/i,
      ],
      exclusions: [CONDITIONNEL],
    },
  ] as RegleCategorie[],

  // Rejet prioritaire (titre).
  rejets: [
    // Une entreprise en particulier, pas le marché.
    /\bbiggest moves\b|\bpremarket\b|\bafter[- ]hours\b|\bmidday\b|\bmovers\b/i,
    /\b(earnings|quarterly|revenue|profits?|guidance|IPO|float|listing|takeover|mergers?|acquir\w*|acquisition|buyout|stake|activist|CEO|chief executive|shareholders?|dividend|buyback|spin-?off|layoffs?|bankruptcy)\b/i,
    /\b(shares|stock) (of|in)\b|\bshares (jump|fall|rise|drop|surge|slump|sink|soar|tumble|plunge)/i,
    // Politique locale (États, villes) : sans effet sur les marchés suivis.
    /\b(governor|state legislature|state senate|statehouse|mayor|city council|county|lawmakers in [A-Z]\w+)\b/i,
    // Rubriques non informatives.
    /\binterview\b|\bpodcast\b|\bnewsletter\b|\broundup\b|\bmarket talk\b|\byou asked\b|\bopinion\b/i,
    /\byour (portfolio|money|taxes|retirement|etf)\b|\byou think\b|\bhow to\b/i,
    /\blifestyle\b|\bwellness\b|\bmust-see\b|\bexhibition|\brecipe\b|\btournament\b/i,
    /\baccident\b|\binjured\b|\bsentenced\b|\bcriminals?\b|\bstole\b/i,
    /\?\s*$/, // titres en question : quasi toujours des analyses ou tribunes
    /^(why|how|what|here.s (how|why|what))\b/i, // « Pourquoi... », « Voici comment... » : analyses, pas des faits
  ],
};

// Indices et actifs reconnus dans le titre (rattachement pour la recherche).
const ENTITES: [RegExp, string][] = [
  [/\bS&P(?: 500)?\b|\bWall Street\b|\bU\.?S\.? stocks\b/i, "SPX"],
  [/\bNasdaq\b/i, "NDX"],
  [/\bDow\b/, "DJI"],
  [/\bVIX\b|\bvolatility\b/i, "VIX"],
  [/\bTreasur(?:y|ies)\b|\byields?\b/i, "US10Y"],
  [/\bdollar\b/i, "DXY"],
  [/\beuro\b/i, "EURUSD"],
  [/\byen\b/i, "USDJPY"],
  [/\boil\b|\bcrude\b|\bOPEC/i, "WTI"],
  [/\bgold\b/i, "XAU"],
  [/\bbitcoin\b|\bcrypto/i, "BTC"],
];

const EUROPE = /\b(ECB|eurozone|euro area|European|Europe|EU|UK|U\.K\.|Britain|British|Germany|German|France|French|Italy|Italian|Spain|Spanish|Swiss|Switzerland|FTSE|DAX|CAC|Stoxx|London|gilts?|bunds?|Bank of England|BoE|Lagarde|Bailey)\b/i;
// Hors États-Unis et Europe : les sources sont américaines, donc « US » par défaut.
const AUTRES_PAYS = /\b(India|Indian|China|Chinese|Japan|Japanese|Asia|Asian|Indonesia|Indonesian|Korea|Korean|Australia|Australian|Brazil|Mexico|Canada|Canadian|LatAm|Hong Kong|Taiwan|Philippine|Saudi|Gulf|Turkey|Russia|Russian|Nikkei|Hang Seng|BoJ|Bank of Japan|PBOC|yen|yuan|Ueda)\b/i;

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
  const tickers = [...new Set(ENTITES.filter(([m]) => m.test(a.titre)).map(([, t]) => t))];
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
  if (rejet) return { ...base, garder: false, categorie: null, impact: "faible", raison: `écarté (${rejet.source.slice(0, 40)})` };

  for (const c of REGLES.categories) {
    const motif = c.motifs.find((m) => m.test(c.champ === "tout" ? `${a.titre} ${a.extrait}` : a.titre));
    if (!motif) continue;
    if (c.exclusions?.some((m) => m.test(a.titre))) continue;
    // Variation chiffrée sous le seuil (« Dollar Index Falls 0.32% ») : pas significative.
    if (c.cle === "marche") {
      const pourcentages = [...a.titre.matchAll(/(\d+(?:[.,]\d+)?)\s?%/g)].map((m) => Number(m[1].replace(",", ".")));
      if (pourcentages.length && Math.max(...pourcentages) < SEUIL_MOUVEMENT_PCT) continue;
    }
    // Un événement hors États-Unis et Europe pèse moins sur les indices suivis.
    const impact: Impact = region === "Monde" && c.impact === "fort" ? "moyen" : c.impact;
    return { ...base, garder: true, categorie: c.cle, impact, raison: c.libelle };
  }
  return { ...base, garder: false, categorie: null, impact: "faible", raison: "aucune catégorie de marché" };
}
