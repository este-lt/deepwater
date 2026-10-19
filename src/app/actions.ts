"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { appelerFonction } from "@/lib/fonctions";
import { langueValide, traducteur, type Traduire } from "@/lib/i18n";
import { lirePreferences } from "@/lib/preferences";
import { CLASSES } from "@/lib/sources";
import { supabaseUtilisateur } from "@/lib/supabase";
import { type Theme, themeValide } from "@/lib/theme";
import type { Json, ParametresRow } from "@/lib/types-supabase";
import { type Disposition, dispositionValide } from "@/lib/widgets";

// Toutes les écritures passent par le jeton Clerk de l'utilisateur : la RLS garantit
// que chacun ne modifie que ses propres paramètres et validations.

export interface Retour {
  ok: boolean;
  message: string;
  // Instant (UTC) à partir duquel un nouveau calcul manuel est possible.
  reessayerApres?: string;
}

async function utilisateur(): Promise<{ userId: string; t: Traduire }> {
  const { userId } = await auth();
  if (!userId) throw new Error("Session expirée, reconnectez-vous. / Session expired, please sign in again.");
  return { userId, t: traducteur((await lirePreferences()).langue) };
}

export async function calculerBiais(): Promise<Retour> {
  const { t } = await utilisateur();
  const supabase = await supabaseUtilisateur();
  // Limite : un calcul toutes les 5 minutes par utilisateur, 60 par heure au total.
  const { data, error } = await supabase.rpc("reserver_calcul_manuel");
  if (error) return { ok: false, message: `${t("Calcul refusé", "Calculation refused")} : ${error.message}` };
  const reservation = (data ?? {}) as { autorise?: boolean; reessayer_apres?: string };
  if (!reservation.autorise) {
    return {
      ok: false,
      message: t("Un calcul a déjà été demandé récemment (un toutes les 5 minutes par compte).", "A calculation was requested recently (one every 5 minutes per account)."),
      reessayerApres: reservation.reessayer_apres,
    };
  }
  const reponse = await appelerFonction<{ ok: boolean; message: string; details?: { bilan?: Record<string, string> } }>(
    "calcul-biais",
    { mode: "manuel" },
  );
  revalidatePath("/");
  if (!reponse.ok || !reponse.donnees?.ok) {
    return { ok: false, message: reponse.donnees?.message ?? `${t("Calcul en échec", "Calculation failed")} (HTTP ${reponse.statut}).` };
  }
  const bilan = Object.values(reponse.donnees.details?.bilan ?? {});
  const inchange = bilan.length > 0 && bilan.every((b) => b.includes("inchangé"));
  return {
    ok: true,
    message: inchange
      ? t("Aucune donnée nouvelle depuis le dernier calcul : biais inchangé.", "No new data since the last calculation: bias unchanged.")
      : t("Biais recalculé à partir des données en base.", "Bias recalculated from stored data."),
  };
}

export async function validerBiais(biaisId: string, decision: "valide" | "rejete", commentaire: string): Promise<Retour> {
  const { userId, t } = await utilisateur();
  if (!/^[0-9a-f-]{36}$/.test(biaisId) || (decision !== "valide" && decision !== "rejete")) {
    return { ok: false, message: t("Demande invalide.", "Invalid request.") };
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
  if (error) return { ok: false, message: `${t("Décision non enregistrée", "Decision not saved")} : ${error.message}` };
  revalidatePath("/");
  return { ok: true, message: decision === "valide" ? t("Biais validé.", "Bias accepted.") : t("Biais rejeté.", "Bias rejected.") };
}

// Langue, apparence, disposition du tableau de bord, classes d'actifs : propres à chaque utilisateur.
async function enregistrerParametres(
  champs: Partial<Pick<ParametresRow, "langue" | "theme" | "disposition" | "classes_affichees">>,
  chemin: "page" | "layout" = "layout",
): Promise<Retour> {
  const { userId, t } = await utilisateur();
  const supabase = await supabaseUtilisateur();
  const { error } = await supabase.from("parametres_utilisateur").update(champs).eq("clerk_user_id", userId);
  if (error) return { ok: false, message: `${t("Réglage non enregistré", "Setting not saved")} : ${error.message}` };
  revalidatePath("/", chemin);
  return { ok: true, message: t("Enregistré.", "Saved.") };
}

export async function choisirLangue(langue: string): Promise<Retour> {
  return enregistrerParametres({ langue: langueValide(langue) });
}

export async function choisirTheme(theme: Theme): Promise<Retour> {
  return enregistrerParametres({ theme: themeValide(theme) as unknown as Json });
}

export async function choisirDisposition(disposition: Disposition | null): Promise<Retour> {
  return enregistrerParametres({ disposition: (disposition === null ? {} : dispositionValide(disposition)) as unknown as Json }, "page");
}

export async function choisirClasses(classes: string[]): Promise<Retour> {
  const valides = CLASSES.map((c) => c.cle as string).filter((c) => classes.includes(c));
  return enregistrerParametres({ classes_affichees: valides }, "page");
}
