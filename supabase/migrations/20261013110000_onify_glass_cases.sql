/*
  Dossiers Glass Onify

  L'API partenaire expose les dossiers Glass en lecture seule. Le CRM garde
  les champs métier normalisés pour l'affichage et le rapprochement, ainsi que
  la réponse brute afin de ne pas perdre une future donnée Onify.

  La saisie humaine reste prioritaire : les véhicules, assureurs et leads ne
  sont complétés que lorsqu'une valeur manque, et un rapprochement ambigu
  n'est jamais choisi au hasard.
*/

alter table public.windscreen_cases
  add column if not exists onify_glass_case_id text,
  add column if not exists onify_reference text,
  add column if not exists onify_type text,
  add column if not exists onify_status_code text,
  add column if not exists onify_status_label text,
  add column if not exists onify_work_status_code text,
  add column if not exists onify_work_status_label text,
  add column if not exists onify_payment_status text,
  add column if not exists onify_stage text,
  add column if not exists onify_archived boolean not null default false,
  add column if not exists onify_insurer_name text,
  add column if not exists onify_vehicle_registration text,
  add column if not exists onify_vehicle_make text,
  add column if not exists onify_vehicle_model text,
  add column if not exists onify_glass_items text[] not null default '{}',
  add column if not exists insurance_claim_date date,
  add column if not exists onify_payload jsonb,
  add column if not exists onify_created_at timestamptz,
  add column if not exists onify_updated_at timestamptz,
  add column if not exists onify_finalized_at timestamptz,
  add column if not exists onify_synced_at timestamptz;

create unique index if not exists windscreen_cases_onify_glass_unique
  on public.windscreen_cases (workspace_id, onify_glass_case_id);

create index if not exists windscreen_cases_onify_contact_idx
  on public.windscreen_cases (workspace_id, contact_id, onify_updated_at desc)
  where onify_glass_case_id is not null;

comment on column public.windscreen_cases.onify_glass_case_id is
  'Identifiant immuable du dossier retourne par GET /api/recovery/cases.';
comment on column public.windscreen_cases.onify_payload is
  'Copie brute du dossier Glass en lecture seule. Aucun montant ni document n est fourni par cette API.';
comment on column public.windscreen_cases.onify_payment_status is
  'Etat Onify : pending, tva_only, insurance_only, partial ou complete.';

create or replace function public.rattacher_dossiers_glass(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dossiers_leads integer := 0;
  v_leads_enrichis integer := 0;
  v_vehicules_crees integer := 0;
  v_dossiers_vehicules integer := 0;
  v_assureurs_rattaches integer := 0;
begin
  -- Un assureur est retenu uniquement sur un nom ou un tag exact. Une
  -- correspondance approximative pourrait rattacher le mauvais gestionnaire.
  with correspondances as (
    select d.id as dossier_id,
           (
             select a.id
             from public.insurers a
             where a.workspace_id = d.workspace_id
               and (
                 lower(trim(a.name)) = lower(trim(d.onify_insurer_name))
                 or exists (
                   select 1 from unnest(coalesce(a.tags, '{}'::text[])) tag
                   where lower(trim(tag)) = lower(trim(d.onify_insurer_name))
                 )
               )
             order by (lower(trim(a.name)) = lower(trim(d.onify_insurer_name))) desc,
                      a.name
             limit 1
           ) as assureur_id
    from public.windscreen_cases d
    where d.workspace_id = p_workspace_id
      and d.onify_glass_case_id is not null
      and nullif(trim(d.onify_insurer_name), '') is not null
      and d.insurer_id is null
  )
  update public.windscreen_cases d
     set insurer_id = c.assureur_id,
         updated_at = now()
    from correspondances c
   where d.id = c.dossier_id
     and c.assureur_id is not null;
  get diagnostics v_assureurs_rattaches = row_count;

  -- Priorité à l'immatriculation. À défaut, un contact ne désigne un lead que
  -- s'il n'en possède qu'un seul : aucun "premier résultat" arbitraire.
  with candidats as (
    select d.id as dossier_id,
           coalesce(
             (
               select l.id
               from public.leads l
               where l.workspace_id = d.workspace_id
                 and l.contact_id = d.contact_id
                 and nullif(trim(d.onify_vehicle_registration), '') is not null
                 and upper(regexp_replace(coalesce(l.vehicle_registration, ''), '[^A-Za-z0-9]', '', 'g'))
                   = upper(regexp_replace(d.onify_vehicle_registration, '[^A-Za-z0-9]', '', 'g'))
               order by l.received_at desc nulls last, l.created_at desc
               limit 1
             ),
             (
               select (array_agg(l.id order by l.received_at desc nulls last, l.created_at desc))[1]
               from public.leads l
               where l.workspace_id = d.workspace_id
                 and l.contact_id = d.contact_id
               having count(*) = 1
             )
           ) as lead_id
    from public.windscreen_cases d
    where d.workspace_id = p_workspace_id
      and d.onify_glass_case_id is not null
      and d.contact_id is not null
      and d.lead_id is null
  )
  update public.windscreen_cases d
     set lead_id = c.lead_id,
         updated_at = now()
    from candidats c
   where d.id = c.dossier_id
     and c.lead_id is not null;
  get diagnostics v_dossiers_leads = row_count;

  -- Le dossier Glass complète la fiche lead, sans écraser une qualification
  -- déjà réalisée manuellement dans le CRM.
  with derniers as (
    select distinct on (d.lead_id)
           d.lead_id,
           d.onify_vehicle_registration,
           d.onify_vehicle_make,
           d.onify_vehicle_model,
           d.onify_insurer_name,
           d.glass_type
    from public.windscreen_cases d
    where d.workspace_id = p_workspace_id
      and d.onify_glass_case_id is not null
      and d.lead_id is not null
    order by d.lead_id, d.onify_updated_at desc nulls last, d.onify_synced_at desc
  )
  update public.leads l
     set vehicle_registration = coalesce(nullif(trim(l.vehicle_registration), ''), x.onify_vehicle_registration),
         vehicle_make = coalesce(nullif(trim(l.vehicle_make), ''), x.onify_vehicle_make),
         vehicle_model = coalesce(nullif(trim(l.vehicle_model), ''), x.onify_vehicle_model),
         insurance = coalesce(nullif(trim(l.insurance), ''), x.onify_insurer_name),
         glass_type = coalesce(l.glass_type, x.glass_type),
         updated_at = now()
    from derniers x
   where l.id = x.lead_id
     and (
       (nullif(trim(l.vehicle_registration), '') is null and x.onify_vehicle_registration is not null)
       or (nullif(trim(l.vehicle_make), '') is null and x.onify_vehicle_make is not null)
       or (nullif(trim(l.vehicle_model), '') is null and x.onify_vehicle_model is not null)
       or (nullif(trim(l.insurance), '') is null and x.onify_insurer_name is not null)
       or (l.glass_type is null and x.glass_type is not null)
     );
  get diagnostics v_leads_enrichis = row_count;

  -- Crée le véhicule seulement si la même immatriculation n'existe pas déjà
  -- dans l'espace de travail. L'identité client doit être connue.
  insert into public.vehicles (
    workspace_id, contact_id, registration, make, model, created_at, updated_at
  )
  select distinct on (
           d.workspace_id,
           d.contact_id,
           upper(regexp_replace(d.onify_vehicle_registration, '[^A-Za-z0-9]', '', 'g'))
         )
         d.workspace_id,
         d.contact_id,
         d.onify_vehicle_registration,
         d.onify_vehicle_make,
         d.onify_vehicle_model,
         now(),
         now()
    from public.windscreen_cases d
   where d.workspace_id = p_workspace_id
     and d.onify_glass_case_id is not null
     and d.contact_id is not null
     and nullif(trim(d.onify_vehicle_registration), '') is not null
     and not exists (
       select 1
       from public.vehicles v
       where v.workspace_id = d.workspace_id
         and upper(regexp_replace(coalesce(v.registration, ''), '[^A-Za-z0-9]', '', 'g'))
           = upper(regexp_replace(d.onify_vehicle_registration, '[^A-Za-z0-9]', '', 'g'))
     )
   order by d.workspace_id,
            d.contact_id,
            upper(regexp_replace(d.onify_vehicle_registration, '[^A-Za-z0-9]', '', 'g')),
            d.onify_updated_at desc nulls last;
  get diagnostics v_vehicules_crees = row_count;

  with correspondances as (
    select d.id as dossier_id,
           (
             select v.id
             from public.vehicles v
             where v.workspace_id = d.workspace_id
               and v.contact_id = d.contact_id
               and upper(regexp_replace(coalesce(v.registration, ''), '[^A-Za-z0-9]', '', 'g'))
                 = upper(regexp_replace(d.onify_vehicle_registration, '[^A-Za-z0-9]', '', 'g'))
             order by v.updated_at desc nulls last, v.created_at desc
             limit 1
           ) as vehicle_id
    from public.windscreen_cases d
    where d.workspace_id = p_workspace_id
      and d.onify_glass_case_id is not null
      and d.contact_id is not null
      and nullif(trim(d.onify_vehicle_registration), '') is not null
      and d.vehicle_id is null
  )
  update public.windscreen_cases d
     set vehicle_id = c.vehicle_id,
         updated_at = now()
    from correspondances c
   where d.id = c.dossier_id
     and c.vehicle_id is not null;
  get diagnostics v_dossiers_vehicules = row_count;

  return jsonb_build_object(
    'cases_linked_to_leads', v_dossiers_leads,
    'leads_enriched', v_leads_enrichis,
    'vehicles_created', v_vehicules_crees,
    'cases_linked_to_vehicles', v_dossiers_vehicules,
    'insurers_linked', v_assureurs_rattaches
  );
end;
$$;

revoke all on function public.rattacher_dossiers_glass(uuid) from public, anon, authenticated;
grant execute on function public.rattacher_dossiers_glass(uuid) to service_role;
