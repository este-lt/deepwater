import "server-only";
import { auth } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { cache } from "react";
import { type Langue, langueValide } from "./i18n";
import { CLASSES_PAR_DEFAUT } from "./sources";
import { supabaseUtilisateur } from "./supabase";
import { type Theme, THEME_DEFAUT, themeValide } from "./theme";
import { type Disposition, DISPOSITION_DEFAUT, dispositionValide } from "./widgets";

export interface Preferences {
  connecte: boolean;
  langue: Langue;
  theme: Theme;
  disposition: Disposition;
  classes: string[];
}

// Visiteur non connecté (pages de connexion) : langue du navigateur.
async function langueNavigateur(): Promise<Langue> {
  const accepte = (await headers()).get("accept-language") ?? "";
  return /^\s*fr\b/i.test(accepte) || !/^\s*en\b/i.test(accepte) ? "fr" : "en";
}

// Préférences de l'utilisateur connecté (RLS), lues une fois par requête.
export const lirePreferences = cache(async (): Promise<Preferences> => {
  const { userId } = await auth();
  if (!userId) {
    return { connecte: false, langue: await langueNavigateur(), theme: THEME_DEFAUT, disposition: DISPOSITION_DEFAUT, classes: CLASSES_PAR_DEFAUT };
  }
  const supabase = await supabaseUtilisateur();
  const { data } = await supabase
    .from("parametres_utilisateur")
    .select("langue, theme, disposition, classes_affichees")
    .maybeSingle();
  return {
    connecte: true,
    langue: langueValide(data?.langue),
    theme: themeValide(data?.theme),
    disposition: dispositionValide(data?.disposition),
    classes: data?.classes_affichees ?? CLASSES_PAR_DEFAUT,
  };
});
