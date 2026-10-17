import { Carte, Pastille } from "@/components/carte";
import { Horodatage } from "@/components/horodatage";
import { MiniCourbe } from "@/components/marches/mini-courbe";
import { formaterDateSeance, formaterNombre, formaterPb, pct } from "@/lib/format";
import { type Langue, traducteur } from "@/lib/i18n";
import type { EtatTaux } from "@/lib/macro";

// Courbe des taux (rendement selon la maturité) en pleine largeur : courbe actuelle et
// courbe d'il y a un mois en pointillés. Axe horizontal en échelle racine pour ne pas
// écraser les maturités courtes ; graduations horizontales tous les 0,25 ou 0,5 point.
function CourbeDesTaux({ points, langue }: { points: EtatTaux["points"]; langue: Langue }) {
  const t = traducteur(langue);
  if (points.length < 2) return null;
  const largeur = 560;
  const hauteur = 190;
  const marge = { gauche: 40, droite: 16, haut: 14, bas: 26 };
  const xs = points.map((p) => Math.sqrt(p.annees));
  const [xMin, xMax] = [Math.min(...xs), Math.max(...xs)];
  const tous = points.flatMap((p) => [p.taux, ...(p.taux1m === null ? [] : [p.taux1m])]);
  const pas = Math.max(...tous) - Math.min(...tous) > 1.2 ? 0.5 : 0.25;
  const yMin = Math.floor((Math.min(...tous) - 0.05) / pas) * pas;
  const yMax = Math.ceil((Math.max(...tous) + 0.05) / pas) * pas;
  const x = (annees: number) => marge.gauche + ((Math.sqrt(annees) - xMin) / (xMax - xMin || 1)) * (largeur - marge.gauche - marge.droite);
  const y = (v: number) => marge.haut + (1 - (v - yMin) / (yMax - yMin || 1)) * (hauteur - marge.haut - marge.bas);
  const trace = (valeur: (p: EtatTaux["points"][number]) => number | null) =>
    points.flatMap((p) => (valeur(p) === null ? [] : [`${x(p.annees).toFixed(1)},${y(valeur(p)!).toFixed(1)}`])).join(" ");
  const graduations = Array.from({ length: Math.round((yMax - yMin) / pas) + 1 }, (_, i) => yMin + i * pas);
  const ilYaUnMois = points.every((p) => p.taux1m !== null);

  return (
    <figure className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${largeur} ${hauteur}`} className="h-auto w-full" role="img" aria-label={t("Courbe des taux du Trésor américain", "US Treasury yield curve")}>
        {graduations.map((g) => (
          <g key={g}>
            <line x1={marge.gauche} x2={largeur - marge.droite} y1={y(g)} y2={y(g)} stroke="var(--color-bordure)" />
            <text x={marge.gauche - 6} y={y(g) + 3.5} textAnchor="end" fontSize="10" fill="var(--color-discret)">
              {formaterNombre(g, 2, langue)}
            </text>
          </g>
        ))}
        {ilYaUnMois && (
          <polyline points={trace((p) => p.taux1m)} fill="none" stroke="var(--color-attenue)" strokeWidth="1.5" strokeDasharray="4 4" strokeLinejoin="round" />
        )}
        <polyline points={trace((p) => p.taux)} fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinejoin="round" />
        {points.map((p) => (
          <g key={p.maturite}>
            <circle cx={x(p.annees)} cy={y(p.taux)} r="3.5" fill="var(--color-accent-clair)" />
            <text x={x(p.annees)} y={hauteur - 8} textAnchor="middle" fontSize="10.5" fill="var(--color-attenue)">
              {langue === "en" ? p.court : p.court.replace("Y", "A")}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-attenue">
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-accent" /> {t("Aujourd'hui", "Today")}</span>
        {ilYaUnMois && (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 border-t border-dashed border-attenue" /> {t("Il y a un mois (21 séances)", "One month ago (21 sessions)")}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

function LigneSpread({ libelle, valeur, langue }: { libelle: string; valeur: number | null; langue: Langue }) {
  const t = traducteur(langue);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="text-attenue">{libelle}</span>
      {valeur === null ? (
        <span className="text-discret">{t("indisponible", "unavailable")}</span>
      ) : (
        <span className="flex items-center gap-2">
          <span className="chiffres font-medium">{formaterPb(valeur * 100, langue)}</span>
          <Pastille ton={valeur < 0 ? "alerte" : "neutre"}>{valeur < 0 ? t("Courbe inversée", "Inverted curve") : t("Courbe pentue", "Positive slope")}</Pastille>
        </span>
      )}
    </div>
  );
}

export function SectionTaux({ taux, langue }: { taux: EtatTaux; langue: Langue }) {
  const t = traducteur(langue);
  return (
    <Carte
      titre={t("Courbe des taux américains", "US Treasury yield curve")}
      sousTitre={taux.date ? `${t("Rendements au", "Yields as of")} ${formaterDateSeance(taux.date, langue)}` : t("En attente de la première collecte", "Waiting for the first collection")}
      pied={<Horodatage iso={taux.majLe} source={t("FRED (Fed, H.15)", "FRED (Fed, H.15)")} seuilHeures={36} />}
    >
      {taux.points.length === 0 ? (
        <p className="text-sm text-attenue">{t("Pas encore de données.", "No data yet.")}</p>
      ) : (
        <div className="@container flex flex-col gap-4">
          {/* Tuiles : 3 colonnes dans une carte étroite, 6 dès que la carte est assez large. */}
          <ul className="grid grid-cols-3 gap-2 @lg:grid-cols-6">
            {taux.points.map((p) => (
              <li key={p.maturite} className="flex min-w-0 flex-col rounded-xl bg-surface-2 px-2.5 py-2">
                <span className="text-xs text-attenue">{langue === "en" ? p.court : p.court.replace("Y", " ans").replace("3M", "3 mois")}</span>
                <span className="chiffres whitespace-nowrap text-base font-semibold">{formaterNombre(p.taux, 2, langue)}{pct(langue)}</span>
                <span
                  className={`chiffres whitespace-nowrap text-xs ${p.variation5j === null || p.variation5j === 0 ? "text-discret" : "text-attenue"}`}
                  title={t("Variation sur 5 séances", "Change over 5 sessions")}
                >
                  {p.variation5j === null ? "—" : formaterPb(p.variation5j * 100, langue)}
                </span>
              </li>
            ))}
          </ul>
          <p className="-mt-2 text-[0.7rem] text-discret">{t("Sous chaque taux : variation sur 5 séances.", "Below each yield: change over 5 sessions.")}</p>
          <CourbeDesTaux points={taux.points} langue={langue} />
          <div className="flex flex-col gap-2 border-t border-bordure pt-4">
            <LigneSpread libelle={t("Écart 10 ans − 2 ans", "10Y − 2Y spread")} valeur={taux.spread102} langue={langue} />
            <LigneSpread libelle={t("Écart 30 ans − 2 ans", "30Y − 2Y spread")} valeur={taux.spread302} langue={langue} />
            {taux.historiqueSpread.length > 2 && (
              <div className="flex items-center gap-3 text-xs text-attenue">
                <MiniCourbe valeurs={taux.historiqueSpread} ton="neutre" /> {t("Écart 10−2 ans sur 4 mois", "10Y−2Y spread over 4 months")}
              </div>
            )}
          </div>
        </div>
      )}
    </Carte>
  );
}
