"use client";

import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  LineSeries,
  LineStyle,
  type IChartApi,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { Horodatage } from "@/components/horodatage";
import { useLangue } from "@/components/langue";
import { CLASSES, libelleSource } from "@/lib/sources";

// Même nom d'événement que le moniteur (un clic sur une ligne ouvre l'instrument ici).
const EVENEMENT_GRAPHIQUE = "deepwater:graphique";

interface Point {
  date: string;
  ouverture: number | null;
  plus_haut: number | null;
  plus_bas: number | null;
  cloture: number;
  mm20: number | null;
  mm50: number | null;
}
interface Serie {
  ticker: { symbole: string; nom: string; note_source: string | null };
  points: Point[];
  source: string | null;
  majLe: string | null;
}

const PERIODES = [
  { cle: "3m", fr: "3M", en: "3M" },
  { cle: "6m", fr: "6M", en: "6M" },
  { cle: "1a", fr: "1A", en: "1Y" },
  { cle: "3a", fr: "3A", en: "3Y" },
  { cle: "10a", fr: "10A", en: "10Y" },
] as const;

const MM = { mm20: "#fbbf24", mm50: "#38bdf8" };

// Couleurs du thème choisi (variables CSS posées sur <html>), lues au moment du rendu et
// converties par le navigateur en « rgb(a)(…) », seule syntaxe comprise par le graphique.
function couleursTheme() {
  const temoin = document.createElement("span");
  document.body.appendChild(temoin);
  const lire = (nom: string) => {
    temoin.style.color = `var(${nom})`;
    return getComputedStyle(temoin).color;
  };
  const accent = lire("--color-accent");
  const [r, g, b] = accent.match(/[\d.]+/g)?.map(Number) ?? [124, 108, 255];
  const couleurs = {
    accent,
    accentHaut: `rgba(${r}, ${g}, ${b}, 0.28)`,
    accentBas: `rgba(${r}, ${g}, ${b}, 0)`,
    texte: lire("--color-attenue"),
    grille: lire("--color-bordure"),
    hausse: lire("--color-hausse"),
    baisse: lire("--color-baisse"),
  };
  temoin.remove();
  return couleurs;
}

export function GraphiquePrix({ instruments, initial }: { instruments: { symbole: string; nom: string; classe: string }[]; initial?: string }) {
  const { langue, t, locale } = useLangue();
  const conteneur = useRef<HTMLDivElement>(null);
  const graphique = useRef<IChartApi | null>(null);
  const [symbole, setSymbole] = useState(initial ?? instruments[0]?.symbole ?? "");
  const [periode, setPeriode] = useState<(typeof PERIODES)[number]["cle"]>("1a");
  // L'état d'affichage découle de la série demandée et de la dernière réponse reçue.
  const demandee = `${symbole}|${periode}`;
  const [reponse, setReponse] = useState<{ cle: string; serie: Serie | null; erreur: boolean } | null>(null);
  const serie = reponse?.cle === demandee ? reponse.serie : null;
  const etat = reponse?.cle !== demandee ? "chargement" : reponse.erreur ? "erreur" : "pret";

  // Sélection depuis le moniteur multi-actifs.
  useEffect(() => {
    const ouvrir = (e: Event) => {
      const choisi = (e as CustomEvent<string>).detail;
      if (instruments.some((i) => i.symbole === choisi)) setSymbole(choisi);
    };
    window.addEventListener(EVENEMENT_GRAPHIQUE, ouvrir);
    return () => window.removeEventListener(EVENEMENT_GRAPHIQUE, ouvrir);
  }, [instruments]);

  // Chargement de la série (lecture en base via /api/series).
  useEffect(() => {
    if (!symbole) return;
    const cle = `${symbole}|${periode}`;
    const controleur = new AbortController();
    fetch(`/api/series?symbole=${encodeURIComponent(symbole)}&periode=${periode}`, { signal: controleur.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((donnees: Serie) => setReponse({ cle, serie: donnees, erreur: false }))
      .catch((e) => {
        if (e.name !== "AbortError") setReponse({ cle, serie: null, erreur: true });
      });
    return () => controleur.abort();
  }, [symbole, periode]);

  // Rendu du graphique : zoom à la molette et au pincement, déplacement au glisser.
  useEffect(() => {
    if (!conteneur.current || !serie || serie.points.length === 0) return;
    const COULEURS = couleursTheme();
    const chart = createChart(conteneur.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: COULEURS.texte,
        fontFamily: getComputedStyle(document.body).fontFamily,
        attributionLogo: false,
      },
      localization: { locale },
      grid: { vertLines: { color: COULEURS.grille }, horzLines: { color: COULEURS.grille } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, rightOffset: 4 },
      crosshair: { mode: CrosshairMode.Magnet },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
    });
    graphique.current = chart;

    const ohlc = serie.points.every((p) => p.ouverture !== null && p.plus_haut !== null && p.plus_bas !== null);
    if (ohlc) {
      chart.addSeries(CandlestickSeries, {
        upColor: COULEURS.hausse,
        downColor: COULEURS.baisse,
        borderVisible: false,
        wickUpColor: COULEURS.hausse,
        wickDownColor: COULEURS.baisse,
      }).setData(
        serie.points.map((p) => ({
          time: p.date,
          open: p.ouverture as number,
          high: p.plus_haut as number,
          low: p.plus_bas as number,
          close: p.cloture,
        })),
      );
    } else {
      chart.addSeries(AreaSeries, {
        lineColor: COULEURS.accent,
        topColor: COULEURS.accentHaut,
        bottomColor: COULEURS.accentBas,
        lineWidth: 2,
        priceLineVisible: false,
      }).setData(serie.points.map((p) => ({ time: p.date, value: p.cloture })));
    }
    for (const [cle, couleur] of [["mm20", MM.mm20], ["mm50", MM.mm50]] as const) {
      chart.addSeries(LineSeries, {
        color: couleur,
        lineWidth: 1,
        lineStyle: cle === "mm50" ? LineStyle.Dashed : LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      }).setData(serie.points.filter((p) => p[cle] !== null).map((p) => ({ time: p.date, value: p[cle] as number })));
    }
    chart.timeScale().fitContent();
    return () => {
      chart.remove();
      graphique.current = null;
    };
  }, [serie, locale]);

  const ohlc = serie?.points.every((p) => p.ouverture !== null) ?? false;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="min-w-0">
          <span className="sr-only">{t("Instrument", "Instrument")}</span>
          <select
            value={symbole}
            onChange={(e) => setSymbole(e.target.value)}
            className="max-w-full rounded-xl border border-bordure bg-surface-2 px-3 py-2 text-sm font-medium focus:border-accent/60"
          >
            {CLASSES.map((c) => {
              const liste = instruments.filter((i) => i.classe === c.cle);
              return liste.length === 0 ? null : (
                <optgroup key={c.cle} label={t(c.fr, c.en)}>
                  {liste.map((i) => (
                    <option key={i.symbole} value={i.symbole}>{i.nom}</option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </label>
        <div className="flex gap-1 rounded-xl bg-surface-2 p-1" role="tablist" aria-label={t("Période", "Period")}>
          {PERIODES.map((p) => (
            <button
              key={p.cle}
              role="tab"
              aria-selected={periode === p.cle}
              onClick={() => setPeriode(p.cle)}
              className={`chiffres rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                periode === p.cle ? "bg-surface-3 text-texte" : "text-attenue hover:text-texte"
              }`}
            >
              {t(p.fr, p.en)}
            </button>
          ))}
        </div>
      </div>

      <div className="relative h-[clamp(16rem,42vh,26rem)] w-full touch-none overflow-hidden rounded-xl">
        <div ref={conteneur} className="absolute inset-0" />
        {etat !== "pret" && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-attenue">
            {etat === "chargement" ? <span className="animate-chargement">{t("Chargement…", "Loading…")}</span> : t("Série indisponible pour le moment.", "Series unavailable for now.")}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-attenue">
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-accent" /> {ohlc ? t("Chandeliers", "Candles") : t("Clôture", "Close")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-[#fbbf24]" /> {t("MM20", "MA20")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded border-t border-dashed border-[#38bdf8]" /> {t("MM50", "MA50")}
          </span>
          <span>{t("Molette ou pincement : zoom · glisser : déplacer", "Wheel or pinch: zoom · drag: pan")}</span>
        </span>
        {serie && <Horodatage iso={serie.majLe} source={libelleSource(serie.source, langue)} seuilHeures={30} />}
      </div>
      {serie?.ticker.note_source && !ohlc && <p className="text-xs text-discret">{serie.ticker.note_source}</p>}
    </div>
  );
}
