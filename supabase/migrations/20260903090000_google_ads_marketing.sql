/*
# Pilotage Google Ads du clic a l'intervention

Google Ads sait compter les clics et la depense, mais pas ce qui se passe
ensuite dans le CRM. Cette migration conserve les statistiques quotidiennes
par campagne et ajoute aux leads les identifiants de clic necessaires pour
relier une publicite a un rendez-vous puis a une intervention.

Les secrets OAuth ne figurent dans aucune de ces tables. Ils restent dans
Supabase Vault ; integration_connections ne porte que les identifiants non
secrets et les references de configuration.
*/

alter table public.leads
  add column if not exists gclid text,
  add column if not exists gbraid text,
  add column if not exists wbraid text,
  add column if not exists google_campaign_id text,
  add column if not exists google_ad_group_id text,
  add column if not exists google_ad_id text;

comment on column public.leads.gclid is
  'Identifiant de clic Google Ads transmis par le site. Permet une attribution exacte et les conversions hors ligne.';
comment on column public.leads.gbraid is
  'Identifiant Google Ads pour certains parcours iOS applicatifs.';
comment on column public.leads.wbraid is
  'Identifiant Google Ads pour certains parcours iOS web.';

create index if not exists leads_gclid_idx on public.leads (workspace_id, gclid)
  where gclid is not null;
create index if not exists leads_google_campaign_idx
  on public.leads (workspace_id, google_campaign_id, arrive_le desc)
  where google_campaign_id is not null;


-- ============ STATISTIQUES QUOTIDIENNES GOOGLE ADS ============

create table if not exists public.google_ads_daily_metrics (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  customer_id text not null,
  metric_date date not null,
  campaign_id text not null,
  campaign_name text not null,
  campaign_status text,
  impressions bigint not null default 0 check (impressions >= 0),
  clicks bigint not null default 0 check (clicks >= 0),
  cost_micros bigint not null default 0 check (cost_micros >= 0),
  conversions numeric not null default 0 check (conversions >= 0),
  conversion_value numeric not null default 0,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, metric_date, campaign_id)
);

comment on table public.google_ads_daily_metrics is
  'Mesures Google Ads par campagne et par jour. Les resultats CRM sont recalcules depuis leads, appointments et windscreen_cases.';

alter table public.google_ads_daily_metrics enable row level security;

create index if not exists google_ads_metrics_workspace_date_idx
  on public.google_ads_daily_metrics (workspace_id, metric_date desc);
create index if not exists google_ads_metrics_campaign_idx
  on public.google_ads_daily_metrics (workspace_id, campaign_id, metric_date desc);

drop policy if exists "select_google_ads_daily_metrics" on public.google_ads_daily_metrics;
create policy "select_google_ads_daily_metrics" on public.google_ads_daily_metrics
  for select to authenticated
  using (
    workspace_id = public.get_workspace_id()
    and public.a_role(array['admin', 'manager', 'advisor'])
  );

drop policy if exists "insert_google_ads_daily_metrics" on public.google_ads_daily_metrics;
create policy "insert_google_ads_daily_metrics" on public.google_ads_daily_metrics
  for insert to authenticated
  with check (
    workspace_id = public.get_workspace_id()
    and public.a_role(array['admin'])
  );

drop policy if exists "update_google_ads_daily_metrics" on public.google_ads_daily_metrics;
create policy "update_google_ads_daily_metrics" on public.google_ads_daily_metrics
  for update to authenticated
  using (
    workspace_id = public.get_workspace_id()
    and public.a_role(array['admin'])
  )
  with check (
    workspace_id = public.get_workspace_id()
    and public.a_role(array['admin'])
  );

drop policy if exists "delete_google_ads_daily_metrics" on public.google_ads_daily_metrics;
create policy "delete_google_ads_daily_metrics" on public.google_ads_daily_metrics
  for delete to authenticated
  using (
    workspace_id = public.get_workspace_id()
    and public.a_role(array['admin'])
  );


-- ============ ETAT OAUTH EPHEMERE ============
-- La valeur recue par Google n'est jamais stockee : seul son condensat l'est.
-- Aucune politique n'autorise le navigateur a lire ces lignes. Les Edge
-- Functions utilisent la cle service_role, qui contourne la RLS.

create table if not exists public.google_ads_oauth_states (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  state_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.google_ads_oauth_states enable row level security;

drop policy if exists "select_google_ads_oauth_states" on public.google_ads_oauth_states;
create policy "select_google_ads_oauth_states" on public.google_ads_oauth_states
  for select to authenticated using (false);
drop policy if exists "insert_google_ads_oauth_states" on public.google_ads_oauth_states;
create policy "insert_google_ads_oauth_states" on public.google_ads_oauth_states
  for insert to authenticated with check (false);
drop policy if exists "update_google_ads_oauth_states" on public.google_ads_oauth_states;
create policy "update_google_ads_oauth_states" on public.google_ads_oauth_states
  for update to authenticated using (false) with check (false);
drop policy if exists "delete_google_ads_oauth_states" on public.google_ads_oauth_states;
create policy "delete_google_ads_oauth_states" on public.google_ads_oauth_states
  for delete to authenticated using (false);

create index if not exists google_ads_oauth_states_expiry_idx
  on public.google_ads_oauth_states (expires_at);


-- ============ ENTREE WEBHOOK ENRICHIE ============
-- Supprimer l'ancienne signature evite deux surcharges toutes deux valides
-- quand Meta n'envoie que ses parametres nommes.

do $$
declare
  fonction regprocedure;
begin
  for fonction in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'upsert_lead_from_webhook'
  loop
    execute 'drop function ' || fonction;
  end loop;
end $$;

create function public.upsert_lead_from_webhook(
  p_workspace_id uuid,
  p_first_name text default null,
  p_last_name text default null,
  p_phone text default null,
  p_email text default null,
  p_address text default null,
  p_city text default null,
  p_postal_code text default null,
  p_citycode text default null,
  p_vehicle_registration text default null,
  p_vehicle_make text default null,
  p_vehicle_model text default null,
  p_source text default 'meta',
  p_meta_lead_id text default null,
  p_meta_page_id text default null,
  p_meta_form_id text default null,
  p_meta_ad_id text default null,
  p_meta_adset_id text default null,
  p_meta_campaign_id text default null,
  p_fbclid text default null,
  p_fbc text default null,
  p_fbp text default null,
  p_gclid text default null,
  p_gbraid text default null,
  p_wbraid text default null,
  p_google_campaign_id text default null,
  p_google_ad_group_id text default null,
  p_google_ad_id text default null,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null,
  p_utm_content text default null,
  p_utm_term text default null,
  p_raw_payload jsonb default null,
  p_received_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_id uuid;
begin
  if p_meta_lead_id is not null then
    select id into v_lead_id
    from public.leads
    where workspace_id = p_workspace_id and meta_lead_id = p_meta_lead_id
    limit 1;
  end if;

  if v_lead_id is not null then
    update public.leads set
      first_name = coalesce(p_first_name, first_name),
      last_name = coalesce(p_last_name, last_name),
      phone = coalesce(p_phone, phone),
      email = coalesce(p_email, email),
      address = coalesce(p_address, address),
      city = coalesce(p_city, city),
      postal_code = coalesce(p_postal_code, postal_code),
      citycode = coalesce(p_citycode, citycode),
      vehicle_registration = coalesce(p_vehicle_registration, vehicle_registration),
      vehicle_make = coalesce(p_vehicle_make, vehicle_make),
      vehicle_model = coalesce(p_vehicle_model, vehicle_model),
      gclid = coalesce(p_gclid, gclid),
      gbraid = coalesce(p_gbraid, gbraid),
      wbraid = coalesce(p_wbraid, wbraid),
      google_campaign_id = coalesce(p_google_campaign_id, google_campaign_id),
      google_ad_group_id = coalesce(p_google_ad_group_id, google_ad_group_id),
      google_ad_id = coalesce(p_google_ad_id, google_ad_id),
      raw_payload = coalesce(p_raw_payload, raw_payload),
      updated_at = now()
    where id = v_lead_id;
    return v_lead_id;
  end if;

  insert into public.leads (
    workspace_id, first_name, last_name, phone, email, address, city,
    postal_code, citycode, vehicle_registration, vehicle_make, vehicle_model,
    source, meta_lead_id, meta_page_id, meta_form_id, meta_ad_id,
    meta_adset_id, meta_campaign_id, fbclid, fbc, fbp, gclid, gbraid, wbraid,
    google_campaign_id, google_ad_group_id, google_ad_id, utm_source,
    utm_medium, utm_campaign, utm_content, utm_term, raw_payload, received_at
  ) values (
    p_workspace_id, p_first_name, p_last_name, p_phone, p_email, p_address,
    p_city, p_postal_code, p_citycode, p_vehicle_registration, p_vehicle_make,
    p_vehicle_model, p_source, p_meta_lead_id, p_meta_page_id, p_meta_form_id,
    p_meta_ad_id, p_meta_adset_id, p_meta_campaign_id, p_fbclid, p_fbc, p_fbp,
    p_gclid, p_gbraid, p_wbraid, p_google_campaign_id, p_google_ad_group_id,
    p_google_ad_id, p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content,
    p_utm_term, p_raw_payload, p_received_at
  ) returning id into v_lead_id;

  return v_lead_id;
end;
$$;

revoke all on function public.upsert_lead_from_webhook from public, anon, authenticated;
grant execute on function public.upsert_lead_from_webhook to service_role;


-- ============ SYNCHRONISATION AUTOMATIQUE ============
-- Reutilise la cle d'automatisation deja configuree pour le worker Meta.
-- L'Edge Function sait aussi etre lancee manuellement depuis la page Marketing.

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job where jobname = 'google-ads-sync' limit 1;
  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end $$;

select cron.schedule(
  'google-ads-sync',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url := (
      select decrypted_secret from vault.decrypted_secrets
      where name = 'project_url' limit 1
    ) || '/functions/v1/google-ads-sync',
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
