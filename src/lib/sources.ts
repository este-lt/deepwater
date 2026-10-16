// Libellés lisibles des sources techniques ("fred:SP500" -> "FRED"), côté serveur et navigateur.
export function libelleSource(source: string | null | undefined): string {
  if (!source) return "source inconnue";
  if (source.startsWith("fred:")) return "FRED (Fed de St. Louis)";
  if (source.startsWith("bce:")) return "BCE (cours de référence)";
  if (source === "coingecko") return "CoinGecko";
  if (source.startsWith("alpha_vantage")) return "Alpha Vantage";
  return source;
}

export const CLASSES = [
  { cle: "indice", libelle: "Indices actions" },
  { cle: "volatilite", libelle: "Volatilité" },
  { cle: "taux", libelle: "Taux" },
  { cle: "credit", libelle: "Crédit et conditions financières" },
  { cle: "forex", libelle: "Devises" },
  { cle: "matiere", libelle: "Matières premières" },
  { cle: "crypto", libelle: "Crypto" },
] as const;

export type CleClasse = (typeof CLASSES)[number]["cle"];
export const CLASSES_PAR_DEFAUT: CleClasse[] = ["indice", "volatilite", "taux", "credit"];
