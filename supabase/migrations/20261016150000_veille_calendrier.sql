-- Étape 6 : veille (RSS + Alpha Vantage NEWS_SENTIMENT) et calendrier économique.

-- Empreinte du titre (lettres et chiffres seulement, en minuscules) : un même titre
-- repris par deux sources n'est stocké qu'une fois.
alter table public.articles
  add column if not exists empreinte text
  generated always as (md5(lower(regexp_replace(titre, '[^[:alnum:]]', '', 'g')))) stored;
create unique index if not exists articles_empreinte_idx on public.articles (empreinte);
create index if not exists articles_categorie_idx on public.articles (categorie, date_publication desc);

-- Réunions de politique monétaire : dates officielles publiées par la Fed et la BCE
-- (relevées le 16/10/2026). Les dates FOMC 2027 sont provisoires jusqu'à confirmation.
insert into public.calendrier_economique
  (indicateur, libelle, type_evenement, date_evenement, date_estimee, impact, source_donnee)
values
  ('FOMC', 'Décision de taux de la Fed (FOMC)', 'banque_centrale', '2026-01-28', false, 'fort', 'federalreserve.gov'),
  ('FOMC', 'Décision de taux de la Fed (FOMC) + projections', 'banque_centrale', '2026-03-18', false, 'fort', 'federalreserve.gov'),
  ('FOMC', 'Décision de taux de la Fed (FOMC)', 'banque_centrale', '2026-04-29', false, 'fort', 'federalreserve.gov'),
  ('FOMC', 'Décision de taux de la Fed (FOMC) + projections', 'banque_centrale', '2026-06-17', false, 'fort', 'federalreserve.gov'),
  ('FOMC', 'Décision de taux de la Fed (FOMC)', 'banque_centrale', '2026-07-29', false, 'fort', 'federalreserve.gov'),
  ('FOMC', 'Décision de taux de la Fed (FOMC) + projections', 'banque_centrale', '2026-09-16', false, 'fort', 'federalreserve.gov'),
  ('FOMC', 'Décision de taux de la Fed (FOMC)', 'banque_centrale', '2026-10-28', false, 'fort', 'federalreserve.gov'),
  ('FOMC', 'Décision de taux de la Fed (FOMC) + projections', 'banque_centrale', '2026-12-09', false, 'fort', 'federalreserve.gov'),
  ('FOMC', 'Décision de taux de la Fed (FOMC, date provisoire)', 'banque_centrale', '2027-01-27', true, 'fort', 'federalreserve.gov'),
  ('FOMC', 'Décision de taux de la Fed (FOMC) + projections, date provisoire', 'banque_centrale', '2027-03-17', true, 'fort', 'federalreserve.gov'),
  ('FOMC', 'Décision de taux de la Fed (FOMC, date provisoire)', 'banque_centrale', '2027-04-28', true, 'fort', 'federalreserve.gov'),
  ('FOMC', 'Décision de taux de la Fed (FOMC) + projections, date provisoire', 'banque_centrale', '2027-06-09', true, 'fort', 'federalreserve.gov'),
  ('FOMC', 'Décision de taux de la Fed (FOMC, date provisoire)', 'banque_centrale', '2027-07-28', true, 'fort', 'federalreserve.gov'),
  ('FOMC', 'Décision de taux de la Fed (FOMC) + projections, date provisoire', 'banque_centrale', '2027-09-15', true, 'fort', 'federalreserve.gov'),
  ('FOMC', 'Décision de taux de la Fed (FOMC, date provisoire)', 'banque_centrale', '2027-10-27', true, 'fort', 'federalreserve.gov'),
  ('FOMC', 'Décision de taux de la Fed (FOMC) + projections, date provisoire', 'banque_centrale', '2027-12-08', true, 'fort', 'federalreserve.gov'),
  ('BCE', 'Décision de taux de la BCE', 'banque_centrale', '2026-10-29', false, 'fort', 'ecb.europa.eu'),
  ('BCE', 'Décision de taux de la BCE', 'banque_centrale', '2026-12-17', false, 'fort', 'ecb.europa.eu'),
  ('BCE', 'Décision de taux de la BCE', 'banque_centrale', '2027-02-04', false, 'fort', 'ecb.europa.eu'),
  ('BCE', 'Décision de taux de la BCE', 'banque_centrale', '2027-03-18', false, 'fort', 'ecb.europa.eu'),
  ('BCE', 'Décision de taux de la BCE', 'banque_centrale', '2027-04-29', false, 'fort', 'ecb.europa.eu'),
  ('BCE', 'Décision de taux de la BCE', 'banque_centrale', '2027-06-10', false, 'fort', 'ecb.europa.eu'),
  ('BCE', 'Décision de taux de la BCE', 'banque_centrale', '2027-07-22', false, 'fort', 'ecb.europa.eu'),
  ('BCE', 'Décision de taux de la BCE', 'banque_centrale', '2027-09-09', false, 'fort', 'ecb.europa.eu'),
  ('BCE', 'Décision de taux de la BCE', 'banque_centrale', '2027-10-28', false, 'fort', 'ecb.europa.eu'),
  ('BCE', 'Décision de taux de la BCE', 'banque_centrale', '2027-12-16', false, 'fort', 'ecb.europa.eu')
on conflict (indicateur, date_evenement) do nothing;

-- Actualités Alpha Vantage : un thème par requête (l'API combine les thèmes en ET).
insert into public.collectes_planifiees (source, cle, libelle, parametres, priorite, intervalle, ttl_cache, groupe) values
  ('alpha_vantage', 'NEWS_SENTIMENT:financial_markets', 'Actualités marchés financiers',
   '{"function": "NEWS_SENTIMENT", "topics": "financial_markets", "sort": "LATEST", "limit": "50", "cible": "actualites"}', 2, '12 hours', '10 hours', 'actualites'),
  ('alpha_vantage', 'NEWS_SENTIMENT:economy_monetary', 'Actualités politique monétaire',
   '{"function": "NEWS_SENTIMENT", "topics": "economy_monetary", "sort": "LATEST", "limit": "50", "cible": "actualites"}', 2, '12 hours', '10 hours', 'actualites')
on conflict (cle) do nothing;

insert into public.taches_planifiees (nom_tache, description, planification, delai_alerte) values
  ('collecte-rss', 'Flux RSS WSJ, FT, CNBC, Fed, BCE filtrés', '*/30 * * * *', interval '2 hours')
on conflict (nom_tache) do update
  set description = excluded.description, planification = excluded.planification, delai_alerte = excluded.delai_alerte;

select cron.schedule('collecte-rss', '*/30 * * * *', $$select public.appeler_fonction('collecte-rss')$$);
