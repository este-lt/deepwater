-- Fondamentaux supplémentaires (sources gratuites et officielles) : courbe des T-bills et
-- prime de terme (anticipations de taux), VIX à 3 mois (structure par terme de la
-- volatilité), liquidité de la Fed (bilan, compte du Trésor, prises en pension inversées,
-- M2), taux de la zone euro (BCE), positionnement (rapport COT de la CFTC), chiffres
-- publiés face au consensus, historique de performance du biais, régimes historiques,
-- versions des règles, alertes de marché.

-- 1. Instruments. Séries FRED : chargées par la collecte existante (10 ans d'historique).
insert into public.tickers_suivis (symbole, nom, nom_en, classe_actif, source_principale, symboles_source, variation, decimales, ordre, unite, actif_bool, note_source) values
  ('US1M', 'Taux US 1 mois (T-bill)', 'US 1-month yield (T-bill)', 'taux', 'fred', '{"fred": "DGS1MO"}', 'pb', 2, 26, '%', true, null),
  ('US3M', 'Taux US 3 mois (T-bill)', 'US 3-month yield (T-bill)', 'taux', 'fred', '{"fred": "DGS3MO"}', 'pb', 2, 27, '%', true, null),
  ('US6M', 'Taux US 6 mois (T-bill)', 'US 6-month yield (T-bill)', 'taux', 'fred', '{"fred": "DGS6MO"}', 'pb', 2, 28, '%', true, null),
  ('US1Y', 'Taux US 1 an', 'US 1-year yield', 'taux', 'fred', '{"fred": "DGS1"}', 'pb', 2, 29, '%', true, null),
  ('TP10', 'Prime de terme 10 ans (Kim-Wright, Fed)', '10-year term premium (Kim-Wright, Fed)', 'taux', 'fred', '{"fred": "THREEFYTP10"}', 'pb', 2, 36, '%', true,
   'Rémunération exigée pour détenir un titre long plutôt que de rouler des titres courts ; estimation hebdomadaire de la Fed.'),
  ('EU2Y', 'Taux zone euro 2 ans (AAA, BCE)', 'Euro area 2-year yield (AAA, ECB)', 'taux', 'bce_yc', '{"bce_yc": "SR_2Y"}', 'pb', 2, 37, '%', true,
   'Courbe des emprunts d''État notés AAA de la zone euro (BCE), proche du Bund allemand.'),
  ('EU10Y', 'Taux zone euro 10 ans (AAA, BCE)', 'Euro area 10-year yield (AAA, ECB)', 'taux', 'bce_yc', '{"bce_yc": "SR_10Y"}', 'pb', 2, 38, '%', true,
   'Courbe des emprunts d''État notés AAA de la zone euro (BCE), proche du Bund allemand.'),
  ('VIX3M', 'VIX 3 mois (VIX3M)', '3-month VIX (VIX3M)', 'volatilite', 'fred', '{"fred": "VXVCLS"}', 'pts', 2, 22, 'pts', true,
   'Volatilité implicite du S&P 500 à 3 mois : un VIX au-dessus du VIX3M (structure inversée) signale un stress immédiat.'),
  ('WALCL', 'Bilan de la Fed', 'Fed balance sheet', 'credit', 'fred', '{"fred": "WALCL"}', 'pct', 0, 43, 'M$', true, 'Publication hebdomadaire (jeudi).'),
  ('TGA', 'Compte du Trésor à la Fed (TGA)', 'Treasury General Account (TGA)', 'credit', 'fred', '{"fred": "WTREGEN"}', 'pct', 0, 44, 'M$', true,
   'Liquidité retirée du système quand il monte. Publication hebdomadaire.'),
  ('RRP', 'Prises en pension inversées (RRP)', 'Overnight reverse repo (RRP)', 'credit', 'fred', '{"fred": "RRPONTSYD"}', 'pct', 1, 45, 'Md$', true,
   'Liquidité placée à la Fed, hors du système bancaire.'),
  ('M2', 'Masse monétaire M2 (États-Unis)', 'US M2 money supply', 'credit', 'fred', '{"fred": "M2SL"}', 'pct', 1, 46, 'Md$', true, 'Publication mensuelle.')
on conflict (symbole) do nothing;

-- 2. Chiffres publiés face au consensus (fil instantané FinancialJuice et InvestingLive).
create table public.publications_consensus (
  id bigint generated always as identity primary key,
  empreinte text not null unique,
  instant timestamptz not null,
  devise text,
  libelle text not null,
  publie numeric not null,
  prevision numeric not null,
  precedent numeric,
  unite text,
  ecart numeric not null,
  surprise numeric not null, -- écart normalisé entre -1 et +1 (positif : au-dessus du consensus)
  famille text not null, -- inflation, emploi, chomage, croissance, autre
  source text not null,
  titre text not null,
  cree_le timestamptz not null default now()
);
create index publications_consensus_instant_idx on public.publications_consensus (instant desc);

-- 3. Positionnement (rapport COT « Traders in Financial Futures » de la CFTC, hebdomadaire).
create table public.positions_cot (
  date date not null,
  code text not null,
  marche text not null,
  interet_ouvert bigint not null,
  gerants_long bigint not null, -- gérants d'actifs (asset managers)
  gerants_court bigint not null,
  fonds_long bigint not null, -- fonds à effet de levier (leveraged funds)
  fonds_court bigint not null,
  maj_le timestamptz not null default now(),
  primary key (date, code)
);

-- 4. Historique de performance du biais (règles rejouées sur l'historique) et régimes.
create table public.historique_biais (
  version text not null,
  date date not null,
  indice text not null,
  score numeric not null,
  biais text not null check (biais in ('haussier', 'baissier', 'neutre')),
  regime text,
  part_disponible numeric not null,
  rendement_1j numeric,
  rendement_5j numeric,
  primary key (version, indice, date)
);

create table public.regimes_historiques (
  version text not null,
  mois date not null,
  regime text not null,
  croissance numeric not null,
  inflation numeric not null,
  primary key (version, mois)
);

create table public.regles_versions (
  version text primary key,
  regles jsonb not null,
  cree_le timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['publications_consensus', 'positions_cot', 'historique_biais', 'regimes_historiques', 'regles_versions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy lecture_connectes on public.%I for select to authenticated using (true)', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete on public.%I from authenticated', t);
  end loop;
end $$;

-- Fiche par régime : rendement mensuel moyen de chaque actif selon le régime macro du mois
-- (clôture de fin de mois ; taux en points de base).
create or replace function public.fiche_regimes(p_version text)
returns table (regime text, mois integer, actif text, moyenne numeric, hausse numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  with fins as (
    select t.symbole, t.variation, date_trunc('month', p.date)::date as mois,
           (array_agg(p.cloture order by p.date desc))[1] as cloture
      from public.prix_historique p join public.tickers_suivis t on t.id = p.ticker_id
     where t.symbole in ('SPX', 'NDX', 'XAU', 'WTI', 'DXY', 'US10Y', 'EURUSD', 'USDJPY')
     group by t.symbole, t.variation, date_trunc('month', p.date)
  ), variations as (
    select symbole, mois,
           case when variation = 'pct' then (cloture / nullif(lag(cloture) over w, 0) - 1) * 100
                else (cloture - lag(cloture) over w) * 100 end as v
      from fins window w as (partition by symbole order by mois)
  )
  select r.regime, count(*)::integer, v.symbole, round(avg(v.v), 2), round(avg((v.v > 0)::int) * 100, 0)
    from public.regimes_historiques r
    join variations v on v.mois = r.mois
   where r.version = p_version and v.v is not null
   group by r.regime, v.symbole;
$$;
grant execute on function public.fiche_regimes(text) to authenticated;
revoke all on function public.fiche_regimes(text) from anon;

-- 5. Tâches programmées de la nouvelle collecte.
insert into public.taches_planifiees (nom_tache, description, planification, delai_alerte, actif) values
  ('collecte-fondamentaux:consensus', 'Chiffres publiés face au consensus (fil instantané)', '*/15 * * * *', interval '2 days', true),
  ('collecte-fondamentaux:bce_yc', 'Taux de la zone euro (courbe AAA de la BCE)', '45 16 * * 1-5', interval '84 hours', true),
  ('collecte-fondamentaux:cot', 'Positionnement : rapport COT de la CFTC', '0 12 * * 1,6', interval '10 days', true)
on conflict (nom_tache) do nothing;

select cron.schedule('fondamentaux-consensus', '*/15 * * * *', $$select public.appeler_fonction('collecte-fondamentaux', '{"source": "consensus"}')$$);
select cron.schedule('fondamentaux-bce-yc', '45 16 * * 1-5', $$select public.appeler_fonction('collecte-fondamentaux', '{"source": "bce_yc"}')$$);
select cron.schedule('fondamentaux-cot', '0 12 * * 1,6', $$select public.appeler_fonction('collecte-fondamentaux', '{"source": "cot"}')$$);

-- 6. Alertes de marché (même table et même webhook que les alertes de fonctionnement).
alter table public.alertes drop constraint alertes_motif_check;
alter table public.alertes add constraint alertes_motif_check check (motif in ('retard', 'echecs', 'marche'));

-- Une alerte de fonctionnement d'une tâche mise en pause est refermée ; les alertes de
-- marché ne dépendent pas des tâches planifiées.
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

  update public.alertes a set resolue_le = now()
   where a.resolue_le is null and a.motif in ('retard', 'echecs')
     and not exists (select 1 from public.taches_planifiees p where p.nom_tache = a.nom_tache and p.actif);
  delete from public.alertes where resolue_le < now() - interval '90 days';
  return v_changements + public.verifier_alertes_marche();
end;
$$;
revoke all on function public.verifier_alertes() from public, anon, authenticated;

-- Dernières valeurs d'un instrument (la plus récente en premier).
create or replace function public.dernieres_clotures(p_symbole text, p_nombre integer)
returns numeric[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(cloture order by date desc), '{}')
    from (
      select p.date, p.cloture from public.prix_historique p join public.tickers_suivis t on t.id = p.ticker_id
       where t.symbole = p_symbole order by p.date desc limit p_nombre
    ) x;
$$;
revoke all on function public.dernieres_clotures(text, integer) from public, anon, authenticated;

-- Alertes de marché : état (ouverte tant que la condition dure) ou événement (une fois).
create or replace function public.verifier_alertes_marche()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changements integer := 0;
  v_vix numeric[];
  v_vix3m numeric[];
  v_hy numeric[];
  v_condition boolean;
  v_message text;
  r record;
begin
  v_vix := public.dernieres_clotures('VIX', 1);
  v_vix3m := public.dernieres_clotures('VIX3M', 1);
  v_hy := public.dernieres_clotures('HY', 6);

  -- (nom, condition d'ouverture, condition de fermeture, message)
  for r in
    select * from (values
      ('marche:vix', coalesce(v_vix[1] >= 25, false), coalesce(v_vix[1] < 22, true),
       format('Deepwater : VIX à %s, au-dessus de 25 (stress sur les actions).', round(v_vix[1], 2))),
      ('marche:vix-structure', coalesce(v_vix[1] > v_vix3m[1], false), coalesce(v_vix[1] <= v_vix3m[1] * 0.97, true),
       format('Deepwater : structure de la volatilité inversée (VIX %s au-dessus du VIX3M %s), signal de stress immédiat.', round(v_vix[1], 2), round(v_vix3m[1], 2))),
      ('marche:credit', coalesce(array_length(v_hy, 1) = 6 and v_hy[1] - v_hy[6] >= 0.3, false), coalesce(array_length(v_hy, 1) = 6 and v_hy[1] - v_hy[6] < 0.1, true),
       format('Deepwater : le spread haut rendement s''écarte de %s pb en 5 séances (%s %%).', round((v_hy[1] - v_hy[6]) * 100), round(v_hy[1], 2)))
    ) as c(nom, ouvrir, fermer, message)
  loop
    if r.ouvrir and not exists (select 1 from public.alertes where nom_tache = r.nom and resolue_le is null) then
      insert into public.alertes (nom_tache, motif, message) values (r.nom, 'marche', r.message);
      perform public.notifier_alerte(r.message);
      v_changements := v_changements + 1;
    elsif r.fermer and exists (select 1 from public.alertes where nom_tache = r.nom and resolue_le is null) then
      update public.alertes set resolue_le = now() where nom_tache = r.nom and resolue_le is null;
      v_changements := v_changements + 1;
    end if;
  end loop;

  -- Événement : le biais du jour change de sens par rapport à la séance précédente.
  for r in
    with derniers as (
      select t.symbole, b.date, b.biais, b.score_numerique,
             row_number() over (partition by t.symbole order by b.date desc) as rang
        from public.biais_quotidien b join public.tickers_suivis t on t.id = b.ticker_id
       where b.statut = 'actif'
    )
    select a.symbole, a.date, a.biais, a.score_numerique, p.biais as avant
      from derniers a join derniers p on p.symbole = a.symbole and p.rang = 2
     where a.rang = 1 and a.biais <> p.biais
  loop
    v_message := format('Deepwater : biais %s du %s désormais %s (score %s), contre %s à la séance précédente.',
      r.symbole, to_char(r.date, 'DD/MM'), r.biais, round(r.score_numerique * 100), r.avant);
    if not exists (select 1 from public.alertes where nom_tache = format('marche:biais:%s:%s', r.symbole, r.date)) then
      insert into public.alertes (nom_tache, motif, message, resolue_le) values (format('marche:biais:%s:%s', r.symbole, r.date), 'marche', v_message, now());
      perform public.notifier_alerte(v_message);
      v_changements := v_changements + 1;
    end if;
  end loop;

  -- Événement : chiffre américain très loin du consensus (dernières 24 heures).
  for r in
    select id, libelle, publie, prevision, unite, surprise from public.publications_consensus
     where devise = 'USD' and abs(surprise) >= 0.8 and instant > now() - interval '24 hours'
  loop
    if not exists (select 1 from public.alertes where nom_tache = format('marche:consensus:%s', r.id)) then
      v_message := format('Deepwater : %s publié à %s%s contre %s%s attendu (surprise %s).',
        r.libelle, r.publie, coalesce(r.unite, ''), r.prevision, coalesce(r.unite, ''), case when r.surprise > 0 then 'à la hausse' else 'à la baisse' end);
      insert into public.alertes (nom_tache, motif, message, resolue_le) values (format('marche:consensus:%s', r.id), 'marche', v_message, now());
      perform public.notifier_alerte(v_message);
      v_changements := v_changements + 1;
    end if;
  end loop;

  return v_changements;
end;
$$;
revoke all on function public.verifier_alertes_marche() from public, anon, authenticated;
