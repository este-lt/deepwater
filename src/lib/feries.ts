// Jours de fermeture de la Bourse de New York (règles NYSE ; les fermetures
// exceptionnelles, deuil national par exemple, ne sont pas prévisibles).
// Copie identique : supabase/functions/_shared/feries.ts (vérifiée par supabase/functions/_shared/feries.test.ts).

const iso = (a: number, m: number, j: number) => new Date(Date.UTC(a, m - 1, j)).toISOString().slice(0, 10);
const jourSemaine = (a: number, m: number, j: number) => new Date(Date.UTC(a, m - 1, j)).getUTCDay();

// n-ième jour de semaine du mois (n = -1 : le dernier). jour : 0 dimanche ... 6 samedi.
function nieme(a: number, m: number, jour: number, n: number): string {
  if (n > 0) {
    const premier = jourSemaine(a, m, 1);
    return iso(a, m, 1 + ((jour - premier + 7) % 7) + (n - 1) * 7);
  }
  const dernierJour = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const dernier = jourSemaine(a, m, dernierJour);
  return iso(a, m, dernierJour - ((dernier - jour + 7) % 7));
}

// Fête fixe tombant un samedi : fermé le vendredi ; un dimanche : fermé le lundi.
function observe(a: number, m: number, j: number): string {
  const s = jourSemaine(a, m, j);
  return s === 6 ? iso(a, m, j - 1) : s === 0 ? iso(a, m, j + 1) : iso(a, m, j);
}

// Dimanche de Pâques (calendrier grégorien, algorithme anonyme).
function paques(a: number): [number, number] {
  const n = a % 19, b = Math.floor(a / 100), c = a % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * n + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((n + 11 * h + 22 * l) / 451);
  return [Math.floor((h + l - 7 * m + 114) / 31), ((h + l - 7 * m + 114) % 31) + 1];
}

const cache = new Map<number, Set<string>>();

export function feriesNyse(a: number): Set<string> {
  const connu = cache.get(a);
  if (connu) return connu;
  const [mp, jp] = paques(a);
  const jours = [
    // Jour de l'an un samedi : pas de fermeture le vendredi 31 décembre (fin d'exercice).
    ...(jourSemaine(a, 1, 1) === 6 ? [] : [observe(a, 1, 1)]),
    nieme(a, 1, 1, 3), // Martin Luther King
    nieme(a, 2, 1, 3), // Washington's Birthday
    iso(a, mp, jp - 2), // Vendredi saint
    nieme(a, 5, 1, -1), // Memorial Day
    observe(a, 6, 19), // Juneteenth
    observe(a, 7, 4), // Fête nationale
    nieme(a, 9, 1, 1), // Labor Day
    nieme(a, 11, 4, 4), // Thanksgiving
    observe(a, 12, 25), // Noël
  ];
  const ensemble = new Set(jours);
  cache.set(a, ensemble);
  return ensemble;
}

export const estFerieNyse = (date: string) => feriesNyse(Number(date.slice(0, 4))).has(date);
