// npx deno test --allow-read supabase/functions : règles du régime, des corrélations et de la force des devises.
import { assert, assertAlmostEquals, assertEquals } from "./verifications.ts";
import {
  calculerForceDevises,
  calculerRegime,
  classerPaires,
  correlation,
  couvertures,
  matriceCorrelations,
  produit,
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

Deno.test("Croisé AUD/JPY aux dates communes", () => {
  const a = serie([0.7, 0.71]);
  const b = [{ date: jours(2)[1], cloture: 150 }];
  assertEquals(produit(a, b), [{ date: jours(2)[1], cloture: 0.71 * 150 }]);
});

Deno.test("Régime : actions en hausse, VIX et spreads en baisse, AUD/JPY en hausse = risk-on", () => {
  const n = 30;
  const r = calculerRegime({
    SPX: lineaire(n, 5000, 20), // +2 % environ sur 5 séances
    VIX: lineaire(n, 25, -0.6),
    HY: lineaire(n, 3.5, -0.02),
    AUDUSD: lineaire(n, 0.65, 0.002),
    USDJPY: lineaire(n, 145, 0.3),
    USDCHF: lineaire(n, 0.8, 0.001),
    XAU: lineaire(n, 3000, -10),
  });
  assertEquals(r.etat, "risk-on");
  assert(r.score! > 0.5);
  const inverse = calculerRegime({ SPX: lineaire(n, 5000, -25), VIX: lineaire(n, 15, 1), HY: lineaire(n, 3, 0.03), XAU: lineaire(n, 3000, 15) });
  assertEquals(inverse.etat, "risk-off");
  assertEquals(calculerRegime({ SPX: lineaire(n, 5000, 1) }).etat, "indisponible");
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

Deno.test("Force des devises : AUD fort (momentum, taux, hausse de taux) contre JPY faible", () => {
  const n = 40;
  const fx = {
    EURUSD: lineaire(n, 1.1, 0),
    GBPUSD: lineaire(n, 1.3, 0),
    AUDUSD: lineaire(n, 0.65, 0.002), // l'AUD monte
    NZDUSD: lineaire(n, 0.6, 0),
    USDJPY: lineaire(n, 140, 0.5), // le yen baisse
    USDCHF: lineaire(n, 0.8, 0),
    USDCAD: lineaire(n, 1.35, 0),
  };
  const d = (date: string, valeur: number) => ({ date, valeur });
  const forces = calculerForceDevises({
    fx,
    decisions: {
      AUD: [d("2025-01-01", 3.6), d("2026-05-06", 4.35), d("2026-09-30", 4.6)],
      JPY: [d("2024-03-19", 0.1), d("2025-01-24", 0.5)],
      USD: [d("2025-12-11", 3.625)], EUR: [d("2026-06-17", 2.25)], GBP: [d("2025-12-18", 3.75)],
      CHF: [d("2025-06-20", 0)], CAD: [d("2025-10-30", 2.25)], NZD: [d("2026-09-03", 2.75)],
    },
    inflation: {},
    chomage: {},
    pib: {},
    regime: 0.5,
    aujourdhui: "2026-10-17",
  });
  assertEquals(forces[0].devise, "AUD");
  assertEquals(forces.at(-1)!.devise, "JPY");
  assertEquals(forces[0].orientation, "restrictive");
  assertEquals(forces[0].dernierMouvement, { date: "2026-09-30", ecartPb: 25 });
  const paires = classerPaires(forces);
  assertEquals(paires[0].paire, "AUD/JPY");
  assertEquals(paires[0].sens, "achat");
  assert(paires[0].etoiles >= 4);
});
