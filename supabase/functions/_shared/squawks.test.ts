// Titres réels FinancialJuice et InvestingLive des 16-17/10/2026.
import { assertEquals } from "./verifications.ts";
import { classerSquawk, nettoyerSquawk } from "./squawks.ts";

const garde = (titre: string) => classerSquawk(titre).categorie;

Deno.test("Squawks : préfixe et mentions promotionnelles retirés", () => {
  assertEquals(nettoyerSquawk("FinancialJuice: ECB's Nagel: battle against inflation isn’t over"), "ECB's Nagel: battle against inflation isn’t over");
  assertEquals(nettoyerSquawk("FinancialJuice: CENTCOM Commander: Iran has no maritime exports - Post on X"), "CENTCOM Commander: Iran has no maritime exports");
});

Deno.test("Squawks gardés : banques centrales, statistiques, marchés, énergie", () => {
  assertEquals(garde("FinancialJuice: ECB's Nagel: battle against inflation isn’t over, sense more action needed"), "banque_centrale");
  assertEquals(garde("BOJ’s Ueda: We will continue to raise rates as underlying inflation approaches 2%"), "banque_centrale");
  assertEquals(garde("US Overall Net Capital Flows Actual 199.8B (Forecast -, Previous 83.7B ,Revision 87.4B)"), null);
  assertEquals(garde("US CPI y/y Actual 3.7% (Forecast 3.6%, Previous 3.4%)"), "statistique_macro");
  assertEquals(classerSquawk("US CPI y/y Actual 3.7% (Forecast 3.6%, Previous 3.4%)").impact, "fort");
  assertEquals(garde("US September industrial production +0.7% vs +0.4% expected"), "statistique_macro");
  assertEquals(garde("Eurozone September final CPI +3.8% vs +3.8% y/y prelim"), "statistique_macro");
  assertEquals(garde("US average hourly earnings m/m Actual 0.4% (Forecast 0.3%, Previous 0.3%)"), "statistique_macro");
  assertEquals(garde("Brent Crude futures settle at $109.86/bbl, up $3.94, 3.72%"), "marche");
  assertEquals(garde("Oil prices surge higher into the weekend"), "marche");
  assertEquals(garde("CENTCOM: US has helped ship over 100m bbls through Hormuz in past 7 days"), "geopolitique");
  assertEquals(garde("UKMTO: Tanker hit by unidentified projectile northeast of Saudi Arabia's Jubail on Friday, crew safe and evacuated"), "geopolitique");
  assertEquals(garde("Trump: waives application of certain sanctions, restrictions, and duties in executive order"), "politique_eco");
  assertEquals(garde("US Sept. budget deficit $26.9 bln"), "politique_eco");
});

Deno.test("Squawks écartés : faits divers, entreprises, promotions, analyses", () => {
  for (const titre of [
    "FinancialJuice: Russian man killed in Ukrainian drone strike in Bryansk region, RIA cites governor",
    "French police use tear gas amid protests over increasing living costs in Paris",
    "Sisi: question of his term ending in 2030 is settled and will not be discussed",
    "Bank of England: Governor Bailey among delegates who walked out of IMF meeting in protest at Russian delegate",
    "Ukraine central bank governor Pyshny! : walkout by many delegates during Russian remarks to IMF",
    "SoftBank said to weigh buying largest US security firm Allied.",
    "Anthropic: Revenue per employee 2x-4x its peers, Meta and Google. $META $GOOGL",
    "NVIDIA CEO on AI Market Turmoil: All of this is going to pass. $NVDA",
    "USD CFTC Positions Week of October 13th - FJElite",
    "Monday FX Options Expiries",
    "Blackstone funds to invest $9 billion in",
    "Is EUR/USD finally turning the corner or is this just another false dawn?",
    "Dow Jones futures analysis: Fed risks and key levels for October 16",
    "investingLive Americas market news wrap: Nasdaq sinks and oil jumps",
    "Japan's US Treasury holdings $1.068 trln in August vs $1.104 trln in July.",
    "NYMEX gasoline November futures settle at $3.2354 a gallon",
  ]) assertEquals(garde(titre), null, titre);
});
