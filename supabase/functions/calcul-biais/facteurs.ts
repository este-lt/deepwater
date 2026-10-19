// Calcul des facteurs du biais à partir de données déjà en base (aucun appel externe) :
// l'analyse des éléments de la liste « feux tricolores », aucune analyse technique (voir regles.ts).
// Fonctions pures : testées dans facteurs.test.ts. Chaque explication est écrite en
// français (texte) et en anglais (texte_en) : le site affiche celle de l'utilisateur.
import { estFerieNyse } from "../_shared/feries.ts";
import { type CleFacteur, type CleIndice, type Priorite, PRIORITES, REGLES_BIAIS } from "./regles.ts";

export interface Facteur {
  cle: CleFacteur;
  libelle: string;
  libelle_en: string;
  priorite: Priorite; // couleur de la liste : rouge, orange, vert, ou contexte (hors score)
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
  fed: ["Anticipations de la Fed", "Fed expectations"],
  macro: ["Statistiques face au consensus", "Data vs consensus"],
  taux: ["Obligations d'État (10 ans)", "Government bonds (10-year)"],
  dollar: ["Dollar et différentiel de taux", "Dollar and rate differential"],
  petrole: ["Pétrole (WTI)", "Oil (WTI)"],
  liquidite: ["Liquidité (M2, bilan de la Fed)", "Liquidity (M2, Fed balance sheet)"],
  cycle: ["Régime macroéconomique", "Macro regime"],
  risque: ["Sentiment risk-on / risk-off", "Risk-on / risk-off sentiment"],
  courbe: ["Courbe des taux", "Yield curve"],
  positionnement: ["Positionnement des institutionnels (COT)", "Institutional positioning (COT)"],
  conditions: ["Conditions financières", "Financial conditions"],
  publications: ["Publications depuis la dernière clôture", "Releases since the last close"],
};

const indisponible = (cle: CleFacteur, poids: number, texte: (l: L) => string, source: string): Facteur => ({
  cle, libelle: NOMS[cle][0], libelle_en: NOMS[cle][1], priorite: PRIORITES[cle], statut: "indisponible", note: null, poids, contribution: null,
  texte: texte("fr"), texte_en: texte("en"), source, date: null,
});

const disponible = (cle: CleFacteur, poids: number, note: number, texte: (l: L) => string, source: string, date: string | null): Facteur => ({
  cle, libelle: NOMS[cle][0], libelle_en: NOMS[cle][1], priorite: PRIORITES[cle], statut: "ok", note: arrondi(note), poids, contribution: null,
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

// Anticipations de la Fed : la révision sur 5 séances des taux à 1 et 2 ans (ce que le
// marché change dans ses anticipations). Le niveau face aux Fed funds et la dernière
// décision sont déjà dans les prix : affichés comme contexte, hors note.
export function facteurFed(
  indice: CleIndice, deuxAns: PointTaux[], fedFunds: PointTaux[], decisions: PointTaux[], aujourdhui: string, unAnSerie: PointTaux[] = [],
): Facteur {
  const r = REGLES_BIAIS.fed;
  const poids = REGLES_BIAIS.indices[indice].poids.fed;
  const source = "FRED (DGS1, DGS2, DFF), BRI";
  const lire = (s: PointTaux[]) => {
    const t = tri(s);
    const dernier = t.at(-1);
    const reference = t.at(-1 - r.seancesVariation);
    if (!dernier || joursEntre(dernier.date, aujourdhui) > r.ageMaxJours) return null;
    return { dernier, variation: reference ? dernier.taux - reference.taux : null };
  };
  const unAn = lire(unAnSerie);
  const deux = lire(deuxAns);
  const variations = [unAn, deux].flatMap((x) => (x && x.variation !== null ? [x.variation] : []));
  if (variations.length === 0) {
    return indisponible(
      "fed", poids,
      (l) => l === "fr" ? "Taux à 1 et 2 ans absents ou trop anciens : révision des anticipations inconnue." : "1- and 2-year yields missing or too old: change in expectations unknown.",
      source,
    );
  }
  const revision = variations.reduce((s, v) => s + v, 0) / variations.length;
  const note = -borner(revision / r.variationPleinePts);

  const ff = tri(fedFunds).at(-1);
  const ffFrais = ff && joursEntre(ff.date, aujourdhui) <= r.ageMaxJours ? ff : undefined;
  const niveaux = [unAn, deux].flatMap((x) => (x ? [x.dernier.taux] : []));
  const ecartNiveau = ffFrais ? niveaux.reduce((s, v) => s + v, 0) / niveaux.length - ffFrais.taux : null;
  const d = tri(decisions);
  const derniere = d.length >= 2 && joursEntre(d[d.length - 1].date, aujourdhui) <= r.joursDecisionRecente
    ? { ecart: d[d.length - 1].taux - d[d.length - 2].taux, date: d[d.length - 1].date }
    : null;

  const texte = (l: L) => {
    const fr = l === "fr";
    const sens = Math.abs(revision) < 0.03
      ? fr ? "Anticipations de la Fed stables" : "Fed expectations steady"
      : revision > 0
      ? fr ? "Le marché durcit ses anticipations de la Fed" : "The market is pricing a more hawkish Fed"
      : fr ? "Le marché assouplit ses anticipations de la Fed" : "The market is pricing a more dovish Fed";
    const variation = (x: { variation: number | null }) => (x.variation === null ? "" : ` (${pb(x.variation, l)})`);
    const taux = [
      ...(unAn ? [fr ? `taux à 1 an ${pc(unAn.dernier.taux, 2, l)}${variation(unAn)}` : `1-year ${pc(unAn.dernier.taux, 2, l)}${variation(unAn)}`] : []),
      ...(deux ? [fr ? `à 2 ans ${pc(deux.dernier.taux, 2, l)}${variation(deux)}` : `2-year ${pc(deux.dernier.taux, 2, l)}${variation(deux)}`] : []),
    ].join(", ");
    const parties = [
      fr
        ? `${sens} : ${taux.startsWith("à") ? `taux ${taux}` : taux} en ${r.seancesVariation} séances`
        : `${sens}: ${taux} over ${r.seancesVariation} sessions`,
    ];
    if (ecartNiveau !== null && ffFrais) {
      const etat = Math.abs(ecartNiveau) < 0.1
        ? fr ? "pas de changement anticipé" : "no change priced in"
        : ecartNiveau > 0
        ? fr ? "des hausses restent anticipées" : "hikes still priced in"
        : fr ? "des baisses restent anticipées" : "cuts still priced in";
      parties.push(fr
        ? `niveau ${pb(ecartNiveau, l)} face aux Fed funds (${pc(ffFrais.taux, 2, l)}), ${etat}`
        : `level ${pb(ecartNiveau, l)} vs Fed funds (${pc(ffFrais.taux, 2, l)}), ${etat}`);
    }
    if (derniere) {
      parties.push(fr
        ? `dernière décision : ${derniere.ecart > 0 ? "hausse" : "baisse"} de ${nf(Math.abs(derniere.ecart * 100), 0)} pb le ${dateCourte(derniere.date)}`
        : `last decision: ${derniere.ecart > 0 ? "hike" : "cut"} of ${nf(Math.abs(derniere.ecart * 100), 0, l)} bp on ${dateCourte(derniere.date, l)}`);
    }
    const t = parties.join(fr ? " ; " : "; ");
    return t.endsWith(".") ? t : `${t}.`;
  };
  return disponible("fed", poids, note, texte, source, (deux ?? unAn)!.dernier.date);
}

// Obligations d'État : variation sur 5 séances du 10 ans américain, du taux réel à 10 ans et
// du taux européen AAA à 10 ans (courbe de la BCE, proche du Bund). Des rendements qui
// montent renchérissent l'argent : baissier.
export function facteurTaux(indice: CleIndice, nominal: PointTaux[], reel: PointTaux[], aujourdhui: string, source: string, bund: PointTaux[] = []): Facteur {
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
  const bu = lire(bund);
  if (!nom && !re && !bu) {
    return indisponible("taux", poids, (l) => l === "fr" ? `${r.libelle} : données absentes ou trop anciennes.` : `${r.libelle_en}: data missing or too old.`, source);
  }
  const parts = [
    ...(nom ? [{ v: nom.variation, part: r.partUs }] : []),
    ...(re ? [{ v: re.variation, part: r.partReel }] : []),
    ...(bu ? [{ v: bu.variation, part: r.partBund }] : []),
  ];
  const note = parts.reduce((s, x) => s - borner(x.v / r.variationPleinePts) * x.part, 0) / parts.reduce((s, x) => s + x.part, 0);
  const texte = (l: L) => {
    const fr = l === "fr";
    const v = (x: { dernier: PointTaux; variation: number }) => `${pc(x.dernier.taux, 2, l)} (${signe(x.variation)}${nf(Math.abs(x.variation), 2, l)} pt)`;
    const parties = [
      ...(nom ? [fr ? `${r.libelle} ${v(nom)} en ${r.seancesVariation} séances au ${dateCourte(nom.dernier.date)}` : `${r.libelle_en} ${v(nom)} over ${r.seancesVariation} sessions as of ${dateCourte(nom.dernier.date, l)}`] : []),
      ...(re ? [fr ? `taux réel à 10 ans ${v(re)}` : `10-year real yield ${v(re)}`] : []),
      ...(bu ? [fr ? `taux européen AAA à 10 ans, proche du Bund, ${v(bu)}` : `10-year euro AAA yield (Bund proxy) ${v(bu)}`] : []),
    ];
    const etat = note >= 0.25
      ? fr ? "détente des rendements, favorable aux actions" : "yields easing, supportive for equities"
      : note <= -0.25
      ? fr ? "tension sur les rendements, défavorable aux actions" : "yields rising, a headwind for equities"
      : fr ? "rendements stables" : "yields steady";
    const t = `${parties.join(fr ? " ; " : "; ")}${fr ? " : " : ": "}${etat}.`;
    return `${t.charAt(0).toUpperCase()}${t.slice(1)}`;
  };
  return disponible("taux", poids, note, texte, source, nom?.dernier.date ?? re?.dernier.date ?? bu?.dernier.date ?? null);
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

// Valeurs refuges (cours quotidiens) : or en dollars, USD/JPY, USD/CHF.
export interface Refuges {
  or?: PointTaux[];
  usdjpy?: PointTaux[];
  usdchf?: PointTaux[];
}

// Sentiment risk-on / risk-off : volatilité implicite (VIX), structure VIX / VIX3M, spread de
// crédit à haut rendement et demande de valeurs refuges (or, yen, franc suisse). Risk-off =
// baissier pour les actions.
export function facteurRisque(
  indice: CleIndice, vix: PointTaux[], vix3m: PointTaux[], aujourdhui: string, credit: PointTaux[] = [], refuges: Refuges = {},
): Facteur {
  const r = REGLES_BIAIS.risque;
  const poids = REGLES_BIAIS.indices[indice].poids.risque;
  const source = "FRED (VIXCLS, VXVCLS, spread haut rendement ICE BofA), or, USD/JPY, USD/CHF";
  const recente = (s: PointTaux[]) => {
    const t = tri(s);
    const dernier = t.at(-1);
    return dernier && joursEntre(dernier.date, aujourdhui) <= r.ageMaxJours ? t : null;
  };
  const parties: { note: number; part: number; texte: (l: L) => string }[] = [];

  const v = recente(vix);
  const refV = v?.at(-1 - r.seancesVariation);
  if (v && refV) {
    const dernier = v.at(-1)!;
    const annee = v.filter((p) => joursEntre(p.date, dernier.date) <= r.joursMediane).map((p) => p.taux).sort((a, b) => a - b);
    const mediane = annee[Math.floor(annee.length / 2)];
    const variation = dernier.taux - refV.taux;
    parties.push({
      note: -(0.5 * borner((dernier.taux - mediane) / r.ecartPleinVolPts) + 0.5 * borner(variation / r.variationPleineVolPts)),
      part: r.parts.volatilite,
      texte: (l) => l === "fr"
        ? `VIX à ${nf(dernier.taux, 2)} le ${dateCourte(dernier.date)} (médiane d'un an : ${nf(mediane, 2)}), ${signe(variation)}${nf(Math.abs(variation), 2)} pt en ${r.seancesVariation} séances`
        : `VIX at ${nf(dernier.taux, 2, l)} on ${dateCourte(dernier.date, l)} (one-year median: ${nf(mediane, 2, l)}), ${signe(variation)}${nf(Math.abs(variation), 2, l)} pt over ${r.seancesVariation} sessions`,
    });
  }
  // Structure par terme : VIX et VIX3M du même jour.
  const court = v?.at(-1);
  const long = court ? tri(vix3m).find((p) => p.date === court.date) : undefined;
  if (court && long && long.taux > 0) {
    const ratio = court.taux / long.taux;
    parties.push({
      note: -borner((ratio - r.structureNeutre) / r.structurePleine),
      part: r.parts.structure,
      texte: (l) => l === "fr"
        ? `VIX / VIX3M ${nf(ratio, 2)}${ratio > 1 ? " (structure inversée, stress immédiat)" : ""}`
        : `VIX / VIX3M ${nf(ratio, 2, l)}${ratio > 1 ? " (inverted structure, immediate stress)" : ""}`,
    });
  }
  const hy = recente(credit);
  const refHy = hy?.at(-1 - r.seancesVariation);
  if (hy && refHy) {
    const dernier = hy.at(-1)!;
    const variation = dernier.taux - refHy.taux;
    parties.push({
      note: -borner(variation / r.variationPleineCreditPts),
      part: r.parts.credit,
      texte: (l) => l === "fr"
        ? `spread haut rendement ${pc(dernier.taux, 2, l)} (${signe(variation)}${nf(Math.abs(variation), 2)} pt en ${r.seancesVariation} séances)`
        : `high-yield spread ${pc(dernier.taux, 2, l)} (${signe(variation)}${nf(Math.abs(variation), 2, l)} pt over ${r.seancesVariation} sessions)`,
    });
  }
  // Valeurs refuges : or en hausse, yen ou franc suisse en hausse face au dollar = demande de
  // refuge. Jours ouvrés seulement (l'or est aussi coté le week-end).
  const ouvre = (p: PointTaux) => ![0, 6].includes(new Date(jourUtc(p.date)).getUTCDay());
  const varPct = (s: PointTaux[] | undefined) => {
    const t = s ? recente(s.filter(ouvre)) : null;
    const ref = t?.at(-1 - r.seancesVariation);
    return t && ref && ref.taux > 0 ? (t.at(-1)!.taux / ref.taux - 1) * 100 : null;
  };
  const or = varPct(refuges.or);
  const yen = ((x) => (x === null ? null : -x))(varPct(refuges.usdjpy));
  const franc = ((x) => (x === null ? null : -x))(varPct(refuges.usdchf));
  const demandes = [
    ...(or !== null ? [borner(or / r.refugeOrPct)] : []),
    ...(yen !== null ? [borner(yen / r.refugeDevisePct)] : []),
    ...(franc !== null ? [borner(franc / r.refugeDevisePct)] : []),
  ];
  if (demandes.length) {
    const demande = demandes.reduce((s, x) => s + x, 0) / demandes.length;
    const pct = (x: number, l: L) => `${signe(x)}${nf(Math.abs(x), 1, l)}${l === "fr" ? " %" : "%"}`;
    parties.push({
      note: -demande,
      part: r.parts.refuges,
      texte: (l) => {
        const fr = l === "fr";
        const elements = [
          ...(or !== null ? [fr ? `or ${pct(or, l)}` : `gold ${pct(or, l)}`] : []),
          ...(yen !== null ? [fr ? `yen ${pct(yen, l)}` : `yen ${pct(yen, l)}`] : []),
          ...(franc !== null ? [fr ? `franc suisse ${pct(franc, l)}` : `Swiss franc ${pct(franc, l)}`] : []),
        ].join(", ");
        return fr ? `valeurs refuges en ${r.seancesVariation} séances : ${elements}` : `safe havens over ${r.seancesVariation} sessions: ${elements}`;
      },
    });
  }
  if (parties.length === 0) {
    return indisponible("risque", poids, (l) => l === "fr" ? "VIX, crédit et valeurs refuges absents ou trop anciens." : "VIX, credit and safe havens missing or too old.", source);
  }
  const note = parties.reduce((s, p) => s + p.note * p.part, 0) / parties.reduce((s, p) => s + p.part, 0);
  const texte = (l: L) => {
    const fr = l === "fr";
    const etat = note <= -0.25
      ? fr ? "risk-off, défavorable aux actions" : "risk-off, a headwind for equities"
      : note >= 0.25
      ? fr ? "risk-on, favorable aux actions" : "risk-on, supportive for equities"
      : fr ? "sentiment neutre" : "neutral sentiment";
    const t = `${parties.map((p) => p.texte(l)).join(fr ? " ; " : "; ")}${fr ? " : " : ": "}${etat}.`;
    return `${t.charAt(0).toUpperCase()}${t.slice(1)}`;
  };
  return disponible("risque", poids, note, texte, source, court?.date ?? hy?.at(-1)?.date ?? null);
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

// Dollar : indice large de la Fed (DXY) sur 20 séances et différentiel de taux à 10 ans
// États-Unis - zone euro AAA (proche du Bund). Un dollar qui monte pèse sur les actions
// (résultats des multinationales, conditions financières mondiales).
export function facteurDollar(indice: CleIndice, dxy: PointTaux[], aujourdhui: string, us10: PointTaux[] = [], bund: PointTaux[] = []): Facteur {
  const r = REGLES_BIAIS.dollar;
  const poids = REGLES_BIAIS.indices[indice].poids.dollar;
  const source = "FRED (DTWEXBGS, DGS10), BCE (courbe AAA zone euro)";
  const t = tri(dxy);
  const dernier = t.at(-1);
  const reference = t.at(-1 - r.seancesVariation);
  const variation = dernier && reference && reference.taux !== 0 && joursEntre(dernier.date, aujourdhui) <= r.ageMaxJours
    ? (dernier.taux / reference.taux - 1) * 100
    : null;
  // Écart États-Unis - zone euro à la même date (taux européen du jour ou des 5 jours précédents).
  const us = tri(us10);
  const bu = tri(bund);
  const ecartAu = (p: PointTaux | undefined) => {
    if (!p) return null;
    const b = auPlusTard(bu, p.date);
    return b && joursEntre(b.date, p.date) <= 5 ? p.taux - b.taux : null;
  };
  const usDernier = us.at(-1);
  const usFrais = usDernier && joursEntre(usDernier.date, aujourdhui) <= REGLES_BIAIS.taux.ageMaxJours ? usDernier : undefined;
  const ecart = ecartAu(usFrais);
  const ecartAvant = usFrais ? ecartAu(us.at(-1 - r.seancesVariation)) : null;
  const dEcart = ecart !== null && ecartAvant !== null ? ecart - ecartAvant : null;
  if (variation === null && dEcart === null) {
    return indisponible("dollar", poids, (l) => l === "fr" ? "Indice du dollar et taux à 10 ans absents ou trop anciens." : "Dollar index and 10-year yields missing or too old.", source);
  }
  const parts = [
    ...(variation !== null ? [{ note: -borner(variation / r.variationPleinePct), part: r.partDxy }] : []),
    ...(dEcart !== null ? [{ note: -borner(dEcart / r.ecartPleinPts), part: 1 - r.partDxy }] : []),
  ];
  const note = parts.reduce((s, p) => s + p.note * p.part, 0) / parts.reduce((s, p) => s + p.part, 0);
  const texte = (l: L) => {
    const fr = l === "fr";
    const parties = [
      ...(variation !== null && dernier
        ? [fr
          ? `Dollar (indice large de la Fed) à ${nf(dernier.taux, 2)} le ${dateCourte(dernier.date)}, ${signe(variation)}${nf(Math.abs(variation), 1)} % en ${r.seancesVariation} séances`
          : `Dollar (Fed broad index) at ${nf(dernier.taux, 2, l)} on ${dateCourte(dernier.date, l)}, ${signe(variation)}${nf(Math.abs(variation), 1, l)}% over ${r.seancesVariation} sessions`]
        : []),
      ...(ecart !== null && dEcart !== null
        ? [fr
          ? `écart de taux à 10 ans États-Unis − zone euro ${signe(ecart)}${nf(Math.abs(ecart), 2)} pt (${signe(dEcart)}${nf(Math.abs(dEcart), 2)} pt en ${r.seancesVariation} séances)`
          : `US − euro area 10-year spread ${signe(ecart)}${nf(Math.abs(ecart), 2, l)} pt (${signe(dEcart)}${nf(Math.abs(dEcart), 2, l)} pt over ${r.seancesVariation} sessions)`]
        : []),
    ];
    const etat = note <= -0.25
      ? fr ? "le dollar se renforce, défavorable aux actions" : "the dollar is strengthening, a headwind for equities"
      : note >= 0.25
      ? fr ? "le dollar faiblit, favorable aux actions" : "the dollar is weakening, supportive for equities"
      : fr ? "dollar stable" : "stable dollar";
    const t2 = `${parties.join(fr ? " ; " : "; ")}${fr ? " : " : ": "}${etat}.`;
    return `${t2.charAt(0).toUpperCase()}${t2.slice(1)}`;
  };
  return disponible("dollar", poids, note, texte, source, dernier?.date ?? usFrais?.date ?? null);
}

// Pétrole (WTI) sur 20 séances : une hausse nourrit l'inflation et pèse sur les marges.
export function facteurPetrole(indice: CleIndice, wti: PointTaux[], aujourdhui: string): Facteur {
  const r = REGLES_BIAIS.petrole;
  const poids = REGLES_BIAIS.indices[indice].poids.petrole;
  const source = "FRED (DCOILWTICO)";
  const t = tri(wti);
  const dernier = t.at(-1);
  const reference = t.at(-1 - r.seancesVariation);
  if (!dernier || !reference || reference.taux <= 0 || joursEntre(dernier.date, aujourdhui) > r.ageMaxJours) {
    return indisponible("petrole", poids, (l) => l === "fr" ? "Cours du pétrole absent ou trop ancien." : "Oil price missing or too old.", source);
  }
  const v = (dernier.taux / reference.taux - 1) * 100;
  const note = -borner(v / r.variationPleinePct);
  const texte = (l: L) => {
    const fr = l === "fr";
    const etat = Math.abs(v) < 3
      ? fr ? "pétrole stable" : "stable oil"
      : v > 0
      ? fr ? "hausse du pétrole, pression sur l'inflation et les marges" : "rising oil, pressure on inflation and margins"
      : fr ? "baisse du pétrole, détente sur l'inflation" : "falling oil, easing inflation pressure";
    return fr
      ? `Pétrole (WTI) à ${nf(dernier.taux, 2)} $ le ${dateCourte(dernier.date)}, ${signe(v)}${nf(Math.abs(v), 1)} % en ${r.seancesVariation} séances : ${etat}.`
      : `Oil (WTI) at $${nf(dernier.taux, 2, l)} on ${dateCourte(dernier.date, l)}, ${signe(v)}${nf(Math.abs(v), 1, l)}% over ${r.seancesVariation} sessions: ${etat}.`;
  };
  return disponible("petrole", poids, note, texte, source, dernier.date);
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
      // Bilan de la Fed sur la même période : QE (hausse nette) ou QT (baisse nette).
      const vb = (dernier.taux - reference.taux) / 1000;
      const programme = (l: L) =>
        Math.abs(vb) < r.bilanSeuilMd
          ? l === "fr" ? ", stable" : ", steady"
          : vb > 0
          ? l === "fr" ? ", en expansion (QE)" : ", expanding (QE)"
          : l === "fr" ? ", en réduction (QT)" : ", shrinking (QT)";
      parties.push({
        note: borner(v / r.variationPleineMd),
        part: r.partNette,
        fr: `liquidité nette ${nf(maintenant, 0)} Md$ au ${dateCourte(dernier.date)} (${signe(v)}${nf(Math.abs(v), 0)} Md$ en ${r.semaines} semaines), bilan de la Fed ${signe(vb)}${nf(Math.abs(vb), 0)} Md$${programme("fr")}`,
        en: `net liquidity $${nf(maintenant, 0, "en")}bn as of ${dateCourte(dernier.date, "en")} (${signe(v)}$${nf(Math.abs(v), 0, "en")}bn over ${r.semaines} weeks), Fed balance sheet ${signe(vb)}$${nf(Math.abs(vb), 0, "en")}bn${programme("en")}`,
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
  gerants_long?: number;
  gerants_court?: number;
}

// Positionnement (rapport COT) : variation sur 4 semaines de la position nette des gérants
// d'actifs (institutionnels), en contrats, rapportée à l'intérêt ouvert actuel (l'intérêt
// ouvert gonfle pendant le roulement trimestriel : comparer deux parts fausserait la lecture).
// Des institutionnels qui renforcent leurs achats = haussier. Les fonds à effet de levier
// sont cités.
export function facteurPositionnement(indice: CleIndice, cot: PositionCot[], aujourdhui: string): Facteur {
  const r = REGLES_BIAIS.positionnement;
  const poids = REGLES_BIAIS.indices[indice].poids.positionnement;
  const source = "CFTC (Traders in Financial Futures)";
  const serie = cot
    .filter((p) => p.interet_ouvert > 0 && p.date <= aujourdhui && Number.isFinite(p.gerants_long) && Number.isFinite(p.gerants_court))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((p) => ({
      date: p.date, oi: p.interet_ouvert, net: p.gerants_long! - p.gerants_court!,
      gerants: (p.gerants_long! - p.gerants_court!) / p.interet_ouvert, fonds: (p.fonds_long - p.fonds_court) / p.interet_ouvert,
    }));
  const dernier = serie.at(-1);
  const reference = serie.at(-1 - r.semainesVariation);
  if (!dernier || !reference || joursEntre(dernier.date, aujourdhui) > r.ageMaxJours) {
    return indisponible("positionnement", poids, (l) => l === "fr" ? "Rapport COT absent, trop ancien ou historique trop court." : "COT report missing, too old or history too short.", source);
  }
  const variation = (dernier.net - reference.net) / dernier.oi;
  const note = borner(variation / r.variationPleine);
  const texte = (l: L) => {
    const fr = l === "fr";
    const pts = (x: number) => `${signe(x)}${nf(Math.abs(x * 100), 1, l)}`;
    const lecture = Math.abs(variation) < 0.005
      ? fr ? "positionnement des institutionnels stable" : "institutional positioning steady"
      : variation > 0
      ? fr ? "les institutionnels renforcent leurs achats" : "institutions are adding to longs"
      : fr ? "les institutionnels allègent leurs positions" : "institutions are cutting exposure";
    return fr
      ? `Gérants d'actifs nets ${pts(dernier.gerants)} % de l'intérêt ouvert au ${dateCourte(dernier.date)} (${pts(variation)} pt en ${r.semainesVariation} semaines) : ${lecture} ; fonds à effet de levier nets ${pts(dernier.fonds)} %.`
      : `Asset managers net ${pts(dernier.gerants)}% of open interest as of ${dateCourte(dernier.date, l)} (${pts(variation)} pt over ${r.semainesVariation} weeks): ${lecture}; leveraged funds net ${pts(dernier.fonds)}%.`;
  };
  return disponible("positionnement", poids, note, texte, source, dernier.date);
}

// Chiffre publié face au consensus, toutes économies (fil instantané).
export interface PublicationConsensus {
  devise: string | null;
  libelle: string;
  publie: number;
  prevision: number;
  unite: string | null;
  surprise: number; // -1 à +1, positif = au-dessus du consensus
  instant: string;
}

// Publications depuis la dernière clôture de New York : contexte de la séance (poids nul,
// aucun effet mesuré à ce jour), les chiffres les plus surprenants, toutes économies.
export function facteurPublications(indice: CleIndice, publications: PublicationConsensus[], depuis: string, maintenant: string): Facteur {
  const poids = REGLES_BIAIS.indices[indice].poids.publications;
  const source = "Consensus (FinancialJuice, InvestingLive)";
  const retenues = publications.filter((p) => p.instant >= depuis && p.instant <= maintenant && Number.isFinite(p.surprise));
  const principales = [...retenues].sort((a, b) => Math.abs(b.surprise) - Math.abs(a.surprise)).slice(0, 4);
  const texte = (l: L) => {
    const fr = l === "fr";
    if (principales.length === 0) {
      return fr ? "Aucun chiffre avec consensus publié depuis la dernière clôture de New York." : "No release with consensus since the last New York close.";
    }
    const parties = principales.map((p) => {
      const s = Math.round(p.surprise * 100);
      const ecart = `${s > 0 ? "+" : s < 0 ? "−" : ""}${Math.abs(s)}`;
      return fr
        ? `${p.devise ? `${p.devise} ` : ""}${p.libelle} ${valeurConsensus(p.publie, p.unite, l)} contre ${valeurConsensus(p.prevision, p.unite, l)} attendu (surprise ${ecart})`
        : `${p.devise ? `${p.devise} ` : ""}${p.libelle} ${valeurConsensus(p.publie, p.unite, l)} vs ${valeurConsensus(p.prevision, p.unite, l)} expected (surprise ${ecart})`;
    });
    const debut = fr
      ? `${retenues.length} chiffre${retenues.length > 1 ? "s" : ""} publié${retenues.length > 1 ? "s" : ""} depuis la dernière clôture de New York : `
      : `${retenues.length} release${retenues.length > 1 ? "s" : ""} since the last New York close: `;
    return `${debut}${parties.join(fr ? " ; " : "; ")}.`;
  };
  return disponible("publications", poids, 0, texte, source, principales[0]?.instant.slice(0, 10) ?? null);
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
    .filter((f) => f.statut === "ok" && f.poids > 0)
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
