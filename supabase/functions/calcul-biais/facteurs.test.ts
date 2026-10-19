// deno test supabase/functions/calcul-biais
import {
  combiner,
  facteurConditions,
  facteurCourbe,
  facteurDollar,
  facteurFed,
  facteurLiquidite,
  facteurMacro,
  facteurPetrole,
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
// 6 séances ouvrées jusqu'au vendredi 16/10/2026 (le dimanche 11 est sauté).
const sixOuvrees = (debut: number, fin: number): PointTaux[] =>
  ["2026-10-09", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"].map((date, i) => ({ date, taux: debut + ((fin - debut) * i) / 5 }));

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

Deno.test("obligations d'État : variation sur 5 séances du 10 ans US, du réel et du taux européen", () => {
  // 25 séances stables puis 5 séances de `debut` à `fin`.
  const serie = (debut: number, fin: number): PointTaux[] =>
    Array.from({ length: 30 }, (_, i) => ({
      date: new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10),
      taux: i < 25 ? debut : debut + ((fin - debut) * (i - 24)) / 5,
    }));
  // Valeurs réelles du 15/10/2026 : 10 ans 5,28 -> 5,10 %, taux réel 2,92 -> 2,78 %.
  // 10 ans −18 pb -> +1 (part 0,5) ; réel −14 pb -> +0,933 (part 0,25) ; (0,5 + 0,233) / 0,75 = 0,978.
  const reel = facteurTaux("SPX", serie(5.28, 5.1), serie(2.92, 2.78), "2026-10-01", "fred");
  egal("valeurs réelles", reel.note, 0.978);
  if (!reel.texte.startsWith("Taux à 10 ans 5,10 % (−0,18 pt) en 5 séances") || !reel.texte.includes("taux réel à 10 ans 2,78 % (−0,14 pt)")) throw new Error(reel.texte);
  if (!reel.texte.endsWith("détente des rendements, favorable aux actions.")) throw new Error(reel.texte);
  // Taux européen +3 pb (-0,2, part 0,25) : 0,5 + 0,233 - 0,05 = 0,683.
  const avecBund = facteurTaux("SPX", serie(5.28, 5.1), serie(2.92, 2.78), "2026-10-01", "fred", serie(2.7, 2.73));
  egal("avec taux européen", avecBund.note, 0.683);
  if (!avecBund.texte.includes("taux européen AAA à 10 ans, proche du Bund, 2,73 % (+0,03 pt)")) throw new Error(avecBund.texte);
  // Hausse rapide partout : -1, texte « tension ».
  const hausse = facteurTaux("SPX", serie(4, 4.2), serie(1.5, 1.7), "2026-10-01", "fred", serie(2.5, 2.65));
  egal("hausse", hausse.note, -1);
  if (!hausse.texte.endsWith("tension sur les rendements, défavorable aux actions.")) throw new Error(hausse.texte);
  // Sans taux réel ni européen : seule la variation du 10 ans compte.
  egal("nominal seul", facteurTaux("SPX", serie(4, 4.2), [], "2026-10-01", "fred").note, -1);
  // Une valeur non numérique en base est ignorée (jamais « NaN » dans le texte ni la note).
  const avecNaN = [...serie(4, 4.2), { date: "2026-10-01", taux: NaN }];
  const f = facteurTaux("SPX", avecNaN, [], "2026-10-01", "fred");
  egal("NaN ignoré", f.note, -1);
  if (f.texte.includes("NaN")) throw new Error(f.texte);
  egal("trop ancien", facteurTaux("SPX", serie(4, 4.2), [], "2026-10-20", "fred").statut, "indisponible");
});

Deno.test("macro : sens par indicateur et fenêtre de fraîcheur", () => {
  const pub = (indicateur: string, variation: number, detecteeLe = "2026-10-10") => ({
    indicateur, periode: "2026-09-01", detecteeLe, valeur: 3, variation,
  });
  egal("inflation en hausse", facteurMacro("SPX", [pub("CPI", 0.3)], "2026-10-16", "av").note, -1);
  egal("emplois en hausse", facteurMacro("SPX", [pub("NONFARM_PAYROLL", 50)], "2026-10-16", "av").note, 0.5);
  egal("trop ancienne", facteurMacro("SPX", [pub("CPI", 0.3, "2026-08-01")], "2026-10-16", "av").statut, "indisponible");
});

Deno.test("sentiment risk-on / risk-off : stress sur le VIX, le crédit et les refuges = risk-off, baissier", () => {
  // 300 jours de VIX à 15, puis 28 ; VIX3M à 25 le même jour.
  const vix: PointTaux[] = Array.from({ length: 300 }, (_, i) => ({ date: jourAvant(301 - i), taux: 15 }));
  vix.push({ date: jourAvant(1), taux: 28 });
  const f = facteurRisque("SPX", vix, [{ date: jourAvant(1), taux: 25 }], "2026-10-16", six(3, 3.4), {
    // L'or est aussi coté le week-end : le samedi 10/10 est ignoré.
    or: [...sixOuvrees(100, 103), { date: "2026-10-10", taux: 90 }], usdjpy: sixOuvrees(150, 147), usdchf: sixOuvrees(0.9, 0.882),
  });
  // VIX +13 pt au-dessus de sa médiane et en 5 séances, structure 1,12, spread +40 pb,
  // or +3 %, yen et franc +2 % : chaque partie vaut -1.
  egal("note", f.note, -1);
  for (const morceau of ["VIX à 28,00", "structure inversée", "spread haut rendement 3,40 %", "or +3,0 %", "yen +2,0 %", "risk-off, défavorable aux actions."]) {
    if (!f.texte.includes(morceau)) throw new Error(`${morceau} absent : ${f.texte}`);
  }
  if (!f.texte_en.includes("risk-off, a headwind for equities")) throw new Error(f.texte_en);
  // Calme : VIX 12 (médiane 15, −3 pt en 5 séances) et VIX / VIX3M 0,8.
  // Volatilité -(0,5 x -0,375 + 0,5 x -0,6) = 0,4875 ; structure +0,667 ; (0,35 x 0,4875 + 0,15 x 0,667) / 0,5 = 0,541.
  const calme = [...vix.slice(0, 300), { date: jourAvant(1), taux: 12 }];
  const c = facteurRisque("SPX", calme, [{ date: jourAvant(1), taux: 15 }], "2026-10-16");
  egal("calme", c.note, 0.541);
  if (!c.texte.endsWith("risk-on, favorable aux actions.")) throw new Error(c.texte);
  egal("VIX seul", facteurRisque("SPX", vix, [], "2026-10-16").note, -1);
  // Refuges seuls : or −3 % (appétit pour le risque) -> +1.
  egal("refuges seuls", facteurRisque("SPX", [], [], "2026-10-16", [], { or: sixOuvrees(100, 97) }).note, 1);
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

Deno.test("dollar : un dollar qui monte pèse sur les actions, écart de taux États-Unis - zone euro", () => {
  // 25 séances : 5 à `debut`, puis 20 jusqu'à `fin` ; la référence (20 séances avant) vaut `debut`.
  const vingt = (debut: number, fin: number) => Array.from({ length: 25 }, (_, i) => point(24 - i, i < 5 ? debut : debut + ((fin - debut) * (i - 4)) / 20));
  const f = facteurDollar("SPX", vingt(100, 102), "2026-10-16");
  // +2 % en 20 séances -> -1.
  egal("dollar en hausse", f.note, -1);
  egal("priorité", f.priorite, "rouge");
  if (!f.texte.includes("+2,0 % en 20 séances") || !f.texte.endsWith("le dollar se renforce, défavorable aux actions.")) throw new Error(f.texte);
  // Dollar −2 % (+1, part 0,7) mais écart de taux +30 pb (-1, part 0,3) : 0,7 - 0,3 = 0,4.
  const mixte = facteurDollar("SPX", vingt(100, 98), "2026-10-16", vingt(4, 4.3), vingt(2.5, 2.5));
  egal("mixte", mixte.note, 0.4);
  if (!mixte.texte.includes("écart de taux à 10 ans États-Unis − zone euro +1,80 pt (+0,30 pt en 20 séances)")) throw new Error(mixte.texte);
  egal("trop ancien", facteurDollar("SPX", vingt(100, 102), "2026-11-30").statut, "indisponible");
});

Deno.test("pétrole : une hausse nourrit l'inflation et pèse sur les actions", () => {
  const vingt = (debut: number, fin: number) => Array.from({ length: 25 }, (_, i) => point(24 - i, i < 5 ? debut : debut + ((fin - debut) * (i - 4)) / 20));
  const hausse = facteurPetrole("SPX", vingt(70, 80.5), "2026-10-16");
  // +15 % en 20 séances -> -1.
  egal("hausse", hausse.note, -1);
  if (!hausse.texte.startsWith("Pétrole (WTI) à 80,50 $") || !hausse.texte.includes("+15,0 % en 20 séances : hausse du pétrole")) throw new Error(hausse.texte);
  // −7,5 % -> +0,5.
  egal("baisse", facteurPetrole("SPX", vingt(80, 74), "2026-10-16").note, 0.5);
  egal("trop ancien", facteurPetrole("SPX", vingt(70, 80.5), "2026-11-30").statut, "indisponible");
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

Deno.test("synthèse : poids de la liste (🔴 3, 🟠 2, 🟢 1), contexte hors score, seuils ±0,2", () => {
  const vixCalme: PointTaux[] = [...Array.from({ length: 300 }, (_, i) => ({ date: jourAvant(301 - i), taux: 15 })), { date: jourAvant(1), taux: 12 }];
  const fed = facteurFed("SPX", six(4.62, 4.77), [point(1, 3.88)], [], "2026-10-16", six(4.34, 4.49));
  const risque = facteurRisque("SPX", vixCalme, [{ date: jourAvant(1), taux: 15 }], "2026-10-16");
  const conditions = facteurConditions("SPX", [{ date: jourAvant(7), taux: -0.5 }], "2026-10-16");
  const macro = facteurMacro("SPX", [], "2026-10-16", "av");
  egal("Fed 🔴", fed.priorite, "rouge");
  egal("risque 🟠", risque.priorite, "orange");
  egal("conditions hors liste", conditions.priorite, "contexte");
  egal("poids 🔴", fed.poids, 3 / 26);
  egal("poids 🟠", risque.poids, 2 / 26);
  const r = combiner([fed, risque, conditions, macro]);
  if (!r.ok) throw new Error(r.raison);
  // Fed 3 x -1 / 5 = -0,6 ; risque 2 x 0,541 / 5 = 0,216 ; conditions : poids nul.
  egal("score", r.score, -0.384);
  egal("biais", r.biais, "baissier");
  egal("contexte hors raisons", r.raisons.length, 2);
  egal("contribution du contexte", r.facteurs.find((f) => f.cle === "conditions")!.contribution, 0);
  // Fed +3 pb (-0,2) : (3 x -0,2 + 2 x 0,541) / 5 = 0,096 : neutre.
  const modere = combiner([facteurFed("SPX", six(4.74, 4.77), [point(1, 3.88)], [], "2026-10-16", six(4.46, 4.49)), risque, macro]);
  if (!modere.ok) throw new Error(modere.raison);
  egal("modéré", modere.biais, "neutre");
  // Anticipations assouplies (+0,667) et marché calme : haussier.
  const assouplie = facteurFed("SPX", six(4.87, 4.77), [point(1, 3.88)], [], "2026-10-16", six(4.59, 4.49));
  const haussier = combiner([assouplie, risque, macro]);
  if (!haussier.ok) throw new Error(haussier.raison);
  egal("haussier", haussier.biais, "haussier");
  const trop = combiner([conditions, macro, facteurFed("SPX", [], [], [], "2026-10-16"), facteurRisque("SPX", [], [], "2026-10-16")]);
  egal("moins de la moitié des poids", trop.ok, false);
});

Deno.test("Fed : le taux à 2 ans suffit quand le taux à 1 an manque", () => {
  const f = facteurFed("SPX", six(4.82, 4.77), [point(1, 3.88)], [], "2026-10-16");
  // -5 pb en 5 séances : -borner(-0,05 / 0,15) = 0,333.
  egal("note", f.note, 0.333);
  if (!f.texte.includes("Le marché assouplit ses anticipations de la Fed : taux à 2 ans 4,77 % (−5 pb)")) throw new Error(f.texte);
});

Deno.test("sentiment : structure inversée du VIX signalée et baissière", () => {
  const f = facteurRisque("SPX", [point(1, 30)], [point(1, 25)], "2026-10-16");
  if (!f.texte.includes("structure inversée")) throw new Error(f.texte);
  egal("note", f.note, -1);
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
  if (!f.texte.includes("(+150 Md$ en 4 semaines)") || !f.texte.includes("bilan de la Fed +150 Md$, en expansion (QE)") || !f.texte.includes("M2 +8,0 % sur 1 an")) throw new Error(f.texte);
});

Deno.test("positionnement : les institutionnels (gérants d'actifs) qui renforcent leurs achats = haussier", () => {
  // Gérants nets de 20 % à 24,5 % de l'intérêt ouvert en 10 semaines (+0,5 pt par semaine).
  const cot = Array.from({ length: 10 }, (_, i) => ({
    date: jourAvant((9 - i) * 7 + 3), interet_ouvert: 1000, fonds_long: 100, fonds_court: 300, gerants_long: 400 + i * 5, gerants_court: 200,
  }));
  const f = facteurPositionnement("SPX", cot, "2026-10-16");
  // +2 pt en 4 semaines : 0,02 / 0,03 = 0,667.
  egal("note", f.note, 0.667);
  egal("priorité", f.priorite, "vert");
  egal("poids 🟢", f.poids, 1 / 26);
  if (!f.texte.startsWith("Gérants d'actifs nets +24,5 % de l'intérêt ouvert") || !f.texte.includes("(+2,0 pt en 4 semaines) : les institutionnels renforcent leurs achats")) throw new Error(f.texte);
  if (!f.texte.includes("fonds à effet de levier nets −20,0 %")) throw new Error(f.texte);
  egal("trop court", facteurPositionnement("SPX", cot.slice(-4), "2026-10-16").statut, "indisponible");
  // Roulement trimestriel : l'intérêt ouvert gonfle de 30 % il y a 4 semaines sans que les gérants
  // ne changent de position : aucun achat lu (valeurs du rapport du 15/09/2026 au 13/10/2026).
  const roulement = [
    { date: "2026-09-15", interet_ouvert: 2_446_519, gerants_long: 1_142_075, gerants_court: 237_391 },
    { date: "2026-09-22", interet_ouvert: 1_890_653, gerants_long: 1_118_655, gerants_court: 184_200 },
    { date: "2026-09-29", interet_ouvert: 1_895_922, gerants_long: 1_104_434, gerants_court: 200_431 },
    { date: "2026-10-06", interet_ouvert: 1_932_227, gerants_long: 1_106_717, gerants_court: 200_102 },
    { date: "2026-10-13", interet_ouvert: 1_931_607, gerants_long: 1_110_384, gerants_court: 194_549 },
  ].map((p) => ({ ...p, fonds_long: 0, fonds_court: 0 }));
  const r = facteurPositionnement("SPX", roulement, "2026-10-16");
  // (915 835 - 904 684) / 1 931 607 = +0,58 pt -> 0,192 (et non +10,4 pt en comparant deux parts).
  egal("roulement", r.note, 0.192);
  if (!r.texte.includes("(+0,6 pt en 4 semaines)")) throw new Error(r.texte);
  const sansGerants = cot.map((c) => ({ ...c, gerants_long: undefined, gerants_court: undefined }));
  egal("sans gérants", facteurPositionnement("SPX", sansGerants, "2026-10-16").statut, "indisponible");
});

Deno.test("historique : jamais de donnée avant sa publication, rendements de la séance", () => {
  // Cours du S&P 500 sur 40 séances et taux à 2 ans connus seulement la veille.
  const jours = Array.from({ length: 40 }, (_, i) => new Date(Date.UTC(2026, 0, 5) + i * 86_400_000).toISOString().slice(0, 10));
  const spx = jours.map((date, i) => ({ date, taux: 100 + i }));
  const plat = (v: number) => jours.map((date) => ({ date, taux: v }));
  const { lignes } = rejouer({
    series: {
      SPX: spx, US2Y: plat(4.5), FFR: plat(4), US1Y: plat(4.3), US10Y: plat(4), US10R: plat(2), EU10Y: plat(2.5), VIX: plat(15), NFCI: plat(-0.3),
      WTI: plat(70), XAU: plat(2000),
    },
    decisions: [], macro: {}, cot: {},
  }, jours[30], jours[35]);
  const premiere = lignes.find((l) => l.indice === "SPX")!;
  egal("date", premiere.date, jours[30]);
  // Rendement de la séance : 130 / 129 - 1.
  egal("rendement", premiere.rendement_1j, Math.round((130 / 129 - 1) * 1e6) / 1e4);
  egal("délai quotidien", DELAIS.quotidien, 1);
  // Mesures brutes stockées pour l'analyse : écart de taux États-Unis - zone euro connu la veille.
  egal("écart US - zone euro", premiere.notes.ecartUsEu, 1.5);
  egal("note du pétrole", premiere.notes.petrole, 0);
  const s = statistiques(lignes);
  egal("séances", s.seances, lignes.length);
});

Deno.test("publications depuis la dernière clôture : contexte, chiffres les plus surprenants, fenêtre de temps", () => {
  const pub = (libelle: string, surprise: number, instant: string, devise = "USD") => ({ devise, libelle, publie: 3.7, prevision: 3.6, unite: "%", surprise, instant });
  const f = facteurPublications("SPX", [
    pub("US CPI YoY", 0.5, "2026-10-15T12:30:00Z"),
    pub("German ZEW", -0.2, "2026-10-15T09:00:00Z", "EUR"),
    pub("Trop ancien", 1, "2026-10-14T12:30:00Z"),
  ], "2026-10-15T07:00:00.000Z", "2026-10-15T13:05:00.000Z");
  egal("poids nul", f.poids, 0);
  if (!f.texte.startsWith("2 chiffres publiés depuis la dernière clôture de New York : USD US CPI YoY 3,7 % contre 3,6 % attendu (surprise +50)") || f.texte.includes("Trop ancien")) throw new Error(f.texte);
  const vide = facteurPublications("SPX", [], "2026-10-15T07:00:00.000Z", "2026-10-15T13:05:00.000Z");
  egal("aucune publication", vide.statut, "ok");
  if (!vide.texte.startsWith("Aucun chiffre")) throw new Error(vide.texte);
});
