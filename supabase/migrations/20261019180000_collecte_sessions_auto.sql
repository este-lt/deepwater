-- Collecte des cours par session : démarre seule dès que la clé « massive_api_key » est
-- rangée dans le Vault. Toutes les heures (à 20) :
--   sans clé : rien (aucun journal, aucune alerte) ;
--   à 5 h, 17 h et 22 h UTC : les 7 derniers jours ;
--   sinon : le plus ancien trimestre des 2 dernières années encore incomplet (rattrapage,
--   un trimestre par heure pour respecter la limite de 5 appels par minute de l'offre gratuite).
create or replace function public.declencher_collecte_sessions()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trimestre date;
begin
  if not exists (select 1 from vault.secrets where name = 'massive_api_key') then
    return;
  end if;
  update public.taches_planifiees set actif = true where nom_tache = 'collecte-sessions' and not actif;
  if extract(hour from now() at time zone 'UTC') in (5, 17, 22) then
    perform public.appeler_fonction('collecte-sessions', '{"mode": "recent"}');
    return;
  end if;
  -- Trimestres entièrement dans les 2 ans d'historique de l'offre gratuite ; un trimestre est
  -- complet quand il compte au moins 80 % des sessions attendues (6 par jour ouvré écoulé).
  select t into v_trimestre
    from generate_series((date_trunc('quarter', current_date - interval '2 years') + interval '3 months')::date, current_date, interval '3 months') t
   where (select count(*) from public.cours_sessions c where c.date >= t and c.date < (t + interval '3 months')::date)
       < 0.8 * 6 * (select count(*) from generate_series(t, least((t + interval '3 months' - interval '1 day')::date, current_date - 1), interval '1 day') j
                     where extract(isodow from j) < 6)
   order by t
   limit 1;
  if v_trimestre is null then
    return;
  end if;
  perform public.appeler_fonction('collecte-sessions', jsonb_build_object(
    'mode', 'historique',
    'trimestre', extract(year from v_trimestre)::text || '-' || extract(quarter from v_trimestre)::text
  ));
end;
$$;

select cron.schedule('collecte-sessions', '20 * * * *', $$select public.declencher_collecte_sessions()$$);
update public.taches_planifiees set planification = '20 * * * *' where nom_tache = 'collecte-sessions';
