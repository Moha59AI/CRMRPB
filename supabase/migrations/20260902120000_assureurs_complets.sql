/*
# Assureurs : ce qu'il faut vraiment savoir d'eux

## Le manque

La table `insurers` ne portait qu'un nom, un téléphone, un email et une
adresse — et aucun écran ne permettait d'en créer. La liste déroulante de la
fiche dossier était donc vide, et la seule façon d'ajouter un assureur était
le SQL Editor.

## Ce qu'un atelier vitrage a besoin de savoir

Trois informations reviennent à chaque dossier et n'avaient nulle part où
vivre :

- **La franchise habituelle.** C'est la première question du client au
  téléphone. La retrouver de mémoire, assureur par assureur, fait perdre du
  temps et donne des réponses qui varient d'un conseiller à l'autre.
- **Le numéro de convention.** Il conditionne la prise en charge directe et
  se retape sur chaque déclaration.
- **La ligne sinistre**, distincte du standard : ce n'est pas le même numéro,
  et appeler le mauvais fait perdre un quart d'heure.

## Désactiver plutôt que supprimer

`actif` permet de retirer un assureur des listes sans casser les dossiers qui
le référencent. Une suppression ferait perdre l'information sur des dossiers
clos, alors qu'un assureur qu'on ne démarche plus reste un assureur qu'on a
connu.
*/

alter table public.insurers
  add column if not exists claims_phone text,
  add column if not exists claims_email text,
  add column if not exists agreement_number text,
  add column if not exists default_franchise numeric(10, 2),
  add column if not exists notes text,
  add column if not exists actif boolean not null default true;

comment on column public.insurers.default_franchise is
  'Franchise habituelle, en euros. Proposee par defaut a la qualification, jamais imposee : un contrat peut y deroger.';
comment on column public.insurers.agreement_number is
  'Numero de convention conditionnant la prise en charge directe.';
comment on column public.insurers.claims_phone is
  'Ligne de declaration de sinistre, distincte du standard.';
comment on column public.insurers.actif is
  'false retire l''assureur des listes sans casser les dossiers qui le referencent.';

-- Deux « AXA » dans la liste rendraient le choix arbitraire et fausseraient
-- tout regroupement par assureur.
create unique index if not exists insurers_nom_unique
  on public.insurers (workspace_id, lower(name));

create index if not exists insurers_actifs_idx
  on public.insurers (workspace_id, name)
  where actif;
