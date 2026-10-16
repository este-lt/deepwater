import { Carte, Pastille } from "@/components/carte";
import { DateLocale, Echeance, Horodatage } from "@/components/horodatage";
import { FilActualites } from "@/components/veille/fil-actualites";
import { formaterDateSeance, formaterNombre, formaterPeriode } from "@/lib/format";
import type { EtatCalendrier, EtatVeille, Publication } from "@/lib/veille";

export function SectionVeille({ veille }: { veille: EtatVeille }) {
  return (
    <Carte
      titre="Actualités"
      actions={<Pastille ton="neutre">{veille.fenetreJours} derniers jours</Pastille>}
      pied={<Horodatage iso={veille.verifieLe} source="WSJ, FT, CNBC, Fed, BCE (titre et court extrait, relus toutes les 30 min)" seuilHeures={2} />}
    >
      {veille.articles.length === 0 ? (
        <p className="text-sm text-attenue">Aucune actualité de marché retenue sur la période.</p>
      ) : (
        <FilActualites articles={veille.articles} fenetreJours={veille.fenetreJours} />
      )}
    </Carte>
  );
}

const nombre = (p: Publication, v: number | null) => {
  if (v === null) return "—";
  const signe = p.signe ? (v > 0 ? "+" : v < 0 ? "−" : "") : v < 0 ? "−" : "";
  return p.unite === "pct" ? `${signe}${formaterNombre(Math.abs(v), 1)} %` : `${signe}${formaterNombre(Math.abs(v), 0)} k`;
};
const ecart = (p: Publication) => {
  if (p.variation === null) return "—";
  const signe = p.variation > 0 ? "+" : p.variation < 0 ? "−" : "";
  return p.unite === "milliers" ? `${signe}${formaterNombre(Math.abs(p.variation), 0)} k` : `${signe}${formaterNombre(Math.abs(p.variation), 1)} pt`;
};

const FORMAT_JOUR = { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" } as const;

export function SectionCalendrier({ calendrier }: { calendrier: EtatCalendrier }) {
  // Agenda unique : réunions de banques centrales et publications à venir, par ordre chronologique.
  const agenda = [
    ...calendrier.reunions.map((r) => ({
      cle: `r${r.id}`, badge: r.banque, libelle: r.provisoire ? `Décision de taux (date provisoire)` : "Décision de taux",
      instant: r.annonceUtc, fort: true,
    })),
    ...calendrier.prevues.map((p) => ({ cle: `p${p.id}`, badge: "US", libelle: p.libelle, instant: p.annonceUtc, fort: p.impact === "fort" })),
  ].sort((a, b) => a.instant.localeCompare(b.instant)).slice(0, 8);

  return (
    <Carte
      titre="Calendrier économique"
      sousTitre="Heures dans votre fuseau"
      pied={
        <div className="flex flex-col gap-1">
          <p className="text-xs text-discret">
            Consensus des économistes indisponible gratuitement : l&apos;écart compare chaque publication à la précédente.
          </p>
          <Horodatage iso={calendrier.majLe} source="FRED (BLS, BEA), federalreserve.gov, ecb.europa.eu" seuilHeures={24 * 10} />
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-discret">À venir</h3>
          <ul className="flex flex-col gap-1.5">
            {agenda.map((e) => (
              <li key={e.cle} className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2">
                <span
                  className={`grid h-7 w-10 shrink-0 place-items-center rounded-md text-[0.7rem] font-semibold ${
                    e.badge === "Fed" ? "bg-accent-doux text-accent-clair" : e.badge === "BCE" ? "bg-neutre-doux text-texte" : "bg-surface-3 text-attenue"
                  }`}
                >
                  {e.badge}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm ${e.fort ? "font-medium" : ""}`}>{e.libelle}</span>
                  <span className="block text-xs text-attenue">
                    <DateLocale iso={e.instant} options={FORMAT_JOUR} />
                  </span>
                </span>
                <span className="shrink-0 text-xs font-medium">
                  <Echeance iso={e.instant} />
                </span>
              </li>
            ))}
          </ul>
          {calendrier.prevues.length === 0 && (
            <p className="mt-2 text-xs text-discret">Dates des prochaines statistiques indisponibles : clé API FRED à configurer.</p>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-discret">Dernières publications</h3>
          {calendrier.publications.length === 0 ? (
            <p className="text-sm text-attenue">Pas encore de publication collectée.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-bordure">
              {calendrier.publications.map((p) => (
                <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2">
                  <span className="min-w-0">
                    <span className="block text-sm">{p.libelle}</span>
                    <span className="block text-[0.7rem] text-discret">
                      {formaterPeriode(p.periode, p.frequence)}
                      {!p.dateInconnue && ` · publié le ${formaterDateSeance(p.detecteeLe)}`}
                    </span>
                  </span>
                  <span className="chiffres text-right">
                    <span className="block text-sm font-semibold">{nombre(p, p.valeur)}</span>
                    <span className="block text-[0.7rem] text-attenue">
                      préc. {nombre(p, p.precedente)} · {ecart(p)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Carte>
  );
}
