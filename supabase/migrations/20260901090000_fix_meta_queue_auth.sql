/*
 * Authentification durable du worker Meta avec une nouvelle cle Supabase.
 *
 * Prerequis avant d'appliquer cette migration :
 * - creer une Secret key nommee "automations" dans Settings > API Keys ;
 * - enregistrer sa valeur sb_secret_... dans Vault sous meta_queue_api_key ;
 * - enregistrer l'URL du projet dans Vault sous project_url.
 */

DO $$
DECLARE
  existing_job_id bigint;
BEGIN
  SELECT jobid
  INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'meta-process-queue'
  LIMIT 1;

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;
END
$$;

SELECT cron.schedule(
  'meta-process-queue',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := (
      SELECT decrypted_secret
      FROM vault.decrypted_secrets
      WHERE name = 'project_url'
      LIMIT 1
    ) || '/functions/v1/meta-process-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'meta_queue_api_key'
        LIMIT 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  $cron$
);
