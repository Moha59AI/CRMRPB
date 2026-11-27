/*
  Distingue les documents deposes par le client de ceux indexes manuellement
  par l'equipe depuis la fiche CRM.
*/

begin;

alter table public.client_document_activity
  drop constraint if exists client_document_activity_event_type_check;

alter table public.client_document_activity
  add constraint client_document_activity_event_type_check
  check (event_type in (
    'link_opened',
    'upload_started',
    'document_uploaded',
    'staff_document_uploaded',
    'request_completed'
  ));

comment on column public.client_document_activity.event_type is
  'Evenement du portail client ou indexation documentaire realisee par l equipe CRM.';

commit;
