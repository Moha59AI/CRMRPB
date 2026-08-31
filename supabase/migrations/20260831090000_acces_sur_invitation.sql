/*
# Accès sur invitation uniquement

## Ce qui était ouvert

`handle_new_user` rattachait **tout** compte créé dans `auth.users` au premier
workspace trouvé, et accordait `admin` au premier profil. La clé anon étant
publique par conception, n'importe qui pouvait appeler `auth.signUp` sur
l'API — sans jamais passer par l'interface — et se retrouver membre, voire
administrateur, de l'espace.

Retirer la page `/signup` côté React ne changeait rien à cela.

## Le principe retenu

Un compte authentifié n'est plus rien par lui-même. **Seul un profil donne
accès aux données**, et un profil n'est créé que si une invitation valide
existe pour cette adresse. Sans invitation, la personne peut s'authentifier
mais `get_workspace_id()` renvoie NULL : toutes les politiques RLS échouent et
elle ne voit rien. C'est un échec fermé, pas un accès dégradé.

Aucun rattachement automatique, aucun repli sur `admin`.

## Le tout premier administrateur

Il reste un chemin, et un seul : `initialiser_premier_admin`, qui refuse de
s'exécuter dès qu'un profil existe. Elle n'est accordée à personne — elle
s'appelle depuis le SQL Editor, donc avec les droits du propriétaire du
projet. C'est volontairement hors de portée de l'application.
*/

-- ============ INVITATIONS ============

create table if not exists invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'manager', 'advisor', 'technician', 'accountant')),
  invited_by uuid references auth.users(id) on delete set null,
  -- Une invitation qui traîne est une porte ouverte : elle expire.
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

alter table invitations enable row level security;

create index if not exists invitations_email_idx on invitations (lower(email));
create index if not exists invitations_workspace_idx on invitations (workspace_id);

-- Une seule invitation en attente par adresse et par espace.
create unique index if not exists invitations_en_attente_uniq
  on invitations (workspace_id, lower(email))
  where accepted_at is null;

-- Seuls les administrateurs de l'espace voient et gèrent les invitations :
-- la liste des personnes conviées et leurs rôles est une information sensible.
drop policy if exists "select_invitations" on invitations;
create policy "select_invitations" on invitations for select
  to authenticated using (
    exists (select 1 from profiles p
      where p.id = auth.uid() and p.role = 'admin'
        and p.workspace_id = invitations.workspace_id)
  );

drop policy if exists "insert_invitations" on invitations;
create policy "insert_invitations" on invitations for insert
  to authenticated with check (
    exists (select 1 from profiles p
      where p.id = auth.uid() and p.role = 'admin'
        and p.workspace_id = invitations.workspace_id)
  );

drop policy if exists "update_invitations" on invitations;
create policy "update_invitations" on invitations for update
  to authenticated using (
    exists (select 1 from profiles p
      where p.id = auth.uid() and p.role = 'admin'
        and p.workspace_id = invitations.workspace_id)
  ) with check (
    exists (select 1 from profiles p
      where p.id = auth.uid() and p.role = 'admin'
        and p.workspace_id = invitations.workspace_id)
  );

drop policy if exists "delete_invitations" on invitations;
create policy "delete_invitations" on invitations for delete
  to authenticated using (
    exists (select 1 from profiles p
      where p.id = auth.uid() and p.role = 'admin'
        and p.workspace_id = invitations.workspace_id)
  );


-- ============ CRÉATION DE PROFIL : SUR INVITATION SEULEMENT ============

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invit invitations%rowtype;
begin
  select * into v_invit
  from invitations
  where lower(email) = lower(new.email)
    and accepted_at is null
    and expires_at > now()
  order by created_at desc
  limit 1;

  -- Pas d'invitation : aucun profil. Le compte existe dans auth.users mais
  -- n'appartient a aucun espace, donc ne voit rien. C'est l'echec ferme.
  if not found then
    raise log 'Inscription sans invitation ignoree pour %', new.email;
    return new;
  end if;

  insert into public.profiles (id, workspace_id, first_name, last_name, role)
  values (
    new.id,
    v_invit.workspace_id,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    v_invit.role
  )
  on conflict (id) do nothing;

  update invitations set accepted_at = now() where id = v_invit.id;

  return new;
exception
  when others then
    -- Ne jamais faire echouer la creation du compte sur un probleme de profil.
    raise warning 'handle_new_user a echoue pour %: %', new.id, sqlerrm;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============ INVITER (réservé aux administrateurs) ============

create or replace function public.creer_invitation(p_email text, p_role text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws uuid;
  v_id uuid;
begin
  select workspace_id into v_ws from profiles
  where id = auth.uid() and role = 'admin';

  if v_ws is null then
    raise exception 'Seul un administrateur peut inviter';
  end if;

  if p_role not in ('admin', 'manager', 'advisor', 'technician', 'accountant') then
    raise exception 'Role inconnu : %', p_role;
  end if;

  if exists (select 1 from profiles p
             join auth.users u on u.id = p.id
             where lower(u.email) = lower(p_email) and p.workspace_id = v_ws) then
    raise exception 'Cette personne fait deja partie de l''espace';
  end if;

  -- Reinviter quelqu'un doit prolonger l'invitation en attente, pas en creer
  -- une seconde. Ecriture explicite plutot qu'un ON CONFLICT : l'inference sur
  -- un index partiel a expression est fragile.
  update invitations
  set role = p_role,
      expires_at = now() + interval '7 days',
      invited_by = auth.uid()
  where workspace_id = v_ws
    and lower(email) = lower(trim(p_email))
    and accepted_at is null
  returning id into v_id;

  if v_id is null then
    insert into invitations (workspace_id, email, role, invited_by)
    values (v_ws, lower(trim(p_email)), p_role, auth.uid())
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.creer_invitation(text, text) from public, anon;
grant execute on function public.creer_invitation(text, text) to authenticated;


-- ============ AMORÇAGE DU PREMIER ADMINISTRATEUR ============
-- Refuse de s'executer des qu'un profil existe. N'est accordee a personne :
-- elle s'appelle depuis le SQL Editor, avec les droits du proprietaire.

create or replace function public.initialiser_premier_admin(
  p_email text,
  p_nom_workspace text default 'Relais Pare-Brise'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_ws uuid;
begin
  if exists (select 1 from profiles) then
    raise exception 'Un profil existe deja : passez par une invitation';
  end if;

  select id into v_user from auth.users where lower(email) = lower(p_email);
  if v_user is null then
    raise exception 'Aucun compte pour %. Creez-le d''abord dans Authentication > Users.', p_email;
  end if;

  select id into v_ws from workspaces order by created_at limit 1;
  if v_ws is null then
    insert into workspaces (name, slug)
    values (p_nom_workspace, 'relais-pare-brise')
    returning id into v_ws;
  end if;

  insert into profiles (id, workspace_id, first_name, last_name, role)
  values (v_user, v_ws, '', '', 'admin');

  return v_ws;
end;
$$;

revoke all on function public.initialiser_premier_admin(text, text) from public, anon, authenticated;
