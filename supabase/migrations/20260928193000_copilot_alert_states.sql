/*
# Etat personnel des alertes du copilote

Le radar recalcule ses alertes depuis les donnees metier. Cette table ne
modifie donc aucun lead, dossier ou paiement : elle retient seulement ce que
chaque utilisateur a traite, reporte ou juge non pertinent.
*/

create table if not exists public.copilot_alert_states (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  alert_key text not null check (char_length(alert_key) between 1 and 200),
  status text not null check (status in ('done', 'snoozed', 'dismissed')),
  hidden_until timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id, alert_key)
);

create index if not exists idx_copilot_alert_states_user_active
  on public.copilot_alert_states(workspace_id, user_id, hidden_until desc);

alter table public.copilot_alert_states enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'copilot_alert_states'
      and policyname = 'select_copilot_alert_states'
  ) then
    create policy "select_copilot_alert_states" on public.copilot_alert_states
      for select to authenticated
      using (
        workspace_id = public.get_workspace_id()
        and user_id = auth.uid()
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'copilot_alert_states'
      and policyname = 'insert_copilot_alert_states'
  ) then
    create policy "insert_copilot_alert_states" on public.copilot_alert_states
      for insert to authenticated
      with check (
        workspace_id = public.get_workspace_id()
        and user_id = auth.uid()
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'copilot_alert_states'
      and policyname = 'update_copilot_alert_states'
  ) then
    create policy "update_copilot_alert_states" on public.copilot_alert_states
      for update to authenticated
      using (
        workspace_id = public.get_workspace_id()
        and user_id = auth.uid()
      )
      with check (
        workspace_id = public.get_workspace_id()
        and user_id = auth.uid()
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'copilot_alert_states'
      and policyname = 'delete_copilot_alert_states'
  ) then
    create policy "delete_copilot_alert_states" on public.copilot_alert_states
      for delete to authenticated
      using (
        workspace_id = public.get_workspace_id()
        and user_id = auth.uid()
      );
  end if;
end
$$;

comment on table public.copilot_alert_states is
  'Preferences personnelles du centre d action. Ne modifie jamais les donnees metier.';
