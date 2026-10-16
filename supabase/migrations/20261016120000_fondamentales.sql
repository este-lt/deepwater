-- Étape 3 : fondamentales des entreprises (optionnel, actif seulement si l'action l'est).

alter table public.fondamentales drop constraint if exists fondamentales_periode_check;
alter table public.fondamentales add constraint fondamentales_periode_check
  check (periode in ('annuel', 'trimestriel', 'instantane'));
alter table public.fondamentales add column if not exists actions_en_circulation numeric;
alter table public.fondamentales add column if not exists devise text;

-- Ratios calculés en base à partir des états financiers stockés :
--  - annuel : sur l'exercice ;
--  - trimestriel : sur les 4 derniers trimestres (TTM), seulement si les 4 sont présents ;
--  - PER = cours de clôture le plus proche (<= 7 jours avant la clôture comptable) / BPA.
-- Les lignes "instantane" (aperçu Alpha Vantage) gardent leurs ratios publiés.
create or replace function public.recalculer_ratios(p_entreprise text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nb integer;
begin
  with base as (
    select f.id, f.periode, f.date_cloture, f.chiffre_affaires, f.resultat_net, f.capitaux_propres,
           f.dette_totale, f.actions_en_circulation,
           sum(f.resultat_net) over w as rn_4t,
           sum(f.chiffre_affaires) over w as ca_4t,
           count(f.resultat_net) over w as nb_rn,
           count(f.chiffre_affaires) over w as nb_ca,
           min(f.date_cloture) over w as debut_fenetre
      from public.fondamentales f
     where f.entreprise = p_entreprise and f.periode in ('annuel', 'trimestriel')
    window w as (partition by f.periode order by f.date_cloture rows between 3 preceding and current row)
  ), calc as (
    select b.id,
           case when b.periode = 'annuel' then b.resultat_net
                when b.nb_rn = 4 and b.date_cloture - b.debut_fenetre between 250 and 300 then b.rn_4t end as rn,
           case when b.periode = 'annuel' then b.chiffre_affaires
                when b.nb_ca = 4 and b.date_cloture - b.debut_fenetre between 250 and 300 then b.ca_4t end as ca,
           b.capitaux_propres, b.dette_totale, b.actions_en_circulation, b.date_cloture
      from base b
  ), ratios as (
    select c.id,
           round(c.rn / nullif(c.ca, 0), 6) as marge,
           round(c.rn / nullif(c.capitaux_propres, 0), 6) as roe,
           round(c.dette_totale / nullif(c.capitaux_propres, 0), 6) as de,
           round(c.rn / nullif(c.actions_en_circulation, 0), 6) as bpa,
           (select p.cloture
              from public.prix_historique p
              join public.tickers_suivis t on t.id = p.ticker_id
             where t.symbole = p_entreprise
               and p.date <= c.date_cloture and p.date > c.date_cloture - 7
             order by p.date desc limit 1) as cours
      from calc c
  )
  update public.fondamentales f
     set marge_nette = r.marge,
         roe = r.roe,
         dette_sur_fonds_propres = r.de,
         bpa = r.bpa,
         per = case when r.bpa > 0 and r.cours is not null then round(r.cours / r.bpa, 2) end,
         maj_le = now()
    from ratios r
   where f.id = r.id;
  get diagnostics v_nb = row_count;
  return v_nb;
end;
$$;
revoke all on function public.recalculer_ratios(text) from public, anon, authenticated;
grant execute on function public.recalculer_ratios(text) to service_role;

-- File Alpha Vantage : 4 requêtes par entreprise, rafraîchies rarement (fondamentales lentes).
insert into public.collectes_planifiees (source, cle, libelle, parametres, priorite, intervalle, ttl_cache, ticker_id, groupe, actif)
select 'alpha_vantage', f.fonction || ':' || t.symbole, f.libelle || ' ' || t.nom,
       jsonb_build_object('function', f.fonction, 'symbol', t.symbole, 'cible', f.cible),
       3, f.intervalle, f.ttl, t.id, 'optionnel:fondamentales', true
  from public.tickers_suivis t
 cross join (values
   ('OVERVIEW', 'Aperçu', 'apercu_entreprise', interval '7 days', interval '6 days'),
   ('INCOME_STATEMENT', 'Compte de résultat', 'compte_resultat', interval '30 days', interval '25 days'),
   ('BALANCE_SHEET', 'Bilan', 'bilan', interval '30 days', interval '25 days'),
   ('CASH_FLOW', 'Flux de trésorerie', 'flux_tresorerie', interval '30 days', interval '25 days')
 ) as f(fonction, libelle, cible, intervalle, ttl)
 where t.classe_actif = 'action'
on conflict (cle) do nothing;

insert into public.taches_planifiees (nom_tache, description, planification, delai_alerte) values
  ('collecte-sec', 'SEC EDGAR : contrôle des fondamentales, dépôts récents, initiés, 13F', '20 6 * * *', interval '30 hours')
on conflict (nom_tache) do update
  set description = excluded.description, planification = excluded.planification, delai_alerte = excluded.delai_alerte;
