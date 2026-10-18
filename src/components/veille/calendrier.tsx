"use client";

import { type ReactNode, useState } from "react";
import { Carte } from "@/components/carte";
import { DateLocale, Echeance, HeureLocale, Horodatage, useMinuteCourante } from "@/components/horodatage";
import { useLangue } from "@/components/langue";
import { formaterDateSeance, formaterNombre, formaterPeriode } from "@/lib/format";
import type { EtatCalendrier, Publication } from "@/lib/veille";

const DEVISES = ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "CNY"];

function Puce({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={actif}
      onClick={onClick}
      className={`chiffres rounded-full border px-2 py-0.5 text-[0.7rem] font-medium transition-colors ${
        actif ? "border-accent/60 bg-accent-doux text-accent-clair" : "border-bordure text-attenue hover:border-bordure-forte hover:text-texte"
      }`}
    >
      {children}
    </button>
  );
}

const PASTILLE_IMPACT = { fort: "bg-baisse", moyen: "bg-alerte", faible: "bg-discret" } as const;

// Calendrier mondial de la semaine (Forex Factory) : heure locale, devise, impact,
// consensus et chiffre précédent ; filtres par devise et par impact.
function Mondial({ calendrier }: { calendrier: EtatCalendrier }) {
  const { t, locale } = useLangue();
  const minute = useMinuteCourante();
  const [devises, setDevises] = useState<string[]>([]);
  const [fortSeul, setFortSeul] = useState(false);
  const [passes, setPasses] = useState(false);

  const maintenant = minute === null ? null : minute * 60_000;
  const filtres = calendrier.mondial.filter(
    (e) =>
      (devises.length === 0 || devises.includes(e.devise)) &&
      (!fortSeul || e.impact === "fort") &&
      (passes || maintenant === null || Date.parse(e.instant) + 30 * 60_000 >= maintenant),
  );
  // Regroupement par jour, dans le fuseau du navigateur.
  const format = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" });
  const groupes = new Map<string, typeof filtres>();
  for (const e of filtres) {
    const cle = minute === null ? e.instant.slice(0, 10) : format.format(new Date(e.instant));
    groupes.set(cle, [...(groupes.get(cle) ?? []), e]);
  }
  const jours = [...groupes.entries()];

  if (calendrier.mondial.length === 0) {
    return <p className="rounded-xl bg-surface-2 p-4 text-sm text-attenue">{t("Calendrier mondial pas encore collecté.", "Global calendar not collected yet.")}</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Puce actif={devises.length === 0} onClick={() => setDevises([])}>{t("Toutes", "All")}</Puce>
        {DEVISES.filter((d) => calendrier.mondial.some((e) => e.devise === d)).map((d) => (
          <Puce key={d} actif={devises.includes(d)} onClick={() => setDevises((l) => (l.includes(d) ? l.filter((x) => x !== d) : [...l, d]))}>
            {d}
          </Puce>
        ))}
        <span className="ml-auto flex items-center gap-3 text-xs text-attenue">
          <label className="inline-flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={fortSeul} onChange={(e) => setFortSeul(e.target.checked)} className="size-3.5 accent-[var(--color-accent)]" />
            {t("Impact fort", "High impact")}
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={passes} onChange={(e) => setPasses(e.target.checked)} className="size-3.5 accent-[var(--color-accent)]" />
            {t("Passés", "Past")}
          </label>
        </span>
      </div>
      {jours.length === 0 ? (
        <p className="rounded-xl bg-surface-2 p-4 text-sm text-attenue">
          {!passes && maintenant !== null && calendrier.mondial.every((e) => Date.parse(e.instant) < maintenant)
            ? t(
              "Plus aucun événement d'ici la fin de la semaine. Forex Factory publie le calendrier de la semaine suivante le dimanche ; cochez « Passés » pour revoir celle-ci.",
              "No more events this week. Forex Factory publishes next week's calendar on Sunday; tick “Past” to review this week.",
            )
            : t("Aucun événement pour ce filtre.", "No event for this filter.")}
        </p>
      ) : (
        <div className="flex max-h-[32rem] flex-col gap-3 overflow-y-auto pr-1">
          {jours.map(([jour, evenements]) => (
            <section key={jour}>
              <h4 className="sticky top-0 z-[1] bg-surface pb-1 text-xs font-medium capitalize text-discret">{jour}</h4>
              <table className="w-full text-sm">
                <thead className="sr-only">
                  <tr><th>{t("Heure", "Time")}</th><th>{t("Devise", "Currency")}</th><th>{t("Événement", "Event")}</th><th>{t("Prévision et précédent", "Forecast and previous")}</th></tr>
                </thead>
                <tbody>
                  {evenements.map((e) => {
                    const passe = maintenant !== null && Date.parse(e.instant) < maintenant;
                    return (
                      <tr key={e.id} className={`border-t border-bordure ${passe ? "opacity-50" : ""}`}>
                        <td className="chiffres w-12 py-1.5 pr-2 align-top text-xs text-attenue">{e.ferie ? "—" : <HeureLocale iso={e.instant} />}</td>
                        <td className="w-12 py-1.5 pr-2 align-top">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold">
                            <span aria-label={e.impact} className={`size-1.5 rounded-full ${PASTILLE_IMPACT[e.impact]}`} />
                            {e.devise}
                          </span>
                        </td>
                        <td className={`py-1.5 pr-2 align-top ${e.impact === "fort" ? "font-medium" : ""}`}>{e.libelle}</td>
                        <td className="chiffres whitespace-nowrap py-1.5 pl-1 text-right align-top text-xs">
                          {e.prevision && <span title={t("Consensus (prévision)", "Consensus (forecast)")}>{e.prevision}</span>}
                          {e.precedent && <span className="block text-discret" title={t("Précédent", "Previous")}>{t("préc.", "prev.")} {e.precedent}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function EtatsUnis({ calendrier }: { calendrier: EtatCalendrier }) {
  const { langue, t } = useLangue();
  const agenda = [
    ...calendrier.reunions.map((r) => ({
      cle: `r${r.id}`, badge: r.banque,
      libelle: r.provisoire ? t("Décision de taux (date provisoire)", "Rate decision (provisional date)") : t("Décision de taux", "Rate decision"),
      instant: r.annonceUtc, fort: true,
    })),
    ...calendrier.prevues.map((p) => ({ cle: `p${p.id}`, badge: "US", libelle: p.libelle, instant: p.annonceUtc, fort: p.impact === "fort" })),
  ].sort((a, b) => a.instant.localeCompare(b.instant)).slice(0, 8);

  const nombre = (p: Publication, v: number | null) => {
    if (v === null) return "—";
    const signe = p.signe ? (v > 0 ? "+" : v < 0 ? "−" : "") : v < 0 ? "−" : "";
    return p.unite === "pct" ? `${signe}${formaterNombre(Math.abs(v), 1, langue)}${langue === "en" ? "%" : " %"}` : `${signe}${formaterNombre(Math.abs(v), 0, langue)} k`;
  };
  const ecart = (p: Publication) => {
    if (p.variation === null) return "—";
    const signe = p.variation > 0 ? "+" : p.variation < 0 ? "−" : "";
    return p.unite === "milliers" ? `${signe}${formaterNombre(Math.abs(p.variation), 0, langue)} k` : `${signe}${formaterNombre(Math.abs(p.variation), 1, langue)} pt`;
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-discret">{t("À venir", "Upcoming")}</h3>
        <ul className="flex flex-col gap-1.5">
          {agenda.map((e) => (
            <li key={e.cle} className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2">
              <span className={`grid h-7 w-10 shrink-0 place-items-center rounded-md text-[0.7rem] font-semibold ${e.badge === "US" ? "bg-surface-3 text-attenue" : "bg-accent-doux text-accent-clair"}`}>
                {e.badge}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-sm ${e.fort ? "font-medium" : ""}`}>{e.libelle}</span>
                <span className="block text-xs text-attenue">
                  <DateLocale iso={e.instant} options={{ weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }} />
                </span>
              </span>
              <span className="shrink-0 text-xs font-medium"><Echeance iso={e.instant} /></span>
            </li>
          ))}
        </ul>
        {calendrier.prevues.length === 0 && (
          <p className="mt-2 text-xs text-discret">{t("Dates des prochaines statistiques indisponibles.", "Next release dates unavailable.")}</p>
        )}
      </div>
      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-discret">{t("Dernières publications", "Latest releases")}</h3>
        {calendrier.publications.length === 0 ? (
          <p className="text-sm text-attenue">{t("Pas encore de publication collectée.", "No release collected yet.")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-bordure">
            {calendrier.publications.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2">
                <span className="min-w-0">
                  <span className="block text-sm">{p.libelle}</span>
                  <span className="block text-[0.7rem] text-discret">
                    {formaterPeriode(p.periode, p.frequence, langue)}
                    {!p.dateInconnue && ` · ${t("publié le", "released")} ${formaterDateSeance(p.detecteeLe, langue)}`}
                  </span>
                </span>
                <span className="chiffres text-right">
                  <span className="block text-sm font-semibold">{nombre(p, p.valeur)}</span>
                  <span className="block text-[0.7rem] text-attenue">{t("préc.", "prev.")} {nombre(p, p.precedente)} · {ecart(p)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function SectionCalendrier({ calendrier }: { calendrier: EtatCalendrier }) {
  const { t } = useLangue();
  const [onglet, setOnglet] = useState<"mondial" | "us">("mondial");
  const onglets = [
    { cle: "mondial" as const, libelle: t("Mondial", "Global") },
    { cle: "us" as const, libelle: t("États-Unis (officiel)", "United States (official)") },
  ];
  return (
    <Carte
      titre={t("Calendrier économique", "Economic calendar")}
      sousTitre={t("Heures dans votre fuseau", "Times in your time zone")}
      actions={
        <div role="tablist" className="flex gap-1 rounded-xl bg-surface-2 p-1">
          {onglets.map((o) => (
            <button
              key={o.cle}
              role="tab"
              aria-selected={onglet === o.cle}
              onClick={() => setOnglet(o.cle)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${onglet === o.cle ? "bg-surface-3 text-texte" : "text-attenue hover:text-texte"}`}
            >
              {o.libelle}
            </button>
          ))}
        </div>
      }
      pied={
        onglet === "mondial" ? (
          <div className="flex flex-col gap-1">
            <p className="text-xs text-discret">
              {t(
                "Semaine en cours. Prévision = consensus des économistes ; le chiffre publié arrive dans le fil instantané.",
                "Current week. Forecast = economists' consensus; the actual figure arrives in the live squawk.",
              )}
            </p>
            <Horodatage iso={calendrier.mondialMajLe} source="Forex Factory" seuilHeures={3} />
          </div>
        ) : (
          <Horodatage iso={calendrier.majLe} source={t("FRED (BLS, BEA), federalreserve.gov, ecb.europa.eu", "FRED (BLS, BEA), federalreserve.gov, ecb.europa.eu")} seuilHeures={24 * 10} />
        )
      }
    >
      {onglet === "mondial" ? <Mondial calendrier={calendrier} /> : <EtatsUnis calendrier={calendrier} />}
    </Carte>
  );
}
