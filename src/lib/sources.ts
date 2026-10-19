import type { Langue } from "./i18n";

// Libellés lisibles des sources techniques ("fred:SP500" -> "FRED"), côté serveur et navigateur.
export function libelleSource(source: string | null | undefined, langue: Langue = "fr"): string {
  const en = langue === "en";
  if (!source) return en ? "unknown source" : "source inconnue";
  if (source.startsWith("fred:")) return en ? "FRED (St. Louis Fed)" : "FRED (Fed de St. Louis)";
  if (source.startsWith("bce:")) return en ? "ECB (reference rates)" : "BCE (cours de référence)";
  if (source === "coingecko") return "CoinGecko";
  if (source.startsWith("alpha_vantage")) return "Alpha Vantage";
  if (source.startsWith("bis:")) return en ? "BIS" : "BRI";
  if (source.startsWith("oecd:")) return en ? "OECD" : "OCDE";
  if (source.startsWith("snb:")) return en ? "SNB" : "BNS";
  if (source.startsWith("eurostat:")) return "Eurostat";
  if (source === "forexfactory") return "Forex Factory";
  return source;
}

export const CLASSES = [
  { cle: "indice", fr: "Indices actions", en: "Equity indices" },
  { cle: "volatilite", fr: "Volatilité", en: "Volatility" },
  { cle: "taux", fr: "Taux", en: "Rates" },
  { cle: "credit", fr: "Crédit, liquidité et conditions financières", en: "Credit, liquidity and financial conditions" },
  { cle: "forex", fr: "Devises", en: "Currencies" },
  { cle: "matiere", fr: "Matières premières", en: "Commodities" },
  { cle: "crypto", fr: "Crypto", en: "Crypto" },
] as const;

export type CleClasse = (typeof CLASSES)[number]["cle"];
export const CLASSES_PAR_DEFAUT: CleClasse[] = ["indice", "volatilite", "taux", "credit"];
