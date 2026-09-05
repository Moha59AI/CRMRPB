/*
# Historique Google Ads issu d'Onify depuis le 24/08/2026

Onify ne conserve pas les identifiants de clic Google pour cet historique.
Les leads sont donc ranges dans une campagne CRM non attribuee, sans inventer
de gclid ni de campagne Google. Un dossier Glass lie vaut transformation CRM,
mais ne vaut pas intervention realisee.

L'identifiant Onify reste dans raw_payload et l'index partiel rend cet import
rejouable sans creer de doublons.
*/

create unique index if not exists leads_onify_lead_id_unique
  on public.leads (workspace_id, ((raw_payload ->> 'onify_lead_id')))
  where raw_payload ? 'onify_lead_id';

do $$
begin
  if not exists (
    select 1 from public.integration_connections where provider = 'google'
  ) then
    raise exception 'Aucun espace de travail avec une connexion Google Ads';
  end if;
end $$;

with source_data (
  onify_lead_id, first_name, last_name, phone, received_at,
  original_channel, original_stage, glass_dossier_id, glass_label
) as (
  values
    ('3048', 'Jean', 'Dupont', null, '2026-09-03 12:22:00+02'::timestamptz, 'webhook', 'Nouveau', null, null),
    ('3015', 'Guillaume', 'Verhaeghe', '+33620543626', '2026-09-02 15:32:00+02'::timestamptz, 'webhook', 'Nouveau', null, null),
    ('3000', 'Maxime', 'Ouarrak', '+33650128530', '2026-09-01 19:20:00+02'::timestamptz, 'webhook', 'Nouveau', null, null),
    ('2977', 'Florent', 'Morelle', '+33641811757', '2026-09-01 04:54:00+02'::timestamptz, 'webhook', 'Nouveau', null, null),
    ('2957', 'Lounis', 'Achour', '+33782335518', '2026-08-31 18:37:00+02'::timestamptz, 'webhook', 'Nouveau', null, null),
    ('2932', 'test', 'RELAIS PARE BRISE', null, '2026-08-31 08:14:00+02'::timestamptz, 'webhook', 'Nouveau', null, null),
    ('2931', 'test', 'test', null, '2026-08-31 08:13:00+02'::timestamptz, 'webhook', 'Nouveau', null, null),
    ('2927', 'test', 'teste', null, '2026-08-30 23:27:00+02'::timestamptz, 'webhook', 'Nouveau', null, null),
    ('2923', 'Julien', 'Gyselinck', '+33679851006', '2026-08-30 17:59:00+02'::timestamptz, 'webhook', 'ATTENTE DOC', '9186', 'FM-472-RN · TOYOTA YARIS III'),
    ('2915', 'Relais', 'Pare brise', '+33658508580', '2026-08-30 10:07:00+02'::timestamptz, 'webhook', 'Nouveau', null, null),
    ('2857', 'Christophe', 'Ansart', '+33786647571', '2026-08-28 10:11:00+02'::timestamptz, 'webhook', 'ATTENTE DOC', null, null),
    ('2747', 'Pauline', 'Kasprzyk bleauwart', '+33619668718', '2026-08-25 10:04:00+02'::timestamptz, 'webhook', 'RDV PRIS', null, null),
    ('2745', 'Maite', 'Piovi', '+33772502159', '2026-08-25 09:34:00+02'::timestamptz, 'webhook', 'CLOTURE', '9003', 'FE-659-BD · PEUGEOT 3008'),
    ('2741', 'Dahlia', 'Bouhaddioui', '+33767665614', '2026-08-25 01:59:00+02'::timestamptz, 'webhook', 'CLOTURE', '9008', 'EK-460-YL · CITROEN JUMPY'),
    ('3070', 'herve', 'lienard', '+33649773983', '2026-09-04 12:10:00+02'::timestamptz, 'Au téléphone', 'ATTENTE DOC', '9364', 'BQ753MH · CITROEN C4 PICASSO'),
    ('2979', 'Mohammed', 'el idrissi', '+33609830803', '2026-09-01 10:33:00+02'::timestamptz, 'Au téléphone', 'ATTENTE DOC', '9240', 'BD-570-SY · PEUGEOT 207'),
    ('2941', 'majid', 'RACHIDA', '+33760981901', '2026-08-31 11:14:00+02'::timestamptz, 'Au téléphone', 'ATTENTE DOC', null, null),
    ('2937', 'Caroline', 'AZZOUZ', '+33615156339', '2026-08-31 10:18:00+02'::timestamptz, 'Au téléphone', 'ATTENTE DOC', '9193', 'HF-124-AX · CITROEN C2'),
    ('2809', null, 'Demestre', '+33768191909', '2026-08-26 15:00:00+02'::timestamptz, 'Au téléphone', 'NRP', null, null)
), target_workspace as (
  select workspace_id
  from public.integration_connections
  where provider = 'google'
  order by updated_at desc
  limit 1
)
insert into public.leads (
  workspace_id, first_name, last_name, phone, source, status,
  campaign_name, utm_source, utm_medium, utm_campaign,
  raw_payload, received_at, created_at, updated_at
)
select
  workspace_id,
  first_name,
  last_name,
  phone,
  'import',
  case
    when glass_dossier_id is not null then 'converted'
    when original_stage = 'RDV PRIS' then 'appointment_scheduled'
    when original_stage = 'ATTENTE DOC' then 'documents_requested'
    when original_stage = 'NRP' then 'nrp'
    else 'new'
  end,
  'Historique Onify - Google Ads',
  'google',
  case when original_channel = 'webhook' then 'onify_webhook' else 'onify_telephone' end,
  'Historique Onify - Google Ads',
  jsonb_build_object(
    'import_source', 'onify',
    'onify_lead_id', onify_lead_id,
    'onify_channel', original_channel,
    'onify_stage', original_stage,
    'onify_glass_dossier_id', glass_dossier_id,
    'onify_glass_label', glass_label,
    'imported_as_google_ads', true,
    'imported_at', now()
  ),
  received_at,
  received_at,
  now()
from source_data
cross join target_workspace
on conflict do nothing;

-- Controle attendu : 19 leads Google historiques, dont 6 transformes.
select
  count(*) as leads_google_onify,
  count(*) filter (where status = 'converted') as dossiers_glass
from public.leads
where raw_payload ->> 'import_source' = 'onify'
  and raw_payload ->> 'imported_as_google_ads' = 'true'
  and received_at >= '2026-08-24 00:00:00+02'::timestamptz;
