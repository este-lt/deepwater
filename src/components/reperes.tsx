"use client";

import { Pastille } from "@/components/carte";
import { Echeance, useMinuteCourante } from "@/components/horodatage";
import { instantFuseau } from "@/lib/format";

const NEW_YORK = "America/New_York";
const TONS = { haussier: "hausse", baissier: "baisse", neutre: "neutre" } as const;
const LIBELLES = { haussier: "Haussier", baissier: "Baissier", neutre: "Neutre" } as const;

export interface DonneesReperes {
  reunion: { banque: string; annonceUtc: string } | null;
  biais: { nom: string; biais: keyof typeof TONS; score: number }[];
  actualites: { total: number; fortes: number; jours: number };
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

function duree(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const heures = Math.floor(minutes / 60);
  if (heures < 24) return `${heures} h ${String(minutes % 60).padStart(2, "0")}`;
  return `${Math.round(heures / 24)} j`;
}

const heure = (t: number) => new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(t);
const jourCourt = (t: number) => new Intl.DateTimeFormat("fr-FR", { weekday: "long" }).format(t);

export function Reperes({ donnees }: { donnees: DonneesReperes }) {
  const minute = useMinuteCourante();
  const maintenant = minute === null ? null : minute * 60_000;
  const salutation = maintenant === null ? "Bonjour" : new Date(maintenant).getHours() >= 18 ? "Bonsoir" : "Bonjour";
  const marche = maintenant === null ? null : etatWallStreet(maintenant);
  const demain = maintenant !== null && marche !== null && new Date(marche.prochain).toDateString() !== new Date(maintenant).toDateString();

  return (
    <section
      aria-label="Repères du jour"
      className="flex h-full min-w-0 flex-col gap-4 rounded-carte border border-bordure bg-gradient-to-br from-accent-doux via-surface to-surface p-5 animate-apparition sm:p-6"
    >
      <div>
        <p className="text-lg font-semibold tracking-tight">{salutation}</p>
        <p className="text-sm text-attenue first-letter:uppercase">
          {maintenant === null ? "…" : new Intl.DateTimeFormat("fr-FR", { dateStyle: "full" }).format(maintenant)}
        </p>
      </div>

      <dl className="grid gap-3 text-sm">
        <div className="flex items-start gap-3">
          <dt className="sr-only">Wall Street</dt>
          <span
            aria-hidden
            className={`mt-1.5 size-2 shrink-0 rounded-full ${marche?.ouverte ? "bg-hausse shadow-[0_0_0_4px_var(--color-hausse-doux)]" : "bg-discret"}`}
          />
          <dd>
            {marche === null ? (
              "Wall Street…"
            ) : marche.ouverte ? (
              <>Wall Street est ouverte · clôture dans {duree(marche.prochain - maintenant!)} ({heure(marche.prochain)} chez vous)</>
            ) : (
              <>
                Wall Street est fermée · ouverture {demain ? jourCourt(marche.prochain) : "aujourd'hui"} à {heure(marche.prochain)} chez vous
                {!demain && ` (dans ${duree(marche.prochain - maintenant!)})`}
              </>
            )}
            <span className="block text-xs text-discret">Horaires réguliers, jours fériés non pris en compte</span>
          </dd>
        </div>

        {donnees.reunion && (
          <div className="flex items-start gap-3">
            <dt className="sr-only">Prochaine décision de taux</dt>
            <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" />
            <dd>
              Prochaine décision de taux : {donnees.reunion.banque},{" "}
              {maintenant === null
                ? "…"
                : new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(
                  new Date(donnees.reunion.annonceUtc),
                )}{" "}
              · <Echeance iso={donnees.reunion.annonceUtc} />
            </dd>
          </div>
        )}

        <div className="flex items-start gap-3">
          <dt className="sr-only">Actualités</dt>
          <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-alerte/80" />
          <dd>
            {donnees.actualites.total} actualités retenues sur {donnees.actualites.jours} jours
            {donnees.actualites.fortes > 0 && `, dont ${donnees.actualites.fortes} à fort impact`}
          </dd>
        </div>
      </dl>

      {donnees.biais.length > 0 && (
        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-bordure pt-3 text-sm">
          <span className="text-attenue">Biais du jour</span>
          {donnees.biais.map((b) => (
            <span key={b.nom} className="inline-flex items-center gap-1.5">
              <span className="text-xs text-attenue">{b.nom}</span>
              <Pastille ton={TONS[b.biais]}>{LIBELLES[b.biais]}</Pastille>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
