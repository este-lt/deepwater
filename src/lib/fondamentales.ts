import "server-only";
import type { ClientSupabase } from "./supabase";
import type { DepotSecRow, FondamentalesRow } from "./types-supabase";

export interface FicheEntreprise {
  symbole: string;
  nom: string;
  annuel: FondamentalesRow | null;
  trimestriel: FondamentalesRow | null;
  historique: Pick<FondamentalesRow, "date_cloture" | "marge_nette" | "roe" | "dette_sur_fonds_propres" | "per">[];
  depots: Pick<DepotSecRow, "type_formulaire" | "date_depot" | "resume_auto" | "url_source">[];
}

export interface ControleSec {
  coherent: boolean;
  ecart_max_pct: number;
  seuil_pct: number;
  formulaire: string | null;
  numero_acces: string | null;
  depose_le: string | null;
  compare_le: string;
}

// Fondamentales des actions actives (section optionnelle du tableau de bord).
export async function lireFiches(supabase: ClientSupabase): Promise<FicheEntreprise[]> {
  const { data: actions, error } = await supabase
    .from("tickers_suivis")
    .select("symbole, nom")
    .eq("classe_actif", "action")
    .eq("actif_bool", true)
    .order("symbole");
  if (error) throw new Error(`Lecture des actions impossible : ${error.message}`);

  return Promise.all(
    (actions ?? []).map(async ({ symbole, nom }) => {
      const [annuels, trimestriels, depots] = await Promise.all([
        supabase.from("fondamentales").select("*").eq("entreprise", symbole).eq("periode", "annuel")
          .order("date_cloture", { ascending: false }).limit(5),
        supabase.from("fondamentales").select("*").eq("entreprise", symbole).eq("periode", "trimestriel")
          .not("marge_nette", "is", null).order("date_cloture", { ascending: false }).limit(1),
        supabase.from("depots_sec_recents").select("type_formulaire, date_depot, resume_auto, url_source")
          .eq("entreprise", symbole).in("type_formulaire", ["10-K", "10-Q", "8-K", "10-K/A", "10-Q/A", "8-K/A"])
          .order("date_depot", { ascending: false }).limit(4),
      ]);
      for (const r of [annuels, trimestriels, depots]) {
        if (r.error) throw new Error(`Lecture des fondamentales ${symbole} impossible : ${r.error.message}`);
      }
      const listeAnnuels = (annuels.data ?? []) as FondamentalesRow[];
      return {
        symbole,
        nom,
        annuel: listeAnnuels[0] ?? null,
        trimestriel: ((trimestriels.data ?? []) as FondamentalesRow[])[0] ?? null,
        historique: [...listeAnnuels].reverse().map((a) => ({
          date_cloture: a.date_cloture,
          marge_nette: a.marge_nette,
          roe: a.roe,
          dette_sur_fonds_propres: a.dette_sur_fonds_propres,
          per: a.per,
        })),
        depots: depots.data ?? [],
      };
    }),
  );
}
