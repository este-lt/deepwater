// deno test supabase/functions/_shared/filtre-actualites.test.ts
// Titres fictifs reproduisant les cas rencontrés lors de la validation manuelle
// (203 articles réels triés à la main, voir docs/SOURCES.md).
import { classerArticle } from "./filtre-actualites.ts";
import { analyserRss, extraitCourt, urlCanonique } from "./rss.ts";

const cas = (source: string, titre: string, extrait = "") => classerArticle({ source, titre, extrait });

function attendre(libelle: string, reel: boolean, attendu: boolean) {
  if (reel !== attendu) throw new Error(`${libelle} : obtenu ${reel ? "gardé" : "rejeté"}, attendu ${attendu ? "gardé" : "rejeté"}`);
}

Deno.test("gardés : mouvements, résultats, fusions, banques centrales, macro, initiés", () => {
  attendre("séance US", cas("WSJ Marchés", "Stocks Slide as Treasury Yields Climb").garder, true);
  attendre("séance extrême", cas("WSJ Marchés", "Exampleland Stocks Log Worst Day Since 2001").garder, true);
  attendre("plus fortes variations", cas("CNBC Marchés", "Stocks making the biggest moves midday: Foo, Bar & more").garder, true);
  attendre("résultats", cas("CNBC Marchés", "Acme Corp tops estimates as cloud revenue jumps").garder, true);
  attendre("résultats dans l'extrait", cas("WSJ Marchés", "Acme's Problems Will Linger", "Weak earnings coupled with a fine").garder, true);
  attendre("acquisition", cas("FT Marchés", "Globex to acquire Initech").garder, true);
  attendre("cession chiffrée", cas("FT Marchés", "Airline exploring sale of software unit in €1bn deal").garder, true);
  attendre("activiste", cas("FT Marchés", "Activist pushes for sale of retailer", "Fund takes 4% stake").garder, true);
  attendre("macro", cas("CNBC Économie", "Consumer prices rose 3.1% annually in May").garder, true);
  attendre("banque centrale", cas("CNBC Économie", "Bank of England holds rates steady").garder, true);
  attendre("Fed officielle", cas("Fed", "Federal Reserve issues FOMC statement").garder, true);
  attendre("BCE officielle", cas("BCE", "Monetary policy decisions").garder, true);
});

Deno.test("rejetés : conditionnel, spéculation, analyses, discours, faits divers, politique", () => {
  attendre("conditionnel", cas("WSJ Marchés", "Euro Unlikely to Sustain Gains Amid Fiscal Risks").garder, false);
  attendre("prévision macro", cas("CNBC Économie", "Inflation data is expected to show prices accelerating", "CPI seen rising 0.4%").garder, false);
  attendre("officiel au conditionnel", cas("CNBC Économie", "Fed official says the Fed may not have to hike rates next year").garder, false);
  attendre("spéculation", cas("CNBC Une", "Carmaker unveils roadster, fueling merger speculation").garder, false);
  attendre("analyse « voici comment »", cas("CNBC Une", "Here's how the chip sell-off is affecting valuations").garder, false);
  attendre("titre en question", cas("FT Marchés", "Is the AI boom over?").garder, false);
  attendre("chiffre ancien dans l'extrait", cas("CNBC Marchés", "The bull market turned 4 years old", "The S&P 500 has climbed 120% since 2022.").garder, false);
  attendre("discours BCE", cas("BCE", "Jane Doe: Monetary policy in uncertain times").garder, false);
  attendre("procès-verbal mineur Fed", cas("Fed", "Minutes of the Board's discount rate meetings on May 1").garder, false);
  attendre("politique", cas("FT Europe", "Prime minister refuses to resign as protesters gather").garder, false);
  attendre("fait divers", cas("FT Europe", "Nineteen people injured in tunnel accident").garder, false);
  attendre("conseil personnel", cas("WSJ Marchés", "Your 'Cheap' ETF Costs More Than You Think").garder, false);
});

Deno.test("seuil de 2 % et mouvements ordinaires des matières premières ou devises", () => {
  attendre("variation chiffrée faible", cas("WSJ Marchés", "Dollar Index Falls 0.32% to 97.26").garder, false);
  attendre("variation chiffrée forte", cas("WSJ Marchés", "Chip Stocks Fall 4.1% After Export Curbs").garder, true);
  attendre("or en hausse ordinaire", cas("WSJ Marchés", "Gold Rises on Softer Dollar").garder, false);
  attendre("pétrole en chute forte", cas("WSJ Marchés", "Oil Prices Plunge as Supply Fears Ease").garder, true);
  const cpi = cas("CNBC Économie", "Consumer prices rose 3.7% annually in September");
  if (cpi.region !== "US" || cpi.impact !== "fort") throw new Error(`CPI américain : ${cpi.region} / ${cpi.impact}`);
  if (cas("WSJ Marchés", "Exampleland Stocks Log Worst Day Since 2001").region !== "US") throw new Error("pays fictif non reconnu : US par défaut");
  if (cas("WSJ Marchés", "Japan Stocks Log Worst Day Since 2001").region !== "Monde") throw new Error("Japon devrait être Monde");
});

Deno.test("indices et grandes valeurs reconnus, région", () => {
  const d = cas("CNBC Marchés", "Nasdaq slides as Nvidia and Microsoft fall");
  if (!d.tickers.includes("NDX") || !d.tickers.includes("NVDA") || !d.tickers.includes("MSFT")) throw new Error(JSON.stringify(d.tickers));
  if (cas("BCE", "Monetary policy decisions").region !== "Europe") throw new Error("BCE devrait être Europe");
});

Deno.test("RSS : CDATA, entités, date, extrait court, lien canonique", () => {
  const xml = `<rss><channel><title>T</title><item><title><![CDATA[Stocks &amp; bonds rally]]></title>
    <link>https://www.ft.com/content/abc?syn-123=1</link><description>Un &#x2018;extrait&#x2019; &lt;b&gt;court&lt;/b&gt;</description>
    <pubDate>Fri, 16 Oct 2026 14:13:05 GMT</pubDate></item></channel></rss>`;
  const [e] = analyserRss(xml);
  if (e.titre !== "Stocks & bonds rally") throw new Error(e.titre);
  if (e.date?.toISOString() !== "2026-10-16T14:13:05.000Z") throw new Error(String(e.date));
  if (urlCanonique(e.lien) !== "https://www.ft.com/content/abc") throw new Error(urlCanonique(e.lien));
  if (extraitCourt("a ".repeat(300)).length > 281) throw new Error("extrait trop long");
});
