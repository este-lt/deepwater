// Écriture des articles retenus par le filtre (RSS, squawks), sans doublon de lien ni de
// titre identique publié par deux sources, puis traduction automatique des titres.
import type { Decision } from "./filtre-actualites.ts";
import { admin } from "./supabase.ts";
import { traduire } from "./traduction.ts";

export interface ArticleRetenu {
  titre: string;
  source: string;
  url: string;
  date_publication: string;
  extrait_court: string | null;
  decision: Decision;
  sentiment?: number | null;
  type?: "article" | "squawk";
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
      type: a.type ?? "article",
    }));
  if (lignes.length === 0) return 0;
  const { data, error: erreurEcriture } = await admin()
    .from("articles")
    .upsert(lignes, { onConflict: "empreinte", ignoreDuplicates: true })
    .select("id");
  if (erreurEcriture) throw new Error(`Écriture des articles impossible : ${erreurEcriture.message}`);
  return data?.length ?? 0;
}

// Traduit en français les titres (et extraits) des actualités des 3 derniers jours qui ne
// le sont pas encore. Quota MyMemory atteint : le reste attend le passage suivant.
export async function traduireArticles(limite = 60): Promise<number> {
  const { data, error } = await admin()
    .from("articles")
    .select("id, titre, extrait_court, traductions")
    .eq("traductions", "{}")
    .gte("date_publication", new Date(Date.now() - 3 * 86_400_000).toISOString())
    .order("date_publication", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`Lecture des articles à traduire impossible : ${error.message}`);
  const lignes = data ?? [];
  if (lignes.length === 0) return 0;
  const traduits = await traduire(lignes.flatMap((l) => [l.titre, l.extrait_court ?? ""]), "fr");
  let total = 0;
  for (const l of lignes) {
    const titre = traduits.get(l.titre.trim());
    if (!titre) continue;
    const extrait = l.extrait_court ? traduits.get(l.extrait_court.trim()) ?? null : null;
    const { error: e } = await admin().from("articles").update({ traductions: { fr: { titre, extrait } } }).eq("id", l.id);
    if (!e) total++;
  }
  return total;
}
