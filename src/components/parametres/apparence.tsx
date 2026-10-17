"use client";

import { type CSSProperties, type ReactNode, useState, useTransition } from "react";
import { choisirTheme } from "@/app/actions";
import { Carte } from "@/components/carte";
import { useLangue } from "@/components/langue";
import {
  ACCENTS,
  type Apercu,
  apercuStyle,
  type Coins,
  cssTheme,
  definitionStyle,
  type Mode,
  POLICES,
  type Police,
  STYLES,
  type Surface,
  surfaceEffective,
  TAILLES,
  type Theme,
  THEME_DEFAUT,
} from "@/lib/theme";

// Aperçu immédiat : la feuille du thème et les attributs de <html> sont remplacés avant
// même l'enregistrement.
function appliquer(theme: Theme) {
  const racine = document.documentElement;
  const feuille = document.getElementById("theme-utilisateur");
  if (feuille) feuille.textContent = cssTheme(theme);
  racine.dataset.style = theme.style;
  racine.dataset.surface = surfaceEffective(theme);
  const attribut = (nom: string, valeur: string | null) => (valeur === null ? racine.removeAttribute(nom) : racine.setAttribute(nom, valeur));
  attribut("data-gras", theme.gras ? "1" : null);
  attribut("data-transparence", theme.transparenceReduite ? "reduite" : null);
  attribut("data-animations", theme.animationsReduites ? "reduites" : null);
}

function Groupe({ titre, aide, children }: { titre: string; aide?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div>
        <h3 className="text-xs font-medium uppercase tracking-wide text-discret">{titre}</h3>
        {aide && <p className="mt-0.5 text-xs text-discret">{aide}</p>}
      </div>
      {children}
    </section>
  );
}

function Option({ actif, onClick, children, className = "", style, desactive = false, titre }: {
  actif: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  desactive?: boolean;
  titre?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={actif}
      disabled={desactive}
      onClick={onClick}
      title={titre}
      style={style}
      className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        actif ? "border-accent bg-accent-doux text-texte" : "border-bordure text-attenue hover:border-bordure-forte hover:text-texte"
      } ${className}`}
    >
      {children}
    </button>
  );
}

// Interrupteur façon iOS (vert quand il est activé).
function Interrupteur({ libelle, aide, actif, onChange }: { libelle: string; aide: string; actif: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{libelle}</span>
        <span className="block text-xs text-attenue">{aide}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={actif}
        aria-label={libelle}
        onClick={() => onChange(!actif)}
        className={`relative inline-flex h-[1.9rem] w-[3.15rem] shrink-0 items-center rounded-full transition-colors ${actif ? "bg-hausse" : "bg-surface-3"}`}
      >
        <span className={`size-[1.6rem] rounded-full bg-white shadow-md transition-transform ${actif ? "translate-x-[1.4rem]" : "translate-x-[0.15rem]"}`} />
      </button>
    </div>
  );
}

// Petit téléphone en miniature, comme dans « Affichage et luminosité » de l'iPhone.
function Telephone({ a, accent }: { a: Apercu; accent: string }) {
  return (
    <span className="flex h-full w-full flex-col gap-1 p-1.5" style={{ background: a.fond }}>
      <span className="mx-auto mb-0.5 h-1 w-5 rounded-full" style={{ background: a.texte, opacity: 0.8 }} />
      <span className="flex flex-col gap-0.5 rounded-[0.35rem] p-1" style={{ background: a.surface }}>
        <span className="h-1 w-3/5 rounded-full" style={{ background: a.texte }} />
        <span className="h-1 w-2/5 rounded-full" style={{ background: a.discret }} />
        <span className="mt-0.5 flex gap-0.5">
          <span className="h-1 flex-1 rounded-full" style={{ background: a.hausse }} />
          <span className="h-1 flex-1 rounded-full" style={{ background: a.baisse }} />
        </span>
      </span>
      <span className="flex flex-col gap-0.5 rounded-[0.35rem] p-1" style={{ background: a.surface }}>
        <span className="h-1 w-4/5 rounded-full" style={{ background: a.surface2 }} />
        <span className="h-1.5 w-1/2 rounded-full" style={{ background: accent }} />
      </span>
    </span>
  );
}

function MiniatureMode({ mode, clair, sombre, accent }: { mode: Mode; clair?: Apercu; sombre?: Apercu; accent: (a: Apercu) => string }) {
  const cadre = "relative block h-28 w-[4.25rem] overflow-hidden rounded-[0.9rem] border-[3px] border-[#1d1d1f] shadow-lg";
  if (mode === "auto" && clair && sombre) {
    return (
      <span className={cadre}>
        <span className="absolute inset-0 [clip-path:polygon(0_0,100%_0,0_100%)]"><Telephone a={clair} accent={accent(clair)} /></span>
        <span className="absolute inset-0 [clip-path:polygon(100%_0,100%_100%,0_100%)]"><Telephone a={sombre} accent={accent(sombre)} /></span>
      </span>
    );
  }
  const a = mode === "sombre" ? sombre : clair;
  return <span className={cadre}>{a && <Telephone a={a} accent={accent(a)} />}</span>;
}

export function ReglagesApparence({ theme: initial, onMessage }: { theme: Theme; onMessage: (m: string | null, enCours: boolean) => void }) {
  const { t } = useLangue();
  const [theme, setTheme] = useState(initial);
  const [, demarrer] = useTransition();

  const changer = (modif: Partial<Theme>) => {
    const suivant: Theme = { ...theme, ...modif };
    setTheme(suivant);
    appliquer(suivant);
    onMessage(null, true);
    demarrer(async () => {
      const r = await choisirTheme(suivant);
      onMessage(r.message, false);
    });
  };

  const d = definitionStyle(theme.style);
  const apercus = apercuStyle(theme.style);
  const accentApercu = (a: Apercu) => theme.accent ?? a.accent;
  const deuxModes = !!d.clair && !!d.sombre;
  const accentDuStyle = (apercus.sombre ?? apercus.clair)?.accent ?? "#7c6cff";
  const modes: { cle: Mode; fr: string; en: string }[] = [
    { cle: "clair", fr: "Clair", en: "Light" },
    { cle: "sombre", fr: "Sombre", en: "Dark" },
    { cle: "auto", fr: "Automatique", en: "Automatic" },
  ];
  const modeActuel: Mode = !d.clair ? "sombre" : !d.sombre ? "clair" : theme.mode;
  const policeStyle = POLICES.find((p) => p.cle === d.police)!;
  const coins: { cle: Coins; fr: string; en: string; rayon: string }[] = [
    { cle: "droits", fr: "Droits", en: "Square", rayon: "0.125rem" },
    { cle: "legers", fr: "Légers", en: "Subtle", rayon: "0.18rem" },
    { cle: "arrondis", fr: "Arrondis", en: "Rounded", rayon: "0.32rem" },
    { cle: "tres", fr: "Très arrondis", en: "Extra rounded", rayon: "0.5rem" },
  ];
  const surfaces: { cle: Exclude<Surface, "style">; fr: string; en: string; aideFr: string; aideEn: string }[] = [
    { cle: "bordure", fr: "Bordures", en: "Borders", aideFr: "Cartes cernées d'un filet", aideEn: "Cards outlined by a hairline" },
    { cle: "ombre", fr: "Ombres", en: "Shadows", aideFr: "Cartes sans bordure, légère ombre (iOS)", aideEn: "Borderless cards, soft shadow (iOS)" },
    { cle: "verre", fr: "Verre dépoli", en: "Frosted glass", aideFr: "Cartes translucides sur un fond coloré", aideEn: "Translucent cards over a tinted background" },
  ];
  const nomStyle = (cle: string) => {
    const s = STYLES.find((x) => x.cle === cle)!;
    return t(s.fr, s.en);
  };

  return (
    <>
      <Carte
        titre={t("Apparence", "Appearance")}
        sousTitre={t("Comme les réglages d'affichage d'un iPhone. Aperçu immédiat, enregistré pour votre compte.", "Like an iPhone's display settings. Instant preview, saved to your account.")}
      >
        <div className="flex flex-col gap-6">
          <Groupe
            titre={t("Clair, sombre ou automatique", "Light, dark or automatic")}
            aide={deuxModes ? t("Automatique suit le réglage de votre appareil (jour et nuit).", "Automatic follows your device setting (day and night).") : t(`Le style ${nomStyle(theme.style)} n'existe qu'en ${d.clair ? "clair" : "sombre"}.`, `The ${nomStyle(theme.style)} style only exists in ${d.clair ? "light" : "dark"}.`)}
          >
            <div role="radiogroup" className="flex flex-wrap gap-6">
              {modes.map((m) => {
                const possible = m.cle === "auto" ? deuxModes : m.cle === "clair" ? !!d.clair : !!d.sombre;
                const actif = modeActuel === m.cle;
                return (
                  <button
                    key={m.cle}
                    type="button"
                    role="radio"
                    aria-checked={actif}
                    disabled={!possible}
                    onClick={() => changer({ mode: m.cle })}
                    className="flex flex-col items-center gap-2 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <MiniatureMode mode={m.cle} clair={apercus.clair} sombre={apercus.sombre} accent={accentApercu} />
                    <span className="text-sm">{t(m.fr, m.en)}</span>
                    <span className={`grid size-5 place-items-center rounded-full border-2 ${actif ? "border-accent bg-accent" : "border-bordure-forte"}`} aria-hidden>
                      {actif && <svg viewBox="0 0 12 12" className="size-3 text-white"><path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </span>
                  </button>
                );
              })}
            </div>
          </Groupe>

          <Groupe titre={t("Style", "Style")} aide={t("Palette, police, angles et surfaces par défaut ; chacun se règle ensuite ci-dessous.", "Palette, font, corners and surfaces by default; each can then be adjusted below.")}>
            <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,11.5rem),1fr))]">
              {STYLES.map((s) => {
                const a = apercuStyle(s.cle);
                return (
                  <Option
                    key={s.cle}
                    actif={theme.style === s.cle}
                    // Changer de style reprend sa police, ses angles, ses surfaces et son accent.
                    onClick={() => changer({ style: s.cle, accent: null, police: "style", coins: "style", surface: "style", mode: s.clair && s.sombre ? theme.mode : s.clair ? "clair" : "sombre" })}
                    className="flex flex-col gap-2"
                  >
                    <span className="flex h-12 gap-1" aria-hidden>
                      {[a.clair, a.sombre].filter((x): x is Apercu => !!x).map((p, i) => (
                        <span key={i} className="flex flex-1 items-end overflow-hidden rounded-lg border border-bordure p-1" style={{ background: p.fond }}>
                          <span className="flex h-6 w-full items-center gap-1 rounded-md px-1" style={{ background: p.surface }}>
                            <span className="h-1 flex-1 rounded-full" style={{ background: p.texte, opacity: 0.7 }} />
                            <span className="size-2.5 rounded-full" style={{ background: p.accent }} />
                          </span>
                        </span>
                      ))}
                    </span>
                    <span className="font-medium text-texte" style={{ fontFamily: POLICES.find((p) => p.cle === s.police)!.pile }}>{t(s.fr, s.en)}</span>
                    <span className="text-xs leading-snug">{t(s.descriptionFr, s.descriptionEn)}</span>
                  </Option>
                );
              })}
            </div>
          </Groupe>

          <Groupe titre={t("Couleur d'accent", "Accent color")} aide={t("Couleurs système de l'iPhone, ou la vôtre.", "iPhone system colors, or your own.")}>
            <div className="flex flex-wrap items-center gap-2.5">
              <Option actif={theme.accent === null} onClick={() => changer({ accent: null })}>{t("Celle du style", "Style default")}</Option>
              {ACCENTS.map((a) => (
                <button
                  key={a.couleur}
                  type="button"
                  aria-label={t(a.fr, a.en)}
                  title={t(a.fr, a.en)}
                  aria-pressed={theme.accent === a.couleur}
                  onClick={() => changer({ accent: a.couleur })}
                  className={`grid size-8 place-items-center rounded-full transition-transform hover:scale-110 ${theme.accent === a.couleur ? "ring-2 ring-texte ring-offset-2 ring-offset-surface" : ""}`}
                  style={{ background: a.couleur }}
                />
              ))}
              <label className="inline-flex items-center gap-2 text-sm text-attenue">
                <input
                  type="color"
                  value={theme.accent ?? accentDuStyle}
                  onChange={(e) => changer({ accent: e.target.value })}
                  className="size-8 cursor-pointer rounded-full border border-bordure bg-transparent"
                />
                {t("Personnalisée", "Custom")}
              </label>
            </div>
          </Groupe>

          <Groupe titre={t("Police", "Font")}>
            <div className="flex flex-wrap gap-2">
              <Option actif={theme.police === "style"} onClick={() => changer({ police: "style" })} style={{ fontFamily: policeStyle.pile }}>
                {t(`Celle du style (${policeStyle.fr})`, `Style default (${policeStyle.en})`)}
              </Option>
              {POLICES.map((p) => (
                <Option key={p.cle} actif={theme.police === p.cle} onClick={() => changer({ police: p.cle as Police })} style={{ fontFamily: p.pile }}>
                  {t(p.fr, p.en)}
                </Option>
              ))}
            </div>
          </Groupe>

          <div className="grid gap-6 md:grid-cols-2">
            <Groupe titre={t("Angles", "Corners")}>
              <div className="flex flex-wrap gap-2">
                <Option actif={theme.coins === "style"} onClick={() => changer({ coins: "style" })}>{t("Selon le style", "Style default")}</Option>
                {coins.map((c) => (
                  <Option key={c.cle} actif={theme.coins === c.cle} onClick={() => changer({ coins: c.cle })} className="inline-flex items-center gap-2">
                    <span className="size-[1.1rem] border-2 border-current" style={{ borderRadius: c.rayon }} aria-hidden />
                    {t(c.fr, c.en)}
                  </Option>
                ))}
              </div>
            </Groupe>
            <Groupe titre={t("Surfaces", "Surfaces")}>
              <div className="flex flex-wrap gap-2">
                <Option actif={theme.surface === "style"} onClick={() => changer({ surface: "style" })}>{t("Selon le style", "Style default")}</Option>
                {surfaces.map((s) => (
                  <Option
                    key={s.cle}
                    actif={theme.surface === s.cle}
                    onClick={() => changer({ surface: s.cle })}
                    titre={t(s.aideFr, s.aideEn)}
                    desactive={s.cle === "verre" && theme.transparenceReduite}
                  >
                    {t(s.fr, s.en)}
                  </Option>
                ))}
              </div>
            </Groupe>
          </div>
        </div>
      </Carte>

      <Carte titre={t("Texte et accessibilité", "Text and accessibility")} sousTitre={t("Les réglages « Affichage et taille du texte » de l'iPhone.", "The iPhone's “Display & Text Size” settings.")}>
        <div className="flex flex-col gap-4">
          <Groupe titre={t("Taille du texte", "Text size")}>
            <div className="flex items-center gap-3">
              <span className="text-sm text-attenue" aria-hidden>A</span>
              <input
                type="range"
                min={TAILLES[0]}
                max={TAILLES[TAILLES.length - 1]}
                step={1}
                value={theme.taille}
                onChange={(e) => changer({ taille: Number(e.target.value) })}
                aria-label={t("Taille du texte", "Text size")}
                list="crans-taille"
                className="h-2 flex-1 cursor-pointer accent-[var(--color-accent)]"
              />
              <datalist id="crans-taille">{TAILLES.map((c) => <option key={c} value={c} />)}</datalist>
              <span className="text-2xl text-attenue" aria-hidden>A</span>
            </div>
            <p className="text-sm text-attenue">
              {t("Tout le site suit ce réglage : textes, chiffres et espacements.", "The whole site follows this setting: text, figures and spacing.")}
            </p>
          </Groupe>
          <div className="flex flex-col divide-y divide-bordure rounded-xl bg-surface-2 px-4">
            <Interrupteur
              libelle={t("Texte en gras", "Bold text")}
              aide={t("Graisse renforcée partout.", "Heavier weight everywhere.")}
              actif={theme.gras}
              onChange={(v) => changer({ gras: v })}
            />
            <Interrupteur
              libelle={t("Augmenter le contraste", "Increase contrast")}
              aide={t("Textes secondaires plus foncés, bordures marquées, couleurs système plus contrastées.", "Darker secondary text, stronger borders, higher-contrast system colors.")}
              actif={theme.contraste}
              onChange={(v) => changer({ contraste: v })}
            />
            <Interrupteur
              libelle={t("Réduire la transparence", "Reduce transparency")}
              aide={t("Barre du haut opaque, verre dépoli remplacé par des surfaces pleines.", "Opaque top bar, frosted glass replaced by solid surfaces.")}
              actif={theme.transparenceReduite}
              onChange={(v) => changer({ transparenceReduite: v })}
            />
            <Interrupteur
              libelle={t("Réduire les animations", "Reduce motion")}
              aide={t("Pas d'apparitions animées ni de transitions.", "No animated entrances or transitions.")}
              actif={theme.animationsReduites}
              onChange={(v) => changer({ animationsReduites: v })}
            />
          </div>
          <div>
            <Option actif={false} onClick={() => changer(THEME_DEFAUT)}>{t("Rétablir l'apparence par défaut", "Reset appearance")}</Option>
          </div>
        </div>
      </Carte>
    </>
  );
}
