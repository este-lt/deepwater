// Direction artistique choisie par chaque utilisateur : style (palette, coins, police),
// couleur d'accent, densité. Appliquée sur <html> (attributs data-* et variables CSS).

export type Style = "deepwater" | "terminal" | "ocean" | "clair";
export type Densite = "confortable" | "compacte";
export type Police = "sans" | "mono";

export interface Theme {
  style: Style;
  accent: string | null; // #rrggbb, null = accent du style
  densite: Densite;
  police: Police;
}

export const STYLES: { cle: Style; fr: string; en: string; descriptionFr: string; descriptionEn: string; accent: string; fond: string; surface: string }[] = [
  { cle: "deepwater", fr: "Deepwater", en: "Deepwater", descriptionFr: "Sombre, accent violet", descriptionEn: "Dark, violet accent", accent: "#7c6cff", fond: "#090b10", surface: "#10131a" },
  { cle: "terminal", fr: "Terminal", en: "Terminal", descriptionFr: "Noir et ambre, police à chasse fixe, angles droits", descriptionEn: "Black and amber, monospace, square corners", accent: "#ff9f1a", fond: "#000000", surface: "#0b0b0b" },
  { cle: "ocean", fr: "Océan", en: "Ocean", descriptionFr: "Bleu nuit, accent cyan", descriptionEn: "Navy, cyan accent", accent: "#22d3ee", fond: "#06101c", surface: "#0b1828" },
  { cle: "clair", fr: "Clair", en: "Light", descriptionFr: "Fond clair pour la journée", descriptionEn: "Light background for daytime", accent: "#5b4bf0", fond: "#f4f5f8", surface: "#ffffff" },
];

export const ACCENTS = ["#7c6cff", "#ff9f1a", "#22d3ee", "#34d399", "#f472b6", "#f87171", "#facc15", "#60a5fa"];

export const THEME_DEFAUT: Theme = { style: "deepwater", accent: null, densite: "confortable", police: "sans" };

const HEX = /^#[0-9a-f]{6}$/i;

export function themeValide(brut: unknown): Theme {
  const t = (brut && typeof brut === "object" ? brut : {}) as Record<string, unknown>;
  const style = STYLES.some((s) => s.cle === t.style) ? (t.style as Style) : THEME_DEFAUT.style;
  return {
    style,
    accent: typeof t.accent === "string" && HEX.test(t.accent) ? t.accent.toLowerCase() : null,
    densite: t.densite === "compacte" ? "compacte" : "confortable",
    police: t.police === "mono" || (t.police === undefined && style === "terminal") ? "mono" : "sans",
  };
}

const canaux = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const versHex = (c: number[]) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;

// Accent effectif et ses variantes (clair pour le texte sur fond sombre, doux pour les fonds).
export function couleursAccent(theme: Theme): { accent: string; clair: string; doux: string } {
  const accent = theme.accent ?? STYLES.find((s) => s.cle === theme.style)!.accent;
  const c = canaux(accent);
  const sombre = theme.style !== "clair";
  // Sur fond sombre : variante éclaircie ; sur fond clair : variante assombrie (lisibilité du texte).
  const clair = sombre ? versHex(c.map((v) => v + (255 - v) * 0.35)) : versHex(c.map((v) => v * 0.8));
  return { accent, clair, doux: `rgb(${c.join(" ")} / ${sombre ? 0.14 : 0.12})` };
}

export function styleSombre(theme: Theme): boolean {
  return theme.style !== "clair";
}
