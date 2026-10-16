-- Étape 4 : taux du Trésor US, macro (Fed, inflation, emploi, PIB), matières premières.
-- Source : Alpha Vantage uniquement (choix utilisateur), rafraîchissement étalé.

-- Écarts de taux 10 ans - 2 ans et 30 ans - 2 ans (en points de pourcentage),
-- recopiés sur toutes les maturités de la date pour faciliter la lecture.
create or replace function public.recalculer_spreads(p_depuis date default current_date - 60)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nb integer;
begin
  with pivot as (
    select date,
           max(taux) filter (where maturite = '2year') as t2,
           max(taux) filter (where maturite = '10year') as t10,
           max(taux) filter (where maturite = '30year') as t30
      from public.taux_tresor
     where date >= p_depuis
     group by date
  )
  update public.taux_tresor t
     set spread_10_2 = round(p.t10 - p.t2, 3),
         spread_30_2 = round(p.t30 - p.t2, 3)
    from pivot p
   where t.date = p.date
     and (t.spread_10_2 is distinct from round(p.t10 - p.t2, 3)
          or t.spread_30_2 is distinct from round(p.t30 - p.t2, 3));
  get diagnostics v_nb = row_count;
  return v_nb;
end;
$$;
revoke all on function public.recalculer_spreads(date) from public, anon, authenticated;
grant execute on function public.recalculer_spreads(date) to service_role;

-- Variations sur 1 jour de cotation et sur 1 an (prix le plus proche 365 jours avant).
create or replace function public.recalculer_variations_matieres(p_nom text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nb integer;
begin
  with calc as (
    select m.id,
           round((m.prix / nullif(lag(m.prix) over (order by m.date), 0) - 1) * 100, 3) as v1j,
           round((m.prix / nullif((select a.prix from public.matieres_premieres a
                                    where a.nom = m.nom and a.date <= m.date - 365
                                    order by a.date desc limit 1), 0) - 1) * 100, 3) as v1a
      from public.matieres_premieres m
     where m.nom = p_nom
  )
  update public.matieres_premieres m
     set variation_1j = c.v1j, variation_1an = c.v1a
    from calc c
   where m.id = c.id
     and (m.variation_1j is distinct from c.v1j or m.variation_1an is distinct from c.v1a);
  get diagnostics v_nb = row_count;
  return v_nb;
end;
$$;
revoke all on function public.recalculer_variations_matieres(text) from public, anon, authenticated;
grant execute on function public.recalculer_variations_matieres(text) to service_role;

-- File Alpha Vantage.
-- Priorité 1 : 2, 10, 30 ans (biais et écarts de taux) ; priorité 2 : le reste du socle.
insert into public.collectes_planifiees (source, cle, libelle, parametres, priorite, intervalle, ttl_cache, groupe) values
  ('alpha_vantage', 'TREASURY_YIELD:2year', 'Taux du Trésor US 2 ans',
   '{"function": "TREASURY_YIELD", "interval": "daily", "maturity": "2year", "cible": "taux_tresor"}', 1, '1 day', '20 hours', 'taux'),
  ('alpha_vantage', 'TREASURY_YIELD:10year', 'Taux du Trésor US 10 ans',
   '{"function": "TREASURY_YIELD", "interval": "daily", "maturity": "10year", "cible": "taux_tresor"}', 1, '1 day', '20 hours', 'taux'),
  ('alpha_vantage', 'TREASURY_YIELD:30year', 'Taux du Trésor US 30 ans',
   '{"function": "TREASURY_YIELD", "interval": "daily", "maturity": "30year", "cible": "taux_tresor"}', 1, '1 day', '20 hours', 'taux'),
  ('alpha_vantage', 'TREASURY_YIELD:3month', 'Taux du Trésor US 3 mois',
   '{"function": "TREASURY_YIELD", "interval": "daily", "maturity": "3month", "cible": "taux_tresor"}', 2, '1 day', '20 hours', 'taux'),
  ('alpha_vantage', 'TREASURY_YIELD:5year', 'Taux du Trésor US 5 ans',
   '{"function": "TREASURY_YIELD", "interval": "daily", "maturity": "5year", "cible": "taux_tresor"}', 2, '2 days', '40 hours', 'taux'),
  ('alpha_vantage', 'TREASURY_YIELD:7year', 'Taux du Trésor US 7 ans',
   '{"function": "TREASURY_YIELD", "interval": "daily", "maturity": "7year", "cible": "taux_tresor"}', 2, '2 days', '40 hours', 'taux'),
  ('alpha_vantage', 'FEDERAL_FUNDS_RATE', 'Taux directeur de la Fed (Fed funds effectif)',
   '{"function": "FEDERAL_FUNDS_RATE", "interval": "daily", "cible": "indicateur_macro", "indicateur": "FEDERAL_FUNDS_RATE"}', 1, '1 day', '20 hours', 'macro'),
  ('alpha_vantage', 'CPI', 'Indice des prix à la consommation (CPI)',
   '{"function": "CPI", "interval": "monthly", "cible": "indicateur_macro", "indicateur": "CPI"}', 2, '3 days', '60 hours', 'macro'),
  ('alpha_vantage', 'UNEMPLOYMENT', 'Taux de chômage',
   '{"function": "UNEMPLOYMENT", "cible": "indicateur_macro", "indicateur": "UNEMPLOYMENT"}', 2, '3 days', '60 hours', 'macro'),
  ('alpha_vantage', 'NONFARM_PAYROLL', 'Créations d''emplois non agricoles (NFP)',
   '{"function": "NONFARM_PAYROLL", "cible": "indicateur_macro", "indicateur": "NONFARM_PAYROLL"}', 2, '3 days', '60 hours', 'macro'),
  ('alpha_vantage', 'REAL_GDP', 'PIB réel (trimestriel)',
   '{"function": "REAL_GDP", "interval": "quarterly", "cible": "indicateur_macro", "indicateur": "REAL_GDP"}', 2, '7 days', '6 days', 'macro'),
  ('alpha_vantage', 'WTI', 'Pétrole WTI',
   '{"function": "WTI", "interval": "daily", "cible": "matiere_premiere", "nom": "WTI"}', 2, '1 day', '20 hours', 'matieres'),
  ('alpha_vantage', 'BRENT', 'Pétrole Brent',
   '{"function": "BRENT", "interval": "daily", "cible": "matiere_premiere", "nom": "BRENT"}', 2, '1 day', '20 hours', 'matieres'),
  ('alpha_vantage', 'NATURAL_GAS', 'Gaz naturel (Henry Hub)',
   '{"function": "NATURAL_GAS", "interval": "daily", "cible": "matiere_premiere", "nom": "NATURAL_GAS"}', 3, '2 days', '40 hours', 'matieres'),
  ('alpha_vantage', 'COPPER', 'Cuivre',
   '{"function": "COPPER", "interval": "monthly", "cible": "matiere_premiere", "nom": "COPPER"}', 3, '7 days', '6 days', 'matieres')
on conflict (cle) do nothing;
