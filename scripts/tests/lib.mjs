import { readFileSync } from "node:fs";
export const env = Object.fromEntries(
  readFileSync(new URL("../../.env.local", import.meta.url), "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
export async function clerk(chemin, options = {}) {
  const r = await fetch("https://api.clerk.com/v1" + chemin, {
    ...options,
    headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}`, "Content-Type": "application/json", ...(options.headers ?? {}) },
  });
  const texte = await r.text();
  let corps; try { corps = JSON.parse(texte); } catch { corps = texte; }
  if (!r.ok) throw new Error(`Clerk ${chemin} -> ${r.status} ${texte.slice(0, 300)}`);
  return corps;
}
export async function rest(chemin, { jwt, methode = "GET", corps, prefer } = {}) {
  const entetes = { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" };
  if (jwt) entetes.Authorization = `Bearer ${jwt}`;
  if (prefer) entetes.Prefer = prefer;
  const r = await fetch(env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1" + chemin, { method: methode, headers: entetes, body: corps ? JSON.stringify(corps) : undefined });
  const texte = await r.text();
  let donnees; try { donnees = JSON.parse(texte); } catch { donnees = texte; }
  return { statut: r.status, donnees };
}
export function decoderJwt(jwt) {
  return JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());
}
