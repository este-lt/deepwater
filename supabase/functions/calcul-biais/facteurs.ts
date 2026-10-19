// Calcul des facteurs du biais à partir de données déjà en base (aucun appel externe) :
// uniquement des données concrètes, aucune analyse technique (voir regles.ts).
// Fonctions pures : testées dans facteurs.test.ts. Chaque explication est écrite en
// français (texte) et en anglais (texte_en) : le site affiche celle de l'utilisateur.
import { estFerieNyse } from "../_shared/feries.ts";
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

// Série macro brute (niveaux FRED : indices de prix, emplois, PIB en volume, taux de chômage).
export interface PointMacro {
  date: string;
  valeur: number;
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
  cycle: ["Régime macroéconomique", "Macro regime"],
  liquidite: ["Liquidité de la Fed", "Fed liquidity"],
  positionnement: ["Positionnement (COT)", "Positioning (COT)"],
  dollar: ["Dollar (DXY)", "Dollar (DXY)"],
  courbe: ["Courbe des taux", "Yield curve"],
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
// tant que la clôture de 16 h n'est pas passée, sinon la suivante. Week-ends et jours
// fériés de la Bourse de New York sautés.
export function seanceVisee(maintenant: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", weekday: "short",
    }).formatToParts(maintenant).map((x) => [x.type, x.value]),
  );
  let jour = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day));
  const ouvert = (t: number) => {
    const s = new Date(t).getUTCDay();
    return s !== 0 && s !== 6 && !estFerieNyse(new Date(t).toISOString().slice(0, 10));
  };
  if (!ouvert(jour) || Number(p.hour) >= 16) jour += 86_400_000;
  while (!ouvert(jour)) jour += 86_400_000;
  return new Date(jour).toISOString().slice(0, 10);
}

// --- Facteurs -----------------------------------------------------------------

// Points triés par date ; une valeur non numérique (NaN, infini) est ignorée.
const tri = (s: PointTaux[]) => s.filter((p) => Number.isFinite(p.taux)).sort((a, b) => a.date.localeCompare(b.date));
const pb = (v: number, l: L) => `${signe(v)}${nf(Math.abs(v * 100), 0, l)} ${l === "fr" ? "pb" : "bp"}`;

// Politique de la Fed : anticipation du marché (taux à 1 an et à 2 ans contre taux effectif
// des Fed funds) et sens de la dernière décision (changements du taux directeur, BRI).
export function facteurFed(
  indice: CleIndice, deuxAns: PointTaux[], fedFunds: PointTaux[], decisions: PointTaux[], aujourdhui: string, unAnSerie: PointTaux[] = [],
): Facteur {
  const r = REGLES_BIAIS.fed;
  const poids = REGLES_BIAIS.indices[indice].poids.fed;
  const source = "FRED (DGS1, DGS2, DFF), BRI";
  const frais = (p: PointTaux | undefined) => p && joursEntre(p.date, aujourdhui) <= r.ageMaxJours ? p : undefined;
  const deux = frais(tri(deuxAns).at(-1));
  const unAn = frais(tri(unAnSerie).at(-1));
  const ff = frais(tri(fedFunds).at(-1));
  const ecarts = ff ? [deux, unAn].flatMap((p) => (p ? [p.taux - ff.taux] : [])) : [];
  const anticipation = ff && (deux || unAn)
    ? { ecart: ecarts.reduce((s, e) => s + e, 0) / ecarts.length, deux, unAn, ff, date: (deux ?? unAn)!.date }
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
      const { ecart, deux, unAn, ff } = anticipation;
      const sens = Math.abs(ecart) < 0.1
        ? l === "fr" ? "pas de changement anticipé" : "no change priced in"
        : ecart > 0
        ? l === "fr" ? "le marché anticipe des hausses de taux" : "the market prices in rate hikes"
        : l === "fr" ? "le marché anticipe des baisses de taux" : "the market prices in rate cuts";
      const taux = [
        ...(unAn ? [l === "fr" ? `taux à 1 an ${pc(unAn.taux, 2, l)}` : `1-year yield ${pc(unAn.taux, 2, l)}`] : []),
        ...(deux ? [l === "fr" ? `à 2 ans ${pc(deux.taux, 2, l)}` : `2-year ${pc(deux.taux, 2, l)}`] : []),
      ].join(", ");
      const debut = taux.startsWith("à") ? `taux ${taux}` : taux;
      parties.push(l === "fr"
        ? `${debut} contre Fed funds ${pc(ff.taux, 2, l)} (écart moyen ${pb(ecart, l)}) : ${sens}`
        : `${debut} vs Fed funds ${pc(ff.taux, 2, l)} (average gap ${pb(ecart, l)}): ${sens}`);
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
  return disponible("fed", poids, note, texte, source, anticipation?.date ?? decision?.date ?? null);
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

// Chiffre américain publié face au consensus (fil instantané) ; sens : effet sur les actions.
export interface SurpriseConsensus {
  libelle: string;
  publie: number;
  prevision: number;
  unite: string | null;
  surprise: number; // -1 à +1, positif = au-dessus du consensus
  sens: number; // +1 : une hausse soutient les actions, -1 : elle pèse
  instant: string;
}

const valeurConsensus = (v: number, unite: string | null, l: L) =>
  unite === "%" ? pc(v, 1, l) : `${nf(v, Math.abs(v) < 10 ? 1 : 0, l)}${unite ? ` ${unite}` : ""}`;

export function facteurMacro(
  indice: CleIndice, publications: PublicationMacro[], aujourdhui: string, source: string, consensus: SurpriseConsensus[] = [],
): Facteur {
  const r = REGLES_BIAIS.macro;
  const poids = REGLES_BIAIS.indices[indice].poids.macro;
  const recentes = publications.filter(
    (p) => r.indicateurs[p.indicateur] && p.variation !== null && Number.isFinite(p.variation) && joursEntre(p.detecteeLe, aujourdhui) <= r.fenetreJours,
  );
  const surprises = consensus.filter((c) =>
    c.sens !== 0 && Number.isFinite(c.surprise) && joursEntre(c.instant.slice(0, 10), aujourdhui) <= r.fenetreConsensusJours && c.instant.slice(0, 10) <= aujourdhui
  );
  if (surprises.length) {
    const noteConsensus = surprises.reduce((s, c) => s + c.sens * c.surprise, 0) / surprises.length;
    const base = recentes.length ? facteurMacro(indice, publications, aujourdhui, source) : null;
    const note = base?.note != null ? r.partConsensus * noteConsensus + (1 - r.partConsensus) * base.note : noteConsensus;
    const principales = [...surprises].sort((a, b) => Math.abs(b.surprise) - Math.abs(a.surprise)).slice(0, 3);
    const texte = (l: L) => {
      const parties = principales.map((c) =>
        l === "fr"
          ? `${c.libelle} ${valeurConsensus(c.publie, c.unite, l)} contre ${valeurConsensus(c.prevision, c.unite, l)} attendu`
          : `${c.libelle} ${valeurConsensus(c.publie, c.unite, l)} vs ${valeurConsensus(c.prevision, c.unite, l)} expected`
      );
      const debut = l === "fr" ? `Face au consensus (${surprises.length} chiffres sur ${r.fenetreConsensusJours} jours) : ` : `Vs consensus (${surprises.length} releases over ${r.fenetreConsensusJours} days): `;
      const suite = base ? (l === "fr" ? ` Face à la publication précédente : ${base.texte}` : ` Vs prior release: ${base.texte_en}`) : "";
      return `${debut}${parties.join(l === "fr" ? " ; " : "; ")}.${suite}`;
    };
    return disponible("macro", poids, note, texte, `${source}, consensus (FinancialJuice, InvestingLive)`, principales[0].instant.slice(0, 10));
  }
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
      const valeur = p.valeur === null || !Number.isFinite(p.valeur) ? "—" : p.indicateur === "JOBLESS_CLAIMS" ? `${nf(p.valeur, 0, l)} k` : def.unite === "k" ? `${signe(p.valeur)}${nf(Math.abs(p.valeur), 0, l)} k` : pc(p.valeur, 1, l);
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
// Nasdaq-100), structure par terme (VIX contre VIX à 3 mois) et spread de crédit à haut
// rendement. Séries triées ou non.
export function facteurRisque(
  indice: CleIndice, volatilite: PointTaux[], credit: PointTaux[], aujourdhui: string, vix: PointTaux[] = [], vix3m: PointTaux[] = [],
): Facteur {
  const r = REGLES_BIAIS.risque;
  const poids = REGLES_BIAIS.indices[indice].poids.risque;
  const nomVol = REGLES_BIAIS.indices[indice].volatilite;
  const source = `FRED (${nomVol}, spread haut rendement ICE BofA)`;
  const recente = (s: PointTaux[]) => {
    const tries = tri(s);
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
  // Structure par terme : VIX et VIX3M du même jour.
  const court = recente(vix)?.at(-1);
  const long = court ? tri(vix3m).find((p) => p.date === court.date) : undefined;
  if (court && long && long.taux > 0) {
    const ratio = court.taux / long.taux;
    parties.push({
      note: -borner((ratio - r.structureNeutre) / r.structurePleine),
      part: r.partStructure,
      texte: (l) => {
        const etat = ratio > 1
          ? l === "fr" ? "structure inversée, stress immédiat" : "inverted structure, immediate stress"
          : l === "fr" ? "structure normale" : "normal structure";
        return l === "fr"
          ? `VIX / VIX3M ${nf(ratio, 2)} (${etat})`
          : `VIX / VIX3M ${nf(ratio, 2, l)} (${etat})`;
      },
    });
  }
  const hy = recente(credit);
  const refHy = hy?.at(-1 - r.seancesVariation);
  if (hy && refHy) {
    const dernier = hy.at(-1)!;
    const variation = dernier.taux - refHy.taux;
    parties.push({
      note: -borner(variation / r.variationPleineCreditPts),
      part: 1 - r.partVolatilite - r.partStructure,
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

// Dollar (indice large de la Fed) : fiche de corrélations, un dollar qui monte fait
// baisser le S&P 500.
export function facteurDollar(indice: CleIndice, dxy: PointTaux[], aujourdhui: string): Facteur {
  const r = REGLES_BIAIS.dollar;
  const poids = REGLES_BIAIS.indices[indice].poids.dollar;
  const source = "FRED (DTWEXBGS)";
  const t = tri(dxy);
  const dernier = t.at(-1);
  const reference = t.at(-1 - r.seancesVariation);
  if (!dernier || !reference || reference.taux === 0 || joursEntre(dernier.date, aujourdhui) > r.ageMaxJours) {
    return indisponible("dollar", poids, (l) => l === "fr" ? "Indice du dollar absent ou trop ancien." : "Dollar index missing or too old.", source);
  }
  const variation = (dernier.taux / reference.taux - 1) * 100;
  const note = -borner(variation / r.variationPleinePct);
  const texte = (l: L) => {
    const effet = Math.abs(variation) < 0.3
      ? l === "fr" ? "dollar stable, effet neutre sur les actions" : "stable dollar, neutral for equities"
      : variation > 0
      ? l === "fr" ? "un dollar qui monte pèse sur les actions" : "a rising dollar weighs on equities"
      : l === "fr" ? "un dollar qui baisse soutient les actions" : "a falling dollar supports equities";
    return l === "fr"
      ? `Dollar (indice large de la Fed) à ${nf(dernier.taux, 2)} le ${dateCourte(dernier.date)}, ${signe(variation)}${nf(Math.abs(variation), 1)} % en ${r.seancesVariation} séances : ${effet}.`
      : `Dollar (Fed broad index) at ${nf(dernier.taux, 2, l)} on ${dateCourte(dernier.date, l)}, ${signe(variation)}${nf(Math.abs(variation), 1, l)}% over ${r.seancesVariation} sessions: ${effet}.`;
  };
  return disponible("dollar", poids, note, texte, source, dernier.date);
}

// Courbe des taux : 10 ans moins 2 ans et 10 ans moins 3 mois, à la même date. Inversion
// (écart négatif) = signal de ralentissement ; pente normale légèrement favorable.
export function facteurCourbe(indice: CleIndice, troisMois: PointTaux[], deuxAns: PointTaux[], dixAns: PointTaux[], aujourdhui: string): Facteur {
  const r = REGLES_BIAIS.courbe;
  const poids = REGLES_BIAIS.indices[indice].poids.courbe;
  const source = "FRED (DGS3MO, DGS2, DGS10)";
  const d10 = tri(dixAns).at(-1);
  if (!d10 || joursEntre(d10.date, aujourdhui) > r.ageMaxJours) {
    return indisponible("courbe", poids, (l) => l === "fr" ? "Taux à 10 ans absent ou trop ancien." : "10-year yield missing or too old.", source);
  }
  const auMemeJour = (s: PointTaux[]) => tri(s).filter((p) => p.date <= d10.date && joursEntre(p.date, d10.date) <= 5).at(-1);
  const ecarts = [
    { nom: ["10 ans − 2 ans", "10y − 2y"], point: auMemeJour(deuxAns) },
    { nom: ["10 ans − 3 mois", "10y − 3m"], point: auMemeJour(troisMois) },
  ].flatMap((e) => (e.point ? [{ nom: e.nom, ecart: d10.taux - e.point.taux }] : []));
  if (ecarts.length === 0) {
    return indisponible("courbe", poids, (l) => l === "fr" ? "Taux courts absents : pente de la courbe inconnue." : "Short rates missing: curve slope unknown.", source);
  }
  const noteEcart = (e: number) => (e < 0 ? -borner(-e / r.inversionPleinePts) : r.plafondPositif * borner(e / r.pentePleinePts));
  const note = ecarts.reduce((s, e) => s + noteEcart(e.ecart), 0) / ecarts.length;
  const inversee = ecarts.some((e) => e.ecart < 0);
  const texte = (l: L) => {
    const i = l === "fr" ? 0 : 1;
    const liste = ecarts.map((e) => `${e.nom[i]} ${pb(e.ecart, l)}`).join(", ");
    const etat = inversee
      ? l === "fr" ? "courbe inversée, signal historique de ralentissement" : "inverted curve, a historical slowdown signal"
      : l === "fr" ? "pente normale" : "normal slope";
    return l === "fr" ? `Courbe des taux au ${dateCourte(d10.date)} : ${liste} ; ${etat}.` : `Yield curve as of ${dateCourte(d10.date, l)}: ${liste}; ${etat}.`;
  };
  return disponible("courbe", poids, note, texte, source, d10.date);
}

// "2026-09-01" moins n mois (séries mensuelles datées au 1er du mois).
const moisAvant = (date: string, n: number) => {
  const total = Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1 - n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}${date.slice(7)}`;
};

export interface SeriesCycle {
  emplois: PointMacro[]; // PAYEMS (milliers)
  chomage: PointMacro[]; // UNRATE (%)
  pib: PointMacro[]; // GDPC1 (volume, trimestriel)
  cpi: PointMacro[]; // CPIAUCNS (indice)
  pce: PointMacro[]; // PCEPILFE (indice, PCE sous-jacent)
}

type Morceau = { note: number; fr: string; en: string };

// Régime macroéconomique (croissance × inflation) : expansion, reflation, déflation,
// stagflation. Comparaisons par date (jamais par position) : un mois manquant rend la
// composante indisponible, il n'est pas remplacé.
export interface AnalyseRegime {
  regime: [string, string]; // français, anglais
  croissance: number;
  inflation: number;
  morceauxCroissance: Morceau[];
  morceauxInflation: Morceau[];
  date: string | null;
}

export function analyserRegime(s: SeriesCycle, petrole: PointTaux[], aujourdhui: string): AnalyseRegime | null {
  const r = REGLES_BIAIS.cycle;
  const serie = (p: PointMacro[]) => {
    const t = p.filter((x) => Number.isFinite(x.valeur)).sort((a, b) => a.date.localeCompare(b.date));
    return { dernier: t.at(-1), parDate: new Map(t.map((x) => [x.date, x.valeur])) };
  };
  const frais = (date: string | undefined, max: number) => date !== undefined && joursEntre(date, aujourdhui) <= max;
  const croissance: Morceau[] = [];
  const inflation: Morceau[] = [];

  const emp = serie(s.emplois);
  const empAvant = emp.dernier && emp.parDate.get(moisAvant(emp.dernier.date, 3));
  if (emp.dernier && empAvant !== undefined && frais(emp.dernier.date, r.ageMaxJoursMensuel)) {
    const moy = (emp.dernier.valeur - empAvant) / 3;
    croissance.push({
      note: borner((moy - r.emploisNeutresK) / r.emploisPleinsK),
      fr: `emplois ${signe(moy)}${nf(Math.abs(moy), 0)} k par mois sur 3 mois`,
      en: `payrolls ${signe(moy)}${nf(Math.abs(moy), 0, "en")}k a month over 3 months`,
    });
  }
  const ch = serie(s.chomage);
  const chAvant = ch.dernier && ch.parDate.get(moisAvant(ch.dernier.date, 3));
  if (ch.dernier && chAvant !== undefined && frais(ch.dernier.date, r.ageMaxJoursMensuel)) {
    const d = ch.dernier.valeur - chAvant;
    croissance.push({
      note: -borner(d / r.chomagePleinPts),
      fr: `chômage ${pc(ch.dernier.valeur, 1, "fr")} (${signe(d)}${nf(Math.abs(d), 1)} pt sur 3 mois)`,
      en: `unemployment ${pc(ch.dernier.valeur, 1, "en")} (${signe(d)}${nf(Math.abs(d), 1, "en")} pt over 3 months)`,
    });
  }
  const gdp = serie(s.pib);
  const gdpAvant = gdp.dernier && gdp.parDate.get(moisAvant(gdp.dernier.date, 3));
  if (gdp.dernier && gdpAvant !== undefined && gdpAvant > 0 && frais(gdp.dernier.date, r.ageMaxJoursTrimestriel)) {
    const annualise = ((gdp.dernier.valeur / gdpAvant) ** 4 - 1) * 100;
    croissance.push({
      note: borner((annualise - r.pibNeutre) / r.pibPlein),
      fr: `PIB ${signe(annualise)}${nf(Math.abs(annualise), 1)} % en rythme annualisé`,
      en: `GDP ${signe(annualise)}${nf(Math.abs(annualise), 1, "en")}% annualized`,
    });
  }
  const pce = serie(s.pce);
  const pceAvant = pce.dernier && pce.parDate.get(moisAvant(pce.dernier.date, 12));
  if (pce.dernier && pceAvant !== undefined && pceAvant > 0 && frais(pce.dernier.date, r.ageMaxJoursMensuel)) {
    const sur1an = (pce.dernier.valeur / pceAvant - 1) * 100;
    inflation.push({
      note: borner((sur1an - r.cibleInflation) / r.inflationPleinePts),
      fr: `PCE sous-jacent ${pc(sur1an, 1, "fr")} sur 1 an (cible de la Fed : 2 %)`,
      en: `core PCE ${pc(sur1an, 1, "en")} y/y (Fed target: 2%)`,
    });
  }
  const cpi = serie(s.cpi);
  if (cpi.dernier && frais(cpi.dernier.date, r.ageMaxJoursMensuel)) {
    const glissement = (date: string) => {
      const v = cpi.parDate.get(date);
      const a = cpi.parDate.get(moisAvant(date, 12));
      return v !== undefined && a !== undefined && a > 0 ? (v / a - 1) * 100 : null;
    };
    const maintenant = glissement(cpi.dernier.date);
    const ilYa3 = glissement(moisAvant(cpi.dernier.date, 3));
    if (maintenant !== null && ilYa3 !== null) {
      const d = maintenant - ilYa3;
      inflation.push({
        note: borner(d / r.tendanceCpiPleinePts),
        fr: `CPI ${pc(maintenant, 1, "fr")} sur 1 an (${signe(d)}${nf(Math.abs(d), 1)} pt en 3 mois)`,
        en: `CPI ${pc(maintenant, 1, "en")} y/y (${signe(d)}${nf(Math.abs(d), 1, "en")} pt in 3 months)`,
      });
    }
  }
  const p = tri(petrole);
  const pDernier = p.at(-1);
  const pRef = p.at(-1 - r.petroleSeances);
  if (pDernier && pRef && pRef.taux > 0 && frais(pDernier.date, r.ageMaxJoursPetrole)) {
    const v = (pDernier.taux / pRef.taux - 1) * 100;
    inflation.push({
      note: borner(v / r.petrolePleinPct),
      fr: `pétrole ${signe(v)}${nf(Math.abs(v), 0)} % sur 3 mois`,
      en: `oil ${signe(v)}${nf(Math.abs(v), 0, "en")}% over 3 months`,
    });
  }

  if (croissance.length === 0 || inflation.length === 0) return null;
  const c = croissance.reduce((a, m) => a + m.note, 0) / croissance.length;
  const i = inflation.reduce((a, m) => a + m.note, 0) / inflation.length;
  const regime: [string, string] = c >= 0 ? (i < 0 ? ["expansion", "expansion"] : ["reflation", "reflation"]) : i < 0 ? ["déflation", "deflation"] : ["stagflation", "stagflation"];
  const dates = [emp.dernier?.date, ch.dernier?.date, cpi.dernier?.date, pce.dernier?.date].filter((x): x is string => !!x).sort();
  return { regime, croissance: c, inflation: i, morceauxCroissance: croissance, morceauxInflation: inflation, date: dates.at(-1) ?? null };
}

export function facteurRegimeMacro(indice: CleIndice, s: SeriesCycle, petrole: PointTaux[], aujourdhui: string): Facteur {
  const r = REGLES_BIAIS.cycle;
  const poids = REGLES_BIAIS.indices[indice].poids.cycle;
  const source = "FRED (BLS, BEA, EIA)";
  const a = analyserRegime(s, petrole, aujourdhui);
  if (!a) {
    return indisponible(
      "cycle", poids,
      (l) => l === "fr" ? "Croissance ou inflation américaine indisponible : régime macro inconnu." : "US growth or inflation unavailable: macro regime unknown.",
      source,
    );
  }
  const { croissance: c, inflation: i, regime } = a;
  const note = borner(r.partCroissance * c - (1 - r.partCroissance) * i);
  const texte = (l: L) => {
    const k = l === "fr" ? 0 : 1;
    const d = (m: Morceau[]) => m.map((x) => (l === "fr" ? x.fr : x.en)).join(", ");
    return l === "fr"
      ? `Régime macro : ${regime[k]} (croissance ${signe(c)}${nf(Math.abs(c), 2)}, inflation ${signe(i)}${nf(Math.abs(i), 2)}) ; ${d(a.morceauxCroissance)} ; ${d(a.morceauxInflation)}.`
      : `Macro regime: ${regime[k]} (growth ${signe(c)}${nf(Math.abs(c), 2, l)}, inflation ${signe(i)}${nf(Math.abs(i), 2, l)}); ${d(a.morceauxCroissance)}; ${d(a.morceauxInflation)}.`;
  };
  return disponible("cycle", poids, note, texte, source, a.date);
}

// Dernier point d'une série à une date donnée ou avant.
const auPlusTard = (s: PointTaux[], date: string) => {
  let dernier: PointTaux | undefined;
  for (const p of s) if (p.date <= date) dernier = p;
  return dernier;
};

// Liquidité de la Fed : liquidité nette = bilan (millions $) - compte du Trésor (millions $)
// - prises en pension inversées (milliards $), en milliards ; variation sur 4 semaines, et
// croissance de M2 sur 1 an. Plus de liquidité = haussier.
export function facteurLiquidite(indice: CleIndice, bilan: PointTaux[], tga: PointTaux[], rrp: PointTaux[], m2: PointTaux[], aujourdhui: string): Facteur {
  const r = REGLES_BIAIS.liquidite;
  const poids = REGLES_BIAIS.indices[indice].poids.liquidite;
  const source = "FRED (WALCL, WTREGEN, RRPONTSYD, M2SL)";
  const b = tri(bilan);
  const t = tri(tga);
  const rr = tri(rrp);
  const nette = (date: string) => {
    const pb = auPlusTard(b, date);
    const pt = auPlusTard(t, date);
    const pr = auPlusTard(rr, date);
    return pb && pt && pr ? pb.taux / 1000 - pt.taux / 1000 - pr.taux : null;
  };
  const dernier = b.at(-1);
  const reference = b.at(-1 - r.semaines);
  const parties: { note: number; part: number; fr: string; en: string }[] = [];
  if (dernier && reference && joursEntre(dernier.date, aujourdhui) <= r.ageMaxJours) {
    const maintenant = nette(dernier.date);
    const avant = nette(reference.date);
    if (maintenant !== null && avant !== null) {
      const v = maintenant - avant;
      parties.push({
        note: borner(v / r.variationPleineMd),
        part: r.partNette,
        fr: `liquidité nette ${nf(maintenant, 0)} Md$ au ${dateCourte(dernier.date)} (${signe(v)}${nf(Math.abs(v), 0)} Md$ en ${r.semaines} semaines)`,
        en: `net liquidity $${nf(maintenant, 0, "en")}bn as of ${dateCourte(dernier.date, "en")} (${signe(v)}$${nf(Math.abs(v), 0, "en")}bn over ${r.semaines} weeks)`,
      });
    }
  }
  const m = tri(m2);
  const mDernier = m.at(-1);
  if (mDernier && joursEntre(mDernier.date, aujourdhui) <= r.ageMaxJoursM2) {
    const a = m.find((p) => p.date === moisAvant(mDernier.date, 12));
    if (a && a.taux > 0) {
      const sur1an = (mDernier.taux / a.taux - 1) * 100;
      parties.push({
        note: borner((sur1an - r.m2Neutre) / r.m2Plein),
        part: 1 - r.partNette,
        fr: `M2 ${signe(sur1an)}${nf(Math.abs(sur1an), 1)} % sur 1 an`,
        en: `M2 ${signe(sur1an)}${nf(Math.abs(sur1an), 1, "en")}% y/y`,
      });
    }
  }
  if (parties.length === 0) {
    return indisponible("liquidite", poids, (l) => l === "fr" ? "Bilan de la Fed, compte du Trésor ou M2 absents ou trop anciens." : "Fed balance sheet, TGA or M2 missing or too old.", source);
  }
  const note = parties.reduce((s, p) => s + p.note * p.part, 0) / parties.reduce((s, p) => s + p.part, 0);
  return disponible(
    "liquidite", poids, note,
    (l) => {
      const t2 = parties.map((p) => (l === "fr" ? p.fr : p.en)).join(l === "fr" ? " ; " : "; ");
      return `${t2.charAt(0).toUpperCase()}${t2.slice(1)}.`;
    },
    source, dernier?.date ?? mDernier?.date ?? null,
  );
}

// Position COT hebdomadaire d'un contrat à terme.
export interface PositionCot {
  date: string;
  interet_ouvert: number;
  fonds_long: number;
  fonds_court: number;
}

// Positionnement (rapport COT) : position nette des fonds à effet de levier en part de
// l'intérêt ouvert, rangée parmi ses 3 dernières années (centile). Lecture contrarienne.
export function facteurPositionnement(indice: CleIndice, cot: PositionCot[], aujourdhui: string): Facteur {
  const r = REGLES_BIAIS.positionnement;
  const poids = REGLES_BIAIS.indices[indice].poids.positionnement;
  const source = "CFTC (Traders in Financial Futures)";
  const serie = cot
    .filter((p) => p.interet_ouvert > 0 && p.date <= aujourdhui)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-r.semainesHistorique)
    .map((p) => ({ date: p.date, net: (p.fonds_long - p.fonds_court) / p.interet_ouvert }));
  const dernier = serie.at(-1);
  if (!dernier || serie.length < 26 || joursEntre(dernier.date, aujourdhui) > r.ageMaxJours) {
    return indisponible("positionnement", poids, (l) => l === "fr" ? "Rapport COT absent, trop ancien ou historique trop court." : "COT report missing, too old or history too short.", source);
  }
  const centile = serie.filter((p) => p.net <= dernier.net).length / serie.length;
  const note = -borner((centile - 0.5) / r.ecartPlein);
  const texte = (l: L) => {
    const lecture = centile >= 0.8
      ? l === "fr" ? "positionnement acheteur extrême, fragile" : "extreme long positioning, fragile"
      : centile <= 0.2
      ? l === "fr" ? "positionnement vendeur extrême, propice à un rachat" : "extreme short positioning, prone to short covering"
      : l === "fr" ? "positionnement dans la norme" : "positioning within the norm";
    return l === "fr"
      ? `Fonds à effet de levier nets ${signe(dernier.net)}${nf(Math.abs(dernier.net * 100), 1)} % de l'intérêt ouvert au ${dateCourte(dernier.date)}, centile ${nf(centile * 100, 0)} sur ${Math.round(serie.length / 52)} ans : ${lecture}.`
      : `Leveraged funds net ${signe(dernier.net)}${nf(Math.abs(dernier.net * 100), 1, l)}% of open interest as of ${dateCourte(dernier.date, l)}, ${nf(centile * 100, 0, l)}th percentile over ${Math.round(serie.length / 52)} years: ${lecture}.`;
  };
  return disponible("positionnement", poids, note, texte, source, dernier.date);
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
