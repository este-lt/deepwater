"use client";

import { useSyncExternalStore } from "react";
import { useLangue } from "@/components/langue";
import type { Langue } from "@/lib/i18n";

// Heure courante arrondie à la minute, uniquement côté navigateur : l'affichage
// se fait dans le fuseau de l'utilisateur, pas celui du serveur (UTC).
function abonnerMinute(rappel: () => void) {
  const id = setInterval(rappel, 30_000);
  return () => clearInterval(id);
}
const minuteClient = () => Math.floor(Date.now() / 60_000);
const minuteServeur = () => null;

export function useMinuteCourante(): number | null {
  return useSyncExternalStore(abonnerMinute, minuteClient, minuteServeur);
}

export function formaterRelatif(dateMs: number, maintenantMs: number, langue: Langue = "fr"): string {
  const en = langue === "en";
  const ecart = Math.max(0, maintenantMs - dateMs);
  const minutes = Math.round(ecart / 60_000);
  if (minutes < 1) return en ? "just now" : "à l'instant";
  if (minutes < 60) return en ? `${minutes} min ago` : `il y a ${minutes} min`;
  const heures = Math.round(minutes / 60);
  if (heures < 48) return en ? `${heures} h ago` : `il y a ${heures} h`;
  return en ? `${Math.round(heures / 24)} d ago` : `il y a ${Math.round(heures / 24)} j`;
}

export function DateLocale({ iso, options }: { iso: string; options?: Intl.DateTimeFormatOptions }) {
  const { locale } = useLangue();
  const minute = useMinuteCourante();
  const date = new Date(iso);
  const texte = minute === null
    ? `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`
    : new Intl.DateTimeFormat(locale, options ?? { dateStyle: "medium", timeStyle: "short" }).format(date);
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
  const { langue, t, locale } = useLangue();
  const minute = useMinuteCourante();
  if (!iso) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs text-discret ${className}`}>
        <span className="size-1.5 rounded-full bg-discret" />
        {t("Pas encore de données", "No data yet")} · {source}
      </span>
    );
  }
  const dateMs = new Date(iso).getTime();
  const maintenant = minute === null ? null : minute * 60_000;
  const perime = maintenant !== null && seuilHeures !== undefined && maintenant - dateMs > seuilHeures * 3_600_000;
  const relatif = maintenant === null ? null : formaterRelatif(dateMs, maintenant, langue);
  const absolu = minute === null ? undefined : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

  return (
    <span
      title={absolu ? `${t("Dernière mise à jour :", "Last update:")} ${absolu}` : undefined}
      className={`inline-flex items-center gap-1.5 text-xs ${perime ? "text-alerte" : "text-discret"} ${className}`}
    >
      <span className={`size-1.5 shrink-0 rounded-full ${perime ? "bg-alerte" : "bg-hausse/70"}`} />
      <span>
        {perime ? `${t("Donnée ancienne", "Stale data")} · ` : `${t("Mis à jour", "Updated")} `}
        {relatif ?? "…"} · {source}
      </span>
    </span>
  );
}

// Jours restants avant un instant, comptés en jours calendaires du fuseau de l'utilisateur.
export function Echeance({ iso }: { iso: string }) {
  const { t } = useLangue();
  const minute = useMinuteCourante();
  if (minute === null) return null;
  const debutJour = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const jours = Math.round((debutJour(new Date(iso)) - debutJour(new Date(minute * 60_000))) / 86_400_000);
  const texte = jours < 0 ? t("passé", "past") : jours === 0 ? t("aujourd'hui", "today") : jours === 1 ? t("demain", "tomorrow") : t(`dans ${jours} j`, `in ${jours} d`);
  return <span className={jours >= 0 && jours <= 1 ? "text-alerte" : "text-attenue"}>{texte}</span>;
}

// Heure d'un article : relative jusqu'à 24 h, puis date et heure locales.
export function HeureArticle({ iso }: { iso: string }) {
  const { langue, locale } = useLangue();
  const minute = useMinuteCourante();
  const date = new Date(iso);
  if (minute === null) return <time dateTime={iso}>{iso.slice(0, 16).replace("T", " ")} UTC</time>;
  const maintenant = minute * 60_000;
  const texte = maintenant - date.getTime() < 24 * 3_600_000
    ? formaterRelatif(date.getTime(), maintenant, langue)
    : new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
  return (
    <time dateTime={iso} title={new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date)}>
      {texte}
    </time>
  );
}

// Heure locale seule (« 14:30 »), pour le fil instantané et le calendrier.
export function HeureLocale({ iso }: { iso: string }) {
  const { locale } = useLangue();
  const minute = useMinuteCourante();
  if (minute === null) return <time dateTime={iso}>{iso.slice(11, 16)}</time>;
  return <time dateTime={iso}>{new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso))}</time>;
}
