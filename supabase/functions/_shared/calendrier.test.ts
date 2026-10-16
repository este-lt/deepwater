// deno test supabase/functions/_shared/calendrier.test.ts
// Valeurs réelles (FRED, consultées le 16/10/2026) : octobre 2025 n'a jamais été
// publié pour le CPI et le chômage (shutdown fédéral).
import { calculerPublication, moisAvant } from "./calendrier.ts";

function egal(reel: unknown, attendu: unknown, libelle: string) {
  if (JSON.stringify(reel) !== JSON.stringify(attendu)) {
    throw new Error(`${libelle} : obtenu ${JSON.stringify(reel)}, attendu ${JSON.stringify(attendu)}`);
  }
}

const serie = (valeurs: Record<string, number>) =>
  Object.entries(valeurs).map(([date, valeur]) => ({ date, valeur })).sort((a, b) => a.date.localeCompare(b.date));

// CPIAUCNS, sans 2025-10-01.
const CPI = serie({
  "2025-08-01": 323.976, "2025-09-01": 324.800, "2025-11-01": 324.122, "2025-12-01": 324.054,
  "2026-01-01": 325.252, "2026-02-01": 326.785, "2026-03-01": 330.213, "2026-04-01": 333.020,
  "2026-05-01": 335.123, "2026-06-01": 333.952, "2026-07-01": 333.918, "2026-08-01": 334.980,
  "2026-09-01": 336.940,
});

Deno.test("décalage de mois", () => {
  egal(moisAvant("2026-09-01", 12), "2025-09-01", "12 mois");
  egal(moisAvant("2026-01-01", 1), "2025-12-01", "changement d'année");
  egal(moisAvant("2026-04-01", 3), "2026-01-01", "trimestre");
});

Deno.test("CPI sur 1 an : même mois de l'année précédente malgré le mois manquant", () => {
  // Par position, septembre 2026 aurait été comparé à août 2025 (13 mois, 4,0 %).
  egal(calculerPublication("CPI", CPI), {
    date: "2026-09-01",
    valeur: 3.738,
    precedente: 3.397,
    variation: 0.341,
  }, "CPI septembre 2026");
});

Deno.test("CPI sur 1 an indisponible quand le mois de référence manque", () => {
  const r = calculerPublication("CPI", [...CPI, { date: "2026-10-01", valeur: 337.5 }]);
  egal(r, { date: "2026-10-01", valeur: null, precedente: 3.738, variation: null }, "CPI octobre 2026");
});

Deno.test("chômage : pas de valeur précédente si le mois d'avant manque", () => {
  const r = calculerPublication("UNEMPLOYMENT", serie({ "2025-09-01": 4.4, "2025-11-01": 4.5 }));
  egal(r, { date: "2025-11-01", valeur: 4.5, precedente: null, variation: null }, "chômage novembre 2025");
});

Deno.test("emplois créés : variation mensuelle en milliers (PAYEMS)", () => {
  const r = calculerPublication("NONFARM_PAYROLL", serie({ "2026-07-01": 158882, "2026-08-01": 159015, "2026-09-01": 159044 }));
  egal(r, { date: "2026-09-01", valeur: 29, precedente: 133, variation: -104 }, "NFP septembre 2026");
});

Deno.test("PIB : croissance trimestrielle annualisée (GDPC1)", () => {
  const r = calculerPublication("REAL_GDP", serie({ "2025-10-01": 24125.479, "2026-01-01": 24274.383, "2026-04-01": 24408.011 }));
  egal(r, { date: "2026-04-01", valeur: 2.22, precedente: 2.492, variation: -0.272 }, "PIB T2 2026");
});

Deno.test("indicateur sans publication", () => {
  egal(calculerPublication("FEDERAL_FUNDS_RATE", CPI), null, "taux directeur");
});
