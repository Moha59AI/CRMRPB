/*
# Boite mail IONOS dans le CRM

La boite IONOS reste le point de reception principal. Le CRM envoie avec le
domaine deja valide dans Resend et recoit une copie des nouveaux messages par
redirection IONOS vers une adresse Resend Inbound. Aucun mot de passe IONOS
n'est stocke dans le navigateur ou dans la base.
*/

alter table public.integration_connections
  drop constraint if exists integration_connections_provider_check;
alter table public.integration_connections
  add constraint integration_connections_provider_check
  check (provider in ('meta', 'google', 'onify', 'ionos', 'custom'));

create unique index if not exists integration_connections_ionos_unique
  on public.integration_connections (workspace_id, provider)
  where provider = 'ionos';

alter table public.communications
  add column if not exists sender_email text,
  add column if not exists recipient_email text,
  add column if not exists email_message_id text,
  add column if not exists email_in_reply_to text,
  add column if not exists email_attachments jsonb not null default '[]'::jsonb;

create index if not exists communications_sender_email_idx
  on public.communications (workspace_id, lower(sender_email), created_at desc)
  where sender_email is not null;

create index if not exists communications_recipient_email_idx
  on public.communications (workspace_id, lower(recipient_email), created_at desc)
  where recipient_email is not null;

comment on column public.communications.email_attachments is
  'Metadonnees des pieces jointes Resend. Les URL temporaires ne sont jamais conservees.';
