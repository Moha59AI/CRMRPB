/*
# Rattachement des rendez-vous à leur client par l'immatriculation

## Le problème

Les rendez-vous repris de Google Agenda arrivent sans client ni adresse :
Google ne connaît que le titre. Or ce titre, tel que l'atelier le saisit,
porte l'immatriculation — « Intervention - Yoann Ellama (CG822DS) » — et
c'est une clé fiable : un véhicule n'a qu'une plaque.

Dans l'agenda, un rendez-vous sans client n'affiche ni adresse ni téléphone.
Le technicien part sans savoir où.

## La règle

Pour un rendez-vous sans lead ni contact dont le titre contient une plaque
entre parenthèses, on cherche dans cet ordre :

1. un lead dont `vehicle_registration` correspond ;
2. sinon une facture Onify dont le véhicule correspond, et son contact.

Le rendez-vous reçoit le lien trouvé. Son adresse n'est remplie que si elle
est vide : une adresse saisie sur le rendez-vous a été voulue pour ce
déplacement-là.

Les plaques sont comparées sans tirets ni espaces, en majuscules :
« CG-822-DS », « cg822ds » et « CG 822 DS » désignent le même véhicule.
*/

-- Index d'expression sur la plaque des factures Onify : la recherche se fait
-- sur cette forme normalisée, sans index elle parcourt toute la table.
create index if not exists invoices_vehicule_immat_idx
  on public.invoices ((upper(regexp_replace(onify_payload->'vehicle'->>'immat', '[^A-Za-z0-9]', '', 'g'))))
  where onify_payload->'vehicle'->>'immat' is not null;

create or replace function public.rattacher_rendez_vous_clients(p_workspace_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n_leads integer;
  n_contacts integer;
begin
  -- 1. Par lead, via l'immatriculation de la fiche.
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
       and a.lead_id is null
       and a.contact_id is null
       and a.status <> 'cancelled'
  )
  update public.appointments a
     set lead_id    = c.lead_id,
         contact_id = coalesce(a.contact_id, c.contact_id),
         address    = coalesce(nullif(trim(a.address), ''), c.adresse),
         updated_at = now()
    from cibles c
   where a.id = c.rdv_id;
  get diagnostics n_leads = row_count;

  -- 2. Par facture Onify, via la plaque du véhicule facturé, puis son contact.
  with plaques as (
    select distinct on (immat) immat, contact_id
      from (
        select upper(regexp_replace(i.onify_payload->'vehicle'->>'immat', '[^A-Za-z0-9]', '', 'g')) as immat,
               i.contact_id, i.issue_date
          from public.invoices i
         where i.workspace_id = p_workspace_id
           and i.contact_id is not null
           and i.onify_payload->'vehicle'->>'immat' is not null
      ) f
     order by immat, issue_date desc
  ),
  cibles as (
    select a.id as rdv_id, p.contact_id,
           nullif(trim(concat_ws(' ', k.address, k.postal_code, k.city)), '') as adresse
      from public.appointments a
      join plaques p
        on p.immat = upper(regexp_replace((regexp_match(a.title, '\(([A-Za-z0-9 -]{5,12})\)'))[1], '[^A-Za-z0-9]', '', 'g'))
      join public.contacts k on k.id = p.contact_id
     where a.workspace_id = p_workspace_id
       and a.lead_id is null
       and a.contact_id is null
       and a.status <> 'cancelled'
  )
  update public.appointments a
     set contact_id = c.contact_id,
         address    = coalesce(nullif(trim(a.address), ''), c.adresse),
         updated_at = now()
    from cibles c
   where a.id = c.rdv_id;
  get diagnostics n_contacts = row_count;

  return n_leads + n_contacts;
end
$$;

comment on function public.rattacher_rendez_vous_clients(uuid) is
  'Rattache les rendez-vous sans client à un lead ou un contact via la plaque du titre. Appelée après chaque synchronisation Google Agenda.';

revoke all on function public.rattacher_rendez_vous_clients(uuid) from public, anon, authenticated;
grant execute on function public.rattacher_rendez_vous_clients(uuid) to service_role;
