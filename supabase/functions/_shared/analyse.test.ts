// npx deno test --allow-read supabase/functions : règles du régime, des corrélations et de la force des devises.
import { assert, assertAlmostEquals, assertEquals } from "./verifications.ts";
import {
  calculerForceDevises,
  calculerRegime,
  classerPaires,
  correlation,
  couvertures,
  matriceCorrelations,
  type Serie,
  variation,
} from "../../../src/lib/analyse.ts";

const jours = (n: number) => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 6, 1) + i * 86_400_000).toISOString().slice(0, 10));
const serie = (valeurs: number[]): Serie => jours(valeurs.length).map((date, i) => ({ date, cloture: valeurs[i] }));
const lineaire = (n: number, debut: number, pas: number) => serie(Array.from({ length: n }, (_, i) => debut + i * pas));
// Bruit déterministe (pour des corrélations non triviales).
const bruit = (n: number, graine: number) => Array.from({ length: n }, (_, i) => Math.sin(i * 1.7 + graine) * 0.01);

Deno.test("Variation sur n séances, en % ou en points", () => {
  const s = serie([100, 101, 102, 103, 104, 110]);
  assertAlmostEquals(variation(s, 5)!, 10, 1e-9);
  assertEquals(variation(s, 5, "pts"), 10);
  assertEquals(variation(s, 6), null);
});

Deno.test("Régime : VIX sous sa médiane et en baisse, spread qui se resserre, conditions souples = risk-on", () => {
  const n = 30;
  const r = calculerRegime({
    VIX: lineaire(n, 25, -0.6), // de 25 à 7,6 : sous la médiane et en baisse
    HY: lineaire(n, 3.5, -0.02),
    NFCI: lineaire(8, -0.3, -0.03),
  });
  assertEquals(r.etat, "risk-on");
  assert(r.score! > 0.5);
  assertEquals(r.composantes.map((c) => c.cle), ["volatilite", "credit", "conditions"]);
  const inverse = calculerRegime({ VIX: lineaire(n, 15, 1), HY: lineaire(n, 3, 0.03), NFCI: lineaire(8, 0.2, 0.05) });
  assertEquals(inverse.etat, "risk-off");
  // Aucune variation de cours d'actions ou de devises n'entre dans le régime.
  assertEquals(calculerRegime({ SPX: lineaire(n, 5000, 50), AUDUSD: lineaire(n, 0.6, 0.01) }).etat, "indisponible");
});

Deno.test("Corrélations : identique = 1, opposée = -1, matrice symétrique", () => {
  assertAlmostEquals(correlation([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [2, 4, 6, 8, 10, 12, 14, 16, 18, 20])!, 1, 1e-9);
  const n = 80;
  const b = bruit(n, 0);
  const a = serie(b.reduce<number[]>((acc, r, i) => [...acc, (acc[i - 1] ?? 100) * Math.exp(r)], []));
  const oppose = serie(b.reduce<number[]>((acc, r, i) => [...acc, (acc[i - 1] ?? 100) * Math.exp(-r)], []));
  const m = matriceCorrelations({ A: a, B: oppose }, [{ symbole: "A", mode: "pct" }, { symbole: "B", mode: "pct" }], 60);
  assertAlmostEquals(m[0][1]!, -1, 1e-6);
  assertEquals(m[0][1], m[1][0]);
  // Couverture : l'or qui monte quand les actions baissent arrive en tête.
  const c = couvertures({ SPX: a, XAU: oppose, VIX: a });
  assertEquals(c[0].cle, "or");
});

Deno.test("Force des devises : AUD fort (portage, taux réel, hausses de taux, croissance) contre JPY faible", () => {
  const d = (date: string, valeur: number) => ({ date, valeur });
  const serie4 = (valeurs: number[]) => valeurs.map((v, i) => d(`2026-0${i + 4}-01`, v));
  const forces = calculerForceDevises({
    decisions: {
      AUD: [d("2025-01-01", 3.6), d("2026-05-06", 4.35), d("2026-09-30", 4.6)],
      JPY: [d("2024-03-19", 0.1), d("2025-01-24", 0.5)],
      USD: [d("2025-12-11", 3.625)], EUR: [d("2026-06-17", 2.25)], GBP: [d("2025-12-18", 3.75)],
      CHF: [d("2025-06-20", 0)], CAD: [d("2025-10-30", 2.25)], NZD: [d("2026-09-03", 2.75)],
    },
    // Taux réel : AUD 4,6 - 3,0 ; JPY 0,5 - 3,0 (négatif).
    inflation: { AUD: serie4([3, 3, 3, 3]), JPY: serie4([3, 3, 3, 3]) },
    chomage: { AUD: serie4([4.6, 4.5, 4.4, 4.3]), JPY: serie4([2.4, 2.5, 2.6, 2.7]) },
    pib: { AUD: [d("2026-04-01", 0.9)], JPY: [d("2026-04-01", -0.2)], USD: [d("2026-04-01", 0.5)] },
    regime: 0.5,
    aujourdhui: "2026-10-17",
  });
  assertEquals(forces[0].devise, "AUD");
  // JPY (taux réel très négatif) parmi les deux devises les plus faibles.
  assert(forces.slice(-2).some((f) => f.devise === "JPY"), forces.map((f) => f.devise).join(","));
  assertEquals(forces[0].orientation, "restrictive");
  assertEquals(forces[0].dernierMouvement, { date: "2026-09-30", ecartPb: 25 });
  const paires = classerPaires(forces);
  const audJpy = paires.find((p) => p.paire === "AUD/JPY")!;
  assertEquals(audJpy.sens, "achat");
  // Les cinq facteurs fondamentaux vont dans le même sens ; les corrélations (dollar seul ici)
  // pèsent autant sur l'AUD que sur le JPY : 5 étoiles sur 6.
  assertEquals(audJpy.etoiles, 5);
  assertEquals(Object.keys(forces[0].facteurs), ["portage", "tauxReel", "orientation", "macro", "regime", "positionnement", "intermarche"]);
});

Deno.test("Corrélations inter-marchés (fiche Aupa Traders) : pétrole -> CAD, or et S&P 500 -> CHF, dollar -> EUR", () => {
  const d = (date: string, valeur: number) => ({ date, valeur });
  const base = {
    decisions: {
      USD: [d("2025-12-11", 3.625), d("2026-09-17", 3.875)], EUR: [d("2026-06-17", 2.25)], GBP: [d("2025-12-18", 3.75)],
      CHF: [d("2025-06-20", 0)], CAD: [d("2025-10-30", 2.25)], AUD: [d("2026-09-30", 4.6)], NZD: [d("2026-09-03", 2.75)], JPY: [d("2026-09-24", 1.25)],
    },
    inflation: { CHF: [d("2026-08-01", 0.2)] }, chomage: {}, pib: {}, regime: 0, aujourdhui: "2026-10-17",
  };
  const parDevise = (moteurs: Record<string, number | null>) =>
    new Map(calculerForceDevises({ ...base, moteurs }).map((f) => [f.devise, f]));
  // Pétrole +10 % sur 20 séances : note pleine pour le CAD (avec le dollar, aussi favorable au CAD).
  const hausse = parDevise({ petrole: 10, or: 5, sp500: -5, yuan: null });
  const cad = hausse.get("CAD")!;
  assertEquals(cad.liens.map((l) => l.moteur), ["petrole", "USD"]);
  assertEquals(cad.liens[0].note, 1);
  // Or +5 % et S&P 500 -5 % : les deux poussent le CHF (valeur refuge).
  assertEquals(hausse.get("CHF")!.facteurs.intermarche, 1);
  // Dollar fondamentalement fort : l'euro le subit à l'inverse.
  const usd = hausse.get("USD")!;
  assertEquals(usd.facteurs.intermarche, null);
  const lienEur = hausse.get("EUR")!.liens[0];
  assert(lienEur.moteur === "USD" && lienEur.valeur !== null && lienEur.valeur > 0, "dollar fort");
  assertAlmostEquals(lienEur.note!, -lienEur.valeur, 1e-12);
  // Sans moteur disponible : facteur indisponible, poids retiré, score toujours calculé.
  const sans = parDevise({ petrole: null, or: null, sp500: null, yuan: null });
  assertEquals(sans.get("CHF")!.facteurs.intermarche, null);
  assert(sans.get("CHF")!.score !== null, "score sans corrélations");
});

Deno.test("Devises : surprises face au consensus et positionnement COT contrarien", () => {
  const d = (date: string, valeur: number) => ({ date, valeur });
  const decisions = Object.fromEntries(["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD"].map((x) => [x, [d("2026-01-01", 2), d("2026-09-01", 2)]]));
  const semaines = (dernier: number) => Array.from({ length: 52 }, (_, i) => ({ date: new Date(Date.UTC(2025, 9, 14) + i * 7 * 86_400_000).toISOString().slice(0, 10), net: i === 51 ? dernier : 0 }));
  const forces = new Map(calculerForceDevises({
    decisions, inflation: {}, chomage: {}, pib: {}, regime: 0, aujourdhui: "2026-10-17",
    consensus: { GBP: [1, 0.5] },
    cot: { EUR: semaines(0.3), JPY: semaines(-0.3) },
  }).map((f) => [f.devise, f]));
  // GBP : chiffres au-dessus du consensus -> croissance et emploi positifs.
  assertAlmostEquals(forces.get("GBP")!.facteurs.macro!, 0.75, 1e-9);
  // EUR : fonds très acheteurs (centile maximal) -> -1 ; JPY : très vendeurs -> positif.
  assertEquals(forces.get("EUR")!.facteurs.positionnement, -1);
  assert(forces.get("JPY")!.facteurs.positionnement! > 0.9, `JPY ${forces.get("JPY")!.facteurs.positionnement}`);
  assertEquals(forces.get("USD")!.facteurs.positionnement, null);
});
