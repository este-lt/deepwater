"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { appelerFonction } from "@/lib/fonctions";
import { supabaseUtilisateur } from "@/lib/supabase";

// Toutes les écritures passent par le jeton Clerk de l'utilisateur : la RLS garantit
// que chacun ne modifie que ses propres paramètres et validations.

export interface Retour {
  ok: boolean;
  message: string;
  // Instant (UTC) à partir duquel un nouveau calcul manuel est possible.
  reessayerApres?: string;
}

async function utilisateur(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new Error("Session expirée, reconnectez-vous.");
  return userId;
}

export async function basculerBiaisAuto(actif: boolean): Promise<Retour> {
  const userId = await utilisateur();
  const supabase = await supabaseUtilisateur();
  const { error } = await supabase
    .from("parametres_utilisateur")
    .update({ biais_auto_actif: actif === true })
    .eq("clerk_user_id", userId);
  if (error) return { ok: false, message: `Réglage non enregistré : ${error.message}` };
  revalidatePath("/");
  return {
    ok: true,
    message: actif
      ? "Calcul automatique activé : chaque jour ouvré à 8 h 30, heure de New York."
      : "Calcul automatique coupé pour votre compte.",
  };
}

export async function calculerBiais(): Promise<Retour> {
  await utilisateur();
  const supabase = await supabaseUtilisateur();
  // Limite : un calcul toutes les 5 minutes par utilisateur, 60 par heure au total.
  const { data, error } = await supabase.rpc("reserver_calcul_manuel");
  if (error) return { ok: false, message: `Calcul refusé : ${error.message}` };
  const reservation = (data ?? {}) as { autorise?: boolean; reessayer_apres?: string };
  if (!reservation.autorise) {
    return {
      ok: false,
      message: "Un calcul a déjà été demandé récemment (un toutes les 5 minutes par compte).",
      reessayerApres: reservation.reessayer_apres,
    };
  }
  const reponse = await appelerFonction<{ ok: boolean; message: string; details?: { bilan?: Record<string, string> } }>(
    "calcul-biais",
    { mode: "manuel" },
  );
  revalidatePath("/");
  if (!reponse.ok || !reponse.donnees?.ok) {
    return { ok: false, message: reponse.donnees?.message ?? `Calcul en échec (HTTP ${reponse.statut}).` };
  }
  const bilan = Object.values(reponse.donnees.details?.bilan ?? {});
  const inchange = bilan.length > 0 && bilan.every((b) => b.includes("inchangé"));
  return {
    ok: true,
    message: inchange
      ? "Aucune donnée nouvelle depuis le dernier calcul : biais inchangé."
      : "Biais recalculé à partir des données en base.",
  };
}

export async function validerBiais(biaisId: string, decision: "valide" | "rejete", commentaire: string): Promise<Retour> {
  const userId = await utilisateur();
  if (!/^[0-9a-f-]{36}$/.test(biaisId) || (decision !== "valide" && decision !== "rejete")) {
    return { ok: false, message: "Demande invalide." };
  }
  const texte = commentaire.trim().slice(0, 1000);
  const supabase = await supabaseUtilisateur();
  const { error } = await supabase.from("validations_biais").upsert(
    {
      biais_id: biaisId,
      clerk_user_id: userId,
      decision,
      commentaire: texte || null,
      cree_le: new Date().toISOString(),
    },
    { onConflict: "biais_id,clerk_user_id" },
  );
  if (error) return { ok: false, message: `Décision non enregistrée : ${error.message}` };
  revalidatePath("/");
  return { ok: true, message: decision === "valide" ? "Biais validé." : "Biais rejeté." };
}
