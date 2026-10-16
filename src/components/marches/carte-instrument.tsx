import { Pastille } from "@/components/carte";
import { Horodatage } from "@/components/horodatage";
import { decimalesPour, formaterDateSeance, formaterNombre, formaterPct, tonVariation } from "@/lib/format";
import { clotureAncienne, libelleSource, type ResumeInstrument } from "@/lib/marches";
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

export function CarteInstrument({ resume, delai = 0 }: { resume: ResumeInstrument; delai?: number }) {
  const { ticker, derniere, variationPct, tendance } = resume;
  const ton = tonVariation(variationPct);
  const ancienne = clotureAncienne(derniere?.date);

  return (
    <article
      style={{ animationDelay: `${delai}ms` }}
      className="flex min-w-0 flex-col gap-4 rounded-carte border border-bordure bg-surface p-5 animate-apparition"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold tracking-tight">{ticker.nom}</h3>
          <p className="text-xs text-attenue">{ticker.symbole}</p>
        </div>
        <MiniCourbe valeurs={tendance} ton={ton} />
      </header>

      {derniere ? (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="chiffres text-2xl font-semibold tracking-tight">
              {formaterNombre(Number(derniere.cloture), decimalesPour(Number(derniere.cloture)))}
            </span>
            <span className={`chiffres text-sm font-medium ${ton === "hausse" ? "text-hausse" : ton === "baisse" ? "text-baisse" : "text-attenue"}`}>
              {formaterPct(variationPct)}
            </span>
            <span className={`text-xs ${ancienne ? "text-alerte" : "text-attenue"}`}>
              Clôture du {formaterDateSeance(derniere.date)}
              {ancienne && " · ancienne"}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <PositionMoyenne libelle="MM20" cloture={Number(derniere.cloture)} moyenne={derniere.mm20 === null ? null : Number(derniere.mm20)} />
            <PositionMoyenne libelle="MM50" cloture={Number(derniere.cloture)} moyenne={derniere.mm50 === null ? null : Number(derniere.mm50)} />
          </div>
          <Horodatage iso={derniere.maj_le} source={libelleSource(derniere.source_donnee)} seuilHeures={30} />
        </>
      ) : (
        <p className="text-sm text-attenue">Données pas encore collectées.</p>
      )}
    </article>
  );
}
