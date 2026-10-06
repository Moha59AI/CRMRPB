/*
# Corps HTML des emails et rattachement manuel audite

Le contenu HTML reste une donnee non fiable : le navigateur ne doit jamais
l'injecter dans le DOM principal. La boite mail l'affiche dans une iframe
sandboxee avec une politique de contenu restrictive.

Une communication reste une trace immuable. La fonction ci-dessous ne change
ni son contenu, ni son objet, ni son expediteur : elle corrige uniquement son
rattachement metier et journalise l'ancien comme le nouveau lead.
*/

alter table public.communications
  add column if not exists email_html text;

comment on column public.communications.email_html is
  'Corps HTML non fiable du message. Affichage autorise uniquement dans une iframe sandboxee.';

create or replace function public.rattacher_email_au_lead(
  p_communication_id uuid,
  p_lead_id uuid
)
returns public.communications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_workspace_id uuid;
  v_role text;
  v_email public.communications%rowtype;
  v_lead record;
  v_old_lead_id uuid;
begin
  if v_user_id is null then
    raise exception 'AUTHENTIFICATION_REQUISE';
  end if;

  select workspace_id, role
  into v_workspace_id, v_role
  from public.profiles
  where id = v_user_id;

  if v_workspace_id is null or v_role not in ('admin', 'manager', 'advisor') then
    raise exception 'ACCES_REFUSE';
  end if;

  select *
  into v_email
  from public.communications
  where id = p_communication_id
    and workspace_id = v_workspace_id
    and type in ('email_inbound', 'email_outbound')
  for update;

  if not found then
    raise exception 'EMAIL_INTROUVABLE';
  end if;

  select id, workspace_id, contact_id
  into v_lead
  from public.leads
  where id = p_lead_id
    and workspace_id = v_workspace_id;

  if not found then
    raise exception 'LEAD_INTROUVABLE';
  end if;

  v_old_lead_id := v_email.lead_id;

  update public.communications
  set lead_id = v_lead.id,
      contact_id = v_lead.contact_id
  where id = v_email.id
  returning * into v_email;

  insert into public.audit_logs (
    workspace_id,
    user_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    v_workspace_id,
    v_user_id,
    'email_lead_linked',
    'communication',
    v_email.id::text,
    jsonb_build_object(
      'previous_lead_id', v_old_lead_id,
      'lead_id', v_lead.id,
      'contact_id', v_email.contact_id
    )
  );

  return v_email;
end;
$$;

revoke all on function public.rattacher_email_au_lead(uuid, uuid) from public;
revoke all on function public.rattacher_email_au_lead(uuid, uuid) from anon;
grant execute on function public.rattacher_email_au_lead(uuid, uuid) to authenticated;

comment on function public.rattacher_email_au_lead(uuid, uuid) is
  'Rattache un email a un lead du meme workspace sans modifier le contenu du message et journalise l operation.';
