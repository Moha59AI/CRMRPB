/*
# Les interventions reprises de Google en étaient bien

## Le problème

Les rendez-vous se posent dans Google Agenda, et le CRM les importe. L'import
les écrivait tous en `type = 'other'` — c'est-à-dire : aucun n'est une
intervention.

La carte ne charge que `type = 'intervention'`. Sur la semaine du 5 au 11
octobre 2026, cinq rendez-vous étaient posés, tous avec une adresse, et la
carte affichait « Aucune intervention sur la période ». La reprise en lot des
coordonnées filtre de la même façon : elle ne les voyait pas non plus, donc
même en changeant de vue, rien n'aurait pu apparaître.

Sur l'ensemble de la base : 54 rendez-vous en `other`, dont 50 portent une
plaque d'immatriculation dans leur titre et une adresse postale. Contre 5 en
`intervention`, tous antérieurs au 14 septembre.

## La règle

Elle n'est pas inventée pour l'occasion. L'atelier écrit la plaque entre
parenthèses dans le titre, et c'est déjà de cette convention que
`rattacher_rendez_vous_clients` se sert pour retrouver le client d'un
rendez-vous repris de Google. Un titre qui annonce « Intervention » compte
aussi : il ne lui manque qu'un lieu.

Un « Rappel — … » n'est pas une intervention et reste `other`.

La même règle est appliquée à l'import, dans `google-calendar-sync`, pour que
le problème ne revienne pas au prochain rendez-vous posé.

## Ce que ça ne fait pas

Ça ne pose aucune coordonnée. Géocoder depuis une migration demanderait un
appel réseau par ligne, ce que SQL ne sait pas faire et ce que ce fichier ne
doit pas prétendre faire.

Les 50 rendez-vous repris avaient une adresse mais pas de point. Ils ont été
localisés séparément, par la Base Adresse Nationale et selon les mêmes règles
que `localiserRendezVousManquants` : 48 placés, 2 adresses introuvables dans
le référentiel. Les suivants passeront par le bouton « Localiser » de la
carte, qui fait exactement ce travail sur la période affichée.
*/

begin;

update public.appointments
set type = 'intervention'
where type = 'other'
  and (
    -- La plaque entre parenthèses : « Pare-brise Clio (AB-123-CD) ».
    regexp_match(title, '\(([A-Za-z0-9 -]{5,12})\)') is not null
    or title ~* '^\s*intervention\M'
  );

commit;
