/*
  Catalogue des vues 3D de vehicules

  La marque et le modele restent ceux du dossier Glass Onify. La table ne
  remplace jamais ces donnees metier : elle memorise uniquement le modele 3D
  public qui leur correspond, avec sa source et sa licence.
*/

begin;

create table if not exists public.vehicle_3d_models (
  id uuid primary key default gen_random_uuid(),
  make text not null,
  model text not null,
  make_normalized text not null,
  model_normalized text not null,
  provider text not null default 'sketchfab',
  provider_model_id text,
  status text not null default 'available',
  title text,
  embed_url text,
  viewer_url text,
  thumbnail_url text,
  author_name text,
  author_url text,
  license_label text,
  source_query text not null,
  match_score integer,
  last_checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_3d_models_status_check
    check (status in ('available', 'unavailable')),
  constraint vehicle_3d_models_available_check
    check (
      status = 'unavailable'
      or (
        provider_model_id is not null
        and embed_url is not null
        and viewer_url is not null
      )
    )
);

comment on table public.vehicle_3d_models is
  'Correspondances marque-modele vers une vue 3D publique, avec attribution et licence.';
comment on column public.vehicle_3d_models.status is
  'available si un modele exact et exploitable a ete trouve, unavailable sinon.';

create unique index if not exists vehicle_3d_models_vehicle_unique
  on public.vehicle_3d_models (make_normalized, model_normalized);
create index if not exists vehicle_3d_models_checked_idx
  on public.vehicle_3d_models (last_checked_at desc);

alter table public.vehicle_3d_models enable row level security;

drop policy if exists "select_vehicle_3d_models" on public.vehicle_3d_models;
create policy "select_vehicle_3d_models"
on public.vehicle_3d_models for select to authenticated
using (true);

drop policy if exists "insert_vehicle_3d_models" on public.vehicle_3d_models;
create policy "insert_vehicle_3d_models"
on public.vehicle_3d_models for insert to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

drop policy if exists "update_vehicle_3d_models" on public.vehicle_3d_models;
create policy "update_vehicle_3d_models"
on public.vehicle_3d_models for update to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

drop policy if exists "delete_vehicle_3d_models" on public.vehicle_3d_models;
create policy "delete_vehicle_3d_models"
on public.vehicle_3d_models for delete to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

grant select, insert, update, delete on public.vehicle_3d_models to authenticated;

drop trigger if exists vehicle_3d_models_updated_at on public.vehicle_3d_models;
create trigger vehicle_3d_models_updated_at
before update on public.vehicle_3d_models
for each row execute function public.update_updated_at_column();

commit;
