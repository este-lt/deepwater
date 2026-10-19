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
  facteurPublications,
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

const six = (debut: number, fin: number): PointTaux[] => Array.from({ length: 6 }, (_, i) => point(5 - i, debut + ((fin - debut) * i) / 5));

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

Deno.test("Fed : la révision des anticipations sur 5 séances fait la note, le niveau reste du contexte", () => {
  const decisions = [{ date: "2025-10-30", taux: 3.875 }, { date: "2025-12-11", taux: 3.625 }, { date: "2026-09-17", taux: 3.875 }];
  // Taux à 1 et 2 ans +15 pb en 5 séances : anticipations durcies -> note -1.
  const durcie = facteurFed("SPX", six(4.62, 4.77), [point(1, 3.88)], decisions, "2026-10-16", six(4.34, 4.49));
  egal("durcie", durcie.note, -1);
  if (!durcie.texte.startsWith("Le marché durcit ses anticipations de la Fed : taux à 1 an 4,49 % (+15 pb), à 2 ans 4,77 % (+15 pb) en 5 séances")) throw new Error(durcie.texte);
  // Le niveau (hausses déjà anticipées) et la dernière décision n'entrent pas dans la note.
  if (!durcie.texte.includes("niveau +75 pb face aux Fed funds (3,88 %), des hausses restent anticipées") || !durcie.texte.endsWith("hausse de 25 pb le 17 sept.")) throw new Error(durcie.texte);
  if (!durcie.texte_en.startsWith("The market is pricing a more hawkish Fed") || durcie.libelle_en !== "Fed expectations") throw new Error(durcie.texte_en);
  // Même niveau, mais anticipations assouplies de 10 pb : haussier malgré les hausses anticipées.
  const assouplie = facteurFed("SPX", six(4.87, 4.77), [point(1, 3.88)], decisions, "2026-10-16", six(4.59, 4.49));
  egal("assouplie", assouplie.note, 0.667);
  egal("sans données", facteurFed("SPX", [], [], [], "2026-10-16").statut, "indisponible");
  egal("une seule séance", facteurFed("SPX", [point(1, 4.77)], [point(1, 3.88)], [], "2026-10-16").statut, "indisponible");
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

Deno.test("peur sur les options : VIX au-dessus de sa médiane et structure tendue = haussier (mesuré 2021-2026)", () => {
  // 300 jours de VIX à 15, puis 28 ; VIX3M à 25 le même jour.
  const vix: PointTaux[] = Array.from({ length: 300 }, (_, i) => ({ date: jourAvant(301 - i), taux: 15 }));
  vix.push({ date: jourAvant(1), taux: 28 });
  const f = facteurRisque("SPX", vix, [{ date: jourAvant(1), taux: 25 }], "2026-10-16", [point(1, 3.31)]);
  // 0,5 x (1,12 - 0,9) / 0,15 + 0,5 x 13 / 8 = 1,55 -> borné à +1.
  egal("note", f.note, 1);
  if (!f.texte.includes("VIX à 28,00") || !f.texte.includes("historiquement suivie d'une hausse") || !f.texte.includes("Spread haut rendement 3,31 %")) throw new Error(f.texte);
  // Peur sous la normale : VIX 12 (médiane 15), VIX / VIX3M 0,8 -> 0,5 x -0,667 + 0,5 x -0,375 = -0,521.
  const calme = [...vix.slice(0, 300), { date: jourAvant(1), taux: 12 }];
  egal("calme", facteurRisque("SPX", calme, [{ date: jourAvant(1), taux: 15 }], "2026-10-16").note, -0.521);
  egal("VIX seul", facteurRisque("SPX", vix, [], "2026-10-16").note, 1);
  egal("données trop anciennes", facteurRisque("SPX", vix, [], "2026-11-30").statut, "indisponible");
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

Deno.test("dollar : contexte décrit sans effet affirmé (aucun pouvoir prédictif mesuré)", () => {
  // 5 séances à 100, puis 20 séances jusqu'à 102 : la référence (20 séances avant) vaut 100.
  const dxy = Array.from({ length: 25 }, (_, i) => point(24 - i, i < 5 ? 100 : 100 + (2 * (i - 4)) / 20));
  const f = facteurDollar("SPX", dxy, "2026-10-16");
  egal("poids nul", f.poids, 0);
  if (!f.texte.includes("dollar en hausse") || f.texte.includes("pèse")) throw new Error(f.texte);
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

Deno.test("synthèse : poids nul hors score, seuils asymétriques, pas de biais sous la moitié des poids", () => {
  const vixCalme: PointTaux[] = [...Array.from({ length: 300 }, (_, i) => ({ date: jourAvant(301 - i), taux: 15 })), { date: jourAvant(1), taux: 12 }];
  const fed = facteurFed("SPX", six(4.62, 4.77), [point(1, 3.88)], [], "2026-10-16", six(4.34, 4.49));
  const peur = facteurRisque("SPX", vixCalme, [{ date: jourAvant(1), taux: 15 }], "2026-10-16");
  const conditions = facteurConditions("SPX", [{ date: jourAvant(7), taux: -0.5 }], "2026-10-16");
  const macro = facteurMacro("SPX", [], "2026-10-16", "av");
  const r = combiner([fed, peur, conditions, macro]);
  if (!r.ok) throw new Error(r.raison);
  // Fed 0,3 x -1 / 0,7 = -0,429 ; peur 0,4 x -0,521 / 0,7 = -0,298 ; conditions : poids nul.
  egal("score", r.score, -0.727);
  egal("biais", r.biais, "baissier");
  egal("contexte hors raisons", r.raisons.length, 2);
  egal("contribution du contexte", r.facteurs.find((f) => f.cle === "conditions")!.contribution, 0);
  // Fed +3 pb (-0,2) et peur -0,521 : (0,3 x -0,2 + 0,4 x -0,521) / 0,7 = -0,383, au-dessus du seuil baissier (-0,45) : neutre.
  const modere = combiner([facteurFed("SPX", six(4.74, 4.77), [point(1, 3.88)], [], "2026-10-16", six(4.46, 4.49)), peur, macro]);
  if (!modere.ok) throw new Error(modere.raison);
  egal("modéré", modere.biais, "neutre");
  const trop = combiner([conditions, macro, facteurFed("SPX", [], [], [], "2026-10-16"), facteurRisque("SPX", [], [], "2026-10-16")]);
  egal("moins de la moitié des poids", trop.ok, false);
});

Deno.test("Fed : le taux à 2 ans suffit quand le taux à 1 an manque", () => {
  const f = facteurFed("SPX", six(4.82, 4.77), [point(1, 3.88)], [], "2026-10-16");
  // -5 pb en 5 séances : -borner(-0,05 / 0,15) = 0,333.
  egal("note", f.note, 0.333);
  if (!f.texte.includes("Le marché assouplit ses anticipations de la Fed : taux à 2 ans 4,77 % (−5 pb)")) throw new Error(f.texte);
});

Deno.test("peur sur les options : structure inversée signalée dans le texte", () => {
  const f = facteurRisque("SPX", [point(1, 30)], [point(1, 25)], "2026-10-16");
  if (!f.texte.includes("structure inversée")) throw new Error(f.texte);
  if (!(f.note! > 0)) throw new Error(`note ${f.note}`);
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

Deno.test("positionnement : centile sur 3 ans décrit sans lecture contrarienne (démentie par la mesure)", () => {
  const cot = Array.from({ length: 60 }, (_, i) => ({ date: jourAvant((59 - i) * 7 + 3), interet_ouvert: 1000, fonds_long: 100 + i * 5, fonds_court: 200 }));
  const f = facteurPositionnement("SPX", cot, "2026-10-16");
  egal("poids nul", f.poids, 0);
  if (!f.texte.includes("centile 100") || !f.texte.includes("positionnement acheteur élevé") || f.texte.includes("fragile")) throw new Error(f.texte);
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

Deno.test("publications depuis la session précédente : contexte, chiffres les plus surprenants, fenêtre de temps", () => {
  const pub = (libelle: string, surprise: number, instant: string, devise = "USD") => ({ devise, libelle, publie: 3.7, prevision: 3.6, unite: "%", surprise, instant });
  const f = facteurPublications("SPX", [
    pub("US CPI YoY", 0.5, "2026-10-15T12:30:00Z"),
    pub("German ZEW", -0.2, "2026-10-15T09:00:00Z", "EUR"),
    pub("Trop ancien", 1, "2026-10-14T12:30:00Z"),
  ], "2026-10-15T07:00:00.000Z", "2026-10-15T13:05:00.000Z");
  egal("poids nul", f.poids, 0);
  if (!f.texte.startsWith("2 chiffres publiés depuis le début de la session précédente : USD US CPI YoY 3,7 % contre 3,6 % attendu (surprise +50)") || f.texte.includes("Trop ancien")) throw new Error(f.texte);
  const vide = facteurPublications("SPX", [], "2026-10-15T07:00:00.000Z", "2026-10-15T13:05:00.000Z");
  egal("aucune publication", vide.statut, "ok");
  if (!vide.texte.startsWith("Aucun chiffre")) throw new Error(vide.texte);
});
