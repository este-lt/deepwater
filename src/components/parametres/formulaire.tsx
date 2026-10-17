"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { choisirClasses, choisirDisposition, choisirLangue } from "@/app/actions";
import { Carte } from "@/components/carte";
import { useLangue } from "@/components/langue";
import { ReglagesApparence } from "@/components/parametres/apparence";
import { type Langue, LANGUES } from "@/lib/i18n";
import { CLASSES } from "@/lib/sources";
import type { Theme } from "@/lib/theme";
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
  // Les réglages d'apparence enregistrent eux-mêmes et signalent leur état ici.
  const [apparenceEnCours, setApparenceEnCours] = useState(false);
  const [disposition, setDisposition] = useState(dispositionInitiale);
  const [classes, setClasses] = useState(classesInitiales);

  const enregistrer = (action: () => Promise<{ ok: boolean; message: string }>, rafraichir = false) =>
    demarrer(async () => {
      const r = await action();
      setMessage(r.message);
      if (rafraichir) router.refresh();
    });

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

      <ReglagesApparence
        theme={themeInitial}
        onMessage={(m, enCoursApparence) => {
          setApparenceEnCours(enCoursApparence);
          if (m) setMessage(m);
        }}
      />

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

      <p role="status" aria-live="polite" className={`text-sm ${enCours || apparenceEnCours ? "animate-chargement text-attenue" : "text-attenue"}`}>
        {enCours || apparenceEnCours ? t("Enregistrement…", "Saving…") : message}
      </p>
      <p className="text-xs text-discret">
        {t("Compte (e-mail, mot de passe, sessions) : menu de votre avatar, en haut à droite.", "Account (email, password, sessions): your avatar menu, top right.")}
      </p>
    </div>
  );
}
