import { Carte } from "@/components/carte";
import { Horodatage } from "@/components/horodatage";
import { formaterPeriode } from "@/lib/format";
import { type Langue, traducteur } from "@/lib/i18n";
import type { IndicateurAffiche } from "@/lib/macro";

const FLECHES = { hausse: "↗", baisse: "↘", neutre: "→" } as const;

export function SectionMacro({ indicateurs, langue }: { indicateurs: IndicateurAffiche[]; langue: Langue }) {
  const t = traducteur(langue);
  const majLe = indicateurs.map((i) => i.majLe).filter((d): d is string => d !== null).sort().at(-1);
  return (
    <Carte
      titre={t("Macroéconomie américaine", "US macro")}
      sousTitre={t("Dernières publications officielles. La flèche indique le sens de variation, pas un jugement.", "Latest official releases. The arrow shows the direction of change, not a judgement.")}
      pied={<Horodatage iso={majLe} source={t("FRED (BLS, BEA, ministère du Travail)", "FRED (BLS, BEA, Department of Labor)")} seuilHeures={24 * 8} />}
    >
      <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,11.5rem),1fr))]">
        {indicateurs.map((i) => (
          <li key={i.cle} className="flex flex-col gap-1 rounded-xl bg-surface-2 p-3">
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
    </Carte>
  );
}
