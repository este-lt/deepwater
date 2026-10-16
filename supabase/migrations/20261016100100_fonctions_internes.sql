-- Deepwater : fonctions internes (secrets, quota, file de collecte, appels pg_cron,
-- surveillance, santé, limitation du calcul manuel).

-- ---------------------------------------------------------------------------
-- Secrets (Supabase Vault) : lisibles uniquement par le service role.
-- ---------------------------------------------------------------------------

create or replace function public.lire_secret(p_nom text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = p_nom
  order by created_at desc
  limit 1;
$$;
revoke all on function public.lire_secret(text) from public, anon, authenticated;
grant execute on function public.lire_secret(text) to service_role;

-- ---------------------------------------------------------------------------
-- Quota des API externes (compteur quotidien avec priorités)
-- ---------------------------------------------------------------------------

create table public.quota_api (
  source text not null,
  jour date not null,
  appels integer not null default 0,
  limite integer not null,
  bloque_jusqu_a timestamptz,
  dernier_message text,
  maj_le timestamptz not null default now(),
  primary key (source, jour)
);
alter table public.quota_api enable row level security;
revoke all on public.quota_api from anon;
revoke insert, update, delete on public.quota_api from authenticated;
create policy quota_lecture_admin on public.quota_api
  for select to authenticated
  using ((select public.est_admin()));

-- Réserve un appel si le quota le permet. Priorité 1 (essentiel) peut aller
-- jusqu'à la limite ; priorité 2 laisse 3 appels de marge ; priorité 3 en laisse 8.
create or replace function public.reserver_appel_api(p_source text, p_priorite integer, p_limite integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jour date := (now() at time zone 'utc')::date;
  v_seuil integer := p_limite - case p_priorite when 1 then 0 when 2 then 3 else 8 end;
  v_ok boolean;
begin
  insert into public.quota_api (source, jour, limite)
  values (p_source, v_jour, p_limite)
  on conflict (source, jour) do update set limite = excluded.limite;

  update public.quota_api
     set appels = appels + 1, maj_le = now()
   where source = p_source
     and jour = v_jour
     and appels < v_seuil
     and (bloque_jusqu_a is null or bloque_jusqu_a < now())
  returning true into v_ok;

  return coalesce(v_ok, false);
end;
$$;
revoke all on function public.reserver_appel_api(text, integer, integer) from public, anon, authenticated;
grant execute on function public.reserver_appel_api(text, integer, integer) to service_role;

-- Bloque la source jusqu'à une date (ex. Alpha Vantage signale sa limite atteinte).
create or replace function public.bloquer_quota_api(p_source text, p_jusqu_a timestamptz, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jour date := (now() at time zone 'utc')::date;
begin
  insert into public.quota_api (source, jour, limite, bloque_jusqu_a, dernier_message)
  values (p_source, v_jour, 0, p_jusqu_a, p_message)
  on conflict (source, jour) do update
    set bloque_jusqu_a = excluded.bloque_jusqu_a,
        dernier_message = excluded.dernier_message,
        maj_le = now();
end;
$$;
revoke all on function public.bloquer_quota_api(text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.bloquer_quota_api(text, timestamptz, text) to service_role;

-- ---------------------------------------------------------------------------
-- File de collecte : chaque requête externe planifiée, avec priorité et cadence.
-- Un seul collecteur réclame les lignes (skip locked) : un seul appel réel par donnée.
-- ---------------------------------------------------------------------------

create table public.collectes_planifiees (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  cle text not null unique,
  libelle text not null,
  parametres jsonb not null,
  priorite smallint not null check (priorite between 1 and 3),
  intervalle interval not null,
  ttl_cache interval not null,
  ticker_id uuid references public.tickers_suivis (id) on delete cascade,
  groupe text,
  actif boolean not null default true,
  prochaine_execution timestamptz not null default now(),
  derniere_execution timestamptz,
  derniere_reussite timestamptz,
  dernier_statut text,
  dernier_message text,
  verrou_jusqu_a timestamptz
);
create index collectes_planifiees_echeance_idx
  on public.collectes_planifiees (source, priorite, prochaine_execution) where actif;
alter table public.collectes_planifiees enable row level security;
revoke all on public.collectes_planifiees from anon;
revoke insert, update, delete on public.collectes_planifiees from authenticated;
create policy collectes_lecture_admin on public.collectes_planifiees
  for select to authenticated
  using ((select public.est_admin()));

create or replace function public.reclamer_collectes(p_source text, p_max integer)
returns setof public.collectes_planifiees
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.collectes_planifiees c
     set verrou_jusqu_a = now() + interval '10 minutes'
   where c.id in (
     select c2.id
       from public.collectes_planifiees c2
       left join public.tickers_suivis t on t.id = c2.ticker_id
      where c2.source = p_source
        and c2.actif
        and c2.prochaine_execution <= now()
        and (c2.verrou_jusqu_a is null or c2.verrou_jusqu_a < now())
        and (c2.ticker_id is null or t.actif_bool)
      order by c2.priorite, c2.prochaine_execution
      limit p_max
      for update of c2 skip locked
   )
  returning c.*;
end;
$$;
revoke all on function public.reclamer_collectes(text, integer) from public, anon, authenticated;
grant execute on function public.reclamer_collectes(text, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Appel d'une Edge Function depuis pg_cron (pg_net), avec suivi de la réponse.
-- ---------------------------------------------------------------------------

create table public.appels_fonctions (
  request_id bigint primary key,
  nom_tache text not null,
  envoye_le timestamptz not null default now(),
  verifie boolean not null default false
);
alter table public.appels_fonctions enable row level security;
revoke all on public.appels_fonctions from anon, authenticated;

create or replace function public.appeler_fonction(p_tache text, p_corps jsonb default '{}')
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_id bigint;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'url_projet';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'secret_fonctions';
  if v_url is null or v_secret is null then
    insert into public.logs_taches (nom_tache, statut, termine_le, message)
    values (p_tache, 'echec', now(), 'Secret Vault manquant (url_projet ou secret_fonctions).');
    return null;
  end if;

  select net.http_post(
    url := v_url || '/functions/v1/' || p_tache,
    body := p_corps,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-deepwater-secret', v_secret
    ),
    timeout_milliseconds := 150000
  ) into v_id;

  insert into public.appels_fonctions (request_id, nom_tache) values (v_id, p_tache);
  return v_id;
end;
$$;
revoke all on function public.appeler_fonction(text, jsonb) from public, anon, authenticated;

-- Repère les appels HTTP échoués, les tâches bloquées "en cours" et purge l'historique.
create or replace function public.surveiller_taches()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select a.request_id, a.nom_tache, resp.status_code, resp.error_msg, resp.timed_out
      from public.appels_fonctions a
      join net._http_response resp on resp.id = a.request_id
     where not a.verifie
  loop
    if r.status_code is null or r.status_code >= 400 or coalesce(r.timed_out, false) then
      insert into public.logs_taches (nom_tache, statut, termine_le, message)
      values (
        r.nom_tache, 'echec', now(),
        format(
          'Appel HTTP de la tâche en échec (statut %s)%s',
          coalesce(r.status_code::text, 'aucun'),
          case
            when coalesce(r.timed_out, false) then ' : délai dépassé.'
            when r.error_msg is not null then ' : ' || r.error_msg
            else '.'
          end
        )
      );
    end if;
    update public.appels_fonctions set verifie = true where request_id = r.request_id;
  end loop;

  -- Un appel jamais revenu au bout d'une heure est aussi un échec silencieux.
  for r in
    select a.request_id, a.nom_tache
      from public.appels_fonctions a
     where not a.verifie
       and a.envoye_le < now() - interval '1 hour'
  loop
    insert into public.logs_taches (nom_tache, statut, termine_le, message)
    values (r.nom_tache, 'echec', now(), 'Aucune réponse HTTP reçue après une heure.');
    update public.appels_fonctions set verifie = true where request_id = r.request_id;
  end loop;

  update public.logs_taches
     set statut = 'echec',
         termine_le = now(),
         message = concat_ws(' ', message, 'Interrompue sans signal de fin (plus de 15 min).')
   where statut = 'en_cours'
     and demarre_le < now() - interval '15 minutes';

  delete from public.appels_fonctions where envoye_le < now() - interval '2 days';
  delete from public.logs_taches where demarre_le < now() - interval '60 days';
  delete from public.cache_api where expire_le < now() - interval '30 days';
  delete from public.demandes_calcul_manuel where demande_le < now() - interval '30 days';
end;
$$;
revoke all on function public.surveiller_taches() from public, anon, authenticated;

-- État des jobs pg_cron pour la page admin.
create or replace function public.admin_etat_cron()
returns table (
  nom text,
  planification text,
  actif boolean,
  dernier_depart timestamptz,
  dernier_statut text,
  dernier_message text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.est_admin() then
    raise exception 'acces_refuse' using errcode = '42501';
  end if;
  return query
  select j.jobname::text, j.schedule::text, j.active,
         d.start_time, d.status::text, left(d.return_message, 300)
    from cron.job j
    left join lateral (
      select rd.start_time, rd.status, rd.return_message
        from cron.job_run_details rd
       where rd.jobid = j.jobid
       order by rd.start_time desc
       limit 1
    ) d on true
   order by j.jobname;
end;
$$;
revoke all on function public.admin_etat_cron() from public, anon;
grant execute on function public.admin_etat_cron() to authenticated;

-- ---------------------------------------------------------------------------
-- Santé (endpoint public /api/health) : aucune donnée sensible.
-- ---------------------------------------------------------------------------

create or replace function public.sante()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'base', 'ok',
    'heure_serveur', now(),
    'derniere_tache_reussie', (select max(termine_le) from public.logs_taches where statut = 'succes')
  );
$$;
revoke all on function public.sante() from public;
grant execute on function public.sante() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Calcul manuel du biais : limité à 1 demande / 5 min par utilisateur,
-- et 60 / heure au total.
-- ---------------------------------------------------------------------------

create or replace function public.reserver_calcul_manuel()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid text := (select auth.jwt() ->> 'sub');
  v_dernier timestamptz;
  v_total integer;
begin
  if v_uid is null then
    raise exception 'non_authentifie' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('calcul_manuel:' || v_uid));

  select max(demande_le) into v_dernier
    from public.demandes_calcul_manuel where clerk_user_id = v_uid;
  if v_dernier is not null and v_dernier > now() - interval '5 minutes' then
    return jsonb_build_object('autorise', false, 'reessayer_apres', v_dernier + interval '5 minutes');
  end if;

  select count(*) into v_total
    from public.demandes_calcul_manuel where demande_le > now() - interval '1 hour';
  if v_total >= 60 then
    return jsonb_build_object('autorise', false, 'reessayer_apres', now() + interval '10 minutes');
  end if;

  insert into public.demandes_calcul_manuel (clerk_user_id) values (v_uid);
  return jsonb_build_object('autorise', true);
end;
$$;
revoke all on function public.reserver_calcul_manuel() from public, anon;
grant execute on function public.reserver_calcul_manuel() to authenticated;
