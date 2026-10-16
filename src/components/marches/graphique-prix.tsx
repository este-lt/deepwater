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
  { cle: "3m", libelle: "3M" },
  { cle: "6m", libelle: "6M" },
  { cle: "1a", libelle: "1A" },
  { cle: "3a", libelle: "3A" },
  { cle: "10a", libelle: "10A" },
] as const;

const COULEURS = { accent: "#7c6cff", mm20: "#fbbf24", mm50: "#38bdf8", texte: "#8d94a7", grille: "rgba(255,255,255,0.05)" };

function libelleSource(source: string | null): string {
  if (!source) return "source inconnue";
  if (source.startsWith("fred:")) return "FRED (Fed de St. Louis)";
  if (source.startsWith("alpha_vantage:")) return "Alpha Vantage";
  return source;
}

export function GraphiquePrix({ instruments }: { instruments: { symbole: string; nom: string }[] }) {
  const conteneur = useRef<HTMLDivElement>(null);
  const graphique = useRef<IChartApi | null>(null);
  const [symbole, setSymbole] = useState(instruments[0]?.symbole ?? "");
  const [periode, setPeriode] = useState<(typeof PERIODES)[number]["cle"]>("1a");
  // L'état d'affichage découle de la série demandée et de la dernière réponse reçue.
  const demandee = `${symbole}|${periode}`;
  const [reponse, setReponse] = useState<{ cle: string; serie: Serie | null; erreur: boolean } | null>(null);
  const serie = reponse?.cle === demandee ? reponse.serie : null;
  const etat = reponse?.cle !== demandee ? "chargement" : reponse.erreur ? "erreur" : "pret";

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
    const chart = createChart(conteneur.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: COULEURS.texte,
        fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
        attributionLogo: false,
      },
      localization: { locale: "fr-FR" },
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
        upColor: "#34d399",
        downColor: "#f87171",
        borderVisible: false,
        wickUpColor: "#34d399",
        wickDownColor: "#f87171",
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
        topColor: "rgba(124,108,255,0.28)",
        bottomColor: "rgba(124,108,255,0)",
        lineWidth: 2,
        priceLineVisible: false,
      }).setData(serie.points.map((p) => ({ time: p.date, value: p.cloture })));
    }
    for (const [cle, couleur] of [["mm20", COULEURS.mm20], ["mm50", COULEURS.mm50]] as const) {
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
  }, [serie]);

  const ohlc = serie?.points.every((p) => p.ouverture !== null) ?? false;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-xl bg-surface-2 p-1" role="tablist" aria-label="Instrument">
          {instruments.map((i) => (
            <button
              key={i.symbole}
              role="tab"
              aria-selected={symbole === i.symbole}
              onClick={() => setSymbole(i.symbole)}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                symbole === i.symbole ? "bg-surface-3 text-texte shadow-sm" : "text-attenue hover:text-texte"
              }`}
            >
              {i.nom}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-xl bg-surface-2 p-1" role="tablist" aria-label="Période">
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
              {p.libelle}
            </button>
          ))}
        </div>
      </div>

      <div className="relative h-[clamp(16rem,42vh,26rem)] w-full touch-none overflow-hidden rounded-xl">
        <div ref={conteneur} className="absolute inset-0" />
        {etat !== "pret" && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-attenue">
            {etat === "chargement" ? <span className="animate-chargement">Chargement…</span> : "Série indisponible pour le moment."}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-attenue">
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-accent" /> {ohlc ? "Chandeliers" : "Clôture"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-[#fbbf24]" /> MM20
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded border-t border-dashed border-[#38bdf8]" /> MM50
          </span>
          <span>Molette ou pincement : zoom · glisser : déplacer</span>
        </span>
        {serie && <Horodatage iso={serie.majLe} source={libelleSource(serie.source)} seuilHeures={30} />}
      </div>
      {serie?.ticker.note_source && !ohlc && <p className="text-xs text-discret">{serie.ticker.note_source}</p>}
    </div>
  );
}
