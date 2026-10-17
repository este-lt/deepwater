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
      titre={t("Biais du jour", "Daily bias")}
      sousTitre={
        date
          ? `${t("Séance du", "Session of")} ${formaterDateSeance(date, langue)}${enRetard ? ` · ${t("pas encore recalculé pour la séance du", "not yet recalculated for the session of")} ${formaterDateSeance(etat.seanceVisee, langue)}` : ""}`
          : `${t("Séance du", "Session of")} ${formaterDateSeance(etat.seanceVisee, langue)}`
      }
      actions={<CommandesBiais autoActif={etat.autoActif} />}
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
              "Calculé une fois pour tous à partir des données en base, sans aucune analyse technique : politique de la Fed (taux à 2 ans contre Fed funds, dernière décision), taux longs nominal et réel, surprise macro, volatilité implicite et crédit, conditions financières. Votre validation n'est visible que par vous.",
              "Calculated once for everyone from stored data, with no technical analysis: Fed policy (2-year yield vs Fed funds, last decision), nominal and real long rates, macro surprise, implied volatility and credit, financial conditions. Your validation is visible only to you.",
            )}
            {etat.autoActif
              ? ` ${t("Calcul automatique activé : chaque jour ouvré à 8 h 30, heure de New York.", "Automatic calculation on: every business day at 8:30 a.m. New York time.")}`
              : ` ${t("Calcul automatique coupé pour votre compte.", "Automatic calculation off for your account.")}`}
          </p>
        </div>
      }
    >
      {etat.courants.length === 0 ? (
        <p className="rounded-xl bg-surface-2 p-4 text-sm text-attenue">
          {t("Aucun biais calculé pour l'instant. Lancez un calcul manuel ou activez le calcul automatique.", "No bias calculated yet. Run a manual calculation or turn on automatic calculation.")}
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
