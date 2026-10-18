import { Horodatage } from "@/components/horodatage";
import { formaterDateSeance, formaterNombre, formaterPct, tonVariation } from "@/lib/format";
import { type Langue, traducteur } from "@/lib/i18n";
import { type LigneMarche, nomInstrument } from "@/lib/marches";
import { libelleSource } from "@/lib/sources";
import { MiniCourbe } from "./mini-courbe";

// Carte d'un indice prioritaire (S&P 500, Nasdaq-100). `derniereSeance` : séance la plus
// récente parmi les indices, pour signaler une variation qui porte sur un autre jour.
export function CarteInstrument({ ligne, langue, derniereSeance, delai = 0 }: { ligne: LigneMarche; langue: Langue; derniereSeance?: string; delai?: number }) {
  const t = traducteur(langue);
  const ton = tonVariation(ligne.var1j);
  const enRetard = derniereSeance !== undefined && ligne.date < derniereSeance;
  return (
    <article
      style={{ animationDelay: `${delai}ms` }}
      className="carte flex min-w-0 flex-col gap-3 rounded-carte border border-bordure bg-surface p-5 animate-apparition"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold tracking-tight">{nomInstrument(ligne, langue)}</h3>
          <p className={`text-xs ${ligne.ancienne ? "text-alerte" : "text-attenue"}`}>
            {t("Clôture du", "Close of")} {formaterDateSeance(ligne.date, langue)}
            {ligne.ancienne && ` · ${t("ancienne", "stale")}`}
          </p>
        </div>
        <MiniCourbe valeurs={ligne.courbe} ton={tonVariation(ligne.var1m)} />
      </header>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="chiffres text-2xl font-semibold tracking-tight">{formaterNombre(ligne.cloture, ligne.decimales, langue)}</span>
        <span className={`chiffres text-sm font-medium ${ton === "hausse" ? "text-hausse" : ton === "baisse" ? "text-baisse" : "text-attenue"}`}>
          {formaterPct(ligne.var1j, 2, true, langue)}
        </span>
        <span className="chiffres text-xs text-attenue">
          {formaterPct(ligne.var1m, 1, true, langue)} / {t("1 mois", "1 mo")} · {formaterPct(ligne.varAnnee, 1, true, langue)} {t("depuis janv.", "YTD")}
        </span>
      </div>
      {enRetard && (
        <p className="text-xs text-alerte">
          {t(
            `Variation de la séance du ${formaterDateSeance(ligne.date, langue)} : FRED n'a pas encore publié celle du ${formaterDateSeance(derniereSeance, langue)}.`,
            `Change for the ${formaterDateSeance(ligne.date, langue)} session: FRED has not yet published ${formaterDateSeance(derniereSeance, langue)}.`,
          )}
        </p>
      )}
      <Horodatage iso={ligne.majLe} source={libelleSource(ligne.source, langue)} seuilHeures={30} />
    </article>
  );
}
