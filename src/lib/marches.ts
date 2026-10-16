import "server-only";
import type { ClientSupabase } from "./supabase";
import type { TickerRow } from "./types-supabase";

// Une ligne du moniteur multi-actifs (fonction SQL resume_marches).
export interface LigneMarche {
  symbole: string;
  nom: string;
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
  mm20: number | null;
  mm50: number | null;
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

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function ecart(type: LigneMarche["variation"], actuel: number, avant: number | null): number | null {
  if (avant === null || !Number.isFinite(avant)) return null;
  if (type === "pct") return avant === 0 ? null : (actuel / avant - 1) * 100;
  if (type === "pb") return (actuel - avant) * 100;
  return actuel - avant;
}

export async function lireMarches(supabase: ClientSupabase): Promise<LigneMarche[]> {
  const { data, error } = await supabase.rpc("resume_marches");
  if (error) throw new Error(`Lecture des marchés impossible : ${error.message}`);
  return (data ?? []).map((l) => {
    const cloture = Number(l.cloture);
    const type = l.variation as LigneMarche["variation"];
    return {
      symbole: l.symbole,
      nom: l.nom,
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
      mm20: num(l.mm20),
      mm50: num(l.mm50),
      var1j: ecart(type, cloture, num(l.precedente)),
      var1s: ecart(type, cloture, num(l.il_y_a_1s)),
      var1m: ecart(type, cloture, num(l.il_y_a_1m)),
      varAnnee: ecart(type, cloture, num(l.fin_annee)),
      courbe: (l.courbe ?? []).map(Number),
      ancienne: valeurAncienne(l.date, TOLERANCE_JOURS[l.symbole] ?? 4),
    };
  });
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

// Dernière valeur « ancienne » : plus de 4 jours calendaires (week-end prolongé compris)
// pour une série quotidienne ; les séries hebdomadaires (NFCI, dollar) ont plus de marge.
export function valeurAncienne(date: string | null | undefined, toleranceJours = 4, maintenant = new Date()): boolean {
  if (!date) return true;
  const ecartJours = (maintenant.getTime() - new Date(`${date}T23:59:59Z`).getTime()) / 86_400_000;
  return ecartJours > toleranceJours;
}
