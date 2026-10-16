// Journal des tâches (table logs_taches) : chaque exécution écrit son début,
// sa fin et son statut, pour qu'un arrêt silencieux soit visible en page admin.
import { admin } from "./supabase.ts";

export interface ResultatTache {
  message: string;
  details?: Record<string, unknown>;
}

export async function executerTache(
  nomTache: string,
  travail: () => Promise<ResultatTache>,
): Promise<{ ok: boolean; message: string; details?: Record<string, unknown> }> {
  const { data: ligne, error: erreurDebut } = await admin()
    .from("logs_taches")
    .insert({ nom_tache: nomTache, statut: "en_cours" })
    .select("id")
    .single();
  if (erreurDebut) console.error(`[${nomTache}] journal indisponible : ${erreurDebut.message}`);

  try {
    const resultat = await travail();
    if (ligne) {
      await admin()
        .from("logs_taches")
        .update({
          statut: "succes",
          termine_le: new Date().toISOString(),
          message: resultat.message.slice(0, 2000),
          details: resultat.details ?? null,
        })
        .eq("id", ligne.id);
    }
    return { ok: true, ...resultat };
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : String(erreur);
    console.error(`[${nomTache}] échec : ${message}`);
    if (ligne) {
      await admin()
        .from("logs_taches")
        .update({ statut: "echec", termine_le: new Date().toISOString(), message: message.slice(0, 2000) })
        .eq("id", ligne.id);
    }
    return { ok: false, message };
  }
}

export async function journaliserEvenement(
  nomTache: string,
  statut: "succes" | "echec",
  message: string,
  details?: Record<string, unknown>,
): Promise<void> {
  const maintenant = new Date().toISOString();
  const { error } = await admin().from("logs_taches").insert({
    nom_tache: nomTache,
    statut,
    demarre_le: maintenant,
    termine_le: maintenant,
    message: message.slice(0, 2000),
    details: details ?? null,
  });
  if (error) console.error(`[${nomTache}] journal indisponible : ${error.message}`);
}
