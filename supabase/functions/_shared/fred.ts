// Séries FRED (Fed de St. Louis) en CSV public, sans clé. En-tête User-Agent
// identifiant obligatoire en pratique (les agents génériques sont bloqués).
import { ecrireCache, lireCache } from "./cache.ts";
import { lireSecret } from "./supabase.ts";

export type Observation = [date: string, valeur: number];

const TTL_MS = 2 * 3600 * 1000;

export async function lireSerieFred(serie: string): Promise<{ observations: Observation[]; depuisCache: boolean }> {
  const cle = `fred:${serie}`;
  const enCache = await lireCache<{ observations: Observation[] }>(cle);
  if (enCache) return { observations: enCache.observations, depuisCache: true };

  const userAgent = (await lireSecret("sec_user_agent")) ?? "Deepwater";
  const reponse = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(serie)}`, {
    headers: { "User-Agent": userAgent, Accept: "text/csv" },
    signal: AbortSignal.timeout(40_000),
  });
  if (!reponse.ok) throw new Error(`FRED ${serie} : HTTP ${reponse.status}`);
  const texte = await reponse.text();
  const lignes = texte.trim().split(/\r?\n/);
  if (!lignes[0]?.toLowerCase().startsWith("observation_date")) {
    throw new Error(`FRED ${serie} : format inattendu (${lignes[0]?.slice(0, 60)})`);
  }

  const observations: Observation[] = [];
  for (const ligne of lignes.slice(1)) {
    const [date, brute] = ligne.split(",");
    const valeur = Number(brute);
    // "." ou vide = jour sans publication (férié) : ignoré, jamais remplacé par une valeur inventée.
    if (date && brute && brute !== "." && Number.isFinite(valeur)) observations.push([date, valeur]);
  }
  if (observations.length === 0) throw new Error(`FRED ${serie} : aucune observation exploitable.`);

  await ecrireCache(cle, "fred", { observations }, TTL_MS);
  return { observations, depuisCache: false };
}
