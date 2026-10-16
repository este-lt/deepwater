// Cours crypto du moment (API publique CoinGecko, gratuite, sans clé) : un seul appel
// pour tous les actifs. L'historique quotidien vient de FRED (clôtures Coinbase).

export interface CoursCrypto {
  prix: number;
  majLe: Date;
}

export async function lireCoursCrypto(ids: string[]): Promise<Map<string, CoursCrypto>> {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd&include_last_updated_at=true`;
  const reponse = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  if (!reponse.ok) throw new Error(`CoinGecko : HTTP ${reponse.status}`);
  const corps = await reponse.json() as Record<string, { usd?: number; last_updated_at?: number }>;
  const cours = new Map<string, CoursCrypto>();
  for (const id of ids) {
    const c = corps[id];
    if (typeof c?.usd === "number" && c.usd > 0 && typeof c.last_updated_at === "number") {
      cours.set(id, { prix: c.usd, majLe: new Date(c.last_updated_at * 1000) });
    }
  }
  return cours;
}
