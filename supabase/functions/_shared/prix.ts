// Écriture des prix quotidiens + recalcul des moyennes mobiles 20/50 jours.
import { admin } from "./supabase.ts";

export interface BarreQuotidienne {
  date: string;
  ouverture: number | null;
  plus_haut: number | null;
  plus_bas: number | null;
  cloture: number;
  volume: number | null;
}

const TAILLE_LOT = 1000;

export async function enregistrerPrix(
  tickerId: string,
  barres: BarreQuotidienne[],
  sourceDonnee: string,
): Promise<{ lignes: number; moyennesMisesAJour: number }> {
  const maintenant = new Date().toISOString();
  for (let i = 0; i < barres.length; i += TAILLE_LOT) {
    const lot = barres.slice(i, i + TAILLE_LOT).map((b) => ({
      ticker_id: tickerId,
      ...b,
      source_donnee: sourceDonnee,
      maj_le: maintenant,
    }));
    const { error } = await admin().from("prix_historique").upsert(lot, { onConflict: "ticker_id,date" });
    if (error) throw new Error(`Écriture des prix impossible : ${error.message}`);
  }
  const { data, error } = await admin().rpc("recalculer_moyennes_mobiles", { p_ticker: tickerId });
  if (error) throw new Error(`Calcul des moyennes mobiles impossible : ${error.message}`);
  return { lignes: barres.length, moyennesMisesAJour: Number(data ?? 0) };
}

export async function derniereDatePrix(tickerId: string): Promise<string | null> {
  const { data, error } = await admin()
    .from("prix_historique")
    .select("date")
    .eq("ticker_id", tickerId)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Lecture de la dernière date impossible : ${error.message}`);
  return data?.date ?? null;
}
