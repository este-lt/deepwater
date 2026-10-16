import { Carte, Pastille } from "@/components/carte";
import { EnTete } from "@/components/en-tete";
import { DateLocale, Horodatage } from "@/components/horodatage";
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
  const supabase = await supabaseUtilisateur();

  const [taches, logs, cron, quota] = await Promise.all([
    supabase.from("taches_planifiees").select("*").order("nom_tache"),
    supabase.from("logs_taches").select("*").order("demarre_le", { ascending: false }).limit(60),
    supabase.rpc("admin_etat_cron"),
    supabase.from("quota_api").select("*").order("jour", { ascending: false }).limit(7),
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
      <main className="mx-auto flex max-w-[90rem] flex-col gap-5 px-4 py-6 sm:px-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Administration</h1>
          <p className="text-sm text-attenue">
            Surveillance des tâches programmées : une tâche sans réussite depuis plus longtemps que son délai
            d&apos;alerte est signalée.
          </p>
        </div>

        <Carte titre="Tâches programmées" sousTitre="pg_cron → Edge Functions">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="text-xs text-attenue">
                <tr>
                  <th className="pb-2 font-medium">Tâche</th>
                  <th className="pb-2 font-medium">Planification</th>
                  <th className="pb-2 font-medium">Dernier statut</th>
                  <th className="pb-2 font-medium">Dernière réussite</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bordure">
                {(taches.data ?? []).map((t) => {
                  const dernier = dernierStatut.get(t.nom_tache);
                  return (
                    <tr key={t.nom_tache}>
                      <td className="py-2.5 pr-3">
                        <div className="font-medium">{t.nom_tache}</div>
                        <div className="text-xs text-attenue">{t.description}</div>
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-xs text-attenue">{t.planification}</td>
                      <td className="py-2.5 pr-3">
                        <Pastille ton={tonStatut(dernier?.statut)}>{dernier?.statut ?? "jamais exécutée"}</Pastille>
                      </td>
                      <td className="py-2.5">
                        <Horodatage
                          iso={derniereReussite.get(t.nom_tache)}
                          source="logs_taches"
                          seuilHeures={intervalleEnHeures(t.delai_alerte)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Carte>

        <div className="grid gap-5 lg:grid-cols-2">
          <Carte titre="Jobs pg_cron" sousTitre="Dernière exécution de chaque job">
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
                      <Pastille ton={tonStatut(j.dernier_statut)}>{j.dernier_statut ?? "en attente"}</Pastille>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Carte>

          <Carte titre="Quota des API" sousTitre="Compteur quotidien (UTC)">
            <ul className="divide-y divide-bordure text-sm">
              {(quota.data ?? []).map((q) => (
                <li key={`${q.source}-${q.jour}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {q.source} · {q.jour}
                  </span>
                  <span className="chiffres flex items-center gap-2">
                    {q.appels} / {q.limite}
                    {q.bloque_jusqu_a && new Date(q.bloque_jusqu_a) > new Date() && (
                      <Pastille ton="alerte">bloqué</Pastille>
                    )}
                  </span>
                </li>
              ))}
              {(quota.data ?? []).length === 0 && <li className="py-2 text-attenue">Aucun appel enregistré.</li>}
            </ul>
          </Carte>
        </div>

        <Carte titre="Journal" sousTitre="60 dernières exécutions">
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
