// deno test supabase/functions/calcul-biais
import {
  combiner,
  facteurFlux,
  facteurMacro,
  facteurTaux,
  facteurTendance,
  type PointTaux,
  seanceVisee,
  type TransactionInitie,
} from "./facteurs.ts";

function egal<T>(libelle: string, reel: T, attendu: T) {
  if (reel !== attendu) throw new Error(`${libelle} : obtenu ${reel}, attendu ${attendu}`);
}

Deno.test("séance visée : heure de New York, changement d'heure et week-end", () => {
  // 16/10/2026 14:00 UTC = 10:00 à New York (heure d'été) : séance du jour.
  egal("vendredi matin", seanceVisee(new Date("2026-10-16T14:00:00Z")), "2026-10-16");
  // 16/10/2026 20:30 UTC = 16:30 à New York : clôture passée -> lundi.
  egal("vendredi soir", seanceVisee(new Date("2026-10-16T20:30:00Z")), "2026-10-19");
  // 03/11/2026 20:30 UTC = 15:30 à New York (heure d'hiver, UTC-5) : encore la séance du jour.
  egal("hiver avant clôture", seanceVisee(new Date("2026-11-03T20:30:00Z")), "2026-11-03");
  // 08/03/2026 03:00 UTC = samedi 22:00 à New York -> lundi.
  egal("samedi", seanceVisee(new Date("2026-03-08T03:00:00Z")), "2026-03-09");
});

Deno.test("tendance : écarts aux moyennes mobiles, donnée trop ancienne", () => {
  const f = facteurTendance("SPX", { date: "2026-10-15", cloture: 102, mm20: 100, mm50: 98, source: "fred:SP500" }, "2026-10-16");
  // +2 % / 2 % = +1 (moitié) ; +4,08 % / 4 % = +1 borné (moitié) -> +1.
  egal("note pleine", f.note, 1);
  if (!f.texte.includes("2,0 % au-dessus de la MM20")) throw new Error(f.texte);
  const vieux = facteurTendance("SPX", { date: "2026-10-01", cloture: 102, mm20: 100, mm50: 98, source: "fred:SP500" }, "2026-10-16");
  egal("trop ancien", vieux.statut, "indisponible");
});

Deno.test("taux : une hausse rapide est baissière, une baisse haussière", () => {
  const serie = (fin: number): PointTaux[] =>
    Array.from({ length: 30 }, (_, i) => ({
      date: new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10),
      taux: i < 25 ? 4 : 4 + ((fin - 4) * (i - 24)) / 5,
    }));
  const hausse = facteurTaux("SPX", serie(4.2), "2026-10-01", "av");
  const baisse = facteurTaux("SPX", serie(3.8), "2026-10-01", "av");
  if (!(hausse.note! < -0.5)) throw new Error(`hausse : ${hausse.note}`);
  if (!(baisse.note! > 0.5)) throw new Error(`baisse : ${baisse.note}`);
});

Deno.test("macro : sens par indicateur et fenêtre de fraîcheur", () => {
  const pub = (indicateur: string, variation: number, detecteeLe = "2026-10-10") => ({
    indicateur, periode: "2026-09-01", detecteeLe, valeur: 3, variation,
  });
  egal("inflation en hausse", facteurMacro("SPX", [pub("CPI", 0.3)], "2026-10-16", "av").note, -1);
  egal("emplois en hausse", facteurMacro("SPX", [pub("NONFARM_PAYROLL", 50)], "2026-10-16", "av").note, 0.5);
  egal("trop ancienne", facteurMacro("SPX", [pub("CPI", 0.3, "2026-08-01")], "2026-10-16", "av").statut, "indisponible");
});

Deno.test("flux : comparaison à la moyenne de 13 semaines, filtre Nasdaq-100", () => {
  const t: TransactionInitie[] = [];
  // 13 semaines de ventes de 100 à 140 M$, puis une semaine récente à 300 M$ de ventes.
  for (let k = 1; k <= 13; k++) {
    const date = new Date(Date.parse("2026-10-16") - (7 * k + 1) * 86_400_000).toISOString().slice(0, 10);
    t.push({ entreprise: "AAPL", code: "S", montant: (100 + (k % 5) * 10) * 1e6, date_depot: date });
  }
  t.push({ entreprise: "AAPL", code: "S", montant: 300e6, date_depot: "2026-10-14" });
  t.push({ entreprise: "JPM", code: "P", montant: 5e9, date_depot: "2026-10-14" });
  const ndx = facteurFlux("NDX", t, [], "2026-10-16");
  egal("ventes inhabituelles -> -1", ndx.note, -1);
  const spx = facteurFlux("SPX", t, [], "2026-10-16");
  egal("achat JPM compté pour le S&P 500", spx.note, 1);
  if (!ndx.texte.includes("aucune déclaration 13F")) throw new Error(ndx.texte);
});

Deno.test("synthèse : facteur indisponible retiré, tendance obligatoire, raisons", () => {
  const tendance = facteurTendance("SPX", { date: "2026-10-15", cloture: 102, mm20: 100, mm50: 98, source: "fred" }, "2026-10-16");
  const macro = facteurMacro("SPX", [], "2026-10-16", "av");
  const r = combiner([tendance, macro]);
  if (!r.ok) throw new Error(r.raison);
  // Seule la tendance (0,35) est disponible sur 0,55 : 64 % >= 50 %, score = 1.
  egal("score", r.score, 1);
  egal("biais", r.biais, "haussier");
  egal("raisons", r.raisons.length, 1);
  const sansCours = combiner([facteurTendance("SPX", null, "2026-10-16"), macro]);
  egal("sans cours", sansCours.ok, false);
});
