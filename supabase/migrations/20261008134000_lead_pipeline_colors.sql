create or replace function public.valid_lead_pipeline_colors(value jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select jsonb_typeof(value) = 'object'
    and value ?& array[
      'nouveau', 'nrp', 'qualifie', 'documents_requested',
      'documents_received', 'rdv', 'perdu', 'cloture'
    ]
    and not exists (
      select 1
      from jsonb_each_text(value) entry
      where entry.key not in (
        'nouveau', 'nrp', 'qualifie', 'documents_requested',
        'documents_received', 'rdv', 'perdu', 'cloture'
      )
      or entry.value !~ '^#[0-9A-Fa-f]{6}$'
    );
$$;

create table if not exists public.lead_pipeline_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  colors jsonb not null default '{
    "nouveau":"#38bdf8",
    "nrp":"#ef4444",
    "qualifie":"#f59e0b",
    "documents_requested":"#fb923c",
    "documents_received":"#10b981",
    "rdv":"#3b82f6",
    "perdu":"#64748b",
    "cloture":"#14b8a6"
  }'::jsonb check (public.valid_lead_pipeline_colors(colors)),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lead_pipeline_settings enable row level security;

drop policy if exists "select_lead_pipeline_settings" on public.lead_pipeline_settings;
create policy "select_lead_pipeline_settings"
on public.lead_pipeline_settings for select to authenticated
using (workspace_id = public.get_workspace_id());

drop policy if exists "insert_lead_pipeline_settings" on public.lead_pipeline_settings;
create policy "insert_lead_pipeline_settings"
on public.lead_pipeline_settings for insert to authenticated
with check (
  workspace_id = public.get_workspace_id()
  and exists (
    select 1 from public.profiles profile
    where profile.id = auth.uid() and profile.role in ('admin', 'manager')
  )
);

drop policy if exists "update_lead_pipeline_settings" on public.lead_pipeline_settings;
create policy "update_lead_pipeline_settings"
on public.lead_pipeline_settings for update to authenticated
using (
  workspace_id = public.get_workspace_id()
  and exists (
    select 1 from public.profiles profile
    where profile.id = auth.uid() and profile.role in ('admin', 'manager')
  )
)
with check (
  workspace_id = public.get_workspace_id()
  and exists (
    select 1 from public.profiles profile
    where profile.id = auth.uid() and profile.role in ('admin', 'manager')
  )
);

drop trigger if exists lead_pipeline_settings_updated_at on public.lead_pipeline_settings;
create trigger lead_pipeline_settings_updated_at
before update on public.lead_pipeline_settings
for each row execute function public.update_updated_at_column();

insert into public.lead_pipeline_settings (workspace_id)
select workspace.id from public.workspaces workspace
on conflict (workspace_id) do nothing;

create or replace function public.save_lead_pipeline_colors(p_colors jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace uuid;
  v_role text;
begin
  select profile.workspace_id, profile.role
  into v_workspace, v_role
  from public.profiles profile
  where profile.id = auth.uid();

  if v_workspace is null or v_role not in ('admin', 'manager') then
    raise exception 'Acces refuse';
  end if;

  if not public.valid_lead_pipeline_colors(p_colors) then
    raise exception 'Couleurs du pipeline invalides';
  end if;

  insert into public.lead_pipeline_settings (workspace_id, colors, updated_by)
  values (v_workspace, p_colors, auth.uid())
  on conflict (workspace_id) do update set
    colors = excluded.colors,
    updated_by = excluded.updated_by,
    updated_at = now();
end;
$$;

revoke all on function public.save_lead_pipeline_colors(jsonb) from public;
grant execute on function public.save_lead_pipeline_colors(jsonb) to authenticated;
