import { Carte, Pastille } from "@/components/carte";
import { CarteBiais } from "@/components/biais/carte-biais";
import { CommandesBiais } from "@/components/biais/commandes-biais";
import type { EtatBiais } from "@/lib/biais";
import { formaterDateSeance } from "@/lib/format";
import { type Langue, traducteur } from "@/lib/i18n";

const TONS = { haussier: "hausse", baissier: "baisse", neutre: "neutre" } as const;
const COURT = { haussier: ["Haussier", "Bullish"], baissier: ["Baissier", "Bearish"], neutre: ["Neutre", "Neutral"] } as const;

export function SectionBiais({ etat, langue }: { etat: EtatBiais; langue: Langue }) {
  const t = traducteur(langue);
  const en = langue === "en";
  const date = etat.courants[0]?.date;
  const enRetard = date !== undefined && date < etat.seanceVisee;

  return (
    <Carte
      titre={t("Biais intraday", "Intraday bias")}
      sousTitre={
        date
          ? `${t("Séance du", "Session of")} ${formaterDateSeance(date, langue)}${enRetard ? ` · ${t("pas encore recalculé pour la séance du", "not yet recalculated for the session of")} ${formaterDateSeance(etat.seanceVisee, langue)}` : ""}`
          : `${t("Séance du", "Session of")} ${formaterDateSeance(etat.seanceVisee, langue)}`
      }
      actions={<CommandesBiais />}
      pied={
        <div className="flex flex-col gap-3">
          <p className="rounded-lg border border-alerte/30 bg-alerte-doux px-3 py-2 text-sm text-alerte">
            {t(
              "Le biais quotidien est un scoring automatique basé sur des règles, pas une prédiction garantie ni un conseil en investissement.",
              "The daily bias is an automatic rules-based score, not a guaranteed prediction nor investment advice.",
            )}
          </p>
          <p className="text-xs text-attenue">
            {t(
              "Calculé une fois pour tous à partir des données en base, sans aucune analyse technique. Le score repose sur les trois facteurs qui, rejoués de 2021 à 2026, annoncent la séance dans le même sens sur les deux périodes testées : la révision des anticipations de la Fed (taux à 1 et 2 ans sur 5 séances), les surprises macro (consensus et publications) et la peur sur les options (VIX face à sa médiane, VIX / VIX3M), qui a précédé en moyenne une hausse. Biais haussier dès +20, baissier seulement sous −45 : le marché monte environ 55 % des séances. Les autres facteurs (taux longs, régime, liquidité, dollar, courbe, conditions, COT) sont affichés comme contexte. Votre validation n'est visible que par vous.",
              "Calculated once for everyone from stored data, with no technical analysis. The score relies on the three factors that, replayed from 2021 to 2026, predict the session in the same direction over both tested periods: the change in Fed expectations (1- and 2-year yields over 5 sessions), macro surprises (consensus and releases) and options fear (VIX vs its median, VIX / VIX3M), which on average preceded gains. Bullish from +20, bearish only below −45: the market rises on about 55% of sessions. The other factors (long rates, regime, liquidity, dollar, curve, conditions, COT) are shown as context. Your validation is visible only to you.",
            )}
            {` ${t(
              "Biais intraday : la séance de New York, de 9 h 30 à 16 h, calculé automatiquement chaque jour ouvré à 9 h 05 (heure de New York), après les chiffres américains de 8 h 30.",
              "Intraday bias: the New York session, 9:30 a.m. to 4 p.m., calculated automatically every business day at 9:05 a.m. New York time, after the 8:30 a.m. US releases.",
            )}`}
          </p>
        </div>
      }
    >
      {etat.courants.length === 0 ? (
        <p className="rounded-xl bg-surface-2 p-4 text-sm text-attenue">
          {t("Aucun biais calculé pour l'instant. Lancez un calcul manuel : le calcul automatique tourne chaque jour ouvré à 9 h 05, heure de New York.", "No bias calculated yet. Run a manual calculation: the automatic calculation runs every business day at 9:05 a.m. New York time.")}
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid gap-4 lg:grid-cols-2">
            {etat.courants.map((b, i) => (
              <CarteBiais key={b.id} biais={b} delai={i * 80} />
            ))}
          </div>

          {etat.historique.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer list-none text-sm text-attenue hover:text-texte">
                <span className="inline-block transition-transform group-open:rotate-90" aria-hidden>›</span>{" "}
                {t("Historique des séances précédentes et de vos décisions", "Previous sessions and your decisions")}
              </summary>
              <div className="mt-3 overflow-x-auto">
                <table className="chiffres w-full text-left text-xs sm:text-sm">
                  <thead className="text-xs text-attenue">
                    <tr>
                      <th className="pb-2 font-medium">{t("Séance", "Session")}</th>
                      {etat.courants.map((b) => <th key={b.symbole} className="pb-2 font-medium">{b.nom}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-bordure">
                    {etat.historique.map((h) => (
                      <tr key={h.date}>
                        <td className="py-2 text-attenue">{formaterDateSeance(h.date, langue)}</td>
                        {etat.courants.map((b) => {
                          const c = h.parIndice[b.symbole];
                          return (
                            <td key={b.symbole} className="py-2">
                              {c ? (
                                <span className="flex flex-wrap items-center gap-1.5">
                                  <Pastille ton={TONS[c.biais]}>{COURT[c.biais][en ? 1 : 0]}</Pastille>
                                  <span className="text-xs text-attenue">
                                    {c.decision === "valide" ? t("validé", "accepted") : c.decision === "rejete" ? t("rejeté", "rejected") : t("sans avis", "no opinion")}
                                  </span>
                                </span>
                              ) : (
                                <span className="text-xs text-discret">{t("non calculé", "not calculated")}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      )}
    </Carte>
  );
}
