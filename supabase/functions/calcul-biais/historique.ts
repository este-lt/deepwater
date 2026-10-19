// Historique de performance du biais : les règles du jour rejouées sur l'historique en base,
// séance par séance, avec uniquement ce qui était publié avant la séance (délais de
// publication ci-dessous). Limite connue : FRED fournit les séries révisées, pas les
// premières estimations publiées à l'époque. Le consensus du fil instantané n'a pas
// d'historique : la surprise macro y est mesurée face à la publication précédente.
import { calculerPublication } from "../_shared/calendrier.ts";
import {
  analyserRegime,
  combiner,
  facteurConditions,
  facteurCourbe,
  facteurDollar,
  facteurFed,
  facteurLiquidite,
  facteurMacro,
  facteurPetrole,
  facteurPositionnement,
  facteurRegimeMacro,
  facteurRisque,
  facteurTaux,
  type PointMacro,
  type PointTaux,
  type PositionCot,
  type PublicationMacro,
} from "./facteurs.ts";
import { type CleIndice, REGLES_BIAIS } from "./regles.ts";

// Jours entre la date d'une observation et le moment où elle est connue avant l'ouverture.
export const DELAIS: Record<string, number> = {
  quotidien: 1, NFCI: 5, DXY: 5, WALCL: 2, TGA: 2, RRP: 1, M2: 55, COT: 6, decisions: 1,
  CPI: 45, CORE_CPI: 45, CORE_PCE: 60, PPI: 45, UNEMPLOYMENT: 37, NONFARM_PAYROLL: 37, JOBLESS_CLAIMS: 5, RETAIL_SALES: 45, REAL_GDP: 120,
};

export interface DonneesHistoriques {
  series: Record<string, PointTaux[]>; // triées par date
  decisions: PointTaux[]; // taux directeur de la Fed (changements)
  macro: Record<string, PointMacro[]>; // séries FRED brutes (clés du calendrier)
  cot: Record<string, PositionCot[]>; // par code de contrat
}

export interface LigneHistorique {
  date: string;
  indice: CleIndice;
  score: number;
  biais: "haussier" | "baissier" | "neutre";
  regime: string | null;
  part_disponible: number;
  rendement_1j: number | null;
  rendement_5j: number | null;
  rendement_20j: number | null;
  // Note de chaque facteur et mesures brutes connues avant la séance : de quoi mesurer ce
  // que chaque donnée annonce réellement (corrélation avec les rendements suivants).
  notes: Record<string, number | null>;
}

const arrondi4 = (v: number | null) => (v === null || !Number.isFinite(v) ? null : Math.round(v * 1e4) / 1e4);

// Mesures brutes à la date d : variations et niveaux tels qu'ils étaient connus.
function mesures(
  q: (cle: string, max: number) => PointTaux[], cot: { net: number; gerants: number | null; contrats: number | null; oi: number }[],
): Record<string, number | null> {
  const variation = (cle: string, n: number) => {
    const s = q(cle, n + 1);
    return s.length > n ? s[s.length - 1].taux - s[s.length - 1 - n].taux : null;
  };
  const variationPct = (cle: string, n: number) => {
    const s = q(cle, n + 1);
    return s.length > n && s[s.length - 1 - n].taux > 0 ? (s[s.length - 1].taux / s[s.length - 1 - n].taux - 1) * 100 : null;
  };
  const dernier = (cle: string) => q(cle, 1).at(-1)?.taux ?? null;
  const ffr = dernier("FFR");
  const un = dernier("US1Y");
  const deux = dernier("US2Y");
  const vix = q("VIX", 260);
  const triees = vix.map((p) => p.taux).sort((a, b) => a - b);
  const mediane = triees.length ? triees[Math.floor(triees.length / 2)] : null;
  const v = vix.at(-1)?.taux ?? null;
  const v3 = dernier("VIX3M");
  const net = cot.at(-1)?.net;
  const gerants = cot.at(-1)?.gerants ?? null;
  // Variation des contrats nets des gérants sur 4 semaines, rapportée à l'intérêt ouvert actuel.
  const contrats = cot.at(-1)?.contrats ?? null;
  const contratsAvant = cot.at(-5)?.contrats ?? null;
  const oi = cot.at(-1)?.oi ?? null;
  // Écart de taux à 10 ans États-Unis - zone euro et sa variation sur 20 séances.
  const ecart = (decalage: number) => {
    const us = q("US10Y", 21);
    const eu = q("EU10Y", 21);
    const a = us.at(-1 - decalage);
    const b = a ? [...eu].reverse().find((p) => p.date <= a.date) : undefined;
    return a && b ? a.taux - b.taux : null;
  };
  const e0 = ecart(0);
  const e20 = ecart(20);
  return {
    ecartFed: ffr !== null && un !== null && deux !== null ? (un + deux) / 2 - ffr : null,
    d1y5: variation("US1Y", 5), d2y5: variation("US2Y", 5), d2y20: variation("US2Y", 20),
    d10n5: variation("US10Y", 5), d10r5: variation("US10R", 5), d10r20: variation("US10R", 20), reel: dernier("US10R"),
    vix: v, vixEcart: v !== null && mediane !== null ? v - mediane : null, vixVar5: variation("VIX", 5),
    structure: v !== null && v3 ? v / v3 : null,
    hy: dernier("HY"), hyVar5: variation("HY", 5), hyVar20: variation("HY", 20),
    dxy20: variationPct("DXY", 20), nfci: dernier("NFCI"), nfciVar4: variation("NFCI", 4),
    wti20: variationPct("WTI", 20), wti63: variationPct("WTI", 63),
    d10b5: variation("EU10Y", 5), ecartUsEu: e0, ecartUsEuVar20: e0 !== null && e20 !== null ? e0 - e20 : null,
    or5: variationPct("XAU", 5), usdjpy5: variationPct("USDJPY", 5), usdchf5: variationPct("USDCHF", 5),
    cotCentile: net === undefined || cot.length < 26 ? null : cot.filter((p) => p.net <= net).length / cot.length,
    gerants, gerantsVar4: contrats !== null && contratsAvant !== null && oi ? (contrats - contratsAvant) / oi : null,
  };
}

const jourMoins = (date: string, jours: number) => new Date(Date.parse(`${date}T00:00:00Z`) - jours * 86_400_000).toISOString().slice(0, 10);

// Les `max` derniers points connus à la date `d` (date + délai <= d). Recherche dichotomique.
function connus<T extends { date: string }>(serie: T[], d: string, delai: number, max: number): T[] {
  const limite = jourMoins(d, delai);
  let bas = 0;
  let haut = serie.length;
  while (bas < haut) {
    const milieu = (bas + haut) >> 1;
    if (serie[milieu].date <= limite) bas = milieu + 1;
    else haut = milieu;
  }
  return serie.slice(Math.max(0, bas - max), bas);
}

export function rejouer(donnees: DonneesHistoriques, du: string, au: string): { lignes: LigneHistorique[]; regimes: { mois: string; regime: string; croissance: number; inflation: number }[] } {
  const s = (cle: string) => donnees.series[cle] ?? [];
  const lignes: LigneHistorique[] = [];
  const regimesParMois = new Map<string, { mois: string; regime: string; croissance: number; inflation: number }>();
  const q = (cle: string, d: string, max: number, delai = DELAIS.quotidien) => connus(s(cle), d, DELAIS[cle] ?? delai, max);
  const m = (cle: string, d: string, max = 20) => connus(donnees.macro[cle] ?? [], d, DELAIS[cle] ?? 45, max);

  for (const indice of Object.keys(REGLES_BIAIS.indices) as CleIndice[]) {
    const cours = s(indice);
    for (let i = 1; i < cours.length; i++) {
      const d = cours[i].date;
      if (d < du || d > au) continue;

      const publications: PublicationMacro[] = [];
      for (const cle of Object.keys(REGLES_BIAIS.macro.indicateurs)) {
        const points = m(cle, d, 16);
        const calcul = points.length >= 2 ? calculerPublication(cle, points) : null;
        if (!calcul || calcul.variation === null) continue;
        publications.push({
          indicateur: cle, periode: calcul.date, detecteeLe: jourMoins(calcul.date, -(DELAIS[cle] ?? 45)),
          valeur: calcul.valeur, variation: calcul.variation,
        });
      }
      const cycle = { emplois: m("NONFARM_PAYROLL", d), chomage: m("UNEMPLOYMENT", d), pib: m("REAL_GDP", d, 8), cpi: m("CPI", d), pce: m("CORE_PCE", d) };
      const regles = REGLES_BIAIS.indices[indice];
      const r = combiner([
        facteurFed(indice, q("US2Y", d, 6), q("FFR", d, 5), connus(donnees.decisions, d, DELAIS.decisions, 6), d, q("US1Y", d, 6)),
        facteurTaux(indice, q("US10Y", d, 10), q("US10R", d, 10), d, "FRED (DGS10, DFII10), BCE (courbe AAA)", q("EU10Y", d, 10)),
        facteurMacro(indice, publications, d, "FRED (BLS, BEA)"),
        facteurRegimeMacro(indice, cycle, q("WTI", d, 70), d),
        facteurLiquidite(indice, q("WALCL", d, 10), q("TGA", d, 10), q("RRP", d, 30), q("M2", d, 15), d),
        facteurDollar(indice, q("DXY", d, 25), d, q("US10Y", d, 25), q("EU10Y", d, 30)),
        facteurPetrole(indice, q("WTI", d, 25), d),
        facteurCourbe(indice, q("US3M", d, 5), q("US2Y", d, 5), q("US10Y", d, 5), d),
        facteurRisque(indice, q("VIX", d, 260), q("VIX3M", d, 5), d, q(REGLES_BIAIS.risque.credit, d, 10), {
          or: q("XAU", d, 12), usdjpy: q("USDJPY", d, 10), usdchf: q("USDCHF", d, 10),
        }),
        facteurConditions(indice, q("NFCI", d, 8), d),
        facteurPositionnement(indice, connus(donnees.cot[regles.cot] ?? [], d, DELAIS.COT, REGLES_BIAIS.positionnement.semainesHistorique), d),
      ]);
      if (!r.ok) continue;
      const total = r.facteurs.reduce((a, f) => a + f.poids, 0);
      const dispo = r.facteurs.filter((f) => f.statut === "ok").reduce((a, f) => a + f.poids, 0);
      const regime = analyserRegime(cycle, q("WTI", d, 70), d);
      const avant = cours[i - 1].taux;
      const apres5 = cours[i + 4]?.taux;
      const apres20 = cours[i + 19]?.taux;
      const cotConnu = connus(donnees.cot[regles.cot] ?? [], d, DELAIS.COT, REGLES_BIAIS.positionnement.semainesHistorique)
        .filter((p) => p.interet_ouvert > 0).map((p) => ({
          net: (p.fonds_long - p.fonds_court) / p.interet_ouvert,
          gerants: p.gerants_long === undefined || p.gerants_court === undefined ? null : (p.gerants_long - p.gerants_court) / p.interet_ouvert,
          contrats: p.gerants_long === undefined || p.gerants_court === undefined ? null : p.gerants_long - p.gerants_court,
          oi: p.interet_ouvert,
        }));
      const notes: Record<string, number | null> = {
        ...Object.fromEntries(r.facteurs.map((f) => [f.cle, f.note])),
        ...mesures((cle, max) => q(cle, d, max), cotConnu),
        croissance: regime ? regime.croissance : null,
        inflation: regime ? regime.inflation : null,
      };
      lignes.push({
        date: d, indice, score: r.score, biais: r.biais, regime: regime?.regime[0] ?? null,
        part_disponible: Math.round((dispo / total) * 1000) / 1000,
        rendement_1j: avant > 0 ? Math.round((cours[i].taux / avant - 1) * 1e6) / 1e4 : null,
        rendement_5j: avant > 0 && apres5 !== undefined ? Math.round((apres5 / avant - 1) * 1e6) / 1e4 : null,
        rendement_20j: avant > 0 && apres20 !== undefined ? Math.round((apres20 / avant - 1) * 1e6) / 1e4 : null,
        notes: Object.fromEntries(Object.entries(notes).map(([k, v]) => [k, arrondi4(v)])),
      });
      // Régime du mois : celui de la dernière séance du mois (calculé une fois, sur le S&P 500).
      if (indice === "SPX" && regime) {
        const mois = `${d.slice(0, 7)}-01`;
        regimesParMois.set(mois, { mois, regime: regime.regime[0], croissance: Math.round(regime.croissance * 1000) / 1000, inflation: Math.round(regime.inflation * 1000) / 1000 });
      }
    }
  }
  return { lignes, regimes: [...regimesParMois.values()] };
}

// Statistiques de performance : taux de réussite (sens du biais = sens de la séance) et
// rendement moyen par biais, comparés à la moyenne de toutes les séances.
export function statistiques(lignes: { biais: string; rendement_1j: number | null; rendement_5j: number | null }[]) {
  const moyenne = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
  const tous = lignes.filter((l) => l.rendement_1j !== null);
  const parBiais = (b: string) => {
    const l = tous.filter((x) => x.biais === b);
    const reussites = l.filter((x) => (b === "haussier" ? x.rendement_1j! > 0 : b === "baissier" ? x.rendement_1j! < 0 : false)).length;
    return {
      seances: l.length,
      reussite: b === "neutre" || l.length === 0 ? null : reussites / l.length,
      moyenne1j: moyenne(l.map((x) => x.rendement_1j!)),
      moyenne5j: moyenne(l.flatMap((x) => (x.rendement_5j === null ? [] : [x.rendement_5j]))),
    };
  };
  return {
    seances: tous.length,
    moyenne1j: moyenne(tous.map((x) => x.rendement_1j!)),
    hausseSpontanee: tous.length ? tous.filter((x) => x.rendement_1j! > 0).length / tous.length : null,
    haussier: parBiais("haussier"),
    baissier: parBiais("baissier"),
    neutre: parBiais("neutre"),
  };
}
