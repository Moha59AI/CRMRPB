/*
# Coût réel d'un déplacement

## Ce qui manquait

Le CRM savait où aller — la Base Adresse Nationale pose un point exact sur
chaque intervention depuis `20260901180000_adresse_normalisee`. Il ne savait
pas ce que coûtait d'y aller. Une intervention à 40 km coûte une heure de
route et une vingtaine d'euros de véhicule et de carburant, qui n'apparaissaient
nulle part au moment de dire oui.

## Deux tables, deux rôles

`travel_settings` porte le point de départ et le barème. Rien n'est codé en
dur : le prix du carburant change tous les mois, et un barème faux se
propagerait silencieusement à tous les devis.

Le départ est enregistré **avec ses coordonnées**, prises à la BAN au moment
du choix. C'est ce qui évite de regéocoder la même adresse d'atelier à chaque
trajet calculé.

`travel_routes` est un cache de trajets, pas un journal de rendez-vous. Sa clé
est le couple de coordonnées, pas l'intervention : deux clients de la même rue
partagent la même route, et déménager un client ne salit pas l'ancien calcul,
il le laisse simplement inutilisé. C'est aussi ce qui fait qu'ouvrir dix fois
une fiche n'appelle OpenRouteService qu'une fois.

## Pourquoi les coordonnées sont arrondies

À cinq décimales, un degré vaut environ un mètre. En deçà, la BAN elle-même
ne distingue plus rien, et un trajet recalculé pour un écart d'un micromètre
serait un appel réseau pour rien. L'arrondi est fait à l'écriture comme à la
lecture, donc la clé unique porte sur des valeurs déjà arrondies.

## Pourquoi le barème est recopié sur chaque route

Un trajet garde le barème qui a servi à le chiffrer. Sans cela, changer le
prix du carburant laisserait des montants anciens affichés comme actuels. Le
CRM compare le barème stocké au barème courant : s'ils diffèrent, il refait
l'arithmétique — localement, sans rappeler OpenRouteService, puisque la
distance et la durée, elles, n'ont pas bougé.
*/

begin;

-- ============ BARÈME ET POINT DE DÉPART ============

create table if not exists public.travel_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,

  -- Renseignées depuis la BAN, comme toute adresse du CRM. `depart_label`
  -- garde le libellé affichable complet ; les colonnes séparées servent aux
  -- documents, qui ne veulent pas « 59000 Lille » deux fois.
  depart_label text,
  depart_address text,
  depart_postal_code text,
  depart_city text,
  depart_citycode text,
  depart_latitude double precision,
  depart_longitude double precision,

  fuel_price_per_liter numeric(6, 3) not null default 1.700
    check (fuel_price_per_liter > 0 and fuel_price_per_liter <= 10),
  consumption_l_per_100km numeric(5, 2) not null default 6.50
    check (consumption_l_per_100km > 0 and consumption_l_per_100km <= 50),
  vehicle_cost_per_km numeric(6, 3) not null default 0.200
    check (vehicle_cost_per_km >= 0 and vehicle_cost_per_km <= 10),
  labour_cost_per_hour numeric(7, 2) not null default 20.00
    check (labour_cost_per_hour >= 0 and labour_cost_per_hour <= 500),

  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Une latitude sans longitude ne désigne rien. Les deux ou aucune.
  constraint travel_settings_depart_complet check (
    (depart_latitude is null) = (depart_longitude is null)
  )
);

comment on table public.travel_settings is
  'Point de départ des interventions et barème de coût kilométrique. Un seul jeu par espace de travail.';
comment on column public.travel_settings.depart_latitude is
  'Prise à la Base Adresse Nationale au choix de l''adresse. Jamais regéocodée : c''est elle qui part à OpenRouteService.';

alter table public.travel_settings enable row level security;

-- Lecture ouverte à l'espace de travail : le coût d'un déplacement s'affiche
-- sur la fiche, donc tout le monde doit pouvoir le lire. L'écriture reste aux
-- responsables, parce qu'un barème faux se propage partout sans se signaler.
drop policy if exists "select_travel_settings" on public.travel_settings;
create policy "select_travel_settings"
on public.travel_settings for select to authenticated
using (workspace_id = public.get_workspace_id());

drop policy if exists "insert_travel_settings" on public.travel_settings;
create policy "insert_travel_settings"
on public.travel_settings for insert to authenticated
with check (
  workspace_id = public.get_workspace_id()
  and public.a_role(array['admin', 'manager'])
);

drop policy if exists "update_travel_settings" on public.travel_settings;
create policy "update_travel_settings"
on public.travel_settings for update to authenticated
using (
  workspace_id = public.get_workspace_id()
  and public.a_role(array['admin', 'manager'])
)
with check (
  workspace_id = public.get_workspace_id()
  and public.a_role(array['admin', 'manager'])
);

drop policy if exists "delete_travel_settings" on public.travel_settings;
create policy "delete_travel_settings"
on public.travel_settings for delete to authenticated
using (
  workspace_id = public.get_workspace_id()
  and public.a_role(array['admin'])
);

drop trigger if exists travel_settings_updated_at on public.travel_settings;
create trigger travel_settings_updated_at
before update on public.travel_settings
for each row execute function public.update_updated_at_column();

-- Chaque espace de travail démarre avec le barème par défaut, pour que la
-- page de réglages affiche des valeurs plutôt qu'un formulaire vide.
insert into public.travel_settings (workspace_id)
select w.id from public.workspaces w
on conflict (workspace_id) do nothing;


-- ============ CACHE DES TRAJETS ============

create table if not exists public.travel_routes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,

  -- Clé du cache : les quatre coordonnées, arrondies à 5 décimales (~1 m)
  -- par l'appelant avant écriture comme avant lecture.
  depart_latitude double precision not null,
  depart_longitude double precision not null,
  arrivee_latitude double precision not null,
  arrivee_longitude double precision not null,
  profile text not null default 'driving-car'
    check (profile in ('driving-car', 'driving-hgv')),

  -- Ce que l'adresse valait au moment du calcul. Sert à relire un trajet
  -- archivé sans refaire de géocodage inverse.
  depart_label text,
  arrivee_label text,

  distance_m integer not null check (distance_m >= 0),
  duration_s integer not null check (duration_s >= 0),

  /*
    Tracé réel renvoyé par OpenRouteService : un tableau de [longitude,
    latitude], dans l'ordre de la GeoJSON. Une ligne droite entre les deux
    points serait un mensonge -- elle traverse la Deûle.
  */
  geometry jsonb,

  -- Barème appliqué, recopié pour que le montant reste explicable.
  fuel_price_per_liter numeric(6, 3) not null,
  consumption_l_per_100km numeric(5, 2) not null,
  vehicle_cost_per_km numeric(6, 3) not null,
  labour_cost_per_hour numeric(7, 2) not null,

  fuel_cost numeric(10, 2) not null,
  vehicle_cost numeric(10, 2) not null,
  labour_cost numeric(10, 2) not null,
  total_cost numeric(10, 2) not null,

  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.travel_routes is
  'Cache des itinéraires OpenRouteService, indexé par couple de coordonnées. Un trajet partagé par plusieurs clients n''est calculé qu''une fois.';
comment on column public.travel_routes.geometry is
  'Tracé routier réel, tableau de [longitude, latitude]. null quand la géométrie n''a pas pu être lue : le reste du calcul tient quand même.';

-- Clé du cache. C'est elle qui garantit qu'on ne rappelle pas
-- OpenRouteService pour un trajet déjà connu.
create unique index if not exists travel_routes_cle_idx
  on public.travel_routes (
    workspace_id, profile,
    depart_latitude, depart_longitude,
    arrivee_latitude, arrivee_longitude
  );

alter table public.travel_routes enable row level security;

drop policy if exists "select_travel_routes" on public.travel_routes;
create policy "select_travel_routes"
on public.travel_routes for select to authenticated
using (workspace_id = public.get_workspace_id());

-- L'insertion et la mise à jour passent par l'Edge Function, qui détient la
-- clé OpenRouteService et utilise la service role key. Les politiques
-- `authenticated` existent pour le rafraîchissement des montants quand seul
-- le barème a changé : cette arithmétique-là ne demande aucun appel externe.
drop policy if exists "insert_travel_routes" on public.travel_routes;
create policy "insert_travel_routes"
on public.travel_routes for insert to authenticated
with check (workspace_id = public.get_workspace_id());

drop policy if exists "update_travel_routes" on public.travel_routes;
create policy "update_travel_routes"
on public.travel_routes for update to authenticated
using (workspace_id = public.get_workspace_id())
with check (workspace_id = public.get_workspace_id());

drop policy if exists "delete_travel_routes" on public.travel_routes;
create policy "delete_travel_routes"
on public.travel_routes for delete to authenticated
using (
  workspace_id = public.get_workspace_id()
  and public.a_role(array['admin', 'manager'])
);

commit;
