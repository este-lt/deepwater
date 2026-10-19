// deno test supabase/functions/calcul-biais
import {
  combiner,
  facteurConditions,
  facteurCourbe,
  facteurDollar,
  facteurFed,
  facteurLiquidite,
  facteurMacro,
  facteurPositionnement,
  facteurRegimeMacro,
  facteurRisque,
  facteurTaux,
  type PointMacro,
  type PointTaux,
  seanceVisee,
} from "./facteurs.ts";
import { DELAIS, rejouer, statistiques } from "./historique.ts";

function egal<T>(libelle: string, reel: T, attendu: T) {
  if (reel !== attendu) throw new Error(`${libelle} : obtenu ${reel}, attendu ${attendu}`);
}

const jourAvant = (n: number, fin = "2026-10-16") => new Date(Date.parse(fin) - n * 86_400_000).toISOString().slice(0, 10);
const point = (n: number, taux: number): PointTaux => ({ date: jourAvant(n), taux });

Deno.test("séance visée : heure de New York, changement d'heure et week-end", () => {
  // 16/10/2026 14:00 UTC = 10:00 à New York (heure d'été) : séance du jour.
  egal("vendredi matin", seanceVisee(new Date("2026-10-16T14:00:00Z")), "2026-10-16");
  // 16/10/2026 20:30 UTC = 16:30 à New York : clôture passée -> lundi.
  egal("vendredi soir", seanceVisee(new Date("2026-10-16T20:30:00Z")), "2026-10-19");
  // 03/11/2026 20:30 UTC = 15:30 à New York (heure d'hiver, UTC-5) : encore la séance du jour.
  egal("hiver avant clôture", seanceVisee(new Date("2026-11-03T20:30:00Z")), "2026-11-03");
  // 08/03/2026 03:00 UTC = samedi 22:00 à New York -> lundi.
  egal("samedi", seanceVisee(new Date("2026-03-08T03:00:00Z")), "2026-03-09");
  // Jours fériés de la Bourse de New York : Thanksgiving (jeudi 26/11) et Noël (vendredi 25/12).
  egal("veille de Thanksgiving", seanceVisee(new Date("2026-11-25T22:00:00Z")), "2026-11-27");
  egal("Noël", seanceVisee(new Date("2026-12-25T15:00:00Z")), "2026-12-28");
});

Deno.test("Fed : hausses anticipées par le taux à 2 ans et hausse décidée = baissier", () => {
  // Valeurs réelles du 15/10/2026 : 2 ans 4,77 %, Fed funds 3,88 %, hausse de 25 pb le 17/09/2026.
  const decisions = [{ date: "2025-10-30", taux: 3.875 }, { date: "2025-12-11", taux: 3.625 }, { date: "2026-09-17", taux: 3.875 }];
  const f = facteurFed("SPX", [point(1, 4.77)], [point(1, 3.88)], decisions, "2026-10-16");
  // Anticipation : -borner(0,89 / 0,5) = -1 ; décision : hausse, sens inverse de la précédente -> -0,6.
  egal("note", f.note, -0.84);
  if (!f.texte.includes("le marché anticipe des hausses de taux") || !f.texte.includes("hausse de 25 pb") || f.texte.endsWith("..")) throw new Error(f.texte);
  if (!f.texte_en.includes("prices in rate hikes") || f.libelle_en !== "Fed policy") throw new Error(f.texte_en);
  // Baisses anticipées et baisse décidée = haussier.
  const baisse = facteurFed("SPX", [point(1, 3.4)], [point(1, 3.88)], [{ date: "2026-06-01", taux: 4.125 }, { date: "2026-09-17", taux: 3.875 }], "2026-10-16");
  if (!(baisse.note! > 0.5)) throw new Error(`baisse : ${baisse.note}`);
  egal("sans données", facteurFed("SPX", [], [], [], "2026-10-16").statut, "indisponible");
});

Deno.test("taux : moitié variation sur 5 séances, moitié niveau du taux réel face au repère de 1,5 %", () => {
  // 25 séances stables puis 5 séances de `debut` à `fin`.
  const serie = (debut: number, fin: number): PointTaux[] =>
    Array.from({ length: 30 }, (_, i) => ({
      date: new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10),
      taux: i < 25 ? debut : debut + ((fin - debut) * (i - 24)) / 5,
    }));
  // Valeurs réelles du 15/10/2026 : 10 ans 5,28 -> 5,10 %, taux réel 2,92 -> 2,78 %.
  // Variation : 0,6 x 0,9 + 0,4 x 0,7 = 0,82 ; niveau : 2,78 - 1,5 = 1,28 pt -> -1 ; 0,5 x 0,82 - 0,5 = -0,09.
  const reel = facteurTaux("SPX", serie(5.28, 5.1), serie(2.92, 2.78), "2026-10-01", "fred");
  egal("valeurs réelles", reel.note, -0.09);
  if (!reel.texte.includes("1,28 pt au-dessus du repère neutre de 1,5 %")) throw new Error(reel.texte);
  if (!reel.texte_en.includes("1.28 pt above the 1.5% neutral benchmark")) throw new Error(reel.texte_en);
  // Hausse rapide, taux réel 0,2 pt au-dessus du repère : 0,5 x -1 + 0,5 x -0,2 = -0,6.
  egal("hausse", facteurTaux("SPX", serie(4, 4.2), serie(1.5, 1.7), "2026-10-01", "fred").note, -0.6);
  // Baisse rapide, taux réel bas (0,3 %) : haussier sur les deux plans.
  egal("baisse", facteurTaux("SPX", serie(4, 3.8), serie(0.5, 0.3), "2026-10-01", "fred").note, 1);
  // Sans taux réel : seule la variation du nominal compte.
  egal("nominal seul", facteurTaux("SPX", serie(4, 4.2), [], "2026-10-01", "fred").note, -1);
  // Une valeur non numérique en base est ignorée (jamais « NaN » dans le texte ni la note).
  const avecNaN = [...serie(4, 4.2), { date: "2026-10-01", taux: NaN }];
  const f = facteurTaux("SPX", avecNaN, [], "2026-10-01", "fred");
  egal("NaN ignoré", f.note, -1);
  if (f.texte.includes("NaN")) throw new Error(f.texte);
});

Deno.test("macro : sens par indicateur et fenêtre de fraîcheur", () => {
  const pub = (indicateur: string, variation: number, detecteeLe = "2026-10-10") => ({
    indicateur, periode: "2026-09-01", detecteeLe, valeur: 3, variation,
  });
  egal("inflation en hausse", facteurMacro("SPX", [pub("CPI", 0.3)], "2026-10-16", "av").note, -1);
  egal("emplois en hausse", facteurMacro("SPX", [pub("NONFARM_PAYROLL", 50)], "2026-10-16", "av").note, 0.5);
  egal("trop ancienne", facteurMacro("SPX", [pub("CPI", 0.3, "2026-08-01")], "2026-10-16", "av").statut, "indisponible");
});

Deno.test("risque : volatilité au-dessus de sa médiane et spread qui s'écarte = baissier", () => {
  // 300 jours de VIX à 15, puis 6 séances qui montent jusqu'à 28.
  const vix: PointTaux[] = Array.from({ length: 300 }, (_, i) => ({ date: jourAvant(306 - i), taux: 15 }));
  [17, 19, 21, 24, 26, 28].forEach((v, i) => vix.push({ date: jourAvant(6 - i), taux: v }));
  const hy: PointTaux[] = Array.from({ length: 10 }, (_, i) => ({ date: jourAvant(10 - i), taux: 3 + i * 0.1 }));
  const f = facteurRisque("SPX", vix, hy, "2026-10-16");
  // Vol : -(0,5 x borner(13/8) + 0,5 x borner(11/5)) = -1 ; crédit : +0,5 pt -> -1.
  egal("note", f.note, -1);
  if (!f.texte.includes("VIX à 28,00")) throw new Error(f.texte);
  egal("NDX utilise le VXN", facteurRisque("NDX", vix, hy, "2026-10-16").source.includes("VXN"), true);
  egal("données trop anciennes", facteurRisque("SPX", vix, hy, "2026-11-30").statut, "indisponible");
});

Deno.test("conditions financières : plus souples que la moyenne et qui s'assouplissent = haussier", () => {
  // NFCI hebdomadaire : -0,40 il y a 4 semaines, -0,50 la dernière (valeur réelle du 09/10/2026 : -0,499).
  const nfci = [-0.4, -0.42, -0.45, -0.47, -0.5].map((v, i) => ({ date: jourAvant((4 - i) * 7 + 7), taux: v }));
  const f = facteurConditions("SPX", nfci, "2026-10-16");
  // Niveau : -borner(-0,5 / 0,5) = +1 ; variation -0,10 / 0,15 -> +0,667 ; 0,6 x 1 + 0,4 x 0,667 = 0,867.
  egal("note", f.note, 0.867);
  if (!f.texte.includes("NFCI −0,50") || !f.texte.includes("plus souples que la moyenne") || !f.texte.includes("assouplissement")) throw new Error(f.texte);
  egal("trop ancien", facteurConditions("SPX", nfci, "2026-11-30").statut, "indisponible");
});

Deno.test("dollar : +2 % en 20 séances = baissier pour les actions (fiche de corrélations)", () => {
  // 5 séances à 100, puis 20 séances jusqu'à 102 : la référence (20 séances avant) vaut 100.
  const dxy = Array.from({ length: 25 }, (_, i) => point(24 - i, i < 5 ? 100 : 100 + (2 * (i - 4)) / 20));
  const f = facteurDollar("SPX", dxy, "2026-10-16");
  egal("note", f.note, -1);
  if (!f.texte.includes("un dollar qui monte pèse sur les actions")) throw new Error(f.texte);
  egal("trop ancien", facteurDollar("SPX", dxy, "2026-11-30").statut, "indisponible");
});

Deno.test("courbe des taux : inversion = baissier, pente normale légèrement favorable", () => {
  // Valeurs réelles du 15/10/2026 : 3 mois 4,28 %, 2 ans 4,77 %, 10 ans 5,10 %.
  const normale = facteurCourbe("SPX", [point(1, 4.28)], [point(1, 4.77)], [point(1, 5.1)], "2026-10-16");
  // 0,5 x borner(0,33 / 1,5) = 0,11 ; 0,5 x borner(0,82 / 1,5) = 0,273 ; moyenne 0,192.
  egal("normale", normale.note, 0.192);
  if (!normale.texte.includes("10 ans − 2 ans +33 pb") || !normale.texte.includes("pente normale")) throw new Error(normale.texte);
  const inversee = facteurCourbe("SPX", [point(1, 5.6)], [point(1, 5.6)], [point(1, 5.1)], "2026-10-16");
  egal("inversée", inversee.note, -1);
  if (!inversee.texte.includes("courbe inversée")) throw new Error(inversee.texte);
});

Deno.test("régime macro : croissance qui cale et inflation qui accélère = stagflation", () => {
  const mensuel = (valeurs: Record<string, number>): PointMacro[] => Object.entries(valeurs).map(([date, valeur]) => ({ date, valeur }));
  const petrole = Array.from({ length: 64 }, (_, i) => point(63 - i, i === 0 ? 100 : 100 + (30 * i) / 63));
  const f = facteurRegimeMacro("SPX", {
    emplois: mensuel({ "2026-06-01": 158_910, "2026-09-01": 159_000 }), // +30 k par mois
    chomage: mensuel({ "2026-06-01": 3.9, "2026-09-01": 4.2 }), // +0,3 pt
    pib: mensuel({ "2026-01-01": 24_000, "2026-04-01": 24_000 }), // 0 %
    cpi: mensuel({ "2025-06-01": 100, "2025-09-01": 100, "2026-06-01": 103.5, "2026-09-01": 104 }), // 3,5 % -> 4 %
    pce: mensuel({ "2025-09-01": 100, "2026-09-01": 103.5 }), // 3,5 % pour une cible de 2 %
  }, petrole, "2026-10-16");
  // Croissance : (-0,7 - 1 - 1) / 3 = -0,9 ; inflation : (1 + 1 + 1) / 3 = 1 ; 0,6 x -0,9 - 0,4 x 1 = -0,94.
  egal("note", f.note, -0.94);
  if (!f.texte.startsWith("Régime macro : stagflation") || !f.texte.includes("cible de la Fed : 2 %") || !f.texte.includes("pétrole +30 %")) {
    throw new Error(f.texte);
  }
  if (!f.texte_en.startsWith("Macro regime: stagflation")) throw new Error(f.texte_en);
  egal("sans inflation", facteurRegimeMacro("SPX", { emplois: [], chomage: [], pib: [], cpi: [], pce: [] }, [], "2026-10-16").statut, "indisponible");
});

Deno.test("synthèse : facteur indisponible retiré, pas de biais sous la moitié des poids, raisons", () => {
  const fed = facteurFed("SPX", [point(1, 4.77)], [point(1, 3.88)], [], "2026-10-16");
  const conditions = facteurConditions("SPX", [{ date: jourAvant(7), taux: -0.5 }], "2026-10-16");
  const macro = facteurMacro("SPX", [], "2026-10-16", "av");
  const partiel = combiner([fed, conditions, macro]);
  // Fed (0,18) + conditions (0,05) sur 0,37 : 62 % disponibles.
  if (!partiel.ok) throw new Error(partiel.raison);
  // Contributions arrondies : 0,18 x -1 / 0,23 = -0,783 ; 0,05 x 1 / 0,23 = 0,217 ; score -0,566 -> baissier.
  egal("score", partiel.score, -0.566);
  egal("biais", partiel.biais, "baissier");
  egal("raisons", partiel.raisons.length, 2);
  const trop = combiner([conditions, macro, facteurFed("SPX", [], [], [], "2026-10-16")]);
  egal("moins de la moitié des poids", trop.ok, false);
});

Deno.test("Fed : le taux à 1 an complète le taux à 2 ans", () => {
  const f = facteurFed("SPX", [point(1, 4.77)], [point(1, 3.88)], [], "2026-10-16", [point(1, 4.49)]);
  // Écart moyen (0,89 + 0,61) / 2 = 0,75 -> note -1.
  egal("note", f.note, -1);
  if (!f.texte.includes("Taux à 1 an 4,49 %, à 2 ans 4,77 %") || !f.texte.includes("écart moyen +75 pb")) throw new Error(f.texte);
});

Deno.test("risque : structure de la volatilité inversée (VIX au-dessus du VIX3M) = baissier", () => {
  const vix = [point(1, 30)];
  const vix3m = [point(1, 25)];
  const f = facteurRisque("SPX", [], [], "2026-10-16", vix, vix3m);
  // Ratio 1,2 : -borner((1,2 - 0,9) / 0,15) = -1.
  egal("note", f.note, -1);
  if (!f.texte.includes("structure inversée")) throw new Error(f.texte);
});

Deno.test("macro : surprises face au consensus (inflation au-dessus = baissier, emplois au-dessus = haussier)", () => {
  const f = facteurMacro("SPX", [], "2026-10-16", "FRED", [
    { libelle: "US CPI YoY", publie: 3.7, prevision: 3.6, unite: "%", surprise: 0.5, sens: -1, instant: "2026-10-15T12:30:00Z" },
    { libelle: "US Nonfarm Payrolls", publie: 29, prevision: 110, unite: "K", surprise: -1, sens: 1, instant: "2026-10-03T12:30:00Z" },
  ]);
  // (-1 x 0,5 + 1 x -1) / 2 = -0,75.
  egal("note", f.note, -0.75);
  if (!f.texte.startsWith("Face au consensus (2 chiffres") || !f.texte.includes("US CPI YoY 3,7 % contre 3,6 % attendu")) throw new Error(f.texte);
});

Deno.test("liquidité : liquidité nette en hausse et M2 dynamique = haussier", () => {
  // Bilan +150 Md$ en 4 semaines, compte du Trésor et RRP stables ; M2 +8 % sur 1 an.
  const semaines = (debut: number, pas: number) => Array.from({ length: 5 }, (_, i) => point(28 - i * 7, debut + i * pas));
  const f = facteurLiquidite("SPX", semaines(6_600_000, 37_500), semaines(850_000, 0), semaines(1, 0),
    [{ date: "2025-08-01", taux: 100 }, { date: "2026-08-01", taux: 108 }], "2026-10-16");
  egal("note", f.note, 1);
  if (!f.texte.includes("(+150 Md$ en 4 semaines)") || !f.texte.includes("M2 +8,0 % sur 1 an")) throw new Error(f.texte);
});

Deno.test("positionnement : fonds très acheteurs (centile élevé) = baissier, lecture contrarienne", () => {
  const cot = Array.from({ length: 60 }, (_, i) => ({ date: jourAvant((59 - i) * 7 + 3), interet_ouvert: 1000, fonds_long: 100 + i * 5, fonds_court: 200 }));
  const f = facteurPositionnement("SPX", cot, "2026-10-16");
  egal("note", f.note, -1); // dernier point = maximum, centile 100 %
  if (!f.texte.includes("positionnement acheteur extrême")) throw new Error(f.texte);
  egal("trop court", facteurPositionnement("SPX", cot.slice(-10), "2026-10-16").statut, "indisponible");
});

Deno.test("historique : jamais de donnée avant sa publication, rendements de la séance", () => {
  // Cours du S&P 500 sur 40 séances et taux à 2 ans connus seulement la veille.
  const jours = Array.from({ length: 40 }, (_, i) => new Date(Date.UTC(2026, 0, 5) + i * 86_400_000).toISOString().slice(0, 10));
  const spx = jours.map((date, i) => ({ date, taux: 100 + i }));
  const plat = (v: number) => jours.map((date) => ({ date, taux: v }));
  const { lignes } = rejouer({
    series: { SPX: spx, US2Y: plat(4.5), FFR: plat(4), US1Y: plat(4.3), US10Y: plat(4), US10R: plat(2), VIX: plat(15), NFCI: plat(-0.3) },
    decisions: [], macro: {}, cot: {},
  }, jours[30], jours[35]);
  const premiere = lignes.find((l) => l.indice === "SPX")!;
  egal("date", premiere.date, jours[30]);
  // Rendement de la séance : 130 / 129 - 1.
  egal("rendement", premiere.rendement_1j, Math.round((130 / 129 - 1) * 1e6) / 1e4);
  egal("délai quotidien", DELAIS.quotidien, 1);
  const s = statistiques(lignes);
  egal("séances", s.seances, lignes.length);
});
