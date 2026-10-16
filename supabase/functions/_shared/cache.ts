// Cache des réponses d'API (table cache_api) : toute requête externe passe
// d'abord par ici. Seules les réponses valides y sont écrites.
import { admin } from "./supabase.ts";

export async function lireCache<T = unknown>(cle: string): Promise<T | null> {
  const { data, error } = await admin()
    .from("cache_api")
    .select("reponse_json, expire_le")
    .eq("cle_requete", cle)
    .gt("expire_le", new Date().toISOString())
    .maybeSingle();
  if (error) throw new Error(`Lecture du cache impossible (${cle}) : ${error.message}`);
  return (data?.reponse_json as T | undefined) ?? null;
}

export async function ecrireCache(cle: string, source: string, reponse: unknown, ttlMs: number): Promise<void> {
  const { error } = await admin().from("cache_api").upsert(
    {
      cle_requete: cle,
      source,
      reponse_json: reponse,
      expire_le: new Date(Date.now() + ttlMs).toISOString(),
      cree_le: new Date().toISOString(),
    },
    { onConflict: "cle_requete" },
  );
  if (error) throw new Error(`Écriture du cache impossible (${cle}) : ${error.message}`);
}

// Intervalle Postgres ("1 day", "2 days 06:00:00", "20:00:00") en millisecondes.
export function intervalleEnMs(intervalle: string): number {
  let ms = 0;
  const jours = intervalle.match(/(\d+)\s+days?/);
  if (jours) ms += Number(jours[1]) * 86_400_000;
  const hms = intervalle.match(/(\d+):(\d+):(\d+)/);
  if (hms) ms += (Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3])) * 1000;
  return ms;
}

// Prochain minuit UTC (+ marge) : remise à zéro du quota quotidien.
export function prochainMinuitUtc(margeMinutes = 10): Date {
  const d = new Date();
  d.setUTCHours(24, margeMinutes, 0, 0);
  return d;
}
