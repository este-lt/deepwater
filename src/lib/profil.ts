import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { cache } from "react";
import { appelerFonction } from "./fonctions";
import { supabaseUtilisateur } from "./supabase";

export interface Profil {
  clerk_user_id: string;
  email: string | null;
  role: "utilisateur" | "admin";
  source_creation: "webhook" | "secours";
  cree_le: string;
}

export type EtatProfil =
  | { etat: "ok"; profil: Profil }
  | { etat: "erreur"; message: string };

const COLONNES = "clerk_user_id, email, role, source_creation, cree_le";

// Lit le profil via RLS ; s'il manque (webhook en échec ou en retard), le crée
// par la fonction de secours. Mis en cache pour la durée d'une requête.
export const assurerProfil = cache(async (): Promise<EtatProfil> => {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const supabase = await supabaseUtilisateur();
  const lecture = await supabase.from("profils").select(COLONNES).maybeSingle();
  if (lecture.error) {
    return { etat: "erreur", message: `Lecture du profil refusée par Supabase : ${lecture.error.message}` };
  }
  if (lecture.data) return { etat: "ok", profil: lecture.data as Profil };

  const utilisateur = await currentUser();
  const email = utilisateur?.primaryEmailAddress;
  const secours = await appelerFonction("profil-secours", {
    clerk_user_id: userId,
    email: email?.emailAddress ?? null,
    email_verifie: email?.verification?.status === "verified",
  });
  if (!secours.ok) {
    return { etat: "erreur", message: `Création du profil impossible (HTTP ${secours.statut}).` };
  }

  const relecture = await supabase.from("profils").select(COLONNES).maybeSingle();
  if (relecture.error || !relecture.data) {
    return { etat: "erreur", message: "Profil créé mais illisible : vérifier la configuration RLS." };
  }
  return { etat: "ok", profil: relecture.data as Profil };
});

export async function exigerAdmin(): Promise<Profil> {
  const resultat = await assurerProfil();
  if (resultat.etat !== "ok" || resultat.profil.role !== "admin") redirect("/");
  return resultat.profil;
}
