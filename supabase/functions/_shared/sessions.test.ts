// deno test supabase/functions/_shared/sessions.test.ts
import { assertEquals } from "./verifications.ts";
import { bornesSession, debutSessionPrecedente, sessionVisee } from "./sessions.ts";

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

Deno.test("sessions : session visée selon l'heure, session précédente", () => {
  assertEquals(sessionVisee(new Date("2026-10-18T21:35:00Z"), "2026-10-19"), "asie"); // dimanche 17 h 35 à New York
  // La session qui commence dans l'heure : Londres à 2 h 35, New York à 9 h 05.
  assertEquals(sessionVisee(new Date("2026-10-19T06:35:00Z"), "2026-10-19"), "londres");
  assertEquals(sessionVisee(new Date("2026-10-19T13:05:00Z"), "2026-10-19"), "new_york");
  // Sinon la session en cours : Asie à 1 h, Londres à 7 h, New York à 11 h.
  assertEquals(sessionVisee(new Date("2026-10-19T05:00:00Z"), "2026-10-19"), "asie");
  assertEquals(sessionVisee(new Date("2026-10-19T11:00:00Z"), "2026-10-19"), "londres");
  assertEquals(sessionVisee(new Date("2026-10-19T15:00:00Z"), "2026-10-19"), "new_york");
  assertEquals(debutSessionPrecedente("2026-10-19", "new_york"), "2026-10-19T07:00:00.000Z");
  assertEquals(debutSessionPrecedente("2026-10-19", "asie"), "2026-10-18T13:30:00.000Z");
});
