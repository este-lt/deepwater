import { SectionBiais } from "@/components/biais/section-biais";
import { Carte } from "@/components/carte";
import { SectionFondamentales } from "@/components/fondamentales/section-fondamentales";
import { Avertissement, EnTete } from "@/components/en-tete";
import { CarteInstrument } from "@/components/marches/carte-instrument";
import { GraphiquePrix } from "@/components/marches/graphique-prix";
import { Reperes } from "@/components/reperes";
import { Repliable } from "@/components/repliable";
import { SectionFlux } from "@/components/flux/section-flux";
import { SectionMacro } from "@/components/macro/section-macro";
import { SectionTaux } from "@/components/macro/section-taux";
import { SectionCalendrier, SectionVeille } from "@/components/veille/section-veille";
import { lireBiais } from "@/lib/biais";
import { lireFlux } from "@/lib/flux";
import { lireFiches } from "@/lib/fondamentales";
import { lireMacro, lireMatieres, lireTaux } from "@/lib/macro";
import { lireResumes } from "@/lib/marches";
import { assurerProfil } from "@/lib/profil";
import { supabaseUtilisateur } from "@/lib/supabase";
import { lireCalendrier, lireVeille } from "@/lib/veille";

export default async function TableauDeBord() {
  const etat = await assurerProfil();
  const profil = etat.etat === "ok" ? etat.profil : null;

  if (etat.etat === "erreur") {
    return (
      <>
        <EnTete estAdmin={false} />
        <main className="mx-auto max-w-[90rem] px-4 py-6 sm:px-6">
          <Carte titre="Compte non initialisé" className="border-baisse/40">
            <p className="text-sm text-attenue">{etat.message}</p>
          </Carte>
        </main>
      </>
    );
  }

  const supabase = await supabaseUtilisateur();
  const [indices, optionnels, fiches, taux, matieres, macro, flux, veille, calendrier, biais] = await Promise.all([
    lireResumes(supabase, { prioritaires: true }),
    lireResumes(supabase, { classes: ["indice", "forex", "action"] }),
    lireFiches(supabase),
    lireTaux(supabase),
    lireMatieres(supabase),
    lireMacro(supabase),
    lireFlux(supabase),
    lireVeille(supabase),
    lireCalendrier(supabase),
    lireBiais(supabase),
  ]);
  const instrumentsGraphique = [...indices, ...optionnels].map((r) => ({ symbole: r.ticker.symbole, nom: r.ticker.nom }));

  return (
    <>
      <EnTete estAdmin={profil?.role === "admin"} />
      <main className="mx-auto flex max-w-[90rem] flex-col gap-6 px-4 py-6 sm:px-6">
        <section aria-labelledby="titre-indices" className="flex flex-col gap-3">
          <h2 id="titre-indices" className="text-sm font-medium text-attenue">
            Indices suivis
          </h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.15fr)]">
            {indices.map((r, i) => (
              <CarteInstrument key={r.ticker.id} resume={r} delai={i * 60} />
            ))}
            <div className="md:col-span-2 xl:col-span-1">
              <Reperes
                donnees={{
                  reunion: calendrier.reunions[0] ? { banque: calendrier.reunions[0].banque, annonceUtc: calendrier.reunions[0].annonceUtc } : null,
                  biais: biais.courants.map((b) => ({ nom: b.nom, biais: b.biais, score: b.score })),
                  actualites: {
                    total: veille.articles.length,
                    fortes: veille.articles.filter((a) => a.impact_niveau === "fort").length,
                    jours: veille.fenetreJours,
                  },
                }}
              />
            </div>
          </div>
        </section>

        {/* Ordre du cahier des charges (étape 10), indices prioritaires en tête. */}
        <SectionBiais etat={biais} />

        <details open className="group rounded-carte border border-bordure bg-surface animate-apparition">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 sm:px-6">
            <span>
              <span className="text-[0.95rem] font-semibold tracking-tight">Graphiques</span>
              <span className="ml-2 text-sm text-attenue">Clôtures et moyennes mobiles 20 / 50 jours</span>
            </span>
            <span className="text-attenue transition-transform group-open:rotate-180" aria-hidden>
              ▾
            </span>
          </summary>
          <div className="px-5 pb-5 sm:px-6 sm:pb-6">
            <GraphiquePrix instruments={instrumentsGraphique} />
          </div>
        </details>

        <SectionTaux taux={taux} matieres={matieres} />

        <Repliable titre="Initiés et institutions" resume="Formulaires 4 et 13F des grandes capitalisations">
          <SectionFlux flux={flux} />
        </Repliable>

        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
          <SectionVeille veille={veille} />
          <Repliable titre="Calendrier économique" resume="Décisions de taux et statistiques publiées">
            <SectionCalendrier calendrier={calendrier} />
          </Repliable>
        </div>

        <Repliable titre="Macroéconomie américaine" resume="Inflation, emploi, croissance, taux directeur">
          <SectionMacro indicateurs={macro} />
        </Repliable>

        {optionnels.length > 0 && (
          <details className="group rounded-carte border border-bordure bg-surface animate-apparition">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 sm:px-6">
              <span>
                <span className="text-[0.95rem] font-semibold tracking-tight">Marchés optionnels</span>
                <span className="ml-2 text-sm text-attenue">Activés par l&apos;administrateur</span>
              </span>
              <span className="text-attenue transition-transform group-open:rotate-180" aria-hidden>
                ▾
              </span>
            </summary>
            <div className="grid gap-4 px-5 pb-5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,17rem),1fr))] sm:px-6 sm:pb-6">
              {optionnels.map((r, i) => (
                <CarteInstrument key={r.ticker.id} resume={r} delai={i * 40} />
              ))}
            </div>
          </details>
        )}

        {fiches.length > 0 && <SectionFondamentales fiches={fiches} />}

        <Carte titre="Recherche globale" sousTitre="Actif, entreprise, dirigeant, institution ou mot-clé, dans les données collectées">
          <form action="/recherche" role="search" className="flex gap-2">
            <label htmlFor="q-tableau" className="sr-only">Recherche globale</label>
            <input
              id="q-tableau"
              name="q"
              type="search"
              maxLength={60}
              placeholder="Ex. : NVDA, Berkshire, inflation, Fed…"
              className="min-w-0 flex-1 rounded-xl border border-bordure bg-surface-2 px-4 py-2.5 text-sm placeholder:text-discret focus:border-accent/60"
            />
            <button type="submit" className="rounded-xl border border-accent/50 bg-accent-doux px-4 py-2.5 text-sm font-medium text-accent-clair hover:border-accent">
              Rechercher
            </button>
          </form>
        </Carte>

        <Avertissement />
      </main>
    </>
  );
}
