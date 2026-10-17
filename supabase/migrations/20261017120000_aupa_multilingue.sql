-- Méthode Aupa, site bilingue, personnalisation : paramètres par utilisateur, macro
-- des 8 grandes économies, calendrier mondial avec consensus, squawks traduits.

-- 1. Paramètres par utilisateur : langue, thème, disposition des widgets.
alter table public.parametres_utilisateur
  add column if not exists langue text not null default 'fr' check (langue in ('fr', 'en')),
  -- { "mode": "sombre" | "clair", "accent": "#7c6cff" }
  add column if not exists theme jsonb not null default '{}',
  -- { "ordre": [ids], "masques": [ids], "larges": [ids] }
  add column if not exists disposition jsonb not null default '{}';

-- 2. Noms anglais des instruments et paire NZD/USD (méthode Aupa : devises à risque AUD/NZD).
alter table public.tickers_suivis add column if not exists nom_en text;
insert into public.tickers_suivis
  (symbole, nom, classe_actif, actif_bool, prioritaire, source_principale, symboles_source, ordre, unite, variation, decimales)
values ('NZDUSD', 'NZD/USD', 'forex', true, false, 'bce', '{"bce": {"devise": "NZD", "calcul": "usd_cote"}}', 58, null, 'pct', 4)
on conflict (symbole) do nothing;
update public.tickers_suivis t set nom_en = v.nom_en
  from (values
    ('SPX', 'S&P 500'), ('NDX', 'Nasdaq-100'), ('DJI', 'Dow Jones'), ('N225', 'Nikkei 225'),
    ('VIX', 'VIX (S&P 500 volatility)'), ('VXN', 'VXN (Nasdaq-100 volatility)'),
    ('US2Y', 'US 2-year yield'), ('US10Y', 'US 10-year yield'), ('US30Y', 'US 30-year yield'),
    ('US10R', '10-year real yield (TIPS)'), ('BE10', '10-year breakeven inflation'), ('FFR', 'Effective Fed funds rate'),
    ('HY', 'High-yield spread'), ('IG', 'Investment-grade spread'), ('NFCI', 'Financial conditions (NFCI)'),
    ('DXY', 'Dollar (Fed broad index)'), ('EURUSD', 'EUR/USD'), ('USDJPY', 'USD/JPY'), ('GBPUSD', 'GBP/USD'),
    ('USDCHF', 'USD/CHF'), ('USDCAD', 'USD/CAD'), ('AUDUSD', 'AUD/USD'), ('USDCNY', 'USD/CNY'), ('NZDUSD', 'NZD/USD'),
    ('WTI', 'WTI crude oil'), ('BRENT', 'Brent crude oil'), ('NATGAS', 'Natural gas (Henry Hub)'),
    ('XAU', 'Gold'), ('XAG', 'Silver'), ('BTC', 'Bitcoin'), ('ETH', 'Ether')
  ) as v(symbole, nom_en)
 where t.symbole = v.symbole;

-- 3. Cache des traductions automatiques (MyMemory) : un texte n'est traduit qu'une fois.
create table if not exists public.traductions (
  empreinte text primary key, -- md5(langue cible + texte source)
  langue text not null,
  texte text not null,
  traduction text not null,
  cree_le timestamptz not null default now()
);
alter table public.traductions enable row level security;
revoke all on public.traductions from anon, authenticated;

-- 4. Actualités : traductions et squawks (fils instantanés, titres seuls).
alter table public.articles
  add column if not exists traductions jsonb not null default '{}',
  add column if not exists type text not null default 'article' check (type in ('article', 'squawk'));
create index if not exists articles_type_date_idx on public.articles (type, date_publication desc);

-- 5. Calendrier mondial (Forex Factory) : devise, heure exacte, consensus, chiffre précédent.
alter table public.calendrier_economique
  add column if not exists devise text,
  add column if not exists instant timestamptz,
  add column if not exists prevision text,
  add column if not exists precedent text,
  add column if not exists libelle_en text;
alter table public.calendrier_economique drop constraint calendrier_economique_type_evenement_check;
alter table public.calendrier_economique add constraint calendrier_economique_type_evenement_check
  check (type_evenement in ('publication', 'publication_prevue', 'banque_centrale', 'mondial'));
create index if not exists calendrier_mondial_idx on public.calendrier_economique (type_evenement, instant);
update public.calendrier_economique set libelle_en = case
  when indicateur = 'FOMC' then 'Fed rate decision' when indicateur = 'BCE' then 'ECB rate decision' else libelle_en end
 where type_evenement = 'banque_centrale';

-- 6. Taux directeurs des 8 grandes banques centrales (BRI, quotidien).
create table if not exists public.taux_directeurs (
  devise text not null,
  date date not null,
  taux numeric not null,
  source_donnee text not null default 'bis:WS_CBPOL',
  maj_le timestamptz not null default now(),
  primary key (devise, date)
);
alter table public.taux_directeurs enable row level security;
revoke all on public.taux_directeurs from anon;
revoke insert, update, delete on public.taux_directeurs from authenticated;
create policy lecture_connectes on public.taux_directeurs for select to authenticated using (true);

-- 7. Planification.
insert into public.taches_planifiees (nom_tache, description, planification, delai_alerte) values
  ('collecte-marches:mondial', 'Forex Factory : calendrier mondial de la semaine (consensus, précédent)', '5 * * * *', interval '3 hours'),
  ('collecte-marches:monde', 'BRI et statistiques officielles : taux directeurs, inflation, chômage des 8 économies', '15 6 * * *', interval '30 hours')
on conflict (nom_tache) do update
  set description = excluded.description, planification = excluded.planification, delai_alerte = excluded.delai_alerte;
select cron.schedule('marches-mondial', '5 * * * *', $$select public.appeler_fonction('collecte-marches', '{"source": "mondial"}')$$);
select cron.schedule('marches-monde', '15 6 * * *', $$select public.appeler_fonction('collecte-marches', '{"source": "monde"}')$$);

-- 8. Moniteur : nom anglais en plus.
drop function if exists public.resume_marches();
create function public.resume_marches()
returns table (
  ticker_id uuid, symbole text, nom text, nom_en text, classe_actif text, unite text, variation text, decimales integer,
  ordre integer, prioritaire boolean, note_source text,
  date date, cloture numeric, source_donnee text, maj_le timestamptz, mm20 numeric, mm50 numeric,
  precedente numeric, il_y_a_1s numeric, il_y_a_1m numeric, fin_annee numeric, courbe numeric[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.id, t.symbole, t.nom, t.nom_en, t.classe_actif, t.unite, t.variation, t.decimales, t.ordre, t.prioritaire, t.note_source,
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
