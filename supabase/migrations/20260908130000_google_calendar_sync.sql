/*
# Synchronisation Google Agenda

Les rendez-vous du CRM doivent rester la source metier, tout en etant visibles
dans l'agenda quotidien de l'equipe. On conserve seulement l'identifiant et le
lien de l'evenement Google : le jeton OAuth reste dans Supabase Vault.

La synchronisation ne lit que les evenements portant les proprietes privees
CRMRPB. Un agenda personnel connecte n'est donc jamais importe dans le CRM.
*/

alter table public.appointments
  add column if not exists google_calendar_event_id text,
  add column if not exists google_calendar_html_link text,
  add column if not exists google_calendar_updated_at timestamptz,
  add column if not exists google_calendar_payload_hash text,
  add column if not exists google_calendar_origin text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'appointments_google_calendar_origin_check'
  ) then
    alter table public.appointments
      add constraint appointments_google_calendar_origin_check
      check (google_calendar_origin in ('crm', 'google'));
  end if;
end $$;

create unique index if not exists appointments_google_calendar_event_idx
  on public.appointments (workspace_id, google_calendar_event_id)
  where google_calendar_event_id is not null;

comment on column public.appointments.google_calendar_event_id is
  'Identifiant de l evenement miroir Google Agenda. Le jeton OAuth reste dans Vault.';
comment on column public.appointments.google_calendar_updated_at is
  'Version Google connue lors de la derniere synchronisation, utilisee pour arbitrer les modifications.';
comment on column public.appointments.google_calendar_payload_hash is
  'Empreinte des champs metier envoyes, pour distinguer une vraie modification CRM des champs techniques de synchronisation.';
comment on column public.appointments.google_calendar_origin is
  'Origine du rendez-vous. Les evenements personnels Google ne sont jamais importes.';

-- Reutilise la cle d automatisation deja stockee dans Vault. La fonction
-- accepte aussi une session administrateur pour le bouton Synchroniser.
do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job where jobname = 'google-calendar-sync' limit 1;
  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end $$;

select cron.schedule(
  'google-calendar-sync',
  '*/5 * * * *',
  $cron$
  select net.http_post(
    url := (
      select decrypted_secret from vault.decrypted_secrets
      where name = 'project_url' limit 1
    ) || '/functions/v1/google-calendar-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'meta_queue_api_key' limit 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $cron$
);
