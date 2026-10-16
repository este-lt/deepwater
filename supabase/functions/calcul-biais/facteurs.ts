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

export interface TransactionInitie {
  entreprise: string;
  code: string;
  montant: number | null;
  date_depot: string;
}

export interface MouvementInstitution {
  entreprise: string;
  variation: number;
  valeur: number | null;
  parts: number;
  date_depot: string;
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
    const valeur = p.valeur === null ? "—" : def.unite === "k" ? `${signe(p.valeur)}${nf(Math.abs(p.valeur), 0)} k` : `${nf(p.valeur, 1)} %`;
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

export function facteurFlux(
  indice: CleIndice,
  inities: TransactionInitie[],
  institutions: MouvementInstitution[],
  aujourdhui: string,
): Facteur {
  const r = REGLES_BIAIS.flux;
  const poids = REGLES_BIAIS.indices[indice].poids.flux;
  const filtre = REGLES_BIAIS.indices[indice].entreprises;
  const garde = (e: string) => filtre === null || filtre.includes(e);
  const nom = "Flux initiés et institutions";
  const source = "SEC EDGAR (formulaires 4 et 13F)";

  // Initiés : flux net (achats - ventes) par semaine glissante de dépôt.
  const semaines = new Array(r.semainesReference + 1).fill(0);
  let vu = false;
  for (const t of inities) {
    if (!garde(t.entreprise) || t.montant === null || (t.code !== "P" && t.code !== "S")) continue;
    const age = joursEntre(t.date_depot, aujourdhui);
    if (age < 0) continue;
    const k = Math.floor(age / r.joursRecents);
    if (k > r.semainesReference) continue;
    semaines[k] += t.code === "P" ? t.montant : -t.montant;
    vu = true;
  }
  const recent = semaines[0];
  const reference = semaines.slice(1);
  const moyenne = reference.reduce((s, v) => s + v, 0) / reference.length;
  const ecartType = Math.sqrt(reference.reduce((s, v) => s + (v - moyenne) ** 2, 0) / reference.length);
  const sens = (v: number) => (v < 0 ? "ventes nettes" : "achats nets");
  let noteInities: number | null = null;
  let texteInities = "Initiés : aucune transaction sur le marché déposée sur la période.";
  if (vu && ecartType > 0) {
    noteInities = borner((recent - moyenne) / ecartType / r.zPlein);
    texteInities = `Initiés : ${recent === 0 ? "aucun achat ni vente" : `${sens(recent)} de ${montantCourt(recent)}`} dans les formulaires déposés en ${r.joursRecents} jours, contre ${sens(moyenne)} de ${montantCourt(moyenne)} par semaine en moyenne sur ${r.semainesReference} semaines`;
  }

  // Institutions : variation nette des titres détenus dans les 13F déposés récemment.
  const recents13f = institutions.filter(
    (m) => garde(m.entreprise) && m.parts > 0 && m.valeur !== null && joursEntre(m.date_depot, aujourdhui) < r.joursRecents,
  );
  let noteInstitutions: number | null = null;
  let texteInstitutions = `aucune déclaration 13F déposée en ${r.joursRecents} jours`;
  if (recents13f.length > 0) {
    const valeurTotale = recents13f.reduce((s, m) => s + m.valeur!, 0);
    const valeurVariation = recents13f.reduce((s, m) => s + m.variation * (m.valeur! / m.parts), 0);
    // Variation rapportée à la position du trimestre précédent (nouvelle position entière : +100 %).
    const avant = valeurTotale - valeurVariation;
    const pct = avant > 0 ? (valeurVariation / avant) * 100 : 100;
    noteInstitutions = borner(pct / r.variationPleineInstitutionsPct);
    texteInstitutions = `13F déposés en ${r.joursRecents} jours : ${signe(pct)}${nf(Math.abs(pct), 1)} % de titres détenus (${recents13f.length} lignes)`;
  }

  const parties = [
    noteInities === null ? null : { note: noteInities, part: r.partInities },
    noteInstitutions === null ? null : { note: noteInstitutions, part: 1 - r.partInities },
  ].filter((x): x is { note: number; part: number } => x !== null);
  if (parties.length === 0) return indisponible("flux", nom, poids, `${texteInities} ; ${texteInstitutions}.`, source);
  const note = parties.reduce((s, p) => s + p.note * p.part, 0) / parties.reduce((s, p) => s + p.part, 0);
  return {
    cle: "flux",
    libelle: nom,
    statut: "ok",
    note: arrondi(note),
    poids,
    contribution: null,
    texte: `${texteInities} ; ${texteInstitutions}.`,
    source,
    date: aujourdhui,
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
