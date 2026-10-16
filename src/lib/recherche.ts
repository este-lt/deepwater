import "server-only";
import type { ClientSupabase } from "./supabase";

// Recherche globale dans les données déjà en base (aucun appel externe).

export function nettoyerRecherche(brut: string | string[] | undefined): string {
  const texte = Array.isArray(brut) ? brut[0] ?? "" : brut ?? "";
  // Lettres, chiffres, espaces et & . ' - / uniquement : le texte part dans des filtres ilike.
  return texte.normalize("NFC").replace(/[^\p{L}\p{N}\s&.'/-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

export interface ResultatsRecherche {
  q: string;
  instruments: { symbole: string; nom: string; classe: string }[];
  articles: { id: number; titre: string; source: string; url: string; date_publication: string; impact_niveau: string }[];
  calendrier: { id: number; libelle: string; date_evenement: string; type_evenement: string; source_donnee: string }[];
  total: number;
}

// Les titres d'actualités sont en anglais : équivalents des recherches courantes en français.
const EQUIVALENTS: Record<string, string[]> = {
  inflation: ["inflation", "CPI", "consumer prices"],
  chomage: ["unemployment", "jobless"],
  emploi: ["payrolls", "jobs report"],
  emplois: ["payrolls", "jobs report"],
  petrole: ["oil", "crude"],
  argent: ["silver"],
  taux: ["rate", "yield"],
  dollar: ["dollar"],
  "banque centrale": ["central bank"],
  bce: ["ECB"],
  croissance: ["GDP", "growth"],
  pib: ["GDP"],
  "droits de douane": ["tariff"],
  douane: ["tariff"],
  volatilite: ["volatility", "VIX"],
};
const sansAccents = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const unique = <T,>(lignes: T[], cle: (l: T) => string | number) => [...new Map(lignes.map((l) => [cle(l), l])).values()];

export async function rechercher(supabase: ClientSupabase, q: string): Promise<ResultatsRecherche> {
  const motif = `%${q}%`;
  const termes = [q, ...(EQUIVALENTS[sansAccents(q)] ?? [])].slice(0, 4);
  const champs = "id, titre, source, url, date_publication, impact_niveau";
  const [parSymbole, parNom, articles, articlesLies, calendrier] = await Promise.all([
    supabase.from("tickers_suivis").select("symbole, nom, classe_actif").eq("actif_bool", true).ilike("symbole", motif).limit(10),
    supabase.from("tickers_suivis").select("symbole, nom, classe_actif").eq("actif_bool", true).ilike("nom", motif).limit(10),
    Promise.all(
      termes.map((t) =>
        supabase.from("articles").select(champs).ilike("titre", `%${t}%`).order("date_publication", { ascending: false }).limit(15)
      ),
    ).then((rs) => ({ data: rs.flatMap((r) => r.data ?? []), error: rs.find((r) => r.error)?.error ?? null })),
    // Articles rattachés à un actif (ex. XAU pour un titre qui cite « gold »).
    supabase.from("articles").select(champs).contains("tickers_lies", [q.toUpperCase()]).order("date_publication", { ascending: false }).limit(15),
    supabase
      .from("calendrier_economique")
      .select("id, libelle, date_evenement, type_evenement, source_donnee")
      .ilike("libelle", motif)
      .gte("date_evenement", new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10))
      .order("date_evenement", { ascending: true })
      .limit(10),
  ]);
  for (const r of [parSymbole, parNom, articles, articlesLies, calendrier]) {
    if (r.error) throw new Error(`Recherche impossible : ${r.error.message}`);
  }

  const resultats = {
    q,
    instruments: unique([...(parSymbole.data ?? []), ...(parNom.data ?? [])], (t) => t.symbole).map((t) => ({
      symbole: t.symbole,
      nom: t.nom,
      classe: t.classe_actif,
    })),
    articles: unique([...(articles.data ?? []), ...(articlesLies.data ?? [])], (a) => a.id)
      .sort((a, b) => b.date_publication.localeCompare(a.date_publication))
      .slice(0, 15),
    calendrier: calendrier.data ?? [],
  };
  return { ...resultats, total: resultats.instruments.length + resultats.articles.length + resultats.calendrier.length };
}
