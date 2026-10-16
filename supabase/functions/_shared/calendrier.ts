// Calendrier économique dérivé des séries FRED : quand une nouvelle période apparaît
// (nouvelle publication officielle), un événement est créé avec la valeur publiée, la
// précédente et l'écart. Le consensus des économistes n'est pas disponible gratuitement :
// la « surprise » est mesurée par rapport à la publication précédente (docs/SOURCES.md).
import { admin } from "./supabase.ts";

interface Point {
  date: string;
  valeur: number;
}

// Valeur de la série `n` périodes avant la période étudiée ; null si cette période manque.
type Lecture = (periodesAvant: number) => number | null;

export interface DefinitionPublication {
  serie: string; // identifiant FRED
  libelle: string;
  impact: "fort" | "moyen";
  // Écart entre deux publications : en mois (1, 3) ou "hebdo" (observation précédente).
  pas: number | "hebdo";
  titre: (v: Lecture) => number | null;
}

const ecart = (a: number | null, b: number | null) => (a !== null && b !== null ? a - b : null);
const rapport = (a: number | null, b: number | null) => (a !== null && b !== null && b !== 0 ? a / b : null);
const surUnAn = (v: Lecture) => {
  const r = rapport(v(0), v(12));
  return r === null ? null : (r - 1) * 100;
};

export const PUBLICATIONS: Record<string, DefinitionPublication> = {
  CPI: { serie: "CPIAUCNS", libelle: "Inflation américaine (CPI, sur 1 an, %)", impact: "fort", pas: 1, titre: surUnAn },
  CORE_CPI: { serie: "CPILFENS", libelle: "Inflation sous-jacente (CPI hors énergie et alimentation, sur 1 an, %)", impact: "fort", pas: 1, titre: surUnAn },
  CORE_PCE: { serie: "PCEPILFE", libelle: "Inflation PCE sous-jacente (cible de la Fed, sur 1 an, %)", impact: "fort", pas: 1, titre: surUnAn },
  PPI: { serie: "PPIFID", libelle: "Prix à la production (demande finale, sur 1 an, %)", impact: "moyen", pas: 1, titre: surUnAn },
  UNEMPLOYMENT: { serie: "UNRATE", libelle: "Taux de chômage américain (%)", impact: "fort", pas: 1, titre: (v) => v(0) },
  NONFARM_PAYROLL: {
    serie: "PAYEMS", libelle: "Emplois non agricoles créés (milliers)", impact: "fort", pas: 1,
    titre: (v) => ecart(v(0), v(1)),
  },
  JOBLESS_CLAIMS: {
    serie: "ICSA", libelle: "Inscriptions hebdomadaires au chômage (milliers)", impact: "moyen", pas: "hebdo",
    titre: (v) => (v(0) === null ? null : v(0)! / 1000),
  },
  RETAIL_SALES: {
    serie: "RSAFS", libelle: "Ventes au détail (sur 1 mois, %)", impact: "moyen", pas: 1,
    titre: (v) => {
      const r = rapport(v(0), v(1));
      return r === null ? null : (r - 1) * 100;
    },
  },
  REAL_GDP: {
    serie: "GDPC1", libelle: "Croissance du PIB américain (annualisée, %)", impact: "fort", pas: 3,
    titre: (v) => {
      const r = rapport(v(0), v(3));
      return r === null ? null : (r ** 4 - 1) * 100;
    },
  },
};

const arrondi = (v: number | null) => (v === null ? null : Math.round(v * 1000) / 1000);

// "2026-09-01" moins 12 mois -> "2025-09-01" (les séries mensuelles sont datées au 1er du mois).
export function moisAvant(date: string, n: number): string {
  const total = Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1 - n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}${date.slice(7)}`;
}

// Les comparaisons se font par date et non par position : un mois jamais publié
// (octobre 2025, shutdown fédéral) donne une valeur indisponible, pas un calcul sur 13 mois.
export function calculerPublication(
  indicateur: string,
  serie: Point[],
): { date: string; valeur: number | null; precedente: number | null; variation: number | null } | null {
  const def = PUBLICATIONS[indicateur];
  if (!def || serie.length === 0) return null;
  const date = serie[serie.length - 1].date;
  let valeur: number | null;
  let precedente: number | null;
  if (def.pas === "hebdo") {
    // Série hebdomadaire : la publication précédente est l'observation d'avant.
    const lire = (i: number): Lecture => (n) => serie[i - n]?.valeur ?? null;
    valeur = arrondi(def.titre(lire(serie.length - 1)));
    precedente = arrondi(def.titre(lire(serie.length - 2)));
  } else {
    const pas = def.pas;
    const parDate = new Map(serie.map((p) => [p.date, p.valeur]));
    const lecture = (d: string): Lecture => (n) => parDate.get(moisAvant(d, n)) ?? null;
    valeur = arrondi(def.titre(lecture(date)));
    precedente = arrondi(def.titre(lecture(moisAvant(date, pas))));
  }
  return { date, valeur, precedente, variation: arrondi(ecart(valeur, precedente)) };
}

export async function enregistrerPublication(
  indicateur: string,
  serie: Point[],
  dateMaxAvant: string | null,
): Promise<boolean> {
  const def = PUBLICATIONS[indicateur];
  const calcul = calculerPublication(indicateur, serie);
  if (!def || !calcul) return false;
  if (dateMaxAvant !== null && calcul.date <= dateMaxAvant) return false; // pas de nouvelle période

  const { error } = await admin().from("calendrier_economique").upsert(
    {
      indicateur,
      libelle: def.libelle,
      type_evenement: "publication",
      date_reference: calcul.date,
      date_evenement: new Date().toISOString().slice(0, 10),
      // Premier chargement : la date réelle de publication est inconnue.
      date_estimee: dateMaxAvant === null,
      valeur: calcul.valeur,
      valeur_precedente: calcul.precedente,
      variation: calcul.variation,
      consensus: null,
      impact: def.impact,
      source_donnee: `fred:${def.serie}`,
      maj_le: new Date().toISOString(),
    },
    { onConflict: "indicateur,type_evenement,date_evenement" },
  );
  if (error) throw new Error(`Écriture du calendrier impossible : ${error.message}`);
  return true;
}
