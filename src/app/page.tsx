import { Carte } from "@/components/carte";
import { SectionFondamentales } from "@/components/fondamentales/section-fondamentales";
import { Avertissement, EnTete } from "@/components/en-tete";
import { CarteInstrument } from "@/components/marches/carte-instrument";
import { GraphiquePrix } from "@/components/marches/graphique-prix";
import { SectionFlux } from "@/components/flux/section-flux";
import { SectionMacro } from "@/components/macro/section-macro";
import { SectionTaux } from "@/components/macro/section-taux";
import { lireFlux } from "@/lib/flux";
import { lireFiches } from "@/lib/fondamentales";
import { lireMacro, lireMatieres, lireTaux } from "@/lib/macro";
import { lireResumes } from "@/lib/marches";
import { assurerProfil } from "@/lib/profil";
import { supabaseUtilisateur } from "@/lib/supabase";

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
  const [indices, optionnels, fiches, taux, matieres, macro, flux] = await Promise.all([
    lireResumes(supabase, { prioritaires: true }),
    lireResumes(supabase, { classes: ["indice", "forex", "action"] }),
    lireFiches(supabase),
    lireTaux(supabase),
    lireMatieres(supabase),
    lireMacro(supabase),
    lireFlux(supabase),
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
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,19rem),1fr))]">
            {indices.map((r, i) => (
              <CarteInstrument key={r.ticker.id} resume={r} delai={i * 60} />
            ))}
          </div>
        </section>

        <SectionTaux taux={taux} matieres={matieres} />
        <SectionMacro indicateurs={macro} />
        <SectionFlux flux={flux} />

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

        <Avertissement />
      </main>
    </>
  );
}
