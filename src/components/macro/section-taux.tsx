import { Carte, Pastille } from "@/components/carte";
import { Horodatage } from "@/components/horodatage";
import { MiniCourbe } from "@/components/marches/mini-courbe";
import { formaterDateSeance, formaterNombre, formaterPct, formaterPeriode, tonVariation } from "@/lib/format";
import { MATIERES, type EtatTaux } from "@/lib/macro";
import type { MatiereRow } from "@/lib/types-supabase";

// Courbe des taux (rendement selon la maturité), axe horizontal en échelle racine
// pour ne pas écraser les maturités courtes.
function CourbeDesTaux({ points }: { points: EtatTaux["points"] }) {
  if (points.length < 2) return null;
  const largeur = 260;
  const hauteur = 90;
  const marge = 14;
  const xs = points.map((p) => Math.sqrt(p.annees));
  const [xMin, xMax] = [Math.min(...xs), Math.max(...xs)];
  const ys = points.map((p) => p.taux);
  const [yMin, yMax] = [Math.min(...ys) - 0.1, Math.max(...ys) + 0.1];
  const x = (v: number) => marge + ((Math.sqrt(v) - xMin) / (xMax - xMin || 1)) * (largeur - 2 * marge);
  const y = (v: number) => hauteur - marge - ((v - yMin) / (yMax - yMin || 1)) * (hauteur - 2 * marge);
  const trace = points.map((p) => `${x(p.annees).toFixed(1)},${y(p.taux).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${largeur} ${hauteur}`} className="h-auto w-full max-w-sm" role="img" aria-label="Courbe des taux du Trésor américain">
      <polyline points={trace} fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" />
      {points.map((p) => (
        <g key={p.maturite}>
          <circle cx={x(p.annees)} cy={y(p.taux)} r="3" fill="var(--color-accent-clair)" />
          <text x={x(p.annees)} y={hauteur - 1} textAnchor="middle" fontSize="8" fill="var(--color-attenue)">
            {p.libelle.replace(" ans", "a").replace(" mois", "m")}
          </text>
        </g>
      ))}
    </svg>
  );
}

function LigneSpread({ libelle, valeur }: { libelle: string; valeur: number | null }) {
  if (valeur === null) {
    return (
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-attenue">{libelle}</span>
        <span className="text-discret">indisponible</span>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="text-attenue">{libelle}</span>
      <span className="flex items-center gap-2">
        <span className="chiffres font-medium">
          {valeur > 0 ? "+" : valeur < 0 ? "−" : ""}
          {formaterNombre(Math.abs(valeur), 2)} pt
        </span>
        <Pastille ton={valeur < 0 ? "alerte" : "neutre"}>{valeur < 0 ? "Courbe inversée" : "Courbe pentue"}</Pastille>
      </span>
    </div>
  );
}

export function SectionTaux({ taux, matieres }: { taux: EtatTaux; matieres: (MatiereRow | null)[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <Carte
        titre="Taux du Trésor américain"
        sousTitre={taux.date ? `Rendements au ${formaterDateSeance(taux.date)}` : "En attente de la première collecte"}
        pied={<Horodatage iso={taux.majLe} source="Alpha Vantage (données Fed H.15)" seuilHeures={36} />}
      >
        {taux.points.length === 0 ? (
          <p className="text-sm text-attenue">Pas encore de données.</p>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <ul className="grid grid-cols-3 gap-2">
                {taux.points.map((p) => (
                  <li key={p.maturite} className="rounded-xl bg-surface-2 px-3 py-2">
                    <p className="text-xs text-attenue">{p.libelle}</p>
                    <p className="chiffres font-semibold">{formaterNombre(p.taux, 2)} %</p>
                    {p.variation5j !== null && (
                      <p className="chiffres text-xs text-attenue">
                        {p.variation5j > 0 ? "+" : p.variation5j < 0 ? "−" : ""}
                        {formaterNombre(Math.abs(p.variation5j * 100), 0)} pb / 5 j
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              <CourbeDesTaux points={taux.points} />
            </div>
            <div className="flex flex-col gap-2 border-t border-bordure pt-4">
              <LigneSpread libelle="Écart 10 ans − 2 ans" valeur={taux.spread102} />
              <LigneSpread libelle="Écart 30 ans − 2 ans" valeur={taux.spread302} />
              {taux.historiqueSpread.length > 2 && (
                <div className="flex items-center gap-3 text-xs text-attenue">
                  <MiniCourbe valeurs={taux.historiqueSpread} ton="neutre" /> Écart 10−2 ans sur 4 mois
                </div>
              )}
            </div>
          </div>
        )}
      </Carte>

      <Carte titre="Matières premières" sousTitre="Prix de référence quotidiens ou mensuels">
        <ul className="grid gap-2 sm:grid-cols-2">
          {MATIERES.map((m, i) => {
            const ligne = matieres[i];
            return (
              <li key={m.nom} className="flex flex-col gap-1 rounded-xl bg-surface-2 p-3">
                <span className="text-xs text-attenue">{m.libelle}</span>
                {ligne ? (
                  <>
                    <span className="chiffres text-lg font-semibold">
                      {formaterNombre(Number(ligne.prix), 2)} <span className="text-xs font-normal text-attenue">{m.unite}</span>
                    </span>
                    <span className="chiffres flex flex-wrap gap-x-3 text-xs">
                      <span className={tonVariation(ligne.variation_1j) === "hausse" ? "text-hausse" : tonVariation(ligne.variation_1j) === "baisse" ? "text-baisse" : "text-attenue"}>
                        {formaterPct(ligne.variation_1j === null ? null : Number(ligne.variation_1j))} / {m.frequence === "mois" ? "1 mois" : "séance"}
                      </span>
                      <span className="text-attenue">{formaterPct(ligne.variation_1an === null ? null : Number(ligne.variation_1an))} / 1 an</span>
                    </span>
                    <span className="text-[0.7rem] text-discret">
                      {m.frequence === "mois" ? `moyenne de ${formaterPeriode(ligne.date, "mois")}` : `au ${formaterDateSeance(ligne.date)}`}
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-discret">Pas encore collecté</span>
                )}
              </li>
            );
          })}
        </ul>
        <div className="mt-3">
          <Horodatage
            iso={matieres.filter((m): m is MatiereRow => m !== null).map((m) => m.maj_le).sort().at(-1)}
            source="Alpha Vantage (EIA, FRED)"
            seuilHeures={72}
          />
        </div>
      </Carte>
    </div>
  );
}
