/*
# Précision de la localisation

## Pourquoi distinguer

La carte des interventions affiche un point par lead. Mais tous les points
n'ont pas la même valeur :

- Un lead dont l'adresse complète a été choisie dans la Base Adresse
  Nationale est positionné **au numéro près**. Le technicien peut s'y fier.
- Un lead dont on ne connaît que la ville est positionné **au centre de la
  commune**. C'est utile pour voir la répartition géographique, mais
  suivre ce point mènerait le technicien devant la mairie.

Afficher les deux à l'identique donnerait une fausse confiance. La carte les
distingue visuellement, et le lien d'itinéraire n'est proposé que pour les
points exacts.

`null` signifie « pas de coordonnées » : le lead n'apparaît pas sur la carte
et figure dans la liste des non localisés, jamais silencieusement absent.
*/

alter table leads
  add column if not exists geo_precision text
    check (geo_precision in ('exact', 'approximatif'));

comment on column leads.geo_precision is
  'exact = adresse au numéro (BAN housenumber/street). approximatif = centre de commune. null = non localisé.';

alter table contacts
  add column if not exists geo_precision text
    check (geo_precision in ('exact', 'approximatif'));

-- La carte ne charge que les leads localises : sans cet index, elle scanne
-- toute la table a chaque ouverture.
create index if not exists leads_localises_idx
  on leads (workspace_id)
  where latitude is not null and longitude is not null;
