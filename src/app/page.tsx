import { SectionBiais } from "@/components/biais/section-biais";
import { Carte } from "@/components/carte";
import { Avertissement, EnTete } from "@/components/en-tete";
import { SectionMacro } from "@/components/macro/section-macro";
import { SectionTaux } from "@/components/macro/section-taux";
import { CarteInstrument } from "@/components/marches/carte-instrument";
import { GraphiquePrix } from "@/components/marches/graphique-prix";
import { Moniteur } from "@/components/marches/moniteur";
import { Reperes } from "@/components/reperes";
import { Repliable } from "@/components/repliable";
import { SectionCalendrier, SectionVeille } from "@/components/veille/section-veille";
import { lireBiais } from "@/lib/biais";
import { lireMacro, lireTaux } from "@/lib/macro";
import { lireMarches } from "@/lib/marches";
import { assurerProfil } from "@/lib/profil";
import { CLASSES_PAR_DEFAUT } from "@/lib/sources";
import { supabaseUtilisateur } from "@/lib/supabase";
import { lireCalendrier, lireVeille } from "@/lib/veille";

export default async function TableauDeBord({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
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
  const [marches, parametres, taux, macro, veille, calendrier, biais] = await Promise.all([
    lireMarches(supabase),
    supabase.from("parametres_utilisateur").select("classes_affichees").maybeSingle(),
    lireTaux(supabase),
    lireMacro(supabase),
    lireVeille(supabase),
    lireCalendrier(supabase),
    lireBiais(supabase),
  ]);
  const indices = marches.filter((l) => l.prioritaire);
  const classes = parametres.data?.classes_affichees ?? CLASSES_PAR_DEFAUT;
  const instruments = marches.map((l) => ({ symbole: l.symbole, nom: l.nom, classe: l.classe }));
  const demande = (await searchParams).instrument;
  const initial = instruments.find((i) => i.symbole === demande)?.symbole;

  // Barre d'état : prochaine décision de banque centrale et prochaine statistique.
  const reunion = calendrier.reunions[0];
  const publication = calendrier.prevues[0];
  const evenements = [
    ...(reunion ? [{ libelle: `${reunion.banque} : décision de taux`, instantUtc: reunion.annonceUtc }] : []),
    ...(publication ? [{ libelle: publication.libelle, instantUtc: publication.annonceUtc }] : []),
  ];

  return (
    <>
      <EnTete estAdmin={profil?.role === "admin"} />
      <main className="mx-auto flex max-w-[90rem] flex-col gap-5 px-4 py-5 sm:px-6">
        <Reperes evenements={evenements} />

        <section aria-label="Indices prioritaires" className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {indices.map((l, i) => (
            <CarteInstrument key={l.symbole} ligne={l} delai={i * 60} />
          ))}
        </section>

        <SectionBiais etat={biais} />

        <Moniteur lignes={marches} classes={classes} />

        <section id="graphique" className="scroll-mt-20">
          <Carte>
            <GraphiquePrix instruments={instruments} initial={initial} />
          </Carte>
        </section>

        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
          <SectionVeille veille={veille} />
          <Repliable titre="Calendrier économique" resume="Décisions de taux et statistiques à venir">
            <SectionCalendrier calendrier={calendrier} />
          </Repliable>
        </div>

        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.65fr)]">
          <Repliable titre="Courbe des taux" resume="Trésor américain, de 3 mois à 30 ans">
            <SectionTaux taux={taux} />
          </Repliable>
          <Repliable titre="Macroéconomie américaine" resume="Inflation, emploi, consommation, croissance">
            <SectionMacro indicateurs={macro} />
          </Repliable>
        </div>

        <Avertissement />
      </main>
    </>
  );
}
