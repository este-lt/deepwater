// Calcul des facteurs du biais à partir de données déjà en base (aucun appel externe).
// Fonctions pures : testées dans facteurs.test.ts.
import { type CleFacteur, type CleIndice, REGLES_BIAIS } from "./regles.ts";

export interface Facteur {
  cle: CleFacteur;
  libelle: string;
  statut: "ok" | "indisponible";
  note: number | null;
  poids: number;
  contribution: number | null;
  texte: string;
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

const borner = (v: number) => Math.max(-1, Math.min(1, v));
const arrondi = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;
const nf = (v: number, d: number) =>
  new Intl.NumberFormat("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
const signe = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "");
const jourUtc = (date: string) => Date.parse(`${date}T00:00:00Z`);
export const joursEntre = (de: string, a: string) => Math.round((jourUtc(a) - jourUtc(de)) / 86_400_000);
const dateCourte = (date: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }).format(jourUtc(date));
const moisAnnee = (date: string) =>
  new Intl.DateTimeFormat("fr-FR", { month: "short", year: "numeric", timeZone: "UTC" }).format(jourUtc(date));

export function montantCourt(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${nf(a / 1e9, 2)} Md$`;
  if (a >= 1e6) return `${nf(a / 1e6, 1)} M$`;
  if (a >= 1e3) return `${nf(a / 1e3, 0)} k$`;
  return `${nf(a, 0)} $`;
}

const indisponible = (cle: CleFacteur, libelle: string, poids: number, texte: string, source: string): Facteur => ({
  cle, libelle, statut: "indisponible", note: null, poids, contribution: null, texte, source, date: null,
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
  const nom = "Tendance (moyennes mobiles)";
  if (!prix || prix.mm20 === null || prix.mm50 === null) {
    return indisponible("tendance", nom, poids, `${libelle} : cours ou moyennes mobiles absents.`, prix?.source ?? "FRED");
  }
  if (joursEntre(prix.date, aujourdhui) > r.ageMaxJours) {
    return indisponible("tendance", nom, poids, `${libelle} : dernière clôture du ${dateCourte(prix.date)}, trop ancienne.`, prix.source);
  }
  const e20 = (prix.cloture / prix.mm20 - 1) * 100;
  const e50 = (prix.cloture / prix.mm50 - 1) * 100;
  const note = r.partMm20 * borner(e20 / r.ecartPleinMm20Pct) + (1 - r.partMm20) * borner(e50 / r.ecartPleinMm50Pct);
  const position = (e: number) => `${nf(Math.abs(e), 1)} % ${e >= 0 ? "au-dessus" : "en dessous"}`;
  return {
    cle: "tendance",
    libelle: nom,
    statut: "ok",
    note: arrondi(note),
    poids,
    contribution: null,
    texte: `${libelle} : clôture à ${nf(prix.cloture, 2)} le ${dateCourte(prix.date)}, ${position(e20)} de la MM20 (${nf(prix.mm20, 0)}) et ${position(e50)} de la MM50 (${nf(prix.mm50, 0)}).`,
    source: prix.source,
    date: prix.date,
  };
}

export function facteurTaux(indice: CleIndice, serie: PointTaux[], aujourdhui: string, source: string): Facteur {
  const r = REGLES_BIAIS.taux;
  const poids = REGLES_BIAIS.indices[indice].poids.taux;
  const nom = "Taux longs";
  const tries = [...serie].sort((a, b) => a.date.localeCompare(b.date));
  const dernier = tries.at(-1);
  const reference = tries.at(-1 - r.seancesVariation);
  if (!dernier || !reference) return indisponible("taux", nom, poids, `${r.libelle} : historique insuffisant.`, source);
  if (joursEntre(dernier.date, aujourdhui) > r.ageMaxJours) {
    return indisponible("taux", nom, poids, `${r.libelle} : dernière valeur du ${dateCourte(dernier.date)}, trop ancienne.`, source);
  }
  const annee = tries.filter((p) => joursEntre(p.date, dernier.date) <= r.joursMoyenne);
  const moyenne = annee.reduce((s, p) => s + p.taux, 0) / annee.length;
  const variation = dernier.taux - reference.taux;
  const ecart = dernier.taux - moyenne;
  const note = r.partVariation * -borner(variation / r.variationPleinePts) + (1 - r.partVariation) * -borner(ecart / r.ecartPleinMoyennePts);
  return {
    cle: "taux",
    libelle: nom,
    statut: "ok",
    note: arrondi(note),
    poids,
    contribution: null,
    texte: `${r.libelle} : ${nf(dernier.taux, 2)} % le ${dateCourte(dernier.date)}, ${signe(variation)}${nf(Math.abs(variation), 2)} pt en ${r.seancesVariation} séances, ${nf(Math.abs(ecart), 2)} pt ${ecart >= 0 ? "au-dessus" : "en dessous"} de sa moyenne sur un an (${nf(moyenne, 2)} %).`,
    source,
    date: dernier.date,
  };
}

export function facteurMacro(indice: CleIndice, publications: PublicationMacro[], aujourdhui: string, source: string): Facteur {
  const r = REGLES_BIAIS.macro;
  const poids = REGLES_BIAIS.indices[indice].poids.macro;
  const nom = "Surprise macro";
  const recentes = publications.filter(
    (p) => r.indicateurs[p.indicateur] && p.variation !== null && joursEntre(p.detecteeLe, aujourdhui) <= r.fenetreJours,
  );
  if (recentes.length === 0) {
    return indisponible("macro", nom, poids, `Aucune publication macro détectée depuis ${r.fenetreJours} jours.`, source);
  }
  const notes = recentes.map((p) => {
    const def = r.indicateurs[p.indicateur];
    return def.sens * borner(p.variation! / def.ecartPlein);
  });
  const parties = recentes.map((p) => {
    const def = r.indicateurs[p.indicateur];
    const valeur = p.valeur === null ? "—" : p.indicateur === "JOBLESS_CLAIMS" ? `${nf(p.valeur, 0)} k` : def.unite === "k" ? `${signe(p.valeur)}${nf(Math.abs(p.valeur), 0)} k` : `${nf(p.valeur, 1)} %`;
    const periode = p.periode ? ` (${moisAnnee(p.periode)})` : "";
    return `${def.libelle} ${valeur}${periode}, ${signe(p.variation!)}${nf(Math.abs(p.variation!), def.unite === "k" ? 0 : 1)} ${def.unite} vs la précédente`;
  });
  return {
    cle: "macro",
    libelle: nom,
    statut: "ok",
    note: arrondi(notes.reduce((s, n) => s + n, 0) / notes.length),
    poids,
    contribution: null,
    texte: `${parties.join(" ; ")}.`,
    source,
    date: recentes.map((p) => p.detecteeLe).sort().at(-1) ?? null,
  };
}

// Appétit pour le risque : volatilité implicite (VIX pour le S&P 500, VXN pour le
// Nasdaq-100) et spread de crédit à haut rendement. Séries triées ou non.
export function facteurRisque(indice: CleIndice, volatilite: PointTaux[], credit: PointTaux[], aujourdhui: string): Facteur {
  const r = REGLES_BIAIS.risque;
  const poids = REGLES_BIAIS.indices[indice].poids.risque;
  const nomVol = REGLES_BIAIS.indices[indice].volatilite;
  const nom = "Appétit pour le risque";
  const source = `FRED (${nomVol}, spread haut rendement ICE BofA)`;
  const recente = (s: PointTaux[]) => {
    const tries = [...s].sort((a, b) => a.date.localeCompare(b.date));
    const dernier = tries.at(-1);
    return dernier && joursEntre(dernier.date, aujourdhui) <= r.ageMaxJours ? tries : null;
  };

  const parties: { note: number; part: number; texte: string }[] = [];
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
      texte: `${nomVol} à ${nf(dernier.taux, 2)} le ${dateCourte(dernier.date)} (médiane d'un an : ${nf(mediane, 2)}), ${signe(variation)}${nf(Math.abs(variation), 2)} pt en ${r.seancesVariation} séances`,
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
      texte: `spread haut rendement ${nf(dernier.taux, 2)} % (${signe(variation)}${nf(Math.abs(variation), 2)} pt en ${r.seancesVariation} séances)`,
    });
  }
  if (parties.length === 0) return indisponible("risque", nom, poids, `${nomVol} et spread de crédit absents ou trop anciens.`, source);
  const note = parties.reduce((s, p) => s + p.note * p.part, 0) / parties.reduce((s, p) => s + p.part, 0);
  return {
    cle: "risque",
    libelle: nom,
    statut: "ok",
    note: arrondi(note),
    poids,
    contribution: null,
    texte: `${parties.map((p) => p.texte).join(" ; ")}.`,
    source,
    date: [...(vol ?? []), ...(hy ?? [])].map((p) => p.date).sort().at(-1) ?? null,
  };
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
