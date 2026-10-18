// npx deno test --allow-read supabase/functions : jours fériés de la Bourse de New York.
import { assert, assertEquals } from "./verifications.ts";
import { estFerieNyse, feriesNyse } from "./feries.ts";
import { feriesNyse as feriesSite } from "../../../src/lib/feries.ts";

Deno.test("jours fériés NYSE : calendrier officiel 2026 et 2027", () => {
  assertEquals([...feriesNyse(2026)].sort(), [
    "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
    "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  ]);
  assertEquals([...feriesNyse(2027)].sort(), [
    "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31",
    "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
  ]);
  // Jour de l'an un samedi (2028) : pas de fermeture le vendredi 31 décembre 2027.
  assert(!estFerieNyse("2027-12-31"), "31/12/2027 ouvert");
  assert(!feriesNyse(2028).has("2027-12-31") && ![...feriesNyse(2028)].some((d) => d.startsWith("2028-01-0")), "2028 sans jour de l'an");
});

Deno.test("jours fériés : la copie du site est identique (2020 à 2040)", () => {
  for (let a = 2020; a <= 2040; a++) assertEquals([...feriesSite(a)].sort(), [...feriesNyse(a)].sort());
});
