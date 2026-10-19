// Chiffres publiés face au consensus, lus dans les titres du fil instantané :
//   FinancialJuice : « US CPI YoY Actual 3.7% (Forecast 3.6%, Previous 3.4%) »
//   InvestingLive  : « US September industrial production +0.7% vs +0.4% expected »
// Sans consensus chiffré (« Forecast - »), rien n'est retenu : jamais de valeur inventée.

export type Famille = "inflation" | "emploi" | "chomage" | "croissance" | "autre";

export interface Publication {
  devise: string | null;
  libelle: string;
  publie: number;
  prevision: number;
  precedent: number | null;
  unite: string | null; // "%", "K", "M", "B" ou null (indice, niveau)
  famille: Famille;
  ecart: number;
  surprise: number; // écart normalisé entre -1 et +1, positif = au-dessus du consensus
}

const PAYS: [RegExp, string][] = [
  [/^(US|U\.S\.|United States|USA)\b/i, "USD"],
  [/^(Euro ?zone|Euro Area|EZ|EU|German[y]?|France|French|Ital(y|ian)|Spa(in|nish))\b/i, "EUR"],
  [/^(UK|U\.K\.|British|Britain|United Kingdom)\b/i, "GBP"],
  [/^(Japan(ese)?|JP)\b/i, "JPY"],
  [/^(Swiss|Switzerland)\b/i, "CHF"],
  [/^(Canada|Canadian|CA)\b/i, "CAD"],
  [/^(Australia(n)?|AU)\b/i, "AUD"],
  [/^(New Zealand|NZ)\b/i, "NZD"],
  [/^(China|Chinese|CN)\b/i, "CNY"],
];

// Ordre important : « prices paid » est de l'inflation avant d'être un PMI.
const FAMILLES: [RegExp, Famille][] = [
  [/\b(unemployment rate|jobless|claims|claimant)\b/i, "chomage"],
  [/\b(CPI|PCE|PPI|inflation|price index|prices paid|prices|hourly earnings|wages?|deflator)\b/i, "inflation"],
  [/\b(payrolls?|non-?farm|employment change|ADP|JOLTS|job openings)\b/i, "emploi"],
  [/\b(GDP|retail sales|industrial production|PMI|ISM|durable goods|housing starts|building permits|consumer confidence|sentiment|manufacturing|services|factory orders|business confidence)\b/i, "croissance"],
];

const NOMBRE = String.raw`[+\-−]?\d[\d,]*(?:\.\d+)?\s*(?:%|[KMB]\b|bn\b|mln\b|bln\b)?`;

function lireNombre(brut: string): { valeur: number; unite: string | null } | null {
  const t = brut.trim().replace(/−/g, "-");
  const m = t.match(/^([+-]?\d[\d,]*(?:\.\d+)?)\s*(%|[KMB]|bn|mln|bln)?$/i);
  if (!m) return null;
  const valeur = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(valeur)) return null;
  const u = m[2]?.toUpperCase();
  const unite = u === undefined ? null : u === "%" ? "%" : u === "BN" || u === "BLN" ? "B" : u === "MLN" ? "M" : u;
  return { valeur, unite };
}

const borner = (v: number) => Math.max(-1, Math.min(1, v));

// Écart qui donne une surprise pleine : 0,2 pt pour un pourcentage, 5 % du consensus sinon.
export function echelle(unite: string | null, prevision: number, precedent: number | null): number {
  if (unite === "%") return 0.2;
  return Math.max(Math.abs(prevision) * 0.05, Math.abs(precedent ?? 0) * 0.05, 0.5);
}

function construire(libelleBrut: string, publieBrut: string, previsionBrut: string, precedentBrut: string | null): Publication | null {
  const publie = lireNombre(publieBrut);
  const prevision = lireNombre(previsionBrut);
  if (!publie || !prevision) return null;
  // Unités incompatibles (« 1.2M » contre « 950K ») : on n'interprète pas.
  if (publie.unite !== prevision.unite && publie.unite !== null && prevision.unite !== null) return null;
  const precedent = precedentBrut ? lireNombre(precedentBrut) : null;
  const libelle = libelleBrut.replace(/\s+/g, " ").replace(/[:\-–—]\s*$/, "").trim();
  if (libelle.length < 3) return null;
  const devise = PAYS.find(([m]) => m.test(libelle))?.[1] ?? null;
  const famille = FAMILLES.find(([m]) => m.test(libelle))?.[1] ?? "autre";
  const unite = publie.unite ?? prevision.unite;
  const ecart = Math.round((publie.valeur - prevision.valeur) * 1e6) / 1e6;
  return {
    devise, libelle, publie: publie.valeur, prevision: prevision.valeur, precedent: precedent?.valeur ?? null, unite, famille, ecart,
    surprise: Math.round(borner(ecart / echelle(unite, prevision.valeur, precedent?.valeur ?? null)) * 1000) / 1000,
  };
}

export function lirePublication(titre: string): Publication | null {
  const t = titre.replace(/\s+/g, " ").trim();
  const fj = t.match(new RegExp(String.raw`^(.+?)\s+Actual\s+(${NOMBRE})\s*\(\s*(?:Forecast|Expected|Est\.?)\s+(${NOMBRE}|-)\s*,\s*(?:Previous|Prior)\s+(${NOMBRE}|-)\s*\)`, "i"));
  if (fj) return fj[3] === "-" ? null : construire(fj[1], fj[2], fj[3], fj[4] === "-" ? null : fj[4]);
  const il = t.match(new RegExp(String.raw`^(.+?)\s+(${NOMBRE})\s+vs\s+(${NOMBRE})\s+(?:expected|exp\.?|estimate|est\.?|consensus)\b(?:.*?\b(?:prior|previous)\s+(${NOMBRE}))?`, "i"));
  if (il) return construire(il[1], il[2], il[3], il[4] ?? null);
  return null;
}

// Effet d'une surprise sur les actions : une inflation plus forte qu'attendu ou un chômage
// plus élevé pèse sur les actions ; plus d'emplois ou de croissance les soutient.
export const SENS_ACTIONS: Record<Famille, number> = { inflation: -1, chomage: -1, emploi: 1, croissance: 1, autre: 0 };
// Effet sur la devise du pays : toute surprise à la hausse (inflation, emploi, croissance) la
// soutient (banque centrale plus restrictive) ; le chômage à l'inverse.
export const SENS_DEVISE: Record<Famille, number> = { inflation: 1, chomage: -1, emploi: 1, croissance: 1, autre: 0 };
