import { Pastille } from "@/components/carte";
import { Horodatage } from "@/components/horodatage";
import { formaterDateSeance, formaterNombre, formaterPct, tonVariation } from "@/lib/format";
import type { LigneMarche } from "@/lib/marches";
import { libelleSource } from "@/lib/sources";
import { MiniCourbe } from "./mini-courbe";

function PositionMoyenne({ libelle, cloture, moyenne }: { libelle: string; cloture: number; moyenne: number | null }) {
  if (moyenne === null) return <Pastille ton="neutre">{libelle} indisponible</Pastille>;
  const ecart = ((cloture - moyenne) / moyenne) * 100;
  return (
    <Pastille ton={ecart >= 0 ? "hausse" : "baisse"}>
      {ecart >= 0 ? "Au-dessus" : "Sous"} {libelle} ({formaterPct(ecart, 1)})
    </Pastille>
  );
}

// Carte d'un indice prioritaire (S&P 500, Nasdaq-100).
export function CarteInstrument({ ligne, delai = 0 }: { ligne: LigneMarche; delai?: number }) {
  const ton = tonVariation(ligne.var1j);
  return (
    <article
      style={{ animationDelay: `${delai}ms` }}
      className="flex min-w-0 flex-col gap-3 rounded-carte border border-bordure bg-surface p-5 animate-apparition"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold tracking-tight">{ligne.nom}</h3>
          <p className={`text-xs ${ligne.ancienne ? "text-alerte" : "text-attenue"}`}>
            Clôture du {formaterDateSeance(ligne.date)}
            {ligne.ancienne && " · ancienne"}
          </p>
        </div>
        <MiniCourbe valeurs={ligne.courbe} ton={tonVariation(ligne.var1m)} />
      </header>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="chiffres text-2xl font-semibold tracking-tight">{formaterNombre(ligne.cloture, ligne.decimales)}</span>
        <span className={`chiffres text-sm font-medium ${ton === "hausse" ? "text-hausse" : ton === "baisse" ? "text-baisse" : "text-attenue"}`}>
          {formaterPct(ligne.var1j)}
        </span>
        <span className="chiffres text-xs text-attenue">
          {formaterPct(ligne.var1m, 1)} / 1 mois · {formaterPct(ligne.varAnnee, 1)} depuis janv.
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <PositionMoyenne libelle="MM20" cloture={ligne.cloture} moyenne={ligne.mm20} />
        <PositionMoyenne libelle="MM50" cloture={ligne.cloture} moyenne={ligne.mm50} />
      </div>
      <Horodatage iso={ligne.majLe} source={libelleSource(ligne.source)} seuilHeures={30} />
    </article>
  );
}
