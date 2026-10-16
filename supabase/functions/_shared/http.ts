export function json(corps: unknown, statut = 200): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

// Comparaison en temps constant (évite de deviner un secret par mesure du temps).
export function egaliteConstante(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  const n = Math.max(ea.length, eb.length);
  for (let i = 0; i < n; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

export function base64VersOctets(texte: string): Uint8Array<ArrayBuffer> {
  const binaire = atob(texte);
  const octets = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
  return octets;
}

export function octetsVersBase64(octets: Uint8Array): string {
  let binaire = "";
  for (const o of octets) binaire += String.fromCharCode(o);
  return btoa(binaire);
}

export const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));
