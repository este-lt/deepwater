"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Pastille } from "@/components/carte";
import { HeureArticle } from "@/components/horodatage";
import type { ArticleAffiche } from "@/lib/veille";

const REGIONS = [
  { cle: "tous", libelle: "Tout" },
  { cle: "US", libelle: "États-Unis" },
  { cle: "Europe", libelle: "Europe" },
  { cle: "Monde", libelle: "Monde" },
] as const;

const CATEGORIES: Record<string, string> = {
  banque_centrale: "Banque centrale",
  statistique_macro: "Statistique macro",
  mouvement_marche: "Mouvement de marché",
  resultats: "Résultats",
  fusion_acquisition: "Fusion-acquisition",
  initie_institution: "Initiés / institutions",
};

const PAR_PAGE = 20;

function Filtre({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={actif}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        actif ? "border-accent/60 bg-accent-doux text-accent-clair" : "border-bordure text-attenue hover:border-bordure-forte hover:text-texte"
      }`}
    >
      {children}
    </button>
  );
}

export function FilActualites({ articles, fenetreJours }: { articles: ArticleAffiche[]; fenetreJours: number }) {
  const [region, setRegion] = useState<(typeof REGIONS)[number]["cle"]>("tous");
  const [categorie, setCategorie] = useState<string | null>(null);
  const [fortSeul, setFortSeul] = useState(false);
  const [affiches, setAffiches] = useState(PAR_PAGE);

  const parRegion = useMemo(() => {
    const compte: Record<string, number> = { tous: articles.length };
    for (const a of articles) compte[a.region ?? "US"] = (compte[a.region ?? "US"] ?? 0) + 1;
    return compte;
  }, [articles]);

  const categoriesPresentes = useMemo(
    () => Object.keys(CATEGORIES).filter((c) => articles.some((a) => a.categorie === c)),
    [articles],
  );

  const filtres = articles.filter(
    (a) =>
      (region === "tous" || (a.region ?? "US") === region) &&
      (categorie === null || a.categorie === categorie) &&
      (!fortSeul || a.impact_niveau === "fort"),
  );

  const changer = (action: () => void) => {
    action();
    setAffiches(PAR_PAGE);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2.5">
        <div role="group" aria-label="Région" className="flex flex-wrap gap-1 rounded-xl bg-surface-2 p-1">
          {REGIONS.map((r) => (
            <button
              key={r.cle}
              type="button"
              aria-pressed={region === r.cle}
              onClick={() => changer(() => setRegion(r.cle))}
              className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                region === r.cle ? "bg-surface-3 text-texte shadow-sm" : "text-attenue hover:text-texte"
              }`}
            >
              {r.libelle}
              <span className="chiffres ml-1.5 text-xs text-discret">{parRegion[r.cle] ?? 0}</span>
            </button>
          ))}
        </div>
        <div role="group" aria-label="Catégorie" className="flex flex-wrap items-center gap-1.5">
          <Filtre actif={categorie === null} onClick={() => changer(() => setCategorie(null))}>
            Toutes catégories
          </Filtre>
          {categoriesPresentes.map((c) => (
            <Filtre key={c} actif={categorie === c} onClick={() => changer(() => setCategorie(categorie === c ? null : c))}>
              {CATEGORIES[c]}
            </Filtre>
          ))}
          <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-xs text-attenue">
            <input
              type="checkbox"
              checked={fortSeul}
              onChange={(e) => changer(() => setFortSeul(e.target.checked))}
              className="size-3.5 accent-[var(--color-accent)]"
            />
            Impact fort uniquement
          </label>
        </div>
      </div>

      {filtres.length === 0 ? (
        <p className="rounded-xl bg-surface-2 p-4 text-sm text-attenue">
          Aucun article retenu pour ce filtre sur les {fenetreJours} derniers jours.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-bordure">
          {filtres.slice(0, affiches).map((a) => (
            <li key={a.id} className="flex gap-3 py-3 first:pt-0">
              <span
                aria-hidden
                className={`mt-1 w-1 shrink-0 self-stretch rounded-full ${a.impact_niveau === "fort" ? "bg-alerte/80" : "bg-bordure-forte"}`}
              />
              <article className="min-w-0 flex-1">
                <h3 className="text-[0.92rem] font-medium leading-snug">
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="hover:text-accent-clair hover:underline">
                    {a.titre}
                  </a>
                </h3>
                {a.extrait_court && <p className="mt-1 line-clamp-2 text-sm text-attenue">{a.extrait_court}</p>}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-discret">
                  <span className="text-attenue">{a.source}</span>
                  <span aria-hidden>·</span>
                  <HeureArticle iso={a.date_publication} />
                  {a.impact_niveau === "fort" && <Pastille ton="alerte">Impact fort</Pastille>}
                  {a.categorie && <Pastille>{CATEGORIES[a.categorie] ?? a.categorie}</Pastille>}
                  {a.tickers_lies.length > 0 && <span className="chiffres">{a.tickers_lies.slice(0, 4).join(" · ")}</span>}
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}

      {filtres.length > affiches && (
        <button
          type="button"
          onClick={() => setAffiches((n) => n + PAR_PAGE)}
          className="self-center rounded-full border border-bordure px-4 py-1.5 text-sm text-attenue transition-colors hover:border-bordure-forte hover:text-texte"
        >
          Afficher plus ({filtres.length - affiches} restants)
        </button>
      )}
    </div>
  );
}
