import { Carte, Pastille } from "@/components/carte";
import type { CleFacteur, ForceDevise, Paire } from "@/lib/analyse";
import { formaterDateSeance, formaterPct } from "@/lib/format";
import { type Langue, traducteur } from "@/lib/i18n";

export const FACTEURS: Record<CleFacteur, { fr: string; en: string; court: string }> = {
  momentum: { fr: "Momentum (5 et 20 séances)", en: "Momentum (5 and 20 sessions)", court: "M" },
  taux: { fr: "Taux directeur et taux réel", en: "Policy and real rate", court: "T" },
  orientation: { fr: "Orientation de la banque centrale", en: "Central bank stance", court: "O" },
  macro: { fr: "Croissance et emploi", en: "Growth and jobs", court: "C" },
  regime: { fr: "Régime risk-on / risk-off", en: "Risk-on / risk-off regime", court: "R" },
};

const ordre = Object.keys(FACTEURS) as CleFacteur[];

function Pastilles({ f, langue }: { f: ForceDevise; langue: Langue }) {
  const t = traducteur(langue);
  return (
    <span className="flex gap-0.5">
      {ordre.map((k) => {
        const v = f.facteurs[k];
        const ton = v === null ? "bg-surface-3 text-discret" : v >= 0.15 ? "bg-hausse-doux text-hausse" : v <= -0.15 ? "bg-baisse-doux text-baisse" : "bg-neutre-doux text-neutre";
        return (
          <span
            key={k}
            title={`${t(FACTEURS[k].fr, FACTEURS[k].en)} : ${v === null ? t("indisponible", "unavailable") : Math.round(v * 100)}`}
            className={`grid size-5 place-items-center rounded text-[0.6rem] font-semibold ${ton}`}
          >
            {langue === "en" && k === "macro" ? "G" : FACTEURS[k].court}
          </span>
        );
      })}
    </span>
  );
}

export function SectionDevises({ forces, paires, dateFx, langue }: { forces: ForceDevise[]; paires: Paire[]; dateFx: string | null; langue: Langue }) {
  const t = traducteur(langue);
  const valides = forces.filter((f) => f.score !== null);
  return (
    <Carte
      titre={t("Force des devises", "Currency strength")}
      sousTitre={`${t("Biais par devise : momentum, taux, orientation, croissance, régime", "Bias per currency: momentum, rates, stance, growth, regime")}${dateFx ? ` · ${t("cours BCE du", "ECB rates of")} ${formaterDateSeance(dateFx, langue)}` : ""}`}
      pied={
        <p className="text-xs text-discret">
          {t(
            "Scoring automatique par règles (pondérations : momentum 35 %, taux 20 %, orientation 20 %, croissance 10 %, régime 15 %), pas un conseil en investissement. Étoiles : nombre de facteurs qui donnent le même sens à la paire.",
            "Automatic rules-based score (weights: momentum 35%, rates 20%, stance 20%, growth 10%, regime 15%), not investment advice. Stars: number of factors pointing the same way for the pair.",
          )}
        </p>
      }
    >
      {valides.length === 0 ? (
        <p className="rounded-xl bg-surface-2 p-4 text-sm text-attenue">{t("Données insuffisantes pour l'instant.", "Not enough data yet.")}</p>
      ) : (
        <div className="flex flex-col gap-5">
          <ul className="flex flex-col gap-2">
            {forces.map((f) => {
              const s = f.score ?? 0;
              const largeur = Math.min(50, Math.abs(s) * 50);
              return (
                <li key={f.devise} className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
                  <span className="text-sm font-semibold">{f.devise}</span>
                  <div className="relative h-2 rounded-full bg-surface-3" aria-hidden>
                    <div className="absolute inset-y-0 left-1/2 w-px bg-bordure-forte" />
                    <div
                      className={`absolute inset-y-0 rounded-full ${s >= 0 ? "bg-hausse/80" : "bg-baisse/80"}`}
                      style={s >= 0 ? { left: "50%", width: `${largeur}%` } : { left: `${50 - largeur}%`, width: `${largeur}%` }}
                    />
                  </div>
                  <span className="chiffres w-10 text-right text-sm font-medium">{f.score === null ? "—" : `${s > 0 ? "+" : s < 0 ? "−" : ""}${Math.round(Math.abs(s) * 100)}`}</span>
                  <span />
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.7rem] text-discret">
                    <Pastilles f={f} langue={langue} />
                    <span className="chiffres" title={t("Contre le panier des 7 autres devises", "Against the basket of the 7 others")}>
                      {formaterPct(f.var5j, 1, true, langue)} / 5 {t("s.", "s.")} · {formaterPct(f.var20j, 1, true, langue)} / 20 {t("s.", "s.")}
                    </span>
                  </span>
                  <span />
                </li>
              );
            })}
          </ul>

          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-discret">{t("Paires : devise forte contre devise faible", "Pairs: strong vs weak currency")}</h3>
            <ul className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,13rem),1fr))]">
              {paires.map((p) => (
                <li key={p.paire} className="flex flex-col gap-1 rounded-xl bg-surface-2 px-3 py-2">
                  <span className="flex items-center justify-between gap-2">
                    <span className="chiffres font-semibold">{p.paire}</span>
                    <Pastille ton={p.sens === "achat" ? "hausse" : "baisse"}>{p.sens === "achat" ? t("Biais acheteur", "Long bias") : t("Biais vendeur", "Short bias")}</Pastille>
                  </span>
                  <span className="flex items-center justify-between gap-2 text-xs">
                    <span aria-label={`${p.etoiles} / 5`} className="tracking-widest text-alerte">
                      {"★".repeat(p.etoiles)}<span className="text-surface-3">{"★".repeat(5 - p.etoiles)}</span>
                    </span>
                    <span className="chiffres text-discret">{t("écart", "spread")} {Math.round(p.ecart * 100)}</span>
                  </span>
                  <span className="text-[0.7rem] text-discret">
                    {p.facteursAlignes.map((k) => t(FACTEURS[k].fr, FACTEURS[k].en)).join(" · ") || t("aucun facteur net", "no clear factor")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Carte>
  );
}
