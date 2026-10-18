"use client";

import { useState, useTransition } from "react";
import { validerBiais } from "@/app/actions";
import { Pastille } from "@/components/carte";
import { DateLocale } from "@/components/horodatage";
import { useLangue } from "@/components/langue";
import type { BiaisAffiche, FacteurBiais } from "@/lib/biais";

const TONS = { haussier: "hausse", baissier: "baisse", neutre: "neutre" } as const;
const LIBELLES = { haussier: ["Haussier", "Bullish"], baissier: ["Baissier", "Bearish"], neutre: ["Neutre", "Neutral"] } as const;
const SOURCES: Record<string, [string, string]> = {
  "fred:SP500": ["FRED (S&P 500)", "FRED (S&P 500)"],
  "fred:NASDAQ100": ["FRED (Nasdaq-100)", "FRED (Nasdaq-100)"],
  "fred:DGS10": ["FRED (Trésor US 10 ans)", "FRED (10Y Treasury)"],
  "FRED (DGS2, DFF), BRI": ["FRED (taux à 2 ans, Fed funds), BRI", "FRED (2-year yield, Fed funds), BIS"],
  "FRED (DGS10, DFII10)": ["FRED (taux nominal et réel à 10 ans)", "FRED (10-year nominal and real yields)"],
  "FRED (NFCI, Fed de Chicago)": ["FRED (NFCI, Fed de Chicago)", "FRED (NFCI, Chicago Fed)"],
  "FRED (DTWEXBGS)": ["FRED (indice large du dollar)", "FRED (broad dollar index)"],
  "FRED (DGS3MO, DGS2, DGS10)": ["FRED (taux à 3 mois, 2 ans et 10 ans)", "FRED (3-month, 2-year and 10-year yields)"],
  "FRED (BLS, BEA, EIA)": ["FRED (emploi, PIB, prix, pétrole)", "FRED (jobs, GDP, prices, oil)"],
  "FRED (VIX, spread haut rendement ICE BofA)": ["FRED (VIX, spread haut rendement ICE BofA)", "FRED (VIX, ICE BofA high-yield spread)"],
  "FRED (VXN, spread haut rendement ICE BofA)": ["FRED (VXN, spread haut rendement ICE BofA)", "FRED (VXN, ICE BofA high-yield spread)"],
};
const libelleSource = (s: string, en: boolean) => SOURCES[s]?.[en ? 1 : 0] ?? s;
// Texte d'un facteur dans la langue de l'utilisateur (anglais quand le calcul l'a produit).
const texteFacteur = (f: FacteurBiais, en: boolean) => (en && f.texte_en ? f.texte_en : f.texte);
const points = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.round(Math.abs(v) * 100)}`;

// Jauge de -100 à +100 : zone neutre au centre, remplissage depuis le milieu.
function Jauge({ score }: { score: number }) {
  const { t } = useLangue();
  const position = ((Math.max(-1, Math.min(1, score)) + 1) / 2) * 100;
  const haut = score >= 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="relative h-2.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        <div className="absolute inset-y-0 left-[40%] w-[20%] bg-neutre-doux" />
        <div className="absolute inset-y-0 left-1/2 w-px bg-bordure-forte" />
        <div
          className={`absolute inset-y-0 animate-remplir rounded-full ${haut ? "origin-left bg-hausse/80" : "origin-right bg-baisse/80"}`}
          style={haut ? { left: "50%", width: `${position - 50}%` } : { left: `${position}%`, width: `${50 - position}%` }}
        />
      </div>
      <div className="flex justify-between text-[0.65rem] text-discret" aria-hidden>
        <span>{t("Baissier", "Bearish")}</span>
        <span>{t("Neutre", "Neutral")}</span>
        <span>{t("Haussier", "Bullish")}</span>
      </div>
    </div>
  );
}

function LigneFacteur({ f }: { f: FacteurBiais }) {
  const { langue, t } = useLangue();
  const en = langue === "en";
  const largeur = f.note === null ? 0 : Math.abs(f.note) * 50;
  return (
    <li className="flex flex-col gap-1 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className="font-medium">{en && f.libelle_en ? f.libelle_en : f.libelle}</span>
        <span className="chiffres text-xs text-attenue">
          {t("poids", "weight")} {Math.round(f.poids * 100)}{en ? "%" : " %"} ·{" "}
          {f.statut === "ok" && f.note !== null ? `${t("note", "score")} ${points(f.note)}` : <span className="text-alerte">{t("indisponible", "unavailable")}</span>}
        </span>
      </div>
      {f.statut === "ok" && f.note !== null && (
        <div className="relative h-1.5 rounded-full bg-surface-3" aria-hidden>
          <div className="absolute inset-y-0 left-1/2 w-px bg-bordure-forte" />
          <div
            className={`absolute inset-y-0 animate-remplir rounded-full ${f.note >= 0 ? "origin-left bg-hausse/70" : "origin-right bg-baisse/70"}`}
            style={f.note >= 0 ? { left: "50%", width: `${largeur}%` } : { left: `${50 - largeur}%`, width: `${largeur}%` }}
          />
        </div>
      )}
      <p className="text-xs text-attenue">
        {texteFacteur(f, en)} <span className="text-discret">{t("Source :", "Source:")} {libelleSource(f.source, en)}</span>
      </p>
    </li>
  );
}

export function CarteBiais({ biais, delai = 0 }: { biais: BiaisAffiche; delai?: number }) {
  const { langue, t } = useLangue();
  const en = langue === "en";
  const [enCours, demarrer] = useTransition();
  const [commentaire, setCommentaire] = useState(biais.decision?.commentaire ?? "");
  const [ouvert, setOuvert] = useState(false);
  const [retour, setRetour] = useState<{ ok: boolean; message: string } | null>(null);
  const [modifier, setModifier] = useState(false);
  const decision = biais.decision;

  const decider = (choix: "valide" | "rejete") =>
    demarrer(async () => {
      const r = await validerBiais(biais.id, choix, commentaire);
      setRetour(r);
      if (r.ok) setModifier(false);
    });

  return (
    <article
      style={{ animationDelay: `${delai}ms` }}
      className="flex min-w-0 flex-col gap-4 rounded-xl border border-bordure bg-surface-2 p-4 animate-apparition sm:p-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold tracking-tight">{biais.nom}</h3>
          <p className="text-xs text-attenue">{biais.symbole}</p>
        </div>
        <div className="flex items-center gap-2">
          <Pastille ton={TONS[biais.biais]}>{LIBELLES[biais.biais][en ? 1 : 0]}</Pastille>
          <span className="chiffres text-sm text-attenue" title={t("Score entre −100 (baissier) et +100 (haussier)", "Score from −100 (bearish) to +100 (bullish)")}>
            {points(biais.score)} / 100
          </span>
        </div>
      </header>

      <Jauge score={biais.score} />

      <div>
        <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-discret">{t("Ce qui a le plus pesé", "Main drivers")}</h4>
        <ol className="flex flex-col gap-1.5 text-sm">
          {biais.raisons.map((r, i) => {
            const facteur = biais.facteurs.find((f) => f.texte === r);
            return (
              <li key={i} className="flex gap-2">
                <span className="chiffres mt-0.5 text-xs text-discret">{i + 1}.</span>
                <span>
                  {facteur ? texteFacteur(facteur, en) : r}{" "}
                  {facteur && <span className="text-xs text-discret">{t("Source :", "Source:")} {libelleSource(facteur.source, en)}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <details className="group">
        <summary className="cursor-pointer list-none text-xs text-attenue hover:text-texte">
          <span className="inline-block transition-transform group-open:rotate-90" aria-hidden>›</span> {t(`Détail des ${biais.facteurs.length} facteurs`, `Details of the ${biais.facteurs.length} factors`)}
        </summary>
        <ul className="mt-1 flex flex-col divide-y divide-bordure">
          {biais.facteurs.map((f) => (
            <LigneFacteur key={f.cle} f={f} />
          ))}
        </ul>
      </details>

      <footer className="flex flex-col gap-2 border-t border-bordure pt-3">
        {decision && !modifier ? (
          <div
            key={`${decision.decision}-${decision.le}`}
            className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm animate-validation ${
              decision.decision === "valide" ? "bg-hausse-doux text-hausse" : "bg-baisse-doux text-baisse"
            }`}
          >
            <span>
              {decision.decision === "valide" ? t("✓ Vous avez validé ce biais", "✓ You accepted this bias") : t("✕ Vous avez rejeté ce biais", "✕ You rejected this bias")}
              <span className="ml-1 text-xs opacity-80">
                {t("le", "on")} <DateLocale iso={decision.le} options={{ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }} />
              </span>
            </span>
            <button type="button" onClick={() => setModifier(true)} className="text-xs text-attenue underline-offset-2 hover:text-texte hover:underline">
              {t("Changer d'avis", "Change my mind")}
            </button>
            {decision.commentaire && <p className="w-full text-xs text-attenue">« {decision.commentaire} »</p>}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={enCours}
                onClick={() => decider("valide")}
                className="rounded-lg border border-hausse/40 bg-hausse-doux px-3.5 py-1.5 text-sm font-medium text-hausse transition-colors hover:border-hausse/70 disabled:opacity-50"
              >
                {t("Valider", "Accept")}
              </button>
              <button
                type="button"
                disabled={enCours}
                onClick={() => decider("rejete")}
                className="rounded-lg border border-baisse/40 bg-baisse-doux px-3.5 py-1.5 text-sm font-medium text-baisse transition-colors hover:border-baisse/70 disabled:opacity-50"
              >
                {t("Rejeter", "Reject")}
              </button>
              <button
                type="button"
                onClick={() => setOuvert((o) => !o)}
                aria-expanded={ouvert}
                className="ml-auto text-xs text-attenue hover:text-texte"
              >
                {ouvert ? t("Masquer le commentaire", "Hide comment") : t("Ajouter un commentaire", "Add a comment")}
              </button>
            </div>
            {ouvert && (
              <textarea
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
                maxLength={1000}
                rows={2}
                placeholder={t("Pourquoi ? (facultatif, visible par vous seul)", "Why? (optional, visible only to you)")}
                aria-label={t("Commentaire sur ce biais", "Comment on this bias")}
                className="w-full resize-y rounded-lg border border-bordure bg-surface px-3 py-2 text-sm placeholder:text-discret focus:border-accent/60"
              />
            )}
          </>
        )}
        {retour && !retour.ok && <p className="text-xs text-baisse">{retour.message}</p>}
        <p className="text-[0.7rem] text-discret">
          {biais.origine === "auto" ? t("Calcul automatique du", "Automatic calculation on") : t("Calcul manuel du", "Manual calculation on")}{" "}
          <DateLocale iso={biais.calculeLe} options={{ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }} />
          {biais.versionRegles && ` · ${t("règles du", "rules of")} ${biais.versionRegles}`}
        </p>
      </footer>
    </article>
  );
}
