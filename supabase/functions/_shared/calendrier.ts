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

interface DefinitionPublication {
  libelle: string;
  impact: "fort" | "moyen";
  // Valeur "titre" de la publication à partir de la série triée (la dernière en fin de tableau).
  titre: (serie: Point[], i: number) => number | null;
}

const PUBLICATIONS: Record<string, DefinitionPublication> = {
  CPI: {
    libelle: "Inflation américaine (CPI, sur 1 an, %)",
    impact: "fort",
    titre: (s, i) => (i >= 12 ? (s[i].valeur / s[i - 12].valeur - 1) * 100 : null),
  },
  UNEMPLOYMENT: {
    libelle: "Taux de chômage américain (%)",
    impact: "fort",
    titre: (s, i) => s[i].valeur,
  },
  NONFARM_PAYROLL: {
    libelle: "Emplois non agricoles créés (milliers)",
    impact: "fort",
    titre: (s, i) => (i >= 1 ? s[i].valeur - s[i - 1].valeur : null),
  },
  REAL_GDP: {
    libelle: "Croissance du PIB américain (annualisée, %)",
    impact: "fort",
    titre: (s, i) => (i >= 1 ? ((s[i].valeur / s[i - 1].valeur) ** 4 - 1) * 100 : null),
  },
};

const arrondi = (v: number | null) => (v === null ? null : Math.round(v * 1000) / 1000);

export async function enregistrerPublication(
  indicateur: string,
  serie: Point[],
  dateMaxAvant: string | null,
): Promise<boolean> {
  const def = PUBLICATIONS[indicateur];
  if (!def || serie.length === 0) return false;
  const i = serie.length - 1;
  const derniere = serie[i];
  if (dateMaxAvant !== null && derniere.date <= dateMaxAvant) return false; // pas de nouvelle période

  const valeur = def.titre(serie, i);
  const precedente = i >= 1 ? def.titre(serie, i - 1) : null;
  const { error } = await admin().from("calendrier_economique").upsert(
    {
      indicateur,
      libelle: def.libelle,
      type_evenement: "publication",
      date_reference: derniere.date,
      date_evenement: new Date().toISOString().slice(0, 10),
      // Premier chargement : la date réelle de publication est inconnue.
      date_estimee: dateMaxAvant === null,
      valeur: arrondi(valeur),
      valeur_precedente: arrondi(precedente),
      variation: valeur !== null && precedente !== null ? arrondi(valeur - precedente) : null,
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
