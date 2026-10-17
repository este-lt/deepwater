import "server-only";
import {
  calculerForceDevises,
  calculerRegime,
  classerPaires,
  type Couverture,
  couvertures,
  type Devise,
  DEVISES,
  type ForceDevise,
  matriceCorrelations,
  type Paire,
  type Point,
  type Regime,
} from "./analyse";
import { lireClotures } from "./marches";
import type { ClientSupabase } from "./supabase";

export const BANQUES: Record<Devise, { fr: string; en: string; pays: { fr: string; en: string } }> = {
  USD: { fr: "Fed", en: "Fed", pays: { fr: "États-Unis", en: "United States" } },
  EUR: { fr: "BCE", en: "ECB", pays: { fr: "Zone euro", en: "Euro area" } },
  GBP: { fr: "BoE", en: "BoE", pays: { fr: "Royaume-Uni", en: "United Kingdom" } },
  JPY: { fr: "BoJ", en: "BoJ", pays: { fr: "Japon", en: "Japan" } },
  CHF: { fr: "BNS", en: "SNB", pays: { fr: "Suisse", en: "Switzerland" } },
  CAD: { fr: "BoC", en: "BoC", pays: { fr: "Canada", en: "Canada" } },
  AUD: { fr: "RBA", en: "RBA", pays: { fr: "Australie", en: "Australia" } },
  NZD: { fr: "RBNZ", en: "RBNZ", pays: { fr: "Nouvelle-Zélande", en: "New Zealand" } },
};

export interface Mesure {
  valeur: number;
  date: string;
  precedente: number | null;
  trimestrielle: boolean;
}

export interface LigneBanque {
  devise: Devise;
  taux: number | null;
  depuis: string | null; // date de la dernière décision de changement
  dernierPb: number | null;
  precedentPb: number | null;
  precedentDate: string | null;
  inflation: Mesure | null;
  chomage: Mesure | null;
  pib: Mesure | null;
  tauxReel: number | null;
}

export interface EtatMonde {
  lignes: LigneBanque[];
  decisions: Partial<Record<Devise, Point[]>>;
  inflation: Partial<Record<Devise, Point[]>>;
  chomage: Partial<Record<Devise, Point[]>>;
  pib: Partial<Record<Devise, Point[]>>;
  majLe: string | null;
}

const mesure = (p: Point[] | undefined): Mesure | null => {
  if (!p?.length) return null;
  const d = p[p.length - 1];
  const trimestrielle = p.length >= 2 && Date.parse(d.date) - Date.parse(p[p.length - 2].date) > 70 * 86_400_000;
  return { valeur: d.valeur, date: d.date, precedente: p.length >= 2 ? p[p.length - 2].valeur : null, trimestrielle };
};

export async function lireMonde(supabase: ClientSupabase): Promise<EtatMonde> {
  const depuis = new Date(Date.now() - 2 * 366 * 86_400_000).toISOString().slice(0, 10);
  const [taux, macro] = await Promise.all([
    supabase.from("taux_directeurs").select("devise, date, taux, maj_le").gte("date", "2018-01-01").order("date", { ascending: true }),
    supabase.from("indicateurs_macro").select("indicateur, date, valeur, maj_le").like("indicateur", "MONDE:%").gte("date", depuis).order("date", { ascending: true }),
  ]);
  if (taux.error) throw new Error(`Lecture des taux directeurs impossible : ${taux.error.message}`);
  if (macro.error) throw new Error(`Lecture de la macro mondiale impossible : ${macro.error.message}`);

  const decisions: Partial<Record<Devise, Point[]>> = {};
  for (const l of taux.data ?? []) (decisions[l.devise as Devise] ??= []).push({ date: l.date, valeur: Number(l.taux) });
  const series: Record<string, Partial<Record<Devise, Point[]>>> = { INFLATION: {}, CHOMAGE: {}, PIB: {} };
  for (const l of macro.data ?? []) {
    const [, m, d] = l.indicateur.split(":");
    if (series[m]) (series[m][d as Devise] ??= []).push({ date: l.date, valeur: Number(l.valeur) });
  }
  const majLe = [...(taux.data ?? []), ...(macro.data ?? [])].reduce<string | null>((max, l) => (max === null || l.maj_le > max ? l.maj_le : max), null);

  const lignes = DEVISES.map((devise) => {
    const dec = decisions[devise] ?? [];
    const n = dec.length;
    const inflation = mesure(series.INFLATION[devise]);
    const tauxActuel = n ? dec[n - 1].valeur : null;
    return {
      devise,
      taux: tauxActuel,
      depuis: n ? dec[n - 1].date : null,
      dernierPb: n >= 2 ? Math.round((dec[n - 1].valeur - dec[n - 2].valeur) * 100) : null,
      precedentPb: n >= 3 ? Math.round((dec[n - 2].valeur - dec[n - 3].valeur) * 100) : null,
      precedentDate: n >= 2 ? dec[n - 2].date : null,
      inflation,
      chomage: mesure(series.CHOMAGE[devise]),
      pib: mesure(series.PIB[devise]),
      tauxReel: tauxActuel !== null && inflation ? tauxActuel - inflation.valeur : null,
    };
  });

  return { lignes, decisions, inflation: series.INFLATION, chomage: series.CHOMAGE, pib: series.PIB, majLe };
}

// ---------------------------------------------------------------------------- Analyses

export const ACTIFS_CORRELATION = [
  { symbole: "SPX", mode: "pct" as const },
  { symbole: "NDX", mode: "pct" as const },
  { symbole: "US10Y", mode: "pts" as const },
  { symbole: "VIX", mode: "pts" as const },
  { symbole: "EURUSD", mode: "pct" as const },
  { symbole: "USDJPY", mode: "pct" as const },
  { symbole: "AUDUSD", mode: "pct" as const },
  { symbole: "XAU", mode: "pct" as const },
  { symbole: "WTI", mode: "pct" as const },
  { symbole: "BTC", mode: "pct" as const },
];

// Corrélations (cours) et régime (VIX, spread haut rendement, conditions financières).
const SYMBOLES = ["SPX", "NDX", "VIX", "HY", "NFCI", "US10Y", "EURUSD", "USDJPY", "USDCHF", "AUDUSD", "XAU", "WTI", "BTC"];

export interface EtatAnalyses {
  regime: Regime;
  correlations20: (number | null)[][];
  correlations60: (number | null)[][];
  couvertures: Couverture[];
  forces: ForceDevise[];
  paires: Paire[];
  dateMacro: string | null;
}

export async function lireAnalyses(supabase: ClientSupabase, monde: EtatMonde): Promise<EtatAnalyses> {
  const clotures = Object.fromEntries(await lireClotures(supabase, SYMBOLES, 130));
  const regime = calculerRegime(clotures);
  const forces = calculerForceDevises({
    decisions: monde.decisions,
    inflation: monde.inflation,
    chomage: monde.chomage,
    pib: monde.pib,
    regime: regime.score,
    aujourdhui: new Date().toISOString().slice(0, 10),
  });
  return {
    regime,
    correlations20: matriceCorrelations(clotures, ACTIFS_CORRELATION, 20),
    correlations60: matriceCorrelations(clotures, ACTIFS_CORRELATION, 60),
    couvertures: couvertures(clotures),
    forces,
    paires: classerPaires(forces),
    dateMacro: monde.majLe,
  };
}
