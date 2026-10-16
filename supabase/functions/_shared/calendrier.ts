// Calendrier économique dérivé des séries Alpha Vantage : quand une nouvelle
// période apparaît (nouvelle publication officielle), un événement est créé avec
// la valeur publiée, la précédente et l'écart. Le consensus des économistes n'est
// pas disponible gratuitement : la « surprise » est mesurée par rapport à la
// publication précédente (choix documenté dans docs/SOURCES.md).
import { admin } from "./supabase.ts";

interface Point {
  date: string;
  valeur: number;
}

// Valeur de la série `n` mois avant la période étudiée ; null si ce mois manque.
type Lecture = (moisAvant: number) => number | null;

interface DefinitionPublication {
  libelle: string;
  impact: "fort" | "moyen";
  // Écart en mois entre deux publications (1 = mensuelle, 3 = trimestrielle).
  pas: number;
  // Valeur "titre" de la publication.
  titre: (v: Lecture) => number | null;
}

const ecart = (a: number | null, b: number | null) => (a !== null && b !== null ? a - b : null);
const rapport = (a: number | null, b: number | null) => (a !== null && b !== null && b !== 0 ? a / b : null);

const PUBLICATIONS: Record<string, DefinitionPublication> = {
  CPI: {
    libelle: "Inflation américaine (CPI, sur 1 an, %)",
    impact: "fort",
    pas: 1,
    titre: (v) => {
      const r = rapport(v(0), v(12));
      return r === null ? null : (r - 1) * 100;
    },
  },
  UNEMPLOYMENT: {
    libelle: "Taux de chômage américain (%)",
    impact: "fort",
    pas: 1,
    titre: (v) => v(0),
  },
  NONFARM_PAYROLL: {
    libelle: "Emplois non agricoles créés (milliers)",
    impact: "fort",
    pas: 1,
    titre: (v) => ecart(v(0), v(1)),
  },
  REAL_GDP: {
    libelle: "Croissance du PIB américain (annualisée, %)",
    impact: "fort",
    pas: 3,
    titre: (v) => {
      const r = rapport(v(0), v(3));
      return r === null ? null : (r ** 4 - 1) * 100;
    },
  },
};

const arrondi = (v: number | null) => (v === null ? null : Math.round(v * 1000) / 1000);

// "2026-09-01" moins 12 mois -> "2025-09-01" (les séries sont datées au 1er du mois).
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
  const parDate = new Map(serie.map((p) => [p.date, p.valeur]));
  const lecture = (date: string): Lecture => (n) => parDate.get(moisAvant(date, n)) ?? null;
  const date = serie[serie.length - 1].date;
  const valeur = arrondi(def.titre(lecture(date)));
  const precedente = arrondi(def.titre(lecture(moisAvant(date, def.pas))));
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
      source_donnee: `alpha_vantage:${indicateur}`,
      maj_le: new Date().toISOString(),
    },
    { onConflict: "indicateur,date_evenement" },
  );
  if (error) throw new Error(`Écriture du calendrier impossible : ${error.message}`);
  return true;
}
