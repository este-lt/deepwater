// deno test --allow-read supabase/functions/collecte-sec/analyse.test.ts
// Tests sur de vrais documents SEC enregistrés dans fixtures/.
import { analyserFormulaire4, resumerFormulaire4, urlXmlBrut } from "./formulaire4.ts";
import { analyserTableau13F } from "./treize-f.ts";

const lire = (nom: string) => Deno.readTextFileSync(new URL(`./fixtures/${nom}`, import.meta.url));

function egal(reel: unknown, attendu: unknown, libelle: string) {
  if (JSON.stringify(reel) !== JSON.stringify(attendu)) {
    throw new Error(`${libelle} : obtenu ${JSON.stringify(reel)}, attendu ${JSON.stringify(attendu)}`);
  }
}

Deno.test("formulaire 4 NVIDIA du 07/10/2026 (donation d'un administrateur)", () => {
  const t = analyserFormulaire4(lire("form4-nvda.xml"));
  egal(t.length, 1, "une seule transaction (les détentions ne sont pas des transactions)");
  egal(
    t[0],
    { personne: "COXE TENCH", poste: "Administrateur", titre: "Common", date: "2026-10-07", code: "G", acquisCede: "D", titres: 500000, prix: 0, montant: null },
    "transaction",
  );
  const resume = resumerFormulaire4(t);
  if (!resume.startsWith("Donation : 500 000 actions") && !resume.startsWith("Donation : 500 000 actions")) {
    throw new Error(`résumé inattendu : ${resume}`);
  }
});

Deno.test("formulaire 4 : vente sur le marché d'un dirigeant (montant = titres × prix)", () => {
  const xml = `<ownershipDocument><reportingOwner><reportingOwnerId><rptOwnerName>DOE JANE</rptOwnerName></reportingOwnerId>
    <reportingOwnerRelationship><isDirector>0</isDirector><isOfficer>1</isOfficer><officerTitle>Chief Financial Officer</officerTitle></reportingOwnerRelationship></reportingOwner>
    <nonDerivativeTable><nonDerivativeTransaction><securityTitle><value>Common Stock</value></securityTitle>
    <transactionDate><value>2026-09-15</value></transactionDate><transactionCoding><transactionCode>S</transactionCode></transactionCoding>
    <transactionAmounts><transactionShares><value>1,000</value></transactionShares><transactionPricePerShare><value>250.5</value></transactionPricePerShare>
    <transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode></transactionAmounts></nonDerivativeTransaction></nonDerivativeTable></ownershipDocument>`;
  const [t] = analyserFormulaire4(xml);
  egal([t.code, t.poste, t.titres, t.prix, t.montant], ["S", "Chief Financial Officer", 1000, 250.5, 250500], "vente");
});

Deno.test("URL du XML brut à partir du document mis en forme", () => {
  egal(
    urlXmlBrut("https://www.sec.gov/Archives/edgar/data/1045810/000119764726000011/xslF345X06/wk-form4_1791579847.xml"),
    "https://www.sec.gov/Archives/edgar/data/1045810/000119764726000011/wk-form4_1791579847.xml",
    "url",
  );
  egal(urlXmlBrut("https://www.sec.gov/Archives/edgar/data/1/0001/doc4.xml"), "https://www.sec.gov/Archives/edgar/data/1/0001/doc4.xml", "sans dossier xsl");
});

Deno.test("13F Berkshire T2 2026 : lignes d'un même émetteur additionnées, classes A et C d'Alphabet regroupées", () => {
  const { positions, anomalies } = analyserTableau13F(lire("13f-berkshire.xml"), [
    { symbole: "AAPL", cusip6: "037833", mot_cle_13f: "APPLE" },
    { symbole: "GOOGL", cusip6: "02079K", mot_cle_13f: "ALPHABET" },
  ]);
  egal(anomalies, [], "aucune anomalie");
  egal(positions.get("GOOGL")?.parts, 27188433 + 16700 + 6700000 + 6250000 + 65824467, "Alphabet (A + C)");
  if (!positions.get("AAPL") || positions.get("AAPL")!.parts <= 0) throw new Error("Apple absente du 13F de Berkshire");
});
