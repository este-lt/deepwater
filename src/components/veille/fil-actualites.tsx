"use client";

import { type ReactNode, useState } from "react";
import { Pastille } from "@/components/carte";
import { HeureArticle, HeureLocale } from "@/components/horodatage";
import { useLangue } from "@/components/langue";
import type { ArticleAffiche } from "@/lib/veille";

const REGIONS = [
  { cle: "tous", fr: "Tout", en: "All" },
  { cle: "US", fr: "États-Unis", en: "US" },
  { cle: "Europe", fr: "Europe", en: "Europe" },
  { cle: "Monde", fr: "Monde", en: "World" },
] as const;

export const CATEGORIES: Record<string, { fr: string; en: string }> = {
  banque_centrale: { fr: "Banque centrale", en: "Central bank" },
  statistique_macro: { fr: "Statistique", en: "Data" },
  marche: { fr: "Marchés", en: "Markets" },
  politique_eco: { fr: "Politique économique", en: "Economic policy" },
  geopolitique: { fr: "Géopolitique", en: "Geopolitics" },
};

const PAR_PAGE = 8;

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

function Categories({ articles, categorie, setCategorie, fortSeul, setFortSeul }: {
  articles: ArticleAffiche[];
  categorie: string | null;
  setCategorie: (c: string | null) => void;
  fortSeul: boolean;
  setFortSeul: (v: boolean) => void;
}) {
  const { t } = useLangue();
  const presentes = Object.keys(CATEGORIES).filter((c) => articles.some((a) => a.categorie === c));
  return (
    <div role="group" aria-label={t("Catégorie", "Category")} className="flex flex-wrap items-center gap-1.5">
      <Filtre actif={categorie === null} onClick={() => setCategorie(null)}>{t("Toutes", "All")}</Filtre>
      {presentes.map((c) => (
        <Filtre key={c} actif={categorie === c} onClick={() => setCategorie(categorie === c ? null : c)}>
          {t(CATEGORIES[c].fr, CATEGORIES[c].en)}
        </Filtre>
      ))}
      <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-xs text-attenue">
        <input type="checkbox" checked={fortSeul} onChange={(e) => setFortSeul(e.target.checked)} className="size-3.5 accent-[var(--color-accent)]" />
        {t("Impact fort uniquement", "High impact only")}
      </label>
    </div>
  );
}

export function FilActualites({ articles, fenetreJours }: { articles: ArticleAffiche[]; fenetreJours: number }) {
  const { t } = useLangue();
  const [region, setRegion] = useState<(typeof REGIONS)[number]["cle"]>("tous");
  const [categorie, setCategorie] = useState<string | null>(null);
  const [fortSeul, setFortSeul] = useState(false);
  const [affiches, setAffiches] = useState(PAR_PAGE);

  const parRegion: Record<string, number> = { tous: articles.length };
  for (const a of articles) parRegion[a.region ?? "US"] = (parRegion[a.region ?? "US"] ?? 0) + 1;
  const filtres = articles.filter(
    (a) => (region === "tous" || (a.region ?? "US") === region) && (categorie === null || a.categorie === categorie) && (!fortSeul || a.impact_niveau === "fort"),
  );
  const changer = (action: () => void) => {
    action();
    setAffiches(PAR_PAGE);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2.5">
        <div role="group" aria-label={t("Région", "Region")} className="grid grid-cols-4 gap-1 rounded-xl bg-surface-2 p-1">
          {REGIONS.map((r) => (
            <button
              key={r.cle}
              type="button"
              aria-pressed={region === r.cle}
              onClick={() => changer(() => setRegion(r.cle))}
              className={`min-w-0 truncate rounded-lg px-1.5 py-1.5 text-sm font-medium transition-colors sm:px-3 ${
                region === r.cle ? "bg-surface-3 text-texte shadow-sm" : "text-attenue hover:text-texte"
              }`}
            >
              {t(r.fr, r.en)}
              <span className="chiffres ml-1 text-xs text-discret">{parRegion[r.cle] ?? 0}</span>
            </button>
          ))}
        </div>
        <Categories
          articles={articles}
          categorie={categorie}
          setCategorie={(c) => changer(() => setCategorie(c))}
          fortSeul={fortSeul}
          setFortSeul={(v) => changer(() => setFortSeul(v))}
        />
      </div>

      {filtres.length === 0 ? (
        <p className="rounded-xl bg-surface-2 p-4 text-sm text-attenue">
          {t(`Aucun article retenu pour ce filtre sur les ${fenetreJours} derniers jours.`, `No article kept for this filter over the last ${fenetreJours} days.`)}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-bordure">
          {filtres.slice(0, affiches).map((a) => (
            <li key={a.id} className="flex gap-3 py-3 first:pt-0">
              <span aria-hidden className={`mt-1 w-1 shrink-0 self-stretch rounded-full ${a.impact_niveau === "fort" ? "bg-alerte/80" : "bg-bordure-forte"}`} />
              <article className="min-w-0 flex-1">
                <h3 className="text-[0.92rem] font-medium leading-snug">
                  <a href={a.url} target="_blank" rel="noopener noreferrer" title={a.original ?? undefined} className="hover:text-accent-clair hover:underline">
                    {a.titre}
                  </a>
                </h3>
                {a.extrait_court && <p className="mt-1 line-clamp-2 text-sm text-attenue">{a.extrait_court}</p>}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-discret">
                  <span className="text-attenue">{a.source}</span>
                  <span aria-hidden>·</span>
                  <HeureArticle iso={a.date_publication} />
                  {a.impact_niveau === "fort" && <Pastille ton="alerte">{t("Impact fort", "High impact")}</Pastille>}
                  {a.categorie && CATEGORIES[a.categorie] && <Pastille>{t(CATEGORIES[a.categorie].fr, CATEGORIES[a.categorie].en)}</Pastille>}
                  {a.tickers_lies.length > 0 && <span className="chiffres">{a.tickers_lies.slice(0, 4).join(" · ")}</span>}
                  {a.original && <span title={a.original}>{t("· traduit automatiquement", "· machine-translated")}</span>}
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
          {t(`Afficher plus (${filtres.length - affiches} restants)`, `Show more (${filtres.length - affiches} left)`)}
        </button>
      )}
    </div>
  );
}

// Fil instantané : titres courts, heure locale, catégorie ; défilement vertical.
export function FilSquawks({ squawks }: { squawks: ArticleAffiche[] }) {
  const { t } = useLangue();
  const [categorie, setCategorie] = useState<string | null>(null);
  const [fortSeul, setFortSeul] = useState(false);
  const filtres = squawks.filter((s) => (categorie === null || s.categorie === categorie) && (!fortSeul || s.impact_niveau === "fort"));
  return (
    <div className="flex flex-col gap-3">
      <Categories articles={squawks} categorie={categorie} setCategorie={setCategorie} fortSeul={fortSeul} setFortSeul={setFortSeul} />
      {filtres.length === 0 ? (
        <p className="rounded-xl bg-surface-2 p-4 text-sm text-attenue">{t("Rien de significatif sur les dernières 24 heures.", "Nothing significant in the last 24 hours.")}</p>
      ) : (
        <ul className="flex max-h-[30rem] flex-col overflow-y-auto pr-1">
          {filtres.map((s) => (
            <li key={s.id} className="flex gap-3 border-t border-bordure py-2 first:border-t-0">
              <span className="chiffres w-11 shrink-0 pt-0.5 text-xs text-attenue"><HeureLocale iso={s.date_publication} /></span>
              <span className="min-w-0 flex-1">
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={s.original ?? undefined}
                  className={`text-sm leading-snug hover:text-accent-clair ${s.impact_niveau === "fort" ? "font-semibold" : ""}`}
                >
                  {s.titre}
                </a>
                <span className="mt-0.5 flex flex-wrap gap-x-2 text-[0.7rem] text-discret">
                  <span>{s.source}</span>
                  {s.categorie && CATEGORIES[s.categorie] && <span>{t(CATEGORIES[s.categorie].fr, CATEGORIES[s.categorie].en)}</span>}
                  {s.tickers_lies.length > 0 && <span className="chiffres">{s.tickers_lies.slice(0, 3).join(" · ")}</span>}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
