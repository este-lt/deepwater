"use server";

import { revalidatePath } from "next/cache";
import { exigerAdmin } from "@/lib/profil";
import { supabaseUtilisateur } from "@/lib/supabase";

// Les écritures passent par le jeton de l'admin : la RLS (est_admin) fait foi,
// exigerAdmin() ne sert qu'à renvoyer un non-admin vers l'accueil.

export async function basculerMarche(formulaire: FormData): Promise<void> {
  await exigerAdmin();
  const id = String(formulaire.get("id") ?? "");
  const actif = formulaire.get("actif") === "true";
  if (!/^[0-9a-f-]{36}$/.test(id)) return;
  const supabase = await supabaseUtilisateur();
  const { error } = await supabase.from("tickers_suivis").update({ actif_bool: actif }).eq("id", id).eq("prioritaire", false);
  if (error) throw new Error(`Modification impossible : ${error.message}`);
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function basculerPremium(formulaire: FormData): Promise<void> {
  await exigerAdmin();
  const actif = formulaire.get("actif") === "true";
  const supabase = await supabaseUtilisateur();
  const { error } = await supabase.from("config_app").update({ valeur: actif }).eq("cle", "av_premium");
  if (error) throw new Error(`Modification impossible : ${error.message}`);
  revalidatePath("/admin");
}
