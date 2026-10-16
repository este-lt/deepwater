// Types de la base, alignés sur supabase/migrations (vérifiés contre
// `generate_typescript_types`). Forme compacte : Row = colonnes lues par le site.

export type Json = string | number | boolean | null | { [cle: string]: Json | undefined } | Json[];

type Table<Row, Requises extends keyof Row = never> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, Requises>;
  Update: Partial<Row>;
  Relationships: [];
};

export type ProfilRow = {
  id: string;
  clerk_user_id: string;
  email: string | null;
  role: string;
  source_creation: string;
  cree_le: string;
  mis_a_jour_le: string;
}

export type ParametresRow = {
  id: string;
  clerk_user_id: string;
  biais_auto_actif: boolean;
  marches_optionnels: string[];
  sections_repliees: string[];
  cree_le: string;
  mis_a_jour_le: string;
}

export type TickerRow = {
  id: string;
  symbole: string;
  nom: string;
  classe_actif: "action" | "forex" | "indice" | "matiere" | "taux";
  actif_bool: boolean;
  prioritaire: boolean;
  source_principale: string;
  symboles_source: Json;
  note_source: string | null;
  cree_le: string;
}

export type PrixRow = {
  id: number;
  ticker_id: string;
  date: string;
  ouverture: number | null;
  plus_haut: number | null;
  plus_bas: number | null;
  cloture: number;
  volume: number | null;
  mm20: number | null;
  mm50: number | null;
  source_donnee: string;
  maj_le: string;
}

export type BiaisRow = {
  id: string;
  date: string;
  ticker_id: string;
  biais: "haussier" | "baissier" | "neutre";
  score_numerique: number;
  raisons: Json;
  facteurs: Json;
  sources_citees: Json;
  statut: "actif" | "remplace";
  origine: "auto" | "manuel";
  version_regles: string | null;
  cree_le: string;
}

export type ValidationRow = {
  id: string;
  biais_id: string;
  clerk_user_id: string;
  decision: "valide" | "rejete";
  commentaire: string | null;
  cree_le: string;
}

export type FluxInitieRow = {
  id: number;
  entreprise: string;
  cik: string;
  secteur: string | null;
  personne: string;
  poste: string | null;
  type_transaction: string;
  code_transaction: string;
  acquis_cede: "A" | "D" | null;
  nombre_titres: number | null;
  prix_unitaire: number | null;
  montant: number | null;
  date: string;
  date_depot: string;
  source_formulaire: string;
  numero_acces: string;
  ligne: number;
  cree_le: string;
}

export type PositionInstitutionnelleRow = {
  id: number;
  entreprise: string;
  cusip: string | null;
  institution: string;
  cik_institution: string;
  nombre_parts: number;
  valeur_usd: number | null;
  variation_trimestre: number | null;
  date_rapport: string;
  date_depot: string;
  numero_acces: string;
  cree_le: string;
}

export type TauxRow = {
  id: number;
  date: string;
  maturite: "3month" | "2year" | "5year" | "7year" | "10year" | "30year";
  taux: number;
  spread_10_2: number | null;
  spread_30_2: number | null;
  source_donnee: string;
  maj_le: string;
}

export type MatiereRow = {
  id: number;
  nom: string;
  date: string;
  prix: number;
  variation_1j: number | null;
  variation_1an: number | null;
  unite: string | null;
  source_donnee: string;
  maj_le: string;
}

export type MacroRow = {
  id: number;
  indicateur: string;
  date: string;
  valeur: number;
  unite: string | null;
  source_donnee: string;
  maj_le: string;
}

export type CalendrierRow = {
  id: number;
  indicateur: string;
  libelle: string;
  type_evenement: "publication" | "banque_centrale";
  date_reference: string | null;
  date_evenement: string;
  date_estimee: boolean;
  valeur: number | null;
  valeur_precedente: number | null;
  variation: number | null;
  consensus: number | null;
  impact: "fort" | "moyen" | "faible";
  source_donnee: string;
  maj_le: string;
}

export type ArticleRow = {
  id: number;
  titre: string;
  source: string;
  url: string;
  date_publication: string;
  extrait_court: string | null;
  impact_niveau: "fort" | "moyen" | "faible";
  categorie: string | null;
  region: string | null;
  tickers_lies: string[];
  sentiment: number | null;
  cree_le: string;
}

export type DepotSecRow = {
  id: number;
  entreprise: string;
  cik: string;
  type_formulaire: string;
  date_depot: string;
  resume_auto: string | null;
  url_source: string;
  numero_acces: string;
  cree_le: string;
}

export type FondamentalesRow = {
  id: number;
  entreprise: string;
  date_cloture: string;
  periode: "annuel" | "trimestriel" | "instantane";
  devise: string | null;
  actions_en_circulation: number | null;
  chiffre_affaires: number | null;
  resultat_net: number | null;
  capitaux_propres: number | null;
  dette_totale: number | null;
  flux_tresorerie_operationnel: number | null;
  bpa: number | null;
  per: number | null;
  roe: number | null;
  marge_nette: number | null;
  dette_sur_fonds_propres: number | null;
  controle_sec: Json | null;
  source_donnee: string;
  maj_le: string;
}

export type ConfigRow = {
  cle: string;
  valeur: Json;
  description: string | null;
  mis_a_jour_le: string;
}

export type LogTacheRow = {
  id: number;
  nom_tache: string;
  demarre_le: string;
  termine_le: string | null;
  statut: "en_cours" | "succes" | "echec";
  message: string | null;
  details: Json | null;
}

export type TachePlanifieeRow = {
  nom_tache: string;
  description: string;
  planification: string;
  delai_alerte: string;
  actif: boolean;
}

export type QuotaRow = {
  source: string;
  jour: string;
  appels: number;
  limite: number;
  bloque_jusqu_a: string | null;
  dernier_message: string | null;
  maj_le: string;
}

export type CollecteRow = {
  id: string;
  source: string;
  cle: string;
  libelle: string;
  parametres: Json;
  priorite: number;
  intervalle: string;
  ttl_cache: string;
  ticker_id: string | null;
  groupe: string | null;
  actif: boolean;
  prochaine_execution: string;
  derniere_execution: string | null;
  derniere_reussite: string | null;
  dernier_statut: string | null;
  dernier_message: string | null;
  verrou_jusqu_a: string | null;
}

export type EntrepriseSuivieRow = {
  symbole: string;
  cik: string;
  nom: string;
  secteur: string;
  cusip6: string;
  mot_cle_13f: string;
  indices: string[];
  actif: boolean;
}

export type InstitutionSuivieRow = {
  cik: string;
  nom: string;
  actif: boolean;
}

export type Database = {
  public: {
    Tables: {
      profils: Table<ProfilRow, "clerk_user_id">;
      parametres_utilisateur: Table<ParametresRow>;
      tickers_suivis: Table<TickerRow, "symbole" | "nom" | "classe_actif" | "source_principale">;
      prix_historique: Table<PrixRow, "ticker_id" | "date" | "cloture" | "source_donnee">;
      biais_quotidien: Table<BiaisRow, "date" | "ticker_id" | "biais" | "score_numerique" | "origine">;
      validations_biais: Table<ValidationRow, "biais_id" | "decision">;
      flux_inities: Table<FluxInitieRow>;
      positions_institutionnelles: Table<PositionInstitutionnelleRow>;
      taux_tresor: Table<TauxRow>;
      matieres_premieres: Table<MatiereRow>;
      indicateurs_macro: Table<MacroRow>;
      calendrier_economique: Table<CalendrierRow>;
      articles: Table<ArticleRow>;
      depots_sec_recents: Table<DepotSecRow>;
      fondamentales: Table<FondamentalesRow>;
      config_app: Table<ConfigRow, "cle" | "valeur">;
      logs_taches: Table<LogTacheRow>;
      taches_planifiees: Table<TachePlanifieeRow>;
      quota_api: Table<QuotaRow>;
      collectes_planifiees: Table<CollecteRow>;
      entreprises_suivies_sec: Table<EntrepriseSuivieRow>;
      institutions_suivies: Table<InstitutionSuivieRow>;
    };
    Views: { [_ in never]: never };
    Functions: {
      est_admin: { Args: never; Returns: boolean };
      sante: { Args: never; Returns: Json };
      reserver_calcul_manuel: { Args: never; Returns: Json };
      derniere_reussite: { Args: { p_tache: string }; Returns: string | null };
      flux_inities_agreges: {
        Args: { p_jours?: number };
        Returns: { entreprise: string; nom: string; secteur: string; achats: number; ventes: number; net: number; nb_achats: number; nb_ventes: number; derniere_date: string | null }[];
      };
      flux_inities_par_secteur: {
        Args: { p_jours?: number };
        Returns: { secteur: string; achats: number; ventes: number; net: number; nb_entreprises: number }[];
      };
      positions_institutions_agregees: {
        Args: never;
        Returns: { entreprise: string; nom: string; secteur: string; date_rapport: string; parts_totales: number; valeur_usd: number; variation_parts: number | null; nb_hausse: number; nb_baisse: number; nb_institutions: number }[];
      };
      admin_etat_cron: {
        Args: never;
        Returns: {
          nom: string;
          planification: string;
          actif: boolean;
          dernier_depart: string | null;
          dernier_statut: string | null;
          dernier_message: string | null;
        }[];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
