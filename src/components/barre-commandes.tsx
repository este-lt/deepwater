"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLangue } from "@/components/langue";
import { WIDGETS } from "@/lib/widgets";

interface Commande {
  id: string;
  libelle: string;
  groupe: string;
  aller: string; // chemin, avec une ancre éventuelle
}

// Sans accents ni majuscules, pour une recherche tolérante (« liquidite » trouve « Liquidité »).
const normaliser = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

// Barre de commandes au clavier (Ctrl+K ou ⌘K) : aller à une page, à un widget du tableau de
// bord, ouvrir le graphique d'un instrument ou lancer une recherche.
export function BarreCommandes({ estAdmin }: { estAdmin: boolean }) {
  const { t, langue } = useLangue();
  const router = useRouter();
  const chemin = usePathname();
  const [ouvert, setOuvert] = useState(false);
  const [texte, setTexte] = useState("");
  const [actif, setActif] = useState(0);
  const champ = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setTexte("");
        setActif(0);
        setOuvert((o) => !o);
      }
    };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, []);

  const commandes = useMemo<Commande[]>(() => {
    const pages: Commande[] = [
      { id: "p-accueil", libelle: t("Tableau de bord", "Dashboard"), groupe: t("Pages", "Pages"), aller: "/" },
      { id: "p-rapport", libelle: t("Rapport", "Report"), groupe: t("Pages", "Pages"), aller: "/rapport" },
      { id: "p-parametres", libelle: t("Paramètres", "Settings"), groupe: t("Pages", "Pages"), aller: "/parametres" },
      { id: "p-recherche", libelle: t("Recherche globale", "Global search"), groupe: t("Pages", "Pages"), aller: "/recherche" },
      ...(estAdmin ? [{ id: "p-admin", libelle: "Admin", groupe: t("Pages", "Pages"), aller: "/admin" }] : []),
    ];
    const widgets = WIDGETS.map((w) => ({ id: `w-${w.id}`, libelle: langue === "en" ? w.en : w.fr, groupe: t("Widgets", "Widgets"), aller: `/#widget-${w.id}` }));
    return [...pages, ...widgets];
  }, [t, langue, estAdmin]);

  const resultats = useMemo(() => {
    const q = normaliser(texte.trim());
    const trouves = q ? commandes.filter((c) => normaliser(c.libelle).includes(q)) : commandes;
    const brut = texte.trim();
    const extra: Commande[] = [];
    // Un symbole (« SPX », « EURUSD ») ouvre directement le graphique de l'instrument.
    if (/^[A-Za-z0-9]{2,10}$/.test(brut)) {
      extra.push({ id: "graphique", libelle: `${t("Graphique :", "Chart:")} ${brut.toUpperCase()}`, groupe: t("Instruments", "Instruments"), aller: `/?instrument=${encodeURIComponent(brut.toUpperCase())}#widget-graphique` });
    }
    if (brut.length >= 2) {
      extra.push({ id: "recherche", libelle: `${t("Rechercher", "Search")} « ${brut} »`, groupe: t("Recherche", "Search"), aller: `/recherche?q=${encodeURIComponent(brut.slice(0, 60))}` });
    }
    return [...trouves, ...extra].slice(0, 30);
  }, [texte, commandes, t]);

  const executer = (c: Commande) => {
    setOuvert(false);
    const [route, ancre] = c.aller.split("#");
    if (ancre && (route === "/" || route === "") && chemin === "/") {
      document.getElementById(ancre)?.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", `#${ancre}`);
      return;
    }
    router.push(c.aller);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setTexte("");
          setActif(0);
          setOuvert(true);
        }}
        aria-label={t("Ouvrir la barre de commandes", "Open the command bar")}
        title={t("Barre de commandes (Ctrl+K)", "Command bar (Ctrl+K)")}
        className="hidden shrink-0 items-center gap-1 rounded-lg border border-bordure px-2 py-1 text-xs text-attenue transition-colors hover:border-bordure-forte hover:text-texte lg:inline-flex"
      >
        <kbd className="font-sans">Ctrl</kbd>
        <span aria-hidden>+</span>
        <kbd className="font-sans">K</kbd>
      </button>
      {ouvert && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[12vh] backdrop-blur-sm" onClick={() => setOuvert(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("Barre de commandes", "Command bar")}
            className="carte w-full max-w-lg overflow-hidden rounded-carte border border-bordure bg-surface shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={champ}
              autoFocus
              value={texte}
              onChange={(e) => {
                setTexte(e.target.value);
                setActif(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOuvert(false);
                else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActif((a) => Math.min(a + 1, resultats.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActif((a) => Math.max(a - 1, 0));
                } else if (e.key === "Enter" && resultats[actif]) {
                  e.preventDefault();
                  executer(resultats[actif]);
                }
              }}
              role="combobox"
              aria-expanded="true"
              aria-controls="commandes-liste"
              aria-activedescendant={resultats[actif] ? `commande-${resultats[actif].id}` : undefined}
              maxLength={60}
              placeholder={t("Page, widget, symbole (SPX, EURUSD…) ou mot-clé", "Page, widget, symbol (SPX, EURUSD…) or keyword")}
              className="w-full border-b border-bordure bg-transparent px-4 py-3 text-sm outline-none placeholder:text-discret"
            />
            <ul id="commandes-liste" role="listbox" className="max-h-[50vh] overflow-y-auto py-1">
              {resultats.length === 0 && <li className="px-4 py-3 text-sm text-attenue">{t("Aucun résultat.", "No results.")}</li>}
              {resultats.map((c, i) => (
                <li
                  key={c.id}
                  id={`commande-${c.id}`}
                  role="option"
                  aria-selected={i === actif}
                  onMouseEnter={() => setActif(i)}
                  onClick={() => executer(c)}
                  className={`flex cursor-pointer items-center justify-between gap-3 px-4 py-2 text-sm ${i === actif ? "bg-accent-doux text-accent-clair" : ""}`}
                >
                  <span className="min-w-0 truncate">{c.libelle}</span>
                  <span className="shrink-0 text-xs text-discret">{c.groupe}</span>
                </li>
              ))}
            </ul>
            <p className="border-t border-bordure px-4 py-2 text-[0.7rem] text-discret">
              {t("↑ ↓ pour choisir · Entrée pour ouvrir · Échap pour fermer", "↑ ↓ to choose · Enter to open · Esc to close")}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
