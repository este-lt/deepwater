// Sessions de cotation des contrats à terme sur indices américains (ES, NQ), pour une séance
// de New York donnée (date D), changements d'heure compris :
//   asie      de la réouverture du Globex (18 h à New York, la veille de D) à l'ouverture de Londres
//   londres   de l'ouverture de Londres (8 h à Londres) à l'ouverture de New York
//   new_york  de 9 h 30 à 16 h à New York
// Utilisé par calcul-biais (biais par session) et collecte-sessions (cours par session).

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

// Session visée pour la séance `seance` (voir seanceVisee) : celle qui commence dans l'heure,
// sinon celle en cours (avant la réouverture de la veille, la session asiatique qui vient).
export function sessionVisee(maintenant: Date, seance: string): Session {
  const t = maintenant.getTime() + 3_600_000;
  if (t < Date.parse(bornesSession(seance, "londres").debut)) return "asie";
  if (t < Date.parse(bornesSession(seance, "new_york").debut)) return "londres";
  return "new_york";
}

// Début de la session précédente (pour lister ce qui a été publié depuis).
export function debutSessionPrecedente(seance: string, session: Session): string {
  if (session === "londres") return bornesSession(seance, "asie").debut;
  if (session === "new_york") return bornesSession(seance, "londres").debut;
  // Session asiatique : la séance de New York précédente (la veille ouvrée au plus tard).
  return instantLocal(veille(seance), "09:30", "America/New_York");
}

export const LIBELLES_SESSIONS: Record<Session, [string, string]> = {
  asie: ["Asie", "Asia"],
  londres: ["Londres", "London"],
  new_york: ["New York", "New York"],
};
