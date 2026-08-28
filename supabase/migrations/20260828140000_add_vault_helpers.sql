/*
# Fonctions d'acces au Vault

## Probleme resolu

Les Edge Functions Meta appellent trois RPC pour manipuler les secrets :

  - vault_create_secret(new_secret_name, new_secret)
  - vault_update_secret(secret_name, new_secret)
  - vault_read_secret(secret_name)

Aucune des trois n'existait en base : aucune migration ne les creait.
L'ecriture des secrets echouait donc silencieusement (meta-store-secrets
se contentait d'un console.error) et la lecture renvoyait toujours null.

Consequence : l'app secret et le page access token n'etaient jamais stockes,
la verification de signature Meta ne pouvait pas aboutir et l'appel a l'API
Graph n'avait aucun token. Aucun lead n'aurait jamais pu arriver, sans le
moindre message d'erreur cote interface.

## Securite

Ces fonctions sont SECURITY DEFINER : elles accedent au Vault, ce que
l'appelant ne peut pas faire directement. L'execution est donc revoquee pour
anon et authenticated, et accordee au seul service_role -- sans quoi
n'importe quel utilisateur connecte pourrait lire les secrets de l'atelier.
*/

create extension if not exists supabase_vault with schema vault;


-- ============ CREATION ============
create or replace function public.vault_create_secret(
  new_secret_name text,
  new_secret text
)
returns uuid
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_id uuid;
begin
  select vault.create_secret(new_secret, new_secret_name) into v_id;
  return v_id;
end;
$$;


-- ============ MISE A JOUR ============
-- Cree le secret s'il n'existe pas encore : meta-store-secrets appelle
-- update en repli quand create echoue, il faut que ce chemin aboutisse.
create or replace function public.vault_update_secret(
  secret_name text,
  new_secret text
)
returns uuid
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = secret_name limit 1;

  if v_id is null then
    select vault.create_secret(new_secret, secret_name) into v_id;
  else
    perform vault.update_secret(v_id, new_secret, secret_name);
  end if;

  return v_id;
end;
$$;


-- ============ LECTURE ============
create or replace function public.vault_read_secret(secret_name text)
returns text
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = secret_name
  limit 1;

  return v_secret;
end;
$$;


-- ============ PERMISSIONS ============
revoke all on function public.vault_create_secret(text, text) from public, anon, authenticated;
revoke all on function public.vault_update_secret(text, text) from public, anon, authenticated;
revoke all on function public.vault_read_secret(text) from public, anon, authenticated;

grant execute on function public.vault_create_secret(text, text) to service_role;
grant execute on function public.vault_update_secret(text, text) to service_role;
grant execute on function public.vault_read_secret(text) to service_role;
