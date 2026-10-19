import { SectionBiais } from "@/components/biais/section-biais";
import { Carte } from "@/components/carte";
import { Avertissement, EnTete } from "@/components/en-tete";
import { SectionAnticipations } from "@/components/fondamentaux/section-anticipations";
import { SectionConsensus } from "@/components/fondamentaux/section-consensus";
import { SectionLiquidite } from "@/components/fondamentaux/section-liquidite";
import { SectionPerformance } from "@/components/fondamentaux/section-performance";
import { SectionMacro } from "@/components/macro/section-macro";
import { SectionTaux } from "@/components/macro/section-taux";
import { CarteInstrument } from "@/components/marches/carte-instrument";
import { GraphiquePrix } from "@/components/marches/graphique-prix";
import { Moniteur } from "@/components/marches/moniteur";
import { SectionBanques } from "@/components/monde/section-banques";
import { SectionDevises } from "@/components/monde/section-devises";
import { SectionRegime } from "@/components/monde/section-regime";
import { RafraichissementAuto } from "@/components/rafraichissement";
import { Reperes } from "@/components/reperes";
import { Repliable } from "@/components/repliable";
import { Tableau, type Widget } from "@/components/tableau";
import { SectionCalendrier } from "@/components/veille/calendrier";
import { SectionSquawks, SectionVeille } from "@/components/veille/section-veille";
import { lireBiais } from "@/lib/biais";
import { lireFondamentaux } from "@/lib/fondamentaux";
import { traducteur } from "@/lib/i18n";
import { lireMacro, lireTaux } from "@/lib/macro";
import { lireMarches, nomInstrument } from "@/lib/marches";
import { ACTIFS_CORRELATION, lireAnalyses, lireMonde } from "@/lib/monde";
import { lirePreferences } from "@/lib/preferences";
import { assurerProfil } from "@/lib/profil";
import { supabaseUtilisateur } from "@/lib/supabase";
import { lireCalendrier, lireSquawks, lireVeille } from "@/lib/veille";

export default async function TableauDeBord({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const etat = await assurerProfil();
  const profil = etat.etat === "ok" ? etat.profil : null;
  const preferences = await lirePreferences();
  const { langue } = preferences;
  const t = traducteur(langue);

  if (etat.etat === "erreur") {
    return (
      <>
        <EnTete estAdmin={false} />
        <main className="marges-securite mx-auto max-w-[90rem] px-4 py-6 sm:px-6">
          <Carte titre={t("Compte non initialisé", "Account not initialized")} className="border-baisse/40">
            <p className="text-sm text-attenue">{etat.message}</p>
          </Carte>
        </main>
      </>
    );
  }

  const supabase = await supabaseUtilisateur();
  const [marches, taux, macro, veille, squawks, calendrier, biais, monde, fondamentaux] = await Promise.all([
    lireMarches(supabase),
    lireTaux(supabase),
    lireMacro(supabase, langue),
    lireVeille(supabase, langue),
    lireSquawks(supabase, langue),
    lireCalendrier(supabase, langue),
    lireBiais(supabase),
    lireMonde(supabase),
    lireFondamentaux(supabase),
  ]);
  const analyses = await lireAnalyses(supabase, monde);
  const indices = marches.filter((l) => l.prioritaire);
  // Séance la plus récente des indices : signale une carte en retard (FRED publie le Nasdaq-100 plus tard).
  const derniereSeance = indices.reduce((max, l) => (l.date > max ? l.date : max), "");
  const instruments = marches.map((l) => ({ symbole: l.symbole, nom: nomInstrument(l, langue), classe: l.classe }));
  const demande = (await searchParams).instrument;
  const initial = instruments.find((i) => i.symbole === demande)?.symbole;

  // Barre d'état : prochaine décision de banque centrale et prochaine statistique à fort impact.
  const maintenant = calendrier.lu;
  const reunion = calendrier.reunions[0];
  const fort = calendrier.mondial.find((e) => e.impact === "fort" && Date.parse(e.instant) > maintenant);
  const evenements = [
    ...(reunion ? [{ libelle: `${reunion.banque}${t(" : décision de taux", ": rate decision")}`, instantUtc: reunion.annonceUtc }] : []),
    ...(fort ? [{ libelle: `${fort.devise} · ${fort.libelle}`, instantUtc: fort.instant }] : []),
  ];

  const widgets: Widget[] = [
    {
      id: "indices",
      contenu: (
        <section aria-label={t("Indices prioritaires", "Key indices")} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {indices.map((l, i) => <CarteInstrument key={l.symbole} ligne={l} langue={langue} derniereSeance={derniereSeance} delai={i * 60} />)}
        </section>
      ),
    },
    { id: "biais", contenu: <SectionBiais etat={biais} langue={langue} /> },
    { id: "performance", contenu: <SectionPerformance f={fondamentaux} langue={langue} /> },
    { id: "anticipations", contenu: <SectionAnticipations f={fondamentaux} langue={langue} /> },
    { id: "liquidite", contenu: <SectionLiquidite f={fondamentaux} langue={langue} /> },
    {
      id: "regime",
      contenu: (
        <SectionRegime
          regime={analyses.regime}
          couvertures={analyses.couvertures}
          correlations20={analyses.correlations20}
          correlations60={analyses.correlations60}
          actifs={ACTIFS_CORRELATION.map((a) => a.symbole)}
        />
      ),
    },
    { id: "devises", contenu: <SectionDevises forces={analyses.forces} paires={analyses.paires} langue={langue} /> },
    { id: "moniteur", contenu: <Moniteur lignes={marches} classes={preferences.classes} /> },
    {
      id: "graphique",
      contenu: (
        <section id="graphique" className="scroll-mt-20">
          <Carte>
            <GraphiquePrix instruments={instruments} initial={initial} />
          </Carte>
        </section>
      ),
    },
    { id: "squawks", contenu: <SectionSquawks squawks={squawks} langue={langue} /> },
    { id: "consensus", contenu: <SectionConsensus f={fondamentaux} langue={langue} /> },
    { id: "calendrier", contenu: <SectionCalendrier calendrier={calendrier} /> },
    {
      id: "banques",
      contenu: (
        <Repliable titre={t("Banques centrales", "Central banks")} resume={t("Taux directeurs, orientation, décisions passées et à venir", "Policy rates, stance, past and upcoming decisions")}>
          <SectionBanques monde={monde} forces={analyses.forces} calendrier={calendrier} langue={langue} />
        </Repliable>
      ),
    },
    { id: "actualites", contenu: <SectionVeille veille={veille} langue={langue} /> },
    {
      id: "taux",
      contenu: (
        <Repliable titre={t("Courbe des taux", "Yield curve")} resume={t("Trésor américain, de 3 mois à 30 ans", "US Treasury, 3 months to 30 years")}>
          <SectionTaux taux={taux} langue={langue} />
        </Repliable>
      ),
    },
    {
      id: "macro",
      contenu: (
        <Repliable titre={t("Macroéconomie (8 grandes économies)", "Macro (8 major economies)")} resume={t("États-Unis en détail, puis EUR, GBP, CAD, JPY, CHF, AUD, NZD", "United States in detail, then EUR, GBP, CAD, JPY, CHF, AUD, NZD")}>
          <SectionMacro indicateurs={macro} monde={monde} langue={langue} />
        </Repliable>
      ),
    },
  ];

  return (
    <>
      <EnTete estAdmin={profil?.role === "admin"} />
      <RafraichissementAuto minutes={3} />
      <main className="marges-securite mx-auto flex max-w-[90rem] flex-col gap-5 px-4 py-5 sm:px-6">
        <Reperes evenements={evenements} />
        <Tableau widgets={widgets} disposition={preferences.disposition} />
        <Avertissement />
      </main>
    </>
  );
}
