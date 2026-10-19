// Cours par session (Asie, Londres, New York) des contrats à terme E-mini S&P 500 (ES) et
// E-mini Nasdaq-100 (NQ) : barres de 30 minutes de Massive, offre gratuite « Futures Basic »
// (données décalées de 8 heures, 2 ans d'historique, 5 appels par minute). Clé dans le Vault :
// « massive_api_key », transmise dans l'en-tête Authorization (jamais dans une URL journalisée).
// Sert à juger chaque biais sur sa propre session, après coup.
// Modes : « recent » (7 derniers jours, par défaut) et « historique » ({ trimestre: "2025-1" }).
import { servirTacheProtegee } from "../_shared/garde.ts";
import { attendre, json } from "../_shared/http.ts";
import { executerTache } from "../_shared/journal.ts";
import { admin, lireSecret } from "../_shared/supabase.ts";
import { type Barre, contratPourSeance, mesurerSeances, type Produit, PRODUITS, seancesOuvrees } from "./cours.ts";

const BASE = "https://api.massive.com/futures/v1/aggs";
const PAUSE_MS = 13_000; // 5 appels par minute au plus

const jour = (t: number) => new Date(t).toISOString().slice(0, 10);

// Barres de `du` (inclus) à `avant` (exclu), dates AAAA-MM-JJ.
async function lireBarres(cle: string, contrat: string, du: string, avant: string): Promise<Barre[]> {
  const barres: Barre[] = [];
  let url: string | null = `${BASE}/${contrat}?resolution=30min&window_start.gte=${du}&window_start.lt=${avant}&limit=50000&sort=window_start.asc`;
  for (let page = 0; url && page < 3; page++) {
    if (page > 0) await attendre(PAUSE_MS);
    const reponse = await fetch(url, { headers: { Authorization: `Bearer ${cle}` } });
    if (reponse.status === 401 || reponse.status === 403) {
      throw new Error(`Massive refuse l'accès (${reponse.status}) : clé invalide ou offre sans accès aux contrats à terme.`);
    }
    if (reponse.status === 429) throw new Error("Massive : limite de 5 appels par minute atteinte.");
    if (!reponse.ok) throw new Error(`Massive ${contrat} : HTTP ${reponse.status}`);
    const corps = await reponse.json() as { results?: { window_start: number | string; open: number; close: number }[]; next_url?: string };
    for (const b of corps.results ?? []) {
      const debut = Math.round(Number(b.window_start) / 1e6); // nanosecondes -> millisecondes
      if (Number.isFinite(debut) && Number.isFinite(b.open) && Number.isFinite(b.close)) barres.push({ debut, ouverture: b.open, cloture: b.close });
    }
    url = corps.next_url ?? null;
  }
  return barres;
}

async function collecter(du: string, au: string) {
  const cle = await lireSecret("massive_api_key");
  if (!cle) throw new Error("Clé « massive_api_key » absente du Vault.");
  const dates = seancesOuvrees(du, au);
  const bilan: string[] = [];
  let appels = 0;
  let lignes = 0;
  for (const produit of Object.keys(PRODUITS) as Produit[]) {
    // Séances regroupées par contrat (roulement trimestriel).
    const parContrat = new Map<string, string[]>();
    for (const d of dates) parContrat.set(contratPourSeance(produit, d), [...(parContrat.get(contratPourSeance(produit, d)) ?? []), d]);
    for (const [contrat, seances] of parContrat) {
      if (appels++ > 0) await attendre(PAUSE_MS);
      const veille = jour(Date.parse(`${seances[0]}T00:00:00Z`) - 86_400_000);
      const lendemain = jour(Date.parse(`${seances.at(-1)}T00:00:00Z`) + 86_400_000);
      const barres = await lireBarres(cle, contrat, veille, lendemain);
      const mesures = mesurerSeances(barres, seances);
      if (mesures.length) {
        const { error } = await admin().from("cours_sessions").upsert(
          mesures.map((m) => ({ indice: PRODUITS[produit], contrat, source: "massive", maj_le: new Date().toISOString(), ...m })),
          { onConflict: "indice,date,session" },
        );
        if (error) throw new Error(`Écriture des cours par session impossible : ${error.message}`);
      }
      lignes += mesures.length;
      bilan.push(`${contrat} : ${barres.length} barres, ${mesures.length} sessions`);
    }
  }
  if (lignes === 0 && dates.length > 2) throw new Error(`Aucune session mesurée (${bilan.join(" ; ")}).`);
  return { message: `${du} → ${au} : ${lignes} sessions (${bilan.join(" ; ")})`, details: { du, au, lignes } };
}

servirTacheProtegee(async (corps) => {
  if (corps.mode === "historique") {
    const m = String(corps.trimestre ?? "").match(/^(\d{4})-([1-4])$/);
    if (!m) return json({ ok: false, message: "Trimestre invalide (ex. 2025-1)." }, 400);
    const annee = Number(m[1]);
    const t = Number(m[2]);
    const du = `${annee}-${String((t - 1) * 3 + 1).padStart(2, "0")}-01`;
    const au = jour(Math.min(Date.UTC(annee, t * 3, 0), Date.now()));
    const resultat = await executerTache("collecte-sessions:historique", () => collecter(du, au));
    return json(resultat, resultat.ok ? 200 : 500);
  }
  const resultat = await executerTache("collecte-sessions", () => collecter(jour(Date.now() - 7 * 86_400_000), jour(Date.now())));
  return json(resultat, resultat.ok ? 200 : 500);
});
