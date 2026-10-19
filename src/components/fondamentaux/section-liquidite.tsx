import { Carte, Pastille } from "@/components/carte";
import { MiniCourbe } from "@/components/marches/mini-courbe";
import type { EtatFondamentaux } from "@/lib/fondamentaux";
import { formaterDateSeance, formaterNombre, formaterPct, formaterPeriode } from "@/lib/format";
import { type Langue, traducteur } from "@/lib/i18n";

const md = (v: number | null, langue: Langue) => (v === null ? "—" : `${formaterNombre(v, 0, langue)} ${langue === "en" ? "$bn" : "Md$"}`);
const mdSigne = (v: number | null, langue: Langue) => (v === null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${md(Math.abs(v), langue)}`);

// Barre de centile (0 à 100 %) avec repères des extrêmes à 20 % et 80 %.
function Centile({ c }: { c: number }) {
  const ton = c >= 0.8 ? "bg-baisse" : c <= 0.2 ? "bg-hausse" : "bg-neutre";
  return (
    <span className="relative block h-1.5 w-24 shrink-0 rounded-full bg-surface-3" aria-hidden>
      <span className="absolute inset-y-0 left-[20%] w-px bg-bordure" />
      <span className="absolute inset-y-0 left-[80%] w-px bg-bordure" />
      <span className={`absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${ton}`} style={{ left: `${c * 100}%` }} />
    </span>
  );
}

// Liquidité de la Fed (bilan, compte du Trésor, prises en pension, M2) et positionnement
// des fonds à effet de levier (rapport COT de la CFTC).
export function SectionLiquidite({ f, langue }: { f: EtatFondamentaux; langue: Langue }) {
  const t = traducteur(langue);
  const l = f.liquidite;
  return (
    <Carte
      titre={t("Liquidité et positionnement", "Liquidity and positioning")}
      sousTitre={l.date ? `${t("Liquidité nette au", "Net liquidity as of")} ${formaterDateSeance(l.date, langue)}` : t("En attente des données", "Waiting for data")}
      pied={
        <p className="text-xs text-attenue">
          {t(
            "Liquidité nette = bilan de la Fed − compte du Trésor (TGA) − prises en pension inversées (RRP) : l'argent effectivement disponible pour le système financier. COT : position nette des fonds à effet de levier en part de l'intérêt ouvert, rangée parmi ses 3 dernières années ; au-delà du centile 80 (ou en deçà de 20), le positionnement est extrême et fragile. Sources : FRED (WALCL, WTREGEN, RRPONTSYD, M2SL), CFTC (Traders in Financial Futures, publié le vendredi pour le mardi).",
            "Net liquidity = Fed balance sheet − Treasury General Account (TGA) − reverse repos (RRP): the money actually available to the financial system. COT: leveraged funds' net position as a share of open interest, ranked over its last 3 years; above the 80th (or below the 20th) percentile, positioning is extreme and fragile. Sources: FRED (WALCL, WTREGEN, RRPONTSYD, M2SL), CFTC (Traders in Financial Futures, released Friday for Tuesday).",
          )}
        </p>
      }
    >
      <div className="flex flex-col gap-5">
        {l.nette === null ? (
          <p className="text-sm text-attenue">{t("Liquidité de la Fed indisponible.", "Fed liquidity unavailable.")}</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="chiffres text-2xl font-semibold">{md(l.nette, langue)}</span>
                <span className="chiffres text-sm text-attenue">{mdSigne(l.var4s, langue)} {t("en 4 semaines", "over 4 weeks")}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-attenue">
                <MiniCourbe valeurs={l.historique} ton={l.var4s === null || Math.abs(l.var4s) < 25 ? "neutre" : l.var4s > 0 ? "hausse" : "baisse"} />
                {t("1 an", "1 year")}
              </div>
            </div>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                [t("Bilan de la Fed", "Fed balance sheet"), md(l.bilan, langue)],
                [t("Compte du Trésor", "Treasury account"), md(l.tga, langue)],
                [t("Prises en pension inv.", "Reverse repos"), md(l.rrp, langue)],
                [`M2 ${t("sur 1 an", "y/y")}`, l.m2 ? `${formaterPct(l.m2.sur1an, 1, true, langue)} (${formaterPeriode(l.m2.date, "mois", langue)})` : "—"],
              ].map(([nom, valeur]) => (
                <li key={nom} className="flex min-w-0 flex-col rounded-xl bg-surface-2 px-3 py-2">
                  <span className="truncate text-xs text-attenue">{nom}</span>
                  <span className="chiffres text-sm font-medium">{valeur}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="border-t border-bordure pt-4">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-attenue">{t("Positionnement des fonds (COT)", "Fund positioning (COT)")}</h3>
          {f.cot.length === 0 ? (
            <p className="text-sm text-attenue">{t("Rapport COT indisponible.", "COT report unavailable.")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-bordure">
              {f.cot.map((c) => (
                <li key={c.code} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1.5 text-sm">
                  <span className="min-w-0 flex-1">{langue === "en" ? c.en : c.fr}</span>
                  <span className="chiffres w-20 text-right" title={t("Part de l'intérêt ouvert", "Share of open interest")}>{formaterPct(c.net * 100, 1, true, langue)}</span>
                  <span className="chiffres w-16 text-right text-xs text-attenue" title={t("Variation sur une semaine", "One-week change")}>
                    {c.variation === null ? "—" : formaterPct(c.variation * 100, 1, true, langue)}
                  </span>
                  <span className="flex items-center gap-2">
                    <Centile c={c.centile} />
                    <span className="chiffres w-9 text-right text-xs">{formaterNombre(c.centile * 100, 0, langue)}</span>
                  </span>
                  {(c.centile >= 0.8 || c.centile <= 0.2) && (
                    <Pastille ton="alerte">{c.centile >= 0.8 ? t("acheteurs extrêmes", "extreme long") : t("vendeurs extrêmes", "extreme short")}</Pastille>
                  )}
                </li>
              ))}
            </ul>
          )}
          {f.cot[0] && <p className="mt-2 text-[0.7rem] text-discret">{t("Positions au", "Positions as of")} {formaterDateSeance(f.cot[0].date, langue)}</p>}
        </div>
      </div>
    </Carte>
  );
}
