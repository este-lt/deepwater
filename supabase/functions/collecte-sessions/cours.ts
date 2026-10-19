// Calculs purs de collecte-sessions (testés dans cours.test.ts) : contrat à terme le plus
// proche pour une séance, séances ouvrées, ouverture et clôture d'une session à partir de
// barres de 30 minutes.
import { estFerieNyse } from "../_shared/feries.ts";
import { bornesSession, SESSIONS, type Session } from "../_shared/sessions.ts";

export type Produit = "ES" | "NQ";
export const PRODUITS: Record<Produit, "SPX" | "NDX"> = { ES: "SPX", NQ: "NDX" };

export interface Barre {
  debut: number; // ms UTC (début de la barre)
  ouverture: number;
  cloture: number;
}

const MOIS: Record<number, string> = { 3: "H", 6: "M", 9: "U", 12: "Z" };

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

// Troisième vendredi du mois (échéance des contrats trimestriels sur indices).
function troisiemeVendredi(annee: number, mois: number): string {
  const premier = new Date(Date.UTC(annee, mois - 1, 1)).getUTCDay();
  return iso(Date.UTC(annee, mois - 1, 1 + ((5 - premier + 7) % 7) + 14));
}

// Contrat le plus proche pour la séance `date` : on passe au suivant le jeudi qui précède
// l'échéance de 8 jours (date de roulement habituelle du CME).
export function contratPourSeance(produit: Produit, date: string): string {
  const annee = Number(date.slice(0, 4));
  for (const a of [annee, annee + 1]) {
    for (const m of [3, 6, 9, 12]) {
      const roulement = iso(Date.parse(`${troisiemeVendredi(a, m)}T00:00:00Z`) - 8 * 86_400_000);
      if (date < roulement) return `${produit}${MOIS[m]}${a % 10}`;
    }
  }
  throw new Error(`Aucun contrat pour ${date}`);
}

export function seancesOuvrees(du: string, au: string): string[] {
  const jours: string[] = [];
  for (let t = Date.parse(`${du}T00:00:00Z`); t <= Date.parse(`${au}T00:00:00Z`); t += 86_400_000) {
    const d = iso(t);
    const j = new Date(t).getUTCDay();
    if (j !== 0 && j !== 6 && !estFerieNyse(d)) jours.push(d);
  }
  return jours;
}

const DEMI_HEURE = 30 * 60_000;

// Ouverture : la première barre qui commence dans la première heure de la session ;
// clôture : la dernière barre qui se termine dans la dernière heure. Sans l'une ou l'autre
// (marché fermé, barres manquantes), la session n'est pas mesurée.
export function mesurerSession(barres: Barre[], debutIso: string, finIso: string): { ouverture: number; cloture: number; rendement: number } | null {
  const debut = Date.parse(debutIso);
  const fin = Date.parse(finIso);
  const dedans = barres.filter((b) => b.debut >= debut && b.debut + DEMI_HEURE <= fin).sort((a, b) => a.debut - b.debut);
  const premiere = dedans[0];
  const derniere = dedans.at(-1);
  if (!premiere || !derniere || premiere.debut - debut >= 3_600_000 || fin - (derniere.debut + DEMI_HEURE) >= 3_600_000) return null;
  if (!(premiere.ouverture > 0) || !(derniere.cloture > 0)) return null;
  return {
    ouverture: premiere.ouverture,
    cloture: derniere.cloture,
    rendement: Math.round((derniere.cloture / premiere.ouverture - 1) * 1e8) / 1e6,
  };
}

// Toutes les sessions mesurables des séances `dates` pour un contrat donné.
export function mesurerSeances(barres: Barre[], dates: string[]) {
  return dates.flatMap((date) =>
    SESSIONS.flatMap((session: Session) => {
      const { debut, fin } = bornesSession(date, session);
      const m = mesurerSession(barres, debut, fin);
      return m ? [{ date, session, debut, fin, ...m }] : [];
    })
  );
}
