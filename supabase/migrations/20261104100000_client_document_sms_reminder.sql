/*
  Relance SMS des documents client.

  Le jeton d'acces n'est jamais stocke en clair. Pour pouvoir relancer un
  client plusieurs jours apres la creation du lien, on renouvelle donc le
  jeton de la demande existante. Les documents deja recus restent rattaches
  a la meme demande et l'ancien lien devient inutilisable.
*/

begin;

create or replace function public.renew_client_document_request_link(p_request_id uuid)
returns table (request_id uuid, access_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_workspace uuid;
  v_role text;
  v_request_id uuid;
  v_status text;
  v_token text;
  v_expires timestamptz := now() + interval '30 days';
begin
  select profile.workspace_id, profile.role
  into v_workspace, v_role
  from public.profiles profile
  where profile.id = auth.uid();

  if v_workspace is null or v_role not in ('admin', 'manager', 'advisor') then
    raise exception 'Acces refuse';
  end if;

  select request.id, request.status
  into v_request_id, v_status
  from public.client_document_requests request
  where request.id = p_request_id
    and request.workspace_id = v_workspace
  for update;

  if v_request_id is null then
    raise exception 'Demande documentaire introuvable';
  end if;

  if v_status = 'complete' then
    raise exception 'Tous les documents obligatoires sont deja recus';
  end if;

  if not exists (
    select 1
    from public.client_document_items item
    where item.request_id = v_request_id
      and item.workspace_id = v_workspace
      and item.required
      and item.status not in ('uploaded', 'validated')
  ) then
    raise exception 'Aucun document obligatoire a relancer';
  end if;

  v_token := translate(encode(gen_random_bytes(18), 'base64'), '+/', '-_');

  update public.client_document_requests request
  set
    token_hash = encode(digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex'),
    status = 'open',
    expires_at = v_expires,
    revoked_at = null,
    updated_at = now()
  where request.id = v_request_id
    and request.workspace_id = v_workspace;

  return query select v_request_id, v_token, v_expires;
end;
$$;

revoke all on function public.renew_client_document_request_link(uuid) from public;
grant execute on function public.renew_client_document_request_link(uuid) to authenticated;

commit;
