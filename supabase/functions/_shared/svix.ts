// Vérification de signature des webhooks Clerk (format Svix / Standard Webhooks) :
// HMAC-SHA256 de "id.timestamp.corps", clé = secret whsec_ décodé en base64.
import { base64VersOctets, egaliteConstante, octetsVersBase64 } from "./http.ts";

const TOLERANCE_SECONDES = 5 * 60;

export async function verifierSignatureSvix(
  secret: string,
  entetes: Headers,
  corps: string,
): Promise<{ valide: boolean; raison?: string }> {
  const id = entetes.get("svix-id");
  const horodatage = entetes.get("svix-timestamp");
  const signatures = entetes.get("svix-signature");
  if (!id || !horodatage || !signatures) return { valide: false, raison: "en-têtes Svix absents" };

  const ts = Number(horodatage);
  if (!Number.isFinite(ts)) return { valide: false, raison: "horodatage illisible" };
  if (Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SECONDES) {
    return { valide: false, raison: "horodatage hors tolérance (rejeu ?)" };
  }

  const cleBrute = base64VersOctets(secret.startsWith("whsec_") ? secret.slice(6) : secret);
  const cle = await crypto.subtle.importKey(
    "raw",
    cleBrute,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", cle, new TextEncoder().encode(`${id}.${horodatage}.${corps}`));
  const attendue = octetsVersBase64(new Uint8Array(mac));

  const valide = signatures.split(" ").some((partie) => {
    const [version, signature] = partie.split(",");
    return version === "v1" && signature !== undefined && egaliteConstante(signature, attendue);
  });
  return valide ? { valide } : { valide, raison: "signature invalide" };
}
