// deno test supabase/functions/_shared/sessions.test.ts
import { assertEquals } from "./verifications.ts";
import { bornesSession, debutPublications, seancePrecedente } from "./sessions.ts";

Deno.test("sessions : bornes en heure d'été (New York et Londres à l'heure d'été)", () => {
  // Lundi 19/10/2026 : New York UTC-4, Londres UTC+1.
  assertEquals(bornesSession("2026-10-19", "asie"), { debut: "2026-10-18T22:00:00.000Z", fin: "2026-10-19T07:00:00.000Z" });
  assertEquals(bornesSession("2026-10-19", "londres"), { debut: "2026-10-19T07:00:00.000Z", fin: "2026-10-19T13:30:00.000Z" });
  assertEquals(bornesSession("2026-10-19", "new_york"), { debut: "2026-10-19T13:30:00.000Z", fin: "2026-10-19T20:00:00.000Z" });
});

Deno.test("sessions : semaines de décalage entre New York et Londres, heure d'hiver", () => {
  // Mardi 10/03/2026 : New York déjà à l'heure d'été (UTC-4), Londres encore en GMT.
  assertEquals(bornesSession("2026-03-10", "londres").debut, "2026-03-10T08:00:00.000Z"); // 4 h à New York
  // Lundi 07/12/2026 : heure d'hiver des deux côtés.
  assertEquals(bornesSession("2026-12-07", "asie").debut, "2026-12-06T23:00:00.000Z");
  assertEquals(bornesSession("2026-12-07", "new_york").debut, "2026-12-07T14:30:00.000Z");
});

Deno.test("sessions : séance précédente et fenêtre des publications depuis la dernière clôture", () => {
  // Lundi 19/10/2026 : la dernière clôture est celle du vendredi 16/10 à 16 h (20:00Z).
  assertEquals(seancePrecedente("2026-10-19"), "2026-10-16");
  assertEquals(debutPublications("2026-10-19"), "2026-10-16T20:00:00.000Z");
  // Vendredi 27/11/2026, lendemain de Thanksgiving : la veille ouvrée est le mercredi 25/11.
  assertEquals(seancePrecedente("2026-11-27"), "2026-11-25");
  // Heure d'hiver : 16 h à New York = 21:00Z.
  assertEquals(debutPublications("2026-12-08"), "2026-12-07T21:00:00.000Z");
});
