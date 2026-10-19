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
        facteurFed(indice, q("US2Y", d, 5), q("FFR", d, 5), connus(donnees.decisions, d, DELAIS.decisions, 6), d, q("US1Y", d, 5)),
        facteurTaux(indice, q("US10Y", d, 10), q("US10R", d, 10), d, "FRED (DGS10, DFII10)"),
        facteurMacro(indice, publications, d, "FRED (BLS, BEA)"),
        facteurRegimeMacro(indice, cycle, q("WTI", d, 70), d),
        facteurLiquidite(indice, q("WALCL", d, 10), q("TGA", d, 10), q("RRP", d, 30), q("M2", d, 15), d),
        facteurDollar(indice, q("DXY", d, 25), d),
        facteurCourbe(indice, q("US3M", d, 5), q("US2Y", d, 5), q("US10Y", d, 5), d),
        facteurRisque(indice, q(regles.volatilite, d, 260), q(REGLES_BIAIS.risque.credit, d, 10), d, q("VIX", d, 5), q("VIX3M", d, 5)),
        facteurConditions(indice, q("NFCI", d, 8), d),
        facteurPositionnement(indice, connus(donnees.cot[regles.cot] ?? [], d, DELAIS.COT, REGLES_BIAIS.positionnement.semainesHistorique), d),
      ]);
      if (!r.ok) continue;
      const total = r.facteurs.reduce((a, f) => a + f.poids, 0);
      const dispo = r.facteurs.filter((f) => f.statut === "ok").reduce((a, f) => a + f.poids, 0);
      const regime = analyserRegime(cycle, q("WTI", d, 70), d);
      const avant = cours[i - 1].taux;
      const apres5 = cours[i + 4]?.taux;
      lignes.push({
        date: d, indice, score: r.score, biais: r.biais, regime: regime?.regime[0] ?? null,
        part_disponible: Math.round((dispo / total) * 1000) / 1000,
        rendement_1j: avant > 0 ? Math.round((cours[i].taux / avant - 1) * 1e6) / 1e4 : null,
        rendement_5j: avant > 0 && apres5 !== undefined ? Math.round((apres5 / avant - 1) * 1e6) / 1e4 : null,
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
