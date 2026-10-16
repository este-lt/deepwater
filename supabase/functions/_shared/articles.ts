// Écriture des articles retenus par le filtre (RSS et Alpha Vantage), sans doublon
// de lien ni de titre identique publié par deux sources.
import type { Decision } from "./filtre-actualites.ts";
import { admin } from "./supabase.ts";

export interface ArticleRetenu {
  titre: string;
  source: string;
  url: string;
  date_publication: string;
  extrait_court: string;
  decision: Decision;
  sentiment?: number | null;
}

export async function enregistrerArticles(articles: ArticleRetenu[]): Promise<number> {
  if (articles.length === 0) return 0;
  const urls = articles.map((a) => a.url);
  const { data: existants, error } = await admin().from("articles").select("url").in("url", urls);
  if (error) throw new Error(`Lecture des articles existants impossible : ${error.message}`);
  const deja = new Set((existants ?? []).map((e) => e.url));

  const lignes = articles
    .filter((a) => !deja.has(a.url))
    .map((a) => ({
      titre: a.titre.slice(0, 500),
      source: a.source,
      url: a.url,
      date_publication: a.date_publication,
      extrait_court: a.extrait_court,
      impact_niveau: a.decision.impact,
      categorie: a.decision.categorie,
      region: a.decision.region,
      tickers_lies: a.decision.tickers,
      sentiment: a.sentiment ?? null,
    }));
  if (lignes.length === 0) return 0;
  const { data, error: erreurEcriture } = await admin()
    .from("articles")
    .upsert(lignes, { onConflict: "empreinte", ignoreDuplicates: true })
    .select("id");
  if (erreurEcriture) throw new Error(`Écriture des articles impossible : ${erreurEcriture.message}`);
  return data?.length ?? 0;
}
