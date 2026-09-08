/*
# Import Onify vers CRMRPB

Onify reste lisible pendant la transition mais n'est jamais modifie par le
nouveau CRM. Les identifiants externes rendent chaque import idempotent : une
relance actualise la ligne existante au lieu de creer un doublon.
*/

alter table public.integration_connections
  drop constraint if exists integration_connections_provider_check;
alter table public.integration_connections
  add constraint integration_connections_provider_check
  check (provider in ('meta', 'google', 'onify', 'custom'));

create unique index if not exists integration_connections_onify_unique
  on public.integration_connections (workspace_id, provider)
  where provider = 'onify';

alter table public.contacts
  add column if not exists onify_customer_id text,
  add column if not exists onify_external_id text,
  add column if not exists onify_source text,
  add column if not exists onify_stage text,
  add column if not exists onify_tags jsonb default '[]'::jsonb,
  add column if not exists onify_synced_at timestamptz;

create unique index if not exists contacts_onify_customer_unique
  on public.contacts (workspace_id, onify_customer_id);

alter table public.notes
  add column if not exists provider text,
  add column if not exists external_id text,
  add column if not exists onify_synced_at timestamptz;

create unique index if not exists notes_provider_external_unique
  on public.notes (workspace_id, provider, external_id);

alter table public.invoices
  add column if not exists onify_invoice_id text,
  add column if not exists onify_payload jsonb,
  add column if not exists onify_synced_at timestamptz;

create unique index if not exists invoices_onify_invoice_unique
  on public.invoices (workspace_id, onify_invoice_id);

alter table public.quotes
  add column if not exists onify_quote_id text,
  add column if not exists onify_payload jsonb,
  add column if not exists onify_synced_at timestamptz;

create unique index if not exists quotes_onify_quote_unique
  on public.quotes (workspace_id, onify_quote_id);

create unique index if not exists communications_provider_external_unique
  on public.communications (workspace_id, provider, external_id);

create table if not exists public.onify_credit_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  onify_credit_id text not null,
  credit_number text,
  invoice_number text,
  object text,
  status text,
  amount_ttc numeric(10,2) not null default 0,
  issue_date timestamptz,
  onify_payload jsonb,
  onify_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, onify_credit_id)
);

alter table public.onify_credit_notes enable row level security;
create index if not exists onify_credit_notes_workspace_idx
  on public.onify_credit_notes (workspace_id);
create index if not exists onify_credit_notes_contact_idx
  on public.onify_credit_notes (contact_id);
create index if not exists onify_credit_notes_invoice_idx
  on public.onify_credit_notes (invoice_id);

drop policy if exists "select_onify_credit_notes" on public.onify_credit_notes;
create policy "select_onify_credit_notes" on public.onify_credit_notes for select
  to authenticated using (
    workspace_id = (select p.workspace_id from public.profiles p where p.id = auth.uid())
  );

drop policy if exists "insert_onify_credit_notes" on public.onify_credit_notes;
create policy "insert_onify_credit_notes" on public.onify_credit_notes for insert
  to authenticated with check (
    workspace_id = (select p.workspace_id from public.profiles p where p.id = auth.uid())
  );

drop policy if exists "update_onify_credit_notes" on public.onify_credit_notes;
create policy "update_onify_credit_notes" on public.onify_credit_notes for update
  to authenticated using (
    workspace_id = (select p.workspace_id from public.profiles p where p.id = auth.uid())
  ) with check (
    workspace_id = (select p.workspace_id from public.profiles p where p.id = auth.uid())
  );

drop policy if exists "delete_onify_credit_notes" on public.onify_credit_notes;
create policy "delete_onify_credit_notes" on public.onify_credit_notes for delete
  to authenticated using (
    workspace_id = (select p.workspace_id from public.profiles p where p.id = auth.uid())
  );

comment on table public.onify_credit_notes is
  'Avoirs importes en lecture seule depuis Onify. Aucune ecriture CRM ne repart vers Onify.';

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job where jobname = 'onify-sync' limit 1;
  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end $$;

select cron.schedule(
  'onify-sync',
  '*/10 * * * *',
  $cron$
  select net.http_post(
    url := (
      select decrypted_secret from vault.decrypted_secrets
      where name = 'project_url' limit 1
    ) || '/functions/v1/onify-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'meta_queue_api_key' limit 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $cron$
);
