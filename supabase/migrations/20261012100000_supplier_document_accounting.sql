/*
# Lecture automatique des documents fournisseurs et comptabilite engagee

Un bon de livraison cree immediatement une depense provisoire afin que la
marge soit juste le jour de la commande. La facture finalise cette meme
depense : elle ne doit jamais etre additionnee une seconde fois. Les documents
originaux et chaque analyse restent traces separement.
*/

begin;

alter table public.supplier_expenses
  drop constraint if exists supplier_expenses_document_type_check;

alter table public.supplier_expenses
  add constraint supplier_expenses_document_type_check
  check (document_type in ('delivery_note', 'invoice', 'credit_note'));

alter table public.supplier_expenses
  add column if not exists accounting_status text not null default 'invoiced_unpaid',
  add column if not exists amount_basis text not null default 'final',
  add column if not exists payment_method text not null default 'unknown',
  add column if not exists payment_status text not null default 'unknown',
  add column if not exists delivery_note_number text,
  add column if not exists invoice_number text,
  add column if not exists order_number text,
  add column if not exists credit_note_numbers text[] not null default '{}'::text[],
  add column if not exists gross_amount_ht numeric(12,2),
  add column if not exists gross_vat_amount numeric(12,2),
  add column if not exists gross_amount_ttc numeric(12,2),
  add column if not exists credit_amount_ht numeric(12,2) not null default 0,
  add column if not exists credit_vat_amount numeric(12,2) not null default 0,
  add column if not exists credit_amount_ttc numeric(12,2) not null default 0,
  add column if not exists invoice_received_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists source_communication_id uuid references public.communications(id) on delete set null,
  add column if not exists source_attachment_id text,
  add column if not exists analysis_confidence numeric(5,2),
  add column if not exists needs_review boolean not null default false,
  add column if not exists document_review_required boolean not null default false,
  add column if not exists payment_confirmation_required boolean not null default false,
  add column if not exists lead_id uuid references public.leads(id) on delete set null,
  add column if not exists case_id uuid references public.windscreen_cases(id) on delete set null,
  add column if not exists contact_id uuid references public.contacts(id) on delete set null,
  add column if not exists customer_invoice_id uuid references public.invoices(id) on delete set null,
  add column if not exists analysis_metadata jsonb not null default '{}'::jsonb;

alter table public.supplier_expenses
  drop constraint if exists supplier_expenses_accounting_status_check;
alter table public.supplier_expenses
  add constraint supplier_expenses_accounting_status_check check (accounting_status in (
    'committed', 'card_to_confirm', 'paid_card_invoice_pending',
    'invoiced_unpaid', 'payment_scheduled', 'paid', 'credited', 'review_required'
  ));

alter table public.supplier_expenses
  drop constraint if exists supplier_expenses_amount_basis_check;
alter table public.supplier_expenses
  add constraint supplier_expenses_amount_basis_check
  check (amount_basis in ('provisional', 'final'));

alter table public.supplier_expenses
  drop constraint if exists supplier_expenses_payment_method_check;
alter table public.supplier_expenses
  add constraint supplier_expenses_payment_method_check check (payment_method in (
    'unknown', 'supplier_account', 'card', 'direct_debit', 'bank_transfer', 'other'
  ));

alter table public.supplier_expenses
  drop constraint if exists supplier_expenses_payment_status_check;
alter table public.supplier_expenses
  add constraint supplier_expenses_payment_status_check
  check (payment_status in ('unknown', 'unpaid', 'scheduled', 'paid', 'refunded'));

create unique index if not exists supplier_expenses_source_attachment_unique
  on public.supplier_expenses (workspace_id, source_communication_id, source_attachment_id)
  where source_communication_id is not null and source_attachment_id is not null;

create index if not exists supplier_expenses_delivery_note_idx
  on public.supplier_expenses (workspace_id, supplier, delivery_note_number)
  where delivery_note_number is not null;

create index if not exists supplier_expenses_invoice_number_idx
  on public.supplier_expenses (workspace_id, supplier, invoice_number)
  where invoice_number is not null;

alter table public.supplier_expense_allocations
  drop constraint if exists supplier_expense_allocations_match_method_check;
alter table public.supplier_expense_allocations
  add constraint supplier_expense_allocations_match_method_check
  check (match_method in ('manual', 'sku_reviewed', 'vehicle_auto'));

update public.supplier_expenses
set
  gross_amount_ht = coalesce(gross_amount_ht, amount_ht),
  gross_vat_amount = coalesce(gross_vat_amount, vat_amount),
  gross_amount_ttc = coalesce(gross_amount_ttc, amount_ttc),
  invoice_number = case when document_type = 'invoice' then coalesce(invoice_number, document_number) else invoice_number end,
  credit_note_numbers = case
    when document_type = 'credit_note' and not (document_number = any(credit_note_numbers))
      then array_append(credit_note_numbers, document_number)
    else credit_note_numbers
  end,
  accounting_status = case
    when document_type = 'credit_note' then 'credited'
    when document_type = 'invoice' and due_date is not null and due_date >= current_date
      then 'payment_scheduled'
    else accounting_status
  end,
  payment_method = case
    when lower(coalesce(expected_payment_method, '')) like '%carte%' then 'card'
    when lower(coalesce(expected_payment_method, '')) like '%lcr%'
      or lower(coalesce(expected_payment_method, '')) like '%prelev%' then 'direct_debit'
    when lower(coalesce(expected_payment_method, '')) like '%virement%' then 'bank_transfer'
    when expected_payment_method is not null then 'supplier_account'
    else payment_method
  end,
  payment_status = case
    when document_type = 'invoice' and due_date is not null and due_date >= current_date
      then 'scheduled'
    else payment_status
  end,
  document_review_required = needs_review;

create table if not exists public.supplier_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  supplier text not null,
  credit_limit_ttc numeric(12,2) check (credit_limit_ttc is null or credit_limit_ttc >= 0),
  warning_threshold numeric(5,2) not null default 80 check (warning_threshold between 0 and 100),
  payment_terms text not null default '30_eom',
  overflow_payment_method text not null default 'card'
    check (overflow_payment_method in ('card', 'bank_transfer', 'other')),
  auto_card_over_limit boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists supplier_accounts_workspace_supplier_unique
  on public.supplier_accounts (workspace_id, supplier);

alter table public.supplier_accounts enable row level security;

drop policy if exists "select_supplier_accounts" on public.supplier_accounts;
create policy "select_supplier_accounts"
on public.supplier_accounts for select to authenticated
using (
  workspace_id = public.get_workspace_id()
  and exists (
    select 1 from public.profiles profile
    where profile.id = auth.uid()
      and profile.role in ('admin', 'manager', 'accountant')
  )
);

drop policy if exists "write_supplier_accounts" on public.supplier_accounts;
create policy "write_supplier_accounts"
on public.supplier_accounts for all to authenticated
using (
  workspace_id = public.get_workspace_id()
  and exists (
    select 1 from public.profiles profile
    where profile.id = auth.uid()
      and profile.role in ('admin', 'accountant')
  )
)
with check (
  workspace_id = public.get_workspace_id()
  and exists (
    select 1 from public.profiles profile
    where profile.id = auth.uid()
      and profile.role in ('admin', 'accountant')
  )
);

drop trigger if exists supplier_accounts_updated_at on public.supplier_accounts;
create trigger supplier_accounts_updated_at
before update on public.supplier_accounts
for each row execute function public.update_updated_at_column();

grant select, insert, update, delete on public.supplier_accounts to authenticated;

create table if not exists public.supplier_document_analyses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  communication_id uuid not null references public.communications(id) on delete cascade,
  attachment_id text not null,
  storage_path text not null,
  filename text not null,
  file_sha256 text,
  supplier_expense_id uuid references public.supplier_expenses(id) on delete set null,
  linked_expense_ids uuid[] not null default '{}'::uuid[],
  status text not null default 'completed'
    check (status in ('completed', 'review_required', 'ignored', 'failed')),
  model text,
  document_type text not null
    check (document_type in ('delivery_note', 'invoice', 'credit_note', 'other')),
  supplier text,
  document_number text,
  document_date date,
  amount_ht numeric(12,2),
  vat_amount numeric(12,2),
  amount_ttc numeric(12,2),
  confidence numeric(5,2) check (confidence is null or confidence between 0 and 100),
  extracted_data jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(warnings) = 'array'),
  input_tokens integer,
  output_tokens integer,
  estimated_cost_usd numeric(12,6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, communication_id, attachment_id)
);

create index if not exists supplier_document_analyses_expense_idx
  on public.supplier_document_analyses (workspace_id, supplier_expense_id);

alter table public.supplier_document_analyses enable row level security;

drop policy if exists "select_supplier_document_analyses" on public.supplier_document_analyses;
create policy "select_supplier_document_analyses"
on public.supplier_document_analyses for select to authenticated
using (
  workspace_id = public.get_workspace_id()
  and exists (
    select 1 from public.profiles profile
    where profile.id = auth.uid()
      and profile.role in ('admin', 'manager', 'accountant')
  )
);

grant select on public.supplier_document_analyses to authenticated;

drop trigger if exists supplier_document_analyses_updated_at on public.supplier_document_analyses;
create trigger supplier_document_analyses_updated_at
before update on public.supplier_document_analyses
for each row execute function public.update_updated_at_column();

create table if not exists public.supplier_document_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  communication_id uuid not null references public.communications(id) on delete cascade,
  attachment_id text not null,
  storage_path text not null,
  filename text not null,
  content_type text,
  supplier_hint text,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'review_required', 'failed', 'ignored')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  analysis_id uuid references public.supplier_document_analyses(id) on delete set null,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, communication_id, attachment_id)
);

create index if not exists supplier_document_jobs_pending_idx
  on public.supplier_document_jobs (status, available_at, created_at)
  where status in ('pending', 'failed');

alter table public.supplier_document_jobs enable row level security;

drop policy if exists "select_supplier_document_jobs" on public.supplier_document_jobs;
create policy "select_supplier_document_jobs"
on public.supplier_document_jobs for select to authenticated
using (
  workspace_id = public.get_workspace_id()
  and exists (
    select 1 from public.profiles profile
    where profile.id = auth.uid()
      and profile.role in ('admin', 'manager', 'accountant')
  )
);

grant select on public.supplier_document_jobs to authenticated;

drop trigger if exists supplier_document_jobs_updated_at on public.supplier_document_jobs;
create trigger supplier_document_jobs_updated_at
before update on public.supplier_document_jobs
for each row execute function public.update_updated_at_column();

create or replace function public.confirm_supplier_expense_payment(p_expense_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_workspace_id uuid;
  v_role text;
  v_expense public.supplier_expenses%rowtype;
begin
  if v_user_id is null then
    raise exception 'NON_AUTHENTIFIE';
  end if;

  select profile.workspace_id, profile.role
    into v_workspace_id, v_role
  from public.profiles profile
  where profile.id = v_user_id;

  if v_workspace_id is null or v_role not in ('admin', 'accountant') then
    raise exception 'ACCES_REFUSE';
  end if;

  select * into v_expense
  from public.supplier_expenses expense
  where expense.id = p_expense_id
    and expense.workspace_id = v_workspace_id
  for update;

  if not found then
    raise exception 'DEPENSE_FOURNISSEUR_INTROUVABLE';
  end if;
  if v_expense.document_type = 'credit_note' then
    raise exception 'UN_AVOIR_NE_PEUT_PAS_ETRE_MARQUE_PAYE';
  end if;

  update public.supplier_expenses
  set
    payment_method = case when accounting_status = 'card_to_confirm' then 'card' else payment_method end,
    payment_status = 'paid',
    accounting_status = case
      when document_type = 'delivery_note' then 'paid_card_invoice_pending'
      else 'paid'
    end,
    paid_at = now(),
    payment_confirmation_required = false,
    needs_review = document_review_required,
    updated_at = now()
  where id = v_expense.id;

  insert into public.audit_logs (
    workspace_id, user_id, action, entity_type, entity_id, metadata
  ) values (
    v_workspace_id,
    v_user_id,
    'supplier_expense_payment_confirmed',
    'supplier_expense',
    v_expense.id::text,
    jsonb_build_object(
      'previous_payment_status', v_expense.payment_status,
      'previous_accounting_status', v_expense.accounting_status,
      'payment_method', case when v_expense.accounting_status = 'card_to_confirm' then 'card' else v_expense.payment_method end,
      'amount_ttc', v_expense.amount_ttc
    )
  );

  return v_expense.id;
end;
$$;

revoke all on function public.confirm_supplier_expense_payment(uuid) from public, anon;
grant execute on function public.confirm_supplier_expense_payment(uuid) to authenticated;

drop view if exists public.v_supplier_account_overview;
create view public.v_supplier_account_overview
with (security_invoker = on) as
with expense_totals as (
  select
    workspace_id,
    supplier,
    round(sum(case
      when document_type = 'credit_note' then amount_ttc
      when payment_method in ('supplier_account', 'direct_debit', 'unknown')
        and payment_status in ('unpaid', 'scheduled') then amount_ttc
      else 0
    end), 2) as outstanding_ttc,
    round(sum(case when payment_method = 'card' and payment_status = 'paid' then amount_ttc else 0 end), 2)
      as paid_card_ttc,
    count(*) filter (where amount_basis = 'provisional')::integer as provisional_documents,
    count(*) filter (where needs_review)::integer as review_documents
  from public.supplier_expenses
  group by workspace_id, supplier
), suppliers as (
  select workspace_id, supplier from public.supplier_accounts
  union
  select workspace_id, supplier from public.supplier_expenses
)
select
  suppliers.workspace_id,
  suppliers.supplier,
  account.id as account_id,
  account.credit_limit_ttc,
  account.warning_threshold,
  account.payment_terms,
  account.overflow_payment_method,
  account.auto_card_over_limit,
  coalesce(expense.outstanding_ttc, 0) as outstanding_ttc,
  coalesce(expense.paid_card_ttc, 0) as paid_card_ttc,
  coalesce(expense.provisional_documents, 0) as provisional_documents,
  coalesce(expense.review_documents, 0) as review_documents,
  case when account.credit_limit_ttc is null then null
    else greatest(round(account.credit_limit_ttc - coalesce(expense.outstanding_ttc, 0), 2), 0)
  end as remaining_credit_ttc,
  case when coalesce(account.credit_limit_ttc, 0) <= 0 then null
    else round(coalesce(expense.outstanding_ttc, 0) / account.credit_limit_ttc * 100, 2)
  end as usage_percent,
  case when account.credit_limit_ttc is null then false
    else coalesce(expense.outstanding_ttc, 0) >= account.credit_limit_ttc
  end as credit_limit_reached
from suppliers
left join public.supplier_accounts account
  on account.workspace_id = suppliers.workspace_id
 and lower(account.supplier) = lower(suppliers.supplier)
left join expense_totals expense
  on expense.workspace_id = suppliers.workspace_id
 and lower(expense.supplier) = lower(suppliers.supplier);

grant select on public.v_supplier_account_overview to authenticated;

insert into public.supplier_document_jobs (
  workspace_id, communication_id, attachment_id, storage_path,
  filename, content_type, supplier_hint
)
select
  communication.workspace_id,
  communication.id,
  attachment.value->>'id',
  attachment.value->>'storage_path',
  attachment.value->>'filename',
  attachment.value->>'content_type',
  case
    when lower(coalesce(communication.sender_email, '')) like '%@%vsf41.com' then 'VSF'
    when lower(coalesce(communication.sender_email, '')) like '%@%parebrisevsf.com' then 'VSF'
    when lower(coalesce(communication.sender_email, '')) like '%@%pilkington.com' then 'Pilkington'
    when lower(coalesce(communication.sender_email, '')) like '%@%nsg.com' then 'Pilkington'
    else null
  end
from public.communications communication
cross join lateral jsonb_array_elements(coalesce(communication.email_attachments, '[]'::jsonb)) attachment(value)
where communication.type = 'email_inbound'
  and communication.provider = 'ionos-imap'
  and communication.created_at >= now() - interval '90 days'
  and coalesce(attachment.value->>'storage_path', '') <> ''
  and coalesce(attachment.value->>'id', '') <> ''
  and (
    lower(coalesce(attachment.value->>'content_type', '')) = 'application/pdf'
    or lower(coalesce(attachment.value->>'filename', '')) like '%.pdf'
  )
  and (
    lower(coalesce(communication.sender_email, '')) like '%@%vsf41.com'
    or lower(coalesce(communication.sender_email, '')) like '%@%parebrisevsf.com'
    or lower(coalesce(communication.sender_email, '')) like '%@%pilkington.com'
    or lower(coalesce(communication.sender_email, '')) like '%@%nsg.com'
  )
on conflict (workspace_id, communication_id, attachment_id) do nothing;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'supplier-document-process'
  limit 1;
  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end $$;

select cron.schedule(
  'supplier-document-process',
  '*/2 * * * *',
  $cron$
  select net.http_post(
    url := (
      select decrypted_secret from vault.decrypted_secrets
      where name = 'project_url' limit 1
    ) || '/functions/v1/supplier-document-process',
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

commit;
