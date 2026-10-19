-- Biais intraday : un seul biais par séance, pour la séance de New York (9 h 30 - 16 h),
-- calculé à 9 h 05 (heure de New York), après les chiffres américains de 8 h 30. Les biais
-- Asie et Londres ne sont plus calculés ; la colonne `session` reste (valeur « new_york »).
create or replace function public.declencher_biais_auto()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ny timestamp := now() at time zone 'America/New_York';
begin
  if extract(hour from v_ny) <> 9 or extract(minute from v_ny) >= 30 or extract(isodow from v_ny) > 5 then
    return;
  end if;
  perform public.appeler_fonction('calcul-biais', '{"mode": "auto"}');
end;
$$;

update public.taches_planifiees
   set description = 'Biais intraday (séance de New York), calculé à 9 h 05 heure de New York',
       delai_alerte = interval '80 hours'
 where nom_tache = 'calcul-biais';
