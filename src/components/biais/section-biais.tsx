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
              "Calculé une fois pour tous à partir des données en base, sans aucune analyse technique : c'est l'analyse des informations de votre liste à feux tricolores, chacune pondérée par sa couleur (🔴 3, 🟠 2, 🟢 1). 🔴 Fed, statistiques face au consensus (CPI, PCE, PIB, NFP, chômage), obligations d'État (10 ans US, réel, européen), dollar et différentiel de taux, pétrole, liquidité (M2, bilan de la Fed), régime macro ; 🟠 sentiment risk-on / risk-off (VIX, crédit, or, yen, franc suisse), courbe des taux ; 🟢 positionnement des institutionnels (COT). Comme le veut le « priced in », chaque donnée compte par ce qui change face aux attentes, pas par son niveau. Haussier dès +20, baissier sous −20. Sans donnée gratuite, ne sont pas comptés : SEP et discours du FOMC, géopolitique, politique fiscale, rotations sectorielles, sentiment des particuliers, valorisation. Votre validation n'est visible que par vous.",
              "Calculated once for everyone from stored data, with no technical analysis: it is the analysis of the items on your traffic-light list, each weighted by its colour (🔴 3, 🟠 2, 🟢 1). 🔴 Fed, data vs consensus (CPI, PCE, GDP, NFP, unemployment), government bonds (US 10-year, real, European), dollar and rate differential, oil, liquidity (M2, Fed balance sheet), macro regime; 🟠 risk-on / risk-off sentiment (VIX, credit, gold, yen, Swiss franc), yield curve; 🟢 institutional positioning (COT). In line with \"priced in\", each item counts by what changes against expectations, not by its level. Bullish from +20, bearish below −20. Not counted, for lack of free data: FOMC projections and speeches, geopolitics, fiscal policy, sector rotation, retail sentiment, valuation. Your validation is visible only to you.",
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
