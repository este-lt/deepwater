import "server-only";
import { estFerieNyse } from "./feries";
import type { ClientSupabase } from "./supabase";
import type { BiaisRow, SessionBiais, ValidationRow } from "./types-supabase";

export interface FacteurBiais {
  cle: string;
  libelle: string;
  libelle_en?: string;
  texte_en?: string;
  statut: "ok" | "indisponible";
  note: number | null;
  poids: number;
  contribution: number | null;
  texte: string;
  source: string;
  date: string | null;
}

export interface Decision {
  decision: ValidationRow["decision"];
  commentaire: string | null;
  le: string;
}

export interface BiaisAffiche {
  id: string;
  symbole: string;
  nom: string;
  date: string;
  session: SessionBiais;
  biais: BiaisRow["biais"];
  score: number;
  raisons: string[];
  facteurs: FacteurBiais[];
  origine: BiaisRow["origine"];
  calculeLe: string;
  versionRegles: string | null;
  decision: Decision | null;
}

export interface LigneHistorique {
  date: string;
  parIndice: Record<string, { biais: BiaisRow["biais"]; score: number; decision: Decision["decision"] | null }>;
}

// Biais de chaque session de la séance la plus récente, par indice.
export type BiaisSessions = Record<string, Partial<Record<SessionBiais, { biais: BiaisRow["biais"]; score: number; calculeLe: string }>>>;

export interface EtatBiais {
  seanceVisee: string;
  // Par indice : le biais de la dernière session calculée (détail complet).
  courants: BiaisAffiche[];
  sessions: BiaisSessions;
  historique: LigneHistorique[];
}

export const ORDRE_SESSIONS: SessionBiais[] = ["asie", "londres", "new_york"];

const INDICES = ["SPX", "NDX"];

// Même règle que supabase/functions/calcul-biais/facteurs.ts (seanceVisee) : séance
// du jour à New York tant que la clôture de 16 h n'est pas passée, sinon la suivante ;
// week-ends et jours fériés de la Bourse de New York sautés.
export function seanceVisee(maintenant: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit",
    }).formatToParts(maintenant).map((x) => [x.type, x.value]),
  );
  let jour = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day));
  const ouvert = (t: number) => {
    const s = new Date(t).getUTCDay();
    return s !== 0 && s !== 6 && !estFerieNyse(new Date(t).toISOString().slice(0, 10));
  };
  if (!ouvert(jour) || Number(p.hour) >= 16) jour += 86_400_000;
  while (!ouvert(jour)) jour += 86_400_000;
  return new Date(jour).toISOString().slice(0, 10);
}

export async function lireBiais(supabase: ClientSupabase): Promise<EtatBiais> {
  const [tickers, biais] = await Promise.all([
    supabase.from("tickers_suivis").select("id, symbole, nom").in("symbole", INDICES),
    supabase
      .from("biais_quotidien")
      .select("id, date, ticker_id, session, biais, score_numerique, raisons, facteurs, origine, version_regles, cree_le")
      .eq("statut", "actif")
      .order("date", { ascending: false })
      .order("cree_le", { ascending: false })
      .limit(INDICES.length * ORDRE_SESSIONS.length * 12),
  ]);
  if (tickers.error) throw new Error(`Lecture des indices impossible : ${tickers.error.message}`);
  if (biais.error) throw new Error(`Lecture du biais impossible : ${biais.error.message}`);

  const lignes = biais.data ?? [];
  // La RLS ne renvoie que les validations de l'utilisateur connecté.
  const validations = lignes.length
    ? await supabase.from("validations_biais").select("biais_id, decision, commentaire, cree_le").in("biais_id", lignes.map((l) => l.id))
    : { data: [], error: null };
  if (validations.error) throw new Error(`Lecture des validations impossible : ${validations.error.message}`);
  const decisions = new Map<string, Decision>(
    (validations.data ?? []).map((v) => [v.biais_id, { decision: v.decision, commentaire: v.commentaire, le: v.cree_le }]),
  );

  const parTicker = new Map((tickers.data ?? []).map((t) => [t.id, t]));
  const derniereDate = lignes[0]?.date;
  const duJour = lignes.filter((l) => l.date === derniereDate);
  const sessions: BiaisSessions = {};
  for (const l of duJour) {
    const t = parTicker.get(l.ticker_id);
    if (!t) continue;
    (sessions[t.symbole] ??= {})[l.session] ??= { biais: l.biais, score: Number(l.score_numerique), calculeLe: l.cree_le };
  }
  // Par indice, la session calculée le plus récemment (lignes triées par date de calcul).
  const vus = new Set<string>();
  const courants = duJour
    .filter((l) => !vus.has(l.ticker_id) && vus.add(l.ticker_id))
    .flatMap((l) => {
      const t = parTicker.get(l.ticker_id);
      if (!t) return [];
      return [{
        id: l.id,
        symbole: t.symbole,
        nom: t.nom,
        date: l.date,
        session: l.session,
        biais: l.biais,
        score: Number(l.score_numerique),
        raisons: Array.isArray(l.raisons) ? (l.raisons as string[]) : [],
        facteurs: Array.isArray(l.facteurs) ? (l.facteurs as unknown as FacteurBiais[]) : [],
        origine: l.origine,
        calculeLe: l.cree_le,
        versionRegles: l.version_regles,
        decision: decisions.get(l.id) ?? null,
      }];
    })
    .sort((a, b) => INDICES.indexOf(a.symbole) - INDICES.indexOf(b.symbole));

  // Séances passées : le biais de la session de New York (à défaut, la dernière calculée).
  const historique = new Map<string, LigneHistorique>();
  for (const l of lignes) {
    if (l.date === derniereDate) continue;
    const t = parTicker.get(l.ticker_id);
    if (!t) continue;
    const ligne = historique.get(l.date) ?? { date: l.date, parIndice: {} };
    if (!ligne.parIndice[t.symbole] || l.session === "new_york") {
      ligne.parIndice[t.symbole] = { biais: l.biais, score: Number(l.score_numerique), decision: decisions.get(l.id)?.decision ?? null };
    }
    historique.set(l.date, ligne);
  }

  return {
    seanceVisee: seanceVisee(new Date()),
    courants,
    sessions,
    historique: [...historique.values()].slice(0, 10),
  };
}
