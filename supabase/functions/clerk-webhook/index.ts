// Webhook Clerk (user.created / user.updated / user.deleted).
// Déployé sans vérification JWT Supabase : l'authenticité est prouvée par la
// signature Svix, vérifiée à chaque appel. Tout appel non signé est refusé.
import { json } from "../_shared/http.ts";
import { journaliserEvenement } from "../_shared/journal.ts";
import { enregistrerProfil, supprimerProfil } from "../_shared/profils.ts";
import { lireSecret } from "../_shared/supabase.ts";
import { verifierSignatureSvix } from "../_shared/svix.ts";

interface AdresseEmail {
  id: string;
  email_address: string;
  verification?: { status?: string } | null;
}

interface DonneesUtilisateur {
  id: string;
  primary_email_address_id?: string | null;
  email_addresses?: AdresseEmail[];
}

const TACHE = "webhook-clerk";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erreur: "Méthode non autorisée." }, 405);

  const corps = await req.text();
  let secret: string | null;
  try {
    secret = await lireSecret("clerk_webhook_secret");
  } catch (erreur) {
    console.error(erreur);
    return json({ erreur: "Configuration indisponible." }, 500);
  }
  if (!secret) {
    await journaliserEvenement(TACHE, "echec", "Secret clerk_webhook_secret absent du Vault.");
    return json({ erreur: "Webhook non configuré." }, 500);
  }

  const verification = await verifierSignatureSvix(secret, req.headers, corps);
  if (!verification.valide) {
    await journaliserEvenement(TACHE, "echec", `Appel refusé : ${verification.raison}.`);
    return json({ erreur: "Signature invalide." }, 401);
  }

  let evenement: { type?: string; data?: DonneesUtilisateur };
  try {
    evenement = JSON.parse(corps);
  } catch {
    return json({ erreur: "Corps JSON invalide." }, 400);
  }
  const donnees = evenement.data;
  if (!donnees?.id) return json({ erreur: "Utilisateur absent de l'événement." }, 400);

  try {
    switch (evenement.type) {
      case "user.created":
      case "user.updated": {
        const principale = donnees.email_addresses?.find((e) => e.id === donnees.primary_email_address_id) ??
          donnees.email_addresses?.[0];
        const profil = await enregistrerProfil(
          {
            clerkUserId: donnees.id,
            email: principale?.email_address ?? null,
            emailVerifie: principale?.verification?.status === "verified",
          },
          "webhook",
        );
        await journaliserEvenement(TACHE, "succes", `${evenement.type} traité (rôle ${profil?.role}).`, {
          clerk_user_id: donnees.id,
          svix_id: req.headers.get("svix-id"),
        });
        return json({ ok: true });
      }
      case "user.deleted": {
        await supprimerProfil(donnees.id);
        await journaliserEvenement(TACHE, "succes", "user.deleted traité.", { clerk_user_id: donnees.id });
        return json({ ok: true });
      }
      default:
        return json({ ok: true, ignore: evenement.type ?? "inconnu" });
    }
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : String(erreur);
    await journaliserEvenement(TACHE, "echec", `${evenement.type} : ${message}`, { clerk_user_id: donnees.id });
    // 500 : Clerk rejouera l'événement plus tard (le traitement est idempotent).
    return json({ erreur: "Traitement impossible." }, 500);
  }
});
