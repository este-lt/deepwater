import "server-only";
import { type Frequence, moisAvant } from "./format";
import { type Langue, localeDe } from "./i18n";
import type { ClientSupabase } from "./supabase";
import type { TauxRow } from "./types-supabase";

export const MATURITES: { cle: TauxRow["maturite"]; court: string; annees: number }[] = [
  { cle: "3month", court: "3M", annees: 0.25 },
  { cle: "2year", court: "2Y", annees: 2 },
  { cle: "5year", court: "5Y", annees: 5 },
  { cle: "7year", court: "7Y", annees: 7 },
  { cle: "10year", court: "10Y", annees: 10 },
  { cle: "30year", court: "30Y", annees: 30 },
];

export interface EtatTaux {
  date: string | null;
  majLe: string | null;
  source: string | null;
  // taux1m : même maturité environ un mois plus tôt (21 séances), pour comparer les courbes.
  points: { maturite: TauxRow["maturite"]; court: string; annees: number; taux: number; variation5j: number | null; taux1m: number | null }[];
  spread102: number | null;
  spread302: number | null;
  historiqueSpread: number[];
}

export async function lireTaux(supabase: ClientSupabase): Promise<EtatTaux> {
  const depuis = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("taux_tresor")
    .select("date, maturite, taux, spread_10_2, spread_30_2, maj_le, source_donnee")
    .gte("date", depuis)
    .order("date", { ascending: true });
  if (error) throw new Error(`Lecture des taux impossible : ${error.message}`);
  const lignes = (data ?? []) as TauxRow[];
  if (lignes.length === 0) {
    return { date: null, majLe: null, source: null, points: [], spread102: null, spread302: null, historiqueSpread: [] };
  }

  const parMaturite = new Map<string, TauxRow[]>();
  for (const l of lignes) {
    if (Number.isFinite(Number(l.taux))) parMaturite.set(l.maturite, [...(parMaturite.get(l.maturite) ?? []), l]);
  }
  const date10 = parMaturite.get("10year")?.at(-1)?.date ?? lignes.at(-1)!.date;

  const points = MATURITES.flatMap((m) => {
    const serie = parMaturite.get(m.cle) ?? [];
    const derniere = serie.at(-1);
    if (!derniere) return [];
    const ilYa5 = serie.at(-6);
    const ilYa21 = serie.at(-22);
    return [{
      maturite: m.cle,
      court: m.court,
      annees: m.annees,
      taux: Number(derniere.taux),
      variation5j: ilYa5 ? Number(derniere.taux) - Number(ilYa5.taux) : null,
      taux1m: ilYa21 ? Number(ilYa21.taux) : null,
    }];
  });

  const parDate = new Map<string, TauxRow>();
  for (const l of parMaturite.get("10year") ?? []) parDate.set(l.date, l);
  const derniereLigne = parDate.get(date10);
  return {
    date: date10,
    majLe: lignes.reduce((max, l) => (l.maj_le > max ? l.maj_le : max), lignes[0].maj_le),
    source: lignes.at(-1)?.source_donnee ?? null,
    points,
    spread102: derniereLigne?.spread_10_2 === null || derniereLigne?.spread_10_2 === undefined ? null : Number(derniereLigne.spread_10_2),
    spread302: derniereLigne?.spread_30_2 === null || derniereLigne?.spread_30_2 === undefined ? null : Number(derniereLigne.spread_30_2),
    historiqueSpread: [...parDate.values()].filter((l) => l.spread_10_2 !== null).map((l) => Number(l.spread_10_2)),
  };
}

export interface IndicateurAffiche {
  cle: string;
  libelle: string;
  valeur: string | null;
  detail: string | null;
  date: string | null;
  frequence: Frequence;
  majLe: string | null;
  // Raison affichée quand la valeur ne peut pas être calculée à partir des données collectées.
  absence: string | null;
  // Simple sens de variation : une hausse n'est pas forcément une bonne nouvelle.
  tendance: "hausse" | "baisse" | "neutre";
}

type Lecture = (periodesAvant: number) => number | null;

interface DefinitionMacro {
  cle: string;
  fr: string;
  en: string;
  frequence: Frequence;
  // Écart entre deux publications : en mois, ou "hebdo" (observation précédente).
  pas: number | "hebdo";
  unite: "%" | "k";
  decimales: number;
  signe: boolean;
  calcul: (v: Lecture) => number | null;
}

const ecart = (a: number | null, b: number | null) => (a !== null && b !== null ? a - b : null);
const croissance = (a: number | null, b: number | null, puissance = 1) =>
  a !== null && b !== null && b !== 0 ? ((a / b) ** puissance - 1) * 100 : null;
const surUnAn = (v: Lecture) => croissance(v(0), v(12));

// Mêmes calculs que le calendrier (supabase/functions/_shared/calendrier.ts), séries FRED.
const MACRO: DefinitionMacro[] = [
  { cle: "CPI", fr: "Inflation (CPI, sur 1 an)", en: "CPI inflation (y/y)", frequence: "mois", pas: 1, unite: "%", decimales: 1, signe: false, calcul: surUnAn },
  { cle: "CORE_CPI", fr: "CPI sous-jacent (sur 1 an)", en: "Core CPI (y/y)", frequence: "mois", pas: 1, unite: "%", decimales: 1, signe: false, calcul: surUnAn },
  { cle: "CORE_PCE", fr: "PCE sous-jacent (sur 1 an)", en: "Core PCE (y/y)", frequence: "mois", pas: 1, unite: "%", decimales: 1, signe: false, calcul: surUnAn },
  { cle: "PPI", fr: "Prix à la production (sur 1 an)", en: "Producer prices (y/y)", frequence: "mois", pas: 1, unite: "%", decimales: 1, signe: false, calcul: surUnAn },
  { cle: "UNEMPLOYMENT", fr: "Taux de chômage", en: "Unemployment rate", frequence: "mois", pas: 1, unite: "%", decimales: 1, signe: false, calcul: (v) => v(0) },
  { cle: "NONFARM_PAYROLL", fr: "Emplois créés (NFP)", en: "Nonfarm payrolls", frequence: "mois", pas: 1, unite: "k", decimales: 0, signe: true, calcul: (v) => ecart(v(0), v(1)) },
  {
    cle: "JOBLESS_CLAIMS", fr: "Inscriptions au chômage", en: "Initial jobless claims", frequence: "semaine", pas: "hebdo", unite: "k", decimales: 0, signe: false,
    calcul: (v) => (v(0) === null ? null : v(0)! / 1000),
  },
  { cle: "RETAIL_SALES", fr: "Ventes au détail (sur 1 mois)", en: "Retail sales (m/m)", frequence: "mois", pas: 1, unite: "%", decimales: 1, signe: true, calcul: (v) => croissance(v(0), v(1)) },
  { cle: "REAL_GDP", fr: "Croissance du PIB (annualisée)", en: "GDP growth (annualized)", frequence: "trimestre", pas: 3, unite: "%", decimales: 1, signe: false, calcul: (v) => croissance(v(0), v(3), 4) },
];

const PRECEDENT: Record<Frequence, [string, string]> = {
  jour: ["la veille", "previous day"],
  semaine: ["la semaine précédente", "previous week"],
  mois: ["le mois précédent", "previous month"],
  trimestre: ["le trimestre précédent", "previous quarter"],
};

function ecrire(v: number, d: DefinitionMacro, langue: Langue): string {
  const nombre = new Intl.NumberFormat(localeDe(langue), { minimumFractionDigits: d.decimales, maximumFractionDigits: d.decimales }).format(Math.abs(v));
  const signe = d.signe ? (v >= 0 ? "+" : "−") : v < 0 ? "−" : "";
  return `${signe}${nombre}${langue === "en" && d.unite === "%" ? "" : " "}${d.unite}`;
}

export async function lireMacro(supabase: ClientSupabase, langue: Langue): Promise<IndicateurAffiche[]> {
  const en = langue === "en";
  const depuis = new Date(Date.now() - 30 * 31 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("indicateurs_macro")
    .select("indicateur, date, valeur, maj_le")
    .in("indicateur", MACRO.map((m) => m.cle))
    .gte("date", depuis)
    .order("date", { ascending: true });
  if (error) throw new Error(`Lecture des indicateurs macro impossible : ${error.message}`);
  const series = new Map<string, { date: string; valeur: number; maj_le: string }[]>();
  for (const l of data ?? []) {
    const valeur = Number(l.valeur);
    if (Number.isFinite(valeur)) series.set(l.indicateur, [...(series.get(l.indicateur) ?? []), { ...l, valeur }]);
  }

  return MACRO.map((def) => {
    const serie = series.get(def.cle) ?? [];
    const derniere = serie.at(-1);
    if (!derniere) {
      return { cle: def.cle, libelle: en ? def.en : def.fr, valeur: null, detail: null, date: null, frequence: def.frequence, majLe: null, absence: null, tendance: "neutre" as const };
    }
    // Lecture par date (un mois jamais publié reste absent) ou par rang pour l'hebdomadaire.
    const parDate = new Map(serie.map((p) => [p.date, p.valeur]));
    const lecture = (decalage: number): Lecture =>
      def.pas === "hebdo"
        ? (n) => serie[serie.length - 1 - decalage - n]?.valeur ?? null
        : (n) => parDate.get(moisAvant(derniere.date, decalage * (def.pas as number) + n)) ?? null;
    const actuelle = def.calcul(lecture(0));
    const precedente = def.calcul(lecture(1));
    const delta = ecart(actuelle, precedente);
    return {
      cle: def.cle,
      libelle: en ? def.en : def.fr,
      valeur: actuelle === null ? null : ecrire(actuelle, def, langue),
      detail: precedente === null ? null : `${ecrire(precedente, def, langue)} ${PRECEDENT[def.frequence][en ? 1 : 0]}`,
      date: derniere.date,
      frequence: def.frequence,
      majLe: derniere.maj_le,
      absence: actuelle === null
        ? en ? "Unavailable: the comparison period was never published" : "Indisponible : la période de comparaison n'a pas été publiée"
        : null,
      tendance: delta === null || Math.abs(delta) < 1e-9 ? "neutre" as const : delta > 0 ? "hausse" as const : "baisse" as const,
    };
  });
}
