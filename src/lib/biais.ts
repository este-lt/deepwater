import "server-only";
import type { ClientSupabase } from "./supabase";
import type { BiaisRow, ValidationRow } from "./types-supabase";

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

export interface EtatBiais {
  seanceVisee: string;
  courants: BiaisAffiche[];
  historique: LigneHistorique[];
  autoActif: boolean;
}

const INDICES = ["SPX", "NDX"];

// Même règle que supabase/functions/calcul-biais/facteurs.ts (seanceVisee) : séance
// du jour à New York tant que la clôture de 16 h n'est pas passée, sinon la suivante.
export function seanceVisee(maintenant: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit",
    }).formatToParts(maintenant).map((x) => [x.type, x.value]),
  );
  let jour = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day));
  const semaine = (t: number) => new Date(t).getUTCDay();
  if (semaine(jour) === 0 || semaine(jour) === 6 || Number(p.hour) >= 16) jour += 86_400_000;
  while (semaine(jour) === 0 || semaine(jour) === 6) jour += 86_400_000;
  return new Date(jour).toISOString().slice(0, 10);
}

export async function lireBiais(supabase: ClientSupabase): Promise<EtatBiais> {
  const [tickers, biais, parametres] = await Promise.all([
    supabase.from("tickers_suivis").select("id, symbole, nom").in("symbole", INDICES),
    supabase
      .from("biais_quotidien")
      .select("id, date, ticker_id, biais, score_numerique, raisons, facteurs, origine, version_regles, cree_le")
      .eq("statut", "actif")
      .order("date", { ascending: false })
      .limit(INDICES.length * 12),
    supabase.from("parametres_utilisateur").select("biais_auto_actif").maybeSingle(),
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
  const courants = lignes
    .filter((l) => l.date === derniereDate)
    .flatMap((l) => {
      const t = parTicker.get(l.ticker_id);
      if (!t) return [];
      return [{
        id: l.id,
        symbole: t.symbole,
        nom: t.nom,
        date: l.date,
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

  const historique = new Map<string, LigneHistorique>();
  for (const l of lignes) {
    if (l.date === derniereDate) continue;
    const t = parTicker.get(l.ticker_id);
    if (!t) continue;
    const ligne = historique.get(l.date) ?? { date: l.date, parIndice: {} };
    ligne.parIndice[t.symbole] = { biais: l.biais, score: Number(l.score_numerique), decision: decisions.get(l.id)?.decision ?? null };
    historique.set(l.date, ligne);
  }

  return {
    seanceVisee: seanceVisee(new Date()),
    courants,
    historique: [...historique.values()].slice(0, 10),
    autoActif: parametres.data?.biais_auto_actif ?? false,
  };
}
