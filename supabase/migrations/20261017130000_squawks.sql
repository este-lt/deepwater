-- Fil instantané (squawks FinancialJuice et InvestingLive) : relu toutes les 5 minutes,
-- filtré, traduit. Conservation 7 jours (purge dans la fonction).
insert into public.taches_planifiees (nom_tache, description, planification, delai_alerte) values
  ('collecte-rss:squawks', 'FinancialJuice et InvestingLive : fil instantané filtré et traduit', '*/5 * * * *', interval '30 minutes')
on conflict (nom_tache) do update
  set description = excluded.description, planification = excluded.planification, delai_alerte = excluded.delai_alerte;
select cron.schedule('rss-squawks', '*/5 * * * *', $$select public.appeler_fonction('collecte-rss', '{"mode": "squawks"}')$$);
