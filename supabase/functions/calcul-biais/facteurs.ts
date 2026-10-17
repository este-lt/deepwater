// Calcul des facteurs du biais à partir de données déjà en base (aucun appel externe).
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

export interface PointPrix {
  date: string;
  cloture: number;
  mm20: number | null;
  mm50: number | null;
  source: string;
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
  tendance: ["Tendance (moyennes mobiles)", "Trend (moving averages)"],
  taux: ["Taux longs", "Long rates"],
  macro: ["Surprise macro", "Macro surprise"],
  risque: ["Appétit pour le risque", "Risk appetite"],
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

export function facteurTendance(indice: CleIndice, prix: PointPrix | null, aujourdhui: string): Facteur {
  const r = REGLES_BIAIS.tendance;
  const { libelle, poids } = { libelle: REGLES_BIAIS.indices[indice].libelle, poids: REGLES_BIAIS.indices[indice].poids.tendance };
  if (!prix || prix.mm20 === null || prix.mm50 === null) {
    return indisponible("tendance", poids, (l) => l === "fr" ? `${libelle} : cours ou moyennes mobiles absents.` : `${libelle}: price or moving averages missing.`, prix?.source ?? "FRED");
  }
  if (joursEntre(prix.date, aujourdhui) > r.ageMaxJours) {
    return indisponible(
      "tendance", poids,
      (l) => l === "fr" ? `${libelle} : dernière clôture du ${dateCourte(prix.date)}, trop ancienne.` : `${libelle}: last close on ${dateCourte(prix.date, "en")}, too old.`,
      prix.source,
    );
  }
  const { mm20, mm50 } = prix;
  const e20 = (prix.cloture / mm20 - 1) * 100;
  const e50 = (prix.cloture / mm50 - 1) * 100;
  const note = r.partMm20 * borner(e20 / r.ecartPleinMm20Pct) + (1 - r.partMm20) * borner(e50 / r.ecartPleinMm50Pct);
  const position = (e: number, l: L) => l === "fr" ? `${pc(Math.abs(e), 1, l)} ${e >= 0 ? "au-dessus" : "en dessous"}` : `${pc(Math.abs(e), 1, l)} ${e >= 0 ? "above" : "below"}`;
  return disponible(
    "tendance", poids, note,
    (l) => l === "fr"
      ? `${libelle} : clôture à ${nf(prix.cloture, 2)} le ${dateCourte(prix.date)}, ${position(e20, l)} de la MM20 (${nf(mm20, 0)}) et ${position(e50, l)} de la MM50 (${nf(mm50, 0)}).`
      : `${libelle}: close at ${nf(prix.cloture, 2, l)} on ${dateCourte(prix.date, l)}, ${position(e20, l)} the 20-day MA (${nf(mm20, 0, l)}) and ${position(e50, l)} the 50-day MA (${nf(mm50, 0, l)}).`,
    prix.source, prix.date,
  );
}

export function facteurTaux(indice: CleIndice, serie: PointTaux[], aujourdhui: string, source: string): Facteur {
  const r = REGLES_BIAIS.taux;
  const poids = REGLES_BIAIS.indices[indice].poids.taux;
  const tries = [...serie].sort((a, b) => a.date.localeCompare(b.date));
  const dernier = tries.at(-1);
  const reference = tries.at(-1 - r.seancesVariation);
  if (!dernier || !reference) {
    return indisponible("taux", poids, (l) => l === "fr" ? `${r.libelle} : historique insuffisant.` : `${r.libelle_en}: not enough history.`, source);
  }
  if (joursEntre(dernier.date, aujourdhui) > r.ageMaxJours) {
    return indisponible(
      "taux", poids,
      (l) => l === "fr" ? `${r.libelle} : dernière valeur du ${dateCourte(dernier.date)}, trop ancienne.` : `${r.libelle_en}: last value on ${dateCourte(dernier.date, "en")}, too old.`,
      source,
    );
  }
  const annee = tries.filter((p) => joursEntre(p.date, dernier.date) <= r.joursMoyenne);
  const moyenne = annee.reduce((s, p) => s + p.taux, 0) / annee.length;
  const variation = dernier.taux - reference.taux;
  const ecart = dernier.taux - moyenne;
  const note = r.partVariation * -borner(variation / r.variationPleinePts) + (1 - r.partVariation) * -borner(ecart / r.ecartPleinMoyennePts);
  return disponible(
    "taux", poids, note,
    (l) => l === "fr"
      ? `${r.libelle} : ${pc(dernier.taux, 2, l)} le ${dateCourte(dernier.date)}, ${signe(variation)}${nf(Math.abs(variation), 2)} pt en ${r.seancesVariation} séances, ${nf(Math.abs(ecart), 2)} pt ${ecart >= 0 ? "au-dessus" : "en dessous"} de sa moyenne sur un an (${pc(moyenne, 2, l)}).`
      : `${r.libelle_en}: ${pc(dernier.taux, 2, l)} on ${dateCourte(dernier.date, l)}, ${signe(variation)}${nf(Math.abs(variation), 2, l)} pt over ${r.seancesVariation} sessions, ${nf(Math.abs(ecart), 2, l)} pt ${ecart >= 0 ? "above" : "below"} its one-year average (${pc(moyenne, 2, l)}).`,
    source, dernier.date,
  );
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
  if (!disponibles.some((f) => f.cle === "tendance")) {
    return { ok: false, raison: "cours de l'indice indisponible ou trop ancien", facteurs };
  }
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
