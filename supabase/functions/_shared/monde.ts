// Macro des 8 grandes économies (méthode « biais par devise ») : sources officielles
// gratuites, sans clé. Une donnée introuvable reste absente (affichée « indisponible »).
//   taux directeurs : BRI (WS_CBPOL, quotidien)
//   inflation sur 1 an : FRED (États-Unis, zone euro), OCDE (Royaume-Uni, Canada,
//                        Australie, Nouvelle-Zélande), BNS (Suisse) ; Japon indisponible
//   chômage : FRED (séries OCDE), Eurostat (zone euro)
//   PIB : OCDE, variation trimestrielle en volume
import { moisAvant } from "./calendrier.ts";
import { lireCsv } from "./csv.ts";
import { lireSerieFred } from "./fred.ts";
import { lireSecret } from "./supabase.ts";

export const DEVISES = ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD"] as const;
export type Devise = typeof DEVISES[number];

export interface Point {
  date: string; // AAAA-MM-JJ, 1er jour de la période
  valeur: number;
}

let userAgent: string | null = null;
// Une seconde tentative après une erreur serveur passagère (constatée sur l'API de l'OCDE).
async function telecharger(url: string, essai = 1): Promise<string> {
  userAgent ??= (await lireSecret("sec_user_agent")) ?? "Deepwater";
  const reponse = await fetch(url, { headers: { "User-Agent": userAgent }, signal: AbortSignal.timeout(60_000) });
  if (reponse.status >= 500 && essai < 2) {
    await reponse.body?.cancel();
    await new Promise((r) => setTimeout(r, 3000));
    return telecharger(url, essai + 1);
  }
  if (!reponse.ok) throw new Error(`HTTP ${reponse.status} (${new URL(url).host})`);
  return await reponse.text();
}

// "2026-Q2" -> "2026-04-01" ; "2026-08" -> "2026-08-01".
export function debutPeriode(periode: string): string | null {
  const t = periode.match(/^(\d{4})-Q([1-4])$/);
  if (t) return `${t[1]}-${String((Number(t[2]) - 1) * 3 + 1).padStart(2, "0")}-01`;
  const m = periode.match(/^(\d{4})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-01`;
  return /^\d{4}-\d{2}-\d{2}$/.test(periode) ? periode : null;
}

const trier = (points: Point[]) => points.sort((a, b) => a.date.localeCompare(b.date));

// ---------------------------------------------------------------------------- Taux directeurs

const ZONES_BRI: Record<string, Devise> = { US: "USD", XM: "EUR", GB: "GBP", JP: "JPY", CH: "CHF", CA: "CAD", AU: "AUD", NZ: "NZD" };

export async function lireTauxDirecteurs(depuis: string): Promise<Map<Devise, Point[]>> {
  // detail=dataonly : sans les notes répétées à chaque ligne (15 Mo -> 0,6 Mo sur 10 ans).
  const url = `https://stats.bis.org/api/v1/data/WS_CBPOL/D.${Object.keys(ZONES_BRI).join("+")}?format=csv&detail=dataonly&startPeriod=${depuis}`;
  const resultat = new Map<Devise, Point[]>();
  for (const l of lireCsv(await telecharger(url))) {
    const devise = ZONES_BRI[l.REF_AREA];
    const valeur = Number(l.OBS_VALUE);
    if (!devise || !l.TIME_PERIOD || l.OBS_VALUE === "" || !Number.isFinite(valeur)) continue;
    const serie = resultat.get(devise) ?? [];
    serie.push({ date: l.TIME_PERIOD, valeur });
    resultat.set(devise, serie);
  }
  for (const serie of resultat.values()) trier(serie);
  if (resultat.size === 0) throw new Error("BRI : aucune observation");
  return resultat;
}

// Ne garde que les changements de taux (série quotidienne -> décisions), à partir du
// dernier taux déjà connu.
export function changementsDeTaux(serie: Point[], dernierConnu: number | null): Point[] {
  const changements: Point[] = [];
  let courant = dernierConnu;
  for (const p of serie) {
    if (courant === null || Math.abs(p.valeur - courant) > 1e-9) {
      changements.push(p);
      courant = p.valeur;
    }
  }
  return changements;
}

// ---------------------------------------------------------------------------- Inflation

// Glissement sur 12 mois calculé par date (jamais par position).
export function glissementAnnuel(indice: Point[]): Point[] {
  const parDate = new Map(indice.map((p) => [p.date, p.valeur]));
  const resultat: Point[] = [];
  for (const p of indice) {
    const avant = parDate.get(moisAvant(p.date, 12));
    if (avant) resultat.push({ date: p.date, valeur: Math.round((p.valeur / avant - 1) * 100_000) / 1000 });
  }
  return resultat;
}

const PAYS_OCDE: Record<string, Devise> = { GBR: "GBP", CAN: "CAD", AUS: "AUD", NZL: "NZD" };

async function inflationOcde(depuis: string): Promise<Map<Devise, Point[]>> {
  const url = "https://sdmx.oecd.org/public/rest/data/OECD.SDD.TPS,DSD_PRICES@DF_PRICES_ALL,1.0/" +
    `${Object.keys(PAYS_OCDE).join("+")}..N.CPI.PA._T.N.GY?startPeriod=${depuis.slice(0, 7)}&dimensionAtObservation=AllDimensions&format=csv`;
  const lignes = lireCsv(await telecharger(url));
  // Mensuel quand il existe, sinon trimestriel (Nouvelle-Zélande).
  const mensuels = new Set(lignes.filter((l) => l.FREQ === "M").map((l) => l.REF_AREA));
  const resultat = new Map<Devise, Point[]>();
  for (const l of lignes) {
    const devise = PAYS_OCDE[l.REF_AREA];
    if (!devise || (mensuels.has(l.REF_AREA) ? l.FREQ !== "M" : l.FREQ !== "Q")) continue;
    const date = debutPeriode(l.TIME_PERIOD);
    const valeur = Number(l.OBS_VALUE);
    if (!date || l.OBS_VALUE === "" || !Number.isFinite(valeur)) continue;
    resultat.set(devise, [...(resultat.get(devise) ?? []), { date, valeur: Math.round(valeur * 1000) / 1000 }]);
  }
  for (const serie of resultat.values()) trier(serie);
  return resultat;
}

// BNS (cube plkopr) : « VVP » = variation sur 1 an de l'indice suisse des prix à la consommation.
async function inflationSuisse(depuis: string): Promise<Point[]> {
  const texte = await telecharger(`https://data.snb.ch/api/cube/plkopr/data/csv/en?fromDate=${depuis.slice(0, 7)}`);
  const debut = texte.indexOf('"Date"');
  if (debut < 0) throw new Error("BNS : format inattendu");
  const points: Point[] = [];
  for (const l of lireCsv(texte.slice(debut), ";")) {
    const date = debutPeriode(l.Date);
    const valeur = Number(l.Value);
    if (l.D0 === "VVP" && date && l.Value !== "" && Number.isFinite(valeur)) points.push({ date, valeur: Math.round(valeur * 1000) / 1000 });
  }
  return trier(points);
}

// ---------------------------------------------------------------------------- Chômage

const CHOMAGE_FRED: Partial<Record<Devise, string>> = {
  USD: "UNRATE",
  GBP: "LRHUTTTTGBM156S",
  JPY: "LRUN64TTJPM156S",
  CAD: "LRUNTTTTCAM156S",
  AUD: "LRUNTTTTAUM156S",
  NZD: "LRUNTTTTNZQ156S",
  CHF: "LRUNTTTTCHQ156S",
};

// Eurostat (JSON-stat) : chômage de la zone euro, corrigé des variations saisonnières.
async function chomageZoneEuro(): Promise<Point[]> {
  const url = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/une_rt_m" +
    "?geo=EA21&s_adj=SA&age=TOTAL&sex=T&unit=PC_ACT&lastTimePeriod=36";
  const corps = JSON.parse(await telecharger(url)) as {
    value?: Record<string, number>;
    dimension?: { time?: { category?: { index?: Record<string, number> } } };
  };
  const index = corps.dimension?.time?.category?.index ?? {};
  const points: Point[] = [];
  for (const [periode, position] of Object.entries(index)) {
    const valeur = corps.value?.[String(position)];
    const date = debutPeriode(periode);
    if (date && typeof valeur === "number") points.push({ date, valeur });
  }
  if (points.length === 0) throw new Error("Eurostat : aucune observation");
  return trier(points);
}

// ---------------------------------------------------------------------------- PIB

const PAYS_PIB: Record<string, Devise> = { USA: "USD", EA: "EUR", GBR: "GBP", JPN: "JPY", CHE: "CHF", CAN: "CAD", AUS: "AUD", NZL: "NZD" };

async function pibOcde(depuis: string): Promise<Map<Devise, Point[]>> {
  const annee = depuis.slice(0, 4);
  const url = "https://sdmx.oecd.org/public/rest/data/OECD.SDD.NAD,DSD_NAMAIN1@DF_QNA_EXPENDITURE_GROWTH_OECD,/" +
    `Q.Y.${Object.keys(PAYS_PIB).join("+")}.S1..B1GQ......G1.?startPeriod=${annee}-Q1&dimensionAtObservation=AllDimensions&format=csv`;
  const resultat = new Map<Devise, Point[]>();
  for (const l of lireCsv(await telecharger(url))) {
    const devise = PAYS_PIB[l.REF_AREA];
    const date = debutPeriode(l.TIME_PERIOD);
    const valeur = Number(l.OBS_VALUE);
    if (!devise || !date || l.OBS_VALUE === "" || !Number.isFinite(valeur)) continue;
    resultat.set(devise, [...(resultat.get(devise) ?? []), { date, valeur: Math.round(valeur * 1000) / 1000 }]);
  }
  for (const serie of resultat.values()) trier(serie);
  return resultat;
}

// ---------------------------------------------------------------------------- Ensemble

export type Mesure = "INFLATION" | "CHOMAGE" | "PIB";

export interface SerieMonde {
  mesure: Mesure;
  devise: Devise;
  source: string;
  points: Point[];
}

// Chaque source est indépendante : une panne est signalée sans bloquer les autres.
export async function lireMacroMonde(depuis: string, signaler: (cle: string, erreur: unknown) => void): Promise<SerieMonde[]> {
  const series: SerieMonde[] = [];
  const essayer = async (cle: string, travail: () => Promise<void>) => {
    try {
      await travail();
    } catch (erreur) {
      signaler(cle, erreur);
    }
  };

  await essayer("inflation:USD", async () => {
    const indice = (await lireSerieFred("CPIAUCNS", moisAvant(depuis, 12))).map(([date, valeur]) => ({ date, valeur }));
    series.push({ mesure: "INFLATION", devise: "USD", source: "fred:CPIAUCNS", points: glissementAnnuel(indice) });
  });
  await essayer("inflation:EUR", async () => {
    const indice = (await lireSerieFred("CP0000EZCCM086NEST", moisAvant(depuis, 12))).map(([date, valeur]) => ({ date, valeur }));
    series.push({ mesure: "INFLATION", devise: "EUR", source: "fred:CP0000EZCCM086NEST", points: glissementAnnuel(indice) });
  });
  await essayer("inflation:OCDE", async () => {
    for (const [devise, points] of await inflationOcde(depuis)) {
      series.push({ mesure: "INFLATION", devise, source: "oecd:DF_PRICES_ALL", points });
    }
  });
  await essayer("inflation:CHF", async () => {
    series.push({ mesure: "INFLATION", devise: "CHF", source: "snb:plkopr", points: await inflationSuisse(depuis) });
  });

  for (const [devise, serie] of Object.entries(CHOMAGE_FRED) as [Devise, string][]) {
    await essayer(`chomage:${devise}`, async () => {
      const points = (await lireSerieFred(serie, depuis)).map(([date, valeur]) => ({ date, valeur }));
      series.push({ mesure: "CHOMAGE", devise, source: `fred:${serie}`, points });
    });
  }
  await essayer("chomage:EUR", async () => {
    series.push({ mesure: "CHOMAGE", devise: "EUR", source: "eurostat:une_rt_m", points: await chomageZoneEuro() });
  });

  await essayer("pib:OCDE", async () => {
    for (const [devise, points] of await pibOcde(depuis)) {
      series.push({ mesure: "PIB", devise, source: "oecd:QNA_GROWTH", points });
    }
  });

  return series.filter((s) => s.points.length > 0);
}
