import { SectionPremium } from "@/components/admin/section-premium";
import { Carte, Pastille } from "@/components/carte";
import { EnTete } from "@/components/en-tete";
import { DateLocale, Horodatage } from "@/components/horodatage";
import { traducteur } from "@/lib/i18n";
import { lirePreferences } from "@/lib/preferences";
import { exigerAdmin } from "@/lib/profil";
import { supabaseUtilisateur } from "@/lib/supabase";
import type { LogTacheRow } from "@/lib/types-supabase";

// Convertit un intervalle Postgres ("1 day 02:00:00", "06:00:00") en heures.
function intervalleEnHeures(intervalle: string): number {
  let heures = 0;
  const jours = intervalle.match(/(\d+)\s+days?/);
  if (jours) heures += Number(jours[1]) * 24;
  const hms = intervalle.match(/(\d+):(\d+):(\d+)/);
  if (hms) heures += Number(hms[1]) + Number(hms[2]) / 60;
  return heures;
}

function tonStatut(statut: string | null | undefined) {
  if (statut === "succes" || statut === "succeeded") return "hausse" as const;
  if (statut === "echec" || statut === "failed") return "baisse" as const;
  if (statut === "en_cours" || statut === "running") return "accent" as const;
  return "neutre" as const;
}

export default async function PageAdmin() {
  await exigerAdmin();
  const t = traducteur((await lirePreferences()).langue);
  const supabase = await supabaseUtilisateur();

  const [alertes, taches, logs, cron, quota, premium] = await Promise.all([
    supabase.from("alertes").select("*").order("ouverte_le", { ascending: false }).limit(15),
    supabase.from("taches_planifiees").select("*").order("nom_tache"),
    supabase.from("logs_taches").select("*").order("demarre_le", { ascending: false }).limit(60),
    supabase.rpc("admin_etat_cron"),
    supabase.from("quota_api").select("*").order("jour", { ascending: false }).limit(7),
    supabase.from("config_app").select("valeur").eq("cle", "av_premium").maybeSingle(),
  ]);

  const journaux = (logs.data ?? []) as LogTacheRow[];
  const derniereReussite = new Map<string, string>();
  const dernierStatut = new Map<string, LogTacheRow>();
  for (const l of journaux) {
    if (!dernierStatut.has(l.nom_tache)) dernierStatut.set(l.nom_tache, l);
    if (l.statut === "succes" && l.termine_le && !derniereReussite.has(l.nom_tache)) {
      derniereReussite.set(l.nom_tache, l.termine_le);
    }
  }

  return (
    <>
      <EnTete estAdmin />
      <main className="marges-securite mx-auto flex max-w-[90rem] flex-col gap-5 px-4 py-6 sm:px-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("Administration", "Administration")}</h1>
          <p className="text-sm text-attenue">
            {t(
              "Surveillance des tâches programmées : une tâche sans réussite depuis plus longtemps que son délai d'alerte est signalée.",
              "Scheduled job monitoring: a job without success for longer than its alert delay is flagged.",
            )}
          </p>
        </div>

        <Carte
          titre={t("Alertes de fonctionnement", "Operational alerts")}
          sousTitre={t(
            "Tâche sans réussite depuis son délai d'alerte, ou en échec deux fois de suite. Contrôle toutes les 10 minutes ; notification par webhook si « alerte_webhook_url » est rangé dans le Vault.",
            "Job without success beyond its alert delay, or failing twice in a row. Checked every 10 minutes; webhook notification if “alerte_webhook_url” is stored in the Vault.",
          )}
        >
          {(alertes.data ?? []).length === 0 ? (
            <p className="text-sm text-hausse">{t("Aucune alerte : toutes les tâches actives fonctionnent.", "No alert: all active jobs are running.")}</p>
          ) : (
            <ul className="divide-y divide-bordure text-sm">
              {(alertes.data ?? []).map((a) => (
                <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="font-medium">{a.nom_tache}</span>
                    <span className="block text-xs text-attenue">{a.message}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1 text-xs text-attenue">
                    <Pastille ton={a.resolue_le ? "hausse" : "baisse"}>
                      {a.resolue_le ? t("Refermée", "Resolved") : a.motif === "retard" ? t("En retard", "Late") : t("Échecs répétés", "Repeated failures")}
                    </Pastille>
                    <DateLocale iso={a.resolue_le ?? a.ouverte_le} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Carte>

        <SectionPremium premium={premium.data?.valeur === true} t={t} />

        <Carte titre={t("Tâches programmées", "Scheduled jobs")} sousTitre="pg_cron → Edge Functions">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="text-xs text-attenue">
                <tr>
                  <th className="pb-2 font-medium">{t("Tâche", "Job")}</th>
                  <th className="pb-2 font-medium">{t("Planification", "Schedule")}</th>
                  <th className="pb-2 font-medium">{t("Dernier statut", "Last status")}</th>
                  <th className="pb-2 font-medium">{t("Dernière réussite", "Last success")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bordure">
                {(taches.data ?? []).map((tache) => {
                  const dernier = dernierStatut.get(tache.nom_tache);
                  return (
                    <tr key={tache.nom_tache}>
                      <td className="py-2.5 pr-3">
                        <div className="font-medium">{tache.nom_tache}</div>
                        <div className="text-xs text-attenue">{tache.description}</div>
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-xs text-attenue">{tache.planification}</td>
                      <td className="py-2.5 pr-3">
                        <Pastille ton={tonStatut(dernier?.statut)}>{dernier?.statut ?? t("jamais exécutée", "never run")}</Pastille>
                      </td>
                      <td className="py-2.5">
                        {tache.actif ? (
                          <Horodatage
                            iso={derniereReussite.get(tache.nom_tache)}
                            source="logs_taches"
                            seuilHeures={intervalleEnHeures(tache.delai_alerte)}
                          />
                        ) : (
                          <span className="text-xs text-discret">{t("En pause (aucun utilisateur ne l'a activée), pas d'alerte de retard", "Paused (no user turned it on), no delay alert")}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Carte>

        <div className="grid gap-5 lg:grid-cols-2">
          <Carte titre={t("Jobs pg_cron", "pg_cron jobs")} sousTitre={t("Dernière exécution de chaque job", "Last run of each job")}>
            {cron.error ? (
              <p className="text-sm text-baisse">{cron.error.message}</p>
            ) : (
              <ul className="divide-y divide-bordure text-sm">
                {(cron.data ?? []).map((j) => (
                  <li key={j.nom} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <span className="font-medium">{j.nom}</span>{" "}
                      <span className="font-mono text-xs text-attenue">{j.planification}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {j.dernier_depart && (
                        <span className="text-xs text-attenue">
                          <DateLocale iso={j.dernier_depart} />
                        </span>
                      )}
                      <Pastille ton={tonStatut(j.dernier_statut)}>{j.dernier_statut ?? t("en attente", "pending")}</Pastille>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Carte>

          <Carte titre={t("Quota des API", "API quota")} sousTitre={t("Compteur quotidien (UTC)", "Daily counter (UTC)")}>
            <ul className="divide-y divide-bordure text-sm">
              {(quota.data ?? []).map((q) => (
                <li key={`${q.source}-${q.jour}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {q.source} · {q.jour}
                  </span>
                  <span className="chiffres flex items-center gap-2">
                    {q.appels} / {q.limite}
                    {q.bloque_jusqu_a && new Date(q.bloque_jusqu_a) > new Date() && (
                      <Pastille ton="alerte">{t("bloqué", "blocked")}</Pastille>
                    )}
                  </span>
                </li>
              ))}
              {(quota.data ?? []).length === 0 && <li className="py-2 text-attenue">{t("Aucun appel enregistré.", "No call recorded.")}</li>}
            </ul>
          </Carte>
        </div>

        <Carte titre={t("Journal", "Log")} sousTitre={t("60 dernières exécutions", "Last 60 runs")}>
          <ul className="divide-y divide-bordure text-sm">
            {journaux.map((l) => (
              <li key={l.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-start sm:gap-4">
                <span className="w-40 shrink-0 text-xs text-attenue">
                  <DateLocale iso={l.demarre_le} />
                </span>
                <span className="w-36 shrink-0 font-medium">{l.nom_tache}</span>
                <span className="shrink-0">
                  <Pastille ton={tonStatut(l.statut)}>{l.statut}</Pastille>
                </span>
                <span className="min-w-0 break-words text-attenue">{l.message}</span>
              </li>
            ))}
          </ul>
        </Carte>
      </main>
    </>
  );
}
