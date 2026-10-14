/*
  Passage du module Leads au module Glass

  Le lead existe uniquement avant Onify. Des qu'un vrai dossier Glass Onify
  est rattache sans ambiguite, le lead est converti puis archive. Le contact
  et toutes les donnees restent conserves ; le travail continue dans Glass.
*/

-- Conserve le vocabulaire de production. Il n'existe volontairement aucun
-- statut "glass_created" dans Leads : un dossier Onify vit dans Glass.
alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads add constraint leads_status_check check (status in (
  'new', 'to_call', 'calling', 'nrp', 'interested', 'documents_requested',
  'documents_received', 'appointment_scheduled', 'lost', 'converted'
));

-- Nettoyage defensif si cette logique a ete testee sur un environnement avant
-- la migration definitive.
delete from public.relance_cadences where statut = 'glass_created';

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

update public.lead_pipeline_settings
set colors = colors - 'onify_created'
where colors ? 'onify_created';

alter table public.lead_pipeline_settings
  alter column colors set default '{
    "nouveau":"#38bdf8",
    "nrp":"#ef4444",
    "qualifie":"#f59e0b",
    "documents_requested":"#fb923c",
    "documents_received":"#10b981",
    "rdv":"#3b82f6",
    "perdu":"#64748b",
    "cloture":"#14b8a6"
  }'::jsonb;

/*
  Rattache les demandes documentaires au dossier Glass puis retire du module
  Leads chaque prospect pour lequel un dossier Onify reel a ete retrouve.

  L'existence du dossier Onify fait foi, y compris lorsque les pieces ont ete
  recues hors du portail CRM. Les leads perdus ne sont jamais reouverts
  automatiquement : une telle incoherence doit etre verifiee manuellement.
*/
create or replace function public.avancer_leads_apres_dossier_glass(p_workspace_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre integer := 0;
begin
  with derniers_dossiers as (
    select distinct on (d.lead_id)
           d.lead_id,
           d.id as case_id
    from public.windscreen_cases d
    where d.workspace_id = p_workspace_id
      and d.lead_id is not null
      and d.onify_glass_case_id is not null
    order by d.lead_id,
             d.onify_updated_at desc nulls last,
             d.onify_synced_at desc nulls last,
             d.created_at desc
  )
  update public.client_document_requests request
     set case_id = dossier.case_id,
         updated_at = now()
    from derniers_dossiers dossier
   where request.workspace_id = p_workspace_id
     and request.lead_id = dossier.lead_id
     and request.status = 'complete'
     and request.case_id is null;

  with candidats as (
    select distinct on (lead.id)
           lead.id,
           lead.workspace_id,
           lead.contact_id,
           dossier.id as case_id,
           coalesce(
             nullif(trim(dossier.onify_reference), ''),
             nullif(trim(dossier.case_number), ''),
             dossier.onify_glass_case_id
           ) as reference
    from public.leads lead
    join public.windscreen_cases dossier
      on dossier.workspace_id = lead.workspace_id
     and dossier.lead_id = lead.id
     and dossier.onify_glass_case_id is not null
    where lead.workspace_id = p_workspace_id
      and lead.archived_at is null
      and lead.status <> 'lost'
    order by lead.id,
             dossier.onify_updated_at desc nulls last,
             dossier.onify_synced_at desc nulls last,
             dossier.created_at desc
  ),
  avances as (
    update public.leads lead
       set status = 'converted',
           archived_at = coalesce(lead.archived_at, now()),
           next_action_at = null,
           updated_at = now()
      from candidats candidat
     where lead.id = candidat.id
    returning lead.id,
              lead.workspace_id,
              lead.contact_id,
              candidat.case_id,
              candidat.reference
  )
  insert into public.notes (workspace_id, lead_id, case_id, contact_id, content)
  select avance.workspace_id,
         avance.id,
         avance.case_id,
         avance.contact_id,
         'Affaire transferee vers Glass : dossier Onify '
           || avance.reference || ' detecte et rattache. Le lead a ete archive.'
  from avances avance;

  get diagnostics v_nombre = row_count;
  return v_nombre;
end;
$$;

revoke all on function public.avancer_leads_apres_dossier_glass(uuid)
  from public, anon, authenticated;
grant execute on function public.avancer_leads_apres_dossier_glass(uuid)
  to service_role;

-- Reprise des dossiers deja synchronises. L'operation est idempotente car les
-- leads archives ne sont plus candidats au passage suivant.
do $$
declare
  workspace record;
begin
  for workspace in select id from public.workspaces loop
    perform public.avancer_leads_apres_dossier_glass(workspace.id);
  end loop;
end $$;
