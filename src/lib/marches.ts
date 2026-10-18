import "server-only";
import type { Langue } from "./i18n";
import type { ClientSupabase } from "./supabase";
import type { TickerRow } from "./types-supabase";

// Une ligne du moniteur multi-actifs (fonction SQL resume_marches).
export interface LigneMarche {
  symbole: string;
  nom: string;
  nomEn: string | null;
  classe: TickerRow["classe_actif"];
  unite: string | null;
  // pct : variation en % ; pb : en points de base (taux, spreads) ; pts : en points (volatilité, indices composites).
  variation: "pct" | "pb" | "pts";
  decimales: number;
  prioritaire: boolean;
  noteSource: string | null;
  date: string;
  cloture: number;
  source: string;
  majLe: string;
  var1j: number | null;
  var1s: number | null;
  var1m: number | null;
  varAnnee: number | null;
  courbe: number[];
  // Dernière valeur plus ancienne que prévu (collecte en retard ou série publiée avec décalage).
  ancienne: boolean;
}

// Séries hebdomadaires ou publiées avec décalage : plus de tolérance avant l'alerte.
const TOLERANCE_JOURS: Record<string, number> = { NFCI: 10, DXY: 12, WTI: 6, BRENT: 6, NATGAS: 6 };

// Valeur numérique ou null : une valeur non numérique en base (NaN, infini) est ignorée.
export const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function ecart(type: LigneMarche["variation"], actuel: number, avant: number | null): number | null {
  if (avant === null || !Number.isFinite(avant)) return null;
  if (type === "pct") return avant === 0 ? null : (actuel / avant - 1) * 100;
  if (type === "pb") return (actuel - avant) * 100;
  return actuel - avant;
}

export async function lireMarches(supabase: ClientSupabase): Promise<LigneMarche[]> {
  const { data, error } = await supabase.rpc("resume_marches");
  if (error) throw new Error(`Lecture des marchés impossible : ${error.message}`);
  return (data ?? []).flatMap((l): LigneMarche[] => {
    const cloture = num(l.cloture);
    if (cloture === null) return [];
    const type = l.variation as LigneMarche["variation"];
    return [{
      symbole: l.symbole,
      nom: l.nom,
      nomEn: l.nom_en,
      classe: l.classe_actif as LigneMarche["classe"],
      unite: l.unite,
      variation: type,
      decimales: l.decimales,
      prioritaire: l.prioritaire,
      noteSource: l.note_source,
      date: l.date,
      cloture,
      source: l.source_donnee,
      majLe: l.maj_le,
      var1j: ecart(type, cloture, num(l.precedente)),
      var1s: ecart(type, cloture, num(l.il_y_a_1s)),
      var1m: ecart(type, cloture, num(l.il_y_a_1m)),
      varAnnee: ecart(type, cloture, num(l.fin_annee)),
      courbe: (l.courbe ?? []).map(Number).filter(Number.isFinite),
      ancienne: valeurAncienne(l.date, TOLERANCE_JOURS[l.symbole] ?? 4),
    }];
  });
}

export interface PointSerie {
  date: string;
  ouverture: number | null;
  plus_haut: number | null;
  plus_bas: number | null;
  cloture: number;
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
      .select("date, ouverture, plus_haut, plus_bas, cloture, source_donnee, maj_le")
      .eq("ticker_id", ticker.id)
      .gte("date", depuis)
      .order("date", { ascending: true })
      .range(debut, debut + 999);
    if (erreurPrix) throw new Error(`Lecture de la série impossible : ${erreurPrix.message}`);
    for (const p of data ?? []) {
      const cloture = num(p.cloture);
      if (cloture === null) continue;
      points.push({
        date: p.date,
        ouverture: num(p.ouverture),
        plus_haut: num(p.plus_haut),
        plus_bas: num(p.plus_bas),
        cloture,
      });
      source = p.source_donnee;
      majLe = p.maj_le;
    }
    if ((data ?? []).length < 1000) break;
  }
  return { ticker: { symbole: ticker.symbole, nom: ticker.nom, note_source: ticker.note_source }, points, source, majLe };
}

// Dernière valeur « ancienne » : plus de 4 jours calendaires (week-end prolongé compris)
// pour une série quotidienne ; les séries hebdomadaires (NFCI, dollar) ont plus de marge.
export function valeurAncienne(date: string | null | undefined, toleranceJours = 4, maintenant = new Date()): boolean {
  if (!date) return true;
  const ecartJours = (maintenant.getTime() - new Date(`${date}T23:59:59Z`).getTime()) / 86_400_000;
  return ecartJours > toleranceJours;
}

export const nomInstrument = (l: { nom: string; nomEn?: string | null }, langue: Langue) => (langue === "en" && l.nomEn ? l.nomEn : l.nom);

// Clôtures de plusieurs instruments sur les `jours` derniers jours (régime, corrélations, devises).
export async function lireClotures(
  supabase: ClientSupabase,
  symboles: string[],
  jours: number,
): Promise<Map<string, { date: string; cloture: number }[]>> {
  const { data: tickers, error } = await supabase.from("tickers_suivis").select("id, symbole").in("symbole", symboles);
  if (error) throw new Error(`Lecture des instruments impossible : ${error.message}`);
  const parId = new Map((tickers ?? []).map((t) => [t.id, t.symbole]));
  const series = new Map<string, { date: string; cloture: number }[]>(symboles.map((s) => [s, []]));
  if (parId.size === 0) return series;
  const depuis = new Date(Date.now() - jours * 86_400_000).toISOString().slice(0, 10);
  for (let debut = 0; ; debut += 1000) {
    const { data, error: e } = await supabase
      .from("prix_historique")
      .select("ticker_id, date, cloture")
      .in("ticker_id", [...parId.keys()])
      .gte("date", depuis)
      .order("date", { ascending: true })
      .order("ticker_id", { ascending: true })
      .range(debut, debut + 999);
    if (e) throw new Error(`Lecture des clôtures impossible : ${e.message}`);
    for (const p of data ?? []) {
      const cloture = num(p.cloture);
      if (cloture !== null) series.get(parId.get(p.ticker_id)!)?.push({ date: p.date, cloture });
    }
    if ((data ?? []).length < 1000) break;
  }
  return series;
}
