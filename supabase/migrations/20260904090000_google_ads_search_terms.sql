/*
# Mots-cles et termes de recherche Google Ads

Le rapport campagne explique combien a ete depense, mais pas pourquoi une
campagne depense. Ce niveau quotidien conserve la requete saisie par
l'internaute et, quand Google le fournit, le mot-cle qui l'a declenche.

Les termes a tres faible volume peuvent etre masques par Google pour des
raisons de confidentialite : cette table ne doit donc jamais etre presentee
comme une liste exhaustive de tous les clics.
*/

create table if not exists public.google_ads_search_terms_daily (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  customer_id text not null,
  metric_date date not null,
  campaign_id text not null,
  campaign_name text not null,
  ad_group_id text not null,
  ad_group_name text not null,
  search_term text not null,
  keyword_text text not null default '',
  keyword_match_type text,
  search_term_match_type text,
  targeting_status text,
  device text not null default 'UNKNOWN',
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  cost_micros bigint not null default 0,
  conversions numeric not null default 0,
  conversion_value numeric not null default 0,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (
    connection_id, metric_date, campaign_id, ad_group_id,
    search_term, keyword_text, device
  )
);

create index if not exists google_ads_search_terms_workspace_date_idx
  on public.google_ads_search_terms_daily (workspace_id, metric_date desc);
create index if not exists google_ads_search_terms_campaign_idx
  on public.google_ads_search_terms_daily (workspace_id, campaign_id);
create index if not exists google_ads_search_terms_search_idx
  on public.google_ads_search_terms_daily using gin (to_tsvector('simple', search_term));

alter table public.google_ads_search_terms_daily enable row level security;

drop policy if exists "select_google_ads_search_terms" on public.google_ads_search_terms_daily;
create policy "select_google_ads_search_terms"
  on public.google_ads_search_terms_daily for select to authenticated
  using (
    workspace_id = public.get_workspace_id()
    and public.a_role(array['admin', 'manager', 'advisor'])
  );

drop policy if exists "insert_google_ads_search_terms" on public.google_ads_search_terms_daily;
create policy "insert_google_ads_search_terms"
  on public.google_ads_search_terms_daily for insert to authenticated
  with check (
    workspace_id = public.get_workspace_id()
    and public.a_role(array['admin'])
  );

drop policy if exists "update_google_ads_search_terms" on public.google_ads_search_terms_daily;
create policy "update_google_ads_search_terms"
  on public.google_ads_search_terms_daily for update to authenticated
  using (
    workspace_id = public.get_workspace_id()
    and public.a_role(array['admin'])
  )
  with check (
    workspace_id = public.get_workspace_id()
    and public.a_role(array['admin'])
  );

drop policy if exists "delete_google_ads_search_terms" on public.google_ads_search_terms_daily;
create policy "delete_google_ads_search_terms"
  on public.google_ads_search_terms_daily for delete to authenticated
  using (
    workspace_id = public.get_workspace_id()
    and public.a_role(array['admin'])
  );

grant select on public.google_ads_search_terms_daily to authenticated;
grant insert, update, delete on public.google_ads_search_terms_daily to authenticated;

drop trigger if exists google_ads_search_terms_updated_at on public.google_ads_search_terms_daily;
create trigger google_ads_search_terms_updated_at
  before update on public.google_ads_search_terms_daily
  for each row execute function public.update_updated_at_column();
