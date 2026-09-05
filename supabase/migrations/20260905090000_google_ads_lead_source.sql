/*
# Source de lead Google Ads explicite

Une attribution UTM Google ne suffit pas dans les listes commerciales : la
source principale doit elle aussi afficher Google Ads. Cette migration ajoute
la valeur au vocabulaire autorise et corrige l'import historique Onify sans
toucher aux leads webhook provenant d'autres canaux.
*/

alter table public.leads drop constraint if exists leads_source_check;

alter table public.leads add constraint leads_source_check check (
  source in ('meta', 'google_ads', 'webhook', 'manual', 'import')
);

update public.leads
set source = 'google_ads', updated_at = now()
where raw_payload ->> 'import_source' = 'onify'
  and raw_payload ->> 'imported_as_google_ads' = 'true'
  and source is distinct from 'google_ads';

select
  source,
  count(*) as leads,
  count(*) filter (where status = 'converted') as dossiers_glass
from public.leads
where raw_payload ->> 'import_source' = 'onify'
  and raw_payload ->> 'imported_as_google_ads' = 'true'
group by source;
