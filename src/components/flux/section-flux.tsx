import { Carte, Pastille } from "@/components/carte";
import { Horodatage } from "@/components/horodatage";
import { formaterDateSeance, formaterNombre, formaterNombreCourt } from "@/lib/format";
import { formaterMontantCourt, type EtatFlux } from "@/lib/flux";

const MENTION = "Données déclaratives et retardées légalement, pas temps réel.";

// Barre horizontale proportionnelle au flux net (ventes à gauche en rouge, achats à droite en vert).
function BarreNette({ net, maxAbs }: { net: number; maxAbs: number }) {
  const part = maxAbs > 0 ? Math.min(1, Math.abs(net) / maxAbs) : 0;
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-surface-3" aria-hidden>
      <div className="absolute inset-y-0 left-1/2 w-px bg-bordure-forte" />
      <div
        className={`absolute inset-y-0 rounded-full ${net < 0 ? "right-1/2 bg-baisse/80" : "left-1/2 bg-hausse/80"}`}
        style={{ width: `${part * 50}%` }}
      />
    </div>
  );
}

export function SectionFlux({ flux }: { flux: EtatFlux }) {
  const maxAbs = Math.max(0, ...flux.parEntreprise.map((e) => Math.abs(e.net)));
  const maxSecteur = Math.max(0, ...flux.parSecteur.map((s) => Math.abs(s.net)));
  const trimestre = flux.positions[0]?.date_rapport;

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Carte
        titre="Initiés des grandes capitalisations"
        sousTitre={`Achats et ventes sur le marché déclarés par les dirigeants (formulaires 4), ${flux.jours} derniers jours`}
        actions={<Pastille ton="neutre">Différé légal : 2 jours ouvrés</Pastille>}
        pied={
          <div className="flex flex-col gap-1">
            <p className="text-xs text-attenue">{MENTION} Attributions, exercices d&apos;options et retenues fiscales exclus.</p>
            <Horodatage iso={flux.majInities} source="SEC EDGAR (formulaires 4)" seuilHeures={30} />
          </div>
        }
      >
        {flux.parEntreprise.length === 0 ? (
          <p className="text-sm text-attenue">Aucun achat ni vente sur le marché déclaré sur la période.</p>
        ) : (
          <div className="flex flex-col gap-5">
            <ul className="flex flex-col gap-2.5">
              {flux.parEntreprise.map((e) => (
                <li key={e.entreprise} className="grid grid-cols-[4.5rem_minmax(0,1fr)_6.5rem] items-center gap-3 text-sm">
                  <span className="font-medium" title={e.nom}>{e.entreprise}</span>
                  <BarreNette net={e.net} maxAbs={maxAbs} />
                  <span className={`chiffres text-right ${e.net < 0 ? "text-baisse" : e.net > 0 ? "text-hausse" : "text-attenue"}`}>
                    {formaterMontantCourt(e.net)}
                  </span>
                </li>
              ))}
            </ul>

            <div>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-discret">Par secteur</h3>
              <ul className="flex flex-col gap-2">
                {flux.parSecteur.map((s) => (
                  <li key={s.secteur} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_6.5rem] items-center gap-3 text-sm">
                    <span className="truncate text-attenue">{s.secteur}</span>
                    <BarreNette net={s.net} maxAbs={maxSecteur} />
                    <span className="chiffres text-right">{formaterMontantCourt(s.net)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-discret">Dernières transactions</h3>
              <ul className="flex flex-col divide-y divide-bordure text-sm">
                {flux.dernieres.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-2">
                    <span className="font-medium">{t.entreprise}</span>
                    <Pastille ton={t.code_transaction === "P" ? "hausse" : "baisse"}>{t.type_transaction}</Pastille>
                    <a href={t.source_formulaire} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-attenue hover:underline">
                      {t.personne} · {t.poste}
                    </a>
                    <span className="chiffres ml-auto text-xs text-attenue">
                      {t.nombre_titres !== null && `${formaterNombre(Number(t.nombre_titres), 0)} titres · `}
                      {formaterMontantCourt(t.montant === null ? null : Number(t.montant))} · {formaterDateSeance(t.date)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Carte>

      <Carte
        titre="Positions institutionnelles"
        sousTitre={trimestre ? `Déclarations 13F du trimestre clos le ${formaterDateSeance(trimestre)}, 11 gérants suivis` : "Déclarations 13F"}
        actions={<Pastille ton="neutre">Différé légal : 45 jours</Pastille>}
        pied={
          <div className="flex flex-col gap-1">
            <p className="text-xs text-attenue">{MENTION} Un 13F donne une photographie en fin de trimestre, pas les opérations au jour le jour.</p>
            <Horodatage iso={flux.majInstitutions} source="SEC EDGAR (formulaires 13F)" seuilHeures={24 * 8} />
          </div>
        }
      >
        {flux.positions.length === 0 ? (
          <p className="text-sm text-attenue">Pas encore de déclaration 13F collectée.</p>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="overflow-x-auto">
              <table className="chiffres w-full text-right text-xs sm:text-sm">
                <thead className="text-xs text-attenue">
                  <tr>
                    <th className="pb-2 text-left font-medium">Entreprise</th>
                    <th className="pb-2 font-medium">Valeur détenue</th>
                    <th className="pb-2 font-medium">
                      <span className="sm:hidden">Var. titres</span>
                      <span className="hidden sm:inline">Variation (titres)</span>
                    </th>
                    <th className="pb-2 font-medium" title="Gérants qui renforcent / qui allègent">
                      <span className="sm:hidden">↗ / ↘</span>
                      <span className="hidden sm:inline">Gérants ↗ / ↘</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bordure">
                  {flux.positions.map((p) => (
                    <tr key={p.entreprise}>
                      <td className="py-2 text-left font-medium" title={p.nom}>{p.entreprise}</td>
                      <td className="py-2">{formaterMontantCourt(p.valeur_usd)}</td>
                      <td className={`py-2 ${p.variation_parts === null ? "text-attenue" : p.variation_parts < 0 ? "text-baisse" : p.variation_parts > 0 ? "text-hausse" : ""}`}>
                        {p.variation_parts === null ? (
                          "—"
                        ) : (
                          <>
                            <span className="sm:hidden">{formaterNombreCourt(p.variation_parts)}</span>
                            <span className="hidden sm:inline">
                              {`${p.variation_parts > 0 ? "+" : p.variation_parts < 0 ? "−" : ""}${formaterNombre(Math.abs(p.variation_parts), 0)}`}
                            </span>
                          </>
                        )}
                      </td>
                      <td className="py-2 text-attenue">
                        {p.nb_hausse} / {p.nb_baisse}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {flux.mouvements.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-discret">Mouvements marquants</h3>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {flux.mouvements.map((m) => (
                    <li key={`${m.institution}-${m.entreprise}`} className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">{m.institution}</span>
                      <span className={m.variation > 0 ? "text-hausse" : "text-baisse"}>{m.variation > 0 ? "renforce" : "allège"}</span>
                      <span className="font-medium">{m.entreprise}</span>
                      <span className="chiffres ml-auto text-xs text-attenue">
                        {m.variation > 0 ? "+" : "−"}
                        {formaterNombre(Math.abs(m.variation), 0)} titres ≈ {formaterMontantCourt(m.valeurVariation === null ? null : Math.abs(m.valeurVariation))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Carte>
    </div>
  );
}
