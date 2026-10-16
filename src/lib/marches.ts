import "server-only";
import type { ClientSupabase } from "./supabase";
import type { PrixRow, TickerRow } from "./types-supabase";

export interface ResumeInstrument {
  ticker: Pick<TickerRow, "id" | "symbole" | "nom" | "classe_actif" | "source_principale" | "note_source" | "prioritaire">;
  derniere: Pick<PrixRow, "date" | "cloture" | "mm20" | "mm50" | "maj_le" | "source_donnee"> | null;
  precedente: number | null;
  variationPct: number | null;
  // 60 dernières clôtures pour la mini-courbe.
  tendance: number[];
}

const COLONNES_TICKER = "id, symbole, nom, classe_actif, source_principale, note_source, prioritaire";
// Ordre d'affichage : S&P 500 puis Nasdaq-100, puis le reste par symbole.
const ORDRE_AFFICHAGE = ["SPX", "NDX", "DJI", "EURUSD", "USDJPY", "GBPUSD", "USDCHF"];

export async function lireResumes(
  supabase: ClientSupabase,
  filtre: { prioritaires: true } | { classes: TickerRow["classe_actif"][] },
): Promise<ResumeInstrument[]> {
  let requete = supabase.from("tickers_suivis").select(COLONNES_TICKER).eq("actif_bool", true);
  requete = "prioritaires" in filtre
    ? requete.eq("prioritaire", true)
    : requete.eq("prioritaire", false).in("classe_actif", filtre.classes);
  const { data: tickers, error } = await requete.order("symbole");
  if (error) throw new Error(`Lecture des instruments impossible : ${error.message}`);
  const ordre = (s: string) => {
    const i = ORDRE_AFFICHAGE.indexOf(s);
    return i === -1 ? ORDRE_AFFICHAGE.length : i;
  };
  const tries = [...(tickers ?? [])].sort((a, b) => ordre(a.symbole) - ordre(b.symbole));

  return Promise.all(
    tries.map(async (ticker) => {
      const { data: prix, error: erreurPrix } = await supabase
        .from("prix_historique")
        .select("date, cloture, mm20, mm50, maj_le, source_donnee")
        .eq("ticker_id", ticker.id)
        .order("date", { ascending: false })
        .limit(60);
      if (erreurPrix) throw new Error(`Lecture des prix ${ticker.symbole} impossible : ${erreurPrix.message}`);
      const lignes = prix ?? [];
      const derniere = lignes[0] ?? null;
      const precedente = lignes[1]?.cloture ?? null;
      return {
        ticker,
        derniere,
        precedente,
        variationPct: derniere && precedente ? ((derniere.cloture - precedente) / precedente) * 100 : null,
        tendance: lignes.map((l) => Number(l.cloture)).reverse(),
      };
    }),
  );
}

export interface PointSerie {
  date: string;
  ouverture: number | null;
  plus_haut: number | null;
  plus_bas: number | null;
  cloture: number;
  mm20: number | null;
  mm50: number | null;
}

export async function lireSerie(
  supabase: ClientSupabase,
  symbole: string,
  depuis: string,
): Promise<{ ticker: Pick<TickerRow, "symbole" | "nom" | "note_source">; points: PointSerie[]; source: string | null; majLe: string | null } | null> {
  const { data: ticker, error } = await supabase
    .from("tickers_suivis")
    .select("id, symbole, nom, note_source")
    .eq("symbole", symbole)
    .eq("actif_bool", true)
    .maybeSingle();
  if (error) throw new Error(`Lecture de l'instrument impossible : ${error.message}`);
  if (!ticker) return null;

  // PostgREST plafonne à 1000 lignes par requête : lecture par pages.
  const points: PointSerie[] = [];
  let source: string | null = null;
  let majLe: string | null = null;
  for (let debut = 0; ; debut += 1000) {
    const { data, error: erreurPrix } = await supabase
      .from("prix_historique")
      .select("date, ouverture, plus_haut, plus_bas, cloture, mm20, mm50, source_donnee, maj_le")
      .eq("ticker_id", ticker.id)
      .gte("date", depuis)
      .order("date", { ascending: true })
      .range(debut, debut + 999);
    if (erreurPrix) throw new Error(`Lecture de la série impossible : ${erreurPrix.message}`);
    for (const p of data ?? []) {
      points.push({
        date: p.date,
        ouverture: p.ouverture === null ? null : Number(p.ouverture),
        plus_haut: p.plus_haut === null ? null : Number(p.plus_haut),
        plus_bas: p.plus_bas === null ? null : Number(p.plus_bas),
        cloture: Number(p.cloture),
        mm20: p.mm20 === null ? null : Number(p.mm20),
        mm50: p.mm50 === null ? null : Number(p.mm50),
      });
      source = p.source_donnee;
      majLe = p.maj_le;
    }
    if ((data ?? []).length < 1000) break;
  }
  return { ticker: { symbole: ticker.symbole, nom: ticker.nom, note_source: ticker.note_source }, points, source, majLe };
}

// Libellé lisible d'une source technique ("fred:SP500" -> "FRED (Fed de St. Louis)").
export function libelleSource(source: string | null | undefined): string {
  if (!source) return "source inconnue";
  if (source.startsWith("fred:")) return "FRED (Fed de St. Louis)";
  if (source.startsWith("alpha_vantage:")) return "Alpha Vantage";
  if (source.startsWith("sec")) return "SEC EDGAR";
  return source;
}

// Une clôture quotidienne est "ancienne" si elle date de plus de 4 jours calendaires
// (couvre un week-end prolongé ; au-delà, la collecte a probablement un problème).
export function clotureAncienne(date: string | null | undefined, maintenant = new Date()): boolean {
  if (!date) return true;
  const ecartJours = (maintenant.getTime() - new Date(`${date}T23:59:59Z`).getTime()) / 86_400_000;
  return ecartJours > 4;
}
