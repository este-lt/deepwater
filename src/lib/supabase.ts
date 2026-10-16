import "server-only";
import { auth } from "@clerk/nextjs/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";
import type { Database } from "./types-supabase";

export type ClientSupabase = SupabaseClient<Database>;

// Client lié à l'utilisateur connecté : chaque requête porte son jeton de session
// Clerk, et Postgres applique les politiques RLS (third-party auth Supabase).
export async function supabaseUtilisateur(): Promise<ClientSupabase> {
  const { getToken } = await auth();
  return createClient<Database>(env.supabaseUrl, env.supabaseClePubliable, {
    accessToken: async () => (await getToken()) ?? null,
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Client anonyme : uniquement pour les fonctions explicitement ouvertes (santé).
export function supabaseAnonyme(): ClientSupabase {
  return createClient<Database>(env.supabaseUrl, env.supabaseClePubliable, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
