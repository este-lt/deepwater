import { Pastille } from "@/components/carte";
import { Horodatage } from "@/components/horodatage";
import { formaterDateSeance, formaterNombre, formaterPct } from "@/lib/format";
import type { ControleSec, FicheEntreprise } from "@/lib/fondamentales";

function Ratio({ libelle, valeur, aide }: { libelle: string; valeur: string; aide: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2.5" title={aide}>
      <dt className="text-xs text-attenue">{libelle}</dt>
      <dd className="chiffres mt-0.5 text-lg font-semibold tracking-tight">{valeur}</dd>
    </div>
  );
}

const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : formaterPct(Number(v) * 100, 1, false));
const fois = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${formaterNombre(Number(v), 2)}×`);

function FicheCarte({ fiche }: { fiche: FicheEntreprise }) {
  const base = fiche.trimestriel ?? fiche.annuel;
  const controle = fiche.annuel?.controle_sec as ControleSec | null | undefined;
  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-carte border border-bordure bg-surface p-5">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold tracking-tight">{fiche.nom}</h3>
          <p className="text-xs text-attenue">
            {fiche.symbole}
            {base && ` · ratios sur 12 mois glissants au ${formaterDateSeance(base.date_cloture)}`}
          </p>
        </div>
        {controle && (
          <Pastille ton={controle.coherent ? "hausse" : "alerte"}>
            {controle.coherent ? `Conforme au ${controle.formulaire ?? "10-K"} (SEC)` : `Écart de ${formaterNombre(controle.ecart_max_pct, 1)} % avec la SEC`}
          </Pastille>
        )}
      </header>

      {base ? (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Ratio libelle="PER" valeur={base.per === null ? "—" : formaterNombre(Number(base.per), 1)} aide="Cours / bénéfice par action (12 mois). « — » si aucun cours n'est disponible à la date de clôture." />
          <Ratio libelle="ROE" valeur={pct(base.roe)} aide="Résultat net / capitaux propres." />
          <Ratio libelle="Marge nette" valeur={pct(base.marge_nette)} aide="Résultat net / chiffre d'affaires." />
          <Ratio libelle="Dette / fonds propres" valeur={fois(base.dette_sur_fonds_propres)} aide="Dette financière totale / capitaux propres." />
        </dl>
      ) : (
        <p className="text-sm text-attenue">États financiers pas encore collectés.</p>
      )}

      {fiche.historique.length > 1 && (
        <div className="overflow-x-auto">
          <table className="chiffres w-full min-w-[22rem] text-right text-xs">
            <thead className="text-attenue">
              <tr>
                <th className="pb-1 text-left font-medium">Exercice</th>
                <th className="pb-1 font-medium">Marge</th>
                <th className="pb-1 font-medium">ROE</th>
                <th className="pb-1 font-medium">Dette/FP</th>
              </tr>
            </thead>
            <tbody>
              {fiche.historique.map((h) => (
                <tr key={h.date_cloture} className="border-t border-bordure">
                  <td className="py-1 text-left text-attenue">{h.date_cloture.slice(0, 4)}</td>
                  <td className="py-1">{pct(h.marge_nette)}</td>
                  <td className="py-1">{pct(h.roe)}</td>
                  <td className="py-1">{fois(h.dette_sur_fonds_propres)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {fiche.depots.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-xs font-medium text-attenue">Derniers dépôts SEC</h4>
          <ul className="flex flex-col gap-1.5 text-sm">
            {fiche.depots.map((d) => (
              <li key={d.url_source} className="flex min-w-0 gap-2">
                <span className="w-12 shrink-0 font-mono text-xs leading-5 text-accent-clair">{d.type_formulaire}</span>
                <a href={d.url_source} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate hover:underline">
                  {d.resume_auto}
                </a>
                <span className="ml-auto shrink-0 text-xs leading-5 text-discret">{formaterDateSeance(d.date_depot)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Horodatage iso={base?.maj_le} source="Alpha Vantage, contrôlé avec SEC EDGAR" seuilHeures={24 * 40} />
    </article>
  );
}

export function SectionFondamentales({ fiches }: { fiches: FicheEntreprise[] }) {
  return (
    <details className="group rounded-carte border border-bordure bg-surface animate-apparition">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 sm:px-6">
        <span>
          <span className="text-[0.95rem] font-semibold tracking-tight">Fondamentales entreprises</span>
          <span className="ml-2 text-sm text-attenue">Section secondaire, actions activées par l&apos;administrateur</span>
        </span>
        <span className="text-attenue transition-transform group-open:rotate-180" aria-hidden>
          ▾
        </span>
      </summary>
      <div className="grid gap-4 px-5 pb-5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,24rem),1fr))] sm:px-6 sm:pb-6">
        {fiches.map((f) => (
          <FicheCarte key={f.symbole} fiche={f} />
        ))}
      </div>
    </details>
  );
}
