-- Alertes de fonctionnement : une tâche active sans réussite depuis son délai d'alerte, ou
-- en échec deux fois de suite, ouvre une alerte ; la réussite suivante la referme.
-- Contrôle toutes les 10 minutes (surveillance-taches). Notification facultative vers un
-- webhook (Discord, Slack ou ntfy) dont l'adresse est rangée dans le Vault sous le nom
-- « alerte_webhook_url » ; sans ce secret, les alertes restent visibles en page Admin.

create table public.alertes (
  id bigint generated always as identity primary key,
  nom_tache text not null,
  motif text not null check (motif in ('retard', 'echecs')),
  message text not null,
  ouverte_le timestamptz not null default now(),
  resolue_le timestamptz
);
create unique index alertes_une_ouverte_par_tache on public.alertes (nom_tache) where resolue_le is null;
alter table public.alertes enable row level security;
create policy alertes_lecture_admin on public.alertes for select to authenticated using ((select public.est_admin()));
revoke all on public.alertes from anon;
revoke insert, update, delete on public.alertes from authenticated;

create or replace function public.notifier_alerte(p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_cible text;
  v_corps jsonb;
  v_parties text[];
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'alerte_webhook_url';
  if v_url is null or v_url !~* '^https://' then
    return;
  end if;
  v_cible := v_url;
  if v_url ~* '^https://(discord|discordapp)\.com/api/webhooks/' then
    v_corps := jsonb_build_object('content', p_message);
  elsif v_url ~* '^https://hooks\.slack\.com/' then
    v_corps := jsonb_build_object('text', p_message);
  elsif v_url ~* '^https://ntfy\.' then
    -- ntfy : publication JSON à la racine du serveur, sujet dans le corps.
    v_parties := regexp_match(v_url, '^(https://[^/]+)/([A-Za-z0-9_-]+)/?$');
    if v_parties is null then
      return;
    end if;
    v_cible := v_parties[1];
    v_corps := jsonb_build_object('topic', v_parties[2], 'title', 'Deepwater', 'message', p_message, 'priority', 4, 'tags', jsonb_build_array('warning'));
  else
    v_corps := jsonb_build_object('text', p_message, 'content', p_message, 'message', p_message);
  end if;
  perform net.http_post(
    url := v_cible,
    body := v_corps,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 10000
  );
end;
$$;
revoke all on function public.notifier_alerte(text) from public, anon, authenticated;

create or replace function public.verifier_alertes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  v_reussite timestamptz;
  v_derniers text[];
  v_motif text;
  v_message text;
  v_ouverte bigint;
  v_changements integer := 0;
begin
  for t in select nom_tache, delai_alerte from public.taches_planifiees where actif loop
    select max(termine_le) into v_reussite
      from public.logs_taches where nom_tache = t.nom_tache and statut = 'succes';
    select array_agg(statut order by demarre_le desc) into v_derniers
      from (
        select statut, demarre_le from public.logs_taches
         where nom_tache = t.nom_tache and statut in ('succes', 'echec')
         order by demarre_le desc limit 2
      ) x;

    v_motif := null;
    if v_reussite is null or now() - v_reussite > t.delai_alerte then
      v_motif := 'retard';
      v_message := format(
        'Deepwater : la tâche %s n''a pas réussi depuis %s (délai d''alerte : %s).',
        t.nom_tache,
        coalesce(to_char(v_reussite at time zone 'Europe/Paris', 'DD/MM à HH24:MI'), 'sa création'),
        t.delai_alerte
      );
    elsif v_derniers = array['echec', 'echec'] then
      v_motif := 'echecs';
      v_message := format('Deepwater : la tâche %s a échoué deux fois de suite.', t.nom_tache) || coalesce(
        ' Dernier message : ' || (
          select left(message, 200) from public.logs_taches
           where nom_tache = t.nom_tache and statut = 'echec' order by demarre_le desc limit 1
        ),
        ''
      );
    end if;

    select id into v_ouverte from public.alertes where nom_tache = t.nom_tache and resolue_le is null;
    if v_motif is not null and v_ouverte is null then
      insert into public.alertes (nom_tache, motif, message) values (t.nom_tache, v_motif, v_message);
      perform public.notifier_alerte(v_message);
      v_changements := v_changements + 1;
    elsif v_motif is null and v_ouverte is not null then
      update public.alertes set resolue_le = now() where id = v_ouverte;
      perform public.notifier_alerte(format('Deepwater : la tâche %s fonctionne de nouveau.', t.nom_tache));
      v_changements := v_changements + 1;
    end if;
  end loop;

  -- Tâche mise en pause ou retirée : son alerte est refermée sans notification.
  update public.alertes a set resolue_le = now()
   where a.resolue_le is null
     and not exists (select 1 from public.taches_planifiees p where p.nom_tache = a.nom_tache and p.actif);
  delete from public.alertes where resolue_le < now() - interval '90 days';
  return v_changements;
end;
$$;
revoke all on function public.verifier_alertes() from public, anon, authenticated;

-- La surveillance (toutes les 10 minutes) vérifie désormais aussi les alertes ; une erreur
-- des alertes ne bloque jamais la surveillance elle-même.
create or replace function public.surveiller_taches_journalise()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
  v_alertes integer := 0;
  v_erreur text;
begin
  insert into public.logs_taches (nom_tache, statut) values ('surveillance-taches', 'en_cours') returning id into v_id;
  perform public.surveiller_taches();
  begin
    v_alertes := public.verifier_alertes();
  exception when others then
    v_erreur := sqlerrm;
  end;
  update public.logs_taches
     set statut = 'succes',
         termine_le = now(),
         message = case
           when v_erreur is not null then 'Contrôle effectué ; vérification des alertes impossible : ' || v_erreur
           when v_alertes > 0 then format('Contrôle effectué ; %s alerte(s) ouverte(s) ou refermée(s).', v_alertes)
           else 'Contrôle effectué.'
         end
   where id = v_id;
exception when others then
  insert into public.logs_taches (nom_tache, statut, termine_le, message)
  values ('surveillance-taches', 'echec', now(), sqlerrm);
end;
$$;
