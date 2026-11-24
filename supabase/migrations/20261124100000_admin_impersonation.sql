/*
# Délégation administrateur (« voir comme »)

Un administrateur peut reproduire temporairement la vue d'un membre sans
connaître son mot de passe et sans ouvrir une seconde session Auth. L'identité
réelle reste donc `auth.uid()` : les colonnes `created_by`, les journaux et les
appels Edge continuent d'identifier l'administrateur qui agit.

Seuls le rôle applicatif et, pour le technicien, le périmètre des lignes sont
calculés avec l'utilisateur ciblé. La délégation expire après 60 minutes et
chaque début/fin est inscrit dans `audit_logs`.
*/

create table if not exists public.impersonation_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  target_role text not null check (
    target_role in ('admin', 'manager', 'advisor', 'technician', 'accountant')
  ),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  end_reason text,
  constraint impersonation_target_differs_from_actor
    check (actor_user_id <> target_user_id),
  constraint impersonation_expiry_after_start
    check (expires_at > started_at)
);

create index if not exists impersonation_sessions_actor_idx
  on public.impersonation_sessions(actor_user_id, started_at desc);

create unique index if not exists impersonation_sessions_one_open_per_actor
  on public.impersonation_sessions(actor_user_id)
  where ended_at is null;

alter table public.impersonation_sessions enable row level security;

-- Aucun accès direct : toutes les vérifications passent par les RPC
-- SECURITY DEFINER ci-dessous.
revoke all on table public.impersonation_sessions from public, anon, authenticated;


-- Identité métier effective. L'administrateur reste l'identité Auth réelle,
-- mais les politiques de rôle voient la cible tant que la délégation est
-- valide, dans le même espace, et que l'acteur est toujours administrateur.
create or replace function public.utilisateur_effectif()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (
      select session.target_user_id
      from public.impersonation_sessions session
      join public.profiles acteur
        on acteur.id = auth.uid()
       and acteur.role = 'admin'
       and acteur.workspace_id = session.workspace_id
      join public.profiles cible
        on cible.id = session.target_user_id
       and cible.workspace_id = session.workspace_id
      where session.actor_user_id = auth.uid()
        and session.ended_at is null
        and session.expires_at > now()
      order by session.started_at desc
      limit 1
    ),
    auth.uid()
  );
$$;

revoke all on function public.utilisateur_effectif() from public, anon;
grant execute on function public.utilisateur_effectif() to authenticated;

-- Toute la matrice RLS existante appelle mon_role()/a_role(). La remplacer à
-- cet endroit unique évite de dupliquer une règle fragile sur chaque table.
create or replace function public.mon_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role
  from public.profiles
  where id = public.utilisateur_effectif()
  limit 1;
$$;

revoke all on function public.mon_role() from public, anon;
grant execute on function public.mon_role() to authenticated;


create or replace function public.impersonation_active()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'session_id', session.id,
    'started_at', session.started_at,
    'expires_at', session.expires_at,
    'profile', to_jsonb(cible) || jsonb_build_object(
      'dans_zone_test', coalesce(espace.est_zone_test, false)
    )
  )
  from public.impersonation_sessions session
  join public.profiles acteur
    on acteur.id = auth.uid()
   and acteur.role = 'admin'
   and acteur.workspace_id = session.workspace_id
  join public.profiles cible
    on cible.id = session.target_user_id
   and cible.workspace_id = session.workspace_id
  join public.workspaces espace on espace.id = session.workspace_id
  where session.actor_user_id = auth.uid()
    and session.ended_at is null
    and session.expires_at > now()
  order by session.started_at desc
  limit 1;
$$;

revoke all on function public.impersonation_active() from public, anon;
grant execute on function public.impersonation_active() to authenticated;


create or replace function public.demarrer_impersonation(p_cible uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acteur public.profiles%rowtype;
  v_cible public.profiles%rowtype;
  v_session_id uuid;
begin
  select * into v_acteur
  from public.profiles
  where id = auth.uid();

  if v_acteur.id is null or v_acteur.role <> 'admin' then
    raise exception 'Seul un administrateur peut utiliser la delegation';
  end if;

  if p_cible = auth.uid() then
    raise exception 'Vous utilisez deja votre propre compte';
  end if;

  select * into v_cible
  from public.profiles
  where id = p_cible
    and workspace_id = v_acteur.workspace_id;

  if v_cible.id is null then
    raise exception 'Cet utilisateur ne fait pas partie de votre espace';
  end if;

  -- Une seule délégation ouverte. Une ligne expirée mais non fermée ne doit
  -- pas bloquer la suivante.
  update public.impersonation_sessions
  set ended_at = now(), end_reason = 'remplacee'
  where actor_user_id = auth.uid()
    and ended_at is null;

  insert into public.impersonation_sessions (
    workspace_id, actor_user_id, target_user_id, target_role, expires_at
  ) values (
    v_acteur.workspace_id, auth.uid(), v_cible.id, v_cible.role,
    now() + interval '60 minutes'
  )
  returning id into v_session_id;

  insert into public.audit_logs (
    workspace_id, user_id, action, entity_type, entity_id, metadata
  ) values (
    v_acteur.workspace_id,
    auth.uid(),
    'impersonation_started',
    'profile',
    v_cible.id::text,
    jsonb_build_object(
      'session_id', v_session_id,
      'target_user_id', v_cible.id,
      'target_role', v_cible.role,
      'expires_at', now() + interval '60 minutes'
    )
  );

  return public.impersonation_active();
end;
$$;

revoke all on function public.demarrer_impersonation(uuid) from public, anon;
grant execute on function public.demarrer_impersonation(uuid) to authenticated;


create or replace function public.terminer_impersonation()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acteur public.profiles%rowtype;
  v_session public.impersonation_sessions%rowtype;
begin
  select * into v_acteur
  from public.profiles
  where id = auth.uid();

  if v_acteur.id is null or v_acteur.role <> 'admin' then
    raise exception 'Seul un administrateur peut terminer une delegation';
  end if;

  select * into v_session
  from public.impersonation_sessions
  where actor_user_id = auth.uid()
    and ended_at is null
  order by started_at desc
  limit 1
  for update;

  if v_session.id is null then
    return false;
  end if;

  update public.impersonation_sessions
  set ended_at = now(), end_reason = 'manuelle'
  where id = v_session.id;

  insert into public.audit_logs (
    workspace_id, user_id, action, entity_type, entity_id, metadata
  ) values (
    v_session.workspace_id,
    auth.uid(),
    'impersonation_ended',
    'profile',
    v_session.target_user_id::text,
    jsonb_build_object(
      'session_id', v_session.id,
      'target_user_id', v_session.target_user_id,
      'target_role', v_session.target_role,
      'started_at', v_session.started_at,
      'ended_at', now()
    )
  );

  return true;
end;
$$;

revoke all on function public.terminer_impersonation() from public, anon;
grant execute on function public.terminer_impersonation() to authenticated;


-- ============ PÉRIMÈTRE DU TECHNICIEN DÉLÉGUÉ ============

create or replace function public.technicien_voit_lead(p_lead_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.windscreen_cases wc
    where wc.lead_id = p_lead_id
      and wc.workspace_id = public.get_workspace_id()
      and (
        wc.technician_id = public.utilisateur_effectif()
        or wc.assigned_user_id = public.utilisateur_effectif()
      )
  ) or exists (
    select 1 from public.appointments a
    where a.lead_id = p_lead_id
      and a.workspace_id = public.get_workspace_id()
  );
$$;

create or replace function public.technicien_voit_contact(p_contact_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.windscreen_cases wc
    where wc.contact_id = p_contact_id
      and wc.workspace_id = public.get_workspace_id()
      and (
        wc.technician_id = public.utilisateur_effectif()
        or wc.assigned_user_id = public.utilisateur_effectif()
      )
  ) or exists (
    select 1 from public.appointments a
    where a.contact_id = p_contact_id
      and a.workspace_id = public.get_workspace_id()
  );
$$;

drop policy if exists "technicien_update_appointments" on public.appointments;
create policy "technicien_update_appointments"
  on public.appointments for update to authenticated
  using (
    public.a_role(array['technician'])
    and assigned_user_id = public.utilisateur_effectif()
  )
  with check (
    public.a_role(array['technician'])
    and assigned_user_id = public.utilisateur_effectif()
  );

drop policy if exists "technicien_select_cases" on public.windscreen_cases;
create policy "technicien_select_cases"
  on public.windscreen_cases for select to authenticated
  using (
    public.a_role(array['technician'])
    and (
      technician_id = public.utilisateur_effectif()
      or assigned_user_id = public.utilisateur_effectif()
    )
  );

drop policy if exists "technicien_update_cases" on public.windscreen_cases;
create policy "technicien_update_cases"
  on public.windscreen_cases for update to authenticated
  using (
    public.a_role(array['technician'])
    and (
      technician_id = public.utilisateur_effectif()
      or assigned_user_id = public.utilisateur_effectif()
    )
  )
  with check (
    public.a_role(array['technician'])
    and (
      technician_id = public.utilisateur_effectif()
      or assigned_user_id = public.utilisateur_effectif()
    )
  );

drop policy if exists "technicien_select_tasks" on public.tasks;
create policy "technicien_select_tasks"
  on public.tasks for select to authenticated
  using (
    public.a_role(array['technician'])
    and assigned_user_id = public.utilisateur_effectif()
  );

drop policy if exists "technicien_update_tasks" on public.tasks;
create policy "technicien_update_tasks"
  on public.tasks for update to authenticated
  using (
    public.a_role(array['technician'])
    and assigned_user_id = public.utilisateur_effectif()
  )
  with check (
    public.a_role(array['technician'])
    and assigned_user_id = public.utilisateur_effectif()
  );

drop policy if exists "technicien_select_documents" on public.case_documents;
create policy "technicien_select_documents"
  on public.case_documents for select to authenticated
  using (
    public.a_role(array['technician'])
    and exists (
      select 1 from public.windscreen_cases wc
      where wc.id = case_documents.case_id
        and (
          wc.technician_id = public.utilisateur_effectif()
          or wc.assigned_user_id = public.utilisateur_effectif()
        )
    )
  );

-- Photos terrain : la migration historique existe déjà en production mais
-- utilise auth.uid(). En délégation technicien, la personne effective doit
-- pouvoir consulter, déposer et retirer exactement ses propres photos.
drop policy if exists select_intervention_photos on public.intervention_photos;
create policy select_intervention_photos
  on public.intervention_photos for select to authenticated
  using (
    workspace_id = public.get_workspace_id()
    and (
      public.a_role(array['admin', 'manager', 'advisor', 'accountant'])
      or exists (
        select 1 from public.appointments rendez_vous
        where rendez_vous.id = intervention_photos.appointment_id
          and rendez_vous.assigned_user_id = public.utilisateur_effectif()
      )
    )
  );

drop policy if exists insert_intervention_photos on public.intervention_photos;
create policy insert_intervention_photos
  on public.intervention_photos for insert to authenticated
  with check (
    workspace_id = public.get_workspace_id()
    and taken_by = public.utilisateur_effectif()
    and (
      public.a_role(array['admin', 'manager', 'advisor'])
      or exists (
        select 1 from public.appointments rendez_vous
        where rendez_vous.id = intervention_photos.appointment_id
          and rendez_vous.assigned_user_id = public.utilisateur_effectif()
      )
    )
  );

drop policy if exists delete_intervention_photos on public.intervention_photos;
create policy delete_intervention_photos
  on public.intervention_photos for delete to authenticated
  using (
    workspace_id = public.get_workspace_id()
    and (
      public.a_role(array['admin', 'manager'])
      or taken_by = public.utilisateur_effectif()
    )
  );

drop policy if exists deposer_intervention_photos on storage.objects;
create policy deposer_intervention_photos
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'intervention-photos'
    and (storage.foldername(name))[1] = public.get_workspace_id()::text
    and (
      public.a_role(array['admin', 'manager', 'advisor'])
      or exists (
        select 1 from public.appointments rendez_vous
        where rendez_vous.id::text = (storage.foldername(name))[2]
          and rendez_vous.assigned_user_id = public.utilisateur_effectif()
      )
    )
  );

drop policy if exists retirer_intervention_photos on storage.objects;
create policy retirer_intervention_photos
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'intervention-photos'
    and exists (
      select 1 from public.intervention_photos photo
      where photo.storage_path = storage.objects.name
        and (
          public.a_role(array['admin', 'manager'])
          or photo.taken_by = public.utilisateur_effectif()
        )
    )
  );


-- ============ DONNÉES PERSONNELLES DE LA VUE CIBLÉE ============

drop policy if exists "select_notifications" on public.notifications;
create policy "select_notifications"
  on public.notifications for select to authenticated
  using (
    workspace_id = public.get_workspace_id()
    and (
      user_id = public.utilisateur_effectif()
      -- Hors délégation, on conserve la lecture d'équipe déjà accordée à
      -- l'administrateur. En délégation, mon_role() vaut celui de la cible et
      -- seule sa cloche est visible.
      or (
        public.utilisateur_effectif() = auth.uid()
        and public.a_role(array['admin'])
      )
    )
  );

drop policy if exists "update_notifications" on public.notifications;
create policy "update_notifications"
  on public.notifications for update to authenticated
  using (user_id = public.utilisateur_effectif())
  with check (user_id = public.utilisateur_effectif());

create or replace function public.compter_notifications_non_lues()
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::integer
  from public.notifications
  where user_id = public.utilisateur_effectif()
    and not read;
$$;

create or replace function public.marquer_notifications_lues()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_nb integer;
begin
  update public.notifications
  set read = true
  where user_id = public.utilisateur_effectif()
    and not read;
  get diagnostics v_nb = row_count;
  return v_nb;
end;
$$;

drop policy if exists "select_copilot_alert_states" on public.copilot_alert_states;
create policy "select_copilot_alert_states"
  on public.copilot_alert_states for select to authenticated
  using (
    workspace_id = public.get_workspace_id()
    and user_id = public.utilisateur_effectif()
  );

drop policy if exists "insert_copilot_alert_states" on public.copilot_alert_states;
create policy "insert_copilot_alert_states"
  on public.copilot_alert_states for insert to authenticated
  with check (
    workspace_id = public.get_workspace_id()
    and user_id = public.utilisateur_effectif()
  );

drop policy if exists "update_copilot_alert_states" on public.copilot_alert_states;
create policy "update_copilot_alert_states"
  on public.copilot_alert_states for update to authenticated
  using (
    workspace_id = public.get_workspace_id()
    and user_id = public.utilisateur_effectif()
  )
  with check (
    workspace_id = public.get_workspace_id()
    and user_id = public.utilisateur_effectif()
  );

drop policy if exists "delete_copilot_alert_states" on public.copilot_alert_states;
create policy "delete_copilot_alert_states"
  on public.copilot_alert_states for delete to authenticated
  using (
    workspace_id = public.get_workspace_id()
    and user_id = public.utilisateur_effectif()
  );

-- Modifier son propre profil doit viser la personne simulée, tandis que les
-- journaux continuent volontairement de signer avec auth.uid() (l'acteur réel).
drop policy if exists "update_own_profile" on public.profiles;
create policy "update_own_profile"
  on public.profiles for update to authenticated
  using (id = public.utilisateur_effectif())
  with check (id = public.utilisateur_effectif());

comment on table public.impersonation_sessions is
  'Délégations administrateur temporaires. Accès uniquement par RPC audité.';
