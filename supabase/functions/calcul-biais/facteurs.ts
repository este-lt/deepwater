// Calcul des facteurs du biais à partir de données déjà en base (aucun appel externe) :
// uniquement des données concrètes, aucune analyse technique (voir regles.ts).
// Fonctions pures : testées dans facteurs.test.ts. Chaque explication est écrite en
// français (texte) et en anglais (texte_en) : le site affiche celle de l'utilisateur.
import { type CleFacteur, type CleIndice, REGLES_BIAIS } from "./regles.ts";

export interface Facteur {
  cle: CleFacteur;
  libelle: string;
  libelle_en: string;
  statut: "ok" | "indisponible";
  note: number | null;
  poids: number;
  contribution: number | null;
  texte: string;
  texte_en: string;
  source: string;
  date: string | null;
}

export interface PointTaux {
  date: string;
  taux: number;
}

export interface PublicationMacro {
  indicateur: string;
  periode: string | null;
  detecteeLe: string;
  valeur: number | null;
  variation: number | null;
}

// --- Outils -----------------------------------------------------------------

type L = "fr" | "en";
const locale = (l: L) => (l === "en" ? "en-US" : "fr-FR");
const borner = (v: number) => Math.max(-1, Math.min(1, v));
const arrondi = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;
const nf = (v: number, d: number, l: L = "fr") =>
  new Intl.NumberFormat(locale(l), { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
const pc = (v: number, d: number, l: L) => `${nf(v, d, l)}${l === "en" ? "%" : " %"}`;
const signe = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "");
const jourUtc = (date: string) => Date.parse(`${date}T00:00:00Z`);
export const joursEntre = (de: string, a: string) => Math.round((jourUtc(a) - jourUtc(de)) / 86_400_000);
const dateCourte = (date: string, l: L = "fr") =>
  new Intl.DateTimeFormat(locale(l), { day: "numeric", month: "short", timeZone: "UTC" }).format(jourUtc(date));
const moisAnnee = (date: string, l: L = "fr") =>
  new Intl.DateTimeFormat(locale(l), { month: "short", year: "numeric", timeZone: "UTC" }).format(jourUtc(date));

const NOMS: Record<CleFacteur, [string, string]> = {
  fed: ["Politique de la Fed", "Fed policy"],
  taux: ["Taux longs", "Long rates"],
  macro: ["Surprise macro", "Macro surprise"],
  risque: ["Appétit pour le risque", "Risk appetite"],
  conditions: ["Conditions financières", "Financial conditions"],
};

const indisponible = (cle: CleFacteur, poids: number, texte: (l: L) => string, source: string): Facteur => ({
  cle, libelle: NOMS[cle][0], libelle_en: NOMS[cle][1], statut: "indisponible", note: null, poids, contribution: null,
  texte: texte("fr"), texte_en: texte("en"), source, date: null,
});

const disponible = (cle: CleFacteur, poids: number, note: number, texte: (l: L) => string, source: string, date: string | null): Facteur => ({
  cle, libelle: NOMS[cle][0], libelle_en: NOMS[cle][1], statut: "ok", note: arrondi(note), poids, contribution: null,
  texte: texte("fr"), texte_en: texte("en"), source, date,
});

// Séance visée (heure de New York, changement d'heure compris) : la séance du jour
// tant que la clôture de 16 h n'est pas passée, sinon la suivante. Week-ends sautés,
// jours fériés boursiers non gérés.
export function seanceVisee(maintenant: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", weekday: "short",
    }).formatToParts(maintenant).map((x) => [x.type, x.value]),
  );
  let jour = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day));
  const semaine = (t: number) => new Date(t).getUTCDay();
  if (semaine(jour) === 0 || semaine(jour) === 6 || Number(p.hour) >= 16) jour += 86_400_000;
  while (semaine(jour) === 0 || semaine(jour) === 6) jour += 86_400_000;
  return new Date(jour).toISOString().slice(0, 10);
}

// --- Facteurs -----------------------------------------------------------------

const tri = (s: PointTaux[]) => [...s].sort((a, b) => a.date.localeCompare(b.date));
const pb = (v: number, l: L) => `${signe(v)}${nf(Math.abs(v * 100), 0, l)} ${l === "fr" ? "pb" : "bp"}`;

// Politique de la Fed : anticipation du marché (taux à 2 ans contre taux effectif des Fed
// funds) et sens de la dernière décision (changements du taux directeur, BRI).
export function facteurFed(indice: CleIndice, deuxAns: PointTaux[], fedFunds: PointTaux[], decisions: PointTaux[], aujourdhui: string): Facteur {
  const r = REGLES_BIAIS.fed;
  const poids = REGLES_BIAIS.indices[indice].poids.fed;
  const source = "FRED (DGS2, DFF), BRI";
  const deux = tri(deuxAns).at(-1);
  const ff = tri(fedFunds).at(-1);
  const anticipation = deux && ff && joursEntre(deux.date, aujourdhui) <= r.ageMaxJours && joursEntre(ff.date, aujourdhui) <= r.ageMaxJours
    ? { ecart: deux.taux - ff.taux, deux, ff }
    : null;

  const d = tri(decisions);
  const n = d.length;
  let decision: { ecart: number; date: string; note: number } | null = null;
  if (n >= 2 && joursEntre(d[n - 1].date, aujourdhui) <= r.joursDecisionRecente) {
    const ecart = d[n - 1].taux - d[n - 2].taux;
    const memeSens = n >= 3 && Math.sign(d[n - 2].taux - d[n - 3].taux) === Math.sign(ecart) && joursEntre(d[n - 2].date, d[n - 1].date) <= r.joursMemeSens;
    // Une hausse de taux est baissière pour les actions, une baisse haussière.
    decision = { ecart, date: d[n - 1].date, note: -Math.sign(ecart) * (memeSens ? 1 : 0.6) };
  }

  if (!anticipation && !decision) {
    return indisponible("fed", poids, (l) => l === "fr" ? "Taux à 2 ans, Fed funds et décisions récentes indisponibles." : "2-year yield, Fed funds and recent decisions unavailable.", source);
  }
  const noteAnticipation = anticipation ? -borner(anticipation.ecart / r.ecartPleinPts) : null;
  const note = noteAnticipation !== null && decision
    ? r.partAnticipation * noteAnticipation + (1 - r.partAnticipation) * decision.note
    : noteAnticipation ?? decision!.note;

  const texte = (l: L) => {
    const parties: string[] = [];
    if (anticipation) {
      const { ecart, deux, ff } = anticipation;
      const sens = Math.abs(ecart) < 0.1
        ? l === "fr" ? "pas de changement anticipé" : "no change priced in"
        : ecart > 0
        ? l === "fr" ? "le marché anticipe des hausses de taux" : "the market prices in rate hikes"
        : l === "fr" ? "le marché anticipe des baisses de taux" : "the market prices in rate cuts";
      parties.push(l === "fr"
        ? `taux à 2 ans ${pc(deux.taux, 2, l)} contre Fed funds ${pc(ff.taux, 2, l)} (${pb(ecart, l)}) : ${sens}`
        : `2-year yield ${pc(deux.taux, 2, l)} vs Fed funds ${pc(ff.taux, 2, l)} (${pb(ecart, l)}): ${sens}`);
    } else {
      parties.push(l === "fr" ? "anticipations de marché indisponibles" : "market expectations unavailable");
    }
    if (decision) {
      parties.push(l === "fr"
        ? `dernière décision : ${decision.ecart > 0 ? "hausse" : "baisse"} de ${nf(Math.abs(decision.ecart * 100), 0)} pb le ${dateCourte(decision.date)}`
        : `last decision: ${decision.ecart > 0 ? "hike" : "cut"} of ${nf(Math.abs(decision.ecart * 100), 0, l)} bp on ${dateCourte(decision.date, l)}`);
    } else {
      parties.push(l === "fr" ? "pas de changement de taux depuis plus de 200 jours" : "no rate change in over 200 days");
    }
    const t = parties.join(l === "fr" ? " ; " : "; ");
    return `${t.charAt(0).toUpperCase()}${t.slice(1)}${t.endsWith(".") ? "" : "."}`;
  };
  return disponible("fed", poids, note, texte, source, anticipation?.deux.date ?? decision?.date ?? null);
}

// Taux longs : variation sur 5 séances du taux nominal à 10 ans et du taux réel à 10 ans
// (obligations indexées sur l'inflation), et niveau du taux réel face au repère neutre.
// Un argent qui renchérit, ou déjà cher, est baissier.
export function facteurTaux(indice: CleIndice, nominal: PointTaux[], reel: PointTaux[], aujourdhui: string, source: string): Facteur {
  const r = REGLES_BIAIS.taux;
  const poids = REGLES_BIAIS.indices[indice].poids.taux;
  const lire = (s: PointTaux[]) => {
    const t = tri(s);
    const dernier = t.at(-1);
    const reference = t.at(-1 - r.seancesVariation);
    if (!dernier || !reference || joursEntre(dernier.date, aujourdhui) > r.ageMaxJours) return null;
    return { dernier, variation: dernier.taux - reference.taux };
  };
  const nom = lire(nominal);
  const re = lire(reel);
  if (!nom && !re) {
    return indisponible("taux", poids, (l) => l === "fr" ? `${r.libelle} : données absentes ou trop anciennes.` : `${r.libelle_en}: data missing or too old.`, source);
  }
  const notes = [
    ...(nom ? [{ note: -borner(nom.variation / r.variationPleinePts), part: r.partNominal }] : []),
    ...(re ? [{ note: -borner(re.variation / r.variationPleinePts), part: 1 - r.partNominal }] : []),
  ];
  const noteVariation = notes.reduce((s, x) => s + x.note * x.part, 0) / notes.reduce((s, x) => s + x.part, 0);
  const ecartNiveau = re ? re.dernier.taux - r.reelNeutre : null;
  const note = ecartNiveau === null
    ? noteVariation
    : (1 - r.partNiveau) * noteVariation + r.partNiveau * -borner(ecartNiveau / r.ecartPleinNiveauPts);
  const texte = (l: L) => {
    const parties: string[] = [];
    if (nom) {
      parties.push(l === "fr"
        ? `${r.libelle} : ${pc(nom.dernier.taux, 2, l)} le ${dateCourte(nom.dernier.date)}, ${signe(nom.variation)}${nf(Math.abs(nom.variation), 2)} pt en ${r.seancesVariation} séances`
        : `${r.libelle_en}: ${pc(nom.dernier.taux, 2, l)} on ${dateCourte(nom.dernier.date, l)}, ${signe(nom.variation)}${nf(Math.abs(nom.variation), 2, l)} pt over ${r.seancesVariation} sessions`);
    }
    if (re && ecartNiveau !== null) {
      const position = l === "fr"
        ? `${nf(Math.abs(ecartNiveau), 2)} pt ${ecartNiveau >= 0 ? "au-dessus" : "au-dessous"} du repère neutre de ${pc(r.reelNeutre, 1, l)}`
        : `${nf(Math.abs(ecartNiveau), 2, l)} pt ${ecartNiveau >= 0 ? "above" : "below"} the ${pc(r.reelNeutre, 1, l)} neutral benchmark`;
      parties.push(l === "fr"
        ? `taux réel à 10 ans ${pc(re.dernier.taux, 2, l)} (${signe(re.variation)}${nf(Math.abs(re.variation), 2)} pt), ${position}`
        : `10-year real yield ${pc(re.dernier.taux, 2, l)} (${signe(re.variation)}${nf(Math.abs(re.variation), 2, l)} pt), ${position}`);
    }
    return `${parties.join(l === "fr" ? " ; " : "; ")}.`;
  };
  return disponible("taux", poids, note, texte, source, nom?.dernier.date ?? re?.dernier.date ?? null);
}

export function facteurMacro(indice: CleIndice, publications: PublicationMacro[], aujourdhui: string, source: string): Facteur {
  const r = REGLES_BIAIS.macro;
  const poids = REGLES_BIAIS.indices[indice].poids.macro;
  const recentes = publications.filter(
    (p) => r.indicateurs[p.indicateur] && p.variation !== null && joursEntre(p.detecteeLe, aujourdhui) <= r.fenetreJours,
  );
  if (recentes.length === 0) {
    return indisponible(
      "macro", poids,
      (l) => l === "fr" ? `Aucune publication macro détectée depuis ${r.fenetreJours} jours.` : `No macro release detected in the last ${r.fenetreJours} days.`,
      source,
    );
  }
  const notes = recentes.map((p) => {
    const def = r.indicateurs[p.indicateur];
    return def.sens * borner(p.variation! / def.ecartPlein);
  });
  const periodeDe = (p: PublicationMacro, l: L) => {
    if (!p.periode) return "";
    if (p.indicateur === "JOBLESS_CLAIMS") return l === "fr" ? ` (semaine du ${dateCourte(p.periode)})` : ` (week of ${dateCourte(p.periode, l)})`;
    if (p.indicateur === "REAL_GDP") return ` (${l === "fr" ? "T" : "Q"}${Math.floor((Number(p.periode.slice(5, 7)) - 1) / 3) + 1} ${p.periode.slice(0, 4)})`;
    return ` (${moisAnnee(p.periode, l)})`;
  };
  // Seules les 3 publications qui pèsent le plus sont détaillées.
  const principales = recentes
    .map((p, i) => ({ p, poids: Math.abs(notes[i]) }))
    .sort((a, b) => b.poids - a.poids)
    .slice(0, 3)
    .map(({ p }) => p);
  const texte = (l: L) => {
    const parties = principales.map((p) => {
      const def = r.indicateurs[p.indicateur];
      const valeur = p.valeur === null ? "—" : p.indicateur === "JOBLESS_CLAIMS" ? `${nf(p.valeur, 0, l)} k` : def.unite === "k" ? `${signe(p.valeur)}${nf(Math.abs(p.valeur), 0, l)} k` : pc(p.valeur, 1, l);
      const ecart = `${signe(p.variation!)}${nf(Math.abs(p.variation!), def.unite === "k" ? 0 : 1, l)} ${def.unite}`;
      return l === "fr" ? `${def.libelle} ${valeur}${periodeDe(p, l)}, ${ecart} vs la précédente` : `${def.libelle_en} ${valeur}${periodeDe(p, l)}, ${ecart} vs prior`;
    });
    if (recentes.length > 3) parties.push(l === "fr" ? `${recentes.length - 3} autres publications prises en compte` : `${recentes.length - 3} other releases included`);
    return `${parties.join(l === "fr" ? " ; " : "; ")}.`;
  };
  return disponible(
    "macro", poids, notes.reduce((s, n) => s + n, 0) / notes.length, texte, source,
    recentes.map((p) => p.detecteeLe).sort().at(-1) ?? null,
  );
}

// Appétit pour le risque : volatilité implicite (VIX pour le S&P 500, VXN pour le
// Nasdaq-100) et spread de crédit à haut rendement. Séries triées ou non.
export function facteurRisque(indice: CleIndice, volatilite: PointTaux[], credit: PointTaux[], aujourdhui: string): Facteur {
  const r = REGLES_BIAIS.risque;
  const poids = REGLES_BIAIS.indices[indice].poids.risque;
  const nomVol = REGLES_BIAIS.indices[indice].volatilite;
  const source = `FRED (${nomVol}, spread haut rendement ICE BofA)`;
  const recente = (s: PointTaux[]) => {
    const tries = [...s].sort((a, b) => a.date.localeCompare(b.date));
    const dernier = tries.at(-1);
    return dernier && joursEntre(dernier.date, aujourdhui) <= r.ageMaxJours ? tries : null;
  };

  const parties: { note: number; part: number; texte: (l: L) => string }[] = [];
  const vol = recente(volatilite);
  const refVol = vol?.at(-1 - r.seancesVariation);
  if (vol && refVol) {
    const dernier = vol.at(-1)!;
    const annee = vol.filter((p) => joursEntre(p.date, dernier.date) <= r.joursMediane).map((p) => p.taux).sort((a, b) => a - b);
    const mediane = annee[Math.floor(annee.length / 2)];
    const variation = dernier.taux - refVol.taux;
    const note = -(0.5 * borner((dernier.taux - mediane) / r.ecartPleinVolPts) + 0.5 * borner(variation / r.variationPleineVolPts));
    parties.push({
      note,
      part: r.partVolatilite,
      texte: (l) => l === "fr"
        ? `${nomVol} à ${nf(dernier.taux, 2)} le ${dateCourte(dernier.date)} (médiane d'un an : ${nf(mediane, 2)}), ${signe(variation)}${nf(Math.abs(variation), 2)} pt en ${r.seancesVariation} séances`
        : `${nomVol} at ${nf(dernier.taux, 2, l)} on ${dateCourte(dernier.date, l)} (one-year median: ${nf(mediane, 2, l)}), ${signe(variation)}${nf(Math.abs(variation), 2, l)} pt over ${r.seancesVariation} sessions`,
    });
  }
  const hy = recente(credit);
  const refHy = hy?.at(-1 - r.seancesVariation);
  if (hy && refHy) {
    const dernier = hy.at(-1)!;
    const variation = dernier.taux - refHy.taux;
    parties.push({
      note: -borner(variation / r.variationPleineCreditPts),
      part: 1 - r.partVolatilite,
      texte: (l) => l === "fr"
        ? `spread haut rendement ${pc(dernier.taux, 2, l)} (${signe(variation)}${nf(Math.abs(variation), 2)} pt en ${r.seancesVariation} séances)`
        : `high-yield spread ${pc(dernier.taux, 2, l)} (${signe(variation)}${nf(Math.abs(variation), 2, l)} pt over ${r.seancesVariation} sessions)`,
    });
  }
  if (parties.length === 0) {
    return indisponible("risque", poids, (l) => l === "fr" ? `${nomVol} et spread de crédit absents ou trop anciens.` : `${nomVol} and credit spread missing or too old.`, source);
  }
  const note = parties.reduce((s, p) => s + p.note * p.part, 0) / parties.reduce((s, p) => s + p.part, 0);
  return disponible(
    "risque", poids, note,
    (l) => `${parties.map((p) => p.texte(l)).join(l === "fr" ? " ; " : "; ")}.`,
    source,
    [...(vol ?? []), ...(hy ?? [])].map((p) => p.date).sort().at(-1) ?? null,
  );
}

// Conditions financières (indice NFCI de la Fed de Chicago) : au-dessus de zéro, plus
// tendues que la moyenne historique ; un resserrement récent est baissier.
export function facteurConditions(indice: CleIndice, nfci: PointTaux[], aujourdhui: string): Facteur {
  const r = REGLES_BIAIS.conditions;
  const poids = REGLES_BIAIS.indices[indice].poids.conditions;
  const source = "FRED (NFCI, Fed de Chicago)";
  const t = tri(nfci);
  const dernier = t.at(-1);
  if (!dernier || joursEntre(dernier.date, aujourdhui) > r.ageMaxJours) {
    return indisponible("conditions", poids, (l) => l === "fr" ? "Indice des conditions financières absent ou trop ancien." : "Financial conditions index missing or too old.", source);
  }
  const reference = t.at(-1 - r.semainesVariation);
  const variation = reference ? dernier.taux - reference.taux : null;
  const noteNiveau = -borner(dernier.taux / r.niveauPlein);
  const note = variation === null ? noteNiveau : r.partNiveau * noteNiveau + (1 - r.partNiveau) * -borner(variation / r.variationPleine);
  const texte = (l: L) => {
    const etat = dernier.taux > 0
      ? l === "fr" ? "plus tendues que la moyenne" : "tighter than average"
      : l === "fr" ? "plus souples que la moyenne" : "looser than average";
    const evolution = variation === null
      ? ""
      : l === "fr"
      ? `, ${variation > 0.02 ? "resserrement" : variation < -0.02 ? "assouplissement" : "stables"} sur ${r.semainesVariation} semaines (${signe(variation)}${nf(Math.abs(variation), 2)})`
      : `, ${variation > 0.02 ? "tightening" : variation < -0.02 ? "easing" : "stable"} over ${r.semainesVariation} weeks (${signe(variation)}${nf(Math.abs(variation), 2, l)})`;
    return l === "fr"
      ? `Conditions financières (NFCI ${signe(dernier.taux)}${nf(Math.abs(dernier.taux), 2)} au ${dateCourte(dernier.date)}) ${etat}${evolution}.`
      : `Financial conditions (NFCI ${signe(dernier.taux)}${nf(Math.abs(dernier.taux), 2, l)} as of ${dateCourte(dernier.date, l)}) ${etat}${evolution}.`;
  };
  return disponible("conditions", poids, note, texte, source, dernier.date);
}

// --- Synthèse -----------------------------------------------------------------

export type ResultatBiais =
  | {
    ok: true;
    biais: "haussier" | "baissier" | "neutre";
    score: number;
    facteurs: Facteur[];
    raisons: string[];
    sources: { source: string; date: string | null }[];
  }
  | { ok: false; raison: string; facteurs: Facteur[] };

export function combiner(facteurs: Facteur[]): ResultatBiais {
  const poidsTotal = facteurs.reduce((s, f) => s + f.poids, 0);
  const disponibles = facteurs.filter((f) => f.statut === "ok");
  const poidsDisponible = disponibles.reduce((s, f) => s + f.poids, 0);
  if (poidsDisponible / poidsTotal < REGLES_BIAIS.partPoidsMinimale) {
    return { ok: false, raison: `seulement ${Math.round((poidsDisponible / poidsTotal) * 100)} % des facteurs disponibles`, facteurs };
  }
  const complets = facteurs.map((f) =>
    f.statut === "ok" ? { ...f, contribution: arrondi((f.poids * f.note!) / poidsDisponible) } : f
  );
  const score = arrondi(complets.reduce((s, f) => s + (f.contribution ?? 0), 0));
  const { haussier, baissier } = REGLES_BIAIS.seuils;
  const biais = score >= haussier ? "haussier" : score <= baissier ? "baissier" : "neutre";
  const principaux = complets
    .filter((f) => f.statut === "ok")
    .sort((a, b) => Math.abs(b.contribution!) - Math.abs(a.contribution!))
    .slice(0, 3);
  return {
    ok: true,
    biais,
    score,
    facteurs: complets,
    raisons: principaux.map((f) => f.texte),
    sources: principaux.map((f) => ({ source: f.source, date: f.date })),
  };
}
