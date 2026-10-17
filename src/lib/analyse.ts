// Analyses par règles, calculées à partir des données déjà en base (aucun appel externe) :
// régime risk-on / risk-off, corrélations entre actifs, force des 8 grandes devises et
// paires classées par confluence. Scoring automatique, pas un conseil en investissement.
// Fonctions pures (aucune dépendance) : testées par supabase/../analyse.test.ts.

export type Serie = { date: string; cloture: number }[];
export type Devise = "USD" | "EUR" | "GBP" | "JPY" | "CHF" | "CAD" | "AUD" | "NZD";
export const DEVISES: Devise[] = ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD"];

const borner = (v: number) => Math.max(-1, Math.min(1, v));
const moyenne = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);

// Variation sur n séances (en %, ou en points pour un taux / un indice de volatilité).
export function variation(serie: Serie, n: number, mode: "pct" | "pts" = "pct"): number | null {
  if (serie.length <= n) return null;
  const fin = serie[serie.length - 1].cloture;
  const debut = serie[serie.length - 1 - n].cloture;
  if (mode === "pts") return fin - debut;
  return debut === 0 ? null : (fin / debut - 1) * 100;
}

// Produit de deux séries aux dates communes (croisé AUD/JPY = AUD/USD × USD/JPY).
export function produit(a: Serie, b: Serie): Serie {
  const parDate = new Map(b.map((p) => [p.date, p.cloture]));
  return a.flatMap((p) => (parDate.has(p.date) ? [{ date: p.date, cloture: p.cloture * parDate.get(p.date)! }] : []));
}

// ---------------------------------------------------------------------------- Régime

export interface Composante {
  cle: "actions" | "volatilite" | "credit" | "audjpy" | "franc" | "or";
  valeur: number | null; // variation sur 5 séances
  unite: "pct" | "pts" | "pb";
  note: number | null; // -1 risk-off … +1 risk-on
  poids: number;
}

export interface Regime {
  score: number | null;
  etat: "risk-on" | "risk-off" | "neutre" | "indisponible";
  composantes: Composante[];
  date: string | null;
}

export const SEUIL_REGIME = 0.25;

export function calculerRegime(s: Record<string, Serie>): Regime {
  const n = 5;
  const v = (sym: string, mode: "pct" | "pts" = "pct") => variation(s[sym] ?? [], n, mode);
  const audjpy = produit(s.AUDUSD ?? [], s.USDJPY ?? []);
  const hy = v("HY", "pts");
  const brutes: [Composante["cle"], number | null, Composante["unite"], (x: number) => number, number][] = [
    ["actions", v("SPX"), "pct", (x) => x / 3, 0.25],
    ["volatilite", v("VIX", "pts"), "pts", (x) => -x / 4, 0.2],
    ["credit", hy === null ? null : hy * 100, "pb", (x) => -x / 30, 0.15],
    ["audjpy", variation(audjpy, n), "pct", (x) => x / 2, 0.2],
    ["franc", v("USDCHF"), "pct", (x) => x / 1.5, 0.1],
    ["or", v("XAU"), "pct", (x) => -x / 3, 0.1],
  ];
  const composantes = brutes.map(([cle, valeur, unite, echelle, poids]) => ({
    cle, valeur, unite, poids, note: valeur === null ? null : borner(echelle(valeur)),
  }));
  const valides = composantes.filter((c) => c.note !== null);
  const poids = valides.reduce((a, c) => a + c.poids, 0);
  const date = s.SPX?.at(-1)?.date ?? null;
  if (poids < 0.5) return { score: null, etat: "indisponible", composantes, date };
  const score = valides.reduce((a, c) => a + c.note! * c.poids, 0) / poids;
  return { score, etat: score >= SEUIL_REGIME ? "risk-on" : score <= -SEUIL_REGIME ? "risk-off" : "neutre", composantes, date };
}

// ---------------------------------------------------------------------------- Corrélations

// Rendements quotidiens (log) ou variations (taux, volatilité), indexés par date.
function rendements(serie: Serie, mode: "pct" | "pts"): Map<string, number> {
  const r = new Map<string, number>();
  for (let i = 1; i < serie.length; i++) {
    const a = serie[i - 1].cloture;
    const b = serie[i].cloture;
    if (mode === "pts") r.set(serie[i].date, b - a);
    else if (a > 0 && b > 0) r.set(serie[i].date, Math.log(b / a));
  }
  return r;
}

export function correlation(x: number[], y: number[]): number | null {
  if (x.length < 10 || x.length !== y.length) return null;
  const mx = moyenne(x);
  const my = moyenne(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxx === 0 || syy === 0 ? null : sxy / Math.sqrt(sxx * syy);
}

export interface Actif {
  symbole: string;
  mode: "pct" | "pts";
}

// Corrélation de chaque paire d'actifs sur les n derniers rendements communs.
export function matriceCorrelations(s: Record<string, Serie>, actifs: Actif[], n: number): (number | null)[][] {
  const r = actifs.map((a) => rendements(s[a.symbole] ?? [], a.mode));
  return actifs.map((_, i) =>
    actifs.map((__, j) => {
      if (i === j) return 1;
      const dates = [...r[i].keys()].filter((d) => r[j].has(d)).sort().slice(-n);
      if (dates.length < Math.min(n, 15)) return null;
      return correlation(dates.map((d) => r[i].get(d)!), dates.map((d) => r[j].get(d)!));
    })
  );
}

// Couverture des actions : actif détenable le plus négativement corrélé au S&P 500 sur
// 60 séances (le VIX, qui ne se détient pas directement, n'est pas proposé).
export interface Couverture {
  cle: "or" | "yen" | "franc" | "obligations";
  correlation: number;
}

export function couvertures(s: Record<string, Serie>): Couverture[] {
  const n = 60;
  const c = (sym: string, mode: "pct" | "pts", inverse: boolean) => {
    const m = matriceCorrelations(s, [{ symbole: "SPX", mode: "pct" }, { symbole: sym, mode }], n)[0][1];
    return m === null ? null : inverse ? -m : m;
  };
  const brutes: [Couverture["cle"], number | null][] = [
    ["or", c("XAU", "pct", false)],
    ["yen", c("USDJPY", "pct", true)], // le yen monte quand USD/JPY baisse
    ["franc", c("USDCHF", "pct", true)],
    ["obligations", c("US10Y", "pts", true)], // le prix des obligations baisse quand le taux monte
  ];
  return brutes.flatMap(([cle, v]) => (v === null ? [] : [{ cle, correlation: v }])).sort((a, b) => a.correlation - b.correlation);
}

// ---------------------------------------------------------------------------- Devises

export interface Point {
  date: string;
  valeur: number;
}

export interface EntreeDevises {
  fx: Record<string, Serie>; // EURUSD, USDJPY, GBPUSD, USDCHF, USDCAD, AUDUSD, NZDUSD
  decisions: Partial<Record<Devise, Point[]>>; // changements de taux directeur, dans l'ordre
  inflation: Partial<Record<Devise, Point[]>>;
  chomage: Partial<Record<Devise, Point[]>>;
  pib: Partial<Record<Devise, Point[]>>;
  regime: number | null;
  aujourdhui: string;
}

export type CleFacteur = "momentum" | "taux" | "orientation" | "macro" | "regime";
export const POIDS_DEVISES: Record<CleFacteur, number> = { momentum: 0.35, taux: 0.2, orientation: 0.2, macro: 0.1, regime: 0.15 };
// Sensibilité au régime : devises de risque (AUD, NZD, CAD) contre valeurs refuges (JPY, CHF, USD).
const SENSIBILITE: Record<Devise, number> = { AUD: 1, NZD: 1, CAD: 0.6, GBP: 0.3, EUR: 0, USD: -0.6, CHF: -0.8, JPY: -1 };

export interface ForceDevise {
  devise: Devise;
  score: number | null;
  facteurs: Record<CleFacteur, number | null>;
  var5j: number | null; // contre le panier des 7 autres, en %
  var20j: number | null;
  tauxDirecteur: number | null;
  tauxReel: number | null;
  dernierMouvement: { date: string; ecartPb: number } | null;
  orientation: "restrictive" | "accommodante" | "neutre";
}

// Valeur de chaque devise en dollars, aux dates où tous les cours BCE disponibles existent
// (une paire sans historique, par exemple ajoutée récemment, est simplement écartée).
function valeursEnDollars(fx: Record<string, Serie>): Partial<Record<Devise, number[]>> {
  const sources: [Devise, string, boolean][] = [
    ["EUR", "EURUSD", false], ["GBP", "GBPUSD", false], ["AUD", "AUDUSD", false], ["NZD", "NZDUSD", false],
    ["JPY", "USDJPY", true], ["CHF", "USDCHF", true], ["CAD", "USDCAD", true],
  ].filter(([, sym]) => (fx[sym as string]?.length ?? 0) > 25) as [Devise, string, boolean][];
  if (sources.length === 0) return {};
  const cartes = sources.map(([, sym]) => new Map(fx[sym].map((p) => [p.date, p.cloture])));
  const dates = [...cartes[0].keys()].filter((d) => cartes.every((c) => c.has(d))).sort();
  const valeurs: Partial<Record<Devise, number[]>> = { USD: dates.map(() => 1) };
  sources.forEach(([dev, , inverse], i) => {
    valeurs[dev] = dates.map((d) => (inverse ? 1 / cartes[i].get(d)! : cartes[i].get(d)!));
  });
  return valeurs;
}

// Variation de chaque devise contre la moyenne des devises disponibles (en %), sur n séances.
function forceRelative(valeurs: Partial<Record<Devise, number[]>>, n: number): Partial<Record<Devise, number>> | null {
  const longueur = valeurs.USD?.length ?? 0;
  if (longueur <= n) return null;
  const presentes = DEVISES.filter((d) => valeurs[d]);
  const brutes = Object.fromEntries(presentes.map((d) => [d, Math.log(valeurs[d]![longueur - 1] / valeurs[d]![longueur - 1 - n]) * 100]));
  const m = moyenne(Object.values(brutes));
  return Object.fromEntries(presentes.map((d) => [d, brutes[d] - m]));
}

const derniere = (p?: Point[]) => (p && p.length ? p[p.length - 1] : null);
const joursEntre = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000;

export function calculerForceDevises(e: EntreeDevises): ForceDevise[] {
  const valeurs = valeursEnDollars(e.fx);
  const f5 = forceRelative(valeurs, 5);
  const f20 = forceRelative(valeurs, 20);

  const taux = Object.fromEntries(DEVISES.map((d) => [d, derniere(e.decisions[d])?.valeur ?? null])) as Record<Devise, number | null>;
  const reels = Object.fromEntries(DEVISES.map((d) => {
    const i = derniere(e.inflation[d]);
    return [d, taux[d] !== null && i ? taux[d]! - i.valeur : null];
  })) as Record<Devise, number | null>;
  const mTaux = moyenne(DEVISES.flatMap((d) => (taux[d] === null ? [] : [taux[d]!])));
  const mReels = moyenne(DEVISES.flatMap((d) => (reels[d] === null ? [] : [reels[d]!])));
  const mPib = moyenne(DEVISES.flatMap((d) => (derniere(e.pib[d]) ? [derniere(e.pib[d])!.valeur] : [])));

  return DEVISES.map((d): ForceDevise => {
    const momentum = f5?.[d] !== undefined && f20?.[d] !== undefined ? borner(0.5 * (f5[d]! / 1) + 0.5 * (f20[d]! / 2)) : null;

    const noteTaux = taux[d] === null ? null : borner(reels[d] === null ? (taux[d]! - mTaux) / 2 : 0.5 * ((taux[d]! - mTaux) / 2) + 0.5 * ((reels[d]! - mReels) / 2));

    // Orientation : sens du dernier mouvement de taux (moins de 200 jours), renforcé si le
    // précédent allait dans le même sens ; tendance de l'inflation en appoint.
    const decisions = e.decisions[d] ?? [];
    const n = decisions.length;
    let orientation: number | null = n ? 0 : null;
    let dernierMouvement: ForceDevise["dernierMouvement"] = null;
    if (n >= 2) {
      const ecart = decisions[n - 1].valeur - decisions[n - 2].valeur;
      dernierMouvement = { date: decisions[n - 1].date, ecartPb: Math.round(ecart * 100) };
      if (joursEntre(decisions[n - 1].date, e.aujourdhui) <= 200) {
        const memeSens = n >= 3 && Math.sign(decisions[n - 2].valeur - decisions[n - 3].valeur) === Math.sign(ecart) &&
          joursEntre(decisions[n - 2].date, decisions[n - 1].date) <= 365;
        orientation = Math.sign(ecart) * (memeSens ? 1 : 0.6);
      }
    }
    const infl = e.inflation[d] ?? [];
    if (orientation !== null && infl.length >= 4) {
      const delta = infl[infl.length - 1].valeur - infl[infl.length - 4].valeur;
      orientation = borner(orientation + (delta > 0.3 ? 0.3 : delta < -0.3 ? -0.3 : 0));
    }

    const pib = derniere(e.pib[d]);
    const ch = e.chomage[d] ?? [];
    const recul = ch.length >= 4 ? ch[ch.length - 1].valeur - ch[ch.length - 4].valeur : null;
    const morceaux = [pib ? (pib.valeur - mPib) / 0.5 : null, recul === null ? null : -recul / 0.3].filter((x): x is number => x !== null);
    const macro = morceaux.length ? borner(moyenne(morceaux)) : null;

    const regime = e.regime === null ? null : borner(e.regime * SENSIBILITE[d]);

    const facteurs = { momentum, taux: noteTaux, orientation, macro, regime };
    const valides = (Object.keys(facteurs) as CleFacteur[]).filter((k) => facteurs[k] !== null);
    const poids = valides.reduce((a, k) => a + POIDS_DEVISES[k], 0);
    const score = poids >= 0.5 ? valides.reduce((a, k) => a + facteurs[k]! * POIDS_DEVISES[k], 0) / poids : null;

    return {
      devise: d,
      score,
      facteurs,
      var5j: f5?.[d] ?? null,
      var20j: f20?.[d] ?? null,
      tauxDirecteur: taux[d],
      tauxReel: reels[d],
      dernierMouvement,
      orientation: orientation === null ? "neutre" : orientation >= 0.3 ? "restrictive" : orientation <= -0.3 ? "accommodante" : "neutre",
    };
  }).sort((a, b) => (b.score ?? -9) - (a.score ?? -9));
}

// Paires : devise forte contre devise faible ; étoiles = facteurs qui vont dans le même sens.
const ORDRE_COTATION: Devise[] = ["EUR", "GBP", "AUD", "NZD", "USD", "CAD", "CHF", "JPY"];

export interface Paire {
  paire: string; // "EUR/JPY"
  sens: "achat" | "vente";
  ecart: number;
  etoiles: number; // 1 à 5
  facteursAlignes: CleFacteur[];
}

export function classerPaires(forces: ForceDevise[], max = 8): Paire[] {
  const parDevise = new Map(forces.map((f) => [f.devise, f]));
  const paires: Paire[] = [];
  for (let i = 0; i < ORDRE_COTATION.length; i++) {
    for (let j = i + 1; j < ORDRE_COTATION.length; j++) {
      const base = parDevise.get(ORDRE_COTATION[i]);
      const cote = parDevise.get(ORDRE_COTATION[j]);
      if (!base || !cote || base.score === null || cote.score === null) continue;
      const ecart = base.score - cote.score;
      const alignes = (Object.keys(POIDS_DEVISES) as CleFacteur[]).filter((k) => {
        const a = base.facteurs[k];
        const b = cote.facteurs[k];
        return a !== null && b !== null && Math.abs(a - b) >= 0.15 && Math.sign(a - b) === Math.sign(ecart);
      });
      paires.push({
        paire: `${base.devise}/${cote.devise}`,
        sens: ecart >= 0 ? "achat" : "vente",
        ecart: Math.abs(ecart),
        etoiles: Math.max(1, Math.min(5, alignes.length)),
        facteursAlignes: alignes,
      });
    }
  }
  return paires.sort((a, b) => b.etoiles - a.etoiles || b.ecart - a.ecart).slice(0, max);
}
