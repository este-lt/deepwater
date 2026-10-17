import { EnTete } from "@/components/en-tete";
import { FormulaireParametres } from "@/components/parametres/formulaire";
import { traducteur } from "@/lib/i18n";
import { lirePreferences } from "@/lib/preferences";
import { assurerProfil } from "@/lib/profil";

export async function generateMetadata() {
  const t = traducteur((await lirePreferences()).langue);
  return { title: `${t("Paramètres", "Settings")} · Deepwater` };
}

export default async function PageParametres() {
  const etat = await assurerProfil();
  const { langue, theme, disposition, classes } = await lirePreferences();
  const t = traducteur(langue);
  return (
    <>
      <EnTete estAdmin={etat.etat === "ok" && etat.profil.role === "admin"} />
      <main className="marges-securite mx-auto flex max-w-[60rem] flex-col gap-5 px-4 py-6 sm:px-6">
        <h1 className="text-xl font-semibold tracking-tight">{t("Paramètres", "Settings")}</h1>
        <FormulaireParametres langue={langue} theme={theme} disposition={disposition} classes={classes} />
      </main>
    </>
  );
}
