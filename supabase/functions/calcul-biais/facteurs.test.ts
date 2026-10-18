// deno test supabase/functions/calcul-biais
import {
  combiner,
  facteurConditions,
  facteurFed,
  facteurMacro,
  facteurRisque,
  facteurTaux,
  type PointTaux,
  seanceVisee,
} from "./facteurs.ts";

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

Deno.test("synthèse : facteur indisponible retiré, pas de biais sous la moitié des poids, raisons", () => {
  const fed = facteurFed("SPX", [point(1, 4.77)], [point(1, 3.88)], [], "2026-10-16");
  const conditions = facteurConditions("SPX", [{ date: jourAvant(7), taux: -0.5 }], "2026-10-16");
  const macro = facteurMacro("SPX", [], "2026-10-16", "av");
  const partiel = combiner([fed, conditions, macro]);
  // Fed (0,25) + conditions (0,15) sur 0,6 : 67 % disponibles.
  if (!partiel.ok) throw new Error(partiel.raison);
  // (0,25 x -1 + 0,15 x 1) / 0,4 = -0,25 -> baissier.
  egal("score", partiel.score, -0.25);
  egal("biais", partiel.biais, "baissier");
  egal("raisons", partiel.raisons.length, 2);
  const trop = combiner([conditions, macro, facteurFed("SPX", [], [], [], "2026-10-16")]);
  egal("moins de la moitié des poids", trop.ok, false);
});
