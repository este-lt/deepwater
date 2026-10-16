import { readFileSync } from "node:fs";
import { env, clerk } from "./lib.mjs";
const comptes = JSON.parse(readFileSync(new URL("./comptes.json", import.meta.url)));
for (const [nom, c] of Object.entries(comptes)) {
  const u = await clerk(`/users/${c.id}`);
  const principale = u.email_addresses.find((e) => e.id === u.primary_email_address_id);
  const appel = async () => {
    const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/profil-secours`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-deepwater-secret": env.FUNCTIONS_SECRET },
      body: JSON.stringify({ clerk_user_id: c.id, email: principale.email_address, email_verifie: principale.verification?.status === "verified" }),
    });
    return `${r.status} ${JSON.stringify(await r.json())}`;
  };
  console.log(`secours ${nom} (1er appel):`, await appel());
  console.log(`secours ${nom} (2e appel, idempotent):`, await appel());
}
