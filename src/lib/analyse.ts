// Analyses par règles, calculées à partir des données déjà en base (aucun appel externe) :
// régime risk-on / risk-off, corrélations entre actifs, force des 8 grandes devises et
// paires classées par confluence. Les biais (régime, devises) ne reposent que sur des
// données concrètes (taux, banques centrales, macro, volatilité implicite, crédit,
// conditions financières) : aucun indicateur ni concept d'analyse technique.
// Scoring automatique, pas un conseil en investissement.
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

// ---------------------------------------------------------------------------- Régime

// Sentiment de marché à partir de mesures concrètes, sans variation de prix ni indicateur
// technique : peur mesurée par les options (VIX), prime de risque de crédit (spread haut
// rendement), conditions financières (indice NFCI de la Fed de Chicago).
export interface Composante {
  cle: "volatilite" | "credit" | "conditions";
  niveau: number | null;
  variation: number | null; // VIX : points sur 5 séances ; spread : pb sur 5 séances ; NFCI : sur 4 semaines
  reference: number | null; // VIX : médiane de la période lue (environ 4 mois)
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

const mediane = (v: number[]) => {
  const t = [...v].sort((a, b) => a - b);
  return t.length ? t[Math.floor(t.length / 2)] : null;
};

export function calculerRegime(s: Record<string, Serie>): Regime {
  const vix = s.VIX ?? [];
  const hy = s.HY ?? [];
  const nfci = s.NFCI ?? [];
  const dernier = (x: Serie) => x.at(-1)?.cloture ?? null;

  const niveauVix = dernier(vix);
  const medianeVix = mediane(vix.map((p) => p.cloture));
  const varVix = variation(vix, 5, "pts");
  const noteVix = niveauVix === null || medianeVix === null || varVix === null
    ? null
    : -(0.5 * borner((niveauVix - medianeVix) / 8) + 0.5 * borner(varVix / 5));

  const varHy = variation(hy, 5, "pts");
  const noteHy = varHy === null ? null : -borner(varHy / 0.4);

  const niveauNfci = dernier(nfci);
  const varNfci = variation(nfci, 4, "pts");
  const noteNfci = niveauNfci === null
    ? null
    : varNfci === null ? -borner(niveauNfci / 0.5) : -(0.6 * borner(niveauNfci / 0.5) + 0.4 * borner(varNfci / 0.15));

  const composantes: Composante[] = [
    { cle: "volatilite", niveau: niveauVix, variation: varVix, reference: medianeVix, note: noteVix, poids: 0.4 },
    { cle: "credit", niveau: dernier(hy), variation: varHy === null ? null : varHy * 100, reference: null, note: noteHy, poids: 0.35 },
    { cle: "conditions", niveau: niveauNfci, variation: varNfci, reference: null, note: noteNfci, poids: 0.25 },
  ];
  const valides = composantes.filter((c) => c.note !== null);
  const poids = valides.reduce((a, c) => a + c.poids, 0);
  const date = vix.at(-1)?.date ?? hy.at(-1)?.date ?? null;
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

// Actifs moteurs des corrélations inter-marchés : variation en % sur 20 séances
// (yuan : force du yuan, soit l'inverse de la variation de l'USD/CNY).
export type ActifMoteur = "petrole" | "or" | "sp500" | "yuan";
export type Moteur = ActifMoteur | "USD" | "EUR" | "AUD";

export interface EntreeDevises {
  decisions: Partial<Record<Devise, Point[]>>; // changements de taux directeur, dans l'ordre
  inflation: Partial<Record<Devise, Point[]>>;
  chomage: Partial<Record<Devise, Point[]>>;
  pib: Partial<Record<Devise, Point[]>>;
  regime: number | null;
  moteurs?: Partial<Record<ActifMoteur, number | null>>;
  aujourdhui: string;
}

// Six facteurs, six étoiles possibles pour une paire.
export type CleFacteur = "portage" | "tauxReel" | "orientation" | "macro" | "regime" | "intermarche";
export const POIDS_DEVISES: Record<CleFacteur, number> = {
  portage: 0.15, tauxReel: 0.15, orientation: 0.2, macro: 0.15, regime: 0.15, intermarche: 0.2,
};
// Sensibilité au régime : devises de risque (AUD, NZD, CAD) contre valeurs refuges (JPY, CHF, USD).
const SENSIBILITE: Record<Devise, number> = { AUD: 1, NZD: 1, CAD: 0.6, GBP: 0.3, EUR: 0, USD: -0.6, CHF: -0.8, JPY: -1 };

// Corrélations inter-marchés (fiche « Value Asset Corrélations », Aupa Traders) : quand le
// moteur monte, la devise suit (sens +1) ou baisse (sens -1). Pour une devise moteur, on lit
// son score fondamental (jamais son cours) ; pour un actif, sa variation sur 20 séances.
// Le dollar n'a pas de moteur dans la fiche : son facteur inter-marchés reste indisponible.
export const CORRELATIONS: Record<Devise, { moteur: Moteur; sens: 1 | -1 }[]> = {
  USD: [],
  EUR: [{ moteur: "USD", sens: -1 }],
  GBP: [{ moteur: "EUR", sens: 1 }],
  CAD: [{ moteur: "petrole", sens: 1 }, { moteur: "USD", sens: 1 }],
  CHF: [{ moteur: "or", sens: 1 }, { moteur: "sp500", sens: -1 }],
  JPY: [{ moteur: "USD", sens: -1 }, { moteur: "or", sens: 1 }],
  AUD: [{ moteur: "yuan", sens: 1 }, { moteur: "USD", sens: -1 }, { moteur: "sp500", sens: 1 }],
  NZD: [{ moteur: "AUD", sens: 1 }, { moteur: "USD", sens: -1 }, { moteur: "sp500", sens: 1 }],
};
// Variation sur 20 séances qui donne une note pleine (±1), en %.
const PLEIN_MOTEUR: Record<ActifMoteur, number> = { petrole: 10, or: 5, sp500: 5, yuan: 1.5 };
const ACTIFS_MOTEURS = Object.keys(PLEIN_MOTEUR) as ActifMoteur[];

export interface LienIntermarche {
  moteur: Moteur;
  sens: 1 | -1;
  valeur: number | null; // variation en % (actif) ou score de la devise moteur
  note: number | null; // contribution signée, entre -1 et +1
}

export interface ForceDevise {
  devise: Devise;
  score: number | null;
  facteurs: Record<CleFacteur, number | null>;
  liens: LienIntermarche[];
  tauxDirecteur: number | null;
  tauxReel: number | null;
  dernierMouvement: { date: string; ecartPb: number } | null;
  orientation: "restrictive" | "accommodante" | "neutre";
}

function scorePondere(facteurs: Partial<Record<CleFacteur, number | null>>): number | null {
  const valides = (Object.keys(facteurs) as CleFacteur[]).filter((k) => facteurs[k] !== null && facteurs[k] !== undefined);
  const poids = valides.reduce((a, k) => a + POIDS_DEVISES[k], 0);
  const total = (Object.keys(facteurs) as CleFacteur[]).reduce((a, k) => a + POIDS_DEVISES[k], 0);
  return poids >= 0.5 * total ? valides.reduce((a, k) => a + facteurs[k]! * POIDS_DEVISES[k], 0) / poids : null;
}

const derniere = (p?: Point[]) => (p && p.length ? p[p.length - 1] : null);
const joursEntre = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000;

export function calculerForceDevises(e: EntreeDevises): ForceDevise[] {
  const taux = Object.fromEntries(DEVISES.map((d) => [d, derniere(e.decisions[d])?.valeur ?? null])) as Record<Devise, number | null>;
  const reels = Object.fromEntries(DEVISES.map((d) => {
    const i = derniere(e.inflation[d]);
    return [d, taux[d] !== null && i ? taux[d]! - i.valeur : null];
  })) as Record<Devise, number | null>;
  const mTaux = moyenne(DEVISES.flatMap((d) => (taux[d] === null ? [] : [taux[d]!])));
  const mReels = moyenne(DEVISES.flatMap((d) => (reels[d] === null ? [] : [reels[d]!])));
  const mPib = moyenne(DEVISES.flatMap((d) => (derniere(e.pib[d]) ? [derniere(e.pib[d])!.valeur] : [])));

  // 1er passage : les cinq facteurs fondamentaux de chaque devise.
  const bases = DEVISES.map((d) => {
    // Portage : taux directeur face à la moyenne des 8 ; taux réel : taux directeur moins inflation.
    const portage = taux[d] === null ? null : borner((taux[d]! - mTaux) / 2);
    const tauxReel = reels[d] === null ? null : borner((reels[d]! - mReels) / 2);

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

    // Croissance et emploi : PIB sur 1 trimestre face à la moyenne, recul du chômage.
    const pib = derniere(e.pib[d]);
    const ch = e.chomage[d] ?? [];
    const recul = ch.length >= 4 ? ch[ch.length - 1].valeur - ch[ch.length - 4].valeur : null;
    const morceaux = [pib ? (pib.valeur - mPib) / 0.5 : null, recul === null ? null : -recul / 0.3].filter((x): x is number => x !== null);
    const macro = morceaux.length ? borner(moyenne(morceaux)) : null;

    const regime = e.regime === null ? null : borner(e.regime * SENSIBILITE[d]);

    const fondamentaux = { portage, tauxReel, orientation, macro, regime };
    return { devise: d, fondamentaux, scoreBase: scorePondere(fondamentaux), dernierMouvement, orientationNote: orientation };
  });
  const scoreBase = new Map(bases.map((b) => [b.devise as Moteur, b.scoreBase]));
  const actifs = new Map(ACTIFS_MOTEURS.map((a) => {
    const v = e.moteurs?.[a];
    return [a as Moteur, v === null || v === undefined || !Number.isFinite(v) ? null : v];
  }));

  // 2e passage : corrélations inter-marchés (dépendent du score fondamental des devises moteurs).
  return bases.map((b): ForceDevise => {
    const liens = CORRELATIONS[b.devise].map((c): LienIntermarche => {
      const actif = actifs.has(c.moteur);
      const valeur = actif ? actifs.get(c.moteur)! : scoreBase.get(c.moteur) ?? null;
      const brute = valeur === null ? null : actif ? borner(valeur / PLEIN_MOTEUR[c.moteur as ActifMoteur]) : valeur;
      return { moteur: c.moteur, sens: c.sens, valeur, note: brute === null ? null : c.sens * brute };
    });
    const notes = liens.flatMap((l) => (l.note === null ? [] : [l.note]));
    const intermarche = notes.length ? borner(moyenne(notes)) : null;
    const facteurs = { ...b.fondamentaux, intermarche };
    const o = b.orientationNote;
    return {
      devise: b.devise,
      score: scorePondere(facteurs),
      facteurs,
      liens,
      tauxDirecteur: taux[b.devise],
      tauxReel: reels[b.devise],
      dernierMouvement: b.dernierMouvement,
      orientation: o === null ? "neutre" : o >= 0.3 ? "restrictive" : o <= -0.3 ? "accommodante" : "neutre",
    };
  }).sort((a, b) => (b.score ?? -9) - (a.score ?? -9));
}

// Paires : devise forte contre devise faible ; étoiles = facteurs qui vont dans le même sens.
const ORDRE_COTATION: Devise[] = ["EUR", "GBP", "AUD", "NZD", "USD", "CAD", "CHF", "JPY"];

export interface Paire {
  paire: string; // "EUR/JPY"
  sens: "achat" | "vente";
  ecart: number;
  etoiles: number; // 1 à 6 : facteurs qui vont dans le même sens
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
        etoiles: Math.max(1, Math.min(6, alignes.length)),
        facteursAlignes: alignes,
      });
    }
  }
  return paires.sort((a, b) => b.etoiles - a.etoiles || b.ecart - a.ecart).slice(0, max);
}
