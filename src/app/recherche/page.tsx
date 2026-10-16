import Link from "next/link";
import type { ReactNode } from "react";
import { Carte, Pastille } from "@/components/carte";
import { EnTete } from "@/components/en-tete";
import { HeureArticle } from "@/components/horodatage";
import { formaterDateSeance } from "@/lib/format";
import { assurerProfil } from "@/lib/profil";
import { nettoyerRecherche, rechercher } from "@/lib/recherche";
import { CLASSES } from "@/lib/sources";
import { supabaseUtilisateur } from "@/lib/supabase";

const LIBELLE_CLASSE = Object.fromEntries(CLASSES.map((c) => [c.cle, c.libelle])) as Record<string, string>;

function Groupe({ titre, nombre, children }: { titre: string; nombre: number; children: ReactNode }) {
  if (nombre === 0) return null;
  return (
    <Carte titre={titre} actions={<Pastille>{nombre}</Pastille>}>
      {children}
    </Carte>
  );
}

export default async function PageRecherche({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const etat = await assurerProfil();
  const q = nettoyerRecherche((await searchParams).q);
  const resultats = q.length >= 2 ? await rechercher(await supabaseUtilisateur(), q) : null;

  return (
    <>
      <EnTete estAdmin={etat.etat === "ok" && etat.profil.role === "admin"} />
      <main className="mx-auto flex max-w-[60rem] flex-col gap-5 px-4 py-6 sm:px-6">
        <form action="/recherche" role="search" className="flex gap-2">
          <label htmlFor="q-page" className="sr-only">Rechercher un actif ou un mot-clé</label>
          <input
            id="q-page"
            name="q"
            type="search"
            defaultValue={q}
            autoFocus={!q}
            maxLength={60}
            placeholder="Actif (VIX, or, EUR/USD…) ou mot-clé (inflation, Fed, tarifs…)"
            className="min-w-0 flex-1 rounded-xl border border-bordure bg-surface px-4 py-2.5 text-sm placeholder:text-discret focus:border-accent/60"
          />
          <button type="submit" className="rounded-xl border border-accent/50 bg-accent-doux px-4 py-2.5 text-sm font-medium text-accent-clair hover:border-accent">
            Rechercher
          </button>
        </form>

        {!resultats ? (
          <p className="text-sm text-attenue">Au moins 2 caractères. La recherche porte sur les données déjà collectées.</p>
        ) : resultats.total === 0 ? (
          <p className="text-sm text-attenue">Aucun résultat pour « {resultats.q} ».</p>
        ) : (
          <>
            <Groupe titre="Instruments" nombre={resultats.instruments.length}>
              <ul className="flex flex-col divide-y divide-bordure text-sm">
                {resultats.instruments.map((i) => (
                  <li key={i.symbole}>
                    <Link href={`/?instrument=${i.symbole}#graphique`} className="flex flex-wrap items-center gap-2 py-2 hover:text-accent-clair">
                      <span className="font-medium">{i.nom}</span>
                      <span className="text-xs text-attenue">{LIBELLE_CLASSE[i.classe] ?? i.classe}</span>
                      <span className="ml-auto text-xs text-accent-clair">Graphique</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Groupe>

            <Groupe titre="Actualités" nombre={resultats.articles.length}>
              <ul className="flex flex-col divide-y divide-bordure text-sm">
                {resultats.articles.map((a) => (
                  <li key={a.id} className="flex flex-col gap-0.5 py-2">
                    <a href={a.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:text-accent-clair hover:underline">
                      {a.titre}
                    </a>
                    <span className="text-xs text-discret">
                      {a.source} · <HeureArticle iso={a.date_publication} />
                      {a.impact_niveau === "fort" && " · impact fort"}
                    </span>
                  </li>
                ))}
              </ul>
            </Groupe>

            <Groupe titre="Calendrier" nombre={resultats.calendrier.length}>
              <ul className="flex flex-col divide-y divide-bordure text-sm">
                {resultats.calendrier.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="font-medium">{c.libelle}</span>
                    <span className="ml-auto text-xs text-attenue">{formaterDateSeance(c.date_evenement)}</span>
                  </li>
                ))}
              </ul>
            </Groupe>
          </>
        )}
      </main>
    </>
  );
}
