/*
# Boite IONOS directe sans Resend

Les nouveaux emails sont envoyes par SMTP IONOS (TLS 465) et importes depuis
INBOX par IMAP IONOS (TLS 993). Le mot de passe reste dans Supabase Vault ;
la base ne conserve que les curseurs IMAP et les metadonnees utiles au CRM.

Prerequis deja utilises par les autres automatisations :
- `project_url` dans Vault ;
- `meta_queue_api_key` dans Vault, avec la Secret key `automations`.
*/

create unique index if not exists communications_provider_external_unique
  on public.communications (workspace_id, provider, external_id);

insert into storage.buckets (id, name, public, file_size_limit)
values ('email-attachments', 'email-attachments', false, 15728640)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

comment on column public.communications.email_attachments is
  'Metadonnees des pieces jointes email. Les nouveaux fichiers IMAP sont conserves dans le bucket prive email-attachments.';

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'ionos-mail-sync'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end $$;

select cron.schedule(
  'ionos-mail-sync',
  '*/5 * * * *',
  $cron$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'project_url'
      limit 1
    ) || '/functions/v1/ionos-mail-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'meta_queue_api_key'
        limit 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $cron$
);
