-- Une Edge Function par tâche : pg_cron appelle /functions/v1/<tache>.
create or replace function public.appeler_fonction(p_tache text, p_corps jsonb default '{}')
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_id bigint;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'url_projet';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'secret_fonctions';
  if v_url is null or v_secret is null then
    insert into public.logs_taches (nom_tache, statut, termine_le, message)
    values (p_tache, 'echec', now(), 'Secret Vault manquant (url_projet ou secret_fonctions).');
    return null;
  end if;

  select net.http_post(
    url := v_url || '/functions/v1/' || p_tache,
    body := p_corps,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-deepwater-secret', v_secret
    ),
    timeout_milliseconds := 150000
  ) into v_id;

  insert into public.appels_fonctions (request_id, nom_tache) values (v_id, p_tache);
  return v_id;
end;
$$;
revoke all on function public.appeler_fonction(text, jsonb) from public, anon, authenticated;
