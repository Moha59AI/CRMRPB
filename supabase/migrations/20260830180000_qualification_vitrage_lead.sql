/*
# Champs de qualification vitrage sur les leads

## Pourquoi

`windscreen_cases` porte déjà le détail technique (type de vitrage, capteurs,
caméra ADAS, franchise). Mais ces informations ne s'y trouvent qu'une fois le
dossier créé — c'est-à-dire trop tard.

Or ce sont exactement les questions posées au premier appel : quel vitrage,
quelle assurance, y a-t-il une caméra derrière le pare-brise. La réponse
détermine le prix, la nécessité d'un calibrage, et le reste à charge annoncé
au client. Sans ces champs, le conseiller les notait dans `advisor_notes`, en
texte libre, donc inexploitables.

Ils sont volontairement nullables : un lead qui vient d'arriver n'est pas
encore qualifié, et l'interface doit pouvoir le montrer.
*/

alter table leads add column if not exists glass_type text
  check (glass_type is null or glass_type in (
    'pare_brise', 'lunette_arriere', 'glace_laterale', 'impact', 'autre'
  ));

-- Une caméra derrière le pare-brise impose un calibrage après remplacement :
-- c'est le principal facteur de prix et de durée d'intervention.
alter table leads add column if not exists has_adas_camera boolean;

-- Reste à charge annoncé au client. Nullable tant que l'assurance n'a pas
-- répondu : zéro et « pas encore su » ne sont pas la même chose.
alter table leads add column if not exists franchise_amount numeric(10,2);

comment on column leads.glass_type is 'Vitrage concerné, renseigné à la qualification';
comment on column leads.has_adas_camera is 'Caméra ADAS : impose un calibrage après pose';
comment on column leads.franchise_amount is 'Reste à charge annoncé au client, null si inconnu';
