import { Carte, Pastille } from "@/components/carte";
import { type CleFacteur, type ForceDevise, type LienIntermarche, type Moteur, type Paire } from "@/lib/analyse";
import { formaterDateSeance, formaterPb, formaterPct } from "@/lib/format";
import { type Langue, traducteur } from "@/lib/i18n";

// Sept facteurs (aucune analyse technique) : une étoile par facteur aligné.
export const FACTEURS: Record<CleFacteur, { fr: string; en: string; court: string; courtEn: string }> = {
  portage: { fr: "Portage (taux directeur face aux autres)", en: "Carry (policy rate vs the others)", court: "P", courtEn: "C" },
  tauxReel: { fr: "Taux réel (taux directeur moins inflation)", en: "Real rate (policy rate minus inflation)", court: "R", courtEn: "R" },
  orientation: { fr: "Orientation de la banque centrale", en: "Central bank stance", court: "O", courtEn: "S" },
  macro: { fr: "Croissance et emploi", en: "Growth and jobs", court: "C", courtEn: "G" },
  regime: { fr: "Sentiment risk-on / risk-off", en: "Risk-on / risk-off sentiment", court: "S", courtEn: "M" },
  intermarche: { fr: "Corrélations inter-marchés (pétrole, or, S&P 500, yuan, devises moteurs)", en: "Intermarket correlations (oil, gold, S&P 500, yuan, driver currencies)", court: "I", courtEn: "I" },
  positionnement: { fr: "Positionnement des fonds (COT, lecture contrarienne)", en: "Fund positioning (COT, contrarian reading)", court: "F", courtEn: "P" },
};

const NOMS_MOTEURS: Record<Moteur, [string, string]> = {
  petrole: ["Pétrole", "Oil"], or: ["Or", "Gold"], sp500: ["S&P 500", "S&P 500"], yuan: ["Yuan", "Yuan"],
  USD: ["USD", "USD"], EUR: ["EUR", "EUR"], AUD: ["AUD", "AUD"],
};
const DEVISE_MOTEUR = new Set<Moteur>(["USD", "EUR", "AUD"]);

// « Pétrole +8,2 % ↗ » : valeur du moteur (variation sur 20 séances, ou score de la devise
// moteur) et effet sur la devise selon la fiche de corrélations.
function texteLien(l: LienIntermarche, langue: Langue): string {
  const nom = NOMS_MOTEURS[l.moteur][langue === "en" ? 1 : 0];
  const valeur = l.valeur === null
    ? "—"
    : DEVISE_MOTEUR.has(l.moteur)
    ? `${l.valeur > 0 ? "+" : l.valeur < 0 ? "−" : ""}${Math.round(Math.abs(l.valeur) * 100)}`
    : formaterPct(l.valeur, 1, true, langue);
  const effet = l.note === null ? "" : l.note >= 0.15 ? " ↗" : l.note <= -0.15 ? " ↘" : " →";
  return `${nom} ${valeur}${effet}`;
}

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
            {langue === "en" ? FACTEURS[k].courtEn : FACTEURS[k].court}
          </span>
        );
      })}
    </span>
  );
}

export function SectionDevises({ forces, paires, langue }: { forces: ForceDevise[]; paires: Paire[]; langue: Langue }) {
  const t = traducteur(langue);
  const valides = forces.filter((f) => f.score !== null);
  return (
    <Carte
      titre={t("Force des devises", "Currency strength")}
      sousTitre={t(
        "Biais par devise sur données concrètes : taux, inflation, banques centrales, croissance, sentiment",
        "Bias per currency from concrete data: rates, inflation, central banks, growth, sentiment",
      )}
      pied={
        <p className="text-xs text-discret">
          {t(
            "Scoring automatique par règles, aucune analyse technique (pondérations : portage 13 %, taux réel 13 %, orientation 18 %, croissance et emploi avec surprises face au consensus 14 %, sentiment 12 %, corrélations inter-marchés 18 %, positionnement COT 12 %), pas un conseil en investissement. Corrélations (fiche Aupa Traders) : pétrole → CAD, or → CHF et JPY, S&P 500 → AUD, NZD (et CHF à l'inverse), yuan → AUD, dollar → EUR, JPY, AUD, NZD (à l'inverse) et CAD, euro → GBP, AUD → NZD ; actifs sur 20 séances, devises moteurs par leur score fondamental. Positionnement : fonds à effet de levier très acheteurs d'une devise = fragile. Étoiles : nombre de facteurs qui donnent le même sens à la paire (7 étoiles : tous).",
            "Automatic rules-based score, no technical analysis (weights: carry 13%, real rate 13%, stance 18%, growth and jobs with consensus surprises 14%, sentiment 12%, intermarket correlations 18%, COT positioning 12%), not investment advice. Correlations (Aupa Traders sheet): oil → CAD, gold → CHF and JPY, S&P 500 → AUD, NZD (and CHF inversely), yuan → AUD, dollar → EUR, JPY, AUD, NZD (inversely) and CAD, euro → GBP, AUD → NZD; assets over 20 sessions, driver currencies by their fundamental score. Positioning: leveraged funds heavily long a currency = fragile. Stars: number of factors pointing the same way for the pair (7 stars: all).",
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
                    <span className="chiffres">
                      {t("taux", "rate")} {f.tauxDirecteur === null ? "—" : formaterPct(f.tauxDirecteur, 2, false, langue)}
                      {" · "}
                      {t("réel", "real")} {f.tauxReel === null ? "—" : formaterPct(f.tauxReel, 1, true, langue)}
                      {f.dernierMouvement && ` · ${formaterPb(f.dernierMouvement.ecartPb, langue)} ${t("le", "on")} ${formaterDateSeance(f.dernierMouvement.date, langue)}`}
                    </span>
                    <span className="chiffres basis-full">
                      {t("Corrélations :", "Correlations:")}{" "}
                      {f.liens.length ? f.liens.map((l) => texteLien(l, langue)).join(" · ") : t("aucun moteur dans la fiche", "no driver in the sheet")}
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
                    <span aria-label={`${p.etoiles} / ${ordre.length}`} className="tracking-widest text-alerte">
                      {"★".repeat(p.etoiles)}<span className="text-surface-3">{"★".repeat(ordre.length - p.etoiles)}</span>
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
