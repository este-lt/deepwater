// Collecteur Alpha Vantage : traite la file collectes_planifiees par priorité.
// Un seul collecteur réclame les lignes (verrou skip locked) : une donnée demandée
// par plusieurs utilisateurs ne déclenche qu'un appel réel. Les utilisateurs ne
// déclenchent jamais d'appel : ils lisent la base.
import { aInterrogeAlphaVantage, appelerAlphaVantage } from "../_shared/alpha-vantage.ts";
import { intervalleEnMs, prochainMinuitUtc } from "../_shared/cache.ts";
import { servirTacheProtegee } from "../_shared/garde.ts";
import { attendre, json } from "../_shared/http.ts";
import { executerTache } from "../_shared/journal.ts";
import { admin } from "../_shared/supabase.ts";
import { CIBLES, type Collecte } from "./cibles.ts";

// Plan gratuit : 5 requêtes/minute max -> 15 s entre deux appels réels, 4 par passage.
const MAX_PAR_PASSAGE = 4;
const PAUSE_ENTRE_APPELS_MS = 15_000;

async function terminer(collecte: Collecte, champs: Record<string, unknown>): Promise<void> {
  const { error } = await admin()
    .from("collectes_planifiees")
    .update({ ...champs, derniere_execution: new Date().toISOString(), verrou_jusqu_a: null })
    .eq("id", collecte.id);
  if (error) console.error(`Mise à jour de la collecte ${collecte.cle} impossible : ${error.message}`);
}

servirTacheProtegee(async () => {
  const resultat = await executerTache("collecte-av", async () => {
    const { data, error } = await admin().rpc("reclamer_collectes", { p_source: "alpha_vantage", p_max: MAX_PAR_PASSAGE });
    if (error) throw new Error(`Lecture de la file impossible : ${error.message}`);
    const collectes = (data ?? []) as Collecte[];
    if (collectes.length === 0) return { message: "Aucune collecte à échéance." };

    const bilan: Record<string, string> = {};
    let appelsReels = 0;
    for (const collecte of collectes) {
      const { cible, ...parametres } = collecte.parametres as Record<string, string>;
      if (appelsReels > 0) await attendre(PAUSE_ENTRE_APPELS_MS);
      const reponse = await appelerAlphaVantage(parametres, {
        priorite: collecte.priorite,
        ttlMs: intervalleEnMs(collecte.ttl_cache),
      });
      if (aInterrogeAlphaVantage(reponse)) appelsReels++;

      switch (reponse.statut) {
        case "ok": {
          try {
            const traitement = CIBLES[cible];
            if (!traitement) throw new Error(`Cible inconnue : ${cible}`);
            const message = await traitement(collecte, reponse.donnees);
            await terminer(collecte, {
              dernier_statut: "succes",
              dernier_message: `${message}${reponse.depuisCache ? " (cache)" : ""}`,
              derniere_reussite: new Date().toISOString(),
              prochaine_execution: new Date(Date.now() + intervalleEnMs(collecte.intervalle)).toISOString(),
            });
            bilan[collecte.cle] = `ok : ${message}${reponse.depuisCache ? " (cache)" : ""}`;
          } catch (erreur) {
            const message = erreur instanceof Error ? erreur.message : String(erreur);
            await terminer(collecte, {
              dernier_statut: "echec",
              dernier_message: message,
              prochaine_execution: new Date(Date.now() + 3600_000).toISOString(),
            });
            bilan[collecte.cle] = `échec traitement : ${message}`;
          }
          break;
        }
        case "rafale":
          await terminer(collecte, {
            dernier_statut: "reporte",
            dernier_message: `Trop de requêtes rapprochées, nouvel essai dans 15 min : ${reponse.message}`,
            prochaine_execution: new Date(Date.now() + 15 * 60_000).toISOString(),
          });
          bilan[collecte.cle] = "reporté de 15 min (rafale)";
          break;
        case "quota_local":
        case "limite_av":
          await terminer(collecte, {
            dernier_statut: "reporte",
            dernier_message: reponse.message,
            prochaine_execution: prochainMinuitUtc(10 + collecte.priorite * 5).toISOString(),
          });
          bilan[collecte.cle] = `reporté : ${reponse.message}`;
          break;
        case "premium":
          // Endpoint payant : signalé "indisponible", nouvel essai dans une semaine.
          await terminer(collecte, {
            dernier_statut: "indisponible",
            dernier_message: `Endpoint payant : ${reponse.message}`,
            prochaine_execution: new Date(Date.now() + 7 * 86_400_000).toISOString(),
          });
          bilan[collecte.cle] = "indisponible (endpoint payant)";
          break;
        case "erreur":
          await terminer(collecte, {
            dernier_statut: "echec",
            dernier_message: reponse.message,
            prochaine_execution: new Date(Date.now() + 3600_000).toISOString(),
          });
          bilan[collecte.cle] = `échec : ${reponse.message}`;
          break;
      }
    }
    const resume = Object.entries(bilan).map(([c, b]) => `${c} → ${b}`).join(" | ");
    return { message: `${collectes.length} collecte(s), ${appelsReels} appel(s) réel(s) : ${resume}`, details: bilan };
  });
  return json(resultat, resultat.ok ? 200 : 500);
});
