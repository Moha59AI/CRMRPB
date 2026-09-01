/*
# Adresses normalisées via la Base Adresse Nationale

## Le problème

`leads` ne portait que `city`, saisi à la main pendant l'appel. Deux
conséquences concrètes :

- La même commune s'écrit de dix façons (« Villeneuve d'Ascq »,
  « villeneuve-dascq », « VILLENEUVE D ASCQ »), donc aucun regroupement ni
  filtrage par zone n'est fiable.
- Un technicien qui part en intervention n'a ni adresse complète ni
  coordonnées : il retape ce qu'il devine dans son GPS.

`contacts` avait `address`, `city` et `postal_code`, mais rien qui permette
de rattacher deux orthographes à la même commune.

## Ce qu'apporte le code INSEE

`citycode` est l'identifiant INSEE de la commune, stable et sans ambiguïté.
C'est lui qui rend le filtrage par zone d'intervention exact, là où une
comparaison de chaînes échoue dès le premier accent.

Les coordonnées sont stockées en WGS84. Attention à l'ordre : la BAN renvoie
`[longitude, latitude]`, l'inverse de l'habitude.

## Pourquoi pas de contrainte

Toutes les adresses ne sont pas dans la BAN — zones neuves, lieux-dits,
chantiers. La saisie libre reste donc acceptée : ces colonnes se remplissent
quand la personne choisit une suggestion, et restent nulles sinon.
*/

-- ============ LEADS ============
-- L'adresse de l'intervention. Un lead = une intervention, donc elle vit ici
-- et non uniquement sur le client : deux interventions d'un même client
-- peuvent avoir lieu a deux adresses (domicile, puis lieu de travail).

alter table leads
  add column if not exists address text,
  add column if not exists postal_code text,
  add column if not exists citycode text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

comment on column leads.citycode is
  'Code INSEE de la commune, renseigné par la Base Adresse Nationale. Sert au filtrage par zone.';

create index if not exists leads_citycode_idx on leads (citycode)
  where citycode is not null;


-- ============ CONTACTS ============

alter table contacts
  add column if not exists citycode text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

comment on column contacts.citycode is
  'Code INSEE de la commune, renseigné par la Base Adresse Nationale.';

create index if not exists contacts_citycode_idx on contacts (citycode)
  where citycode is not null;


-- ============ REPRISE DE L'EXISTANT ============
-- Les leads deja recus gardent leur `city` saisi a la main : on ne devine pas
-- un code INSEE a partir d'une chaine approximative, et une correspondance
-- fausse serait pire que l'absence de donnee. Ils se normaliseront a la
-- prochaine modification de la fiche.
