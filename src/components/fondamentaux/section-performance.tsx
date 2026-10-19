import { Carte, Pastille } from "@/components/carte";
import type { EtatFondamentaux, PerformanceIndice, StatsBiais } from "@/lib/fondamentaux";
import { formaterDateSeance, formaterNombre, formaterPb, formaterPct } from "@/lib/format";
import { type Langue, traducteur } from "@/lib/i18n";

const NOMS_INDICES: Record<string, string> = { SPX: "S&P 500", NDX: "Nasdaq-100" };
const ACTIFS: { cle: string; fr: string; en: string; pb?: boolean }[] = [
  { cle: "SPX", fr: "S&P 500", en: "S&P 500" },
  { cle: "NDX", fr: "Nasdaq-100", en: "Nasdaq-100" },
  { cle: "US10Y", fr: "Taux 10 ans", en: "10Y yield", pb: true },
  { cle: "DXY", fr: "Dollar", en: "Dollar" },
  { cle: "EURUSD", fr: "EUR/USD", en: "EUR/USD" },
  { cle: "USDJPY", fr: "USD/JPY", en: "USD/JPY" },
  { cle: "XAU", fr: "Or", en: "Gold" },
  { cle: "WTI", fr: "Pétrole", en: "Oil" },
];
const REGIMES: Record<string, [string, string, string]> = {
  expansion: ["Expansion", "Expansion", "croissance au-dessus de la normale, inflation contenue"],
  reflation: ["Reflation", "Reflation", "croissance et inflation en hausse"],
  "déflation": ["Déflation", "Deflation", "croissance et inflation en baisse"],
  stagflation: ["Stagflation", "Stagflation", "croissance faible, inflation forte"],
};
const REGIMES_EN: Record<string, string> = {
  expansion: "above-trend growth, contained inflation",
  reflation: "rising growth and inflation",
  "déflation": "falling growth and inflation",
  stagflation: "weak growth, high inflation",
};

const SESSIONS_COURT = { asie: ["Asie", "Asia"], londres: ["Londres", "London"], new_york: ["NY", "NY"] } as const;
const NOMS_BIAIS = { haussier: ["haussier", "bullish"], baissier: ["baissier", "bearish"], neutre: ["neutre", "neutral"] } as const;
const pc = (v: number | null, langue: Langue) => (v === null ? "—" : `${formaterNombre(v * 100, 0, langue)}${langue === "en" ? "%" : " %"}`);

function LigneStats({ nom, s, reference, langue }: { nom: string; s: StatsBiais; reference: number | null; langue: Langue }) {
  const avantage = s.reussite !== null && reference !== null ? s.reussite - reference : null;
  return (
    <tr className="border-t border-bordure">
      <td className="py-1.5">{nom}</td>
      <td className="py-1.5 text-right">{formaterNombre(s.seances, 0, langue)}</td>
      <td className="py-1.5 text-right">
        {pc(s.reussite, langue)}
        {avantage !== null && <span className={`ml-1 text-xs ${avantage > 0.02 ? "text-hausse" : avantage < -0.02 ? "text-baisse" : "text-attenue"}`}>({avantage > 0 ? "+" : "−"}{formaterNombre(Math.abs(avantage) * 100, 0, langue)})</span>}
      </td>
      <td className="py-1.5 text-right">{formaterPct(s.moyenne1j, 2, true, langue)}</td>
      <td className="py-1.5 text-right">{formaterPct(s.moyenne5j, 2, true, langue)}</td>
    </tr>
  );
}

function TableauIndice({ p, langue }: { p: PerformanceIndice; langue: Langue }) {
  const t = traducteur(langue);
  if (p.seances === 0) return null;
  return (
    <div className="min-w-0">
      <h3 className="mb-1 text-sm font-semibold">{NOMS_INDICES[p.indice] ?? p.indice}</h3>
      <p className="mb-2 text-xs text-attenue">
        {formaterNombre(p.seances, 0, langue)} {t("séances depuis le", "sessions since")} {formaterDateSeance(p.depuis, langue)} · {t("séances en hausse, tous biais confondus :", "up sessions, all biases:")} {pc(p.hausseSpontanee, langue)}
      </p>
      <div className="overflow-x-auto">
        <table className="chiffres w-full min-w-[24rem] text-sm">
          <thead className="text-left text-xs text-attenue">
            <tr>
              <th className="pb-1 font-medium">{t("Biais", "Bias")}</th>
              <th className="pb-1 text-right font-medium">{t("Séances", "Sessions")}</th>
              <th className="pb-1 text-right font-medium" title={t("Sens de la séance conforme au biais ; entre parenthèses, l'écart en points à la fréquence de base", "Session moved in the bias direction; in brackets, gap in points to the base rate")}>{t("Réussite", "Hit rate")}</th>
              <th className="pb-1 text-right font-medium">{t("Séance moy.", "Avg session")}</th>
              <th className="pb-1 text-right font-medium">{t("5 séances moy.", "Avg 5 sessions")}</th>
            </tr>
          </thead>
          <tbody>
            <LigneStats nom={t("Haussier", "Bullish")} s={p.haussier} reference={p.hausseSpontanee} langue={langue} />
            <LigneStats nom={t("Baissier", "Bearish")} s={p.baissier} reference={p.hausseSpontanee === null ? null : 1 - p.hausseSpontanee} langue={langue} />
            <LigneStats nom={t("Neutre", "Neutral")} s={p.neutre} reference={null} langue={langue} />
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Performance du biais : règles du jour rejouées sur l'historique (sans connaître l'avenir),
// biais publiés comparés à la séance réelle, et fiche des marchés par régime macroéconomique.
export function SectionPerformance({ f, langue }: { f: EtatFondamentaux; langue: Langue }) {
  const t = traducteur(langue);
  const regime = f.regimeActuel?.regime;
  const clotures = f.publies.filter((b) => b.rendement !== null);
  const reussis = clotures.filter((b) => b.biais !== "neutre" && (b.biais === "haussier" ? b.rendement! > 0 : b.rendement! < 0)).length;
  const orientes = clotures.filter((b) => b.biais !== "neutre").length;
  return (
    <Carte
      titre={t("Performance du biais et régimes", "Bias track record and regimes")}
      sousTitre={f.version ? `${t("Règles", "Rules")} ${f.version}` : t("Aucune version de règles enregistrée", "No rules version recorded")}
      pied={
        <p className="text-xs text-attenue">
          {t(
            "Historique : les règles en vigueur rejouées séance par séance, avec uniquement les données publiées avant chaque séance (délais de publication respectés). Limites : FRED fournit les statistiques révisées, pas les premières estimations ; le consensus n'a pas d'historique, la surprise macro y est mesurée face à la publication précédente. Ce sont des fréquences passées, pas une promesse.",
            "Track record: the current rules replayed session by session, using only data released before each session (publication lags respected). Limits: FRED provides revised statistics, not first estimates; consensus has no history, so the macro surprise is measured against the prior release there. These are past frequencies, not a promise.",
          )}
        </p>
      }
    >
      <div className="flex flex-col gap-5">
        {f.performance.every((p) => p.seances === 0) ? (
          <p className="text-sm text-attenue">{t("Historique pas encore calculé.", "Track record not computed yet.")}</p>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {f.performance.map((p) => <TableauIndice key={p.indice} p={p} langue={langue} />)}
          </div>
        )}

        <div className="border-t border-bordure pt-4">
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-attenue">{t("Par session (contrats à terme ES et NQ)", "By session (ES and NQ futures)")}</h3>
          {f.sessions.length === 0 ? (
            <p className="text-xs text-attenue">
              {t(
                "En attente des cours par session : la collecte démarre seule dès que la clé Massive est rangée dans le Vault (« massive_api_key »).",
                "Waiting for session prices: collection starts on its own once the Massive key is stored in the Vault (“massive_api_key”).",
              )}
            </p>
          ) : (
            <>
              <p className="mb-2 text-xs text-attenue">
                {t("Biais de la séance jugé sur chaque session, depuis le", "Session bias judged on each session, since")} {formaterDateSeance(f.sessionsDepuis, langue)}.{" "}
                {t("Entre parenthèses : l'écart en points à la fréquence de base de la session.", "In brackets: gap in points to the session's base rate.")}
              </p>
              <div className="overflow-x-auto">
                <table className="chiffres w-full min-w-[30rem] text-sm">
                  <thead className="text-left text-xs text-attenue">
                    <tr>
                      <th className="pb-1 font-medium">{t("Indice", "Index")}</th>
                      <th className="pb-1 font-medium">{t("Session", "Session")}</th>
                      <th className="pb-1 text-right font-medium">{t("En hausse", "Up")}</th>
                      <th className="pb-1 text-right font-medium">{t("Haussier juste", "Bullish right")}</th>
                      <th className="pb-1 text-right font-medium">{t("Baissier juste", "Bearish right")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.sessions.map((s) => {
                      const ecart = (v: number | null, base: number | null) =>
                        v === null || base === null ? "" : ` (${v - base >= 0 ? "+" : "−"}${formaterNombre(Math.abs(v - base) * 100, 0, langue)})`;
                      return (
                        <tr key={`${s.indice}-${s.session}`} className="border-t border-bordure">
                          <td className="py-1.5">{NOMS_INDICES[s.indice]}</td>
                          <td className="py-1.5">{SESSIONS_COURT[s.session][langue === "en" ? 1 : 0]}</td>
                          <td className="py-1.5 text-right">{pc(s.hausse, langue)} <span className="text-xs text-attenue">/ {s.seances}</span></td>
                          <td className="py-1.5 text-right">{pc(s.haussier.reussite, langue)}<span className="text-xs text-attenue">{ecart(s.haussier.reussite, s.hausse)} / {s.haussier.seances}</span></td>
                          <td className="py-1.5 text-right">{pc(s.baissier.reussite, langue)}<span className="text-xs text-attenue">{ecart(s.baissier.reussite, s.hausse === null ? null : 1 - s.hausse)} / {s.baissier.seances}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {clotures.length > 0 && (
          <div className="border-t border-bordure pt-4">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-attenue">
              {t("Biais publiés (45 jours), jugés sur leur session", "Published biases (45 days), judged on their session")} · {orientes > 0 ? `${reussis}/${orientes} ${t("dans le bon sens", "in the right direction")}` : t("aucun biais orienté", "no directional bias")}
            </h3>
            <ul className="flex flex-wrap gap-1.5">
              {clotures.slice(0, 24).map((b) => {
                const bon = b.biais === "neutre" ? null : b.biais === "haussier" ? b.rendement! > 0 : b.rendement! < 0;
                return (
                  <li
                    key={`${b.indice}-${b.date}`}
                    title={`${NOMS_INDICES[b.indice]} ${formaterDateSeance(b.date, langue)} : ${NOMS_BIAIS[b.biais][langue === "en" ? 1 : 0]} (${formaterNombre(b.score * 100, 0, langue)}), ${t("séance", "session")} ${formaterPct(b.rendement, 2, true, langue)}`}
                    className={`chiffres rounded-lg px-2 py-1 text-xs ${bon === null ? "bg-surface-2 text-attenue" : bon ? "bg-hausse-doux text-hausse" : "bg-baisse-doux text-baisse"}`}
                  >
                    {b.indice === "SPX" ? "SPX" : "NDX"} {formaterDateSeance(b.date, langue, false)} {SESSIONS_COURT[b.session][langue === "en" ? 1 : 0]} {formaterPct(b.rendement, 1, true, langue)}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {f.fiche.length > 0 && (
          <div className="border-t border-bordure pt-4">
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-attenue">{t("Fiche de conduite par régime", "Playbook by regime")}</h3>
            <p className="mb-2 text-xs text-attenue">
              {t("Variation mensuelle moyenne et part des mois en hausse, selon le régime macroéconomique du mois.", "Average monthly change and share of up months, by the month's macro regime.")}
              {regime && ` ${t("Régime actuel :", "Current regime:")} `}
              {regime && <Pastille ton="accent">{REGIMES[regime]?.[langue === "en" ? 1 : 0] ?? regime}</Pastille>}
            </p>
            <div className="overflow-x-auto">
              <table className="chiffres w-full min-w-[36rem] text-sm">
                <thead className="text-left text-xs text-attenue">
                  <tr>
                    <th className="pb-1 font-medium">{t("Régime (mois)", "Regime (months)")}</th>
                    {ACTIFS.map((a) => <th key={a.cle} className="pb-1 text-right font-medium">{langue === "en" ? a.en : a.fr}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {f.fiche.map((r) => (
                    <tr key={r.regime} className={`border-t border-bordure ${r.regime === regime ? "bg-accent-doux" : ""}`}>
                      <td className="py-1.5 pr-2" title={langue === "en" ? REGIMES_EN[r.regime] : REGIMES[r.regime]?.[2]}>
                        {REGIMES[r.regime]?.[langue === "en" ? 1 : 0] ?? r.regime} <span className="text-attenue">({r.mois})</span>
                      </td>
                      {ACTIFS.map((a) => {
                        const v = r.actifs.find((x) => x.actif === a.cle);
                        if (!v) return <td key={a.cle} className="py-1.5 text-right text-discret">—</td>;
                        return (
                          <td key={a.cle} className="py-1.5 text-right">
                            <span className={v.moyenne > 0 ? "text-hausse" : v.moyenne < 0 ? "text-baisse" : ""}>
                              {a.pb ? formaterPb(v.moyenne, langue) : formaterPct(v.moyenne, 1, true, langue)}
                            </span>
                            <span className="block text-[0.7rem] text-attenue">{formaterNombre(v.hausse, 0, langue)}{langue === "en" ? "%" : " %"} ↑</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[0.7rem] text-discret">{t("Échantillon court (depuis 2021) : à lire comme un ordre de grandeur.", "Short sample (since 2021): read as an order of magnitude.")}</p>
          </div>
        )}
      </div>
    </Carte>
  );
}
