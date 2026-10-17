// Site bilingue (français, anglais) : chaque texte est écrit dans les deux langues à
// l'endroit où il s'affiche, t("Texte", "Text"). Utilisable côté serveur et navigateur.
export type Langue = "fr" | "en";

export const LANGUES: { cle: Langue; libelle: string }[] = [
  { cle: "fr", libelle: "Français" },
  { cle: "en", libelle: "English" },
];

export type Traduire = (fr: string, en: string) => string;

export function traducteur(langue: Langue): Traduire {
  return (fr, en) => (langue === "en" ? en : fr);
}

export const localeDe = (langue: Langue) => (langue === "en" ? "en-US" : "fr-FR");

export function langueValide(valeur: unknown): Langue {
  return valeur === "en" ? "en" : "fr";
}
