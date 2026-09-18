/*
# Assemblage d'une adresse sans répétition

Rue, code postal et ville étaient concaténés tels quels. Quand la rue
contenait déjà « 62440 Harnes » — cas d'un lead arrivé avec ce seul
renseignement — on obtenait « 62440 Harnes 62440 Harnes ».

La fonction `adresse_complete` est déclarée avec le rattachement, qui
l'utilise. Ici, on répare ce que l'ancien assemblage a déjà produit.
*/


-- Répare les adresses déjà doublées par l'ancien assemblage.
update public.appointments
   set address = (regexp_match(address, '^(.+?) \1$'))[1]
 where address ~ '^(.+?) \1$';

update public.leads
   set address = (regexp_match(address, '^(.+?) \1$'))[1]
 where address ~ '^(.+?) \1$';
