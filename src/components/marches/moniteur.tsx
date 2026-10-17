"use client";

import { useOptimistic, useTransition } from "react";
import { choisirClasses } from "@/app/actions";
import { useLangue } from "@/components/langue";
import { MiniCourbe } from "@/components/marches/mini-courbe";
import { formaterDateSeance, formaterNombre, formaterPb, formaterPct, pct } from "@/lib/format";
import type { Langue } from "@/lib/i18n";
import type { LigneMarche } from "@/lib/marches";
import { CLASSES, libelleSource } from "@/lib/sources";

// Ouvre l'instrument dans le graphique (écouté par GraphiquePrix).
export const EVENEMENT_GRAPHIQUE = "deepwater:graphique";

function variation(v: number | null, type: LigneMarche["variation"], langue: Langue): { texte: string; ton: string } {
  if (v === null) return { texte: "—", ton: "text-discret" };
  if (type === "pct") {
    return { texte: formaterPct(v, Math.abs(v) < 10 ? 2 : 1, true, langue), ton: v > 0 ? "text-hausse" : v < 0 ? "text-baisse" : "text-attenue" };
  }
  // Taux, spreads, volatilité : une hausse n'est ni bonne ni mauvaise en soi, couleur neutre.
  const signe = v > 0 ? "+" : v < 0 ? "−" : "";
  const texte = type === "pb" ? formaterPb(v, langue) : `${signe}${formaterNombre(Math.abs(v), 2, langue)}`;
  return { texte, ton: v === 0 ? "text-attenue" : "text-texte" };
}

function Variation({ v, type, className = "" }: { v: number | null; type: LigneMarche["variation"]; className?: string }) {
  const { langue } = useLangue();
  const { texte, ton } = variation(v, type, langue);
  return <td className={`chiffres whitespace-nowrap px-2 py-2 text-right ${ton} ${className}`}>{texte}</td>;
}

export function Moniteur({ lignes, classes }: { lignes: LigneMarche[]; classes: string[] }) {
  const { langue, t } = useLangue();
  const [enCours, demarrer] = useTransition();
  const [affichees, setAffichees] = useOptimistic(classes);

  const basculer = (cle: string) =>
    demarrer(async () => {
      const suivantes = affichees.includes(cle) ? affichees.filter((c) => c !== cle) : [...affichees, cle];
      setAffichees(suivantes);
      await choisirClasses(suivantes);
    });

  const ouvrir = (symbole: string) => {
    window.dispatchEvent(new CustomEvent(EVENEMENT_GRAPHIQUE, { detail: symbole }));
    document.getElementById("graphique")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const groupes = CLASSES.filter((c) => affichees.includes(c.cle))
    .map((c) => ({ ...c, lignes: lignes.filter((l) => l.classe === c.cle) }))
    .filter((g) => g.lignes.length > 0);
  const sources = [...new Set(groupes.flatMap((g) => g.lignes.map((l) => libelleSource(l.source, langue))))];
  const dernier = (l: LigneMarche) => `${formaterNombre(l.cloture, l.decimales, langue)}${l.unite === "%" ? pct(langue) : ""}`;

  return (
    <section aria-labelledby="titre-marches" className="carte flex min-w-0 flex-col gap-3 rounded-carte border border-bordure bg-surface p-4 animate-apparition sm:p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="titre-marches" className="text-[0.95rem] font-semibold tracking-tight">{t("Marchés", "Markets")}</h2>
        <div role="group" aria-label={t("Classes d'actifs affichées", "Asset classes shown")} className="flex flex-wrap gap-1.5">
          {CLASSES.map((c) => {
            const actif = affichees.includes(c.cle);
            return (
              <button
                key={c.cle}
                type="button"
                aria-pressed={actif}
                disabled={enCours}
                onClick={() => basculer(c.cle)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  actif ? "border-accent/60 bg-accent-doux text-accent-clair" : "border-bordure text-attenue hover:border-bordure-forte hover:text-texte"
                }`}
              >
                {t(c.fr, c.en)}
              </button>
            );
          })}
        </div>
      </header>

      {groupes.length === 0 ? (
        <p className="rounded-xl bg-surface-2 p-4 text-sm text-attenue">{t("Sélectionnez au moins une classe d'actifs.", "Select at least one asset class.")}</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs text-discret">
            <tr>
              <th className="w-full py-1.5 text-left font-medium">{t("Instrument", "Instrument")}</th>
              <th className="px-2 py-1.5 text-right font-medium">{t("Dernier", "Last")}</th>
              <th className="px-2 py-1.5 text-right font-medium">{t("Séance", "Day")}</th>
              <th className="hidden px-2 py-1.5 text-right font-medium md:table-cell">{t("1 sem.", "1 wk")}</th>
              <th className="hidden px-2 py-1.5 text-right font-medium md:table-cell">{t("1 mois", "1 mo")}</th>
              <th className="hidden px-2 py-1.5 text-right font-medium lg:table-cell">{t("Depuis janv.", "YTD")}</th>
              <th className="hidden py-1.5 pl-2 text-right font-medium lg:table-cell">{t("3 mois", "3 mo")}</th>
            </tr>
          </thead>
          {groupes.map((g) => (
            <tbody key={g.cle} className="border-t border-bordure">
              <tr>
                <th colSpan={7} scope="colgroup" className="pb-1 pt-3 text-left text-[0.7rem] font-medium uppercase tracking-wide text-discret">
                  {t(g.fr, g.en)}
                </th>
              </tr>
              {g.lignes.map((l) => (
                <tr
                  key={l.symbole}
                  onClick={() => ouvrir(l.symbole)}
                  title={`${l.noteSource ?? ""}${l.noteSource ? "\n" : ""}${t("Source :", "Source:")} ${libelleSource(l.source, langue)} · ${t("cliquer pour le graphique", "click for the chart")}`}
                  className="cursor-pointer rounded-lg transition-colors hover:bg-surface-2"
                >
                  <td className="max-w-0 truncate py-2 pr-2">
                    <span className="font-medium">{langue === "en" && l.nomEn ? l.nomEn : l.nom}</span>
                    <span className={`ml-1.5 text-[0.7rem] ${l.ancienne ? "text-alerte" : "text-discret"}`}>
                      {formaterDateSeance(l.date, langue, false)}
                      {l.source === "coingecko" && ` · ${t("en direct", "live")}`}
                    </span>
                  </td>
                  <td className="chiffres whitespace-nowrap px-2 py-2 text-right font-medium">{dernier(l)}</td>
                  <Variation v={l.var1j} type={l.variation} />
                  <Variation v={l.var1s} type={l.variation} className="hidden md:table-cell" />
                  <Variation v={l.var1m} type={l.variation} className="hidden md:table-cell" />
                  <Variation v={l.varAnnee} type={l.variation} className="hidden lg:table-cell" />
                  <td className="hidden py-1 pl-2 lg:table-cell">
                    <div className="flex justify-end">
                      <MiniCourbe valeurs={l.courbe} ton={l.var1m === null ? "neutre" : l.var1m >= 0 ? "hausse" : "baisse"} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      )}
      <p className="text-[0.7rem] text-discret">
        {t(
          "Clôtures officielles différées (date à côté du nom, en orange si en retard), crypto en direct. Sources :",
          "Official delayed closes (date next to the name, orange when late), crypto live. Sources:",
        )}{" "}
        {sources.join(", ") || "—"}.
      </p>
    </section>
  );
}
