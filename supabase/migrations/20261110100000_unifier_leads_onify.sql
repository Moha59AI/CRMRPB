/*
  Un seul parcours dans Leads, enrichi par Onify

  `windscreen_cases` reste le miroir technique et auditable de l API Onify :
  le supprimer ferait perdre la reponse brute, les rapprochements comptables
  et les liens historiques. En revanche, il ne constitue plus un module de
  travail. Chaque dossier Onify possede une fiche Lead visible et modifiable.

  Cette migration est additive : elle ne modifie ni les demandes de documents
  client, ni leurs jetons, ni les fichiers deja recus.
*/

begin;

alter table public.leads
  add column if not exists onify_case_id uuid
    references public.windscreen_cases(id) on delete set null,
  add column if not exists onify_glass_case_id text,
  add column if not exists onify_reference text,
  add column if not exists onify_status_code text,
  add column if not exists onify_status_label text,
  add column if not exists onify_work_status_code text,
  add column if not exists onify_work_status_label text,
  add column if not exists onify_payment_status text,
  add column if not exists onify_stage text,
  add column if not exists onify_synced_at timestamptz,
  add column if not exists insurance_claim_number text,
  add column if not exists insurance_claim_date date;

create unique index if not exists leads_onify_case_unique
  on public.leads (workspace_id, onify_case_id)
  where onify_case_id is not null;

create index if not exists leads_onify_dossier_idx
  on public.leads (workspace_id, onify_glass_case_id)
  where onify_glass_case_id is not null;

comment on column public.leads.onify_case_id is
  'Miroir technique Onify qui enrichit cette fiche Lead. Il ne designe plus un module separe.';
comment on column public.leads.onify_glass_case_id is
  'Identifiant immuable du dossier Onify retourne par GET /api/recovery/cases.';
comment on column public.leads.onify_reference is
  'Reference lisible du dossier Onify affichee directement dans Leads.';

alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads add constraint leads_status_check check (status in (
  'new', 'to_call', 'calling', 'nrp', 'interested', 'documents_requested',
  'documents_received', 'onify_processing', 'appointment_scheduled',
  'intervention_done', 'payment_pending', 'sav', 'lost', 'converted'
));

/* Les nouvelles etapes restent personnalisables dans les reglages de couleur. */
alter table public.lead_pipeline_settings
  drop constraint if exists lead_pipeline_settings_colors_check;

create or replace function public.valid_lead_pipeline_colors(value jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select jsonb_typeof(value) = 'object'
    and value ?& array[
      'nouveau', 'nrp', 'qualifie', 'documents_requested',
      'documents_received', 'onify', 'rdv', 'intervention', 'finance',
      'sav', 'perdu', 'cloture'
    ]
    and not exists (
      select 1
      from jsonb_each_text(value) entry
      where entry.key not in (
        'nouveau', 'nrp', 'qualifie', 'documents_requested',
        'documents_received', 'onify', 'rdv', 'intervention', 'finance',
        'sav', 'perdu', 'cloture'
      )
      or entry.value !~ '^#[0-9A-Fa-f]{6}$'
    );
$$;

update public.lead_pipeline_settings
set colors = colors || '{
  "onify":"#8b5cf6",
  "intervention":"#0ea5e9",
  "finance":"#f97316",
  "sav":"#e11d48"
}'::jsonb;

alter table public.lead_pipeline_settings
  alter column colors set default '{
    "nouveau":"#38bdf8",
    "nrp":"#ef4444",
    "qualifie":"#f59e0b",
    "documents_requested":"#fb923c",
    "documents_received":"#10b981",
    "onify":"#8b5cf6",
    "rdv":"#3b82f6",
    "intervention":"#0ea5e9",
    "finance":"#f97316",
    "sav":"#e11d48",
    "perdu":"#64748b",
    "cloture":"#14b8a6"
  }'::jsonb;

alter table public.lead_pipeline_settings
  add constraint lead_pipeline_settings_colors_check
  check (public.valid_lead_pipeline_colors(colors));

/*
  Traduit l avancement technique Onify en une etape simple du funnel Leads.
  Les libelles Onify bruts restent disponibles sur la fiche : cette traduction
  ne les remplace pas.
*/
create or replace function public.statut_lead_depuis_onify(
  p_case_status text,
  p_onify_status_code text,
  p_onify_archived boolean
)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when lower(coalesce(p_onify_status_code, '')) = 'annule' then 'lost'
    when coalesce(p_onify_archived, false)
      or p_case_status in ('payment_received', 'gift_given', 'completed') then 'converted'
    when p_case_status = 'sav' then 'sav'
    when p_case_status in ('invoice_sent', 'payment_pending') then 'payment_pending'
    when p_case_status = 'intervention_done' then 'intervention_done'
    when p_case_status = 'appointment_scheduled' then 'appointment_scheduled'
    else 'onify_processing'
  end;
$$;

/*
  L ancien nom est conserve pour ne casser ni une fonction deja deployee ni
  un appel en cours. Son comportement change : il n archive plus le lead et
  ne le considere plus comme cloture a la creation du dossier Onify.

  Les dossiers historiques sans lead obtiennent une fiche importee. C est une
  vraie affaire existante, pas un doublon : elle reprend le meme affaire_id,
  le meme contact et le meme dossier technique Onify.
*/
create or replace function public.avancer_leads_apres_dossier_glass(p_workspace_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_crees integer := 0;
  v_enrichis integer := 0;
begin
  /* Un lead represente une affaire. Si l ancienne logique a rattache plusieurs
     dossiers Onify au meme lead, on conserve la correspondance la plus sure
     et les autres dossiers recevront leur propre fiche importee ci-dessous. */
  with correspondances as (
    select dossier.id,
           row_number() over (
             partition by dossier.workspace_id, dossier.lead_id
             order by
               exists (
                 select 1
                 from public.client_document_requests request
                 where request.case_id = dossier.id
                   and request.lead_id = dossier.lead_id
               ) desc,
               (
                 dossier.affaire_id is not null
                 and dossier.affaire_id = lead.affaire_id
               ) desc,
               (
                 nullif(trim(dossier.onify_vehicle_registration), '') is not null
                 and upper(regexp_replace(coalesce(lead.vehicle_registration, ''), '[^A-Za-z0-9]', '', 'g'))
                   = upper(regexp_replace(dossier.onify_vehicle_registration, '[^A-Za-z0-9]', '', 'g'))
               ) desc,
               coalesce(dossier.onify_updated_at, dossier.updated_at, dossier.created_at) desc,
               dossier.id
           ) as rang
      from public.windscreen_cases dossier
      join public.leads lead
        on lead.id = dossier.lead_id
       and lead.workspace_id = dossier.workspace_id
     where dossier.workspace_id = p_workspace_id
       and dossier.onify_glass_case_id is not null
       and dossier.lead_id is not null
  )
  update public.windscreen_cases dossier
     set lead_id = null,
         updated_at = now()
    from correspondances correspondance
   where dossier.id = correspondance.id
     and correspondance.rang > 1;

  insert into public.leads (
    workspace_id,
    affaire_id,
    contact_id,
    assigned_user_id,
    first_name,
    last_name,
    phone,
    email,
    address,
    city,
    postal_code,
    intervention_address,
    intervention_city,
    intervention_postal_code,
    vehicle_registration,
    vehicle_make,
    vehicle_model,
    insurance,
    insurance_claim_number,
    insurance_claim_date,
    glass_type,
    franchise_amount,
    franchise_type,
    offer,
    source,
    status,
    raw_payload,
    received_at,
    archived_at,
    onify_case_id,
    onify_glass_case_id,
    onify_reference,
    onify_status_code,
    onify_status_label,
    onify_work_status_code,
    onify_work_status_label,
    onify_payment_status,
    onify_stage,
    onify_synced_at,
    created_at,
    updated_at
  )
  select dossier.workspace_id,
         dossier.affaire_id,
         dossier.contact_id,
         dossier.assigned_user_id,
         coalesce(contact.first_name, nullif(trim(dossier.onify_payload->'client'->>'prenom'), '')),
         coalesce(contact.last_name, nullif(trim(dossier.onify_payload->'client'->>'nom'), '')),
         contact.phone,
         contact.email,
         contact.address,
         contact.city,
         contact.postal_code,
         dossier.intervention_address,
         dossier.intervention_city,
         dossier.intervention_postal_code,
         dossier.onify_vehicle_registration,
         dossier.onify_vehicle_make,
         dossier.onify_vehicle_model,
         coalesce(dossier.insurance_name, dossier.onify_insurer_name),
         dossier.insurance_claim_number,
         dossier.insurance_claim_date,
         dossier.glass_type,
         dossier.franchise_amount,
         dossier.franchise_type,
         coalesce(dossier.gift_type, dossier.offer),
         'import',
         public.statut_lead_depuis_onify(
           dossier.status,
           dossier.onify_status_code,
           dossier.onify_archived
         ),
         jsonb_build_object(
           'source', 'onify',
           'onify_case_id', dossier.onify_glass_case_id,
           'onify_reference', coalesce(dossier.onify_reference, dossier.case_number)
         ),
         coalesce(dossier.onify_created_at, dossier.created_at),
         case
           when coalesce(dossier.onify_archived, false)
             then coalesce(dossier.onify_synced_at, dossier.updated_at, now())
           else null
         end,
         dossier.id,
         dossier.onify_glass_case_id,
         coalesce(dossier.onify_reference, dossier.case_number),
         dossier.onify_status_code,
         dossier.onify_status_label,
         dossier.onify_work_status_code,
         dossier.onify_work_status_label,
         dossier.onify_payment_status,
         dossier.onify_stage,
         dossier.onify_synced_at,
         coalesce(dossier.onify_created_at, dossier.created_at, now()),
         now()
    from public.windscreen_cases dossier
    left join public.contacts contact
      on contact.id = dossier.contact_id
     and contact.workspace_id = dossier.workspace_id
   where dossier.workspace_id = p_workspace_id
     and dossier.onify_glass_case_id is not null
     and dossier.lead_id is null
  on conflict (workspace_id, onify_case_id)
    where onify_case_id is not null
  do nothing;
  get diagnostics v_crees = row_count;

  update public.windscreen_cases dossier
     set lead_id = lead.id,
         updated_at = now()
    from public.leads lead
   where dossier.workspace_id = p_workspace_id
     and dossier.onify_glass_case_id is not null
     and dossier.lead_id is null
     and lead.workspace_id = dossier.workspace_id
     and lead.onify_case_id = dossier.id;

  update public.client_document_requests request
     set case_id = dossier.id,
         updated_at = now()
    from public.windscreen_cases dossier
   where request.workspace_id = p_workspace_id
     and request.lead_id = dossier.lead_id
     and request.status = 'complete'
     and request.case_id is null
     and dossier.workspace_id = request.workspace_id
     and dossier.onify_glass_case_id is not null;

  update public.leads lead
     set affaire_id = dossier.affaire_id,
         contact_id = coalesce(lead.contact_id, dossier.contact_id),
         assigned_user_id = coalesce(lead.assigned_user_id, dossier.assigned_user_id),
         vehicle_registration = coalesce(
           nullif(trim(lead.vehicle_registration), ''),
           dossier.onify_vehicle_registration
         ),
         vehicle_make = coalesce(
           nullif(trim(lead.vehicle_make), ''),
           dossier.onify_vehicle_make
         ),
         vehicle_model = coalesce(
           nullif(trim(lead.vehicle_model), ''),
           dossier.onify_vehicle_model
         ),
         insurance = coalesce(
           nullif(trim(lead.insurance), ''),
           nullif(trim(dossier.insurance_name), ''),
           dossier.onify_insurer_name
         ),
         insurance_claim_number = coalesce(
           nullif(trim(lead.insurance_claim_number), ''),
           dossier.insurance_claim_number
         ),
         insurance_claim_date = coalesce(
           lead.insurance_claim_date,
           dossier.insurance_claim_date
         ),
         glass_type = coalesce(lead.glass_type, dossier.glass_type),
         franchise_amount = coalesce(lead.franchise_amount, dossier.franchise_amount),
         franchise_type = coalesce(lead.franchise_type, dossier.franchise_type),
         intervention_address = coalesce(
           nullif(trim(lead.intervention_address), ''),
           dossier.intervention_address
         ),
         intervention_postal_code = coalesce(
           nullif(trim(lead.intervention_postal_code), ''),
           dossier.intervention_postal_code
         ),
         intervention_city = coalesce(
           nullif(trim(lead.intervention_city), ''),
           dossier.intervention_city
         ),
         offer = coalesce(
           nullif(trim(lead.offer), ''),
           nullif(trim(dossier.gift_type), ''),
           dossier.offer
         ),
         status = public.statut_lead_depuis_onify(
           dossier.status,
           dossier.onify_status_code,
           dossier.onify_archived
         ),
         archived_at = case
           when coalesce(dossier.onify_archived, false)
             then coalesce(lead.archived_at, dossier.onify_synced_at, dossier.updated_at, now())
           /* L ancien workflow archivait chaque lead des la creation Onify.
              Ce cas est rouvert une seule fois pendant la reprise. */
           when lead.status = 'converted' and lead.onify_case_id is null
             then null
           else lead.archived_at
         end,
         next_action_at = case
           when dossier.status in (
             'appointment_scheduled', 'intervention_done', 'invoice_sent',
             'payment_pending', 'payment_received', 'gift_given', 'completed'
           ) then null
           else lead.next_action_at
         end,
         onify_case_id = dossier.id,
         onify_glass_case_id = dossier.onify_glass_case_id,
         onify_reference = coalesce(dossier.onify_reference, dossier.case_number),
         onify_status_code = dossier.onify_status_code,
         onify_status_label = dossier.onify_status_label,
         onify_work_status_code = dossier.onify_work_status_code,
         onify_work_status_label = dossier.onify_work_status_label,
         onify_payment_status = dossier.onify_payment_status,
         onify_stage = dossier.onify_stage,
         onify_synced_at = dossier.onify_synced_at,
         updated_at = now()
    from public.windscreen_cases dossier
   where dossier.workspace_id = p_workspace_id
     and dossier.onify_glass_case_id is not null
     and dossier.lead_id = lead.id
     and lead.workspace_id = dossier.workspace_id;
  get diagnostics v_enrichis = row_count;

  return v_crees + v_enrichis;
end;
$$;

comment on function public.avancer_leads_apres_dossier_glass(uuid) is
  'Cree ou enrichit la fiche Lead liee a chaque dossier Onify, sans archivage ni module Glass separe.';

revoke all on function public.avancer_leads_apres_dossier_glass(uuid)
  from public, anon, authenticated;
grant execute on function public.avancer_leads_apres_dossier_glass(uuid)
  to service_role;

/* Un rendez-vous ne doit jamais faire reculer une intervention ou un paiement. */
create or replace function public.avancer_lead_apres_rendez_vous()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.lead_id is null
     or new.status not in ('scheduled', 'confirmed')
     or new.end_time <= now() then
    return new;
  end if;

  with avances as (
    update public.leads lead
       set status = 'appointment_scheduled',
           next_action_at = null,
           updated_at = now()
     where lead.id = new.lead_id
       and lead.workspace_id = new.workspace_id
       and lead.status not in (
         'appointment_scheduled', 'intervention_done', 'payment_pending',
         'sav', 'converted', 'lost'
       )
    returning lead.id, lead.workspace_id, lead.contact_id
  )
  insert into public.notes (workspace_id, lead_id, contact_id, content)
  select avance.workspace_id,
         avance.id,
         avance.contact_id,
         'Passage automatique a RDV pris : rendez-vous du '
           || to_char(new.start_time at time zone 'Europe/Paris', 'DD/MM/YYYY a HH24:MI')
           || ' synchronise avec l agenda.'
    from avances avance;

  return new;
end;
$$;

/* La facture enrichit aussi la meme fiche Lead. */
create or replace function public.avancer_lead_apres_facture()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_statut text;
begin
  if new.affaire_id is null or new.status = 'cancelled' then return new; end if;

  v_statut := case
    when new.status = 'paid'
      or (
        coalesce(new.amount_ttc, 0) > 0
        and coalesce(new.amount_paid, 0) >= coalesce(new.amount_ttc, 0)
        and coalesce(new.remaining_amount, 0) <= 0
      ) then 'converted'
    else 'payment_pending'
  end;

  update public.leads lead
     set status = v_statut,
         next_action_at = null,
         updated_at = now()
   where lead.workspace_id = new.workspace_id
     and lead.affaire_id = new.affaire_id
     and lead.status not in ('lost', 'sav')
     and (v_statut = 'converted' or lead.status <> 'converted');

  return new;
end;
$$;

drop trigger if exists invoices_avance_lead on public.invoices;
create trigger invoices_avance_lead
after insert or update of status, amount_ttc, amount_paid, remaining_amount, affaire_id
on public.invoices
for each row execute function public.avancer_lead_apres_facture();

comment on function public.avancer_lead_apres_facture() is
  'Fait suivre la facturation Onify sur la meme fiche Lead sans module intermediaire.';

/* Reprise idempotente de tous les dossiers deja synchronises. */
do $$
declare
  workspace record;
begin
  for workspace in select id from public.workspaces loop
    perform public.avancer_leads_apres_dossier_glass(workspace.id);
  end loop;
end $$;

commit;
