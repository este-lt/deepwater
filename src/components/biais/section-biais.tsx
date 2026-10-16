import { Carte, Pastille } from "@/components/carte";
import { CarteBiais } from "@/components/biais/carte-biais";
import { CommandesBiais } from "@/components/biais/commandes-biais";
import { formaterDateSeance } from "@/lib/format";
import type { EtatBiais } from "@/lib/biais";

const TONS = { haussier: "hausse", baissier: "baisse", neutre: "neutre" } as const;
const COURT = { haussier: "Haussier", baissier: "Baissier", neutre: "Neutre" } as const;

export const MENTION_BIAIS =
  "Le biais quotidien est un scoring automatique basé sur des règles, pas une prédiction garantie ni un conseil en investissement.";

export function SectionBiais({ etat }: { etat: EtatBiais }) {
  const date = etat.courants[0]?.date;
  const enRetard = date !== undefined && date < etat.seanceVisee;

  return (
    <Carte
      titre="Biais du jour"
      sousTitre={
        date
          ? `Séance du ${formaterDateSeance(date)}${enRetard ? ` · pas encore recalculé pour la séance du ${formaterDateSeance(etat.seanceVisee)}` : ""}`
          : `Séance du ${formaterDateSeance(etat.seanceVisee)}`
      }
      actions={<CommandesBiais autoActif={etat.autoActif} />}
      pied={
        <div className="flex flex-col gap-3">
          <p className="rounded-lg border border-alerte/30 bg-alerte-doux px-3 py-2 text-sm text-alerte">{MENTION_BIAIS}</p>
          <p className="text-xs text-attenue">
            Calculé une seule fois pour tous les utilisateurs, uniquement à partir des données déjà en base (cours, taux,
            publications macro, flux d&apos;initiés et d&apos;institutions). Votre validation ou votre rejet n&apos;est visible que par vous.
            {etat.autoActif ? " Calcul automatique activé : chaque jour ouvré à 8 h 30, heure de New York." : " Calcul automatique coupé pour votre compte."}
          </p>
        </div>
      }
    >
      {etat.courants.length === 0 ? (
        <p className="rounded-xl bg-surface-2 p-4 text-sm text-attenue">
          Aucun biais calculé pour l&apos;instant. Lancez un calcul manuel ou activez le calcul automatique.
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
                <span className="inline-block transition-transform group-open:rotate-90" aria-hidden>›</span> Historique des
                séances précédentes et de vos décisions
              </summary>
              <div className="mt-3 overflow-x-auto">
                <table className="chiffres w-full min-w-[28rem] text-left text-sm">
                  <thead className="text-xs text-attenue">
                    <tr>
                      <th className="pb-2 font-medium">Séance</th>
                      {etat.courants.map((b) => (
                        <th key={b.symbole} className="pb-2 font-medium">{b.nom}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-bordure">
                    {etat.historique.map((h) => (
                      <tr key={h.date}>
                        <td className="py-2 text-attenue">{formaterDateSeance(h.date)}</td>
                        {etat.courants.map((b) => {
                          const c = h.parIndice[b.symbole];
                          return (
                            <td key={b.symbole} className="py-2">
                              {c ? (
                                <span className="flex flex-wrap items-center gap-1.5">
                                  <Pastille ton={TONS[c.biais]}>{COURT[c.biais]}</Pastille>
                                  <span className="text-xs text-attenue">
                                    {c.decision === "valide" ? "validé" : c.decision === "rejete" ? "rejeté" : "sans avis"}
                                  </span>
                                </span>
                              ) : (
                                <span className="text-xs text-discret">non calculé</span>
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
