-- Étape 7 : biais quotidien (S&P 500, Nasdaq-100), calculé une fois pour tous.

-- Remplacement atomique du biais actif d'une séance : l'ancien passe en « remplace »
-- (ses validations restent dans l'historique), le nouveau devient « actif ».
create or replace function public.remplacer_biais(p_biais jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_date date := (p_biais ->> 'date')::date;
  v_ticker uuid := (p_biais ->> 'ticker_id')::uuid;
  v_id uuid;
begin
  -- Deux calculs simultanés (deux boutons manuels) s'exécutent l'un après l'autre.
  perform pg_advisory_xact_lock(hashtext('biais:' || v_date || ':' || v_ticker));
  update public.biais_quotidien set statut = 'remplace'
   where date = v_date and ticker_id = v_ticker and statut = 'actif';
  insert into public.biais_quotidien
    (date, ticker_id, biais, score_numerique, raisons, facteurs, sources_citees, statut, origine, version_regles)
  values (
    v_date, v_ticker, p_biais ->> 'biais', (p_biais ->> 'score_numerique')::numeric,
    coalesce(p_biais -> 'raisons', '[]'), coalesce(p_biais -> 'facteurs', '[]'),
    coalesce(p_biais -> 'sources_citees', '[]'), 'actif', p_biais ->> 'origine', p_biais ->> 'version_regles'
  )
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.remplacer_biais(jsonb) from public, anon, authenticated;

-- Déclencheur automatique : appelé à 12 h 30 et 13 h 30 UTC du lundi au vendredi.
-- Un seul des deux créneaux tombe à 8 h 30 à New York (heure d'été ou d'hiver) :
-- le calcul part avant l'ouverture, et seulement si au moins un utilisateur a activé
-- l'automatisation. Sinon la tâche est marquée en pause (pas d'alerte de retard).
create or replace function public.declencher_biais_auto()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actif boolean;
begin
  select exists (select 1 from public.parametres_utilisateur where biais_auto_actif) into v_actif;
  update public.taches_planifiees set actif = v_actif
   where nom_tache = 'calcul-biais' and actif is distinct from v_actif;
  if not v_actif then
    return;
  end if;
  if extract(hour from (now() at time zone 'America/New_York')) <> 8 then
    return;
  end if;
  perform public.appeler_fonction('calcul-biais', '{"mode": "auto"}');
end;
$$;
revoke all on function public.declencher_biais_auto() from public, anon, authenticated;

insert into public.taches_planifiees (nom_tache, description, planification, delai_alerte, actif) values
  ('calcul-biais', 'Biais quotidien SPX/NDX à 8 h 30 New York, si au moins un utilisateur l''a activé', '30 12,13 * * 1-5', interval '4 days', false)
on conflict (nom_tache) do update
  set description = excluded.description, planification = excluded.planification, delai_alerte = excluded.delai_alerte;

select cron.schedule('calcul-biais', '30 12,13 * * 1-5', $$select public.declencher_biais_auto()$$);
