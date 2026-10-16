import { writeFileSync } from "node:fs";
import { clerk, decoderJwt } from "./lib.mjs";
const comptes = {};
for (const nom of ["a", "b"]) {
  const email = `deepwater-test-${nom}+clerk_test@example.com`;
  const existants = await clerk(`/users?email_address=${encodeURIComponent(email)}`);
  const utilisateur = existants[0] ?? await clerk("/users", {
    method: "POST",
    body: JSON.stringify({ email_address: [email], skip_password_requirement: true, first_name: `Test ${nom.toUpperCase()}` }),
  });
  const session = await clerk("/sessions", { method: "POST", body: JSON.stringify({ user_id: utilisateur.id }) });
  const jeton = await clerk(`/sessions/${session.id}/tokens`, { method: "POST", body: JSON.stringify({ expires_in_seconds: 3600 }) });
  const claims = decoderJwt(jeton.jwt);
  comptes[nom] = { id: utilisateur.id, email, session: session.id, jwt: jeton.jwt };
  console.log(`compte ${nom}: ${utilisateur.id} | claim role=${claims.role} | iss=${claims.iss} | exp dans ${Math.round((claims.exp - Date.now() / 1000) / 60)} min`);
}
writeFileSync(new URL("./comptes.json", import.meta.url), JSON.stringify(comptes, null, 2));
