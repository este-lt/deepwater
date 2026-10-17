// Squawks (FinancialJuice, InvestingLive) : titres courts publiés en continu. Filtre plus
// strict que pour les articles, car le volume est élevé et le bruit important (faits
// divers, entreprises, liens promotionnels). Gardé seulement :
//   banque_centrale    : les 8 grandes banques centrales (+ BPC), propos de politique monétaire
//   statistique_macro  : chiffres publiés des grandes économies (avec prévision quand donnée)
//   marche             : mouvements forts des indices, taux, devises, matières premières
//   politique_eco      : droits de douane, sanctions, OPEP, budget fédéral...
//   geopolitique       : ce qui touche l'offre d'énergie ou le risque global (Ormuz, cessez-le-feu, nucléaire)
import { type Decision, REGLES } from "./filtre-actualites.ts";

const BANQUES = /\b(Fed|FOMC|Federal Reserve|ECB|European Central Bank|BoE|BOE|Bank of England|BoJ|BOJ|Bank of Japan|SNB|Swiss National Bank|BoC|BOC|Bank of Canada|RBA|Reserve Bank of Australia|RBNZ|PBOC|PBoC)\b/;
const POLITIQUE_MONETAIRE = /\b(rates?|inflation|hikes?|hiking|cuts?|cutting|easing|tighten\w*|polic(y|ies)|hawkish|dovish|neutral|pause|balance sheet|QT|QE|bond[- ]buying|yields?|currency|yen|intervention|growth|labou?r market|wages?|economy|recession|restrictive|accommodative|price stability)\b/i;

// Grandes économies (les autres pays sont ignorés pour les statistiques).
const PAYS_MAJEURS = /^(US|U\.S\.|United States|EZ|Eurozone|Euro ?zone|Euro area|EU|German[y]?|France|French|Italy|Italian|Spain|Spanish|UK|U\.K\.|British|Japan|Japanese|Tokyo|Swiss|Switzerland|Canada|Canadian|Australia|Australian|New Zealand|NZ|China|Chinese)\b/i;
const STATISTIQUES = /\b(CPI|HICP|PPI|PCE|GDP|PMI|ISM|retail sales|payrolls?|non-?farm|NFP|unemployment|jobless|claims|employment change|average (hourly )?earnings|wages?|inflation|industrial production|import prices?|consumer (confidence|sentiment)|ifo|ZEW|Tankan|trade balance|housing starts|durable goods|JOLTS)\b/i;
// Format des squawks de données : « Actual … (Forecast …, Previous …) » ou « +0.7% vs +0.4% expected ».
const CHIFFRE_PUBLIE = /\bActual\b|\bvs\b.{0,20}\b(expected|exp\.?|prelim|prior|est\.?)\b|[+-]?\d+(\.\d+)?%/i;

const GEOPOLITIQUE = /\b(Hormuz|Red Sea|Bab el-Mandeb|tankers?|oil (field|facilit\w+|refiner\w*|exports?|supply|output|infrastructure)|pipeline|naval blockade|blockade|ceasefire|cease-fire|truce|peace (deal|talks|plan|agreement|accord)|nuclear (deal|talks|test|arms|weapons?|program)|invasion|invade[sd]?|declares? war|martial law|Taiwan Strait|NATO)\b/i;
// Faits divers et bilans locaux : du bruit, même en zone de conflit.
const FAIT_DIVERS = /\b(killed|kills|dead|death toll|injured|wounded|civilians?|police|detain\w*|arrest\w*|executed|protests?|protesters?|tear gas|court|trial|funeral|hostages?)\b/i;

const REJETS = [
  /\bFJElite\b|\bWATCH LIVE\b|\bMOC Imbalance\b|\bOptions? Expir\w*\b|\bCFTC\b|\bweek ahead\b|\bpodcast\b|\binterview\b/i,
  /\$[A-Z]{1,5}\b/, // symbole d'une action
  /\b(technical(s| analysis)?|key levels?|chart of the day|what('s)? next|kickstart|wrap|outlook|preview|explainer)\b/i,
  // Une entreprise en particulier (« average hourly earnings » reste une statistique).
  /\b(revenue|profits?|guidance|IPO|takeover|mergers?|acquir\w*|acquisition|buyout|stake|activist|CEO|chief executive|shareholders?|dividend|buyback|spin-?off|layoffs?|bankruptcy|said to weigh|biggest moves|premarket|movers)\b/i,
  /(?<!hourly |average )\bearnings\b/i,
  /\b(shares|stock) (of|in)\b|\bshares (jump|fall|rise|drop|surge|slump|sink|soar|tumble|plunge)/i,
  /\b(mayor|city council|county|statehouse|state legislature)\b/i,
  /\?\s*$/,
];

const SEUIL_MOUVEMENT_PCT = 2;
const ACTIFS = /\b(S&P(?: 500)?|Nasdaq|Dow|Russell|Nikkei|Stoxx|DAX|FTSE|stocks|equities|Treasur(?:y|ies)|yields?|bonds?|gilts?|bunds?|dollar|DXY|euro|EUR\/?USD|yen|USD\/?JPY|sterling|pound|GBP\/?USD|franc|Aussie|AUD\/?USD|kiwi|NZD\/?USD|loonie|USD\/?CAD|yuan|oil|crude|WTI|Brent|natural gas|gold|silver|copper|bitcoin|BTC|ether|crypto)\b/i;
const MOUVEMENT_FORT = /\b(surge[sd]?|soar(s|ed)?|plunge[sd]?|tumble[sd]?|slump(s|ed)?|crash(es|ed)?|spike[sd]?|record (high|low|close)|sell-?off|rout|all-time high|biggest (daily |weekly )?(gain|drop|fall|rise))\b/i;

export function nettoyerSquawk(titre: string): string {
  return titre
    .replace(/^(FinancialJuice|investingLive)\s*:\s*/i, "")
    .replace(/\s*-\s*(FJElite|Post on X)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function region(titre: string): Decision["region"] {
  if (/^(US|U\.S\.|United States)\b|\b(Fed|FOMC|Treasury|Trump|White House|Wall Street|S&P|Nasdaq|Dow)\b/.test(titre)) return "US";
  if (/\b(ECB|EZ|Eurozone|Euro ?zone|Euro area|EU|German|France|French|Ital|Spain|UK|U\.K\.|BoE|BOE|Bank of England|SNB|Swiss|Lagarde|Bailey|gilts?|bunds?)\b/.test(titre)) return "Europe";
  return "Monde";
}

const ENTITES: [RegExp, string][] = [
  [/\bS&P(?: 500)?\b|\bWall Street\b|\bUS stocks\b/i, "SPX"], [/\bNasdaq\b/i, "NDX"], [/\bVIX\b/, "VIX"],
  [/\bTreasur(?:y|ies)\b|\byields?\b/i, "US10Y"], [/\bdollar\b|\bDXY\b/i, "DXY"], [/\bEUR\/?USD\b|\beuro\b/i, "EURUSD"],
  [/\bUSD\/?JPY\b|\byen\b/i, "USDJPY"], [/\bGBP\/?USD\b|\bsterling\b|\bpound\b/i, "GBPUSD"], [/\bAUD\/?USD\b|\bAussie\b/i, "AUDUSD"],
  [/\bUSD\/?CAD\b|\bloonie\b/i, "USDCAD"], [/\bUSD\/?CHF\b|\bSwiss franc\b/i, "USDCHF"], [/\bNZD\/?USD\b|\bkiwi\b/i, "NZDUSD"],
  [/\bWTI\b|\bcrude\b|\boil\b|\bOPEC|\bHormuz\b/i, "WTI"], [/\bBrent\b/i, "BRENT"], [/\bgold\b/i, "XAU"], [/\bbitcoin\b|\bBTC\b/i, "BTC"],
];

export function classerSquawk(brut: string): Decision & { titre: string } {
  const titre = nettoyerSquawk(brut);
  const base = { titre, region: region(titre), tickers: [...new Set(ENTITES.filter(([m]) => m.test(titre)).map(([, t]) => t))] };
  const non = (raison: string) => ({ ...base, garder: false, categorie: null, impact: "faible" as const, raison });

  if (titre.length < 15 || !/\s/.test(titre)) return non("titre tronqué");
  const rejet = REJETS.find((r) => r.test(titre));
  if (rejet) return non(`écarté (${rejet.source.slice(0, 40)})`);

  if (BANQUES.test(titre) && POLITIQUE_MONETAIRE.test(titre)) {
    return { ...base, garder: true, categorie: "banque_centrale", impact: "fort", raison: "banque centrale" };
  }
  if (PAYS_MAJEURS.test(titre) && STATISTIQUES.test(titre) && CHIFFRE_PUBLIE.test(titre)) {
    const majeure = /\b(CPI|HICP|PCE|GDP|payrolls?|non-?farm|NFP|unemployment rate|employment change)\b/i.test(titre);
    return { ...base, garder: true, categorie: "statistique_macro", impact: majeure ? "fort" : "moyen", raison: "statistique publiée" };
  }
  if (ACTIFS.test(titre)) {
    const pourcentages = [...titre.matchAll(/(\d+(?:\.\d+)?)\s?%/g)].map((m) => Number(m[1]));
    const fort = MOUVEMENT_FORT.test(titre) || (pourcentages.length > 0 && Math.max(...pourcentages) >= SEUIL_MOUVEMENT_PCT &&
      /\b(up|down|rise[sd]?|rose|fall(s|en)?|fell|gain(s|ed)?|drop(s|ped)?|jump(s|ed)?|settle[sd]?)\b/i.test(titre));
    if (fort) return { ...base, garder: true, categorie: "marche", impact: "moyen", raison: "mouvement de marché" };
  }
  const politique = REGLES.categories.find((c) => c.cle === "politique_eco")!;
  if (politique.motifs.some((m) => m.test(titre))) {
    return { ...base, garder: true, categorie: "politique_eco", impact: "moyen", raison: "politique économique" };
  }
  if (GEOPOLITIQUE.test(titre) && !FAIT_DIVERS.test(titre)) {
    return { ...base, garder: true, categorie: "geopolitique", impact: "moyen", raison: "géopolitique (énergie, risque global)" };
  }
  return non("hors périmètre");
}
