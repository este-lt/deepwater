// deno test supabase/functions/_shared/sec.test.ts
import { type FaitXbrl, valeurAnnuelle } from "./sec.ts";

const fait = (f: Partial<FaitXbrl>): FaitXbrl => ({ end: "", val: 0, accn: "x", form: "10-K", filed: "2025-01-01", ...f });

Deno.test("exercice clos un samedi (Apple, 27/09/2025) retrouvé pour la date arrondie au 30/09", () => {
  const faits = [
    fait({ start: "2024-09-29", end: "2025-09-27", val: 112_010_000_000, filed: "2025-10-31" }),
    fait({ start: "2025-06-29", end: "2025-09-27", val: 27_000_000_000, form: "10-K", filed: "2025-10-31" }), // trimestre
    fait({ start: "2023-10-01", end: "2024-09-28", val: 93_736_000_000, filed: "2024-11-01" }),
  ];
  const r = valeurAnnuelle(faits, "2025-09-30", true);
  if (r?.val !== 112_010_000_000) throw new Error(`obtenu ${r?.val}`);
});

Deno.test("le chiffre le plus récent l'emporte en cas de 10-K/A", () => {
  const faits = [
    fait({ start: "2024-07-01", end: "2025-06-30", val: 100, filed: "2025-07-30" }),
    fait({ start: "2024-07-01", end: "2025-06-30", val: 101, form: "10-K/A", filed: "2025-09-15" }),
  ];
  const r = valeurAnnuelle(faits, "2025-06-30", true);
  if (r?.val !== 101) throw new Error(`obtenu ${r?.val}`);
});

Deno.test("aucune correspondance au-delà de 7 jours", () => {
  const faits = [fait({ start: "2024-07-01", end: "2025-06-20", val: 1 })];
  if (valeurAnnuelle(faits, "2025-06-30", true) !== null) throw new Error("ne devrait rien trouver");
});

Deno.test("capitaux propres (instant, sans date de début)", () => {
  const faits = [fait({ end: "2025-09-27", val: 73_733_000_000 })];
  if (valeurAnnuelle(faits, "2025-09-30", false)?.val !== 73_733_000_000) throw new Error("instant non trouvé");
});
