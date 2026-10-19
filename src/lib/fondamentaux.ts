import "server-only";
import { lireClotures } from "./marches";
import type { ClientSupabase } from "./supabase";
import type { ConsensusRow, HistoriqueBiaisRow, SessionBiais } from "./types-supabase";

// Données fondamentales du tableau de bord, toutes déjà en base : anticipations de taux
// (bons du Trésor), prime de terme, taux de la zone euro, liquidité de la Fed, rapport COT,
// chiffres publiés face au consensus, performance historique du biais et fiche par régime.

type Serie = { date: string; cloture: number }[];
const jour = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const joursEntre = (de: string, a: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);

// Dernier point à une date donnée ou avant.
function auPlusTard(s: Serie, date: string) {
  let dernier: Serie[number] | undefined;
  for (const p of s) if (p.date <= date) dernier = p;
  return dernier;
}

// --- Anticipations de taux -----------------------------------------------------

// Bons du Trésor (et taux à 1 et 2 ans) : leur rendement est proche de la moyenne du taux
// directeur attendue jusqu'à l'échéance. Approximation gratuite des futures sur Fed funds,
// biaisée de quelques points de base (prime de terme, écart bons / Fed funds).
export const ECHEANCES = [
  { symbole: "US1M", fr: "1 mois", en: "1 month", annees: 1 / 12 },
  { symbole: "US3M", fr: "3 mois", en: "3 months", annees: 0.25 },
  { symbole: "US6M", fr: "6 mois", en: "6 months", annees: 0.5 },
  { symbole: "US1Y", fr: "1 an", en: "1 year", annees: 1 },
  { symbole: "US2Y", fr: "2 ans", en: "2 years", annees: 2 },
] as const;

export interface Anticipations {
  ffr: { taux: number; date: string } | null;
  echeances: { symbole: string; fr: string; en: string; taux: number; ecartPb: number; mouvements: number; var1mPb: number | null }[];
  // Taux directeur implicite après chaque réunion du FOMC (taux à terme entre deux échéances).
  reunions: { date: string; provisoire: boolean; implicite: number; ecartPb: number; mouvements: number }[];
  date: string | null;
}

export function calculerAnticipations(series: Record<string, Serie>, reunions: { date: string; provisoire: boolean }[], aujourdhui: string): Anticipations {
  const ffrPoint = series.FFR?.at(-1);
  if (!ffrPoint) return { ffr: null, echeances: [], reunions: [], date: null };
  const ffr = { taux: ffrPoint.cloture, date: ffrPoint.date };
  const echeances = ECHEANCES.flatMap((e) => {
    const s = series[e.symbole] ?? [];
    const d = s.at(-1);
    if (!d || joursEntre(d.date, aujourdhui) > 10) return [];
    const ilYa1m = s.at(-22);
    const ecartPb = (d.cloture - ffr.taux) * 100;
    return [{ symbole: e.symbole, fr: e.fr, en: e.en, taux: d.cloture, ecartPb, mouvements: ecartPb / 25, var1mPb: ilYa1m ? (d.cloture - ilYa1m.cloture) * 100 : null, annees: e.annees }];
  });
  // Nœuds (échéance en années, rendement moyen) : le taux à terme entre deux nœuds est
  // (r2 × t2 − r1 × t1) / (t2 − t1) ; il approche le taux directeur attendu sur cette période.
  const noeuds = [{ annees: 0, taux: ffr.taux }, ...echeances.map((e) => ({ annees: e.annees, taux: e.taux }))];
  const terme = (annees: number) => {
    for (let i = 1; i < noeuds.length; i++) {
      if (annees <= noeuds[i].annees) {
        const [a, b] = [noeuds[i - 1], noeuds[i]];
        return (b.taux * b.annees - a.taux * a.annees) / (b.annees - a.annees);
      }
    }
    return null;
  };
  const implicites = reunions.flatMap((r) => {
    // Le taux décidé s'applique après la réunion : on lit le taux à terme juste après.
    const annees = (joursEntre(aujourdhui, r.date) + 15) / 365;
    if (annees <= 0) return [];
    const implicite = terme(annees);
    if (implicite === null) return [];
    const ecartPb = (implicite - ffr.taux) * 100;
    return [{ date: r.date, provisoire: r.provisoire, implicite, ecartPb, mouvements: ecartPb / 25 }];
  });
  return {
    ffr,
    echeances: echeances.map((e) => ({ symbole: e.symbole, fr: e.fr, en: e.en, taux: e.taux, ecartPb: e.ecartPb, mouvements: e.mouvements, var1mPb: e.var1mPb })),
    reunions: implicites,
    date: echeances.map((e) => series[e.symbole]?.at(-1)?.date ?? "").sort().at(-1) ?? null,
  };
}

// --- Liquidité de la Fed ----------------------------------------------------------

export interface Liquidite {
  date: string | null;
  bilan: number | null; // milliards $
  tga: number | null;
  rrp: number | null;
  nette: number | null;
  var4s: number | null;
  historique: number[]; // liquidité nette hebdomadaire sur 1 an
  m2: { date: string; sur1an: number } | null;
}

export function calculerLiquidite(series: Record<string, Serie>): Liquidite {
  const bilan = series.WALCL ?? [];
  const nette = (date: string) => {
    const b = auPlusTard(bilan, date);
    const t = auPlusTard(series.TGA ?? [], date);
    const r = auPlusTard(series.RRP ?? [], date);
    return b && t && r ? b.cloture / 1000 - t.cloture / 1000 - r.cloture : null;
  };
  const dernier = bilan.at(-1);
  const m2 = series.M2 ?? [];
  const m2d = m2.at(-1);
  const m2a = m2d ? m2.find((p) => p.date === `${Number(m2d.date.slice(0, 4)) - 1}${m2d.date.slice(4)}`) : undefined;
  if (!dernier) return { date: null, bilan: null, tga: null, rrp: null, nette: null, var4s: null, historique: [], m2: null };
  const maintenant = nette(dernier.date);
  const ilYa4 = bilan.at(-5);
  const avant = ilYa4 ? nette(ilYa4.date) : null;
  const tga = auPlusTard(series.TGA ?? [], dernier.date);
  return {
    date: dernier.date,
    bilan: dernier.cloture / 1000,
    tga: tga ? tga.cloture / 1000 : null,
    rrp: auPlusTard(series.RRP ?? [], dernier.date)?.cloture ?? null,
    nette: maintenant,
    var4s: maintenant !== null && avant !== null ? maintenant - avant : null,
    historique: bilan.slice(-52).flatMap((p) => {
      const v = nette(p.date);
      return v === null ? [] : [v];
    }),
    m2: m2d && m2a && m2a.cloture > 0 ? { date: m2d.date, sur1an: (m2d.cloture / m2a.cloture - 1) * 100 } : null,
  };
}

// --- Rapport COT ----------------------------------------------------------------------

export const CONTRATS_COT: { code: string; fr: string; en: string }[] = [
  { code: "13874A", fr: "S&P 500 (E-mini)", en: "S&P 500 (E-mini)" },
  { code: "209742", fr: "Nasdaq-100 (E-mini)", en: "Nasdaq-100 (E-mini)" },
  { code: "043602", fr: "Taux US 10 ans", en: "US 10-year note" },
  { code: "099741", fr: "Euro", en: "Euro" },
  { code: "096742", fr: "Livre sterling", en: "British pound" },
  { code: "097741", fr: "Yen", en: "Yen" },
  { code: "092741", fr: "Franc suisse", en: "Swiss franc" },
  { code: "090741", fr: "Dollar canadien", en: "Canadian dollar" },
  { code: "232741", fr: "Dollar australien", en: "Australian dollar" },
  { code: "112741", fr: "Dollar néo-zélandais", en: "New Zealand dollar" },
];

export interface LigneCot {
  code: string;
  fr: string;
  en: string;
  date: string;
  net: number; // part de l'intérêt ouvert, fonds à effet de levier
  variation: number | null; // sur une semaine
  centile: number; // sur 3 ans
}

export function calculerCot(lignes: { date: string; code: string; interet_ouvert: number; fonds_long: number; fonds_court: number }[]): LigneCot[] {
  return CONTRATS_COT.flatMap((c) => {
    const serie = lignes
      .filter((l) => l.code === c.code && Number(l.interet_ouvert) > 0)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-156)
      .map((l) => ({ date: l.date, net: (Number(l.fonds_long) - Number(l.fonds_court)) / Number(l.interet_ouvert) }));
    const d = serie.at(-1);
    if (!d || serie.length < 26) return [];
    return [{ ...c, date: d.date, net: d.net, variation: serie.length > 1 ? d.net - serie.at(-2)!.net : null, centile: serie.filter((p) => p.net <= d.net).length / serie.length }];
  });
}

// --- Performance du biais ----------------------------------------------------------------

export interface StatsBiais {
  seances: number;
  reussite: number | null;
  moyenne1j: number | null;
  moyenne5j: number | null;
}

export interface PerformanceIndice {
  indice: string;
  depuis: string | null;
  seances: number;
  moyenne1j: number | null;
  hausseSpontanee: number | null;
  haussier: StatsBiais;
  baissier: StatsBiais;
  neutre: StatsBiais;
}

export function statistiquesBiais(lignes: Pick<HistoriqueBiaisRow, "indice" | "date" | "biais" | "rendement_1j" | "rendement_5j">[], indice: string): PerformanceIndice {
  const moyenne = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
  const tous = lignes.filter((l) => l.indice === indice && l.rendement_1j !== null);
  const par = (b: "haussier" | "baissier" | "neutre"): StatsBiais => {
    const l = tous.filter((x) => x.biais === b);
    const ok = l.filter((x) => (b === "haussier" ? x.rendement_1j! > 0 : x.rendement_1j! < 0)).length;
    return {
      seances: l.length,
      reussite: b === "neutre" || l.length === 0 ? null : ok / l.length,
      moyenne1j: moyenne(l.map((x) => Number(x.rendement_1j))),
      moyenne5j: moyenne(l.flatMap((x) => (x.rendement_5j === null ? [] : [Number(x.rendement_5j)]))),
    };
  };
  return {
    indice,
    depuis: tous.map((l) => l.date).sort()[0] ?? null,
    seances: tous.length,
    moyenne1j: moyenne(tous.map((x) => Number(x.rendement_1j))),
    hausseSpontanee: tous.length ? tous.filter((x) => x.rendement_1j! > 0).length / tous.length : null,
    haussier: par("haussier"),
    baissier: par("baissier"),
    neutre: par("neutre"),
  };
}

export interface BiaisPublie {
  date: string;
  indice: string;
  biais: "haussier" | "baissier" | "neutre";
  score: number;
  rendement: number | null; // rendement intraday (contrat à terme, 9 h 30 - 16 h), une fois la séance close
}

// Biais de la séance (règles en vigueur rejouées) jugé en intraday : de l'ouverture à la
// clôture de New York, sur le contrat à terme (session new_york de cours_sessions).
export interface PerformanceSession {
  indice: string;
  seances: number;
  hausse: number | null; // part des sessions en hausse, tous biais confondus
  haussier: { seances: number; reussite: number | null };
  baissier: { seances: number; reussite: number | null };
}

export function statistiquesSessions(
  historique: Pick<HistoriqueBiaisRow, "indice" | "date" | "biais">[],
  cours: { indice: string; date: string; session: SessionBiais; rendement: number }[],
): PerformanceSession[] {
  const biais = new Map(historique.map((h) => [`${h.indice}:${h.date}`, h.biais]));
  const resultat: PerformanceSession[] = [];
  for (const indice of ["SPX", "NDX"]) {
    const lignes = cours.flatMap((c) => {
      const b = c.indice === indice && c.session === "new_york" ? biais.get(`${indice}:${c.date}`) : undefined;
      return b ? [{ biais: b, rendement: c.rendement }] : [];
    });
    if (lignes.length === 0) continue;
    const part = (l: typeof lignes, juste: (r: number) => boolean) => (l.length ? l.filter((x) => juste(x.rendement)).length / l.length : null);
    const h = lignes.filter((l) => l.biais === "haussier");
    const b = lignes.filter((l) => l.biais === "baissier");
    resultat.push({
      indice, seances: lignes.length, hausse: part(lignes, (r) => r > 0),
      haussier: { seances: h.length, reussite: part(h, (r) => r > 0) },
      baissier: { seances: b.length, reussite: part(b, (r) => r < 0) },
    });
  }
  return resultat;
}

export interface FicheRegime {
  regime: string;
  mois: number;
  actifs: { actif: string; moyenne: number; hausse: number }[];
}

// --- Lecture --------------------------------------------------------------------------

export interface EtatFondamentaux {
  anticipations: Anticipations;
  primeTerme: { valeur: number; var1mPb: number | null; date: string } | null;
  europe: { eu2: number; eu10: number; us2: number | null; us10: number | null; date: string; ecart10Var1mPb: number | null } | null;
  liquidite: Liquidite;
  cot: LigneCot[];
  consensus: Pick<ConsensusRow, "id" | "instant" | "devise" | "libelle" | "publie" | "prevision" | "precedent" | "unite" | "surprise" | "famille" | "source">[];
  version: string | null;
  performance: PerformanceIndice[];
  sessions: PerformanceSession[];
  sessionsDepuis: string | null;
  publies: BiaisPublie[];
  regimeActuel: { regime: string; mois: string } | null;
  fiche: FicheRegime[];
}

const SYMBOLES = ["FFR", "US1M", "US3M", "US6M", "US1Y", "US2Y", "US10Y", "TP10", "EU2Y", "EU10Y", "WALCL", "TGA", "RRP", "M2"];

export async function lireFondamentaux(supabase: ClientSupabase): Promise<EtatFondamentaux> {
  const aujourdhui = jour(Date.now());
  const [clotures, reunions, cot, consensus, version] = await Promise.all([
    lireClotures(supabase, SYMBOLES, 430).then((c) => Object.fromEntries(c) as Record<string, Serie>),
    supabase.from("calendrier_economique").select("date_evenement, date_estimee").eq("type_evenement", "banque_centrale").eq("indicateur", "FOMC")
      .gte("date_evenement", aujourdhui).lte("date_evenement", jour(Date.now() + 400 * 86_400_000)).order("date_evenement"),
    supabase.from("positions_cot").select("date, code, interet_ouvert, fonds_long, fonds_court")
      .in("code", CONTRATS_COT.map((c) => c.code)).gte("date", jour(Date.now() - (3 * 366 + 14) * 86_400_000)).order("date").limit(2000),
    supabase.from("publications_consensus").select("id, instant, devise, libelle, publie, prevision, precedent, unite, surprise, famille, source")
      .gte("instant", new Date(Date.now() - 14 * 86_400_000).toISOString()).order("instant", { ascending: false }).limit(40),
    supabase.from("regles_versions").select("version").order("cree_le", { ascending: false }).limit(1).maybeSingle(),
  ]);
  for (const [nom, r] of [["calendrier", reunions], ["rapport COT", cot], ["consensus", consensus], ["versions des règles", version]] as const) {
    if (r.error) throw new Error(`Lecture ${nom} impossible : ${r.error.message}`);
  }
  const v = version.data?.version ?? null;

  // Historique de performance (version en cours) et biais réellement publiés sur 30 jours.
  const historique: Pick<HistoriqueBiaisRow, "indice" | "date" | "biais" | "rendement_1j" | "rendement_5j">[] = [];
  const coursSessions: { indice: string; date: string; session: SessionBiais; rendement: number }[] = [];
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await supabase.from("cours_sessions").select("indice, date, session, rendement").eq("session", "new_york").order("date").range(debut, debut + 999);
    if (error) throw new Error(`Lecture des cours par session impossible : ${error.message}`);
    coursSessions.push(...(data ?? []).map((c) => ({ ...c, rendement: Number(c.rendement) })));
    if ((data ?? []).length < 1000) break;
  }
  if (v) {
    for (let debut = 0; ; debut += 1000) {
      const { data, error } = await supabase.from("historique_biais").select("indice, date, biais, rendement_1j, rendement_5j")
        .eq("version", v).order("date").range(debut, debut + 999);
      if (error) throw new Error(`Lecture de l'historique du biais impossible : ${error.message}`);
      historique.push(...(data ?? []));
      if ((data ?? []).length < 1000) break;
    }
  }
  const depuis45 = jour(Date.now() - 45 * 86_400_000);
  const [publies, regime, fiche, indices, cours] = await Promise.all([
    supabase.from("biais_quotidien").select("date, biais, score_numerique, ticker_id")
      .eq("statut", "actif").eq("session", "new_york").gte("date", depuis45).order("date", { ascending: false }).limit(60),
    v ? supabase.from("regimes_historiques").select("mois, regime").eq("version", v).order("mois", { ascending: false }).limit(1).maybeSingle() : null,
    v ? supabase.rpc("fiche_regimes", { p_version: v }) : null,
    supabase.from("tickers_suivis").select("id, symbole").in("symbole", ["SPX", "NDX"]),
    supabase.from("cours_sessions").select("indice, date, rendement").eq("session", "new_york").gte("date", depuis45),
  ]);
  if (cours.error) throw new Error(`Lecture des cours par session impossible : ${cours.error.message}`);
  if (indices.error) throw new Error(`Lecture des indices impossible : ${indices.error.message}`);
  const symboleDe = new Map((indices.data ?? []).map((x) => [x.id, x.symbole]));
  if (publies.error) throw new Error(`Lecture des biais publiés impossible : ${publies.error.message}`);
  if (regime?.error) throw new Error(`Lecture du régime impossible : ${regime.error.message}`);
  if (fiche?.error) throw new Error(`Lecture de la fiche des régimes impossible : ${fiche.error.message}`);

  // Chaque biais est jugé en intraday (cours du contrat à terme de 9 h 30 à 16 h, collecte-sessions).
  const rendements = new Map((cours.data ?? []).map((c) => [`${c.indice}:${c.date}`, Number(c.rendement)]));
  const publiesLignes: BiaisPublie[] = (publies.data ?? []).flatMap((b) => {
    const indice = symboleDe.get(b.ticker_id);
    if (indice !== "SPX" && indice !== "NDX") return [];
    return [{
      date: b.date, indice, biais: b.biais, score: Number(b.score_numerique),
      rendement: rendements.get(`${indice}:${b.date}`) ?? null,
    }];
  });

  const ficheParRegime = new Map<string, FicheRegime>();
  for (const l of fiche?.data ?? []) {
    const f = ficheParRegime.get(l.regime) ?? { regime: l.regime, mois: l.mois, actifs: [] };
    f.actifs.push({ actif: l.actif, moyenne: Number(l.moyenne), hausse: Number(l.hausse) });
    ficheParRegime.set(l.regime, f);
  }

  const dernier = (s: string) => clotures[s]?.at(-1);
  const tp = clotures.TP10 ?? [];
  const eu2 = dernier("EU2Y");
  const eu10 = dernier("EU10Y");
  const ecart10 = (date: string) => {
    const u = auPlusTard(clotures.US10Y ?? [], date);
    const e = auPlusTard(clotures.EU10Y ?? [], date);
    return u && e ? u.cloture - e.cloture : null;
  };
  const eu10IlYa1m = (clotures.EU10Y ?? []).at(-22);
  const ecartMaintenant = eu10 ? ecart10(eu10.date) : null;
  const ecartAvant = eu10IlYa1m ? ecart10(eu10IlYa1m.date) : null;

  return {
    anticipations: calculerAnticipations(clotures, (reunions.data ?? []).map((r) => ({ date: r.date_evenement, provisoire: r.date_estimee })), aujourdhui),
    primeTerme: tp.at(-1) ? { valeur: tp.at(-1)!.cloture, var1mPb: tp.at(-22) ? (tp.at(-1)!.cloture - tp.at(-22)!.cloture) * 100 : null, date: tp.at(-1)!.date } : null,
    europe: eu2 && eu10
      ? {
        eu2: eu2.cloture, eu10: eu10.cloture,
        us2: auPlusTard(clotures.US2Y ?? [], eu10.date)?.cloture ?? null,
        us10: auPlusTard(clotures.US10Y ?? [], eu10.date)?.cloture ?? null,
        date: eu10.date,
        ecart10Var1mPb: ecartMaintenant !== null && ecartAvant !== null ? (ecartMaintenant - ecartAvant) * 100 : null,
      }
      : null,
    liquidite: calculerLiquidite(clotures),
    cot: calculerCot(cot.data ?? []),
    consensus: consensus.data ?? [],
    version: v,
    performance: ["SPX", "NDX"].map((i) => statistiquesBiais(historique, i)),
    sessions: statistiquesSessions(historique, coursSessions),
    sessionsDepuis: coursSessions[0]?.date ?? null,
    publies: publiesLignes,
    regimeActuel: regime?.data ? { regime: regime.data.regime, mois: regime.data.mois } : null,
    fiche: [...ficheParRegime.values()].sort((a, b) => b.mois - a.mois),
  };
}
