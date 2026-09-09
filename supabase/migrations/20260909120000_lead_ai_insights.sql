/*
# Assistant IA des leads

L'analyse reste une suggestion horodatee. Elle ne modifie ni le lead ni les
notes d'origine, afin qu'un conseiller garde toujours la decision finale et
que chaque recommandation puisse etre relue avec ses sources.
*/

create table if not exists public.lead_ai_insights (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  model text not null,
  summary text not null,
  detected_information jsonb not null default '[]'::jsonb,
  next_action jsonb,
  warnings jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  source_notes_count integer not null default 0 check (source_notes_count >= 0),
  source_latest_note_at timestamptz,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  total_tokens integer check (total_tokens is null or total_tokens >= 0),
  estimated_cost_usd numeric(12, 6) check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_ai_insights_workspace
  on public.lead_ai_insights(workspace_id);
create index if not exists idx_lead_ai_insights_lead_created
  on public.lead_ai_insights(lead_id, created_at desc);

alter table public.lead_ai_insights enable row level security;

drop policy if exists "select_lead_ai_insights" on public.lead_ai_insights;
create policy "select_lead_ai_insights" on public.lead_ai_insights
  for select to authenticated
  using (
    workspace_id = public.get_workspace_id()
    and public.a_role(array['admin', 'manager', 'advisor'])
  );

drop policy if exists "insert_lead_ai_insights" on public.lead_ai_insights;
create policy "insert_lead_ai_insights" on public.lead_ai_insights
  for insert to authenticated
  with check (
    workspace_id = public.get_workspace_id()
    and requested_by = auth.uid()
    and public.a_role(array['admin', 'manager', 'advisor'])
  );

-- Une analyse est une trace : une nouvelle execution cree une nouvelle ligne.
drop policy if exists "update_lead_ai_insights" on public.lead_ai_insights;
create policy "update_lead_ai_insights" on public.lead_ai_insights
  for update to authenticated
  using (false)
  with check (false);

drop policy if exists "delete_lead_ai_insights" on public.lead_ai_insights;
create policy "delete_lead_ai_insights" on public.lead_ai_insights
  for delete to authenticated
  using (
    workspace_id = public.get_workspace_id()
    and public.a_role(array['admin'])
  );

comment on table public.lead_ai_insights is
  'Analyses IA immuables et sourcees. Aucune ligne ne pilote automatiquement le statut du lead.';
