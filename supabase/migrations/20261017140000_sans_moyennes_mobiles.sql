-- Aucun indicateur technique : suppression des moyennes mobiles 20/50 jours (calcul en
-- base, colonnes) ; le moniteur ne les renvoie plus.

drop function if exists public.recalculer_moyennes_mobiles(uuid);

drop function if exists public.resume_marches();
create function public.resume_marches()
returns table (
  ticker_id uuid, symbole text, nom text, nom_en text, classe_actif text, unite text, variation text, decimales integer,
  ordre integer, prioritaire boolean, note_source text,
  date date, cloture numeric, source_donnee text, maj_le timestamptz,
  precedente numeric, il_y_a_1s numeric, il_y_a_1m numeric, fin_annee numeric, courbe numeric[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.id, t.symbole, t.nom, t.nom_en, t.classe_actif, t.unite, t.variation, t.decimales, t.ordre, t.prioritaire, t.note_source,
         d.date, d.cloture, d.source_donnee, d.maj_le,
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
      select p.date, p.cloture, p.source_donnee, p.maj_le
        from public.prix_historique p where p.ticker_id = t.id order by p.date desc limit 1
    ) d
   where t.actif_bool
   order by t.ordre;
$$;
revoke all on function public.resume_marches() from public, anon;
grant execute on function public.resume_marches() to authenticated;

alter table public.prix_historique drop column if exists mm20, drop column if exists mm50;
