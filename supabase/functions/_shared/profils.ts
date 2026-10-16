// Création idempotente des profils (upsert sur clerk_user_id) : utilisée par le
// webhook Clerk et par la création de secours à la première connexion.
import { admin, estEmailAdmin } from "./supabase.ts";

export interface ProfilEntrant {
  clerkUserId: string;
  email: string | null;
  emailVerifie: boolean;
}

export async function enregistrerProfil(
  profil: ProfilEntrant,
  source: "webhook" | "secours",
): Promise<{ clerk_user_id: string; role: string; source_creation: string } | null> {
  if (!/^user_[A-Za-z0-9]+$/.test(profil.clerkUserId)) {
    throw new Error("Identifiant Clerk invalide.");
  }
  const role = profil.emailVerifie && (await estEmailAdmin(profil.email)) ? "admin" : "utilisateur";

  // Webhook : fait foi, met à jour email et rôle (rejeu sans effet de bord).
  // Secours : ne crée que si absent, n'écrase jamais un profil existant.
  const ligne: Record<string, string | null> = { clerk_user_id: profil.clerkUserId, email: profil.email, role };
  if (source === "secours") ligne.source_creation = "secours";

  const { error } = await admin()
    .from("profils")
    .upsert(ligne, { onConflict: "clerk_user_id", ignoreDuplicates: source === "secours" });
  if (error) throw new Error(`Enregistrement du profil impossible : ${error.message}`);

  const { error: erreurParametres } = await admin()
    .from("parametres_utilisateur")
    .upsert({ clerk_user_id: profil.clerkUserId }, { onConflict: "clerk_user_id", ignoreDuplicates: true });
  if (erreurParametres) {
    throw new Error(`Création des paramètres impossible : ${erreurParametres.message}`);
  }

  const { data, error: erreurLecture } = await admin()
    .from("profils")
    .select("clerk_user_id, role, source_creation")
    .eq("clerk_user_id", profil.clerkUserId)
    .maybeSingle();
  if (erreurLecture) throw new Error(`Relecture du profil impossible : ${erreurLecture.message}`);
  return data;
}

export async function supprimerProfil(clerkUserId: string): Promise<void> {
  const { error } = await admin().from("profils").delete().eq("clerk_user_id", clerkUserId);
  if (error) throw new Error(`Suppression du profil impossible : ${error.message}`);
}
