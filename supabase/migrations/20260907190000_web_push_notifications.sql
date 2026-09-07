/*
# Notifications push multi-appareils

## Probleme resolu

La cloche temps reel ne fonctionnait que pendant que le CRM etait ouvert :
aucun abonnement Push API n'etait conserve et le service worker ne savait pas
recevoir un evenement `push`. Fermer le navigateur supprimait donc toute
possibilite d'alerte, sur ordinateur comme sur telephone.

Chaque navigateur conserve ici son propre abonnement. Le endpoint et ses cles
sont des capacites sensibles : la table est protegee par RLS et chaque
utilisateur ne peut voir et modifier que ses propres appareils.

Le trigger appelle l'Edge Function avec un secret aleatoire cree directement
dans Vault. Il n'apparait ni dans le SQL, ni dans le frontend, ni en clair dans
une table applicative. Une panne du push ne doit jamais annuler la notification
ni l'operation metier qui l'a creee.
*/

create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device_label text not null default 'Appareil',
  failure_count integer not null default 0 check (failure_count >= 0),
  last_success_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);
create index if not exists push_subscriptions_workspace_id_idx
  on public.push_subscriptions (workspace_id);

create or replace function public.increment_push_subscription_failure(subscription_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.push_subscriptions
  set failure_count = failure_count + 1, updated_at = now()
  where id = subscription_id;
$$;

revoke all on function public.increment_push_subscription_failure(uuid)
  from public, anon, authenticated;
grant execute on function public.increment_push_subscription_failure(uuid) to service_role;

-- Retourne le secret deja present ou cree celui propose sous verrou. Une
-- inscription simultanee du PC et du telephone ne peut donc jamais produire
-- deux paires VAPID incompatibles.
create or replace function public.vault_get_or_create_secret(
  secret_name text,
  proposed_secret text
)
returns text
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_secret text;
begin
  perform pg_advisory_xact_lock(hashtext(secret_name));
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = secret_name limit 1;

  if v_secret is null then
    perform vault.create_secret(proposed_secret, secret_name);
    v_secret := proposed_secret;
  end if;
  return v_secret;
end;
$$;

revoke all on function public.vault_get_or_create_secret(text, text)
  from public, anon, authenticated;
grant execute on function public.vault_get_or_create_secret(text, text) to service_role;

drop policy if exists "select_push_subscriptions" on public.push_subscriptions;
create policy "select_push_subscriptions" on public.push_subscriptions for select
  to authenticated using (
    user_id = auth.uid() and workspace_id = public.get_workspace_id()
  );

drop policy if exists "insert_push_subscriptions" on public.push_subscriptions;
create policy "insert_push_subscriptions" on public.push_subscriptions for insert
  to authenticated with check (
    user_id = auth.uid() and workspace_id = public.get_workspace_id()
  );

drop policy if exists "update_push_subscriptions" on public.push_subscriptions;
create policy "update_push_subscriptions" on public.push_subscriptions for update
  to authenticated using (
    user_id = auth.uid() and workspace_id = public.get_workspace_id()
  ) with check (
    user_id = auth.uid() and workspace_id = public.get_workspace_id()
  );

drop policy if exists "delete_push_subscriptions" on public.push_subscriptions;
create policy "delete_push_subscriptions" on public.push_subscriptions for delete
  to authenticated using (
    user_id = auth.uid() and workspace_id = public.get_workspace_id()
  );

-- Le secret d'authentification serveur-a-serveur est genere dans Vault. La
-- contrainte logique sur le nom est assuree ici pour ne pas le regenerer lors
-- d'une reapplication de la migration.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'push_dispatch_secret') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'push_dispatch_secret',
      'Authentifie le trigger notifications vers la fonction web-push'
    );
  end if;
end
$$;

create or replace function public.envoyer_notification_push()
returns trigger
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_project_url text;
  v_dispatch_secret text;
begin
  -- Une notification sans destinataire n'a pas de peripherique cible.
  if new.user_id is null then
    return new;
  end if;

  select decrypted_secret into v_project_url
  from vault.decrypted_secrets where name = 'project_url' limit 1;

  select decrypted_secret into v_dispatch_secret
  from vault.decrypted_secrets where name = 'push_dispatch_secret' limit 1;

  if v_project_url is null or v_dispatch_secret is null then
    raise warning 'Push non envoye : project_url ou push_dispatch_secret absent du Vault';
    return new;
  end if;

  perform net.http_post(
    url := rtrim(v_project_url, '/') || '/functions/v1/web-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', v_dispatch_secret
    ),
    body := jsonb_build_object(
      'action', 'dispatch',
      'notification_id', new.id
    ),
    timeout_milliseconds := 10000
  );

  return new;
exception
  when others then
    -- Une alerte est secondaire : elle ne doit jamais faire echouer la
    -- creation du lead, du document ou de la relance qui l'a declenchee.
    raise warning 'envoyer_notification_push a echoue pour %: %', new.id, sqlerrm;
    return new;
end;
$$;

drop trigger if exists notifications_envoyer_push on public.notifications;
create trigger notifications_envoyer_push
  after insert on public.notifications
  for each row execute function public.envoyer_notification_push();
