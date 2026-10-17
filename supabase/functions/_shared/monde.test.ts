import { assertEquals } from "./verifications.ts";
import { lireCsv } from "./csv.ts";
import { analyserCalendrier, traduireTitre } from "./forexfactory.ts";
import { changementsDeTaux, debutPeriode, glissementAnnuel } from "./monde.ts";

Deno.test("CSV : guillemets, virgules et retours à la ligne dans les champs", () => {
  const lignes = lireCsv('A,B,C\r\n1,"texte, avec ""guillemets""\net retour",3\n\n4,5,6\n');
  assertEquals(lignes.length, 2);
  assertEquals(lignes[0].B, 'texte, avec "guillemets"\net retour');
  assertEquals(lignes[1], { A: "4", B: "5", C: "6" });
  assertEquals(lireCsv('"Date";"D0";"Value"\n"2026-08";"VVP";"0.8"', ";")[0].D0, "VVP");
});

Deno.test("Périodes : trimestre et mois ramenés au 1er jour", () => {
  assertEquals(debutPeriode("2026-Q2"), "2026-04-01");
  assertEquals(debutPeriode("2026-Q4"), "2026-10-01");
  assertEquals(debutPeriode("2026-08"), "2026-08-01");
  assertEquals(debutPeriode("2026"), null);
});

Deno.test("Inflation sur 1 an calculée par date, mois manquant = pas de valeur", () => {
  const indice = [
    { date: "2025-08-01", valeur: 100 },
    { date: "2025-10-01", valeur: 101 },
    { date: "2026-08-01", valeur: 103 },
    { date: "2026-09-01", valeur: 104 },
    { date: "2026-10-01", valeur: 103.02 },
  ];
  assertEquals(glissementAnnuel(indice), [{ date: "2026-08-01", valeur: 3 }, { date: "2026-10-01", valeur: 2 }]);
});

Deno.test("Taux directeurs : seuls les changements sont gardés", () => {
  const serie = [
    { date: "2026-09-01", valeur: 4 }, { date: "2026-09-02", valeur: 4 },
    { date: "2026-09-17", valeur: 3.875 }, { date: "2026-09-18", valeur: 3.875 },
  ];
  assertEquals(changementsDeTaux(serie, null).map((p) => p.date), ["2026-09-01", "2026-09-17"]);
  assertEquals(changementsDeTaux(serie, 4).map((p) => p.date), ["2026-09-17"]);
  assertEquals(changementsDeTaux(serie, 3.875).map((p) => p.date), ["2026-09-01", "2026-09-17"]);
});

Deno.test("Forex Factory : titres traduits par glossaire", () => {
  assertEquals(traduireTitre("Core CPI m/m"), "Inflation sous-jacente (CPI) (sur 1 mois)");
  assertEquals(traduireTitre("CPI y/y"), "Inflation (CPI) (sur 1 an)");
  assertEquals(traduireTitre("ECB President Lagarde Speaks"), "Discours de Lagarde (présidente de la BCE)");
  assertEquals(traduireTitre("Fed Chairman Warsh Speaks"), "Discours de Warsh (président de la Fed)");
  assertEquals(traduireTitre("German Prelim CPI m/m"), "Inflation (préliminaire) (Allemagne) (sur 1 mois)");
  assertEquals(traduireTitre("Bank Holiday"), "Jour férié");
  assertEquals(traduireTitre("Some Unknown Survey"), null);
  assertEquals(traduireTitre("Mystery Person Smith Speaks"), null);
});

Deno.test("Forex Factory : impact faible ignoré, Chine seulement en fort, heure en UTC", () => {
  const evenements = analyserCalendrier([
    { title: "CPI m/m", country: "USD", date: "2026-10-14T08:30:00-04:00", impact: "High", forecast: "0.6%", previous: "0.4%" },
    { title: "MPC Member Mann Speaks", country: "GBP", date: "2026-10-12T08:50:00-04:00", impact: "Low" },
    { title: "Industrial Production y/y", country: "CNY", date: "2026-10-12T22:00:00-04:00", impact: "Medium" },
    { title: "Bank Holiday", country: "JPY", date: "2026-10-11T19:00:00-04:00", impact: "Holiday", forecast: "", previous: "" },
    { title: "IMF Meetings", country: "All", date: "2026-10-12T10:15:00-04:00", impact: "Medium" },
  ]);
  assertEquals(evenements.map((e) => [e.devise, e.impact, e.instant]), [
    ["JPY", "faible", "2026-10-11T23:00:00.000Z"],
    ["USD", "fort", "2026-10-14T12:30:00.000Z"],
  ]);
  assertEquals(evenements[1].prevision, "0.6%");
  assertEquals(evenements[0].prevision, null);
});
