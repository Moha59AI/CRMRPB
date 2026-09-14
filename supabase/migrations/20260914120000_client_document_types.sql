/*
  Aligne la collecte client sur les quatre pieces metier attendues.

  Les anciens fichiers facultatifs restent en base pour conserver l'historique.
  Les demandes encore accessibles recoivent les deux nouveaux emplacements ;
  le portail masque alors uniquement les anciens emplacements remplaces.
*/

begin;

alter table public.client_document_items
  drop constraint if exists client_document_items_document_type_check;

alter table public.client_document_items
  add constraint client_document_items_document_type_check check (document_type in (
    'registration', 'insurance_cert', 'photo_windscreen',
    'claim_declaration', 'driving_licence', 'identity',
    'technical_inspection', 'other'
  ));

update public.client_document_items
set label = 'Carte grise', required = true
where document_type = 'registration'
  and (label is distinct from 'Carte grise' or required is distinct from true);

update public.client_document_items
set label = 'Attestation d’assurance', required = true
where document_type = 'insurance_cert'
  and (label is distinct from 'Attestation d’assurance' or required is distinct from true);

insert into public.client_document_items (
  workspace_id, request_id, document_type, label, required
)
select
  request.workspace_id,
  request.id,
  'technical_inspection',
  'Contrôle technique',
  false
from public.client_document_requests request
where request.status in ('open', 'complete')
  and not exists (
    select 1
    from public.client_document_items item
    where item.request_id = request.id
      and item.document_type = 'technical_inspection'
  );

insert into public.client_document_items (
  workspace_id, request_id, document_type, label, required
)
select
  request.workspace_id,
  request.id,
  'other',
  'Autre document',
  false
from public.client_document_requests request
where request.status in ('open', 'complete')
  and not exists (
    select 1
    from public.client_document_items item
    where item.request_id = request.id
      and item.document_type = 'other'
  );

create or replace function public.create_client_document_request(p_lead_id uuid)
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
  from public.profiles p where p.id = auth.uid();

  if v_workspace is null or v_role not in ('admin', 'manager', 'advisor') then
    raise exception 'Acces refuse';
  end if;

  if not exists (
    select 1 from public.leads l
    where l.id = p_lead_id and l.workspace_id = v_workspace
  ) then
    raise exception 'Lead introuvable';
  end if;

  select wc.id into v_case
  from public.windscreen_cases wc
  where wc.lead_id = p_lead_id and wc.workspace_id = v_workspace
  order by wc.created_at desc
  limit 1;

  update public.client_document_requests
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where lead_id = p_lead_id
    and workspace_id = v_workspace
    and status = 'open'
    and submitted_at is null;

  v_token := encode(gen_random_bytes(32), 'hex');

  insert into public.client_document_requests (
    workspace_id, lead_id, case_id, token_hash, expires_at
  ) values (
    v_workspace,
    p_lead_id,
    v_case,
    encode(digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex'),
    v_expires
  ) returning id into v_request;

  insert into public.client_document_items (
    workspace_id, request_id, document_type, label, required
  ) values
    (v_workspace, v_request, 'registration', 'Carte grise', true),
    (v_workspace, v_request, 'insurance_cert', 'Attestation d’assurance', true),
    (v_workspace, v_request, 'technical_inspection', 'Contrôle technique', false),
    (v_workspace, v_request, 'other', 'Autre document', false);

  return query select v_request, v_token, v_expires;
end;
$$;

revoke all on function public.create_client_document_request(uuid) from public;
grant execute on function public.create_client_document_request(uuid) to authenticated;

commit;
