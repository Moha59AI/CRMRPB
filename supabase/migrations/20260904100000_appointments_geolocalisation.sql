/*
# Coordonnées propres au rendez-vous

## Le problème

Un rendez-vous porte déjà son adresse (`appointments.address`) : une
intervention peut avoir lieu ailleurs qu'au domicile du client — sur son lieu
de travail, chez un concessionnaire. Mais il n'avait pas de coordonnées.

La carte affichait donc l'adresse du rendez-vous dans l'infobulle, tout en
plaçant le marqueur sur les coordonnées du **lead**. Pire, le lien
« Itinéraire » est construit en priorité à partir des coordonnées : un
technicien qui le suivait partait au domicile du client alors que l'infobulle
lui annonçait une autre adresse.

Un point faux est plus dangereux qu'une absence de point : il ne se signale
pas.

## La correction

Le rendez-vous porte désormais ses propres coordonnées, renseignées quand
l'adresse est choisie dans la Base Adresse Nationale — le composant de saisie
les fournissait déjà, le formulaire les jetait.

Règle appliquée côté lecture : un rendez-vous qui a sa propre adresse mais pas
ses propres coordonnées n'emprunte plus celles du lead. Il est compté comme
non localisé et listé comme tel.

`geo_precision` suit la même convention que `leads` :
`exact` = au numéro près, `approximatif` = centre de commune, `null` = non
localisé.
*/

alter table public.appointments
  add column if not exists citycode text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists geo_precision text;

-- Contrainte posée à part : `add column ... check` échouerait au rejeu si la
-- colonne existe déjà sans la contrainte.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'appointments_geo_precision_check'
  ) then
    alter table public.appointments
      add constraint appointments_geo_precision_check
      check (geo_precision in ('exact', 'approximatif'));
  end if;
end $$;

comment on column public.appointments.latitude is
  'Coordonnées du lieu du rendez-vous, indépendantes de celles du lead. Renseignées depuis la BAN à la saisie de l''adresse.';
comment on column public.appointments.geo_precision is
  'exact = adresse au numéro (BAN housenumber/street). approximatif = centre de commune. null = non localisé.';

-- La carte ne charge que les rendez-vous d'intervention localisés : sans cet
-- index elle scanne toute la table à chaque ouverture.
create index if not exists appointments_localises_idx
  on public.appointments (workspace_id, start_time)
  where latitude is not null and longitude is not null;
