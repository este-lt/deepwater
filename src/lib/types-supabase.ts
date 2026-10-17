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
  classes_affichees: string[];
  langue: "fr" | "en";
  theme: Json;
  disposition: Json;
  cree_le: string;
  mis_a_jour_le: string;
}

export type TickerRow = {
  id: string;
  symbole: string;
  nom: string;
  nom_en: string | null;
  classe_actif: "indice" | "volatilite" | "taux" | "credit" | "forex" | "matiere" | "crypto";
  actif_bool: boolean;
  prioritaire: boolean;
  source_principale: string;
  symboles_source: Json;
  note_source: string | null;
  ordre: number;
  unite: string | null;
  variation: "pct" | "pb" | "pts";
  decimales: number;
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
  type_evenement: "publication" | "publication_prevue" | "banque_centrale" | "mondial";
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
  devise: string | null;
  instant: string | null;
  prevision: string | null;
  precedent: string | null;
  libelle_en: string | null;
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
  traductions: Json;
  type: "article" | "squawk";
}

export type TauxDirecteurRow = {
  devise: string;
  date: string;
  taux: number;
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

export type Database = {
  public: {
    Tables: {
      profils: Table<ProfilRow, "clerk_user_id">;
      parametres_utilisateur: Table<ParametresRow>;
      tickers_suivis: Table<TickerRow, "symbole" | "nom" | "classe_actif" | "source_principale">;
      prix_historique: Table<PrixRow, "ticker_id" | "date" | "cloture" | "source_donnee">;
      biais_quotidien: Table<BiaisRow, "date" | "ticker_id" | "biais" | "score_numerique" | "origine">;
      validations_biais: Table<ValidationRow, "biais_id" | "decision">;
      taux_tresor: Table<TauxRow>;
      indicateurs_macro: Table<MacroRow>;
      calendrier_economique: Table<CalendrierRow>;
      articles: Table<ArticleRow>;
      taux_directeurs: Table<TauxDirecteurRow>;
      config_app: Table<ConfigRow, "cle" | "valeur">;
      logs_taches: Table<LogTacheRow>;
      taches_planifiees: Table<TachePlanifieeRow>;
      quota_api: Table<QuotaRow>;
      collectes_planifiees: Table<CollecteRow>;
    };
    Views: { [_ in never]: never };
    Functions: {
      est_admin: { Args: never; Returns: boolean };
      sante: { Args: never; Returns: Json };
      reserver_calcul_manuel: { Args: never; Returns: Json };
      derniere_reussite: { Args: { p_tache: string }; Returns: string | null };
      resume_marches: {
        Args: never;
        Returns: {
          ticker_id: string;
          symbole: string;
          nom: string;
          nom_en: string | null;
          classe_actif: string;
          unite: string | null;
          variation: string;
          decimales: number;
          ordre: number;
          prioritaire: boolean;
          note_source: string | null;
          date: string;
          cloture: number;
          source_donnee: string;
          maj_le: string;
          mm20: number | null;
          mm50: number | null;
          precedente: number | null;
          il_y_a_1s: number | null;
          il_y_a_1m: number | null;
          fin_annee: number | null;
          courbe: number[] | null;
        }[];
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
