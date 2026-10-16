import { Carte, Pastille } from "@/components/carte";
import { DateLocale, Echeance, Horodatage } from "@/components/horodatage";
import { FilActualites } from "@/components/veille/fil-actualites";
import { formaterDateSeance, formaterNombre } from "@/lib/format";
import type { EtatCalendrier, EtatVeille, Publication } from "@/lib/veille";

export function SectionVeille({ veille }: { veille: EtatVeille }) {
  return (
    <Carte
      titre="Veille de marché filtrée"
      sousTitre="Seuls les faits pouvant faire bouger les marchés suivis : banques centrales, statistiques, mouvements, résultats, fusions."
      actions={<Pastille ton="neutre">{veille.fenetreJours} derniers jours</Pastille>}
      pied={
        <div className="flex flex-col gap-1">
          <p className="text-xs text-attenue">
            Titre, lien et court extrait uniquement : l&apos;article complet reste chez l&apos;éditeur. Flux relus toutes les 30 minutes, pas en temps réel.
          </p>
          <Horodatage iso={veille.verifieLe} source="WSJ, FT, CNBC, Fed, BCE, Alpha Vantage" seuilHeures={2} />
        </div>
      }
    >
      {veille.articles.length === 0 ? (
        <p className="text-sm text-attenue">Aucun article retenu par le filtre sur la période.</p>
      ) : (
        <FilActualites articles={veille.articles} fenetreJours={veille.fenetreJours} />
      )}
    </Carte>
  );
}

const pct = (v: number | null) => (v === null ? "—" : `${formaterNombre(v, 1)} %`);
const ecart = (p: Publication) => {
  if (p.variation === null) return "—";
  const signe = p.variation > 0 ? "+" : p.variation < 0 ? "−" : "";
  return p.unite === "milliers"
    ? `${signe}${formaterNombre(Math.abs(p.variation), 0)} k`
    : `${signe}${formaterNombre(Math.abs(p.variation), 1)} pt`;
};
const valeur = (p: Publication, v: number | null) => {
  if (p.unite === "pct") return pct(v);
  if (v === null) return "—";
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${formaterNombre(Math.abs(v), 0)} k`;
};

export function SectionCalendrier({ calendrier }: { calendrier: EtatCalendrier }) {
  return (
    <Carte
      titre="Calendrier économique"
      sousTitre="Prochaines décisions de taux et dernières statistiques américaines publiées"
      pied={
        <div className="flex flex-col gap-1">
          <p className="text-xs text-attenue">
            Le consensus des économistes n&apos;est pas disponible gratuitement : l&apos;écart affiché compare chaque publication à la précédente.
          </p>
          <p className="text-xs text-discret">Dates des réunions : federalreserve.gov et ecb.europa.eu, relevées le 16 oct. 2026.</p>
          <Horodatage iso={calendrier.majLe} source="statistiques Alpha Vantage (BLS, BEA)" seuilHeures={24 * 40} />
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-discret">Prochaines réunions</h3>
          {calendrier.reunions.length === 0 ? (
            <p className="text-sm text-attenue">Aucune date de réunion à venir enregistrée.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {calendrier.reunions.map((r) => (
                <li key={r.id} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
                  <span
                    className={`grid size-9 shrink-0 place-items-center rounded-lg text-xs font-semibold ${
                      r.banque === "Fed" ? "bg-accent-doux text-accent-clair" : "bg-neutre-doux text-texte"
                    }`}
                  >
                    {r.banque}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {formaterDateSeance(r.date)}
                      {r.provisoire && <span className="ml-1.5 text-xs font-normal text-alerte">date provisoire</span>}
                    </p>
                    <p className="text-xs text-attenue">
                      Annonce à <DateLocale iso={r.annonceUtc} options={{ hour: "2-digit", minute: "2-digit" }} /> (votre heure)
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-medium">
                    <Echeance iso={r.annonceUtc} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-discret">Dernières publications</h3>
          {calendrier.publications.length === 0 ? (
            <p className="text-sm text-attenue">
              Pas encore de publication détectée : inflation, chômage, emplois et PIB apparaîtront après leur prochaine collecte.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="chiffres w-full min-w-[22rem] text-right text-sm">
                <thead className="text-xs text-attenue">
                  <tr>
                    <th className="pb-2 text-left font-medium">Indicateur</th>
                    <th className="pb-2 font-medium">Publié</th>
                    <th className="pb-2 font-medium">Précédent</th>
                    <th className="pb-2 font-medium">Écart</th>
                    <th className="pb-2 font-medium">Consensus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bordure">
                  {calendrier.publications.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2 text-left">
                        <span className="block font-medium">{p.libelle}</span>
                        <span className="block text-[0.7rem] text-discret">
                          Période {formaterDateSeance(p.periode)} ·{" "}
                          {p.dateInconnue ? "date de publication inconnue (premier chargement)" : `détectée le ${formaterDateSeance(p.detecteeLe)}`}
                        </span>
                      </td>
                      <td className="py-2 font-medium">{valeur(p, p.valeur)}</td>
                      <td className="py-2 text-attenue">{valeur(p, p.precedente)}</td>
                      <td className="py-2 text-attenue">{ecart(p)}</td>
                      <td className="py-2 text-xs text-discret" title="Prévisions des économistes non disponibles gratuitement">
                        indisponible
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Carte>
  );
}
