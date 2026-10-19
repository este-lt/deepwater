import { Carte } from "@/components/carte";
import { DateLocale } from "@/components/horodatage";
import type { EtatFondamentaux } from "@/lib/fondamentaux";
import { formaterNombre } from "@/lib/format";
import { type Langue, traducteur } from "@/lib/i18n";

const FAMILLES: Record<string, [string, string]> = {
  inflation: ["Inflation", "Inflation"], emploi: ["Emploi", "Jobs"], chomage: ["Chômage", "Unemployment"], croissance: ["Croissance", "Growth"], autre: ["Autre", "Other"],
};

const valeur = (v: number | null, unite: string | null, langue: Langue) => {
  if (v === null) return "—";
  const d = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : Math.abs(v) < 1 && v !== 0 ? 2 : 1;
  return `${formaterNombre(v, d, langue)}${unite === "%" ? (langue === "en" ? "%" : " %") : unite ? ` ${unite}` : ""}`;
};

// Chiffres publiés face au consensus (14 jours), lus dans le fil instantané : la surprise est
// l'écart au consensus, ramené entre −100 et +100 (0,2 pt pour un pourcentage, 5 % sinon).
export function SectionConsensus({ f, langue }: { f: EtatFondamentaux; langue: Langue }) {
  const t = traducteur(langue);
  return (
    <Carte
      titre={t("Chiffres publiés face au consensus", "Releases vs consensus")}
      sousTitre={t("14 derniers jours, toutes économies", "Last 14 days, all economies")}
      pied={
        <p className="text-xs text-attenue">
          {t(
            "Lus dans les titres du fil instantané (FinancialJuice, InvestingLive) quand le consensus y est chiffré ; jamais de valeur inventée. Surprise : écart au consensus ramené entre −100 et +100 (0,2 point pour un pourcentage, 5 % du consensus sinon).",
            "Read from live squawk headlines (FinancialJuice, InvestingLive) when the consensus is given; no value is ever invented. Surprise: gap to consensus scaled from −100 to +100 (0.2 point for a percentage, 5% of consensus otherwise).",
          )}
        </p>
      }
    >
      {f.consensus.length === 0 ? (
        <p className="text-sm text-attenue">{t("Aucun chiffre avec consensus sur la période.", "No release with consensus over the period.")}</p>
      ) : (
        <ul className="flex max-h-[28rem] flex-col divide-y divide-bordure overflow-y-auto pr-1">
          {f.consensus.map((c) => {
            const s = Math.round(Number(c.surprise) * 100);
            return (
              <li key={c.id} className="flex flex-col gap-0.5 py-2 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    {c.devise && <span className="mr-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-[0.7rem] font-semibold">{c.devise}</span>}
                    {c.libelle}
                  </span>
                  <span
                    className={`chiffres shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold ${s >= 15 ? "bg-hausse-doux text-hausse" : s <= -15 ? "bg-baisse-doux text-baisse" : "bg-neutre-doux text-neutre"}`}
                    title={t("Surprise (au-dessus du consensus si positive)", "Surprise (above consensus when positive)")}
                  >
                    {s > 0 ? "+" : s < 0 ? "−" : ""}{Math.abs(s)}
                  </span>
                </div>
                <span className="chiffres text-xs text-attenue">
                  {t("Publié", "Actual")} {valeur(Number(c.publie), c.unite, langue)} · {t("consensus", "consensus")} {valeur(Number(c.prevision), c.unite, langue)}
                  {c.precedent !== null && ` · ${t("précédent", "prior")} ${valeur(Number(c.precedent), c.unite, langue)}`}
                  {" · "}{FAMILLES[c.famille]?.[langue === "en" ? 1 : 0] ?? c.famille} · <DateLocale iso={c.instant} options={{ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Carte>
  );
}
