import { Carte, Pastille } from "@/components/carte";
import type { EtatFondamentaux } from "@/lib/fondamentaux";
import { formaterDateSeance, formaterNombre, formaterPb, pct } from "@/lib/format";
import { type Langue, traducteur } from "@/lib/i18n";

// « +1,2 hausse » / « −0,8 baisse » : nombre de mouvements de 25 pb anticipés.
function Mouvements({ n, langue }: { n: number; langue: Langue }) {
  const t = traducteur(langue);
  const ton = Math.abs(n) < 0.4 ? "neutre" : n > 0 ? "baisse" : "hausse";
  const sens = Math.abs(n) < 0.4 ? t("statu quo", "on hold") : n > 0 ? t("hausse(s)", "hike(s)") : t("baisse(s)", "cut(s)");
  return (
    <Pastille ton={ton}>
      {Math.abs(n) < 0.4 ? sens : `${formaterNombre(Math.abs(n), 1, langue)} ${sens}`}
    </Pastille>
  );
}

// Anticipations de taux de la Fed par les bons du Trésor, prime de terme et taux de la zone euro.
export function SectionAnticipations({ f, langue }: { f: EtatFondamentaux; langue: Langue }) {
  const t = traducteur(langue);
  const { anticipations: a, primeTerme, europe } = f;
  return (
    <Carte
      titre={t("Anticipations de taux", "Rate expectations")}
      sousTitre={a.ffr
        ? `${t("Fed funds effectif", "Effective Fed funds")} ${formaterNombre(a.ffr.taux, 2, langue)}${pct(langue)} · ${t("au", "as of")} ${formaterDateSeance(a.date ?? a.ffr.date, langue)}`
        : t("En attente des données", "Waiting for data")}
      pied={
        <p className="text-xs text-attenue">
          {t(
            "Le rendement d'un bon du Trésor est proche de la moyenne du taux directeur attendue jusqu'à son échéance ; le taux après chaque réunion est le taux à terme entre deux échéances. C'est une approximation gratuite des futures sur Fed funds, décalée de quelques points de base (prime de terme, écart entre bons et Fed funds). Sources : FRED (DGS1MO à DGS2, DFF, THREEFYTP10), BCE (courbe AAA de la zone euro).",
            "A Treasury bill yield is close to the average policy rate expected until it matures; the rate after each meeting is the forward rate between two maturities. A free approximation of Fed funds futures, off by a few basis points (term premium, bill/Fed funds spread). Sources: FRED (DGS1MO to DGS2, DFF, THREEFYTP10), ECB (euro area AAA curve).",
          )}
        </p>
      }
    >
      {a.echeances.length === 0 ? (
        <p className="text-sm text-attenue">{t("Pas encore de données.", "No data yet.")}</p>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[22rem] text-sm">
              <thead className="text-left text-xs text-attenue">
                <tr>
                  <th className="pb-2 font-medium">{t("Échéance", "Maturity")}</th>
                  <th className="pb-2 text-right font-medium">{t("Taux", "Yield")}</th>
                  <th className="pb-2 text-right font-medium">{t("Écart aux Fed funds", "vs Fed funds")}</th>
                  <th className="pb-2 text-right font-medium">{t("Sur 1 mois", "1-month change")}</th>
                  <th className="pb-2 text-right font-medium">{t("Mouvements de 25 pb", "25 bp moves")}</th>
                </tr>
              </thead>
              <tbody className="chiffres">
                {a.echeances.map((e) => (
                  <tr key={e.symbole} className="border-t border-bordure">
                    <td className="py-1.5">{langue === "en" ? e.en : e.fr}</td>
                    <td className="py-1.5 text-right">{formaterNombre(e.taux, 2, langue)}{pct(langue)}</td>
                    <td className="py-1.5 text-right">{formaterPb(e.ecartPb, langue)}</td>
                    <td className="py-1.5 text-right text-attenue">{formaterPb(e.var1mPb, langue)}</td>
                    <td className="py-1.5 text-right"><Mouvements n={e.mouvements} langue={langue} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {a.reunions.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-attenue">{t("Réunion par réunion (FOMC)", "Meeting by meeting (FOMC)")}</h3>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {a.reunions.map((r) => (
                  <li key={r.date} className="flex flex-col gap-1 rounded-xl bg-surface-2 px-3 py-2">
                    <span className="text-xs text-attenue">
                      {formaterDateSeance(r.date, langue)}{r.provisoire ? ` (${t("provisoire", "tentative")})` : ""}
                    </span>
                    <span className="chiffres text-base font-semibold">{formaterNombre(r.implicite, 2, langue)}{pct(langue)}</span>
                    <span className="chiffres text-xs text-attenue">{formaterPb(r.ecartPb, langue)} {t("cumulés", "cumulative")}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-3 border-t border-bordure pt-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-attenue">{t("Prime de terme à 10 ans (Kim-Wright)", "10-year term premium (Kim-Wright)")}</span>
              {primeTerme ? (
                <span className="chiffres text-sm">
                  <span className="text-base font-semibold">{formaterNombre(primeTerme.valeur, 2, langue)}{pct(langue)}</span>{" "}
                  <span className="text-attenue">({formaterPb(primeTerme.var1mPb, langue)} {t("sur 1 mois, au", "over 1 month, as of")} {formaterDateSeance(primeTerme.date, langue, false)})</span>
                </span>
              ) : <span className="text-sm text-discret">{t("indisponible", "unavailable")}</span>}
              <span className="text-[0.7rem] text-discret">
                {t("Rémunération exigée pour détenir du long terme plutôt que de renouveler du court : une prime qui monte tend les taux longs sans que la Fed bouge.", "Extra yield demanded to hold long bonds instead of rolling short ones: a rising premium lifts long rates without the Fed moving.")}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-attenue">{t("Zone euro (courbe AAA de la BCE)", "Euro area (ECB AAA curve)")}</span>
              {europe ? (
                <div className="chiffres flex flex-col gap-0.5 text-sm">
                  <span>2 {t("ans", "y")} {formaterNombre(europe.eu2, 2, langue)}{pct(langue)} · 10 {t("ans", "y")} {formaterNombre(europe.eu10, 2, langue)}{pct(langue)}</span>
                  {europe.us10 !== null && (
                    <span className="text-attenue">
                      {t("Écart US − zone euro à 10 ans", "US − euro area 10-year spread")} {formaterPb((europe.us10 - europe.eu10) * 100, langue)}
                      {europe.ecart10Var1mPb !== null && ` (${formaterPb(europe.ecart10Var1mPb, langue)} ${t("sur 1 mois", "over 1 month")})`}
                    </span>
                  )}
                  {europe.us2 !== null && (
                    <span className="text-attenue">{t("Écart à 2 ans", "2-year spread")} {formaterPb((europe.us2 - europe.eu2) * 100, langue)}</span>
                  )}
                </div>
              ) : <span className="text-sm text-discret">{t("indisponible", "unavailable")}</span>}
              <span className="text-[0.7rem] text-discret">
                {t("Un écart de taux qui se creuse en faveur des États-Unis soutient le dollar face à l'euro.", "A spread widening in favor of the US supports the dollar against the euro.")}
              </span>
            </div>
          </div>
        </div>
      )}
    </Carte>
  );
}
