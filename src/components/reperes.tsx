"use client";

import { Echeance, useMinuteCourante } from "@/components/horodatage";
import { useLangue } from "@/components/langue";
import { instantFuseau } from "@/lib/format";

const NEW_YORK = "America/New_York";

export interface Evenement {
  libelle: string;
  instantUtc: string;
}

// Horaires réguliers de Wall Street (9 h 30 - 16 h, heure de New York), jours fériés non gérés.
function etatWallStreet(maintenant: number): { ouverte: boolean; prochain: number } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: NEW_YORK, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(maintenant)
      .map((x) => [x.type, x.value]),
  );
  const jourIso = (t: number) => new Date(t).toISOString().slice(0, 10);
  const ouvre = (t: number) => new Date(t).getUTCDay() % 6 !== 0;
  const aujourdhui = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day));
  if (ouvre(aujourdhui)) {
    const ouverture = Date.parse(instantFuseau(jourIso(aujourdhui), "09:30", NEW_YORK));
    const cloture = Date.parse(instantFuseau(jourIso(aujourdhui), "16:00", NEW_YORK));
    if (maintenant < ouverture) return { ouverte: false, prochain: ouverture };
    if (maintenant < cloture) return { ouverte: true, prochain: cloture };
  }
  let jour = aujourdhui + 86_400_000;
  while (!ouvre(jour)) jour += 86_400_000;
  return { ouverte: false, prochain: Date.parse(instantFuseau(jourIso(jour), "09:30", NEW_YORK)) };
}

function duree(ms: number, en: boolean): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const heures = Math.floor(minutes / 60);
  if (heures < 24) return en ? `${heures}h${String(minutes % 60).padStart(2, "0")}` : `${heures} h ${String(minutes % 60).padStart(2, "0")}`;
  return `${Math.round(heures / 24)} ${en ? "d" : "j"}`;
}

// Barre d'état : séance de Wall Street et prochains rendez-vous, heures dans le fuseau du navigateur.
export function Reperes({ evenements }: { evenements: Evenement[] }) {
  const { t, locale } = useLangue();
  const minute = useMinuteCourante();
  const maintenant = minute === null ? null : minute * 60_000;
  const marche = maintenant === null ? null : etatWallStreet(maintenant);
  const heure = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
  const jour = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="carte flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-xl border border-bordure bg-surface px-4 py-2.5 text-sm">
      <span className="inline-flex items-center gap-2" title={t("Horaires réguliers, jours fériés non pris en compte", "Regular hours, holidays not included")}>
        <span
          aria-hidden
          className={`size-2 rounded-full ${marche?.ouverte ? "bg-hausse shadow-[0_0_0_4px_var(--color-hausse-doux)]" : "bg-discret"}`}
        />
        {marche === null || maintenant === null
          ? "Wall Street…"
          : marche.ouverte
          ? t(
            `Wall Street ouverte · clôture à ${heure.format(marche.prochain)} (dans ${duree(marche.prochain - maintenant, false)})`,
            `Wall Street open · closes at ${heure.format(marche.prochain)} (in ${duree(marche.prochain - maintenant, true)})`,
          )
          : t(`Wall Street fermée · ouverture ${jour.format(marche.prochain)}`, `Wall Street closed · opens ${jour.format(marche.prochain)}`)}
      </span>
      {evenements.map((e) => (
        <span key={e.libelle} className="inline-flex items-center gap-1.5 text-attenue">
          <span className="text-texte">{e.libelle}</span>
          {maintenant === null ? "…" : jour.format(new Date(e.instantUtc))}
          <span className="text-xs">
            (<Echeance iso={e.instantUtc} />)
          </span>
        </span>
      ))}
    </div>
  );
}
