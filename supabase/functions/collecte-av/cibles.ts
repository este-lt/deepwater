// Traitements par type de donnée Alpha Vantage : chaque "cible" transforme une
// réponse validée en lignes de la base. Alpha Vantage ne sert plus qu'à l'or et à
// l'argent (et aux indices en cas d'abonnement premium) : le reste vient de FRED.
import { extraireSerieQuotidienne } from "../_shared/alpha-vantage.ts";
import { enregistrerPrix } from "../_shared/prix.ts";

export interface Collecte {
  id: string;
  cle: string;
  libelle: string;
  parametres: Record<string, unknown>;
  priorite: number;
  intervalle: string;
  ttl_cache: string;
  ticker_id: string | null;
}

type Traitement = (collecte: Collecte, donnees: Record<string, unknown>) => Promise<string>;

const HISTORIQUE_JOURS = 10 * 366;

export const CIBLES: Record<string, Traitement> = {
  // INDEX_DATA (abonnement premium uniquement).
  async prix_quotidiens(collecte, donnees) {
    if (!collecte.ticker_id) throw new Error("Collecte de prix sans instrument.");
    const barres = extraireSerieQuotidienne(donnees);
    if (barres.length === 0) throw new Error("Série de prix vide ou format inattendu.");
    const { lignes } = await enregistrerPrix(collecte.ticker_id, barres, `alpha_vantage:${String(collecte.parametres.function)}`);
    const d = barres[barres.length - 1];
    return `${lignes} séances, dernière clôture ${d.cloture} (${d.date})`;
  },

  // GOLD_SILVER_HISTORY : { nominal, data: [{ date, price }] }.
  async metal(collecte, donnees) {
    if (!collecte.ticker_id) throw new Error("Collecte de métal sans instrument.");
    const seuil = new Date(Date.now() - HISTORIQUE_JOURS * 86_400_000).toISOString().slice(0, 10);
    const barres = ((donnees.data as { date?: string; price?: string }[] | undefined) ?? [])
      .map((p) => ({ date: String(p.date ?? "").slice(0, 10), cloture: Number(p.price) }))
      .filter((p) => p.date >= seuil && Number.isFinite(p.cloture) && p.cloture > 0)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((p) => ({ ...p, ouverture: null, plus_haut: null, plus_bas: null, volume: null }));
    if (barres.length === 0) throw new Error("Historique de métal vide ou format inattendu.");
    const { lignes } = await enregistrerPrix(collecte.ticker_id, barres, `alpha_vantage:${String(collecte.parametres.symbol)}`);
    const d = barres[barres.length - 1];
    return `${lignes} jours, dernier ${d.cloture} $ (${d.date})`;
  },
};
