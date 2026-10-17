// Traduction automatique (API publique MyMemory, gratuite, sans clé) avec cache en base :
// un même texte n'est traduit qu'une fois. En cas d'échec ou de quota atteint, le texte
// d'origine est conservé (jamais de traduction inventée).
import { admin, lireSecret } from "./supabase.ts";

const MAX_PAR_PASSAGE = 80;
const PAUSE_MS = 150;

async function empreinte(langue: string, texte: string): Promise<string> {
  const octets = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${langue}\n${texte}`));
  return Array.from(new Uint8Array(octets)).map((o) => o.toString(16).padStart(2, "0")).join("");
}

// Adresse de contact transmise à MyMemory (quota de 50 000 caractères par jour au lieu de 5 000) :
// la même que l'en-tête User-Agent déjà envoyé à la SEC et à FRED.
async function contact(): Promise<string | null> {
  const ua = (await lireSecret("sec_user_agent")) ?? "";
  return ua.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] ?? null;
}

async function appelMyMemory(texte: string, langue: string, email: string | null): Promise<string | null> {
  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", texte.slice(0, 480));
  url.searchParams.set("langpair", `en|${langue}`);
  if (email) url.searchParams.set("de", email);
  const reponse = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!reponse.ok) return null;
  const corps = await reponse.json() as { responseStatus?: number | string; quotaFinished?: boolean; responseData?: { translatedText?: string } };
  if (corps.quotaFinished || Number(corps.responseStatus) !== 200) return null;
  const traduit = corps.responseData?.translatedText?.trim();
  if (!traduit || /MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(traduit)) return null;
  return traduit;
}

// Renvoie texte source -> traduction pour les textes traduits (les autres sont absents).
export async function traduire(textes: string[], langue = "fr"): Promise<Map<string, string>> {
  const uniques = [...new Set(textes.map((t) => t.trim()).filter(Boolean))];
  const resultat = new Map<string, string>();
  if (uniques.length === 0) return resultat;

  const cles = new Map<string, string>();
  for (const t of uniques) cles.set(await empreinte(langue, t), t);
  const { data } = await admin().from("traductions").select("empreinte, traduction").in("empreinte", [...cles.keys()]);
  for (const l of data ?? []) {
    const source = cles.get(l.empreinte);
    if (source) resultat.set(source, l.traduction);
  }

  const email = await contact();
  const nouvelles: { empreinte: string; langue: string; texte: string; traduction: string }[] = [];
  for (const [cle, texte] of cles) {
    if (resultat.has(texte)) continue;
    if (nouvelles.length >= MAX_PAR_PASSAGE) break;
    const traduit = await appelMyMemory(texte, langue, email).catch(() => null);
    if (traduit === null) break; // quota ou panne : on réessaiera au prochain passage
    resultat.set(texte, traduit);
    nouvelles.push({ empreinte: cle, langue, texte, traduction: traduit });
    await new Promise((r) => setTimeout(r, PAUSE_MS));
  }
  if (nouvelles.length) await admin().from("traductions").upsert(nouvelles, { onConflict: "empreinte" });
  return resultat;
}
