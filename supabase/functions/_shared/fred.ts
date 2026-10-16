// Séries FRED (Fed de St. Louis) en CSV public, sans clé ni quota. En-tête User-Agent
// identifiant obligatoire en pratique (les agents génériques sont bloqués).
import { lireSecret } from "./supabase.ts";

export type Observation = [date: string, valeur: number];

let userAgent: string | null = null;
async function agent(): Promise<string> {
  userAgent ??= (await lireSecret("sec_user_agent")) ?? "Deepwater";
  return userAgent;
}

// `depuis` (AAAA-MM-JJ) limite le téléchargement aux observations récentes.
export async function lireSerieFred(serie: string, depuis?: string): Promise<Observation[]> {
  const url = new URL("https://fred.stlouisfed.org/graph/fredgraph.csv");
  url.searchParams.set("id", serie);
  if (depuis) url.searchParams.set("cosd", depuis);
  const reponse = await fetch(url, {
    headers: { "User-Agent": await agent(), Accept: "text/csv" },
    signal: AbortSignal.timeout(40_000),
  });
  if (!reponse.ok) throw new Error(`FRED ${serie} : HTTP ${reponse.status}`);
  const lignes = (await reponse.text()).trim().split(/\r?\n/);
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
  return observations;
}

// API FRED officielle (clé gratuite) : seulement pour le calendrier des publications.
export async function appelerApiFred<T>(chemin: string, parametres: Record<string, string>): Promise<T | null> {
  const cle = await lireSecret("fred_api_key");
  if (!cle) return null;
  const url = new URL(`https://api.stlouisfed.org/fred/${chemin}`);
  for (const [k, v] of Object.entries({ ...parametres, api_key: cle, file_type: "json" })) url.searchParams.set(k, v);
  const reponse = await fetch(url, { headers: { "User-Agent": await agent() }, signal: AbortSignal.timeout(30_000) });
  if (!reponse.ok) throw new Error(`API FRED ${chemin} : HTTP ${reponse.status}`);
  return await reponse.json() as T;
}
