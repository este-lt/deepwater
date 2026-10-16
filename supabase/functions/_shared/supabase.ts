// Client service role et accès aux secrets (Vault). Code exécuté uniquement
// dans les Edge Functions : la clé service role n'existe jamais côté navigateur.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.117.3";

let client: SupabaseClient | null = null;

export function admin(): SupabaseClient {
  if (!client) {
    const url = Deno.env.get("SUPABASE_URL");
    const cle = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !cle) {
      throw new Error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY absent de l'environnement.");
    }
    client = createClient(url, cle, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

const SECRETS_TTL_MS = 5 * 60 * 1000;
const secrets = new Map<string, { valeur: string | null; lu_le: number }>();

export async function lireSecret(nom: string): Promise<string | null> {
  const enCache = secrets.get(nom);
  if (enCache && Date.now() - enCache.lu_le < SECRETS_TTL_MS) return enCache.valeur;
  const { data, error } = await admin().rpc("lire_secret", { p_nom: nom });
  if (error) throw new Error(`Lecture du secret « ${nom} » impossible : ${error.message}`);
  const valeur = typeof data === "string" && data.length > 0 ? data : null;
  secrets.set(nom, { valeur, lu_le: Date.now() });
  return valeur;
}

export async function estEmailAdmin(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const liste = (await lireSecret("admin_emails")) ?? "";
  return liste
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.trim().toLowerCase());
}
