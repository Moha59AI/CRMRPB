/*
  Reglages autonomes du portail documentaire et liens clients raccourcis.

  Le code public passe de 64 caracteres hexadecimaux a 24 caracteres base64url
  (144 bits aleatoires). Seule son empreinte SHA-256 reste stockee. Les anciens
  codes continuent d'etre acceptes par l'Edge Function.
*/

begin;

create or replace function public.valid_client_document_rules(value jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  rule jsonb;
  document_key text;
  seen_keys text[] := array[]::text[];
  has_required boolean := false;
begin
  if value is null or jsonb_typeof(value) <> 'array' or jsonb_array_length(value) <> 4 then
    return false;
  end if;

  for rule in select item from jsonb_array_elements(value) as items(item)
  loop
    if jsonb_typeof(rule) <> 'object'
      or not (rule ?& array['document_type', 'label', 'enabled', 'required'])
      or jsonb_typeof(rule -> 'enabled') <> 'boolean'
      or jsonb_typeof(rule -> 'required') <> 'boolean'
    then
      return false;
    end if;

    document_key := rule ->> 'document_type';
    if document_key is null
      or document_key not in ('registration', 'insurance_cert', 'technical_inspection', 'other')
      or document_key = any(seen_keys)
      or char_length(trim(coalesce(rule ->> 'label', ''))) not between 1 and 80
    then
      return false;
    end if;

    seen_keys := array_append(seen_keys, document_key);
    if (rule ->> 'enabled')::boolean and (rule ->> 'required')::boolean then
      has_required := true;
    end if;
  end loop;

  return cardinality(seen_keys) = 4 and has_required;
exception when others then
  return false;
end;
$$;

create table if not exists public.client_document_portal_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  page_title text not null default 'Ajoutez les pièces de votre dossier'
    check (char_length(trim(page_title)) between 3 and 90),
  page_intro text not null default 'Prenez une photo nette ou choisissez un PDF. Vous pouvez remplacer un document tant que nécessaire.'
    check (char_length(trim(page_intro)) between 3 and 400),
  completion_title text not null default 'Toutes les pièces nécessaires sont bien reçues'
    check (char_length(trim(completion_title)) between 3 and 100),
  completion_message text not null default 'Votre dossier est transmis à l’équipe Relais Pare-Brise. Vous n’avez rien d’autre à faire pour le moment : nous vérifions les documents et nous vous contactons pour la suite ou si une pièce doit être remplacée.'
    check (char_length(trim(completion_message)) between 3 and 500),
  show_gift boolean not null default true,
  document_rules jsonb not null default '[
    {"document_type":"registration","label":"Carte grise","enabled":true,"required":true},
    {"document_type":"insurance_cert","label":"Attestation d’assurance","enabled":true,"required":true},
    {"document_type":"technical_inspection","label":"Contrôle technique","enabled":true,"required":false},
    {"document_type":"other","label":"Autre document","enabled":true,"required":false}
  ]'::jsonb check (public.valid_client_document_rules(document_rules)),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.client_document_portal_settings enable row level security;

drop policy if exists "select_client_document_portal_settings" on public.client_document_portal_settings;
create policy "select_client_document_portal_settings"
on public.client_document_portal_settings for select to authenticated
using (
  workspace_id = (select p.workspace_id from public.profiles p where p.id = auth.uid())
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'manager')
  )
);

drop policy if exists "insert_client_document_portal_settings" on public.client_document_portal_settings;
create policy "insert_client_document_portal_settings"
on public.client_document_portal_settings for insert to authenticated
with check (
  workspace_id = (select p.workspace_id from public.profiles p where p.id = auth.uid())
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'manager')
  )
);

drop policy if exists "update_client_document_portal_settings" on public.client_document_portal_settings;
create policy "update_client_document_portal_settings"
on public.client_document_portal_settings for update to authenticated
using (
  workspace_id = (select p.workspace_id from public.profiles p where p.id = auth.uid())
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'manager')
  )
)
with check (
  workspace_id = (select p.workspace_id from public.profiles p where p.id = auth.uid())
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'manager')
  )
);

drop policy if exists "delete_client_document_portal_settings" on public.client_document_portal_settings;
create policy "delete_client_document_portal_settings"
on public.client_document_portal_settings for delete to authenticated
using (
  workspace_id = (select p.workspace_id from public.profiles p where p.id = auth.uid())
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

drop trigger if exists client_document_portal_settings_updated_at
  on public.client_document_portal_settings;
create trigger client_document_portal_settings_updated_at
before update on public.client_document_portal_settings
for each row execute function public.update_updated_at_column();

insert into public.client_document_portal_settings (workspace_id)
select workspace.id from public.workspaces workspace
on conflict (workspace_id) do nothing;

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
where document_type = 'registration';

update public.client_document_items
set label = 'Attestation d’assurance', required = true
where document_type = 'insurance_cert';

update public.client_document_items
set required = false
where document_type in ('photo_windscreen', 'claim_declaration');

insert into public.client_document_items (
  workspace_id, request_id, document_type, label, required
)
select request.workspace_id, request.id, 'technical_inspection', 'Contrôle technique', false
from public.client_document_requests request
where request.status in ('open', 'complete')
on conflict (request_id, document_type) do nothing;

insert into public.client_document_items (
  workspace_id, request_id, document_type, label, required
)
select request.workspace_id, request.id, 'other', 'Autre document', false
from public.client_document_requests request
where request.status in ('open', 'complete')
on conflict (request_id, document_type) do nothing;

create or replace function public.save_client_document_portal_settings(
  p_page_title text,
  p_page_intro text,
  p_completion_title text,
  p_completion_message text,
  p_show_gift boolean,
  p_document_rules jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace uuid;
  v_role text;
begin
  select profile.workspace_id, profile.role
  into v_workspace, v_role
  from public.profiles profile
  where profile.id = auth.uid();

  if v_workspace is null or v_role not in ('admin', 'manager') then
    raise exception 'Acces refuse';
  end if;

  if char_length(trim(coalesce(p_page_title, ''))) not between 3 and 90
    or char_length(trim(coalesce(p_page_intro, ''))) not between 3 and 400
    or char_length(trim(coalesce(p_completion_title, ''))) not between 3 and 100
    or char_length(trim(coalesce(p_completion_message, ''))) not between 3 and 500
    or p_show_gift is null
    or not public.valid_client_document_rules(p_document_rules)
  then
    raise exception 'Reglages du portail invalides';
  end if;

  insert into public.client_document_portal_settings (
    workspace_id, page_title, page_intro, completion_title,
    completion_message, show_gift, document_rules, updated_by
  ) values (
    v_workspace, trim(p_page_title), trim(p_page_intro), trim(p_completion_title),
    trim(p_completion_message), p_show_gift, p_document_rules, auth.uid()
  )
  on conflict (workspace_id) do update set
    page_title = excluded.page_title,
    page_intro = excluded.page_intro,
    completion_title = excluded.completion_title,
    completion_message = excluded.completion_message,
    show_gift = excluded.show_gift,
    document_rules = excluded.document_rules,
    updated_by = excluded.updated_by,
    updated_at = now();

  update public.client_document_items item
  set required = false
  from public.client_document_requests request
  where item.request_id = request.id
    and request.workspace_id = v_workspace
    and request.status = 'open'
    and item.document_type in ('photo_windscreen', 'claim_declaration');

  with rules as (
    select
      rule ->> 'document_type' as document_type,
      trim(rule ->> 'label') as label,
      (rule ->> 'enabled')::boolean as enabled,
      (rule ->> 'required')::boolean as required
    from jsonb_array_elements(p_document_rules) as entries(rule)
  )
  update public.client_document_items item
  set
    label = rules.label,
    required = rules.enabled and rules.required
  from public.client_document_requests request, rules
  where item.request_id = request.id
    and request.workspace_id = v_workspace
    and request.status = 'open'
    and item.document_type = rules.document_type;

  with rules as (
    select
      rule ->> 'document_type' as document_type,
      trim(rule ->> 'label') as label,
      (rule ->> 'required')::boolean as required
    from jsonb_array_elements(p_document_rules) as entries(rule)
    where (rule ->> 'enabled')::boolean
  )
  insert into public.client_document_items (
    workspace_id, request_id, document_type, label, required
  )
  select
    request.workspace_id,
    request.id,
    rules.document_type,
    rules.label,
    rules.required
  from public.client_document_requests request
  cross join rules
  where request.workspace_id = v_workspace
    and request.status = 'open'
  on conflict (request_id, document_type) do nothing;

  with completed as (
    update public.client_document_requests request
    set status = 'complete', submitted_at = coalesce(request.submitted_at, now()), updated_at = now()
    where request.workspace_id = v_workspace
      and request.status = 'open'
      and not exists (
        select 1
        from public.client_document_items item
        join jsonb_array_elements(p_document_rules) as entries(rule)
          on rule ->> 'document_type' = item.document_type
        where item.request_id = request.id
          and (rule ->> 'enabled')::boolean
          and (rule ->> 'required')::boolean
          and item.status not in ('uploaded', 'validated')
      )
    returning request.lead_id, request.workspace_id
  )
  update public.leads lead
  set status = 'documents_received', updated_at = now()
  from completed
  where lead.id = completed.lead_id
    and lead.workspace_id = completed.workspace_id
    and lead.status = 'documents_requested';
end;
$$;

revoke all on function public.save_client_document_portal_settings(text, text, text, text, boolean, jsonb) from public;
grant execute on function public.save_client_document_portal_settings(text, text, text, text, boolean, jsonb) to authenticated;

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
  v_rules jsonb;
  v_expires timestamptz := now() + interval '30 days';
begin
  select profile.workspace_id, profile.role
  into v_workspace, v_role
  from public.profiles profile
  where profile.id = auth.uid();

  if v_workspace is null or v_role not in ('admin', 'manager', 'advisor') then
    raise exception 'Acces refuse';
  end if;

  if not exists (
    select 1 from public.leads lead
    where lead.id = p_lead_id and lead.workspace_id = v_workspace
  ) then
    raise exception 'Lead introuvable';
  end if;

  select case_record.id into v_case
  from public.windscreen_cases case_record
  where case_record.lead_id = p_lead_id and case_record.workspace_id = v_workspace
  order by case_record.created_at desc
  limit 1;

  update public.client_document_requests
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where lead_id = p_lead_id
    and workspace_id = v_workspace
    and status = 'open'
    and submitted_at is null;

  v_token := translate(encode(gen_random_bytes(18), 'base64'), '+/', '-_');

  insert into public.client_document_requests (
    workspace_id, lead_id, case_id, token_hash, expires_at
  ) values (
    v_workspace,
    p_lead_id,
    v_case,
    encode(digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex'),
    v_expires
  ) returning id into v_request;

  select settings.document_rules into v_rules
  from public.client_document_portal_settings settings
  where settings.workspace_id = v_workspace;

  if not public.valid_client_document_rules(v_rules) then
    v_rules := '[
      {"document_type":"registration","label":"Carte grise","enabled":true,"required":true},
      {"document_type":"insurance_cert","label":"Attestation d’assurance","enabled":true,"required":true},
      {"document_type":"technical_inspection","label":"Contrôle technique","enabled":true,"required":false},
      {"document_type":"other","label":"Autre document","enabled":true,"required":false}
    ]'::jsonb;
  end if;

  insert into public.client_document_items (
    workspace_id, request_id, document_type, label, required
  )
  select
    v_workspace,
    v_request,
    rule ->> 'document_type',
    trim(rule ->> 'label'),
    (rule ->> 'required')::boolean
  from jsonb_array_elements(v_rules) with ordinality as entries(rule, position)
  where (rule ->> 'enabled')::boolean
  order by position;

  return query select v_request, v_token, v_expires;
end;
$$;

revoke all on function public.create_client_document_request(uuid) from public;
grant execute on function public.create_client_document_request(uuid) to authenticated;

commit;
