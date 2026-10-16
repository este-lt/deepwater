// Accès SEC EDGAR : User-Agent obligatoire (nom + email), au plus 8 requêtes par
// seconde (limite SEC : 10), attente puis nouvel essai sur 403/429/5xx.
import { attendre } from "./http.ts";
import { lireSecret } from "./supabase.ts";

const INTERVALLE_MIN_MS = 125;
let dernierAppel = 0;

export async function requeteSec(url: string, essais = 4): Promise<Response> {
  const userAgent = await lireSecret("sec_user_agent");
  if (!userAgent) throw new Error("User-Agent SEC absent du Vault (sec_user_agent).");

  for (let essai = 0; essai < essais; essai++) {
    const attente = dernierAppel + INTERVALLE_MIN_MS - Date.now();
    if (attente > 0) await attendre(attente);
    dernierAppel = Date.now();

    const reponse = await fetch(url, {
      headers: { "User-Agent": userAgent, Accept: "application/json, application/xml, text/xml, */*" },
      signal: AbortSignal.timeout(30_000),
    });
    if (reponse.status === 404) throw new ErreurSecIntrouvable(url);
    if (reponse.status === 403 || reponse.status === 429 || reponse.status >= 500) {
      await reponse.body?.cancel();
      if (essai === essais - 1) throw new Error(`SEC HTTP ${reponse.status} après ${essais} essais : ${url}`);
      const retryAfter = Number(reponse.headers.get("Retry-After"));
      const delai = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * 2 ** essai;
      await attendre(Math.min(delai, 20_000));
      continue;
    }
    if (!reponse.ok) throw new Error(`SEC HTTP ${reponse.status} : ${url}`);
    return reponse;
  }
  throw new Error(`SEC : échec inattendu pour ${url}`);
}

export class ErreurSecIntrouvable extends Error {
  constructor(url: string) {
    super(`SEC : ressource introuvable (${url})`);
  }
}

export const cik10 = (cik: string | number) => String(cik).replace(/\D/g, "").padStart(10, "0");

export function urlDocument(cik: string, numeroAcces: string, document: string): string {
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${numeroAcces.replace(/-/g, "")}/${document}`;
}

export function urlIndexDepot(cik: string, numeroAcces: string): string {
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${numeroAcces.replace(/-/g, "")}/${numeroAcces}-index.htm`;
}

// --- Faits XBRL (companyconcept) -------------------------------------------

export interface FaitXbrl {
  start?: string;
  end: string;
  val: number;
  accn: string;
  fy?: number;
  fp?: string;
  form: string;
  filed: string;
}

export async function lireConcept(cik: string, concept: string, unite = "USD"): Promise<FaitXbrl[]> {
  try {
    const r = await requeteSec(`https://data.sec.gov/api/xbrl/companyconcept/CIK${cik10(cik)}/us-gaap/${concept}.json`);
    const donnees = await r.json() as { units?: Record<string, FaitXbrl[]> };
    return donnees.units?.[unite] ?? [];
  } catch (erreur) {
    if (erreur instanceof ErreurSecIntrouvable) return [];
    throw erreur;
  }
}

const jours = (debut: string, fin: string) => (Date.parse(fin) - Date.parse(debut)) / 86_400_000;

// Valeur annuelle déclarée dans un 10-K pour l'exercice clos vers `fin`.
// Tolérance de 7 jours : certaines entreprises clôturent un samedi (Apple : dernier
// samedi de septembre) alors qu'Alpha Vantage arrondit à la fin du mois.
// Flux (chiffre d'affaires, résultat, trésorerie) : durée ~1 an ; stock (capitaux propres) : instant.
export function valeurAnnuelle(faits: FaitXbrl[], fin: string, flux: boolean): FaitXbrl | null {
  const candidats = faits.filter((f) =>
    Math.abs(jours(f.end, fin)) <= 7 && f.form.startsWith("10-K") &&
    (!flux || (f.start !== undefined && jours(f.start, f.end) > 330 && jours(f.start, f.end) < 380))
  );
  candidats.sort((a, b) =>
    Math.abs(jours(a.end, fin)) - Math.abs(jours(b.end, fin)) || b.filed.localeCompare(a.filed)
  );
  return candidats[0] ?? null;
}
