"use client";

import { useState } from "react";
import { Carte, Pastille } from "@/components/carte";
import { useLangue } from "@/components/langue";
import type { Composante, Couverture, Regime } from "@/lib/analyse";
import { formaterDateSeance, formaterNombre, formaterPb, formaterPct } from "@/lib/format";

const COMPOSANTES: Record<Composante["cle"], { fr: string; en: string; aideFr: string; aideEn: string }> = {
  actions: { fr: "S&P 500", en: "S&P 500", aideFr: "hausse = appétit pour le risque", aideEn: "up = risk appetite" },
  volatilite: { fr: "VIX", en: "VIX", aideFr: "baisse = risk-on", aideEn: "down = risk-on" },
  credit: { fr: "Spread haut rendement", en: "High-yield spread", aideFr: "resserrement = risk-on", aideEn: "tightening = risk-on" },
  audjpy: { fr: "AUD/JPY", en: "AUD/JPY", aideFr: "devise de risque contre refuge", aideEn: "risk currency vs haven" },
  franc: { fr: "USD/CHF", en: "USD/CHF", aideFr: "franc faible = risk-on", aideEn: "weak franc = risk-on" },
  or: { fr: "Or", en: "Gold", aideFr: "hausse = recherche de refuge", aideEn: "up = haven demand" },
};

const COUVERTURES: Record<Couverture["cle"], { fr: string; en: string }> = {
  or: { fr: "Or", en: "Gold" },
  yen: { fr: "Yen", en: "Yen" },
  franc: { fr: "Franc suisse", en: "Swiss franc" },
  obligations: { fr: "Obligations du Trésor (10 ans)", en: "Treasuries (10Y)" },
};

const NOMS_COURTS: Record<string, string> = { SPX: "S&P", NDX: "NDX", US10Y: "10Y", VIX: "VIX", EURUSD: "EUR", USDJPY: "JPY*", AUDUSD: "AUD", XAU: "Or", WTI: "WTI", BTC: "BTC" };

function Barre({ note }: { note: number | null }) {
  if (note === null) return <div className="h-1.5 rounded-full bg-surface-3" aria-hidden />;
  const largeur = Math.abs(note) * 50;
  return (
    <div className="relative h-1.5 rounded-full bg-surface-3" aria-hidden>
      <div className="absolute inset-y-0 left-1/2 w-px bg-bordure-forte" />
      <div
        className={`absolute inset-y-0 rounded-full ${note >= 0 ? "bg-hausse/80" : "bg-baisse/80"}`}
        style={note >= 0 ? { left: "50%", width: `${largeur}%` } : { left: `${50 - largeur}%`, width: `${largeur}%` }}
      />
    </div>
  );
}

// Couleur d'une cellule : vert = corrélation positive, rouge = négative, intensité = force.
function fondCorrelation(c: number | null): string {
  if (c === null) return "transparent";
  const couleur = c >= 0 ? "var(--color-hausse)" : "var(--color-baisse)";
  return `color-mix(in srgb, ${couleur} ${Math.round(Math.abs(c) * 55)}%, transparent)`;
}

export function SectionRegime({ regime, couvertures, correlations20, correlations60, actifs }: {
  regime: Regime;
  couvertures: Couverture[];
  correlations20: (number | null)[][];
  correlations60: (number | null)[][];
  actifs: string[];
}) {
  const { langue, t } = useLangue();
  const [fenetre, setFenetre] = useState<20 | 60>(60);
  const matrice = fenetre === 20 ? correlations20 : correlations60;
  const etat = {
    "risk-on": { texte: "Risk-on", ton: "hausse" as const, aide: t("Appétit pour le risque : actions, devises de matières premières", "Risk appetite: equities, commodity currencies") },
    "risk-off": { texte: "Risk-off", ton: "baisse" as const, aide: t("Aversion au risque : refuges (JPY, CHF, USD, or, obligations)", "Risk aversion: havens (JPY, CHF, USD, gold, bonds)") },
    neutre: { texte: t("Neutre", "Neutral"), ton: "neutre" as const, aide: t("Signaux partagés", "Mixed signals") },
    indisponible: { texte: t("Indisponible", "Unavailable"), ton: "neutre" as const, aide: t("Données insuffisantes", "Not enough data") },
  }[regime.etat];
  const valeur = (c: Composante) =>
    c.valeur === null ? "—" : c.unite === "pct" ? formaterPct(c.valeur, 1, true, langue) : c.unite === "pb" ? formaterPb(c.valeur, langue) : `${c.valeur > 0 ? "+" : c.valeur < 0 ? "−" : ""}${formaterNombre(Math.abs(c.valeur), 1, langue)} pt`;
  // Une corrélation proche de zéro ne couvre rien : seuil de -0,2.
  const meilleure = couvertures[0] && couvertures[0].correlation <= -0.2 ? couvertures[0] : null;

  return (
    <Carte
      titre={t("Régime de marché", "Market regime")}
      sousTitre={`${t("Variations sur 5 séances", "Changes over 5 sessions")}${regime.date ? ` · ${t("au", "as of")} ${formaterDateSeance(regime.date, langue)}` : ""}`}
      actions={<Pastille ton={etat.ton}>{etat.texte}{regime.score !== null && ` ${regime.score > 0 ? "+" : regime.score < 0 ? "−" : ""}${Math.round(Math.abs(regime.score) * 100)}`}</Pastille>}
      pied={
        <p className="text-xs text-discret">
          {t(
            "Scoring par règles sur les clôtures officielles (FRED, BCE, Alpha Vantage) ; ni prédiction ni conseil. Corrélations des variations quotidiennes ; JPY* = USD/JPY (une corrélation positive avec le S&P signifie que le yen baisse quand les actions montent).",
            "Rules-based score on official closes (FRED, ECB, Alpha Vantage); neither forecast nor advice. Correlations of daily changes; JPY* = USD/JPY (a positive correlation with the S&P means the yen falls when stocks rise).",
          )}
        </p>
      }
    >
      <div className="flex flex-col gap-5">
        <p className="text-sm text-attenue">{etat.aide}.</p>
        <ul className="flex flex-col gap-2.5">
          {regime.composantes.map((c) => (
            <li key={c.cle} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1">
              <span className="truncate text-sm">
                {t(COMPOSANTES[c.cle].fr, COMPOSANTES[c.cle].en)} <span className="text-xs text-discret">· {t(COMPOSANTES[c.cle].aideFr, COMPOSANTES[c.cle].aideEn)}</span>
              </span>
              <span className="chiffres text-right text-sm font-medium">{valeur(c)}</span>
              <div className="col-span-2"><Barre note={c.note} /></div>
            </li>
          ))}
        </ul>

        <div className="rounded-xl bg-surface-2 p-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-discret">{t("Couverture des actions", "Equity hedge")}</h3>
          {couvertures.length > 0 ? (
            <>
              <p className="mt-1 text-sm">
                {meilleure ? (
                  <>
                    {t("Meilleure couverture actuelle (60 séances) :", "Best current hedge (60 sessions):")}{" "}
                    <span className="font-semibold">{t(COUVERTURES[meilleure.cle].fr, COUVERTURES[meilleure.cle].en)}</span>{" "}
                    <span className="chiffres text-attenue">({t("corrélation", "correlation")} {formaterNombre(meilleure.correlation, 2, langue)})</span>
                  </>
                ) : (
                  t("Aucune couverture efficace en ce moment : pas de corrélation nettement négative avec le S&P 500.", "No effective hedge right now: no clearly negative correlation with the S&P 500.")
                )}
              </p>
              <p className="chiffres mt-1 flex flex-wrap gap-x-3 text-xs text-attenue">
                {couvertures.slice(meilleure ? 1 : 0).map((c) => (
                  <span key={c.cle}>{t(COUVERTURES[c.cle].fr, COUVERTURES[c.cle].en)} {formaterNombre(c.correlation, 2, langue)}</span>
                ))}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-attenue">{t("Historique insuffisant.", "Not enough history.")}</p>
          )}
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-discret">{t("Corrélations", "Correlations")}</h3>
            <div role="tablist" className="flex gap-1 rounded-lg bg-surface-2 p-0.5">
              {([20, 60] as const).map((n) => (
                <button
                  key={n}
                  role="tab"
                  aria-selected={fenetre === n}
                  onClick={() => setFenetre(n)}
                  className={`chiffres rounded-md px-2 py-0.5 text-xs ${fenetre === n ? "bg-surface-3 text-texte" : "text-attenue hover:text-texte"}`}
                >
                  {n} {t("séances", "sessions")}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="chiffres w-full border-separate border-spacing-0.5 text-[0.7rem]">
              <thead>
                <tr>
                  <th />
                  {actifs.map((a) => <th key={a} className="px-1 py-0.5 font-medium text-discret">{langue === "en" && a === "XAU" ? "Gold" : NOMS_COURTS[a] ?? a}</th>)}
                </tr>
              </thead>
              <tbody>
                {actifs.map((a, i) => (
                  <tr key={a}>
                    <th className="whitespace-nowrap pr-1 text-left font-medium text-discret">{langue === "en" && a === "XAU" ? "Gold" : NOMS_COURTS[a] ?? a}</th>
                    {actifs.map((b, j) => {
                      const c = matrice[i]?.[j] ?? null;
                      return (
                        <td
                          key={b}
                          title={`${a} / ${b}`}
                          style={{ background: i === j ? "var(--color-surface-3)" : fondCorrelation(c) }}
                          className="min-w-9 rounded px-1 py-1 text-center"
                        >
                          {i === j ? "" : c === null ? "·" : formaterNombre(c, 1, langue)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Carte>
  );
}
