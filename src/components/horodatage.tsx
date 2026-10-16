"use client";

import { useSyncExternalStore } from "react";

// Heure courante arrondie à la minute, uniquement côté navigateur : l'affichage
// se fait dans le fuseau et la langue de l'utilisateur, pas ceux du serveur (UTC).
function abonnerMinute(rappel: () => void) {
  const id = setInterval(rappel, 30_000);
  return () => clearInterval(id);
}
const minuteClient = () => Math.floor(Date.now() / 60_000);
const minuteServeur = () => null;

export function useMinuteCourante(): number | null {
  return useSyncExternalStore(abonnerMinute, minuteClient, minuteServeur);
}

const FORMAT_ABSOLU = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

export function formaterRelatif(dateMs: number, maintenantMs: number): string {
  const ecart = Math.max(0, maintenantMs - dateMs);
  const minutes = Math.round(ecart / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.round(minutes / 60);
  if (heures < 48) return `il y a ${heures} h`;
  return `il y a ${Math.round(heures / 24)} j`;
}

export function DateLocale({ iso, options }: { iso: string; options?: Intl.DateTimeFormatOptions }) {
  const minute = useMinuteCourante();
  const date = new Date(iso);
  const texte = minute === null
    ? `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`
    : new Intl.DateTimeFormat("fr-FR", options ?? { dateStyle: "medium", timeStyle: "short" }).format(date);
  return <time dateTime={iso}>{texte}</time>;
}

interface PropsHorodatage {
  iso: string | null | undefined;
  source: string;
  // Au-delà de ce délai (heures), la donnée est signalée comme ancienne.
  seuilHeures?: number;
  className?: string;
}

export function Horodatage({ iso, source, seuilHeures, className = "" }: PropsHorodatage) {
  const minute = useMinuteCourante();
  if (!iso) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs text-discret ${className}`}>
        <span className="size-1.5 rounded-full bg-discret" />
        Pas encore de données · {source}
      </span>
    );
  }
  const dateMs = new Date(iso).getTime();
  const maintenant = minute === null ? null : minute * 60_000;
  const perime = maintenant !== null && seuilHeures !== undefined && maintenant - dateMs > seuilHeures * 3_600_000;
  const relatif = maintenant === null ? null : formaterRelatif(dateMs, maintenant);
  const absolu = minute === null ? undefined : FORMAT_ABSOLU.format(new Date(iso));

  return (
    <span
      title={absolu ? `Dernière mise à jour : ${absolu}` : undefined}
      className={`inline-flex items-center gap-1.5 text-xs ${perime ? "text-alerte" : "text-discret"} ${className}`}
    >
      <span className={`size-1.5 rounded-full ${perime ? "bg-alerte" : "bg-hausse/70"}`} />
      {perime ? "Donnée ancienne · " : "Mis à jour "}
      {relatif ?? "…"} · {source}
    </span>
  );
}

// Jours restants avant un instant, comptés en jours calendaires du fuseau de l'utilisateur.
export function Echeance({ iso }: { iso: string }) {
  const minute = useMinuteCourante();
  if (minute === null) return null;
  const debutJour = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const jours = Math.round((debutJour(new Date(iso)) - debutJour(new Date(minute * 60_000))) / 86_400_000);
  const texte = jours <= 0 ? "aujourd'hui" : jours === 1 ? "demain" : `dans ${jours} j`;
  return <span className={jours <= 1 ? "text-alerte" : "text-attenue"}>{texte}</span>;
}

// Heure d'un article : relative jusqu'à 24 h, puis date et heure locales.
export function HeureArticle({ iso }: { iso: string }) {
  const minute = useMinuteCourante();
  const date = new Date(iso);
  if (minute === null) return <time dateTime={iso}>{iso.slice(0, 16).replace("T", " ")} UTC</time>;
  const maintenant = minute * 60_000;
  const texte = maintenant - date.getTime() < 24 * 3_600_000
    ? formaterRelatif(date.getTime(), maintenant)
    : new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
  return (
    <time dateTime={iso} title={FORMAT_ABSOLU.format(date)}>
      {texte}
    </time>
  );
}
