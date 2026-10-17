// Direction artistique choisie par chaque utilisateur, sur le modèle des réglages
// « Affichage et luminosité » et « Accessibilité » d'un iPhone : style (palettes claire et
// sombre), apparence (claire, sombre, automatique), couleur d'accent, police, angles,
// surfaces, taille du texte, texte en gras, contraste, transparence, animations.
// Le CSS est généré ici (variables de couleur) et posé dans <head> par le layout ;
// la page Paramètres l'applique aussi en direct pour l'aperçu.

export type Style = "deepwater" | "ios" | "graphite" | "nord" | "ocean" | "terminal" | "papier";
export type Mode = "auto" | "clair" | "sombre";
export type Police = "style" | "geist" | "systeme" | "serif" | "mono";
export type Coins = "style" | "droits" | "legers" | "arrondis" | "tres";
export type Surface = "style" | "bordure" | "ombre" | "verre";

export interface Theme {
  style: Style;
  mode: Mode;
  accent: string | null; // #rrggbb ; null = accent du style
  police: Police;
  coins: Coins;
  surface: Surface;
  taille: number; // -2 à +3, comme la taille du texte de l'iPhone
  gras: boolean;
  contraste: boolean;
  transparenceReduite: boolean;
  animationsReduites: boolean;
}

// Palette d'un mode : couleurs pleines en hexadécimal (mélanges calculés ici, pas en CSS,
// pour que le graphique et l'aperçu lisent des couleurs simples).
interface Palette {
  fond: string;
  surface: string;
  surface2: string;
  surface3: string;
  ligne: string; // couleur des bordures (hexadécimal), avec deux opacités
  opaciteBordure: number;
  opaciteBordureForte: number;
  texte: string;
  attenue: string;
  discret: string;
  accent: string;
  hausse: string;
  baisse: string;
  neutre: string;
  alerte: string;
  // Variantes « Augmenter le contraste » propres au style (couleurs système de l'iPhone).
  contraste?: Partial<Pick<Palette, "accent" | "hausse" | "baisse" | "alerte">>;
}

interface DefinitionStyle {
  cle: Style;
  fr: string;
  en: string;
  descriptionFr: string;
  descriptionEn: string;
  clair?: Palette;
  sombre?: Palette;
  police: Exclude<Police, "style">;
  coins: Exclude<Coins, "style">;
  surface: Exclude<Surface, "style">;
}

const DEEPWATER_SOMBRE: Palette = {
  fond: "#090b10", surface: "#10131a", surface2: "#161a23", surface3: "#1d2230",
  ligne: "#ffffff", opaciteBordure: 0.07, opaciteBordureForte: 0.13,
  texte: "#e8eaf0", attenue: "#8d94a7", discret: "#5d6477",
  accent: "#7c6cff", hausse: "#34d399", baisse: "#f87171", neutre: "#a1a1aa", alerte: "#fbbf24",
};

export const STYLES: DefinitionStyle[] = [
  {
    cle: "deepwater", fr: "Deepwater", en: "Deepwater",
    descriptionFr: "L'original : violet, net et dense", descriptionEn: "The original: violet, crisp and dense",
    sombre: DEEPWATER_SOMBRE,
    clair: {
      fond: "#f4f5f8", surface: "#ffffff", surface2: "#f1f3f7", surface3: "#e4e8ef",
      ligne: "#0f172a", opaciteBordure: 0.08, opaciteBordureForte: 0.16,
      texte: "#11141b", attenue: "#525a6c", discret: "#7f8696",
      accent: "#5b4bf0", hausse: "#047857", baisse: "#c62828", neutre: "#52525b", alerte: "#b45309",
    },
    police: "geist", coins: "arrondis", surface: "bordure",
  },
  {
    cle: "ios", fr: "iPhone", en: "iPhone",
    descriptionFr: "Couleurs système d'iOS, police SF, cartes sans bordure", descriptionEn: "iOS system colors, SF font, borderless cards",
    clair: {
      fond: "#f2f2f7", surface: "#ffffff", surface2: "#f2f2f7", surface3: "#e5e5ea",
      ligne: "#3c3c43", opaciteBordure: 0.13, opaciteBordureForte: 0.29,
      texte: "#000000", attenue: "#6c6c70", discret: "#aeaeb2",
      accent: "#007aff", hausse: "#34c759", baisse: "#ff3b30", neutre: "#8e8e93", alerte: "#ff9500",
      contraste: { accent: "#0040dd", hausse: "#248a3d", baisse: "#d70015", alerte: "#c93400" },
    },
    sombre: {
      fond: "#000000", surface: "#1c1c1e", surface2: "#2c2c2e", surface3: "#3a3a3c",
      ligne: "#545458", opaciteBordure: 0.45, opaciteBordureForte: 0.75,
      texte: "#ffffff", attenue: "#98989f", discret: "#636366",
      accent: "#0a84ff", hausse: "#30d158", baisse: "#ff453a", neutre: "#8e8e93", alerte: "#ff9f0a",
      contraste: { accent: "#409cff", hausse: "#30db5b", baisse: "#ff6961", alerte: "#ffb340" },
    },
    police: "systeme", coins: "tres", surface: "ombre",
  },
  {
    cle: "graphite", fr: "Graphite", en: "Graphite",
    descriptionFr: "Gris neutres façon macOS, sans couleur parasite", descriptionEn: "Neutral macOS-like grays, no color cast",
    clair: {
      fond: "#ececec", surface: "#ffffff", surface2: "#f5f5f5", surface3: "#e3e3e3",
      ligne: "#000000", opaciteBordure: 0.1, opaciteBordureForte: 0.2,
      texte: "#1d1d1f", attenue: "#6e6e73", discret: "#a1a1a6",
      accent: "#6e6e73", hausse: "#1f8a3f", baisse: "#d1302a", neutre: "#86868b", alerte: "#b25e00",
    },
    sombre: {
      fond: "#1e1e1e", surface: "#282828", surface2: "#323232", surface3: "#3d3d3d",
      ligne: "#ffffff", opaciteBordure: 0.09, opaciteBordureForte: 0.17,
      texte: "#f5f5f7", attenue: "#a1a1a6", discret: "#6e6e73",
      accent: "#98989d", hausse: "#32d74b", baisse: "#ff453a", neutre: "#8e8e93", alerte: "#ffd60a",
    },
    police: "systeme", coins: "legers", surface: "bordure",
  },
  {
    cle: "nord", fr: "Nord", en: "Nord",
    descriptionFr: "Bleus polaires apaisants, faible fatigue visuelle", descriptionEn: "Calm arctic blues, easy on the eyes",
    clair: {
      fond: "#eceff4", surface: "#ffffff", surface2: "#e5e9f0", surface3: "#d8dee9",
      ligne: "#2e3440", opaciteBordure: 0.1, opaciteBordureForte: 0.2,
      texte: "#2e3440", attenue: "#4c566a", discret: "#7b8597",
      accent: "#5e81ac", hausse: "#4f7a3b", baisse: "#bf616a", neutre: "#6b7385", alerte: "#c0763a",
    },
    sombre: {
      fond: "#2e3440", surface: "#3b4252", surface2: "#434c5e", surface3: "#4c566a",
      ligne: "#eceff4", opaciteBordure: 0.08, opaciteBordureForte: 0.16,
      texte: "#eceff4", attenue: "#b6bdca", discret: "#8590a3",
      accent: "#88c0d0", hausse: "#a3be8c", baisse: "#d08770", neutre: "#a7b1c2", alerte: "#ebcb8b",
    },
    police: "geist", coins: "arrondis", surface: "bordure",
  },
  {
    cle: "ocean", fr: "Océan", en: "Ocean",
    descriptionFr: "Bleu profond et cyan", descriptionEn: "Deep blue and cyan",
    sombre: {
      fond: "#06101c", surface: "#0b1828", surface2: "#102136", surface3: "#172c45",
      ligne: "#94c5ff", opaciteBordure: 0.09, opaciteBordureForte: 0.18,
      texte: "#e6f0fa", attenue: "#8fa6bf", discret: "#5b7189",
      accent: "#22d3ee", hausse: "#34d399", baisse: "#f87171", neutre: "#a1a1aa", alerte: "#fbbf24",
    },
    clair: {
      fond: "#eef6fb", surface: "#ffffff", surface2: "#e3f0f8", surface3: "#d2e6f2",
      ligne: "#0b1f33", opaciteBordure: 0.09, opaciteBordureForte: 0.18,
      texte: "#0b1f33", attenue: "#48627a", discret: "#7b93a8",
      accent: "#0891b2", hausse: "#047857", baisse: "#c62828", neutre: "#52525b", alerte: "#b45309",
    },
    police: "geist", coins: "arrondis", surface: "verre",
  },
  {
    cle: "terminal", fr: "Terminal", en: "Terminal",
    descriptionFr: "Noir et ambre, chasse fixe, angles droits (toujours sombre)", descriptionEn: "Black and amber, monospace, square corners (always dark)",
    sombre: {
      fond: "#000000", surface: "#0b0b0b", surface2: "#141414", surface3: "#1f1f1f",
      ligne: "#ff9f1a", opaciteBordure: 0.14, opaciteBordureForte: 0.3,
      texte: "#f2f2f2", attenue: "#b3a58f", discret: "#7a6e5c",
      accent: "#ff9f1a", hausse: "#22c55e", baisse: "#ef4444", neutre: "#a1a1aa", alerte: "#fbbf24",
    },
    police: "mono", coins: "droits", surface: "bordure",
  },
  {
    cle: "papier", fr: "Papier", en: "Paper",
    descriptionFr: "Ton crème, police à empattements, lecture de journal (toujours clair)", descriptionEn: "Cream tones, serif type, newspaper reading (always light)",
    clair: {
      fond: "#f4efe6", surface: "#fbf8f2", surface2: "#efe8dc", surface3: "#e4dacb",
      ligne: "#50381e", opaciteBordure: 0.12, opaciteBordureForte: 0.24,
      texte: "#2b2621", attenue: "#6b6157", discret: "#9a8f82",
      accent: "#b4532a", hausse: "#2f7d4f", baisse: "#b23a3a", neutre: "#6b6157", alerte: "#a86a12",
    },
    police: "serif", coins: "legers", surface: "ombre",
  },
];

// Couleurs d'accent système de l'iPhone, plus l'accent d'origine de Deepwater.
export const ACCENTS: { couleur: string; fr: string; en: string }[] = [
  { couleur: "#007aff", fr: "Bleu", en: "Blue" },
  { couleur: "#5856d6", fr: "Indigo", en: "Indigo" },
  { couleur: "#7c6cff", fr: "Violet Deepwater", en: "Deepwater violet" },
  { couleur: "#af52de", fr: "Violet", en: "Purple" },
  { couleur: "#ff2d55", fr: "Rose", en: "Pink" },
  { couleur: "#ff3b30", fr: "Rouge", en: "Red" },
  { couleur: "#ff9500", fr: "Orange", en: "Orange" },
  { couleur: "#ffcc00", fr: "Jaune", en: "Yellow" },
  { couleur: "#34c759", fr: "Vert", en: "Green" },
  { couleur: "#00c7be", fr: "Menthe", en: "Mint" },
  { couleur: "#32ade6", fr: "Cyan", en: "Cyan" },
  { couleur: "#8e8e93", fr: "Graphite", en: "Graphite" },
];

export const POLICES: { cle: Exclude<Police, "style">; fr: string; en: string; pile: string }[] = [
  { cle: "geist", fr: "Geist", en: "Geist", pile: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif" },
  {
    cle: "systeme", fr: "Système (SF Pro sur iPhone et Mac)", en: "System (SF Pro on iPhone and Mac)",
    pile: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  { cle: "serif", fr: "Serif (New York sur Apple)", en: "Serif (New York on Apple)", pile: 'ui-serif, "New York", "Iowan Old Style", Charter, Georgia, Cambria, "Times New Roman", serif' },
  { cle: "mono", fr: "Chasse fixe", en: "Monospace", pile: "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace" },
];

// Rayons : carte, puis les rayons Tailwind des éléments intérieurs (lg, xl).
const RAYONS: Record<Exclude<Coins, "style">, [string, string, string]> = {
  droits: ["0.25rem", "0.125rem", "0.125rem"],
  legers: ["0.625rem", "0.375rem", "0.5rem"],
  arrondis: ["1.125rem", "0.5rem", "0.75rem"],
  tres: ["1.5rem", "0.625rem", "1rem"],
};

// Taille du texte : six crans, comme le curseur de l'iPhone (100 % au cran 0).
export const TAILLES = [-2, -1, 0, 1, 2, 3] as const;
const POURCENTAGE_TAILLE: Record<number, string> = { [-2]: "81.25%", [-1]: "87.5%", 0: "100%", 1: "112.5%", 2: "125%", 3: "137.5%" };

export const THEME_DEFAUT: Theme = {
  style: "deepwater", mode: "sombre", accent: null, police: "style", coins: "style", surface: "style",
  taille: 0, gras: false, contraste: false, transparenceReduite: false, animationsReduites: false,
};

const HEX = /^#[0-9a-f]{6}$/i;
const parmi = <T extends string>(v: unknown, liste: readonly T[], defaut: T): T => (liste.includes(v as T) ? (v as T) : defaut);

// Réglages enregistrés (y compris l'ancien format : style « clair », densité, police « sans »).
export function themeValide(brut: unknown): Theme {
  const t = (brut && typeof brut === "object" ? brut : {}) as Record<string, unknown>;
  const ancienClair = t.style === "clair";
  const style = ancienClair ? "deepwater" : parmi(t.style, STYLES.map((s) => s.cle), THEME_DEFAUT.style);
  const taille = typeof t.taille === "number" && Number.isInteger(t.taille) ? Math.max(-2, Math.min(3, t.taille)) : t.densite === "compacte" ? -1 : 0;
  return {
    style,
    mode: ancienClair ? "clair" : parmi(t.mode, ["auto", "clair", "sombre"] as const, style === "papier" ? "clair" : "sombre"),
    accent: typeof t.accent === "string" && HEX.test(t.accent) ? t.accent.toLowerCase() : null,
    // Ancien format : « sans » était un choix explicite de police classique.
    police: t.police === "sans" ? "geist" : parmi(t.police, ["style", "geist", "systeme", "serif", "mono"] as const, "style"),
    coins: parmi(t.coins, ["style", "droits", "legers", "arrondis", "tres"] as const, "style"),
    surface: parmi(t.surface, ["style", "bordure", "ombre", "verre"] as const, "style"),
    taille,
    gras: t.gras === true,
    contraste: t.contraste === true,
    transparenceReduite: t.transparenceReduite === true,
    animationsReduites: t.animationsReduites === true,
  };
}

export const definitionStyle = (style: Style) => STYLES.find((s) => s.cle === style)!;

// Modes réellement disponibles pour un style (Terminal toujours sombre, Papier toujours clair).
export function modeEffectif(theme: Theme): Mode {
  const d = definitionStyle(theme.style);
  if (!d.clair) return "sombre";
  if (!d.sombre) return "clair";
  return theme.mode;
}

export function surfaceEffective(theme: Theme): Exclude<Surface, "style"> {
  const s = theme.surface === "style" ? definitionStyle(theme.style).surface : theme.surface;
  // « Réduire la transparence » : le verre dépoli devient une surface pleine.
  return s === "verre" && theme.transparenceReduite ? "ombre" : s;
}

// ---------------------------------------------------------------------------- Couleurs

const canaux = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const versHex = (c: number[]) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
const melange = (a: string, b: string, partA: number) => {
  const [ca, cb] = [canaux(a), canaux(b)];
  return versHex(ca.map((v, i) => v * partA + cb[i] * (1 - partA)));
};
const rgb = (hex: string) => canaux(hex).join(" ");

// Accent effectif et ses variantes (clair : texte sur fond sombre, ou assombri sur fond clair ; doux : fonds).
function variantesAccent(accent: string, sombre: boolean): { accent: string; clair: string; doux: string } {
  const c = canaux(accent);
  const clair = sombre ? versHex(c.map((v) => v + (255 - v) * 0.35)) : versHex(c.map((v) => v * 0.8));
  return { accent, clair, doux: `rgb(${c.join(" ")} / ${sombre ? 0.16 : 0.12})` };
}

function variables(p: Palette, theme: Theme, sombre: boolean): string {
  const c = theme.contraste ? { ...p, ...p.contraste } : p;
  const accent = variantesAccent(theme.accent ?? c.accent, sombre);
  // « Augmenter le contraste » : textes secondaires rapprochés du texte principal, bordures doublées.
  const attenue = theme.contraste ? melange(c.texte, c.attenue, 0.45) : c.attenue;
  const discret = theme.contraste ? c.attenue : c.discret;
  const facteur = theme.contraste ? 2 : 1;
  const doux = (hex: string, a: number) => `rgb(${rgb(hex)} / ${a})`;
  const v: Record<string, string> = {
    "color-scheme": sombre ? "dark" : "light",
    "--color-fond": c.fond,
    "--color-surface": c.surface,
    "--color-surface-2": c.surface2,
    "--color-surface-3": c.surface3,
    "--color-bordure": doux(c.ligne, Math.min(1, c.opaciteBordure * facteur)),
    "--color-bordure-forte": doux(c.ligne, Math.min(1, c.opaciteBordureForte * facteur)),
    "--color-texte": c.texte,
    "--color-attenue": attenue,
    "--color-discret": discret,
    "--color-accent": accent.accent,
    "--color-accent-clair": accent.clair,
    "--color-accent-doux": accent.doux,
    "--color-hausse": c.hausse,
    "--color-hausse-doux": doux(c.hausse, sombre ? 0.14 : 0.11),
    "--color-baisse": c.baisse,
    "--color-baisse-doux": doux(c.baisse, sombre ? 0.14 : 0.1),
    "--color-neutre": c.neutre,
    "--color-neutre-doux": doux(c.neutre, 0.12),
    "--color-alerte": c.alerte,
    "--color-alerte-doux": doux(c.alerte, sombre ? 0.14 : 0.11),
    // Pour le verre dépoli et le fond en dégradé.
    "--surface-rgb": rgb(c.surface),
    "--accent-rgb": rgb(accent.accent),
    "--ombre-carte": sombre
      ? "0 0 0 1px rgb(255 255 255 / 0.04), 0 10px 30px -18px rgb(0 0 0 / 0.8)"
      : "0 1px 2px rgb(0 0 0 / 0.05), 0 10px 30px -16px rgb(0 0 0 / 0.16)",
  };
  return Object.entries(v).map(([k, val]) => `${k}:${val}`).join(";");
}

// Feuille de style du thème : les valeurs viennent toutes de themeValide (énumérations et
// couleurs hexadécimales vérifiées), aucun texte libre n'y entre.
export function cssTheme(theme: Theme): string {
  const d = definitionStyle(theme.style);
  const mode = modeEffectif(theme);
  const [carte, lg, xl] = RAYONS[theme.coins === "style" ? d.coins : theme.coins];
  const police = POLICES.find((p) => p.cle === (theme.police === "style" ? d.police : theme.police))!;
  const commun = `:root:root{font-size:${POURCENTAGE_TAILLE[theme.taille] ?? "100%"};--radius-carte:${carte};--radius-lg:${lg};--radius-xl:${xl};--font-sans:${police.pile}}`;
  if (mode === "auto") {
    return `${commun}:root:root{${variables(d.clair!, theme, false)}}@media (prefers-color-scheme: dark){:root:root{${variables(d.sombre!, theme, true)}}}`;
  }
  return `${commun}:root:root{${variables(mode === "sombre" ? d.sombre! : d.clair!, theme, mode === "sombre")}}`;
}

// Couleurs concrètes pour ce qui ne lit pas le CSS (barre du navigateur, fenêtres Clerk).
export function couleursConcretes(theme: Theme, prefereSombre = true) {
  const d = definitionStyle(theme.style);
  const mode = modeEffectif(theme);
  const sombre = mode === "sombre" || (mode === "auto" && prefereSombre);
  const p = sombre ? d.sombre! : d.clair!;
  return { sombre, fond: p.fond, surface: p.surface, surface2: p.surface2, texte: p.texte, attenue: p.attenue, accent: theme.accent ?? p.accent, ligne: p.ligne };
}

// Aperçu d'un style dans les Paramètres : couleurs de chaque mode disponible.
export interface Apercu {
  fond: string;
  surface: string;
  surface2: string;
  accent: string;
  texte: string;
  discret: string;
  hausse: string;
  baisse: string;
}

export function apercuStyle(style: Style): { clair?: Apercu; sombre?: Apercu } {
  const d = definitionStyle(style);
  const vers = (p?: Palette): Apercu | undefined =>
    p && { fond: p.fond, surface: p.surface, surface2: p.surface2, accent: p.accent, texte: p.texte, discret: p.discret, hausse: p.hausse, baisse: p.baisse };
  return { clair: vers(d.clair), sombre: vers(d.sombre) };
}
