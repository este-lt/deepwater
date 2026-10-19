-- Biais par session : Asie, Londres, New York (contrats à terme S&P 500 et Nasdaq-100).
-- Sessions, en heure de New York (changement d'heure compris) :
--   asie      de 18 h la veille à 3 h (ouverture de Londres)
--   londres   de 3 h à 9 h 30 (ouverture de New York)
--   new_york  de 9 h 30 à 16 h
-- Chaque biais est calculé avant sa session ; les cours par session (Massive, barres de 30
-- minutes des contrats ES et NQ) servent à mesurer chaque session après coup.

-- 1. Une session par biais (les biais existants : séance de New York).
alter table public.biais_quotidien add column session text not null default 'new_york'
  check (session in ('asie', 'londres', 'new_york'));
drop index public.biais_quotidien_un_actif_idx;
create unique index biais_quotidien_un_actif_idx on public.biais_quotidien (date, ticker_id, session) where statut = 'actif';

create or replace function public.remplacer_biais(p_biais jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_date date := (p_biais ->> 'date')::date;
  v_ticker uuid := (p_biais ->> 'ticker_id')::uuid;
  v_session text := coalesce(p_biais ->> 'session', 'new_york');
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('biais:' || v_date || ':' || v_ticker || ':' || v_session));
  update public.biais_quotidien set statut = 'remplace'
   where date = v_date and ticker_id = v_ticker and session = v_session and statut = 'actif';
  insert into public.biais_quotidien
    (date, ticker_id, session, biais, score_numerique, raisons, facteurs, sources_citees, statut, origine, version_regles)
  values (
    v_date, v_ticker, v_session, p_biais ->> 'biais', (p_biais ->> 'score_numerique')::numeric,
    coalesce(p_biais -> 'raisons', '[]'), coalesce(p_biais -> 'facteurs', '[]'),
    coalesce(p_biais -> 'sources_citees', '[]'), 'actif', p_biais ->> 'origine', p_biais ->> 'version_regles'
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- 2. Cours par session (ouverture et clôture du contrat à terme le plus proche).
create table public.cours_sessions (
  indice text not null check (indice in ('SPX', 'NDX')),
  date date not null, -- séance de New York à laquelle la session appartient
  session text not null check (session in ('asie', 'londres', 'new_york')),
  contrat text not null, -- ex. ESZ6
  debut timestamptz not null,
  fin timestamptz not null,
  ouverture numeric not null,
  cloture numeric not null,
  rendement numeric not null, -- en %
  source text not null default 'massive',
  maj_le timestamptz not null default now(),
  primary key (indice, date, session)
);
alter table public.cours_sessions enable row level security;
create policy lecture_connectes on public.cours_sessions for select to authenticated using (true);
revoke all on public.cours_sessions from anon;
revoke insert, update, delete on public.cours_sessions from authenticated;

-- 3. Calcul automatique avant chaque session, pour tous (demande explicite : un biais par
-- session et par jour). Le cron passe à 5 et 35 de chaque heure ; la fonction ne lance un
-- calcul que dans les trois fenêtres (heure de New York) :
--   17 h 35 (dimanche au jeudi) -> asie de la séance suivante
--   2 h 35 (lundi au vendredi)  -> londres
--   9 h 05 (lundi au vendredi)  -> new_york
create or replace function public.declencher_biais_auto()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ny timestamp := now() at time zone 'America/New_York';
  v_heure integer := extract(hour from v_ny);
  v_minute integer := extract(minute from v_ny);
  v_jour integer := extract(isodow from v_ny); -- 1 lundi ... 7 dimanche
  v_session text;
begin
  if v_heure = 17 and v_minute >= 30 and v_jour in (7, 1, 2, 3, 4) then
    v_session := 'asie';
  elsif v_heure = 2 and v_minute >= 30 and v_jour between 1 and 5 then
    v_session := 'londres';
  elsif v_heure = 9 and v_minute < 30 and v_jour between 1 and 5 then
    v_session := 'new_york';
  else
    return;
  end if;
  perform public.appeler_fonction('calcul-biais', jsonb_build_object('mode', 'auto', 'session', v_session));
end;
$$;

select cron.unschedule('calcul-biais');
select cron.schedule('calcul-biais', '5,35 * * * *', $$select public.declencher_biais_auto()$$);
update public.taches_planifiees
   set planification = '5,35 * * * *',
       description = 'Biais par session (Asie 17 h 35, Londres 2 h 35, New York 9 h 05, heure de New York)',
       delai_alerte = interval '60 hours',
       actif = true
 where nom_tache = 'calcul-biais';

-- 4. Collecte des cours par session (Massive) : inactive tant que la clé « massive_api_key »
-- n'est pas rangée dans le Vault ; le cron est créé à ce moment-là.
insert into public.taches_planifiees (nom_tache, description, planification, delai_alerte, actif) values
  ('collecte-sessions', 'Cours par session des contrats à terme ES et NQ (Massive, décalés de 8 h)', '20 5,17,22 * * *', interval '30 hours', false)
on conflict (nom_tache) do nothing;
