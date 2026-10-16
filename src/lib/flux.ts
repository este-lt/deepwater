import "server-only";
import type { ClientSupabase } from "./supabase";
import type { FluxInitieRow, PositionInstitutionnelleRow } from "./types-supabase";

export interface FluxEntreprise {
  entreprise: string;
  nom: string;
  secteur: string;
  achats: number;
  ventes: number;
  net: number;
  nb_achats: number;
  nb_ventes: number;
  derniere_date: string | null;
}

export interface FluxSecteur {
  secteur: string;
  achats: number;
  ventes: number;
  net: number;
  nb_entreprises: number;
}

export interface PositionAgregee {
  entreprise: string;
  nom: string;
  secteur: string;
  date_rapport: string;
  parts_totales: number;
  valeur_usd: number;
  variation_parts: number | null;
  nb_hausse: number;
  nb_baisse: number;
  nb_institutions: number;
}

export interface MouvementInstitution {
  institution: string;
  entreprise: string;
  variation: number;
  valeurVariation: number | null;
  date_rapport: string;
  numero_acces: string;
}

export interface EtatFlux {
  jours: number;
  parEntreprise: FluxEntreprise[];
  parSecteur: FluxSecteur[];
  dernieres: Pick<FluxInitieRow, "id" | "entreprise" | "personne" | "poste" | "type_transaction" | "code_transaction" | "nombre_titres" | "prix_unitaire" | "montant" | "date" | "date_depot" | "source_formulaire">[];
  positions: PositionAgregee[];
  mouvements: MouvementInstitution[];
  majInities: string | null;
  majInstitutions: string | null;
}

const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

export async function lireFlux(supabase: ClientSupabase, jours = 30): Promise<EtatFlux> {
  const [entreprises, secteurs, dernieres, positions, lignesInst, majInit] = await Promise.all([
    supabase.rpc("flux_inities_agreges", { p_jours: jours }),
    supabase.rpc("flux_inities_par_secteur", { p_jours: jours }),
    supabase
      .from("flux_inities")
      .select("id, entreprise, personne, poste, type_transaction, code_transaction, nombre_titres, prix_unitaire, montant, date, date_depot, source_formulaire")
      .in("code_transaction", ["P", "S"])
      .order("date", { ascending: false })
      .order("montant", { ascending: false, nullsFirst: false })
      .limit(8),
    supabase.rpc("positions_institutions_agregees"),
    supabase
      .from("positions_institutionnelles")
      .select("institution, entreprise, nombre_parts, valeur_usd, variation_trimestre, date_rapport, numero_acces, cree_le")
      .not("variation_trimestre", "is", null)
      .neq("variation_trimestre", 0),
    supabase.from("flux_inities").select("cree_le").order("cree_le", { ascending: false }).limit(1).maybeSingle(),
  ]);
  for (const r of [entreprises, secteurs, dernieres, positions, lignesInst]) {
    if (r.error) throw new Error(`Lecture des flux impossible : ${r.error.message}`);
  }

  // Mouvements marquants : valorisés au cours moyen du trimestre déclaré (valeur / parts).
  const lignes = (lignesInst.data ?? []) as (PositionInstitutionnelleRow & { cree_le: string })[];
  const dernierTrimestre = new Map<string, string>();
  for (const l of lignes) {
    if ((dernierTrimestre.get(l.institution) ?? "") < l.date_rapport) dernierTrimestre.set(l.institution, l.date_rapport);
  }
  const mouvements = lignes
    .filter((l) => dernierTrimestre.get(l.institution) === l.date_rapport)
    .map((l) => {
      const prixMoyen = n(l.nombre_parts) > 0 ? n(l.valeur_usd) / n(l.nombre_parts) : null;
      return {
        institution: l.institution,
        entreprise: l.entreprise,
        variation: n(l.variation_trimestre),
        valeurVariation: prixMoyen === null ? null : n(l.variation_trimestre) * prixMoyen,
        date_rapport: l.date_rapport,
        numero_acces: l.numero_acces,
      };
    })
    .sort((a, b) => Math.abs(b.valeurVariation ?? 0) - Math.abs(a.valeurVariation ?? 0))
    .slice(0, 6);

  const majInstitutions = lignes.reduce<string | null>((max, l) => (max === null || l.cree_le > max ? l.cree_le : max), null);

  return {
    jours,
    parEntreprise: ((entreprises.data ?? []) as FluxEntreprise[])
      .map((e) => ({ ...e, achats: n(e.achats), ventes: n(e.ventes), net: n(e.net), nb_achats: n(e.nb_achats), nb_ventes: n(e.nb_ventes) }))
      .sort((a, b) => a.net - b.net),
    parSecteur: ((secteurs.data ?? []) as FluxSecteur[])
      .map((s) => ({ ...s, achats: n(s.achats), ventes: n(s.ventes), net: n(s.net), nb_entreprises: n(s.nb_entreprises) }))
      .sort((a, b) => a.net - b.net),
    dernieres: dernieres.data ?? [],
    positions: ((positions.data ?? []) as PositionAgregee[])
      .map((p) => ({ ...p, parts_totales: n(p.parts_totales), valeur_usd: n(p.valeur_usd), variation_parts: p.variation_parts === null ? null : n(p.variation_parts), nb_hausse: n(p.nb_hausse), nb_baisse: n(p.nb_baisse), nb_institutions: n(p.nb_institutions) }))
      .sort((a, b) => b.valeur_usd - a.valeur_usd),
    mouvements,
    majInities: majInit.data?.cree_le ?? null,
    majInstitutions,
  };
}

export function formaterMontantCourt(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const signe = v < 0 ? "−" : "";
  const fmt = (x: number, d: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: d, minimumFractionDigits: d }).format(x);
  if (abs >= 1e9) return `${signe}${fmt(abs / 1e9, 2)} Md$`;
  if (abs >= 1e6) return `${signe}${fmt(abs / 1e6, 1)} M$`;
  if (abs >= 1e3) return `${signe}${fmt(abs / 1e3, 0)} k$`;
  return `${signe}${fmt(abs, 0)} $`;
}
