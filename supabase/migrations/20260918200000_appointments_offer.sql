/*
# Cadeau / offre annoncé sur le rendez-vous

## Le problème

Le cadeau promis au client — « PS5 », « Virement jusqu'à 300 € » — vit sur
le lead, une offre par intervention. C'est le bon endroit. Mais les
rendez-vous repris de Google Agenda sont rattachés à un **contact**, jamais
à un lead : pour eux, il n'existe aucun endroit où écrire le cadeau, ni chez
nous ni dans ce que l'API Onify expose. Le technicien arrive sans savoir ce
que le client attend.

## La règle

Le rendez-vous reçoit son propre champ. Il ne sert **que** lorsqu'aucun lead
n'est rattaché. Dès qu'un lead existe, c'est l'offre du lead qui fait foi et
qui s'écrit : deux endroits pour une même information, c'est un désaccord
en attente, on le limite au cas où il n'y a pas le choix.
*/

alter table public.appointments
  add column if not exists offer text;

comment on column public.appointments.offer is
  'Cadeau / offre annoncé pour ce rendez-vous. Utilisé seulement sans lead rattaché ; sinon leads.offer fait foi.';
