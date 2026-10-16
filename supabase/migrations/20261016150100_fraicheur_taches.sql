-- Fraîcheur d'une tâche pour les utilisateurs connectés : seule l'heure de la
-- dernière exécution réussie est exposée (le journal reste réservé à l'admin).
-- Sert d'indicateur « vérifié il y a » quand une collecte ne retient rien de neuf.
create or replace function public.derniere_reussite(p_tache text)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select max(termine_le) from public.logs_taches where nom_tache = p_tache and statut = 'succes';
$$;
revoke all on function public.derniere_reussite(text) from public, anon;
grant execute on function public.derniere_reussite(text) to authenticated;
