// Point d'entrée commun des tâches internes : appelées par pg_cron (pg_net) ou
// par le serveur Next.js, jamais par le navigateur. Protégées par le secret
// partagé x-deepwater-secret (stocké dans Supabase Vault).
import { egaliteConstante, json } from "./http.ts";
import { lireSecret } from "./supabase.ts";

export type Gestionnaire = (corps: Record<string, unknown>) => Promise<Response>;

export function servirTacheProtegee(gestionnaire: Gestionnaire): void {
  Deno.serve(async (req) => {
    if (req.method !== "POST") return json({ erreur: "Méthode non autorisée." }, 405);

    let attendu: string | null;
    try {
      attendu = await lireSecret("secret_fonctions");
    } catch (erreur) {
      console.error(erreur);
      return json({ erreur: "Configuration indisponible." }, 500);
    }
    const fourni = req.headers.get("x-deepwater-secret") ?? "";
    if (!attendu || !egaliteConstante(fourni, attendu)) {
      return json({ erreur: "Non autorisé." }, 401);
    }

    const corps = await req.json().catch(() => ({})) as Record<string, unknown>;
    return gestionnaire(corps);
  });
}
