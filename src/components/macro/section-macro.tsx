import { Carte } from "@/components/carte";
import { Horodatage } from "@/components/horodatage";
import { formaterDateSeance } from "@/lib/format";
import type { IndicateurAffiche } from "@/lib/macro";

const FLECHES = { hausse: "↗", baisse: "↘", neutre: "→" } as const;

export function SectionMacro({ indicateurs }: { indicateurs: IndicateurAffiche[] }) {
  const majLe = indicateurs.map((i) => i.majLe).filter((d): d is string => d !== null).sort().at(-1);
  return (
    <Carte
      titre="Macroéconomie américaine"
      sousTitre="Dernières publications officielles (Fed, BLS, BEA). Le sens de variation n'est pas un jugement."
      pied={<Horodatage iso={majLe} source="Alpha Vantage (séries FRED, BLS, BEA)" seuilHeures={24 * 8} />}
    >
      <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,11.5rem),1fr))]">
        {indicateurs.map((i) => (
          <li key={i.cle} className="flex flex-col gap-1 rounded-xl bg-surface-2 p-3">
            <span className="text-xs text-attenue">{i.libelle}</span>
            {i.valeur ? (
              <>
                <span className="chiffres flex items-baseline gap-1.5 text-lg font-semibold">
                  {i.valeur}
                  <span className="text-sm font-normal text-attenue" aria-label={`tendance ${i.tendance}`}>
                    {FLECHES[i.tendance]}
                  </span>
                </span>
                {i.detail && <span className="chiffres text-xs text-attenue">{i.detail}</span>}
                <span className="text-[0.7rem] text-discret">Période : {formaterDateSeance(i.date)}</span>
              </>
            ) : (
              <span className="text-sm text-discret">Pas encore collecté</span>
            )}
          </li>
        ))}
      </ul>
    </Carte>
  );
}
