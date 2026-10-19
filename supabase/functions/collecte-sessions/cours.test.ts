// deno test supabase/functions/collecte-sessions
import { assertEquals } from "../_shared/verifications.ts";
import { type Barre, contratPourSeance, mesurerSeances, mesurerSession, seancesOuvrees } from "./cours.ts";

Deno.test("contrat le plus proche : roulement 8 jours avant l'échéance du 3e vendredi", () => {
  // Échéance de décembre 2026 : vendredi 18/12, roulement jeudi 10/12.
  assertEquals(contratPourSeance("ES", "2026-10-19"), "ESZ6");
  assertEquals(contratPourSeance("ES", "2026-12-09"), "ESZ6");
  assertEquals(contratPourSeance("ES", "2026-12-10"), "ESH7");
  assertEquals(contratPourSeance("NQ", "2026-12-31"), "NQH7");
  // Échéance de mars 2026 : vendredi 20/03, roulement jeudi 12/03.
  assertEquals(contratPourSeance("NQ", "2026-03-11"), "NQH6");
  assertEquals(contratPourSeance("NQ", "2026-03-12"), "NQM6");
});

Deno.test("séances ouvrées : week-ends et jours fériés de New York exclus", () => {
  // Thanksgiving jeudi 26/11/2026.
  assertEquals(seancesOuvrees("2026-11-23", "2026-11-29"), ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-27"]);
});

Deno.test("mesure d'une session : première ouverture, dernière clôture, rendement", () => {
  // Session de New York du 19/10/2026 : 13:30Z -> 20:00Z, 13 barres de 30 minutes.
  const debut = Date.parse("2026-10-19T13:30:00Z");
  const barres: Barre[] = Array.from({ length: 13 }, (_, i) => ({ debut: debut + i * 1_800_000, ouverture: 6000 + i, cloture: 6001 + i }));
  const m = mesurerSession(barres, "2026-10-19T13:30:00Z", "2026-10-19T20:00:00Z")!;
  assertEquals(m.ouverture, 6000);
  assertEquals(m.cloture, 6013);
  assertEquals(m.rendement, Math.round((6013 / 6000 - 1) * 1e8) / 1e6);
  // Barres manquantes en fin de session (plus d'une heure) : pas de mesure.
  assertEquals(mesurerSession(barres.slice(0, 9), "2026-10-19T13:30:00Z", "2026-10-19T20:00:00Z"), null);
  // Les trois sessions d'une séance, à partir de barres continues de la veille 22:00Z à 20:00Z.
  const veille = Date.parse("2026-10-18T22:00:00Z");
  const continues: Barre[] = Array.from({ length: 44 }, (_, i) => ({ debut: veille + i * 1_800_000, ouverture: 100 + i, cloture: 100.5 + i }));
  assertEquals(mesurerSeances(continues, ["2026-10-19"]).map((s) => [s.session, s.ouverture, s.cloture]), [
    ["asie", 100, 117.5], // 22:00Z -> 07:00Z
    ["londres", 118, 130.5], // 07:00Z -> 13:30Z
    ["new_york", 131, 143.5], // 13:30Z -> 20:00Z
  ]);
});
