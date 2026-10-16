// deno test supabase/functions/_shared/filtre-actualites.test.ts
// Titres reproduisant les cas réels rencontrés (veille du 14 au 16/10/2026).
import { classerArticle } from "./filtre-actualites.ts";
import { analyserRss, extraitCourt, urlCanonique } from "./rss.ts";

const cas = (source: string, titre: string, extrait = "") => classerArticle({ source, titre, extrait });

function attendre(libelle: string, reel: boolean, attendu: boolean) {
  if (reel !== attendu) throw new Error(`${libelle} : obtenu ${reel ? "gardé" : "rejeté"}, attendu ${attendu ? "gardé" : "rejeté"}`);
}

Deno.test("gardés : banques centrales, macro, marché dans son ensemble, politique économique", () => {
  attendre("séance US", cas("WSJ Marchés", "U.S. Stocks Mixed as Investors Pare Rate-Hike Bets").garder, true);
  attendre("début de titre « Stocks »", cas("WSJ Marchés", "Stocks Gain as Treasury Yields Give Back Some Recent Gains").garder, true);
  attendre("Nasdaq", cas("WSJ Marchés", "Stock Market Today: Tech Stocks Slump as Nasdaq Faces Weekly Loss").garder, true);
  attendre("marché d'un pays", cas("WSJ Marchés", "Indonesia Stocks Log Worst Day Since 1998 on MSCI Downgrade Warning").garder, true);
  attendre("Asie", cas("WSJ Marchés", "Asia Stocks Recover Some Ground After Tech Rout").garder, true);
  attendre("taux", cas("FT Marchés", "Treasuries head for best week since February as AI jitters halt bond rout").garder, true);
  attendre("taux, rebond", cas("FT Marchés", "Treasuries rally as investors seek shelter from AI turbulence").garder, true);
  attendre("crédit", cas("FT Marchés", "Investors dump data centre bonds as AI borrowers face ‘Darwin moment’").garder, true);
  attendre("PPI", cas("CNBC Économie", "Wholesale prices jumped 6.3% annually in September, biggest gain since 2022").garder, true);
  attendre("CPI", cas("CNBC Économie", "Consumer prices rose 3.7% annually in September as gas prices skyrocket").garder, true);
  attendre("macro UK", cas("CNBC Économie", "UK economy grew 0.1% in August, beating expectations").garder, true);
  attendre("banque centrale", cas("CNBC Économie", "Bank of England holds rates steady").garder, true);
  attendre("président de la Fed", cas("CNBC Économie", "Powell signals the Fed is in no hurry to cut").garder, true);
  attendre("droits de douane", cas("WSJ Marchés", "White House Announces New Tariffs on Chinese Imports").garder, true);
  attendre("shutdown", cas("CNBC Économie", "Government shutdown enters third week").garder, true);
  attendre("pétrole fort", cas("WSJ Marchés", "Oil Prices Plunge as Supply Fears Ease").garder, true);
  attendre("Fed officielle", cas("Fed", "Federal Reserve issues FOMC statement").garder, true);
  attendre("BCE officielle", cas("BCE", "Monetary policy decisions").garder, true);
});

Deno.test("rejetés : entreprises, politique locale, conditionnel, analyses, faits divers", () => {
  attendre("liste de valeurs", cas("CNBC Marchés", "Stocks making the biggest moves midday: CoreWeave, Moog, J.B. Hunt & more").garder, false);
  attendre("résultats", cas("WSJ Marchés", "Anthropic’s Quarterly Revenue Jumped 45% to Nearly $17 Billion").garder, false);
  attendre("banque précise", cas("WSJ Marchés", "Wall Street Worries Bank of America’s Problems Will Linger").garder, false);
  attendre("cession", cas("FT Marchés", "Lufthansa exploring sale of software assets in €1bn deal").garder, false);
  attendre("acquisition", cas("FT Marchés", "EQT to acquire US real estate group Stockbridge").garder, false);
  attendre("introduction en Bourse", cas("FT Marchés", "Private equity interest endangers London float of former DS Smith business").garder, false);
  attendre("activiste", cas("FT Marchés", "Second activist pushes for sale of UK self-storage company Big Yellow").garder, false);
  attendre("secteur seul", cas("WSJ Marchés", "European Defense Stocks Rally, Boosted by Project Bromo Report").garder, false);
  attendre("gouverneur", cas("CNBC Économie", "Vermont governor proposes higher taxes on top earners").garder, false);
  attendre("conditionnel", cas("WSJ Marchés", "Euro Unlikely to Sustain Gains Amid Fiscal Risks").garder, false);
  attendre("prévision macro", cas("CNBC Économie", "Inflation data is expected to show prices accelerating").garder, false);
  attendre("titre en question", cas("FT Marchés", "Is the AI boom over?").garder, false);
  attendre("analyse « voici comment »", cas("CNBC Une", "Here's how the chip sell-off is affecting valuations").garder, false);
  attendre("discours BCE", cas("BCE", "Jane Doe: Monetary policy in uncertain times").garder, false);
  attendre("procès-verbal mineur Fed", cas("Fed", "Minutes of the Board's discount rate meetings on May 1").garder, false);
  attendre("politique", cas("FT Europe", "Prime minister refuses to resign as protesters gather").garder, false);
  attendre("fait divers", cas("FT Europe", "Nineteen people injured in tunnel accident").garder, false);
  attendre("conseil personnel", cas("WSJ Marchés", "Your 'Cheap' ETF Costs More Than You Think").garder, false);
});

Deno.test("seuil de 2 % et mouvements ordinaires", () => {
  attendre("variation chiffrée faible", cas("WSJ Marchés", "Dollar Index Falls 0.32% to 97.26").garder, false);
  attendre("or en hausse ordinaire", cas("WSJ Marchés", "Gold Rises on Softer Dollar").garder, false);
  attendre("chute forte d'un indice", cas("WSJ Marchés", "Nasdaq Slides 3.1% as Rate Fears Return").garder, true);
});

Deno.test("région et rattachement", () => {
  const d = cas("CNBC Marchés", "Nasdaq slides as Treasury yields jump");
  if (!d.tickers.includes("NDX") || !d.tickers.includes("US10Y")) throw new Error(JSON.stringify(d.tickers));
  if (cas("BCE", "Monetary policy decisions").region !== "Europe") throw new Error("BCE devrait être Europe");
  if (cas("WSJ Marchés", "Japan Stocks Log Worst Day Since 2001").region !== "Monde") throw new Error("Japon devrait être Monde");
  const cpi = cas("CNBC Économie", "Consumer prices rose 3.7% annually in September");
  if (cpi.region !== "US" || cpi.impact !== "fort") throw new Error(`CPI : ${cpi.region} / ${cpi.impact}`);
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
