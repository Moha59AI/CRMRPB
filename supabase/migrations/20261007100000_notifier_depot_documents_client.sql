/*
  Rattachement et alerte fiables pour chaque document déposé par un client.

  Le fichier est déjà lié à sa fiche via :
    client_document_items.request_id
      -> client_document_requests.lead_id
      -> leads.contact_id (fiche client lorsqu'elle existe).

  L'alerte vivait auparavant dans l'Edge Function et n'était créée qu'une fois
  toutes les pièces obligatoires reçues. Ce trigger la crée transactionnellement
  dès chaque dépôt, quel que soit le canal qui met l'item à jour.
*/

create or replace function public.notifier_depot_document_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.client_document_requests%rowtype;
  v_lead public.leads%rowtype;
  v_nom_client text;
  v_vehicule text;
  v_complet boolean;
  v_corps text;
begin
  select * into v_request
  from public.client_document_requests
  where id = new.request_id;

  if not found then
    return new;
  end if;

  select * into v_lead
  from public.leads
  where id = v_request.lead_id;

  v_nom_client := nullif(trim(concat_ws(' ', v_lead.first_name, v_lead.last_name)), '');
  v_nom_client := coalesce(v_nom_client, 'Client sans nom');

  v_vehicule := nullif(trim(concat_ws(
    ' · ',
    nullif(trim(concat_ws(' ', v_lead.vehicle_make, v_lead.vehicle_model)), ''),
    nullif(trim(v_lead.vehicle_registration), '')
  )), '');

  select not exists (
    select 1
    from public.client_document_items item
    where item.request_id = new.request_id
      and item.required = true
      and item.status not in ('uploaded', 'validated')
  ) into v_complet;

  v_corps := concat(
    coalesce(nullif(trim(new.label), ''), 'Document'),
    ' déposé',
    case when v_complet then ' · dossier documentaire complet' else '' end,
    case when v_vehicule is not null then concat(' · ', v_vehicule) else '' end
  );

  insert into public.notifications (
    workspace_id, user_id, title, body, type, link
  )
  select
    v_request.workspace_id,
    profil.id,
    concat('Document reçu — ', v_nom_client),
    v_corps,
    'documents_received',
    concat('/interventions/', v_request.lead_id, '?tab=documents')
  from public.profiles profil
  where profil.workspace_id = v_request.workspace_id
    and profil.role in ('admin', 'manager', 'advisor');

  return new;
exception
  when others then
    -- Le dépôt du client reste prioritaire. Une alerte défaillante est tracée
    -- dans les logs PostgreSQL sans annuler l'enregistrement du document.
    raise warning 'Notification document client impossible pour item % : %', new.id, sqlerrm;
    return new;
end;
$$;

drop trigger if exists client_document_item_notifier_depot
  on public.client_document_items;

create trigger client_document_item_notifier_depot
after update of status, uploaded_at on public.client_document_items
for each row
when (
  new.status = 'uploaded'
  and (
    old.status is distinct from new.status
    or old.uploaded_at is distinct from new.uploaded_at
  )
)
execute function public.notifier_depot_document_client();

comment on function public.notifier_depot_document_client() is
  'Crée une notification CRM et push pour chaque pièce déposée depuis le portail client.';
