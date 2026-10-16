-- Deepwater : schéma initial.
-- Conventions : noms en snake_case ASCII (sans accents) pour éviter les problèmes
-- d'encodage dans les URL PostgREST ; horodatages en timestamptz (UTC).

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- Utilitaires
-- ---------------------------------------------------------------------------

create or replace function public.maj_horodatage()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.mis_a_jour_le := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Utilisateurs (données propres à chaque compte, protégées par RLS)
-- ---------------------------------------------------------------------------

create table public.profils (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null unique,
  email text,
  role text not null default 'utilisateur' check (role in ('utilisateur', 'admin')),
  source_creation text not null default 'webhook' check (source_creation in ('webhook', 'secours')),
  cree_le timestamptz not null default now(),
  mis_a_jour_le timestamptz not null default now()
);

create trigger profils_maj before update on public.profils
  for each row execute function public.maj_horodatage();

create table public.parametres_utilisateur (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null unique default (auth.jwt() ->> 'sub')
    references public.profils (clerk_user_id) on delete cascade,
  biais_auto_actif boolean not null default false,
  marches_optionnels text[] not null default '{}',
  sections_repliees text[] not null default '{}',
  cree_le timestamptz not null default now(),
  mis_a_jour_le timestamptz not null default now()
);

create trigger parametres_utilisateur_maj before update on public.parametres_utilisateur
  for each row execute function public.maj_horodatage();

-- Vrai si l'utilisateur courant (jeton Clerk) est administrateur.
-- security definer : lit profils sans dépendre des politiques RLS (évite la récursion).
create or replace function public.est_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profils p
    where p.clerk_user_id = (select auth.jwt() ->> 'sub')
      and p.role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- Marchés (données partagées : lecture seule pour les connectés,
-- écriture réservée au service role des Edge Functions)
-- ---------------------------------------------------------------------------

create table public.tickers_suivis (
  id uuid primary key default gen_random_uuid(),
  symbole text not null unique,
  nom text not null,
  classe_actif text not null check (classe_actif in ('action', 'forex', 'indice', 'matiere', 'taux')),
  actif_bool boolean not null default false,
  prioritaire boolean not null default false,
  source_principale text not null,
  symboles_source jsonb not null default '{}',
  note_source text,
  cree_le timestamptz not null default now()
);

create table public.prix_historique (
  id bigint generated always as identity primary key,
  ticker_id uuid not null references public.tickers_suivis (id) on delete cascade,
  date date not null,
  ouverture numeric,
  plus_haut numeric,
  plus_bas numeric,
  cloture numeric not null,
  volume numeric,
  mm20 numeric,
  mm50 numeric,
  source_donnee text not null,
  maj_le timestamptz not null default now(),
  unique (ticker_id, date)
);
create index prix_historique_date_idx on public.prix_historique (date);
create index prix_historique_ticker_date_idx on public.prix_historique (ticker_id, date desc);

create table public.biais_quotidien (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  ticker_id uuid not null references public.tickers_suivis (id) on delete cascade,
  biais text not null check (biais in ('haussier', 'baissier', 'neutre')),
  score_numerique numeric not null,
  raisons jsonb not null default '[]',
  facteurs jsonb not null default '[]',
  sources_citees jsonb not null default '[]',
  statut text not null default 'actif' check (statut in ('actif', 'remplace')),
  origine text not null check (origine in ('auto', 'manuel')),
  version_regles text,
  cree_le timestamptz not null default now()
);
create index biais_quotidien_date_idx on public.biais_quotidien (date);
create index biais_quotidien_ticker_date_idx on public.biais_quotidien (ticker_id, date desc);
create unique index biais_quotidien_un_actif_idx
  on public.biais_quotidien (date, ticker_id) where statut = 'actif';

create table public.validations_biais (
  id uuid primary key default gen_random_uuid(),
  biais_id uuid not null references public.biais_quotidien (id) on delete cascade,
  clerk_user_id text not null default (auth.jwt() ->> 'sub')
    references public.profils (clerk_user_id) on delete cascade,
  decision text not null check (decision in ('valide', 'rejete')),
  commentaire text check (char_length(commentaire) <= 1000),
  cree_le timestamptz not null default now(),
  unique (biais_id, clerk_user_id)
);
create index validations_biais_user_idx on public.validations_biais (clerk_user_id, cree_le desc);

create table public.flux_inities (
  id bigint generated always as identity primary key,
  entreprise text not null,
  cik text not null,
  secteur text,
  personne text not null,
  poste text,
  type_transaction text not null,
  code_transaction text not null,
  acquis_cede text check (acquis_cede in ('A', 'D')),
  nombre_titres numeric,
  prix_unitaire numeric,
  montant numeric,
  date date not null,
  date_depot date not null,
  source_formulaire text not null,
  numero_acces text not null,
  ligne integer not null,
  cree_le timestamptz not null default now(),
  unique (numero_acces, ligne)
);
create index flux_inities_date_idx on public.flux_inities (date);
create index flux_inities_entreprise_date_idx on public.flux_inities (entreprise, date desc);

create table public.positions_institutionnelles (
  id bigint generated always as identity primary key,
  entreprise text not null,
  cusip text,
  institution text not null,
  cik_institution text not null,
  nombre_parts numeric not null,
  valeur_usd numeric,
  variation_trimestre numeric,
  date_rapport date not null,
  date_depot date not null,
  numero_acces text not null,
  cree_le timestamptz not null default now(),
  unique (cik_institution, entreprise, date_rapport)
);
create index positions_institutionnelles_date_idx on public.positions_institutionnelles (date_rapport);
create index positions_institutionnelles_depot_idx on public.positions_institutionnelles (date_depot);

create table public.taux_tresor (
  id bigint generated always as identity primary key,
  date date not null,
  maturite text not null check (maturite in ('3month', '2year', '5year', '7year', '10year', '30year')),
  taux numeric not null,
  spread_10_2 numeric,
  spread_30_2 numeric,
  source_donnee text not null,
  maj_le timestamptz not null default now(),
  unique (date, maturite)
);
create index taux_tresor_date_idx on public.taux_tresor (date desc);

create table public.matieres_premieres (
  id bigint generated always as identity primary key,
  nom text not null,
  date date not null,
  prix numeric not null,
  variation_1j numeric,
  variation_1an numeric,
  unite text,
  source_donnee text not null,
  maj_le timestamptz not null default now(),
  unique (nom, date)
);
create index matieres_premieres_date_idx on public.matieres_premieres (date desc);

create table public.indicateurs_macro (
  id bigint generated always as identity primary key,
  indicateur text not null,
  date date not null,
  valeur numeric not null,
  unite text,
  source_donnee text not null,
  maj_le timestamptz not null default now(),
  unique (indicateur, date)
);
create index indicateurs_macro_date_idx on public.indicateurs_macro (indicateur, date desc);

create table public.calendrier_economique (
  id bigint generated always as identity primary key,
  indicateur text not null,
  libelle text not null,
  type_evenement text not null check (type_evenement in ('publication', 'banque_centrale')),
  date_reference date,
  date_evenement date not null,
  date_estimee boolean not null default false,
  valeur numeric,
  valeur_precedente numeric,
  variation numeric,
  consensus numeric,
  impact text not null default 'moyen' check (impact in ('fort', 'moyen', 'faible')),
  source_donnee text not null,
  maj_le timestamptz not null default now(),
  unique (indicateur, date_evenement)
);
create index calendrier_economique_date_idx on public.calendrier_economique (date_evenement desc);

create table public.articles (
  id bigint generated always as identity primary key,
  titre text not null,
  source text not null,
  url text not null unique,
  date_publication timestamptz not null,
  extrait_court text check (char_length(extrait_court) <= 400),
  impact_niveau text not null default 'moyen' check (impact_niveau in ('fort', 'moyen', 'faible')),
  categorie text,
  region text,
  tickers_lies text[] not null default '{}',
  sentiment numeric,
  cree_le timestamptz not null default now()
);
create index articles_date_idx on public.articles (date_publication desc);

create table public.depots_sec_recents (
  id bigint generated always as identity primary key,
  entreprise text not null,
  cik text not null,
  type_formulaire text not null,
  date_depot date not null,
  resume_auto text,
  url_source text not null,
  numero_acces text not null unique,
  cree_le timestamptz not null default now()
);
create index depots_sec_recents_date_idx on public.depots_sec_recents (date_depot desc);

create table public.fondamentales (
  id bigint generated always as identity primary key,
  entreprise text not null,
  date_cloture date not null,
  periode text not null check (periode in ('annuel', 'trimestriel')),
  chiffre_affaires numeric,
  resultat_net numeric,
  capitaux_propres numeric,
  dette_totale numeric,
  flux_tresorerie_operationnel numeric,
  bpa numeric,
  per numeric,
  roe numeric,
  marge_nette numeric,
  dette_sur_fonds_propres numeric,
  controle_sec jsonb,
  source_donnee text not null,
  maj_le timestamptz not null default now(),
  unique (entreprise, date_cloture, periode)
);
create index fondamentales_date_idx on public.fondamentales (entreprise, date_cloture desc);

-- Configuration applicative non secrète (ex. abonnement Alpha Vantage premium).
create table public.config_app (
  cle text primary key,
  valeur jsonb not null,
  description text,
  mis_a_jour_le timestamptz not null default now()
);
create trigger config_app_maj before update on public.config_app
  for each row execute function public.maj_horodatage();

-- ---------------------------------------------------------------------------
-- Interne : cache, quota, journal (aucun accès direct utilisateur, sauf admin)
-- ---------------------------------------------------------------------------

create table public.cache_api (
  id bigint generated always as identity primary key,
  cle_requete text not null unique,
  source text not null,
  reponse_json jsonb not null,
  expire_le timestamptz not null,
  cree_le timestamptz not null default now()
);
create index cache_api_expire_idx on public.cache_api (expire_le);

create table public.logs_taches (
  id bigint generated always as identity primary key,
  nom_tache text not null,
  demarre_le timestamptz not null default now(),
  termine_le timestamptz,
  statut text not null check (statut in ('en_cours', 'succes', 'echec')),
  message text,
  details jsonb
);
create index logs_taches_nom_date_idx on public.logs_taches (nom_tache, demarre_le desc);
create index logs_taches_date_idx on public.logs_taches (demarre_le desc);

-- Fréquence attendue de chaque tâche : permet de repérer un arrêt silencieux.
create table public.taches_planifiees (
  nom_tache text primary key,
  description text not null,
  planification text not null,
  delai_alerte interval not null,
  actif boolean not null default true
);

create table public.demandes_calcul_manuel (
  id bigint generated always as identity primary key,
  clerk_user_id text not null default (auth.jwt() ->> 'sub'),
  demande_le timestamptz not null default now()
);
create index demandes_calcul_manuel_user_idx on public.demandes_calcul_manuel (clerk_user_id, demande_le desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profils enable row level security;
alter table public.parametres_utilisateur enable row level security;
alter table public.validations_biais enable row level security;
alter table public.demandes_calcul_manuel enable row level security;
alter table public.tickers_suivis enable row level security;
alter table public.prix_historique enable row level security;
alter table public.biais_quotidien enable row level security;
alter table public.flux_inities enable row level security;
alter table public.positions_institutionnelles enable row level security;
alter table public.taux_tresor enable row level security;
alter table public.matieres_premieres enable row level security;
alter table public.indicateurs_macro enable row level security;
alter table public.calendrier_economique enable row level security;
alter table public.articles enable row level security;
alter table public.depots_sec_recents enable row level security;
alter table public.fondamentales enable row level security;
alter table public.config_app enable row level security;
alter table public.cache_api enable row level security;
alter table public.logs_taches enable row level security;
alter table public.taches_planifiees enable row level security;

-- Personne en anonyme : tout passe par un jeton Clerk.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- Profil : lecture de son propre profil uniquement. Création/modification par le
-- webhook ou la fonction de secours (service role) : l'utilisateur ne peut pas
-- s'attribuer le rôle admin.
create policy profils_lecture_soi on public.profils
  for select to authenticated
  using ((select auth.jwt() ->> 'sub') = clerk_user_id);
revoke insert, update, delete on public.profils from authenticated;

-- Paramètres : chacun lit/crée/modifie uniquement les siens.
create policy parametres_lecture_soi on public.parametres_utilisateur
  for select to authenticated
  using ((select auth.jwt() ->> 'sub') = clerk_user_id);
create policy parametres_creation_soi on public.parametres_utilisateur
  for insert to authenticated
  with check ((select auth.jwt() ->> 'sub') = clerk_user_id);
create policy parametres_modification_soi on public.parametres_utilisateur
  for update to authenticated
  using ((select auth.jwt() ->> 'sub') = clerk_user_id)
  with check ((select auth.jwt() ->> 'sub') = clerk_user_id);
revoke delete on public.parametres_utilisateur from authenticated;

-- Validations de biais : chacun gère uniquement les siennes.
create policy validations_lecture_soi on public.validations_biais
  for select to authenticated
  using ((select auth.jwt() ->> 'sub') = clerk_user_id);
create policy validations_creation_soi on public.validations_biais
  for insert to authenticated
  with check ((select auth.jwt() ->> 'sub') = clerk_user_id);
create policy validations_modification_soi on public.validations_biais
  for update to authenticated
  using ((select auth.jwt() ->> 'sub') = clerk_user_id)
  with check ((select auth.jwt() ->> 'sub') = clerk_user_id);
create policy validations_suppression_soi on public.validations_biais
  for delete to authenticated
  using ((select auth.jwt() ->> 'sub') = clerk_user_id);

create policy demandes_lecture_soi on public.demandes_calcul_manuel
  for select to authenticated
  using ((select auth.jwt() ->> 'sub') = clerk_user_id);
revoke insert, update, delete on public.demandes_calcul_manuel from authenticated;

-- Données de marché partagées : lecture seule pour tous les connectés.
do $$
declare
  t text;
begin
  foreach t in array array[
    'tickers_suivis', 'prix_historique', 'biais_quotidien', 'flux_inities',
    'positions_institutionnelles', 'taux_tresor', 'matieres_premieres',
    'indicateurs_macro', 'calendrier_economique', 'articles',
    'depots_sec_recents', 'fondamentales', 'config_app'
  ]
  loop
    execute format(
      'create policy lecture_connectes on public.%I for select to authenticated using (true)', t
    );
    execute format('revoke insert, update, delete on public.%I from authenticated', t);
  end loop;
end;
$$;

-- Exceptions admin : activer/désactiver un marché optionnel, modifier la config.
grant update (actif_bool) on public.tickers_suivis to authenticated;
create policy tickers_modification_admin on public.tickers_suivis
  for update to authenticated
  using ((select public.est_admin()))
  with check ((select public.est_admin()));

grant update (valeur) on public.config_app to authenticated;
create policy config_modification_admin on public.config_app
  for update to authenticated
  using ((select public.est_admin()))
  with check ((select public.est_admin()));

-- Journal et planification : lecture admin uniquement.
create policy logs_lecture_admin on public.logs_taches
  for select to authenticated
  using ((select public.est_admin()));
create policy taches_lecture_admin on public.taches_planifiees
  for select to authenticated
  using ((select public.est_admin()));
revoke insert, update, delete on public.logs_taches from authenticated;
revoke insert, update, delete on public.taches_planifiees from authenticated;

-- cache_api : aucune politique, donc aucun accès hors service role.
revoke all on public.cache_api from authenticated;

revoke execute on function public.est_admin() from public, anon;
grant execute on function public.est_admin() to authenticated;
revoke execute on function public.maj_horodatage() from public, anon, authenticated;
