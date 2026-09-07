/*
  Portail documentaire client.

  Le navigateur public ne lit jamais ces tables directement. Il presente un
  jeton aleatoire a l Edge Function, qui travaille avec la service role. Seul
  le condensat SHA-256 du jeton est conserve en base.
*/

create table if not exists client_document_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  case_id uuid references windscreen_cases(id) on delete set null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'open' check (status in ('open', 'complete', 'revoked', 'expired')),
  expires_at timestamptz not null default (now() + interval '30 days'),
  last_opened_at timestamptz,
  submitted_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_document_requests_workspace_idx
  on client_document_requests (workspace_id, created_at desc);
create index if not exists client_document_requests_lead_idx
  on client_document_requests (lead_id, created_at desc);

create table if not exists client_document_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  request_id uuid not null references client_document_requests(id) on delete cascade,
  document_type text not null check (document_type in (
    'registration', 'insurance_cert', 'photo_windscreen',
    'claim_declaration', 'driving_licence', 'identity'
  )),
  label text not null,
  required boolean not null default true,
  status text not null default 'requested' check (status in ('requested', 'uploaded', 'validated', 'rejected')),
  storage_path text,
  original_name text,
  mime_type text,
  size_bytes bigint check (size_bytes is null or (size_bytes >= 0 and size_bytes <= 12582912)),
  uploaded_at timestamptz,
  validated_at timestamptz,
  rejection_reason text,
  notification_email_sent_at timestamptz,
  notification_email_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, document_type)
);

create index if not exists client_document_items_workspace_idx
  on client_document_items (workspace_id, created_at desc);
create index if not exists client_document_items_request_idx
  on client_document_items (request_id, created_at);

alter table client_document_items
  add column if not exists notification_email_sent_at timestamptz,
  add column if not exists notification_email_error text;

alter table client_document_requests enable row level security;
alter table client_document_items enable row level security;

drop policy if exists "select_client_document_requests" on client_document_requests;
create policy "select_client_document_requests" on client_document_requests for select
  to authenticated using (
    workspace_id = (select p.workspace_id from profiles p where p.id = auth.uid())
    and exists (
      select 1 from profiles p where p.id = auth.uid()
      and p.role in ('admin', 'manager', 'advisor', 'accountant')
    )
  );
drop policy if exists "insert_client_document_requests" on client_document_requests;
create policy "insert_client_document_requests" on client_document_requests for insert
  to authenticated with check (
    workspace_id = (select p.workspace_id from profiles p where p.id = auth.uid())
    and exists (
      select 1 from profiles p where p.id = auth.uid()
      and p.role in ('admin', 'manager', 'advisor')
    )
  );
drop policy if exists "update_client_document_requests" on client_document_requests;
create policy "update_client_document_requests" on client_document_requests for update
  to authenticated using (
    workspace_id = (select p.workspace_id from profiles p where p.id = auth.uid())
    and exists (
      select 1 from profiles p where p.id = auth.uid()
      and p.role in ('admin', 'manager', 'advisor')
    )
  ) with check (
    workspace_id = (select p.workspace_id from profiles p where p.id = auth.uid())
    and exists (
      select 1 from profiles p where p.id = auth.uid()
      and p.role in ('admin', 'manager', 'advisor')
    )
  );
drop policy if exists "delete_client_document_requests" on client_document_requests;
create policy "delete_client_document_requests" on client_document_requests for delete
  to authenticated using (
    workspace_id = (select p.workspace_id from profiles p where p.id = auth.uid())
    and exists (
      select 1 from profiles p where p.id = auth.uid()
      and p.role in ('admin', 'manager')
    )
  );

drop policy if exists "select_client_document_items" on client_document_items;
create policy "select_client_document_items" on client_document_items for select
  to authenticated using (
    workspace_id = (select p.workspace_id from profiles p where p.id = auth.uid())
    and exists (
      select 1 from profiles p where p.id = auth.uid()
      and p.role in ('admin', 'manager', 'advisor', 'accountant')
    )
  );
drop policy if exists "insert_client_document_items" on client_document_items;
create policy "insert_client_document_items" on client_document_items for insert
  to authenticated with check (
    workspace_id = (select p.workspace_id from profiles p where p.id = auth.uid())
    and exists (
      select 1 from profiles p where p.id = auth.uid()
      and p.role in ('admin', 'manager', 'advisor')
    )
  );
drop policy if exists "update_client_document_items" on client_document_items;
create policy "update_client_document_items" on client_document_items for update
  to authenticated using (
    workspace_id = (select p.workspace_id from profiles p where p.id = auth.uid())
    and exists (
      select 1 from profiles p where p.id = auth.uid()
      and p.role in ('admin', 'manager', 'advisor')
    )
  ) with check (
    workspace_id = (select p.workspace_id from profiles p where p.id = auth.uid())
    and exists (
      select 1 from profiles p where p.id = auth.uid()
      and p.role in ('admin', 'manager', 'advisor')
    )
  );
drop policy if exists "delete_client_document_items" on client_document_items;
create policy "delete_client_document_items" on client_document_items for delete
  to authenticated using (
    workspace_id = (select p.workspace_id from profiles p where p.id = auth.uid())
    and exists (
      select 1 from profiles p where p.id = auth.uid()
      and p.role in ('admin', 'manager')
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'client-documents', 'client-documents', false, 12582912,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "staff_read_client_documents" on storage.objects;
create policy "staff_read_client_documents" on storage.objects for select
  to authenticated using (
    bucket_id = 'client-documents'
    and (storage.foldername(name))[1] = (
      select p.workspace_id::text from public.profiles p where p.id = auth.uid()
    )
    and exists (
      select 1 from public.profiles p where p.id = auth.uid()
      and p.role in ('admin', 'manager', 'advisor', 'accountant')
    )
  );

create or replace function create_client_document_request(p_lead_id uuid)
returns table (request_id uuid, access_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_workspace uuid;
  v_role text;
  v_case uuid;
  v_token text;
  v_request uuid;
  v_expires timestamptz := now() + interval '30 days';
begin
  select p.workspace_id, p.role into v_workspace, v_role
  from profiles p where p.id = auth.uid();

  if v_workspace is null or v_role not in ('admin', 'manager', 'advisor') then
    raise exception 'Acces refuse';
  end if;

  if not exists (select 1 from leads l where l.id = p_lead_id and l.workspace_id = v_workspace) then
    raise exception 'Lead introuvable';
  end if;

  select wc.id into v_case
  from windscreen_cases wc
  where wc.lead_id = p_lead_id and wc.workspace_id = v_workspace
  order by wc.created_at desc limit 1;

  update client_document_requests
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where lead_id = p_lead_id and workspace_id = v_workspace
    and status = 'open' and submitted_at is null;

  v_token := encode(gen_random_bytes(32), 'hex');

  insert into client_document_requests (
    workspace_id, lead_id, case_id, token_hash, expires_at
  ) values (
    v_workspace, p_lead_id, v_case,
    encode(digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex'), v_expires
  ) returning id into v_request;

  insert into client_document_items (
    workspace_id, request_id, document_type, label, required
  ) values
    (v_workspace, v_request, 'registration', 'Carte grise', true),
    (v_workspace, v_request, 'insurance_cert', 'Attestation d’assurance', true),
    (v_workspace, v_request, 'photo_windscreen', 'Photo du pare-brise', false),
    (v_workspace, v_request, 'claim_declaration', 'Déclaration de sinistre', false);

  return query select v_request, v_token, v_expires;
end;
$$;

revoke all on function create_client_document_request(uuid) from public;
grant execute on function create_client_document_request(uuid) to authenticated;

drop trigger if exists client_document_requests_updated_at on client_document_requests;
create trigger client_document_requests_updated_at before update on client_document_requests
for each row execute function update_updated_at_column();

drop trigger if exists client_document_items_updated_at on client_document_items;
create trigger client_document_items_updated_at before update on client_document_items
for each row execute function update_updated_at_column();
