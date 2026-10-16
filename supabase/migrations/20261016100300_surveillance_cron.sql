-- Surveillance : job pg_cron pur SQL (aucun appel externe) qui transforme en
-- "échec" visible les appels HTTP ratés et les tâches restées "en cours".
-- Il écrit lui-même son passage dans le journal.
create or replace function public.surveiller_taches_journalise()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into public.logs_taches (nom_tache, statut) values ('surveillance-taches', 'en_cours') returning id into v_id;
  perform public.surveiller_taches();
  update public.logs_taches set statut = 'succes', termine_le = now(), message = 'Contrôle effectué.' where id = v_id;
exception when others then
  insert into public.logs_taches (nom_tache, statut, termine_le, message)
  values ('surveillance-taches', 'echec', now(), sqlerrm);
end;
$$;
revoke all on function public.surveiller_taches_journalise() from public, anon, authenticated;

select cron.schedule('surveillance-taches', '*/10 * * * *', $$select public.surveiller_taches_journalise()$$);

insert into public.taches_planifiees (nom_tache, description, planification, delai_alerte) values
  ('surveillance-taches', 'Repère les tâches en échec silencieux et purge l''historique', '*/10 * * * *', interval '1 hour')
on conflict (nom_tache) do update
  set description = excluded.description, planification = excluded.planification, delai_alerte = excluded.delai_alerte;
