import Link from "next/link";
import type { ReactNode } from "react";
import { Carte, Pastille } from "@/components/carte";
import { EnTete } from "@/components/en-tete";
import { HeureArticle } from "@/components/horodatage";
import { formaterDateSeance } from "@/lib/format";
import { formaterMontantCourt } from "@/lib/flux";
import { assurerProfil } from "@/lib/profil";
import { nettoyerRecherche, rechercher } from "@/lib/recherche";
import { supabaseUtilisateur } from "@/lib/supabase";

const CLASSES: Record<string, string> = { indice: "Indice", forex: "Devise", action: "Action", matiere: "Matière première", taux: "Taux" };

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
          <label htmlFor="q-page" className="sr-only">Rechercher un actif, une entreprise, une personne ou un mot-clé</label>
          <input
            id="q-page"
            name="q"
            type="search"
            defaultValue={q}
            autoFocus={!q}
            maxLength={60}
            placeholder="Actif, entreprise, dirigeant, institution, mot-clé…"
            className="min-w-0 flex-1 rounded-xl border border-bordure bg-surface px-4 py-2.5 text-sm placeholder:text-discret focus:border-accent/60"
          />
          <button type="submit" className="rounded-xl border border-accent/50 bg-accent-doux px-4 py-2.5 text-sm font-medium text-accent-clair hover:border-accent">
            Rechercher
          </button>
        </form>

        {!resultats ? (
          <p className="text-sm text-attenue">
            Saisissez au moins 2 caractères : symbole (NVDA, SPX), entreprise, secteur, dirigeant, gérant (Berkshire), indicateur
            (inflation) ou mot présent dans un titre d&apos;actualité. La recherche porte uniquement sur les données déjà collectées.
          </p>
        ) : resultats.total === 0 ? (
          <p className="text-sm text-attenue">Aucun résultat pour « {resultats.q} » dans les données collectées.</p>
        ) : (
          <>
            <p className="text-sm text-attenue">
              {resultats.total} résultat{resultats.total > 1 ? "s" : ""} pour « {resultats.q} »
            </p>

            <Groupe titre="Instruments suivis" nombre={resultats.instruments.length}>
              <ul className="flex flex-col divide-y divide-bordure text-sm">
                {resultats.instruments.map((i) => (
                  <li key={i.symbole} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="font-medium">{i.nom}</span>
                    <span className="text-xs text-attenue">{i.symbole} · {CLASSES[i.classe] ?? i.classe}</span>
                    <span className="ml-auto">
                      {i.prioritaire ? (
                        <Link href="/#titre-indices" className="text-xs text-accent-clair hover:underline">Voir sur le tableau de bord</Link>
                      ) : i.actif ? (
                        <Pastille ton="hausse">Activé</Pastille>
                      ) : (
                        <Pastille>Désactivé par l&apos;administrateur</Pastille>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </Groupe>

            <Groupe titre="Entreprises suivies (SEC)" nombre={resultats.entreprises.length}>
              <ul className="flex flex-col divide-y divide-bordure text-sm">
                {resultats.entreprises.map((e) => (
                  <li key={e.symbole} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="font-medium">{e.nom}</span>
                    <span className="text-xs text-attenue">{e.symbole} · {e.secteur}</span>
                    <a
                      href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${e.cik}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto text-xs text-accent-clair hover:underline"
                    >
                      Dépôts sur SEC EDGAR
                    </a>
                  </li>
                ))}
              </ul>
            </Groupe>

            <Groupe titre="Transactions d'initiés" nombre={resultats.transactions.length}>
              <ul className="flex flex-col divide-y divide-bordure text-sm">
                {resultats.transactions.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-2">
                    <span className="font-medium">{t.entreprise}</span>
                    <a href={t.source_formulaire} target="_blank" rel="noopener noreferrer" className="min-w-0 text-attenue hover:underline">
                      {t.personne}{t.poste ? ` · ${t.poste}` : ""}
                    </a>
                    <span className="chiffres ml-auto text-xs text-attenue">
                      {t.type_transaction} · {formaterMontantCourt(t.montant)} · {formaterDateSeance(t.date)} · SEC (formulaire 4)
                    </span>
                  </li>
                ))}
              </ul>
            </Groupe>

            <Groupe titre="Institutions (13F)" nombre={resultats.institutions.length}>
              <ul className="flex flex-col divide-y divide-bordure text-sm">
                {resultats.institutions.map((i) => (
                  <li key={i.cik} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="font-medium">{i.nom}</span>
                    <span className="text-xs text-attenue">
                      {i.lignes} position{i.lignes > 1 ? "s" : ""} collectée{i.lignes > 1 ? "s" : ""}
                      {i.dernierRapport && ` · dernier 13F au ${formaterDateSeance(i.dernierRapport)}`} · SEC EDGAR
                    </span>
                  </li>
                ))}
              </ul>
            </Groupe>

            <Groupe titre="Actualités retenues" nombre={resultats.articles.length}>
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

            <Groupe titre="Calendrier économique" nombre={resultats.calendrier.length}>
              <ul className="flex flex-col divide-y divide-bordure text-sm">
                {resultats.calendrier.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="font-medium">{c.libelle}</span>
                    <span className="ml-auto text-xs text-attenue">
                      {formaterDateSeance(c.date_evenement)} · {c.source_donnee}
                    </span>
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
