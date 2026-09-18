/*
# Rattachement des rendez-vous : devis, puis nom du client

## Le problème

La première version rattachait un rendez-vous à son client par la plaque du
titre, cherchée dans les leads puis dans les factures Onify. Ça couvre les
interventions **passées**. Une intervention **à venir** n'a pas encore de
facture — et c'est précisément celle dont le technicien a besoin de
l'adresse. Ahmed Kacet, intervention le 22 : contact complet en base, rendez-
vous sans rien.

## Ce qui change

Deux sources de plus, dans cet ordre après les précédentes :

3. les **devis Onify**, qui portent aussi la plaque du véhicule ;
4. le **nom** du client dans le titre — « Intervention - AHMED KACET (…) » —
   comparé aux leads puis aux contacts, sans accents, sans casse, et **dans
   les deux ordres** : Onify inverse souvent prénom et nom.

Le nom n'est retenu que s'il désigne **une seule** fiche. Dix noms sont en
double dans les contacts ; un rendez-vous rattaché au mauvais homonyme
enverrait le technicien à la mauvaise adresse, ce qui est pire qu'aucune.
Dans ce cas le rendez-vous reste sans client et se rattache à la main.
*/

create extension if not exists unaccent with schema extensions;

-- Forme canonique d'un nom : sans accents, majuscules, mots triés. « Ahmed
-- Kacet » et « KACET AHMED » donnent la même clé.
create or replace function public.cle_nom(p_nom text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select string_agg(mot, ' ' order by mot)
    from unnest(regexp_split_to_array(upper(unaccent(trim(coalesce(p_nom, '')))), '\s+')) as mot
   where mot <> '';
$$;

create or replace function public.rattacher_rendez_vous_clients(p_workspace_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  n integer := 0;
  n_etape integer;
begin
  -- 1. Lead par plaque.
  with cibles as (
    select a.id as rdv_id, l.id as lead_id, l.contact_id,
           coalesce(
             nullif(trim(concat_ws(' ', l.intervention_address, l.intervention_postal_code, l.intervention_city)), ''),
             nullif(trim(concat_ws(' ', l.address, l.postal_code, l.city)), '')
           ) as adresse
      from public.appointments a
      join public.leads l
        on l.workspace_id = a.workspace_id
       and l.vehicle_registration is not null
       and upper(regexp_replace(l.vehicle_registration, '[^A-Za-z0-9]', '', 'g'))
         = upper(regexp_replace((regexp_match(a.title, '\(([A-Za-z0-9 -]{5,12})\)'))[1], '[^A-Za-z0-9]', '', 'g'))
     where a.workspace_id = p_workspace_id
       and a.lead_id is null and a.contact_id is null and a.status <> 'cancelled'
  )
  update public.appointments a
     set lead_id = c.lead_id, contact_id = coalesce(a.contact_id, c.contact_id),
         address = coalesce(nullif(trim(a.address), ''), c.adresse), updated_at = now()
    from cibles c where a.id = c.rdv_id;
  get diagnostics n_etape = row_count; n := n + n_etape;

  -- 2 et 3. Contact par plaque : facture puis devis Onify.
  with plaques as (
    select distinct on (immat) immat, contact_id
      from (
        select upper(regexp_replace(i.onify_payload->'vehicle'->>'immat', '[^A-Za-z0-9]', '', 'g')) as immat,
               i.contact_id, i.issue_date::timestamptz as quand
          from public.invoices i
         where i.workspace_id = p_workspace_id and i.contact_id is not null
           and i.onify_payload->'vehicle'->>'immat' is not null
        union all
        select upper(regexp_replace(q.onify_payload->'vehicle'->>'immat', '[^A-Za-z0-9]', '', 'g')),
               q.contact_id, q.created_at
          from public.quotes q
         where q.workspace_id = p_workspace_id and q.contact_id is not null
           and q.onify_payload->'vehicle'->>'immat' is not null
      ) f
     where immat <> ''
     order by immat, quand desc
  ),
  cibles as (
    select a.id as rdv_id, p.contact_id,
           nullif(trim(concat_ws(' ', k.address, k.postal_code, k.city)), '') as adresse
      from public.appointments a
      join plaques p
        on p.immat = upper(regexp_replace((regexp_match(a.title, '\(([A-Za-z0-9 -]{5,12})\)'))[1], '[^A-Za-z0-9]', '', 'g'))
      join public.contacts k on k.id = p.contact_id
     where a.workspace_id = p_workspace_id
       and a.lead_id is null and a.contact_id is null and a.status <> 'cancelled'
  )
  update public.appointments a
     set contact_id = c.contact_id,
         address = coalesce(nullif(trim(a.address), ''), c.adresse), updated_at = now()
    from cibles c where a.id = c.rdv_id;
  get diagnostics n_etape = row_count; n := n + n_etape;

  -- 4. Nom du titre, s'il designe un seul lead.
  --    Le nom est ce qui suit le premier « - » et precede une eventuelle
  --    parenthese : « Intervention - Yoann Ellama (CG822DS) » -> « Yoann Ellama ».
  with noms as (
    select a.id as rdv_id,
           public.cle_nom((regexp_match(a.title, '^[^-]*-\s*([^(]+?)\s*(?:\(|$)'))[1]) as cle
      from public.appointments a
     where a.workspace_id = p_workspace_id
       and a.lead_id is null and a.contact_id is null and a.status <> 'cancelled'
  ),
  leads_uniques as (
    select public.cle_nom(concat_ws(' ', l.first_name, l.last_name)) as cle,
           (array_agg(l.id))[1] as lead_id
      from public.leads l
     -- Archives compris : un rendez-vous pris avec un lead sorti du champ de
     -- travail n'en est pas moins un fait, et son telephone sert encore.
     -- L'unicite se juge sur l'ensemble, un homonyme archive bloque aussi.
     where l.workspace_id = p_workspace_id
     group by 1
    having count(*) = 1
  ),
  cibles as (
    select nm.rdv_id, l.id as lead_id, l.contact_id,
           coalesce(
             nullif(trim(concat_ws(' ', l.intervention_address, l.intervention_postal_code, l.intervention_city)), ''),
             nullif(trim(concat_ws(' ', l.address, l.postal_code, l.city)), '')
           ) as adresse
      from noms nm
      join leads_uniques u on u.cle = nm.cle
      join public.leads l on l.id = u.lead_id
     where nm.cle is not null and nm.cle <> ''
  )
  update public.appointments a
     set lead_id = c.lead_id, contact_id = coalesce(a.contact_id, c.contact_id),
         address = coalesce(nullif(trim(a.address), ''), c.adresse), updated_at = now()
    from cibles c where a.id = c.rdv_id;
  get diagnostics n_etape = row_count; n := n + n_etape;

  -- 5. Nom du titre, s'il designe un seul contact.
  with noms as (
    select a.id as rdv_id,
           public.cle_nom((regexp_match(a.title, '^[^-]*-\s*([^(]+?)\s*(?:\(|$)'))[1]) as cle
      from public.appointments a
     where a.workspace_id = p_workspace_id
       and a.lead_id is null and a.contact_id is null and a.status <> 'cancelled'
  ),
  contacts_uniques as (
    select public.cle_nom(concat_ws(' ', k.first_name, k.last_name)) as cle,
           (array_agg(k.id))[1] as contact_id
      from public.contacts k
     where k.workspace_id = p_workspace_id
     group by 1
    having count(*) = 1
  ),
  cibles as (
    select nm.rdv_id, k.id as contact_id,
           nullif(trim(concat_ws(' ', k.address, k.postal_code, k.city)), '') as adresse
      from noms nm
      join contacts_uniques u on u.cle = nm.cle
      join public.contacts k on k.id = u.contact_id
     where nm.cle is not null and nm.cle <> ''
  )
  update public.appointments a
     set contact_id = c.contact_id,
         address = coalesce(nullif(trim(a.address), ''), c.adresse), updated_at = now()
    from cibles c where a.id = c.rdv_id;
  get diagnostics n_etape = row_count; n := n + n_etape;

  return n;
end
$$;

comment on function public.rattacher_rendez_vous_clients(uuid) is
  'Rattache les rendez-vous sans client : plaque (lead, facture, devis), puis nom du titre s''il est unique. Appelée après chaque synchronisation Google Agenda.';

revoke all on function public.rattacher_rendez_vous_clients(uuid) from public, anon, authenticated;
grant execute on function public.rattacher_rendez_vous_clients(uuid) to service_role;
revoke all on function public.cle_nom(text) from public, anon, authenticated;
grant execute on function public.cle_nom(text) to service_role;
