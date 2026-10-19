// Sessions de cotation des contrats à terme sur indices américains (ES, NQ), pour une séance
// de New York donnée (date D), changements d'heure compris :
//   asie      de la réouverture du Globex (18 h à New York, la veille de D) à l'ouverture de Londres
//   londres   de l'ouverture de Londres (8 h à Londres) à l'ouverture de New York
//   new_york  de 9 h 30 à 16 h à New York
// Le biais publié est le biais intraday (session new_york) ; collecte-sessions mesure les trois
// sessions, ce qui permet de juger le biais sur la séance elle-même (ouverture -> clôture).
import { estFerieNyse } from "./feries.ts";

export type Session = "asie" | "londres" | "new_york";
export const SESSIONS: Session[] = ["asie", "londres", "new_york"];

// Instant UTC d'une heure locale officielle ("2026-10-19", "09:30", "America/New_York") : on
// mesure le décalage du fuseau à cet instant précis (deux passes pour le changement d'heure).
export function instantLocal(date: string, heure: string, fuseau: string): string {
  const naif = Date.parse(`${date}T${heure}:00Z`);
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone: fuseau, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  const decalage = (t: number) => {
    const p = Object.fromEntries(format.formatToParts(new Date(t)).map((x) => [x.type, Number(x.value)]));
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - t;
  };
  const estimation = naif - decalage(naif);
  return new Date(naif - decalage(estimation)).toISOString();
}

const veille = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

export function bornesSession(date: string, session: Session): { debut: string; fin: string } {
  const londres = instantLocal(date, "08:00", "Europe/London");
  const ouvertureNy = instantLocal(date, "09:30", "America/New_York");
  if (session === "asie") return { debut: instantLocal(veille(date), "18:00", "America/New_York"), fin: londres };
  if (session === "londres") return { debut: londres, fin: ouvertureNy };
  return { debut: ouvertureNy, fin: instantLocal(date, "16:00", "America/New_York") };
}

// Séance de New York précédente (week-ends et jours fériés sautés).
export function seancePrecedente(seance: string): string {
  let d = veille(seance);
  for (;;) {
    const j = new Date(Date.parse(`${d}T00:00:00Z`)).getUTCDay();
    if (j !== 0 && j !== 6 && !estFerieNyse(d)) return d;
    d = veille(d);
  }
}

// Début de la fenêtre des publications à signaler avant la séance : la dernière clôture de
// New York (16 h), nuit asiatique et européenne comprises.
export function debutPublications(seance: string): string {
  return instantLocal(seancePrecedente(seance), "16:00", "America/New_York");
}

export const LIBELLES_SESSIONS: Record<Session, [string, string]> = {
  asie: ["Asie", "Asia"],
  londres: ["Londres", "London"],
  new_york: ["New York", "New York"],
};
