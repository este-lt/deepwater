// Génère un lien de connexion à usage unique (7 jours) pour chaque compte de test,
// pour le contrôle visuel de l'isolation. Usage : npm run test:liens
import { readFileSync } from "node:fs";
import { clerk } from "./lib.mjs";
const comptes = JSON.parse(readFileSync(new URL("./comptes.json", import.meta.url)));
const base = process.argv[2] ?? "https://web-production-c0d8b.up.railway.app";
for (const [nom, c] of Object.entries(comptes)) {
  const jeton = await clerk("/sign_in_tokens", { method: "POST", body: JSON.stringify({ user_id: c.id, expires_in_seconds: 7 * 24 * 3600 }) });
  console.log(`Compte ${nom.toUpperCase()} (${c.email}) :\n${base}/sign-in?__clerk_ticket=${jeton.token}\n`);
}
