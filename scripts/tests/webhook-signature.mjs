// Teste le webhook Clerk déployé : appels non signés, mal signés, rejoués,
// puis livraisons valides (création idempotente) et suppression (nettoyage).
// Usage : npm run test:webhook
import { createHmac, randomUUID } from "node:crypto";
import { env } from "./lib.mjs";

const secret = env.CLERK_WEBHOOK_SIGNING_SECRET;
const url = env.NEXT_PUBLIC_SUPABASE_URL + "/functions/v1/clerk-webhook";
const utilisateur = {
  id: "user_testwebhook0001",
  primary_email_address_id: "idn_1",
  email_addresses: [{ id: "idn_1", email_address: "webhook.test@example.com", verification: { status: "verified" } }],
};

function signer(corps, id, ts, secretUtilise) {
  const cle = Buffer.from(secretUtilise.replace("whsec_", ""), "base64");
  return "v1," + createHmac("sha256", cle).update(`${id}.${ts}.${corps}`).digest("base64");
}

let echecs = 0;
async function appel(libelle, corps, entetes, statutAttendu) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...entetes }, body: corps });
  const ok = r.status === statutAttendu;
  if (!ok) echecs++;
  console.log(`${ok ? "OK   " : "ECHEC"} ${libelle.padEnd(36)} ${r.status} ${(await r.text()).slice(0, 70)}`);
}

const creation = JSON.stringify({ type: "user.created", data: utilisateur });
const ts = String(Math.floor(Date.now() / 1000));
const id = "msg_" + randomUUID();
const autreSecret = "whsec_" + Buffer.from("autre-secret-de-32-octets-xxxxxxx").toString("base64");

await appel("sans signature", creation, {}, 401);
await appel("signature fausse", creation, { "svix-id": id, "svix-timestamp": ts, "svix-signature": "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" }, 401);
await appel("signée avec un autre secret", creation, { "svix-id": id, "svix-timestamp": ts, "svix-signature": signer(creation, id, ts, autreSecret) }, 401);
const vieux = String(Number(ts) - 3600);
await appel("horodatage vieux d'une heure (rejeu)", creation, { "svix-id": id, "svix-timestamp": vieux, "svix-signature": signer(creation, id, vieux, secret) }, 401);
await appel("valide (1re livraison)", creation, { "svix-id": id, "svix-timestamp": ts, "svix-signature": signer(creation, id, ts, secret) }, 200);
const id2 = "msg_" + randomUUID();
await appel("valide (rejouée par Clerk)", creation, { "svix-id": id2, "svix-timestamp": ts, "svix-signature": signer(creation, id2, ts, secret) }, 200);
const suppression = JSON.stringify({ type: "user.deleted", data: { id: utilisateur.id } });
const id3 = "msg_" + randomUUID();
await appel("user.deleted (nettoyage)", suppression, { "svix-id": id3, "svix-timestamp": ts, "svix-signature": signer(suppression, id3, ts, secret) }, 200);

console.log(echecs ? `\n${echecs} échec(s)` : "\nTous les contrôles du webhook sont passés.");
process.exit(echecs ? 1 : 0);
