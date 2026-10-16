import "server-only";
import { env } from "./env";

// Appel serveur -> Edge Function interne, authentifié par le secret partagé.
export async function appelerFonction<T = unknown>(
  nom: string,
  corps: Record<string, unknown>,
): Promise<{ ok: boolean; statut: number; donnees: T | null }> {
  const reponse = await fetch(`${env.supabaseUrl}/functions/v1/${nom}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-deepwater-secret": env.secretFonctions,
    },
    body: JSON.stringify(corps),
    cache: "no-store",
  });
  const donnees = (await reponse.json().catch(() => null)) as T | null;
  return { ok: reponse.ok, statut: reponse.status, donnees };
}
