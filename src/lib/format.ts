// Formats selon la langue de l'utilisateur (français par défaut), serveur et navigateur.
import { type Langue, localeDe } from "./i18n";

export function formaterNombre(valeur: number | null | undefined, decimales = 2, langue: Langue = "fr"): string {
  if (valeur === null || valeur === undefined || !Number.isFinite(valeur)) return "—";
  return new Intl.NumberFormat(localeDe(langue), { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(valeur);
}

// Nombre compact signé : 12 345 678 -> "+12,3 M" (en anglais "+12.3M").
export function formaterNombreCourt(valeur: number | null | undefined, langue: Langue = "fr"): string {
  if (valeur === null || valeur === undefined || !Number.isFinite(valeur)) return "—";
  const abs = Math.abs(valeur);
  const signe = valeur > 0 ? "+" : valeur < 0 ? "−" : "";
  const espace = langue === "en" ? "" : " ";
  if (abs >= 1e9) return `${signe}${formaterNombre(abs / 1e9, 2, langue)}${espace}${langue === "en" ? "B" : "Md"}`;
  if (abs >= 1e6) return `${signe}${formaterNombre(abs / 1e6, 1, langue)}${espace}M`;
  if (abs >= 1e4) return `${signe}${formaterNombre(abs / 1e3, 0, langue)}${espace}k`;
  return `${signe}${formaterNombre(abs, 0, langue)}`;
}

// Suffixe d'unité : « 3,7 % » en français, « 3.7% » en anglais.
export const pct = (langue: Langue) => (langue === "en" ? "%" : " %");

export function formaterPct(valeur: number | null | undefined, decimales = 2, signe = true, langue: Langue = "fr"): string {
  if (valeur === null || valeur === undefined || !Number.isFinite(valeur)) return "—";
  const texte = `${formaterNombre(Math.abs(valeur), decimales, langue)}${pct(langue)}`;
  if (!signe) return valeur < 0 ? `−${texte}` : texte;
  return `${valeur > 0 ? "+" : valeur < 0 ? "−" : ""}${texte}`;
}

// Variation signée en points de base : « +6 pb » / « +6 bp ».
export function formaterPb(valeur: number | null | undefined, langue: Langue = "fr"): string {
  if (valeur === null || valeur === undefined || !Number.isFinite(valeur)) return "—";
  const signe = valeur > 0 ? "+" : valeur < 0 ? "−" : "";
  return `${signe}${formaterNombre(Math.abs(valeur), 0, langue)} ${langue === "en" ? "bp" : "pb"}`;
}

// Nombre de décimales adapté à l'ordre de grandeur (indice, action, devise).
export function decimalesPour(valeur: number): number {
  if (valeur >= 10) return 2;
  return 4;
}

// Date de séance "2026-10-15" -> "15 oct. 2026" / "Oct 15, 2026" (jour de marché, sans fuseau).
export function formaterDateSeance(date: string | null | undefined, langue: Langue = "fr", annee = true): string {
  if (!date) return "—";
  const [a, m, j] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(localeDe(langue), { day: "numeric", month: "short", ...(annee ? { year: "numeric" } : {}), timeZone: "UTC" }).format(
    new Date(Date.UTC(a, m - 1, j)),
  );
}

export type Frequence = "jour" | "semaine" | "mois" | "trimestre";

// Période d'une statistique datée au 1er du mois : "2026-09-01" -> "sept. 2026" (mensuelle),
// "2026-04-01" -> "T2 2026" / "Q2 2026" (trimestrielle) ; une série quotidienne garde son jour.
export function formaterPeriode(date: string | null | undefined, frequence: Frequence, langue: Langue = "fr"): string {
  if (!date) return "—";
  if (frequence === "jour") return formaterDateSeance(date, langue);
  if (frequence === "semaine") return `${langue === "en" ? "week of" : "semaine du"} ${formaterDateSeance(date, langue)}`;
  const [a, m] = date.split("-").map(Number);
  if (frequence === "trimestre") return `${langue === "en" ? "Q" : "T"}${Math.floor((m - 1) / 3) + 1} ${a}`;
  return new Intl.DateTimeFormat(localeDe(langue), { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(a, m - 1, 1)));
}

// "2026-09-01" moins 12 mois -> "2025-09-01" (séries mensuelles datées au 1er du mois).
export function moisAvant(date: string, n: number): string {
  const total = Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1 - n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}${date.slice(7)}`;
}

export function tonVariation(valeur: number | null | undefined): "hausse" | "baisse" | "neutre" {
  if (!valeur) return "neutre";
  return valeur > 0 ? "hausse" : "baisse";
}

// Instant UTC d'une heure locale officielle ("2026-10-28", "14:00", "America/New_York"),
// changement d'heure compris : on mesure le décalage du fuseau à cet instant précis.
export function instantFuseau(date: string, heure: string, fuseau: string): string {
  const naif = Date.parse(`${date}T${heure}:00Z`);
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone: fuseau,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const decalage = (t: number) => {
    const p = Object.fromEntries(format.formatToParts(new Date(t)).map((x) => [x.type, Number(x.value)]));
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - t;
  };
  // Deux passes : la seconde corrige le cas où l'estimation tombe de l'autre côté d'un changement d'heure.
  const estimation = naif - decalage(naif);
  return new Date(naif - decalage(estimation)).toISOString();
}
