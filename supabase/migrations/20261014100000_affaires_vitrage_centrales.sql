/*
  Affaire vitrage centrale

  Un contact peut avoir plusieurs interventions. Chaque intervention possede
  donc une identite stable, conservee lorsqu'elle traverse les modules :

    Contact
      -> Leads avant Onify
      -> Glass des qu'un dossier Onify existe
      -> Agenda pour les rendez-vous
      -> Finance pour les factures et les couts

  Les anciennes cles lead_id, case_id et contact_id restent en place. La
  migration ajoute affaire_id sans detruire aucun rapprochement existant.
*/

begin;

create table if not exists public.affaires_vitrage (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.affaires_vitrage is
  'Identite stable d une intervention vitrage, partagee par Leads, Glass, Agenda et Finance.';
comment on column public.affaires_vitrage.contact_id is
  'Personne concernee. Un contact peut posseder plusieurs affaires vitrage.';

create index if not exists affaires_vitrage_workspace_idx
  on public.affaires_vitrage (workspace_id, updated_at desc);
create index if not exists affaires_vitrage_contact_idx
  on public.affaires_vitrage (workspace_id, contact_id, created_at desc);

alter table public.affaires_vitrage enable row level security;

drop policy if exists "select_affaires_vitrage" on public.affaires_vitrage;
create policy "select_affaires_vitrage"
on public.affaires_vitrage for select to authenticated
using (workspace_id = public.get_workspace_id());

drop policy if exists "insert_affaires_vitrage" on public.affaires_vitrage;
create policy "insert_affaires_vitrage"
on public.affaires_vitrage for insert to authenticated
with check (workspace_id = public.get_workspace_id());

drop policy if exists "update_affaires_vitrage" on public.affaires_vitrage;
create policy "update_affaires_vitrage"
on public.affaires_vitrage for update to authenticated
using (workspace_id = public.get_workspace_id())
with check (workspace_id = public.get_workspace_id());

drop policy if exists "delete_affaires_vitrage" on public.affaires_vitrage;
create policy "delete_affaires_vitrage"
on public.affaires_vitrage for delete to authenticated
using (workspace_id = public.get_workspace_id());

grant select, insert, update, delete on public.affaires_vitrage to authenticated;

drop trigger if exists affaires_vitrage_updated_at on public.affaires_vitrage;
create trigger affaires_vitrage_updated_at
before update on public.affaires_vitrage
for each row execute function public.update_updated_at_column();

alter table public.leads
  add column if not exists affaire_id uuid references public.affaires_vitrage(id) on delete restrict;
alter table public.windscreen_cases
  add column if not exists affaire_id uuid references public.affaires_vitrage(id) on delete restrict;
alter table public.appointments
  add column if not exists affaire_id uuid references public.affaires_vitrage(id) on delete set null;
alter table public.quotes
  add column if not exists affaire_id uuid references public.affaires_vitrage(id) on delete set null;
alter table public.invoices
  add column if not exists affaire_id uuid references public.affaires_vitrage(id) on delete set null;
alter table public.supplier_expenses
  add column if not exists affaire_id uuid references public.affaires_vitrage(id) on delete set null;
alter table public.supplier_expense_allocations
  add column if not exists affaire_id uuid references public.affaires_vitrage(id) on delete set null;

comment on column public.leads.affaire_id is
  'Affaire vitrage avant sa creation dans Onify.';
comment on column public.windscreen_cases.affaire_id is
  'Meme affaire que le lead d origine, ou affaire propre au dossier Glass historique.';
comment on column public.appointments.affaire_id is
  'Affaire resolue depuis case_id, lead_id, puis le contact lorsqu il est non ambigu.';
comment on column public.invoices.affaire_id is
  'Affaire dont cette facture constitue le chiffre d affaires.';
comment on column public.supplier_expenses.affaire_id is
  'Affaire supportant le cout fournisseur, du BL provisoire a la facture finale.';

create index if not exists leads_affaire_idx
  on public.leads (workspace_id, affaire_id);
create index if not exists windscreen_cases_affaire_idx
  on public.windscreen_cases (workspace_id, affaire_id);
create index if not exists appointments_affaire_idx
  on public.appointments (workspace_id, affaire_id, start_time desc);
create index if not exists quotes_affaire_idx
  on public.quotes (workspace_id, affaire_id);
create index if not exists invoices_affaire_idx
  on public.invoices (workspace_id, affaire_id, issue_date desc);
create index if not exists supplier_expenses_affaire_idx
  on public.supplier_expenses (workspace_id, affaire_id, invoice_date desc);
create index if not exists supplier_expense_allocations_affaire_idx
  on public.supplier_expense_allocations (workspace_id, affaire_id);

/* Priorite de resolution : dossier Glass, lead, facture client, puis contact
   seulement s'il ne possede qu'une affaire. Aucun choix arbitraire n'est fait. */
create or replace function public.resoudre_affaire_vitrage(
  p_workspace_id uuid,
  p_case_id uuid default null,
  p_lead_id uuid default null,
  p_contact_id uuid default null,
  p_invoice_id uuid default null
)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_affaire_id uuid;
  v_nombre integer;
begin
  if p_case_id is not null then
    select dossier.affaire_id into v_affaire_id
    from public.windscreen_cases dossier
    where dossier.id = p_case_id
      and dossier.workspace_id = p_workspace_id;
    if v_affaire_id is not null then return v_affaire_id; end if;
  end if;

  if p_lead_id is not null then
    select lead.affaire_id into v_affaire_id
    from public.leads lead
    where lead.id = p_lead_id
      and lead.workspace_id = p_workspace_id;
    if v_affaire_id is not null then return v_affaire_id; end if;
  end if;

  if p_invoice_id is not null then
    select facture.affaire_id into v_affaire_id
    from public.invoices facture
    where facture.id = p_invoice_id
      and facture.workspace_id = p_workspace_id;
    if v_affaire_id is not null then return v_affaire_id; end if;
  end if;

  if p_contact_id is not null then
    select count(*)::integer,
           (array_agg(affaire.id order by affaire.created_at desc))[1]
      into v_nombre, v_affaire_id
    from public.affaires_vitrage affaire
    where affaire.workspace_id = p_workspace_id
      and affaire.contact_id = p_contact_id;
    if v_nombre = 1 then return v_affaire_id; end if;
  end if;

  return null;
end;
$$;

revoke all on function public.resoudre_affaire_vitrage(uuid, uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.resoudre_affaire_vitrage(uuid, uuid, uuid, uuid, uuid)
  to service_role;

/* Reprise idempotente et propagation. Cette fonction sert aussi apres chaque
   synchronisation Onify afin de raccorder les anciennes lignes importees. */
create or replace function public.synchroniser_affaires_vitrage(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.affaires_vitrage (
    id, workspace_id, contact_id, created_at, updated_at
  )
  select lead.id,
         lead.workspace_id,
         lead.contact_id,
         coalesce(lead.received_at, lead.created_at, now()),
         coalesce(lead.updated_at, now())
  from public.leads lead
  where lead.workspace_id = p_workspace_id
  on conflict (id) do update set
    contact_id = coalesce(excluded.contact_id, public.affaires_vitrage.contact_id),
    updated_at = greatest(public.affaires_vitrage.updated_at, excluded.updated_at)
  where public.affaires_vitrage.workspace_id = excluded.workspace_id;

  if exists (
    select 1
    from public.leads lead
    join public.affaires_vitrage affaire on affaire.id = lead.id
    where lead.workspace_id = p_workspace_id
      and affaire.workspace_id <> lead.workspace_id
  ) then
    raise exception 'Conflit d espace de travail lors de la reprise des affaires Leads';
  end if;

  update public.leads lead
     set affaire_id = lead.id
   where lead.workspace_id = p_workspace_id
     and lead.affaire_id is distinct from lead.id;

  -- Un dossier deja rattache reprend toujours l'affaire du lead d'origine.
  update public.windscreen_cases dossier
     set affaire_id = lead.affaire_id,
         contact_id = coalesce(dossier.contact_id, lead.contact_id),
         updated_at = now()
    from public.leads lead
   where dossier.workspace_id = p_workspace_id
     and lead.workspace_id = dossier.workspace_id
     and lead.id = dossier.lead_id
     and lead.affaire_id is not null
     and dossier.affaire_id is distinct from lead.affaire_id;

  -- Les dossiers Glass historiques sans lead ne fabriquent pas de faux lead.
  -- Ils obtiennent simplement leur propre affaire, avec le contact connu.
  insert into public.affaires_vitrage (
    id, workspace_id, contact_id, created_at, updated_at
  )
  select dossier.id,
         dossier.workspace_id,
         dossier.contact_id,
         coalesce(dossier.onify_created_at, dossier.created_at, now()),
         coalesce(dossier.updated_at, now())
  from public.windscreen_cases dossier
  where dossier.workspace_id = p_workspace_id
    and dossier.affaire_id is null
  on conflict (id) do update set
    contact_id = coalesce(excluded.contact_id, public.affaires_vitrage.contact_id),
    updated_at = greatest(public.affaires_vitrage.updated_at, excluded.updated_at)
  where public.affaires_vitrage.workspace_id = excluded.workspace_id;

  update public.windscreen_cases dossier
     set affaire_id = dossier.id
   where dossier.workspace_id = p_workspace_id
     and dossier.affaire_id is null;

  update public.affaires_vitrage affaire
     set contact_id = lead.contact_id,
         updated_at = greatest(affaire.updated_at, coalesce(lead.updated_at, now()))
    from public.leads lead
   where lead.workspace_id = p_workspace_id
     and lead.affaire_id = affaire.id
     and lead.contact_id is not null
     and affaire.contact_id is distinct from lead.contact_id;

  update public.affaires_vitrage affaire
     set contact_id = dossier.contact_id,
         updated_at = greatest(affaire.updated_at, coalesce(dossier.updated_at, now()))
    from public.windscreen_cases dossier
   where dossier.workspace_id = p_workspace_id
     and dossier.affaire_id = affaire.id
     and dossier.contact_id is not null
     and affaire.contact_id is null;

  update public.appointments rendez_vous
     set affaire_id = public.resoudre_affaire_vitrage(
       rendez_vous.workspace_id,
       rendez_vous.case_id,
       rendez_vous.lead_id,
       rendez_vous.contact_id,
       null
     )
   where rendez_vous.workspace_id = p_workspace_id
     and public.resoudre_affaire_vitrage(
       rendez_vous.workspace_id,
       rendez_vous.case_id,
       rendez_vous.lead_id,
       rendez_vous.contact_id,
       null
     ) is not null
     and rendez_vous.affaire_id is distinct from public.resoudre_affaire_vitrage(
       rendez_vous.workspace_id,
       rendez_vous.case_id,
       rendez_vous.lead_id,
       rendez_vous.contact_id,
       null
     );

  update public.quotes devis
     set affaire_id = public.resoudre_affaire_vitrage(
       devis.workspace_id, devis.case_id, null, devis.contact_id, null
     )
   where devis.workspace_id = p_workspace_id
     and public.resoudre_affaire_vitrage(
       devis.workspace_id, devis.case_id, null, devis.contact_id, null
     ) is not null
     and devis.affaire_id is distinct from public.resoudre_affaire_vitrage(
       devis.workspace_id, devis.case_id, null, devis.contact_id, null
     );

  update public.invoices facture
     set affaire_id = public.resoudre_affaire_vitrage(
       facture.workspace_id, facture.case_id, null, facture.contact_id, null
     )
   where facture.workspace_id = p_workspace_id
     and public.resoudre_affaire_vitrage(
       facture.workspace_id, facture.case_id, null, facture.contact_id, null
     ) is not null
     and facture.affaire_id is distinct from public.resoudre_affaire_vitrage(
       facture.workspace_id, facture.case_id, null, facture.contact_id, null
     );

  update public.supplier_expenses depense
     set affaire_id = public.resoudre_affaire_vitrage(
       depense.workspace_id,
       depense.case_id,
       depense.lead_id,
       depense.contact_id,
       depense.customer_invoice_id
     )
   where depense.workspace_id = p_workspace_id
     and public.resoudre_affaire_vitrage(
       depense.workspace_id,
       depense.case_id,
       depense.lead_id,
       depense.contact_id,
       depense.customer_invoice_id
     ) is not null
     and depense.affaire_id is distinct from public.resoudre_affaire_vitrage(
       depense.workspace_id,
       depense.case_id,
       depense.lead_id,
       depense.contact_id,
       depense.customer_invoice_id
     );

  update public.supplier_expense_allocations ventilation
     set affaire_id = public.resoudre_affaire_vitrage(
       ventilation.workspace_id,
       ventilation.case_id,
       null,
       ventilation.contact_id,
       ventilation.invoice_id
     )
   where ventilation.workspace_id = p_workspace_id
     and public.resoudre_affaire_vitrage(
       ventilation.workspace_id,
       ventilation.case_id,
       null,
       ventilation.contact_id,
       ventilation.invoice_id
     ) is not null
     and ventilation.affaire_id is distinct from public.resoudre_affaire_vitrage(
       ventilation.workspace_id,
       ventilation.case_id,
       null,
       ventilation.contact_id,
       ventilation.invoice_id
     );

  delete from public.affaires_vitrage affaire
   where affaire.workspace_id = p_workspace_id
     and not exists (select 1 from public.leads lead where lead.affaire_id = affaire.id)
     and not exists (select 1 from public.windscreen_cases dossier where dossier.affaire_id = affaire.id)
     and not exists (select 1 from public.appointments rendez_vous where rendez_vous.affaire_id = affaire.id)
     and not exists (select 1 from public.quotes devis where devis.affaire_id = affaire.id)
     and not exists (select 1 from public.invoices facture where facture.affaire_id = affaire.id)
     and not exists (select 1 from public.supplier_expenses depense where depense.affaire_id = affaire.id)
     and not exists (
       select 1 from public.supplier_expense_allocations ventilation
       where ventilation.affaire_id = affaire.id
     );

  return jsonb_build_object(
    'affaires', (
      select count(*) from public.affaires_vitrage affaire
      where affaire.workspace_id = p_workspace_id
    ),
    'leads', (
      select count(*) from public.leads lead
      where lead.workspace_id = p_workspace_id and lead.affaire_id is not null
    ),
    'glass', (
      select count(*) from public.windscreen_cases dossier
      where dossier.workspace_id = p_workspace_id and dossier.affaire_id is not null
    ),
    'appointments', (
      select count(*) from public.appointments rendez_vous
      where rendez_vous.workspace_id = p_workspace_id and rendez_vous.affaire_id is not null
    ),
    'invoices', (
      select count(*) from public.invoices facture
      where facture.workspace_id = p_workspace_id and facture.affaire_id is not null
    ),
    'supplier_expenses', (
      select count(*) from public.supplier_expenses depense
      where depense.workspace_id = p_workspace_id and depense.affaire_id is not null
    )
  );
end;
$$;

revoke all on function public.synchroniser_affaires_vitrage(uuid)
  from public, anon, authenticated;
grant execute on function public.synchroniser_affaires_vitrage(uuid)
  to service_role;

do $$
declare
  workspace record;
begin
  for workspace in select id from public.workspaces loop
    perform public.synchroniser_affaires_vitrage(workspace.id);
  end loop;
end $$;

-- Tout lead et tout dossier vitrage possede desormais une affaire stable.
alter table public.leads alter column affaire_id set not null;
alter table public.windscreen_cases alter column affaire_id set not null;

create or replace function public.preparer_affaire_vitrage_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  if new.id is null then new.id := gen_random_uuid(); end if;
  if new.affaire_id is null then new.affaire_id := new.id; end if;

  select affaire.workspace_id into v_workspace_id
  from public.affaires_vitrage affaire
  where affaire.id = new.affaire_id;

  if v_workspace_id is null then
    insert into public.affaires_vitrage (
      id, workspace_id, contact_id, created_at, updated_at
    ) values (
      new.affaire_id,
      new.workspace_id,
      new.contact_id,
      coalesce(new.received_at, new.created_at, now()),
      coalesce(new.updated_at, now())
    );
  elsif v_workspace_id <> new.workspace_id then
    raise exception 'L affaire vitrage et le lead appartiennent a deux espaces differents';
  end if;

  update public.affaires_vitrage affaire
     set contact_id = coalesce(new.contact_id, affaire.contact_id),
         updated_at = greatest(affaire.updated_at, coalesce(new.updated_at, now()))
   where affaire.id = new.affaire_id;

  return new;
end;
$$;

create or replace function public.preparer_affaire_vitrage_dossier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affaire_id uuid;
  v_workspace_id uuid;
begin
  if new.id is null then new.id := gen_random_uuid(); end if;

  if new.lead_id is not null then
    select lead.affaire_id into v_affaire_id
    from public.leads lead
    where lead.id = new.lead_id
      and lead.workspace_id = new.workspace_id;
  end if;

  new.affaire_id := coalesce(v_affaire_id, new.affaire_id, new.id);

  select affaire.workspace_id into v_workspace_id
  from public.affaires_vitrage affaire
  where affaire.id = new.affaire_id;

  if v_workspace_id is null then
    insert into public.affaires_vitrage (
      id, workspace_id, contact_id, created_at, updated_at
    ) values (
      new.affaire_id,
      new.workspace_id,
      new.contact_id,
      coalesce(new.onify_created_at, new.created_at, now()),
      coalesce(new.updated_at, now())
    );
  elsif v_workspace_id <> new.workspace_id then
    raise exception 'L affaire vitrage et le dossier Glass appartiennent a deux espaces differents';
  end if;

  update public.affaires_vitrage affaire
     set contact_id = coalesce(new.contact_id, affaire.contact_id),
         updated_at = greatest(affaire.updated_at, coalesce(new.updated_at, now()))
   where affaire.id = new.affaire_id;

  return new;
end;
$$;

create or replace function public.preparer_affaire_vitrage_dependance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affaire_id uuid;
  v_workspace_id uuid;
begin
  if tg_table_name = 'appointments' then
    v_affaire_id := public.resoudre_affaire_vitrage(
      new.workspace_id, new.case_id, new.lead_id, new.contact_id, null
    );
  elsif tg_table_name = 'quotes' then
    v_affaire_id := public.resoudre_affaire_vitrage(
      new.workspace_id, new.case_id, null, new.contact_id, null
    );
  elsif tg_table_name = 'invoices' then
    v_affaire_id := public.resoudre_affaire_vitrage(
      new.workspace_id, new.case_id, null, new.contact_id, null
    );
  elsif tg_table_name = 'supplier_expenses' then
    v_affaire_id := public.resoudre_affaire_vitrage(
      new.workspace_id,
      new.case_id,
      new.lead_id,
      new.contact_id,
      new.customer_invoice_id
    );
  elsif tg_table_name = 'supplier_expense_allocations' then
    v_affaire_id := public.resoudre_affaire_vitrage(
      new.workspace_id, new.case_id, null, new.contact_id, new.invoice_id
    );
  end if;

  new.affaire_id := coalesce(v_affaire_id, new.affaire_id);
  if new.affaire_id is null then return new; end if;

  select affaire.workspace_id into v_workspace_id
  from public.affaires_vitrage affaire
  where affaire.id = new.affaire_id;

  if v_workspace_id is null then
    raise exception 'Affaire vitrage introuvable';
  elsif v_workspace_id <> new.workspace_id then
    raise exception 'L affaire vitrage et la donnee rattachee appartiennent a deux espaces differents';
  end if;

  return new;
end;
$$;

create or replace function public.nettoyer_ancienne_affaire_vitrage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.affaire_id is null or old.affaire_id is not distinct from new.affaire_id then
    return new;
  end if;

  delete from public.affaires_vitrage affaire
   where affaire.id = old.affaire_id
     and not exists (select 1 from public.leads lead where lead.affaire_id = affaire.id)
     and not exists (select 1 from public.windscreen_cases dossier where dossier.affaire_id = affaire.id)
     and not exists (select 1 from public.appointments rendez_vous where rendez_vous.affaire_id = affaire.id)
     and not exists (select 1 from public.quotes devis where devis.affaire_id = affaire.id)
     and not exists (select 1 from public.invoices facture where facture.affaire_id = affaire.id)
     and not exists (select 1 from public.supplier_expenses depense where depense.affaire_id = affaire.id)
     and not exists (
       select 1 from public.supplier_expense_allocations ventilation
       where ventilation.affaire_id = affaire.id
     );

  return new;
end;
$$;

revoke all on function public.preparer_affaire_vitrage_lead() from public, anon, authenticated;
revoke all on function public.preparer_affaire_vitrage_dossier() from public, anon, authenticated;
revoke all on function public.preparer_affaire_vitrage_dependance() from public, anon, authenticated;
revoke all on function public.nettoyer_ancienne_affaire_vitrage() from public, anon, authenticated;

drop trigger if exists leads_preparer_affaire_vitrage on public.leads;
create trigger leads_preparer_affaire_vitrage
before insert or update of affaire_id, contact_id on public.leads
for each row execute function public.preparer_affaire_vitrage_lead();

drop trigger if exists dossiers_preparer_affaire_vitrage on public.windscreen_cases;
create trigger dossiers_preparer_affaire_vitrage
before insert or update of affaire_id, lead_id, contact_id on public.windscreen_cases
for each row execute function public.preparer_affaire_vitrage_dossier();

drop trigger if exists dossiers_nettoyer_ancienne_affaire on public.windscreen_cases;
create trigger dossiers_nettoyer_ancienne_affaire
after update on public.windscreen_cases
for each row execute function public.nettoyer_ancienne_affaire_vitrage();

drop trigger if exists appointments_preparer_affaire_vitrage on public.appointments;
create trigger appointments_preparer_affaire_vitrage
before insert or update of affaire_id, case_id, lead_id, contact_id on public.appointments
for each row execute function public.preparer_affaire_vitrage_dependance();

drop trigger if exists quotes_preparer_affaire_vitrage on public.quotes;
create trigger quotes_preparer_affaire_vitrage
before insert or update of affaire_id, case_id, contact_id on public.quotes
for each row execute function public.preparer_affaire_vitrage_dependance();

drop trigger if exists invoices_preparer_affaire_vitrage on public.invoices;
create trigger invoices_preparer_affaire_vitrage
before insert or update of affaire_id, case_id, contact_id on public.invoices
for each row execute function public.preparer_affaire_vitrage_dependance();

drop trigger if exists supplier_expenses_preparer_affaire_vitrage on public.supplier_expenses;
create trigger supplier_expenses_preparer_affaire_vitrage
before insert or update of affaire_id, case_id, lead_id, contact_id, customer_invoice_id
on public.supplier_expenses
for each row execute function public.preparer_affaire_vitrage_dependance();

drop trigger if exists supplier_allocations_preparer_affaire_vitrage
  on public.supplier_expense_allocations;
create trigger supplier_allocations_preparer_affaire_vitrage
before insert or update of affaire_id, case_id, contact_id, invoice_id
on public.supplier_expense_allocations
for each row execute function public.preparer_affaire_vitrage_dependance();

create or replace view public.v_affaires_vitrage
with (security_invoker = on) as
select affaire.id,
       affaire.workspace_id,
       affaire.contact_id,
       nullif(trim(concat_ws(' ', contact.first_name, contact.last_name)), '') as contact_name,
       contact.phone as contact_phone,
       lead.id as lead_id,
       lead.status as lead_status,
       dossier.id as glass_case_id,
       dossier.onify_glass_case_id,
       coalesce(dossier.onify_reference, dossier.case_number) as glass_reference,
       rendez_vous.id as appointment_id,
       rendez_vous.start_time as appointment_start_time,
       coalesce(finance.invoice_count, 0) as invoice_count,
       coalesce(finance.invoiced_amount_ht, 0) as invoiced_amount_ht,
       coalesce(couts.supplier_document_count, 0) as supplier_document_count,
       coalesce(couts.supplier_amount_ht, 0) as supplier_amount_ht,
       case
         when dossier.id is null and lead.status = 'lost' then 'perdue'
         when coalesce(finance.invoice_count, 0) > 0 then 'finance'
         when rendez_vous.id is not null then 'agenda'
         when dossier.id is not null then 'glass'
         else 'leads'
       end as phase,
       affaire.created_at,
       affaire.updated_at
from public.affaires_vitrage affaire
left join public.contacts contact on contact.id = affaire.contact_id
left join lateral (
  select lead_ligne.id, lead_ligne.status
  from public.leads lead_ligne
  where lead_ligne.affaire_id = affaire.id
  order by (lead_ligne.archived_at is null) desc,
           lead_ligne.updated_at desc,
           lead_ligne.created_at desc
  limit 1
) lead on true
left join lateral (
  select dossier_ligne.id,
         dossier_ligne.onify_glass_case_id,
         dossier_ligne.onify_reference,
         dossier_ligne.case_number
  from public.windscreen_cases dossier_ligne
  where dossier_ligne.affaire_id = affaire.id
    and dossier_ligne.onify_glass_case_id is not null
  order by dossier_ligne.onify_updated_at desc nulls last,
           dossier_ligne.updated_at desc
  limit 1
) dossier on true
left join lateral (
  select rendez_vous_ligne.id, rendez_vous_ligne.start_time
  from public.appointments rendez_vous_ligne
  where rendez_vous_ligne.affaire_id = affaire.id
    and rendez_vous_ligne.status <> 'cancelled'
  order by case when rendez_vous_ligne.start_time >= now() then 0 else 1 end,
           case when rendez_vous_ligne.start_time >= now() then rendez_vous_ligne.start_time end,
           rendez_vous_ligne.start_time desc
  limit 1
) rendez_vous on true
left join lateral (
  select count(*)::integer as invoice_count,
         coalesce(sum(facture.amount_ht), 0)::numeric as invoiced_amount_ht
  from public.invoices facture
  where facture.affaire_id = affaire.id
    and facture.status <> 'cancelled'
) finance on true
left join lateral (
  select count(*)::integer as supplier_document_count,
         coalesce(sum(depense.amount_ht), 0)::numeric as supplier_amount_ht
  from public.supplier_expenses depense
  where depense.affaire_id = affaire.id
) couts on true;

comment on view public.v_affaires_vitrage is
  'Vue transversale Contact -> Leads -> Glass -> Agenda -> Finance, sans duplication de personne.';

grant select on public.v_affaires_vitrage to authenticated;

commit;
