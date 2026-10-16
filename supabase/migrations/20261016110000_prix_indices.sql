-- Étape 2 : prix S&P 500 / Nasdaq-100 (FRED), marchés optionnels (Alpha Vantage),
-- moyennes mobiles 20 et 50 jours, tâches programmées.

-- Moyennes mobiles simples, calculées en base sur les clôtures stockées.
-- Une moyenne n'est renseignée que si la fenêtre est complète (20 ou 50 séances).
create or replace function public.recalculer_moyennes_mobiles(p_ticker uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nb integer;
begin
  with calc as (
    select id,
           case when count(*) over w20 = 20 then round(avg(cloture) over w20, 4) end as m20,
           case when count(*) over w50 = 50 then round(avg(cloture) over w50, 4) end as m50
      from public.prix_historique
     where ticker_id = p_ticker
    window w20 as (order by date rows between 19 preceding and current row),
           w50 as (order by date rows between 49 preceding and current row)
  )
  update public.prix_historique p
     set mm20 = calc.m20, mm50 = calc.m50
    from calc
   where p.id = calc.id
     and (p.mm20 is distinct from calc.m20 or p.mm50 is distinct from calc.m50);
  get diagnostics v_nb = row_count;
  return v_nb;
end;
$$;
revoke all on function public.recalculer_moyennes_mobiles(uuid) from public, anon, authenticated;
grant execute on function public.recalculer_moyennes_mobiles(uuid) to service_role;

-- Configuration non secrète, modifiable par l'admin.
insert into public.config_app (cle, valeur, description) values
  ('av_premium', 'false', 'Abonnement Alpha Vantage premium actif : les indices passent sur INDEX_DATA (OHLC).'),
  ('av_limite_quotidienne', '25', 'Nombre maximal de requêtes Alpha Vantage par jour (plan gratuit : 25).')
on conflict (cle) do nothing;

-- Instruments. Priorité : S&P 500 et Nasdaq-100. Le reste est optionnel et inactif.
insert into public.tickers_suivis (symbole, nom, classe_actif, actif_bool, prioritaire, source_principale, symboles_source, note_source) values
  ('SPX', 'S&P 500', 'indice', true, true, 'fred', '{"fred": "SP500", "alpha_vantage": "SPX"}',
   'Clôtures quotidiennes publiées par la Fed de St. Louis (FRED), avec un jour de décalage. Pas d''ouverture/plus haut/plus bas sur le plan gratuit.'),
  ('NDX', 'Nasdaq-100', 'indice', true, true, 'fred', '{"fred": "NASDAQ100", "alpha_vantage": "NDX"}',
   'Clôtures quotidiennes publiées par la Fed de St. Louis (FRED), avec un jour de décalage. Pas d''ouverture/plus haut/plus bas sur le plan gratuit.'),
  ('DJI', 'Dow Jones', 'indice', false, false, 'fred', '{"fred": "DJIA", "alpha_vantage": "DJI"}',
   'Optionnel. Clôtures quotidiennes FRED.'),
  ('EURUSD', 'EUR/USD', 'forex', false, false, 'alpha_vantage', '{"alpha_vantage": {"from": "EUR", "to": "USD"}}', 'Optionnel. FX_DAILY Alpha Vantage.'),
  ('USDJPY', 'USD/JPY', 'forex', false, false, 'alpha_vantage', '{"alpha_vantage": {"from": "USD", "to": "JPY"}}', 'Optionnel. FX_DAILY Alpha Vantage.'),
  ('GBPUSD', 'GBP/USD', 'forex', false, false, 'alpha_vantage', '{"alpha_vantage": {"from": "GBP", "to": "USD"}}', 'Optionnel. FX_DAILY Alpha Vantage.'),
  ('USDCHF', 'USD/CHF', 'forex', false, false, 'alpha_vantage', '{"alpha_vantage": {"from": "USD", "to": "CHF"}}', 'Optionnel. FX_DAILY Alpha Vantage.'),
  ('AAPL', 'Apple', 'action', false, false, 'alpha_vantage', '{"alpha_vantage": "AAPL", "cik": "0000320193"}', 'Optionnel. TIME_SERIES_DAILY Alpha Vantage.'),
  ('MSFT', 'Microsoft', 'action', false, false, 'alpha_vantage', '{"alpha_vantage": "MSFT", "cik": "0000789019"}', 'Optionnel. TIME_SERIES_DAILY Alpha Vantage.')
on conflict (symbole) do nothing;

-- File de collecte Alpha Vantage. Priorité 1 = essentiel, 3 = optionnel.
insert into public.collectes_planifiees (source, cle, libelle, parametres, priorite, intervalle, ttl_cache, ticker_id, groupe, actif)
select 'alpha_vantage', 'FX_DAILY:' || t.symbole, 'Cours quotidiens ' || t.nom,
       jsonb_build_object('function', 'FX_DAILY', 'from_symbol', t.symboles_source -> 'alpha_vantage' ->> 'from',
                          'to_symbol', t.symboles_source -> 'alpha_vantage' ->> 'to', 'outputsize', 'compact',
                          'cible', 'prix_quotidiens'),
       3, interval '1 day', interval '20 hours', t.id, 'optionnel:forex', true
  from public.tickers_suivis t where t.classe_actif = 'forex'
on conflict (cle) do nothing;

insert into public.collectes_planifiees (source, cle, libelle, parametres, priorite, intervalle, ttl_cache, ticker_id, groupe, actif)
select 'alpha_vantage', 'TIME_SERIES_DAILY:' || t.symbole, 'Cours quotidiens ' || t.nom,
       jsonb_build_object('function', 'TIME_SERIES_DAILY', 'symbol', t.symbole, 'outputsize', 'compact',
                          'cible', 'prix_quotidiens'),
       3, interval '1 day', interval '20 hours', t.id, 'optionnel:actions', true
  from public.tickers_suivis t where t.classe_actif = 'action'
on conflict (cle) do nothing;

-- Indices via Alpha Vantage : uniquement avec un abonnement premium (désactivé).
insert into public.collectes_planifiees (source, cle, libelle, parametres, priorite, intervalle, ttl_cache, ticker_id, groupe, actif)
select 'alpha_vantage', 'INDEX_DATA:' || t.symbole, 'OHLC quotidien ' || t.nom || ' (premium)',
       jsonb_build_object('function', 'INDEX_DATA', 'symbol', t.symboles_source ->> 'alpha_vantage', 'interval', 'daily',
                          'cible', 'prix_quotidiens'),
       1, interval '12 hours', interval '10 hours', t.id, 'premium:indices', false
  from public.tickers_suivis t where t.symbole in ('SPX', 'NDX')
on conflict (cle) do nothing;

-- Tâches programmées : FRED toutes les 3 h, file Alpha Vantage toutes les 15 min.
insert into public.taches_planifiees (nom_tache, description, planification, delai_alerte) values
  ('collecte-indices', 'Clôtures S&P 500 / Nasdaq-100 (FRED) et moyennes mobiles', '15 */3 * * *', interval '8 hours'),
  ('collecte-av', 'File de collecte Alpha Vantage (quota, priorités, cache)', '*/15 * * * *', interval '2 hours')
on conflict (nom_tache) do update
  set description = excluded.description, planification = excluded.planification, delai_alerte = excluded.delai_alerte;

select cron.schedule('collecte-indices', '15 */3 * * *', $$select public.appeler_fonction('collecte-indices')$$);
select cron.schedule('collecte-av', '*/15 * * * *', $$select public.appeler_fonction('collecte-av')$$);
