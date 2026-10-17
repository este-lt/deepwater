// Client Alpha Vantage avec cache, compteur de quota et détection des réponses
// "Note" / "Information" renvoyées avec un code 200 (limite atteinte ou endpoint
// payant) : elles ne sont jamais mises en cache comme des données valides.
import { ecrireCache, lireCache, prochainMinuitUtc } from "./cache.ts";
import type { BarreQuotidienne } from "./prix.ts";
import { admin, lireSecret } from "./supabase.ts";

export type ResultatAV =
  | { statut: "ok"; donnees: Record<string, unknown>; depuisCache: boolean }
  | { statut: "quota_local"; message: string }
  | { statut: "rafale"; message: string }
  | { statut: "limite_av"; message: string }
  | { statut: "premium"; message: string }
  | { statut: "erreur"; message: string };

// Vrai si la réponse vient d'Alpha Vantage (et non du cache ou du quota local) :
// le collecteur doit alors respecter la pause entre deux requêtes.
export function aInterrogeAlphaVantage(r: ResultatAV): boolean {
  return !(r.statut === "ok" && r.depuisCache) && r.statut !== "quota_local";
}

const SOURCE = "alpha_vantage";

export function cleRequete(parametres: Record<string, string>): string {
  const tries = Object.keys(parametres).sort().map((k) => `${k}=${parametres[k]}`);
  return `av:${tries.join("&")}`;
}

async function limiteQuotidienne(): Promise<number> {
  const { data } = await admin().from("config_app").select("valeur").eq("cle", "av_limite_quotidienne").maybeSingle();
  const valeur = Number(data?.valeur);
  return Number.isFinite(valeur) && valeur > 0 ? valeur : 25;
}

// Classe un message Alpha Vantage. Les trois textes réels citent tous les offres
// payantes ("premium plans", "requests per minute", "25 requests per day"), d'où
// un ordre de tests précis :
//  1. accès refusé à un endpoint payant -> "premium" (inutile de réessayer) ;
//  2. rafale (> 1 requête/seconde)     -> "rafale" (réessayer dans quelques minutes) ;
//  3. limite quotidienne / fréquence   -> "limite_av" (bloquer jusqu'à minuit UTC).
export function classerMessage(message: string): "rafale" | "limite_av" | "premium" {
  const m = message.toLowerCase();
  if (/not yet entitled|this is a premium endpoint|premium endpoint/.test(m)) return "premium";
  if (/spreading out|burst/.test(m)) return "rafale";
  if (/rate limit|requests per day|call frequency|calls per/.test(m)) return "limite_av";
  return /premium|subscribe/.test(m) ? "premium" : "limite_av";
}

export async function appelerAlphaVantage(
  parametres: Record<string, string>,
  options: { priorite: number; ttlMs: number },
): Promise<ResultatAV> {
  const cle = cleRequete(parametres);
  const enCache = await lireCache<Record<string, unknown>>(cle);
  if (enCache) return { statut: "ok", donnees: enCache, depuisCache: true };

  const apikey = await lireSecret("alpha_vantage_api_key");
  if (!apikey) return { statut: "erreur", message: "Clé Alpha Vantage absente du Vault." };

  const autorise = await admin().rpc("reserver_appel_api", {
    p_source: SOURCE,
    p_priorite: options.priorite,
    p_limite: await limiteQuotidienne(),
  });
  if (autorise.error) return { statut: "erreur", message: `Quota illisible : ${autorise.error.message}` };
  if (autorise.data !== true) {
    return { statut: "quota_local", message: "Quota quotidien réservé aux priorités supérieures ou épuisé." };
  }

  const url = new URL("https://www.alphavantage.co/query");
  for (const [k, v] of Object.entries(parametres)) url.searchParams.set(k, v);
  url.searchParams.set("apikey", apikey);

  let corps: Record<string, unknown>;
  try {
    const reponse = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!reponse.ok) return { statut: "erreur", message: `HTTP ${reponse.status}` };
    corps = await reponse.json();
  } catch (erreur) {
    return { statut: "erreur", message: `Réseau : ${erreur instanceof Error ? erreur.message : String(erreur)}` };
  }

  const avis = (corps["Note"] ?? corps["Information"]) as string | undefined;
  if (typeof avis === "string") {
    const type = classerMessage(avis);
    // Seule la limite quotidienne bloque la journée ; une rafale se résorbe seule.
    if (type === "limite_av") {
      await admin().rpc("bloquer_quota_api", {
        p_source: SOURCE,
        p_jusqu_a: prochainMinuitUtc().toISOString(),
        p_message: avis.slice(0, 500),
      });
    }
    return { statut: type, message: avis.slice(0, 300) };
  }
  if (typeof corps["Error Message"] === "string") {
    return { statut: "erreur", message: String(corps["Error Message"]).slice(0, 300) };
  }
  if (Object.keys(corps).length === 0) return { statut: "erreur", message: "Réponse vide." };

  await ecrireCache(cle, SOURCE, corps, options.ttlMs);
  return { statut: "ok", donnees: corps, depuisCache: false };
}

const nombre = (v: unknown): number | null => {
  const n = Number(v);
  return v === undefined || v === null || v === "" || v === "." || !Number.isFinite(n) ? null : n;
};

// Séries économiques et matières premières : { name, unit, data: [{ date, value }] }.
// Les valeurs "." (jour sans publication) sont ignorées, jamais remplacées.
export function extraireSerieData(donnees: Record<string, unknown>): { unite: string | null; points: { date: string; valeur: number }[] } {
  const brute = donnees["data"] as Array<{ date?: string; value?: string }> | undefined;
  const points: { date: string; valeur: number }[] = [];
  for (const p of brute ?? []) {
    const valeur = nombre(p.value);
    if (p.date && valeur !== null) points.push({ date: p.date.slice(0, 10), valeur });
  }
  points.sort((a, b) => a.date.localeCompare(b.date));
  return { unite: typeof donnees["unit"] === "string" ? donnees["unit"] as string : null, points };
}

// Séries "Time Series ..." (FX_DAILY, TIME_SERIES_DAILY, INDEX_DATA).
export function extraireSerieQuotidienne(donnees: Record<string, unknown>): BarreQuotidienne[] {
  const cleSerie = Object.keys(donnees).find((k) => k.startsWith("Time Series"));
  const brute = (cleSerie ? donnees[cleSerie] : donnees["data"]) as
    | Record<string, Record<string, string>>
    | Array<Record<string, string>>
    | undefined;
  if (!brute) return [];
  const lignes: Array<[string, Record<string, string>]> = Array.isArray(brute)
    ? brute.map((l) => [l.date ?? l.timestamp, l])
    : Object.entries(brute);
  const barres: BarreQuotidienne[] = [];
  for (const [date, l] of lignes) {
    const cloture = nombre(l["4. close"] ?? l.close);
    if (!date || cloture === null) continue;
    barres.push({
      date: date.slice(0, 10),
      ouverture: nombre(l["1. open"] ?? l.open),
      plus_haut: nombre(l["2. high"] ?? l.high),
      plus_bas: nombre(l["3. low"] ?? l.low),
      cloture,
      volume: nombre(l["5. volume"] ?? l.volume),
    });
  }
  return barres.sort((a, b) => a.date.localeCompare(b.date));
}
