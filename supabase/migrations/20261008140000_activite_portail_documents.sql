/*
  Historique d'activite du portail documentaire client.

  Seule une categorie d'appareil est conservee. L'adresse IP et le User-Agent
  complet ne sont jamais enregistres. Les evenements publics sont ecrits par
  l'Edge Function avec la service role ; le navigateur ne touche pas la table.
*/

create table if not exists client_document_activity (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  request_id uuid not null references client_document_requests(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  event_type text not null check (event_type in (
    'link_opened', 'upload_started', 'document_uploaded', 'request_completed'
  )),
  document_type text,
  device_type text not null default 'unknown' check (device_type in (
    'mobile', 'tablet', 'desktop', 'unknown'
  )),
  created_at timestamptz not null default now()
);

create index if not exists client_document_activity_request_idx
  on client_document_activity (request_id, created_at desc);
create index if not exists client_document_activity_lead_idx
  on client_document_activity (lead_id, created_at desc);

alter table client_document_activity enable row level security;

drop policy if exists "select_client_document_activity" on client_document_activity;
create policy "select_client_document_activity" on client_document_activity for select
  to authenticated using (
    workspace_id = (select p.workspace_id from profiles p where p.id = auth.uid())
    and exists (
      select 1 from profiles p where p.id = auth.uid()
      and p.role in ('admin', 'manager', 'advisor', 'accountant')
    )
  );

-- Rend visible l'unique derniere ouverture deja connue avant cette migration.
insert into client_document_activity (
  workspace_id, request_id, lead_id, event_type, device_type, created_at
)
select
  workspace_id, id, lead_id, 'link_opened', 'unknown', last_opened_at
from client_document_requests
where last_opened_at is not null
  and not exists (
    select 1 from client_document_activity a
    where a.request_id = client_document_requests.id
      and a.event_type = 'link_opened'
  );

