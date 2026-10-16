-- Refonte : plus aucune action individuelle (SEC, fondamentales, AAPL/MSFT), univers
-- multi-actifs gratuit et officiel (FRED, BCE, CoinGecko, Alpha Vantage pour l'or et
-- l'argent), classes d'actifs affichées choisies par chaque utilisateur.

-- 1. Données SEC et actions individuelles : supprimées.
select cron.unschedule(jobname) from cron.job
 where jobname in ('sec-depots-quotidiens', 'sec-formulaires-4', 'sec-13f-hebdo', 'sec-fondamentales-hebdo', 'collecte-indices');
delete from public.taches_planifiees where nom_tache in ('collecte-sec', 'collecte-indices');
drop function if exists public.flux_inities_agreges(integer);
drop function if exists public.flux_inities_par_secteur(integer);
drop function if exists public.positions_institutions_agregees();
drop function if exists public.recalculer_ratios(text);
drop table if exists public.flux_inities, public.positions_institutionnelles, public.depots_sec_recents,
  public.entreprises_suivies_sec, public.institutions_suivies, public.fondamentales cascade;
delete from public.tickers_suivis where classe_actif = 'action';

-- 2. Alpha Vantage ne sert plus qu'à l'or et l'argent (et aux indices si abonnement premium).
delete from public.collectes_planifiees where source = 'alpha_vantage' and coalesce(groupe, '') <> 'premium:indices';
insert into public.collectes_planifiees (source, cle, libelle, parametres, priorite, intervalle, ttl_cache, groupe, ticker_id) values
  ('alpha_vantage', 'GOLD_SILVER_HISTORY:GOLD', 'Or (historique quotidien)',
   '{"function": "GOLD_SILVER_HISTORY", "symbol": "GOLD", "interval": "daily", "cible": "metal"}', 1, '12 hours', '10 hours', 'matieres', null),
  ('alpha_vantage', 'GOLD_SILVER_HISTORY:SILVER', 'Argent (historique quotidien)',
   '{"function": "GOLD_SILVER_HISTORY", "symbol": "SILVER", "interval": "daily", "cible": "metal"}', 1, '12 hours', '10 hours', 'matieres', null)
on conflict (cle) do nothing;

-- Matières premières : désormais des instruments comme les autres (prix_historique).
drop function if exists public.recalculer_variations_matieres(text);
drop table if exists public.matieres_premieres cascade;

-- 3. Univers multi-actifs.
alter table public.tickers_suivis drop constraint tickers_suivis_classe_actif_check;
alter table public.tickers_suivis add constraint tickers_suivis_classe_actif_check
  check (classe_actif in ('indice', 'volatilite', 'taux', 'credit', 'forex', 'matiere', 'crypto'));
alter table public.tickers_suivis
  add column if not exists ordre integer not null default 100,
  add column if not exists unite text,
  -- Variation affichée en % (prix) ou en points de base (taux, spreads, volatilité).
  add column if not exists variation text not null default 'pct' check (variation in ('pct', 'pb', 'pts')),
  add column if not exists decimales integer not null default 2;

-- Les paires de devises viennent désormais de la BCE : l'historique Alpha Vantage est remplacé.
delete from public.prix_historique where ticker_id in (select id from public.tickers_suivis where classe_actif = 'forex');

insert into public.tickers_suivis
  (symbole, nom, classe_actif, actif_bool, prioritaire, source_principale, symboles_source, note_source, ordre, unite, variation, decimales)
values
  ('SPX', 'S&P 500', 'indice', true, true, 'fred', '{"fred": "SP500", "alpha_vantage": "SPX"}', null, 10, 'pts', 'pct', 2),
  ('NDX', 'Nasdaq-100', 'indice', true, true, 'fred', '{"fred": "NASDAQ100", "alpha_vantage": "NDX"}', null, 11, 'pts', 'pct', 2),
  ('DJI', 'Dow Jones', 'indice', true, false, 'fred', '{"fred": "DJIA"}', null, 12, 'pts', 'pct', 2),
  ('N225', 'Nikkei 225', 'indice', true, false, 'fred', '{"fred": "NIKKEI225"}', null, 13, 'pts', 'pct', 2),
  ('VIX', 'VIX (volatilité S&P 500)', 'volatilite', true, false, 'fred', '{"fred": "VIXCLS"}', null, 20, 'pts', 'pts', 2),
  ('VXN', 'VXN (volatilité Nasdaq-100)', 'volatilite', true, false, 'fred', '{"fred": "VXNCLS"}', null, 21, 'pts', 'pts', 2),
  ('US2Y', 'Taux US 2 ans', 'taux', true, false, 'fred', '{"fred": "DGS2"}', null, 30, '%', 'pb', 2),
  ('US10Y', 'Taux US 10 ans', 'taux', true, false, 'fred', '{"fred": "DGS10"}', null, 31, '%', 'pb', 2),
  ('US30Y', 'Taux US 30 ans', 'taux', true, false, 'fred', '{"fred": "DGS30"}', null, 32, '%', 'pb', 2),
  ('US10R', 'Taux réel 10 ans (TIPS)', 'taux', true, false, 'fred', '{"fred": "DFII10"}', null, 33, '%', 'pb', 2),
  ('BE10', 'Inflation anticipée 10 ans', 'taux', true, false, 'fred', '{"fred": "T10YIE"}', null, 34, '%', 'pb', 2),
  ('FFR', 'Taux Fed effectif', 'taux', true, false, 'fred', '{"fred": "DFF"}', null, 35, '%', 'pb', 2),
  ('HY', 'Spread haut rendement (HY)', 'credit', true, false, 'fred', '{"fred": "BAMLH0A0HYM2"}', null, 40, '%', 'pb', 2),
  ('IG', 'Spread catégorie investissement (IG)', 'credit', true, false, 'fred', '{"fred": "BAMLC0A0CM"}', null, 41, '%', 'pb', 2),
  ('NFCI', 'Conditions financières (NFCI)', 'credit', true, false, 'fred', '{"fred": "NFCI"}',
   'Indice hebdomadaire de la Fed de Chicago : négatif = conditions plus souples que la moyenne.', 42, 'pts', 'pts', 3),
  ('DXY', 'Dollar (indice large de la Fed)', 'forex', true, false, 'fred', '{"fred": "DTWEXBGS"}',
   'Publié chaque semaine par la Fed (H.10), avec environ une semaine de décalage.', 50, 'pts', 'pct', 2),
  ('EURUSD', 'EUR/USD', 'forex', true, false, 'bce', '{"bce": {"devise": "USD", "calcul": "eur"}}', null, 51, null, 'pct', 4),
  ('USDJPY', 'USD/JPY', 'forex', true, false, 'bce', '{"bce": {"devise": "JPY", "calcul": "usd_base"}}', null, 52, null, 'pct', 2),
  ('GBPUSD', 'GBP/USD', 'forex', true, false, 'bce', '{"bce": {"devise": "GBP", "calcul": "usd_cote"}}', null, 53, null, 'pct', 4),
  ('USDCHF', 'USD/CHF', 'forex', true, false, 'bce', '{"bce": {"devise": "CHF", "calcul": "usd_base"}}', null, 54, null, 'pct', 4),
  ('USDCAD', 'USD/CAD', 'forex', true, false, 'bce', '{"bce": {"devise": "CAD", "calcul": "usd_base"}}', null, 55, null, 'pct', 4),
  ('AUDUSD', 'AUD/USD', 'forex', true, false, 'bce', '{"bce": {"devise": "AUD", "calcul": "usd_cote"}}', null, 56, null, 'pct', 4),
  ('USDCNY', 'USD/CNY', 'forex', true, false, 'bce', '{"bce": {"devise": "CNY", "calcul": "usd_base"}}', null, 57, null, 'pct', 4),
  ('WTI', 'Pétrole WTI', 'matiere', true, false, 'fred', '{"fred": "DCOILWTICO"}', null, 60, '$/baril', 'pct', 2),
  ('BRENT', 'Pétrole Brent', 'matiere', true, false, 'fred', '{"fred": "DCOILBRENTEU"}', null, 61, '$/baril', 'pct', 2),
  ('NATGAS', 'Gaz naturel (Henry Hub)', 'matiere', true, false, 'fred', '{"fred": "DHHNGSP"}', null, 62, '$/MMBtu', 'pct', 2),
  ('XAU', 'Or', 'matiere', true, false, 'alpha_vantage', '{"alpha_vantage": "GOLD"}', null, 63, '$/once', 'pct', 2),
  ('XAG', 'Argent', 'matiere', true, false, 'alpha_vantage', '{"alpha_vantage": "SILVER"}', null, 64, '$/once', 'pct', 2),
  ('BTC', 'Bitcoin', 'crypto', true, false, 'fred', '{"fred": "CBBTCUSD", "coingecko": "bitcoin"}',
   'Clôtures quotidiennes Coinbase (FRED), cours du jour CoinGecko.', 70, '$', 'pct', 0),
  ('ETH', 'Ether', 'crypto', true, false, 'fred', '{"fred": "CBETHUSD", "coingecko": "ethereum"}',
   'Clôtures quotidiennes Coinbase (FRED), cours du jour CoinGecko.', 71, '$', 'pct', 2)
on conflict (symbole) do update set
  nom = excluded.nom, classe_actif = excluded.classe_actif, actif_bool = true, prioritaire = excluded.prioritaire,
  source_principale = excluded.source_principale, symboles_source = excluded.symboles_source, note_source = excluded.note_source,
  ordre = excluded.ordre, unite = excluded.unite, variation = excluded.variation, decimales = excluded.decimales;

-- Le lien collecte <-> instrument pour l'or et l'argent.
update public.collectes_planifiees c set ticker_id = t.id
  from public.tickers_suivis t
 where (c.cle, t.symbole) in (('GOLD_SILVER_HISTORY:GOLD', 'XAU'), ('GOLD_SILVER_HISTORY:SILVER', 'XAG'));

-- 4. Classes affichées : chaque utilisateur choisit (plus aucun blocage par l'administrateur).
alter table public.parametres_utilisateur
  add column if not exists classes_affichees text[] not null default '{indice,volatilite,taux,credit}',
  drop column if exists marches_optionnels,
  drop column if exists sections_repliees;

-- 5. Macro : séries FRED (même table, nouvelles clés). Les anciennes valeurs Alpha Vantage sont remplacées.
delete from public.indicateurs_macro;
delete from public.calendrier_economique where type_evenement = 'publication';
alter table public.calendrier_economique drop constraint calendrier_economique_type_evenement_check;
alter table public.calendrier_economique add constraint calendrier_economique_type_evenement_check
  check (type_evenement in ('publication', 'publication_prevue', 'banque_centrale'));
alter table public.calendrier_economique drop constraint calendrier_economique_indicateur_date_evenement_key;
alter table public.calendrier_economique add constraint calendrier_economique_indicateur_type_date_key
  unique (indicateur, type_evenement, date_evenement);

-- 6. Résumé du moniteur multi-actifs en une requête : dernier cours et variations.
create or replace function public.resume_marches()
returns table (
  ticker_id uuid, symbole text, nom text, classe_actif text, unite text, variation text, decimales integer,
  ordre integer, prioritaire boolean, note_source text,
  date date, cloture numeric, source_donnee text, maj_le timestamptz, mm20 numeric, mm50 numeric,
  precedente numeric, il_y_a_1s numeric, il_y_a_1m numeric, fin_annee numeric, courbe numeric[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.id, t.symbole, t.nom, t.classe_actif, t.unite, t.variation, t.decimales, t.ordre, t.prioritaire, t.note_source,
         d.date, d.cloture, d.source_donnee, d.maj_le, d.mm20, d.mm50,
         (select p.cloture from public.prix_historique p where p.ticker_id = t.id and p.date < d.date order by p.date desc limit 1),
         (select p.cloture from public.prix_historique p where p.ticker_id = t.id and p.date <= d.date - 7 order by p.date desc limit 1),
         (select p.cloture from public.prix_historique p where p.ticker_id = t.id and p.date <= d.date - 30 order by p.date desc limit 1),
         (select p.cloture from public.prix_historique p
           where p.ticker_id = t.id and p.date < date_trunc('year', d.date)::date order by p.date desc limit 1),
         array(select c.cloture from (
           select p.date, p.cloture from public.prix_historique p
            where p.ticker_id = t.id and p.date > d.date - 92 order by p.date) c)
    from public.tickers_suivis t
    cross join lateral (
      select p.date, p.cloture, p.source_donnee, p.maj_le, p.mm20, p.mm50
        from public.prix_historique p where p.ticker_id = t.id order by p.date desc limit 1
    ) d
   where t.actif_bool
   order by t.ordre;
$$;
revoke all on function public.resume_marches() from public, anon;
grant execute on function public.resume_marches() to authenticated;

-- 7. Planification : un collecteur par source gratuite.
insert into public.taches_planifiees (nom_tache, description, planification, delai_alerte) values
  ('collecte-marches:fred', 'FRED : indices, volatilité, taux, crédit, pétrole, gaz, crypto (clôtures), macro', '10 */2 * * *', interval '6 hours'),
  ('collecte-marches:bce', 'BCE : cours de référence des devises (jours ouvrés)', '20 15,17 * * 1-5', interval '84 hours'),
  ('collecte-marches:crypto', 'CoinGecko : cours du jour bitcoin et ether', '*/15 * * * *', interval '1 hour'),
  ('collecte-marches:calendrier', 'FRED : dates des prochaines publications macro (clé API requise)', '40 5 * * *', interval '30 hours')
on conflict (nom_tache) do update
  set description = excluded.description, planification = excluded.planification, delai_alerte = excluded.delai_alerte;

select cron.schedule('marches-fred', '10 */2 * * *', $$select public.appeler_fonction('collecte-marches', '{"source": "fred"}')$$);
select cron.schedule('marches-bce', '20 15,17 * * 1-5', $$select public.appeler_fonction('collecte-marches', '{"source": "bce"}')$$);
select cron.schedule('marches-crypto', '*/15 * * * *', $$select public.appeler_fonction('collecte-marches', '{"source": "crypto"}')$$);
select cron.schedule('marches-calendrier', '40 5 * * *', $$select public.appeler_fonction('collecte-marches', '{"source": "calendrier"}')$$);
