// Création de secours du profil à la première connexion, si le webhook Clerk a
// échoué ou est en retard. Appelé uniquement par le serveur Next.js, qui lit
// l'utilisateur via l'API Clerk (source de confiance) avant d'appeler.
import { servirTacheProtegee } from "../_shared/garde.ts";
import { json } from "../_shared/http.ts";
import { journaliserEvenement } from "../_shared/journal.ts";
import { enregistrerProfil } from "../_shared/profils.ts";

servirTacheProtegee(async (corps) => {
  const clerkUserId = typeof corps.clerk_user_id === "string" ? corps.clerk_user_id : "";
  const email = typeof corps.email === "string" ? corps.email : null;
  const emailVerifie = corps.email_verifie === true;
  if (!clerkUserId) return json({ erreur: "clerk_user_id manquant." }, 400);

  try {
    const profil = await enregistrerProfil({ clerkUserId, email, emailVerifie }, "secours");
    await journaliserEvenement(
      "profil-secours",
      "succes",
      profil?.source_creation === "secours"
        ? "Profil créé par le secours (webhook absent ou en retard)."
        : "Profil déjà présent : rien à faire.",
      { clerk_user_id: clerkUserId },
    );
    return json({ ok: true, profil });
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : String(erreur);
    await journaliserEvenement("profil-secours", "echec", message, { clerk_user_id: clerkUserId });
    return json({ erreur: "Création du profil impossible." }, 500);
  }
});
