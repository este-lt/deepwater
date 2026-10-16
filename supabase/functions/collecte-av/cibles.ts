// Traitements par type de donnée Alpha Vantage : chaque "cible" transforme une
// réponse validée en lignes de la base. Les étapes suivantes en ajoutent.
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

export const CIBLES: Record<string, Traitement> = {
  async prix_quotidiens(collecte, donnees) {
    if (!collecte.ticker_id) throw new Error("Collecte de prix sans ticker.");
    const barres = extraireSerieQuotidienne(donnees);
    if (barres.length === 0) throw new Error("Série de prix vide ou format inattendu.");
    const fonction = String(collecte.parametres.function ?? "");
    const { lignes } = await enregistrerPrix(collecte.ticker_id, barres, `alpha_vantage:${fonction}`);
    const derniere = barres[barres.length - 1];
    return `${lignes} séances, dernière clôture ${derniere.cloture} (${derniere.date})`;
  },
};
