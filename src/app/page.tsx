import { Carte, Pastille } from "@/components/carte";
import { Avertissement, EnTete } from "@/components/en-tete";
import { DateLocale } from "@/components/horodatage";
import { assurerProfil } from "@/lib/profil";

export default async function TableauDeBord() {
  const etat = await assurerProfil();
  const profil = etat.etat === "ok" ? etat.profil : null;

  return (
    <>
      <EnTete estAdmin={profil?.role === "admin"} />
      <main className="mx-auto flex max-w-[90rem] flex-col gap-5 px-4 py-6 sm:px-6">
        {etat.etat === "erreur" ? (
          <Carte titre="Compte non initialisé" className="border-baisse/40">
            <p className="text-sm text-attenue">{etat.message}</p>
          </Carte>
        ) : (
          <Carte
            titre="Votre compte"
            sousTitre="Profil créé automatiquement à l'inscription"
            actions={profil?.role === "admin" ? <Pastille ton="accent">Administrateur</Pastille> : null}
          >
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-attenue">Email</dt>
                <dd className="mt-0.5 truncate">{profil?.email ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-attenue">Créé par</dt>
                <dd className="mt-0.5">{profil?.source_creation === "secours" ? "Secours (1re connexion)" : "Webhook Clerk"}</dd>
              </div>
              <div>
                <dt className="text-attenue">Depuis le</dt>
                <dd className="mt-0.5">{profil && <DateLocale iso={profil.cree_le} />}</dd>
              </div>
            </dl>
          </Carte>
        )}
        <Avertissement />
      </main>
    </>
  );
}
