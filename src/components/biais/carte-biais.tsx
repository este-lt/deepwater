"use client";

import { useState, useTransition } from "react";
import { validerBiais } from "@/app/actions";
import { Pastille } from "@/components/carte";
import { DateLocale } from "@/components/horodatage";
import { useLangue } from "@/components/langue";
import type { BiaisAffiche, BiaisSessions, FacteurBiais } from "@/lib/biais";

const TONS = { haussier: "hausse", baissier: "baisse", neutre: "neutre" } as const;
const SESSIONS = { asie: ["Asie", "Asia"], londres: ["Londres", "London"], new_york: ["New York", "New York"] } as const;
const ORDRE_SESSIONS = ["asie", "londres", "new_york"] as const;
const LIBELLES = { haussier: ["Haussier", "Bullish"], baissier: ["Baissier", "Bearish"], neutre: ["Neutre", "Neutral"] } as const;
const SOURCES: Record<string, [string, string]> = {
  "fred:SP500": ["FRED (S&P 500)", "FRED (S&P 500)"],
  "fred:NASDAQ100": ["FRED (Nasdaq-100)", "FRED (Nasdaq-100)"],
  "fred:DGS10": ["FRED (Trésor US 10 ans)", "FRED (10Y Treasury)"],
  "FRED (DGS2, DFF), BRI": ["FRED (taux à 2 ans, Fed funds), BRI", "FRED (2-year yield, Fed funds), BIS"],
  "FRED (DGS1, DGS2, DFF), BRI": ["FRED (taux à 1 et 2 ans, Fed funds), BRI", "FRED (1- and 2-year yields, Fed funds), BIS"],
  "FRED (WALCL, WTREGEN, RRPONTSYD, M2SL)": ["FRED (bilan de la Fed, compte du Trésor, prises en pension, M2)", "FRED (Fed balance sheet, Treasury account, reverse repos, M2)"],
  "CFTC (Traders in Financial Futures)": ["CFTC (rapport COT, fonds à effet de levier)", "CFTC (COT report, leveraged funds)"],
  "FRED (BLS, BEA)": ["FRED (BLS, BEA)", "FRED (BLS, BEA)"],
  "FRED (BLS, BEA), consensus (FinancialJuice, InvestingLive)": ["FRED (BLS, BEA) et consensus (FinancialJuice, InvestingLive)", "FRED (BLS, BEA) and consensus (FinancialJuice, InvestingLive)"],
  "FRED (DGS10, DFII10)": ["FRED (taux nominal et réel à 10 ans)", "FRED (10-year nominal and real yields)"],
  "FRED (NFCI, Fed de Chicago)": ["FRED (NFCI, Fed de Chicago)", "FRED (NFCI, Chicago Fed)"],
  "FRED (DTWEXBGS)": ["FRED (indice large du dollar)", "FRED (broad dollar index)"],
  "FRED (DGS3MO, DGS2, DGS10)": ["FRED (taux à 3 mois, 2 ans et 10 ans)", "FRED (3-month, 2-year and 10-year yields)"],
  "FRED (BLS, BEA, EIA)": ["FRED (emploi, PIB, prix, pétrole)", "FRED (jobs, GDP, prices, oil)"],
  "FRED (VIX, spread haut rendement ICE BofA)": ["FRED (VIX, spread haut rendement ICE BofA)", "FRED (VIX, ICE BofA high-yield spread)"],
  "FRED (VXN, spread haut rendement ICE BofA)": ["FRED (VXN, spread haut rendement ICE BofA)", "FRED (VXN, ICE BofA high-yield spread)"],
  "FRED (VIXCLS, VXVCLS, spread haut rendement ICE BofA)": ["FRED (VIX, VIX à 3 mois, spread haut rendement ICE BofA)", "FRED (VIX, 3-month VIX, ICE BofA high-yield spread)"],
};
// Seuils des règles en vigueur (supabase/functions/calcul-biais/regles.ts) : asymétriques.
const SEUIL_HAUSSIER = 0.2;
const SEUIL_BAISSIER = -0.45;
const libelleSource = (s: string, en: boolean) => SOURCES[s]?.[en ? 1 : 0] ?? s;
// Texte d'un facteur dans la langue de l'utilisateur (anglais quand le calcul l'a produit).
const texteFacteur = (f: FacteurBiais, en: boolean) => (en && f.texte_en ? f.texte_en : f.texte);
const points = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.round(Math.abs(v) * 100)}`;

// Jauge de -100 à +100 : zone neutre entre les deux seuils, remplissage depuis le milieu.
function Jauge({ score }: { score: number }) {
  const { t } = useLangue();
  const position = ((Math.max(-1, Math.min(1, score)) + 1) / 2) * 100;
  const haut = score >= 0;
  const debutNeutre = ((SEUIL_BAISSIER + 1) / 2) * 100;
  const finNeutre = ((SEUIL_HAUSSIER + 1) / 2) * 100;
  return (
    <div className="flex flex-col gap-1">
      <div className="relative h-2.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        <div className="absolute inset-y-0 bg-neutre-doux" style={{ left: `${debutNeutre}%`, width: `${finNeutre - debutNeutre}%` }} />
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
  const contexte = f.poids === 0;
  return (
    <li className="flex flex-col gap-1 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className={contexte ? "text-attenue" : "font-medium"}>{en && f.libelle_en ? f.libelle_en : f.libelle}</span>
        <span className="chiffres text-xs text-attenue">
          {f.statut !== "ok" || f.note === null
            ? <span className="text-alerte">{t("indisponible", "unavailable")}</span>
            : contexte
            ? t("contexte, hors score", "context, not scored")
            : `${t("poids", "weight")} ${Math.round(f.poids * 100)}${en ? "%" : " %"} · ${t("note", "score")} ${points(f.note)}`}
        </span>
      </div>
      {f.statut === "ok" && f.note !== null && !contexte && (
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

// Les trois sessions de la séance : biais de chacune, ou « à venir ».
function BandeSessions({ sessions, active }: { sessions: BiaisSessions[string]; active: BiaisAffiche["session"] }) {
  const { langue, t } = useLangue();
  const en = langue === "en";
  return (
    <ol className="grid grid-cols-3 gap-1.5" aria-label={t("Biais par session", "Bias by session")}>
      {ORDRE_SESSIONS.map((s) => {
        const b = sessions[s];
        return (
          <li key={s} className={`flex min-w-0 flex-col items-start gap-1 rounded-lg px-2 py-1.5 ${s === active ? "bg-accent-doux" : "bg-surface"}`}>
            <span className="text-[0.7rem] text-attenue">{SESSIONS[s][en ? 1 : 0]}</span>
            {b ? (
              <span className="flex flex-wrap items-center gap-1">
                <Pastille ton={TONS[b.biais]}>{LIBELLES[b.biais][en ? 1 : 0]}</Pastille>
                <span className="chiffres text-[0.7rem] text-attenue">{points(b.score)}</span>
              </span>
            ) : (
              <span className="text-xs text-discret">{t("à venir", "upcoming")}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function CarteBiais({ biais, sessions, delai = 0 }: { biais: BiaisAffiche; sessions: BiaisSessions[string]; delai?: number }) {
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
          <p className="text-xs text-attenue">{biais.symbole} · {t("session", "session")} {SESSIONS[biais.session][en ? 1 : 0]}</p>
        </div>
        <div className="flex items-center gap-2">
          <Pastille ton={TONS[biais.biais]}>{LIBELLES[biais.biais][en ? 1 : 0]}</Pastille>
          <span className="chiffres text-sm text-attenue" title={t("Score entre −100 (baissier) et +100 (haussier)", "Score from −100 (bearish) to +100 (bullish)")}>
            {points(biais.score)} / 100
          </span>
        </div>
      </header>

      <BandeSessions sessions={sessions} active={biais.session} />

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
          {biais.facteurs.filter((f) => f.poids > 0).map((f) => (
            <LigneFacteur key={f.cle} f={f} />
          ))}
        </ul>
        {biais.facteurs.some((f) => f.poids === 0) && (
          <>
            <h4 className="mt-3 text-xs font-medium uppercase tracking-wide text-discret">{t("Contexte, hors score", "Context, not scored")}</h4>
            <p className="text-[0.7rem] text-discret">
              {t(
                "Rejoués sur 2021-2026, ces facteurs n'annoncent pas la séance de façon stable : ils décrivent le fond du marché sans entrer dans le score.",
                "Replayed over 2021-2026, these factors do not reliably predict the session: they describe the market backdrop without entering the score.",
              )}
            </p>
            <ul className="flex flex-col divide-y divide-bordure">
              {biais.facteurs.filter((f) => f.poids === 0).map((f) => (
                <LigneFacteur key={f.cle} f={f} />
              ))}
            </ul>
          </>
        )}
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
