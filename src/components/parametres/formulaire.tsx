"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { choisirClasses, choisirDisposition, choisirLangue, choisirTheme } from "@/app/actions";
import { Carte } from "@/components/carte";
import { useLangue } from "@/components/langue";
import { type Langue, LANGUES } from "@/lib/i18n";
import { CLASSES } from "@/lib/sources";
import { ACCENTS, couleursAccent, type Densite, type Police, STYLES, type Theme } from "@/lib/theme";
import { type Disposition, WIDGETS } from "@/lib/widgets";

function Choix({ actif, onClick, children, className = "" }: { actif: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={actif}
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
        actif ? "border-accent bg-accent-doux text-texte" : "border-bordure text-attenue hover:border-bordure-forte hover:text-texte"
      } ${className}`}
    >
      {children}
    </button>
  );
}

// Aperçu immédiat : le thème est appliqué sur <html> avant même l'enregistrement.
function appliquer(theme: Theme) {
  const racine = document.documentElement;
  const c = couleursAccent(theme);
  racine.dataset.style = theme.style;
  racine.dataset.densite = theme.densite;
  racine.dataset.police = theme.police;
  racine.style.setProperty("--color-accent", c.accent);
  racine.style.setProperty("--color-accent-clair", c.clair);
  racine.style.setProperty("--color-accent-doux", c.doux);
}

export function FormulaireParametres({ langue: langueInitiale, theme: themeInitial, disposition: dispositionInitiale, classes: classesInitiales }: {
  langue: Langue;
  theme: Theme;
  disposition: Disposition;
  classes: string[];
}) {
  const { t } = useLangue();
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [theme, setTheme] = useState(themeInitial);
  const [disposition, setDisposition] = useState(dispositionInitiale);
  const [classes, setClasses] = useState(classesInitiales);

  const enregistrer = (action: () => Promise<{ ok: boolean; message: string }>, rafraichir = false) =>
    demarrer(async () => {
      const r = await action();
      setMessage(r.message);
      if (rafraichir) router.refresh();
    });

  const changerTheme = (modif: Partial<Theme>) => {
    const suivant = { ...theme, ...modif };
    // Changer de style reprend la police et l'accent propres à ce style.
    if (modif.style) {
      suivant.police = modif.style === "terminal" ? "mono" : "sans";
      suivant.accent = null;
    }
    setTheme(suivant);
    appliquer(suivant);
    enregistrer(() => choisirTheme(suivant));
  };

  const accentActuel = couleursAccent(theme).accent;

  return (
    <div className="flex flex-col gap-5">
      <Carte titre={t("Langue", "Language")} sousTitre={t("Tout le site : interface, dates, nombres, actualités traduites.", "Whole site: interface, dates, numbers, translated news.")}>
        <div className="flex flex-wrap gap-2">
          {LANGUES.map((l) => (
            <Choix key={l.cle} actif={langueInitiale === l.cle} onClick={() => enregistrer(() => choisirLangue(l.cle), true)}>
              {l.libelle}
            </Choix>
          ))}
        </div>
        <p className="mt-3 text-xs text-discret">
          {t(
            "Les sources sont en anglais : en français, titres et extraits sont traduits automatiquement (MyMemory) ; le titre d'origine reste visible au survol.",
            "Sources are in English: in French, headlines and excerpts are machine-translated (MyMemory).",
          )}
        </p>
      </Carte>

      <Carte titre={t("Apparence", "Appearance")} sousTitre={t("Style, couleur d'accent, densité, police. Aperçu immédiat.", "Style, accent colour, density, font. Instant preview.")}>
        <div className="flex flex-col gap-5">
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-discret">{t("Style", "Style")}</h3>
            <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,12rem),1fr))]">
              {STYLES.map((s) => (
                <Choix key={s.cle} actif={theme.style === s.cle} onClick={() => changerTheme({ style: s.cle })} className="flex flex-col gap-2">
                  <span className="flex h-12 overflow-hidden rounded-lg border border-bordure" aria-hidden style={{ background: s.fond }}>
                    <span className="m-1.5 flex-1 rounded-md" style={{ background: s.surface }} />
                    <span className="my-3 mr-2 w-6 rounded" style={{ background: s.accent }} />
                  </span>
                  <span className="font-medium text-texte">{t(s.fr, s.en)}</span>
                  <span className="text-xs">{t(s.descriptionFr, s.descriptionEn)}</span>
                </Choix>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-discret">{t("Couleur d'accent", "Accent colour")}</h3>
            <div className="flex flex-wrap items-center gap-2">
              <Choix actif={theme.accent === null} onClick={() => changerTheme({ accent: null })}>{t("Celle du style", "Style default")}</Choix>
              {ACCENTS.map((a) => (
                <button
                  key={a}
                  type="button"
                  aria-label={a}
                  aria-pressed={theme.accent === a}
                  onClick={() => changerTheme({ accent: a })}
                  className={`size-8 rounded-full border-2 transition-transform hover:scale-110 ${theme.accent === a ? "border-texte" : "border-transparent"}`}
                  style={{ background: a }}
                />
              ))}
              <label className="inline-flex items-center gap-2 text-sm text-attenue">
                <input
                  type="color"
                  value={accentActuel}
                  onChange={(e) => changerTheme({ accent: e.target.value })}
                  className="size-8 cursor-pointer rounded-full border border-bordure bg-transparent"
                />
                {t("Personnalisée", "Custom")}
              </label>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-discret">{t("Densité", "Density")}</h3>
              <div className="flex flex-wrap gap-2">
                {([["confortable", "Confortable", "Comfortable"], ["compacte", "Compacte (plus d'informations à l'écran)", "Compact (more on screen)"]] as [Densite, string, string][]).map(([cle, fr, en]) => (
                  <Choix key={cle} actif={theme.densite === cle} onClick={() => changerTheme({ densite: cle })}>{t(fr, en)}</Choix>
                ))}
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-discret">{t("Police", "Font")}</h3>
              <div className="flex flex-wrap gap-2">
                {([["sans", "Classique", "Sans-serif"], ["mono", "Chasse fixe (terminal)", "Monospace (terminal)"]] as [Police, string, string][]).map(([cle, fr, en]) => (
                  <Choix key={cle} actif={theme.police === cle} onClick={() => changerTheme({ police: cle })} className={cle === "mono" ? "font-mono" : "font-sans"}>
                    {t(fr, en)}
                  </Choix>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Carte>

      <Carte
        titre={t("Tableau de bord", "Dashboard")}
        sousTitre={t("Widgets affichés. Pour l'ordre et la largeur : bouton « Personnaliser le tableau » sur l'accueil (glisser-déposer).", "Widgets shown. For order and width: “Customize dashboard” on the home page (drag and drop).")}
      >
        <div className="flex flex-col gap-3">
          <ul className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,16rem),1fr))]">
            {WIDGETS.map((w) => {
              const visible = !disposition.masques.includes(w.id);
              return (
                <li key={w.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-bordure px-3 py-2 text-sm hover:border-bordure-forte">
                    <input
                      type="checkbox"
                      checked={visible}
                      onChange={() => {
                        const suivante = { ...disposition, masques: visible ? [...disposition.masques, w.id] : disposition.masques.filter((x) => x !== w.id) };
                        setDisposition(suivante);
                        enregistrer(() => choisirDisposition(suivante));
                      }}
                      className="size-4 accent-[var(--color-accent)]"
                    />
                    {t(w.fr, w.en)}
                  </label>
                </li>
              );
            })}
          </ul>
          <div>
            <Choix
              actif={false}
              onClick={() => {
                setDisposition({ ordre: WIDGETS.map((w) => w.id), masques: [], larges: WIDGETS.filter((w) => w.large).map((w) => w.id) });
                enregistrer(() => choisirDisposition(null));
              }}
            >
              {t("Rétablir la disposition par défaut", "Restore default layout")}
            </Choix>
          </div>
        </div>
      </Carte>

      <Carte titre={t("Classes d'actifs du moniteur", "Monitor asset classes")} sousTitre={t("Aucun réglage administrateur : chacun choisit ce qu'il suit.", "No admin setting: everyone chooses what they follow.")}>
        <div className="flex flex-wrap gap-2">
          {CLASSES.map((c) => {
            const actif = classes.includes(c.cle);
            return (
              <Choix
                key={c.cle}
                actif={actif}
                onClick={() => {
                  const suivantes = actif ? classes.filter((x) => x !== c.cle) : [...classes, c.cle];
                  setClasses(suivantes);
                  enregistrer(() => choisirClasses(suivantes));
                }}
              >
                {t(c.fr, c.en)}
              </Choix>
            );
          })}
        </div>
      </Carte>

      <p role="status" aria-live="polite" className={`text-sm ${enCours ? "animate-chargement text-attenue" : "text-attenue"}`}>
        {enCours ? t("Enregistrement…", "Saving…") : message}
      </p>
      <p className="text-xs text-discret">
        {t("Compte (e-mail, mot de passe, sessions) : menu de votre avatar, en haut à droite.", "Account (email, password, sessions): your avatar menu, top right.")}
      </p>
    </div>
  );
}
