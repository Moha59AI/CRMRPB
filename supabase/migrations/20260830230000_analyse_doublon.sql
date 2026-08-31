/*
# Distinguer un doublon d'un client fidèle

## Le problème

`checkDuplicateLead` comparait les téléphones **bruts** : « +33 6 12 34 56 78 »
et « 0612345678 » ne se rencontraient jamais. Le contrôle passait donc à côté
de la majorité des cas, précisément ceux qui comptent — un lead Meta arrive au
format international, une saisie manuelle au format national.

Et surtout, il traitait toute répétition comme une anomalie. Or depuis que le
modèle est contact 1 ── N leads, deux leads sur le même numéro sont souvent
légitimes : c'est un client qui revient.

## La distinction

**Doublon** — une autre intervention du même client est encore *ouverte* et
date de moins de trente jours. Le client a rempli le formulaire deux fois, ou
il est arrivé par Meta *et* par le site. Il faut fusionner, pas rappeler deux
fois la même personne.

**Client fidèle** — les autres interventions sont closes, ou anciennes. Rien à
corriger : c'est un bon signe, et le conseiller doit le savoir avant de
décrocher.

Le seuil de trente jours correspond au cycle d'un dossier vitrage : au-delà,
une nouvelle demande est une nouvelle affaire.
*/

create or replace function public.analyser_doublon(
  p_workspace_id uuid,
  p_phone text,
  p_email text,
  p_exclude_lead_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with cible as (
    select public.normaliser_telephone(p_phone) as tel,
           nullif(lower(trim(p_email)), '')     as email
  ),
  autres as (
    select l.id, l.status, coalesce(l.received_at, l.created_at) as recu
    from leads l, cible c
    where l.workspace_id = p_workspace_id
      and (p_exclude_lead_id is null or l.id <> p_exclude_lead_id)
      and (
        (c.tel is not null and public.normaliser_telephone(l.phone) = c.tel)
        or (c.email is not null and lower(l.email) = c.email)
      )
  ),
  -- Une intervention encore ouverte et recente : le client s'est inscrit deux
  -- fois pour la meme chose.
  ouvert as (
    select * from autres
    where status not in ('converted', 'lost')
      and recu > now() - interval '30 days'
    order by recu desc
    limit 1
  ),
  dernier as (select * from autres order by recu desc limit 1)
  select case
    when (select count(*) from autres) = 0
      then jsonb_build_object('type', 'aucun')
    when exists (select 1 from ouvert)
      then jsonb_build_object(
        'type', 'doublon',
        'nb_autres', (select count(*) from autres),
        'lead_id',   (select id from ouvert),
        'statut',    (select status from ouvert),
        'jours',     (select extract(day from now() - recu)::integer from ouvert))
    else jsonb_build_object(
      'type', 'client_fidele',
      'nb_autres', (select count(*) from autres),
      'lead_id',   (select id from dernier),
      'statut',    (select status from dernier),
      'jours',     (select extract(day from now() - recu)::integer from dernier))
  end;
$$;

grant execute on function public.analyser_doublon(uuid, text, text, uuid) to authenticated;
