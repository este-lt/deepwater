// Formats français, utilisables côté serveur et navigateur.

export function formaterNombre(valeur: number | null | undefined, decimales = 2): string {
  if (valeur === null || valeur === undefined || !Number.isFinite(valeur)) return "—";
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(valeur);
}

export function formaterPct(valeur: number | null | undefined, decimales = 2, signe = true): string {
  if (valeur === null || valeur === undefined || !Number.isFinite(valeur)) return "—";
  const texte = formaterNombre(Math.abs(valeur), decimales);
  if (!signe) return `${texte} %`;
  return `${valeur > 0 ? "+" : valeur < 0 ? "−" : ""}${texte} %`;
}

// Nombre de décimales adapté à l'ordre de grandeur (indice, action, devise).
export function decimalesPour(valeur: number): number {
  if (valeur >= 1000) return 2;
  if (valeur >= 10) return 2;
  return 4;
}

// Date de séance "2026-10-15" -> "15 oct. 2026" (sans conversion de fuseau : c'est un jour de marché).
export function formaterDateSeance(date: string | null | undefined): string {
  if (!date) return "—";
  const [a, m, j] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(a, m - 1, j)),
  );
}

export function tonVariation(valeur: number | null | undefined): "hausse" | "baisse" | "neutre" {
  if (!valeur) return "neutre";
  return valeur > 0 ? "hausse" : "baisse";
}
