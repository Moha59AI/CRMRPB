/*
# Interconnexion finance, facturation et fournisseurs

Une ligne fournisseur peut être rapprochée d'une facture client à partir de la
référence vitrage Onify. Le rapprochement n'est jamais validé automatiquement :
les références uniques sont proposées avec une confiance élevée, les cas
ambigus restent visibles pour contrôle humain.

La vue de rentabilité devient ensuite le point de lecture commun pour Finance,
Marketing et Facturation : chiffre d'affaires, avoirs, encaissements, cadeaux
et achats fournisseurs restent traçables séparément.
*/

create table if not exists public.supplier_expense_allocations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  supplier_expense_id uuid not null references public.supplier_expenses(id) on delete cascade,
  supplier_item_index integer not null check (supplier_item_index >= 0),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  case_id uuid references public.windscreen_cases(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  amount_ht numeric(12,2) not null,
  match_method text not null default 'manual'
    check (match_method in ('manual', 'sku_reviewed')),
  confidence numeric(5,2) not null default 100
    check (confidence >= 0 and confidence <= 100),
  confirmed boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, supplier_expense_id, supplier_item_index)
);

create index if not exists supplier_expense_allocations_invoice_idx
  on public.supplier_expense_allocations (workspace_id, invoice_id);

create index if not exists supplier_expense_allocations_contact_idx
  on public.supplier_expense_allocations (workspace_id, contact_id);

alter table public.supplier_expense_allocations enable row level security;

create or replace function public.validate_supplier_expense_allocation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  expense_workspace uuid;
  invoice_workspace uuid;
  invoice_case uuid;
  invoice_contact uuid;
  authoritative_amount numeric(12,2);
begin
  select
    expense.workspace_id,
    nullif(expense.items -> new.supplier_item_index ->> 'amount_ht', '')::numeric
  into expense_workspace, authoritative_amount
  from public.supplier_expenses expense
  where expense.id = new.supplier_expense_id;

  if expense_workspace is null or expense_workspace <> new.workspace_id then
    raise exception 'La ligne fournisseur n’appartient pas à cet espace de travail';
  end if;
  if authoritative_amount is null then
    raise exception 'La ligne fournisseur sélectionnée ne contient aucun montant HT';
  end if;

  select invoice.workspace_id, invoice.case_id, invoice.contact_id
  into invoice_workspace, invoice_case, invoice_contact
  from public.invoices invoice
  where invoice.id = new.invoice_id;

  if invoice_workspace is null or invoice_workspace <> new.workspace_id then
    raise exception 'La facture client n’appartient pas à cet espace de travail';
  end if;

  new.amount_ht := authoritative_amount;
  new.case_id := invoice_case;
  new.contact_id := invoice_contact;
  return new;
end;
$$;

revoke all on function public.validate_supplier_expense_allocation() from public;

drop trigger if exists supplier_expense_allocations_validate on public.supplier_expense_allocations;
create trigger supplier_expense_allocations_validate
before insert or update on public.supplier_expense_allocations
for each row execute function public.validate_supplier_expense_allocation();

drop policy if exists "select_supplier_expense_allocations" on public.supplier_expense_allocations;
create policy "select_supplier_expense_allocations"
on public.supplier_expense_allocations for select to authenticated
using (
  workspace_id = public.get_workspace_id()
  and exists (
    select 1 from public.profiles profile
    where profile.id = auth.uid()
      and profile.role in ('admin', 'manager', 'accountant')
  )
);

drop policy if exists "write_supplier_expense_allocations" on public.supplier_expense_allocations;
create policy "write_supplier_expense_allocations"
on public.supplier_expense_allocations for all to authenticated
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

drop trigger if exists supplier_expense_allocations_updated_at on public.supplier_expense_allocations;
create trigger supplier_expense_allocations_updated_at
before update on public.supplier_expense_allocations
for each row execute function public.update_updated_at_column();

grant select, insert, update, delete on public.supplier_expense_allocations to authenticated;

drop view if exists public.v_supplier_match_candidates;
create view public.v_supplier_match_candidates
with (security_invoker = on) as
with supplier_lines as (
  select
    expense.workspace_id,
    expense.id as supplier_expense_id,
    (item.ordinality - 1)::integer as supplier_item_index,
    expense.supplier,
    expense.document_type,
    expense.document_number,
    expense.invoice_date as supplier_invoice_date,
    coalesce(nullif(item.value->>'delivery_date', '')::date, expense.invoice_date) as item_date,
    item.value->>'category' as category,
    item.value->>'sku' as sku,
    item.value->>'description' as supplier_description,
    coalesce(nullif(item.value->>'amount_ht', '')::numeric, 0) as supplier_amount_ht,
    upper(regexp_replace(coalesce(item.value->>'sku', ''), '[^A-Za-z0-9]', '', 'g')) as normalized_sku
  from public.supplier_expenses expense
  cross join lateral jsonb_array_elements(expense.items) with ordinality as item(value, ordinality)
  where coalesce(item.value->>'category', '') in ('Pare-brise', 'Autres vitrages')
    and length(upper(regexp_replace(coalesce(item.value->>'sku', ''), '[^A-Za-z0-9]', '', 'g'))) >= 6
    and coalesce(nullif(item.value->>'amount_ht', '')::numeric, 0) <> 0
),
invoice_lines as (
  select distinct
    invoice.workspace_id,
    invoice.id as invoice_id,
    invoice.invoice_number,
    invoice.issue_date::date as invoice_date,
    invoice.case_id,
    invoice.contact_id,
    contact.first_name,
    contact.last_name,
    invoice.amount_ht as invoice_amount_ht,
    upper(regexp_replace(coalesce(line.value->>'description', ''), '[^A-Za-z0-9]', '', 'g')) as normalized_description,
    upper(regexp_replace(coalesce(line.value->>'sku', ''), '[^A-Za-z0-9]', '', 'g')) as normalized_line_sku,
    upper(regexp_replace(coalesce(line.value->>'reference', ''), '[^A-Za-z0-9]', '', 'g')) as normalized_reference,
    upper(regexp_replace(coalesce(line.value->>'code', ''), '[^A-Za-z0-9]', '', 'g')) as normalized_code
  from public.invoices invoice
  left join public.contacts contact on contact.id = invoice.contact_id
  cross join lateral jsonb_array_elements(coalesce(invoice.onify_payload->'lines', '[]'::jsonb)) as line(value)
  where invoice.status <> 'cancelled'
),
candidate_pairs as (
  select distinct
    supplier_line.*,
    invoice_line.invoice_id,
    invoice_line.invoice_number,
    invoice_line.invoice_date,
    invoice_line.case_id,
    invoice_line.contact_id,
    trim(concat_ws(' ', invoice_line.first_name, invoice_line.last_name)) as customer_name,
    invoice_line.invoice_amount_ht,
    abs(invoice_line.invoice_date - supplier_line.item_date) as date_gap_days
  from supplier_lines supplier_line
  join invoice_lines invoice_line
    on invoice_line.workspace_id = supplier_line.workspace_id
   and supplier_line.normalized_sku in (
     invoice_line.normalized_description,
     invoice_line.normalized_line_sku,
     invoice_line.normalized_reference,
     invoice_line.normalized_code
   )
   and invoice_line.invoice_date between supplier_line.item_date - 15 and supplier_line.item_date + 120
  where not exists (
    select 1
    from public.supplier_expense_allocations allocation
    where allocation.workspace_id = supplier_line.workspace_id
      and allocation.supplier_expense_id = supplier_line.supplier_expense_id
      and allocation.supplier_item_index = supplier_line.supplier_item_index
  )
),
ranked as (
  select
    candidate_pairs.*,
    count(*) over (
      partition by workspace_id, supplier_expense_id, supplier_item_index
    )::integer as candidate_count,
    row_number() over (
      partition by workspace_id, supplier_expense_id, supplier_item_index
      order by date_gap_days asc, invoice_date asc, invoice_number asc
    )::integer as candidate_rank
  from candidate_pairs
)
select
  ranked.*,
  case
    when candidate_count = 1 and date_gap_days <= 45 then 100::numeric
    when candidate_count = 1 then 90::numeric
    when candidate_rank = 1 and date_gap_days <= 10 then 70::numeric
    else 55::numeric
  end as confidence
from ranked;

comment on view public.v_supplier_match_candidates is
  'Candidats de rapprochement fournisseur/facture par référence vitrage exacte et proximité de date.';

grant select on public.v_supplier_match_candidates to authenticated;

drop view if exists public.v_financial_invoice_profitability;
create view public.v_financial_invoice_profitability
with (security_invoker = on) as
with allocated as (
  select
    allocation.workspace_id,
    allocation.invoice_id,
    sum(allocation.amount_ht) filter (where allocation.confirmed) as supplier_cost_ht,
    count(*) filter (where allocation.confirmed)::integer as allocated_supplier_lines,
    min(allocation.confidence) filter (where allocation.confirmed) as minimum_confidence
  from public.supplier_expense_allocations allocation
  group by allocation.workspace_id, allocation.invoice_id
),
credits as (
  select
    credit.workspace_id,
    credit.invoice_id,
    sum(credit.amount_ttc) filter (
      where lower(coalesce(credit.status, '')) not like '%brouillon%'
        and lower(coalesce(credit.status, '')) not like '%draft%'
        and lower(coalesce(credit.status, '')) not like '%annul%'
        and lower(coalesce(credit.status, '')) not like '%cancel%'
    ) as credit_amount_ttc
  from public.onify_credit_notes credit
  where credit.invoice_id is not null
  group by credit.workspace_id, credit.invoice_id
),
payments as (
  select
    payment.workspace_id,
    payment.invoice_id,
    sum(payment.amount) as detailed_payments
  from public.payments payment
  where payment.invoice_id is not null
  group by payment.workspace_id, payment.invoice_id
)
select
  invoice.workspace_id,
  invoice.id as invoice_id,
  invoice.invoice_number,
  invoice.issue_date,
  invoice.status,
  invoice.case_id,
  invoice.contact_id,
  trim(concat_ws(' ', contact.first_name, contact.last_name)) as customer_name,
  invoice.amount_ht as billed_amount_ht,
  invoice.amount_ttc as billed_amount_ttc,
  coalesce(credits.credit_amount_ttc, 0) as credit_amount_ttc,
  round(
    coalesce(credits.credit_amount_ttc, 0) /
    nullif(1 + coalesce(invoice.tva_rate, 20) / 100, 0),
    2
  ) as credit_amount_ht,
  round(
    invoice.amount_ht - (
      coalesce(credits.credit_amount_ttc, 0) /
      nullif(1 + coalesce(invoice.tva_rate, 20) / 100, 0)
    ),
    2
  ) as net_revenue_ht,
  coalesce(allocated.supplier_cost_ht, 0) as supplier_cost_ht,
  coalesce(invoice.gift_amount, 0) as gift_cost,
  case
    when coalesce(allocated.allocated_supplier_lines, 0) > 0 then round(
      invoice.amount_ht
      - (coalesce(credits.credit_amount_ttc, 0) /
         nullif(1 + coalesce(invoice.tva_rate, 20) / 100, 0))
      - coalesce(allocated.supplier_cost_ht, 0)
      - coalesce(invoice.gift_amount, 0),
      2
    )
    else null
  end as actual_gross_margin_ht,
  coalesce(allocated.allocated_supplier_lines, 0) as allocated_supplier_lines,
  allocated.minimum_confidence,
  coalesce(payments.detailed_payments, invoice.amount_paid, 0) as collected_amount,
  coalesce(allocated.allocated_supplier_lines, 0) > 0 as supplier_cost_known
from public.invoices invoice
left join public.contacts contact on contact.id = invoice.contact_id
left join allocated
  on allocated.workspace_id = invoice.workspace_id
 and allocated.invoice_id = invoice.id
left join credits
  on credits.workspace_id = invoice.workspace_id
 and credits.invoice_id = invoice.id
left join payments
  on payments.workspace_id = invoice.workspace_id
 and payments.invoice_id = invoice.id;

comment on view public.v_financial_invoice_profitability is
  'Rentabilité par facture consolidant facturation, avoirs, paiements, cadeaux et achats fournisseurs validés.';

grant select on public.v_financial_invoice_profitability to authenticated;
