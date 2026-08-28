-- =====================================================================
-- Cron de traitement de la file des leads Meta
-- =====================================================================
-- A executer UNE FOIS dans Supabase > SQL Editor, apres avoir deploye
-- les Edge Functions.
--
-- Equivalent du cron PHP qui depilait webhook_queue toutes les minutes.
-- Ici pg_cron declenche l'Edge Function meta-process-queue via pg_net.
-- =====================================================================


-- 1. Extensions -------------------------------------------------------
-- Si ces deux lignes echouent, activez pg_cron et pg_net depuis
-- Dashboard > Database > Extensions, puis reprenez a l'etape 2.

create extension if not exists pg_cron;
create extension if not exists pg_net;


-- 2. Cle de service dans le Vault -------------------------------------
-- La cle service_role ne doit PAS etre ecrite en clair dans la definition
-- du cron : elle serait lisible par toute personne ayant acces a la table
-- cron.job. On la range dans le Vault, le cron ira la lire a l'execution.
--
-- Remplacez COLLEZ_ICI_LA_CLE_SERVICE_ROLE par la valeur trouvee dans
-- Project Settings > API > service_role (celle qui est marquee "secret").

select vault.create_secret(
  'COLLEZ_ICI_LA_CLE_SERVICE_ROLE',
  'service_role_key',
  'Cle service_role utilisee par le cron pour appeler les Edge Functions'
);


-- 3. Planification ----------------------------------------------------
-- Toutes les minutes. unschedule d'abord pour rester relancable.

select cron.unschedule('meta-process-queue')
where exists (select 1 from cron.job where jobname = 'meta-process-queue');

select cron.schedule(
  'meta-process-queue',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://ywvmrjxvooztubdcsxsh.supabase.co/functions/v1/meta-process-queue',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'service_role_key'
        limit 1
      )
    ),
    body    := '{}'::jsonb
  );
  $$
);


-- 4. Verification -----------------------------------------------------
-- Le job doit apparaitre, actif, avec la planification '* * * * *'.

select jobid, jobname, schedule, active from cron.job where jobname = 'meta-process-queue';


-- =====================================================================
-- Pour surveiller ensuite
-- =====================================================================
--
-- Etat de la file :
--
--   select processing_status, count(*), max(received_at)
--   from webhook_events
--   where provider = 'meta'
--   group by processing_status;
--
-- Leads bloques (backoff epuise apres 6 tentatives) :
--
--   select external_event_id, processing_attempts, error_message, received_at
--   from webhook_events
--   where provider = 'meta' and processing_status = 'error'
--     and next_attempt_at is null
--   order by received_at desc;
--
-- Noms de champs reellement envoyes par Meta pour votre formulaire
-- (a lire au premier lead recu, pour regler le mapping sans deviner) :
--
--   select external_event_id, payload -> 'champs_recus'
--   from webhook_events
--   where provider = 'meta' and processing_status = 'processed'
--   order by received_at desc
--   limit 5;
--
-- Dernieres executions du cron :
--
--   select status, return_message, start_time
--   from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'meta-process-queue')
--   order by start_time desc
--   limit 10;
