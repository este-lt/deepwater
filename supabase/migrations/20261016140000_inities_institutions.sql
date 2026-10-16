-- Étape 5 : initiés (formulaires 4) et institutions (13F) via SEC EDGAR.
-- Univers : plus grosses capitalisations communes au S&P 500 / Nasdaq-100, dont les
-- flux alimentent le biais des deux indices. Données déclaratives, publiées avec un
-- délai légal (2 jours ouvrés pour un formulaire 4, 45 jours après le trimestre pour un 13F).

create table public.entreprises_suivies_sec (
  symbole text primary key,
  cik text not null unique,
  nom text not null,
  secteur text not null,
  -- 6 premiers caractères du CUSIP (identifiant de l'émetteur) + mot-clé du nom,
  -- pour retrouver la ligne dans les tableaux 13F.
  cusip6 text not null,
  mot_cle_13f text not null,
  indices text[] not null default '{}',
  actif boolean not null default true
);

create table public.institutions_suivies (
  cik text primary key,
  nom text not null,
  actif boolean not null default true
);

alter table public.entreprises_suivies_sec enable row level security;
alter table public.institutions_suivies enable row level security;
revoke all on public.entreprises_suivies_sec, public.institutions_suivies from anon;
revoke insert, update, delete on public.entreprises_suivies_sec, public.institutions_suivies from authenticated;
create policy lecture_connectes on public.entreprises_suivies_sec for select to authenticated using (true);
create policy lecture_connectes on public.institutions_suivies for select to authenticated using (true);

-- Identifiants vérifiés le 16/10/2026 sur sec.gov (company_tickers.json, submissions).
insert into public.entreprises_suivies_sec (symbole, cik, nom, secteur, cusip6, mot_cle_13f, indices) values
  ('AAPL', '0000320193', 'Apple', 'Technologie', '037833', 'APPLE', '{SPX,NDX}'),
  ('MSFT', '0000789019', 'Microsoft', 'Technologie', '594918', 'MICROSOFT', '{SPX,NDX}'),
  ('NVDA', '0001045810', 'NVIDIA', 'Technologie', '67066G', 'NVIDIA', '{SPX,NDX}'),
  ('AVGO', '0001730168', 'Broadcom', 'Technologie', '11135F', 'BROADCOM', '{SPX,NDX}'),
  ('AMZN', '0001018724', 'Amazon', 'Consommation discrétionnaire', '023135', 'AMAZON', '{SPX,NDX}'),
  ('TSLA', '0001318605', 'Tesla', 'Consommation discrétionnaire', '88160R', 'TESLA', '{SPX,NDX}'),
  ('GOOGL', '0001652044', 'Alphabet', 'Communication', '02079K', 'ALPHABET', '{SPX,NDX}'),
  ('META', '0001326801', 'Meta Platforms', 'Communication', '30303M', 'META', '{SPX,NDX}'),
  ('NFLX', '0001065280', 'Netflix', 'Communication', '64110L', 'NETFLIX', '{SPX,NDX}'),
  ('COST', '0000909832', 'Costco', 'Consommation de base', '22160K', 'COSTCO', '{SPX,NDX}'),
  ('JPM', '0000019617', 'JPMorgan Chase', 'Finance', '46625H', 'JPMORGAN', '{SPX}'),
  ('LLY', '0000059478', 'Eli Lilly', 'Santé', '532457', 'LILLY', '{SPX}')
on conflict (symbole) do nothing;

insert into public.institutions_suivies (cik, nom) values
  ('0001067983', 'Berkshire Hathaway'),
  ('0001336528', 'Pershing Square Capital Management'),
  ('0001350694', 'Bridgewater Associates'),
  ('0001167483', 'Tiger Global Management'),
  ('0001135730', 'Coatue Management'),
  ('0001656456', 'Appaloosa'),
  ('0001040273', 'Third Point'),
  ('0001536411', 'Duquesne Family Office'),
  ('0001103804', 'Viking Global Investors'),
  ('0001061165', 'Lone Pine Capital'),
  ('0001037389', 'Renaissance Technologies')
on conflict (cik) do nothing;

-- Suivi du traitement des formulaires 4 (analyse XML différée, par lots).
alter table public.depots_sec_recents add column if not exists traite_le timestamptz;
create index if not exists depots_sec_a_traiter_idx
  on public.depots_sec_recents (date_depot desc) where traite_le is null and type_formulaire in ('4', '4/A');

-- Agrégats par entreprise et par secteur (RLS du lecteur appliquée : security invoker).
-- Seuls les achats (P) et ventes (S) sur le marché comptent comme flux : les attributions,
-- exercices d'options ou retenues fiscales ne traduisent pas une décision d'investissement.
create or replace function public.flux_inities_agreges(p_jours integer default 30)
returns table (
  entreprise text, nom text, secteur text,
  achats numeric, ventes numeric, net numeric,
  nb_achats bigint, nb_ventes bigint, derniere_date date
)
language sql
stable
security invoker
set search_path = ''
as $$
  select f.entreprise, coalesce(e.nom, f.entreprise), coalesce(e.secteur, f.secteur, 'Autre'),
         coalesce(sum(f.montant) filter (where f.code_transaction = 'P'), 0),
         coalesce(sum(f.montant) filter (where f.code_transaction = 'S'), 0),
         coalesce(sum(f.montant) filter (where f.code_transaction = 'P'), 0)
           - coalesce(sum(f.montant) filter (where f.code_transaction = 'S'), 0),
         count(*) filter (where f.code_transaction = 'P'),
         count(*) filter (where f.code_transaction = 'S'),
         max(f.date)
    from public.flux_inities f
    left join public.entreprises_suivies_sec e on e.symbole = f.entreprise
   where f.date >= current_date - p_jours
     and f.code_transaction in ('P', 'S')
   group by 1, 2, 3;
$$;

create or replace function public.flux_inities_par_secteur(p_jours integer default 30)
returns table (secteur text, achats numeric, ventes numeric, net numeric, nb_entreprises bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.secteur, sum(a.achats), sum(a.ventes), sum(a.net), count(*)
    from public.flux_inities_agreges(p_jours) a
   group by a.secteur;
$$;

-- Positions des institutions suivies au dernier trimestre déclaré, par entreprise.
create or replace function public.positions_institutions_agregees()
returns table (
  entreprise text, nom text, secteur text, date_rapport date,
  parts_totales numeric, valeur_usd numeric, variation_parts numeric,
  nb_hausse bigint, nb_baisse bigint, nb_institutions bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with courant as (
    select p.* from public.positions_institutionnelles p
     where p.date_rapport = (select max(x.date_rapport) from public.positions_institutionnelles x
                              where x.cik_institution = p.cik_institution)
  )
  select c.entreprise, coalesce(e.nom, c.entreprise), coalesce(e.secteur, 'Autre'), max(c.date_rapport),
         sum(c.nombre_parts), sum(c.valeur_usd), sum(c.variation_trimestre),
         count(*) filter (where c.variation_trimestre > 0),
         count(*) filter (where c.variation_trimestre < 0),
         count(*) filter (where c.nombre_parts > 0)
    from courant c
    left join public.entreprises_suivies_sec e on e.symbole = c.entreprise
   group by 1, 2, 3;
$$;

revoke all on function public.flux_inities_agreges(integer), public.flux_inities_par_secteur(integer),
  public.positions_institutions_agregees() from public, anon;
grant execute on function public.flux_inities_agreges(integer), public.flux_inities_par_secteur(integer),
  public.positions_institutions_agregees() to authenticated, service_role;

-- Tâches : dépôts + formulaires 4 chaque matin (heure de Paris, après la nuit américaine),
-- reprise des formulaires 4 en attente toutes les 2 h, 13F chaque lundi, contrôle des
-- fondamentales chaque dimanche.
select cron.schedule('sec-depots-quotidiens', '20 6 * * *', $$select public.appeler_fonction('collecte-sec', '{"mode": "depots"}')$$);
select cron.schedule('sec-formulaires-4', '40 */2 * * *', $$select public.appeler_fonction('collecte-sec', '{"mode": "form4"}')$$);
select cron.schedule('sec-13f-hebdo', '0 7 * * 1', $$select public.appeler_fonction('collecte-sec', '{"mode": "13f"}')$$);
select cron.schedule('sec-fondamentales-hebdo', '0 7 * * 0', $$select public.appeler_fonction('collecte-sec', '{"mode": "fondamentales"}')$$);

update public.taches_planifiees
   set description = 'SEC EDGAR : dépôts quotidiens, formulaires 4 (toutes les 2 h), 13F (lundi), contrôle des fondamentales (dimanche)',
       planification = '20 6 * * * / 40 */2 * * *',
       delai_alerte = interval '6 hours'
 where nom_tache = 'collecte-sec';
