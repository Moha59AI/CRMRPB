/*
# Index d'unicite non partiel sur webhook_events

## Probleme resolu

La migration 20260828100000 creait l'index d'idempotence en partiel :

  create unique index ... on webhook_events (workspace_id, provider, external_event_id)
    where external_event_id is not null;

PostgreSQL ne peut pas inferer un index PARTIEL pour un ON CONFLICT : la
clause doit correspondre a un index total, ou a un index partiel dont le
predicat est implique par la requete -- ce que PostgREST ne produit pas.

L'upsert de meta-lead-webhook echouait donc systematiquement (SQLSTATE 42P10),
l'erreur etait avalee par un console.error, et la fonction repondait 200 sans
avoir rien insere. Aucun leadgen_id n'etait mis en file, meme avec une
signature parfaitement valide.

Le predicat etait de toute facon inutile : PostgreSQL considere deja chaque
NULL comme distinct dans un index unique, donc plusieurs lignes sans
external_event_id restent autorisees.
*/

drop index if exists webhook_events_external_id_uniq;

create unique index if not exists webhook_events_external_id_uniq
  on webhook_events (workspace_id, provider, external_event_id);
