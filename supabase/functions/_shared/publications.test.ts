// npx deno test --allow-read supabase/functions : chiffres publiés face au consensus.
import { assert, assertEquals } from "./verifications.ts";
import { lirePublication } from "./publications.ts";

Deno.test("consensus : format FinancialJuice (Actual / Forecast / Previous)", () => {
  const p = lirePublication("US CPI YoY Actual 3.7% (Forecast 3.6%, Previous 3.4%)")!;
  assertEquals([p.devise, p.publie, p.prevision, p.precedent, p.unite, p.famille], ["USD", 3.7, 3.6, 3.4, "%", "inflation"]);
  assertEquals(p.surprise, 0.5); // +0,1 pt / 0,2 pt
  // Milliers et séparateurs : « 1,971.0M ».
  const nz = lirePublication("New Zealand Trade Balance Actual -1,971.0M (Forecast -2,100.0M, Previous -1,349.0M)")!;
  assertEquals([nz.devise, nz.publie, nz.prevision, nz.unite, nz.famille], ["NZD", -1971, -2100, "M", "autre"]);
  // Sans consensus : rien.
  assertEquals(lirePublication("New Zealand Trade Balance Actual -1,971.0M (Forecast -, Previous -1,349.0M)"), null);
});

Deno.test("consensus : format InvestingLive (« vs … expected »)", () => {
  const p = lirePublication("US September industrial production +0.7% vs +0.4% expected")!;
  assertEquals([p.devise, p.publie, p.prevision, p.famille, p.surprise], ["USD", 0.7, 0.4, "croissance", 1]);
  const nfp = lirePublication("US September non-farm payrolls 29K vs 110K expected. Prior 133K")!;
  assertEquals([nfp.famille, nfp.publie, nfp.prevision, nfp.precedent, nfp.unite], ["emploi", 29, 110, 133, "K"]);
  assert(nfp.surprise === -1, `surprise ${nfp.surprise}`);
  const ism = lirePublication("US ISM manufacturing prices paid 62.1 vs 58.0 expected")!;
  assertEquals(ism.famille, "inflation");
  const chomage = lirePublication("UK unemployment rate 4.6% vs 4.5% expected")!;
  assertEquals([chomage.devise, chomage.famille], ["GBP", "chomage"]);
  assertEquals(lirePublication("Fed's Powell: rates will stay higher for longer"), null);
});
