import { Carte } from "@/components/carte";
import { Horodatage } from "@/components/horodatage";
import type { Devise } from "@/lib/analyse";
import { formaterPct, formaterPeriode } from "@/lib/format";
import { type Langue, traducteur } from "@/lib/i18n";
import type { IndicateurAffiche } from "@/lib/macro";
import { BANQUES, type EtatMonde, type Mesure } from "@/lib/monde";

const FLECHES = { hausse: "↗", baisse: "↘", neutre: "→" } as const;
// Les « Holy 8 », dans l'ordre d'affichage : États-Unis en détail, puis les sept autres.
const HOLY_8: Devise[] = ["USD", "EUR", "GBP", "CAD", "JPY", "CHF", "AUD", "NZD"];

const CASE = "flex flex-col gap-1 rounded-xl bg-surface-2 p-3";
const GRILLE = "grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,11.5rem),1fr))]";

function CaseMesure({ libelle, m, langue, signe = false }: { libelle: string; m: Mesure | null; langue: Langue; signe?: boolean }) {
  const t = traducteur(langue);
  const delta = m && m.precedente !== null ? m.valeur - m.precedente : null;
  const tendance = delta === null || Math.abs(delta) < 0.05 ? "neutre" : delta > 0 ? "hausse" : "baisse";
  return (
    <li className={CASE}>
      <span className="text-xs text-attenue">{libelle}</span>
      {m ? (
        <>
          <span className="chiffres flex items-baseline gap-1.5 text-lg font-semibold">
            {formaterPct(m.valeur, 1, signe, langue)}
            <span className="text-sm font-normal text-attenue" aria-label={tendance}>{FLECHES[tendance]}</span>
          </span>
          {m.precedente !== null && (
            <span className="chiffres text-xs text-attenue">{t("précédent", "previous")} {formaterPct(m.precedente, 1, signe, langue)}</span>
          )}
          <span className="text-[0.7rem] text-discret">{t("Période :", "Period:")} {formaterPeriode(m.date, m.trimestrielle ? "trimestre" : "mois", langue)}</span>
        </>
      ) : (
        <span className="text-sm text-discret">{t("indisponible", "unavailable")}</span>
      )}
    </li>
  );
}

function Titre({ devise, langue }: { devise: Devise; langue: Langue }) {
  const t = traducteur(langue);
  const b = BANQUES[devise];
  return (
    <h3 className="sticky top-0 z-[1] flex items-baseline gap-2 bg-surface pb-2 pt-1 text-sm font-semibold">
      {t(b.pays.fr, b.pays.en)} <span className="font-normal text-attenue">· {devise} · {t(b.fr, b.en)}</span>
    </h3>
  );
}

export function SectionMacro({ indicateurs, monde, langue }: { indicateurs: IndicateurAffiche[]; monde: EtatMonde; langue: Langue }) {
  const t = traducteur(langue);
  const majUs = indicateurs.map((i) => i.majLe).filter((d): d is string => d !== null).sort().at(-1);
  const majLe = [majUs, monde.majLe].filter((d): d is string => !!d).sort().at(-1);
  const lignes = new Map(monde.lignes.map((l) => [l.devise, l]));

  return (
    <Carte
      titre={t("Macroéconomie : les 8 grandes économies", "Macro: the 8 major economies")}
      sousTitre={t(
        "États-Unis en détail, puis zone euro, Royaume-Uni, Canada, Japon, Suisse, Australie et Nouvelle-Zélande : faites défiler. La flèche indique le sens de variation, pas un jugement.",
        "United States in detail, then euro area, UK, Canada, Japan, Switzerland, Australia and New Zealand: scroll through. The arrow shows the direction of change, not a judgement.",
      )}
      pied={<Horodatage iso={majLe} source={t("FRED (BLS, BEA), OCDE, BNS, Eurostat", "FRED (BLS, BEA), OECD, SNB, Eurostat")} seuilHeures={24 * 8} />}
    >
      <nav aria-label={t("Aller à une économie", "Jump to an economy")} className="mb-3 flex flex-wrap gap-1.5">
        {HOLY_8.map((d) => (
          <a
            key={d}
            href={`#macro-${d}`}
            className="chiffres rounded-full border border-bordure px-2.5 py-1 text-xs font-medium text-attenue transition-colors hover:border-bordure-forte hover:text-texte"
          >
            {d}
          </a>
        ))}
      </nav>

      <div tabIndex={0} aria-label={t("Indicateurs par économie, zone défilante", "Indicators by economy, scrollable area")} className="flex max-h-[34rem] flex-col gap-5 overflow-y-auto overscroll-contain pr-1">
        <section id="macro-USD" className="scroll-mt-1">
          <Titre devise="USD" langue={langue} />
          <ul className={GRILLE}>
            {indicateurs.map((i) => (
              <li key={i.cle} className={CASE}>
                <span className="text-xs text-attenue">{i.libelle}</span>
                {i.valeur ? (
                  <>
                    <span className="chiffres flex items-baseline gap-1.5 text-lg font-semibold">
                      {i.valeur}
                      <span className="text-sm font-normal text-attenue" aria-label={i.tendance}>{FLECHES[i.tendance]}</span>
                    </span>
                    {i.detail && <span className="chiffres text-xs text-attenue">{i.detail}</span>}
                    <span className="text-[0.7rem] text-discret">{t("Période :", "Period:")} {formaterPeriode(i.date, i.frequence, langue)}</span>
                  </>
                ) : i.absence ? (
                  <>
                    <span className="text-sm text-discret">{i.absence}</span>
                    <span className="text-[0.7rem] text-discret">{t("Période :", "Period:")} {formaterPeriode(i.date, i.frequence, langue)}</span>
                  </>
                ) : (
                  <span className="text-sm text-discret">{t("Pas encore collecté", "Not collected yet")}</span>
                )}
              </li>
            ))}
          </ul>
        </section>

        {HOLY_8.slice(1).map((d) => {
          const l = lignes.get(d);
          return (
            <section key={d} id={`macro-${d}`} className="scroll-mt-1">
              <Titre devise={d} langue={langue} />
              <ul className={GRILLE}>
                <CaseMesure libelle={t("Inflation (sur 1 an)", "Inflation (y/y)")} m={l?.inflation ?? null} langue={langue} />
                <CaseMesure libelle={t("Taux de chômage", "Unemployment rate")} m={l?.chomage ?? null} langue={langue} />
                <CaseMesure libelle={t("PIB (sur 1 trimestre)", "GDP (q/q)")} m={l?.pib ?? null} langue={langue} signe />
                <li className={CASE}>
                  <span className="text-xs text-attenue">{t("Taux directeur et taux réel", "Policy rate and real rate")}</span>
                  <span className="chiffres text-lg font-semibold">{l?.taux === null || l?.taux === undefined ? "—" : formaterPct(l.taux, 2, false, langue)}</span>
                  <span className="chiffres text-xs text-attenue">
                    {t("réel", "real")} {l?.tauxReel === null || l?.tauxReel === undefined ? "—" : formaterPct(l.tauxReel, 1, true, langue)}
                  </span>
                </li>
              </ul>
            </section>
          );
        })}
      </div>
    </Carte>
  );
}
