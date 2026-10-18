import type { ReactNode } from "react";
import { Carte, Pastille } from "@/components/carte";
import { DateLocale, Horodatage } from "@/components/horodatage";
import type { Devise, ForceDevise } from "@/lib/analyse";
import { formaterDateSeance, formaterPb, formaterPct } from "@/lib/format";
import { type Langue, traducteur } from "@/lib/i18n";
import { BANQUES, type EtatMonde } from "@/lib/monde";
import type { EtatCalendrier } from "@/lib/veille";

// Décisions de taux annoncées dans le calendrier de la semaine (Forex Factory) ou les
// calendriers officiels Fed et BCE.
const DECISION = /^(Federal Funds Rate|Main Refinancing Rate|Official Bank Rate|BOJ Policy Rate|SNB Policy Rate|Overnight Rate|Cash Rate|Official Cash Rate)$/;

function prochaineDecision(devise: Devise, calendrier: EtatCalendrier): string | null {
  const maintenant = Date.now();
  const ff = calendrier.mondial.find((e) => e.devise === devise && DECISION.test(e.titreEn ?? "") && Date.parse(e.instant) > maintenant - 3_600_000);
  if (ff) return ff.instant;
  return calendrier.reunions.find((r) => r.devise === devise)?.annonceUtc ?? null;
}

function Ligne({ libelle, children }: { libelle: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="whitespace-nowrap text-attenue">{libelle}</span>
      <span className="chiffres min-w-0 text-right">{children}</span>
    </div>
  );
}

// Couleurs sans jugement : une politique restrictive n'est ni bonne ni mauvaise en soi.
const TON_ORIENTATION = { restrictive: "alerte", accommodante: "accent", neutre: "neutre" } as const;

export function SectionBanques({ monde, forces, calendrier, langue }: { monde: EtatMonde; forces: ForceDevise[]; calendrier: EtatCalendrier; langue: Langue }) {
  const t = traducteur(langue);
  const orientation = new Map(forces.map((f) => [f.devise, f.orientation]));
  const libelleOrientation = {
    restrictive: t("Restrictive (hawkish)", "Hawkish"),
    accommodante: t("Accommodante (dovish)", "Dovish"),
    neutre: t("Neutre, selon les données", "Neutral, data-dependent"),
  };

  return (
    <Carte
      titre={t("Banques centrales", "Central banks")}
      sousTitre={t(
        "Taux directeurs, dernier mouvement, orientation déduite des décisions récentes et de la tendance de l'inflation, taux réel, prochaine décision. Inflation, chômage et PIB : widget Macroéconomie.",
        "Policy rates, last move, stance inferred from recent decisions and the inflation trend, real rate, next decision. Inflation, jobs and GDP: Macro widget.",
      )}
      pied={
        <div className="flex flex-col gap-1">
          <p className="text-xs text-discret">
            {t(
              "Anticipations de taux du marché (futures) : pas de source gratuite fiable ; l'orientation est une règle, pas une prévision. Inflation japonaise : pas de source gratuite à jour.",
              "Market rate expectations (futures): no reliable free source; the stance is a rule, not a forecast. Japanese inflation: no up-to-date free source.",
            )}
          </p>
          <Horodatage iso={monde.majLe} source={t("BRI, FRED, OCDE, BNS, Eurostat", "BIS, FRED, OECD, SNB, Eurostat")} seuilHeures={36} />
        </div>
      }
    >
      <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,15.5rem),1fr))]">
        {monde.lignes.map((l) => {
          const o = orientation.get(l.devise) ?? "neutre";
          const decision = prochaineDecision(l.devise, calendrier);
          const banque = BANQUES[l.devise];
          return (
            <li key={l.devise} className="flex flex-col gap-2 rounded-xl bg-surface-2 p-3.5">
              <header className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {l.devise} <span className="font-normal text-attenue">· {t(banque.fr, banque.en)}</span>
                  </p>
                  <p className="truncate text-xs text-discret">{t(banque.pays.fr, banque.pays.en)}</p>
                </div>
                <span className="chiffres text-xl font-semibold">{l.taux === null ? "—" : formaterPct(l.taux, 2, false, langue)}</span>
              </header>
              <Pastille ton={TON_ORIENTATION[o]}>{libelleOrientation[o]}</Pastille>
              <div className="flex flex-col gap-1">
                <Ligne libelle={t("Dernière décision", "Last move")}>
                  {l.dernierPb === null ? "—" : (
                    <>
                      <span className="font-medium">{formaterPb(l.dernierPb, langue)}</span>
                      <span className="block text-[0.7rem] text-discret">{formaterDateSeance(l.depuis, langue)}</span>
                    </>
                  )}
                </Ligne>
                {l.precedentPb !== null && (
                  <Ligne libelle={t("Précédente", "Previous")}>
                    <span>{formaterPb(l.precedentPb, langue)}</span>
                    <span className="block text-[0.7rem] text-discret">{formaterDateSeance(l.precedentDate, langue)}</span>
                  </Ligne>
                )}
                <Ligne libelle={t("Taux réel", "Real rate")}>
                  {l.tauxReel === null ? <span className="text-discret">—</span> : <span className="font-medium">{formaterPct(l.tauxReel, 1, true, langue)}</span>}
                </Ligne>
                <Ligne libelle={t("Prochaine décision", "Next decision")}>
                  {decision ? (
                    <span className="font-medium text-alerte">
                      <DateLocale iso={decision} options={{ weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }} />
                    </span>
                  ) : (
                    <span className="text-xs text-discret">{t("hors semaine", "not this week")}</span>
                  )}
                </Ligne>
              </div>
            </li>
          );
        })}
      </ul>
      {monde.lignes.every((l) => l.taux === null) && (
        <p className="mt-3 text-sm text-attenue">{t("Pas encore de données.", "No data yet.")}</p>
      )}
    </Carte>
  );
}
