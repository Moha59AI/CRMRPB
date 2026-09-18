/*
# Rattachement des rendez-vous : le lead avant le contact

## Le problème

L'ordre des recherches faisait gagner le contact contre le lead. La plaque
de Dorothée Vandeven trouvait une facture Onify, donc son contact, à la
deuxième étape — et la recherche par nom, qui aurait trouvé son lead, ne
regarde que les rendez-vous encore sans rien. Résultat : rendez-vous
rattaché au contact, et le cadeau saisi sur le lead — « Virement jusqu'à
300 € » — invisible dans l'agenda.

Un lead est plus riche qu'un contact : adresse d'intervention, cadeau,
statut, technicien. Et il implique le contact. Il doit toujours être
cherché en premier.

## Le nouvel ordre

1. plaque → lead ;
2. nom → lead, s'il est unique ;
3. plaque → facture ou devis Onify → contact ;
4. nom → contact, s'il est unique ;
5. **remontée** : un rendez-vous rattaché à un contact mais sans lead prend
   le lead de ce contact dont le nom correspond au titre — ou son seul lead
   s'il n'en a qu'un. Plusieurs leads sans nom qui corresponde : on ne
   devine pas, l'offre de l'un n'est pas celle de l'autre.
*/

-- Assemble rue + code postal + ville sans repeter ce que la rue contient
-- deja : un lead arrive avec « 62440 Harnes » pour seule adresse donnait
-- « 62440 Harnes 62440 Harnes ».
create or replace function public.adresse_complete(p_rue text, p_cp text, p_ville text)
returns text
language sql
immutable
as $$
  select nullif(trim(
    concat_ws(' ',
      nullif(trim(p_rue), ''),
      case when nullif(trim(p_cp), '') is not null
            and position(trim(p_cp) in coalesce(p_rue, '')) = 0
           then trim(p_cp) end,
      case when nullif(trim(p_ville), '') is not null
            and position(upper(trim(p_ville)) in upper(coalesce(p_rue, ''))) = 0
           then trim(p_ville) end
    )
  ), '');
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
             public.adresse_complete(l.intervention_address, l.intervention_postal_code, l.intervention_city),
             public.adresse_complete(l.address, l.postal_code, l.city)
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

  -- 2. Lead par nom, s'il est unique. Archives compris : le rendez-vous est
  --    un fait, et l'unicite se juge sur l'ensemble.
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
     where l.workspace_id = p_workspace_id
     group by 1
    having count(*) = 1
  ),
  cibles as (
    select nm.rdv_id, l.id as lead_id, l.contact_id,
           coalesce(
             public.adresse_complete(l.intervention_address, l.intervention_postal_code, l.intervention_city),
             public.adresse_complete(l.address, l.postal_code, l.city)
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

  -- 3. Contact par plaque : facture puis devis Onify.
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
           public.adresse_complete(k.address, k.postal_code, k.city) as adresse
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

  -- 4. Contact par nom, s'il est unique.
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
           public.adresse_complete(k.address, k.postal_code, k.city) as adresse
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

  -- 5. Remontee du contact vers son lead : celui dont le nom correspond au
  --    titre, sinon son seul lead. Sans cela, le cadeau et l'adresse
  --    d'intervention saisis sur le lead restent invisibles.
  with candidats as (
    select a.id as rdv_id, l.id as lead_id, l.contact_id,
           coalesce(
             public.adresse_complete(l.intervention_address, l.intervention_postal_code, l.intervention_city),
             public.adresse_complete(l.address, l.postal_code, l.city)
           ) as adresse,
           public.cle_nom(concat_ws(' ', l.first_name, l.last_name))
             = public.cle_nom((regexp_match(a.title, '^[^-]*-\s*([^(]+?)\s*(?:\(|$)'))[1]) as nom_correspond,
           count(*) over (partition by a.id) as nb_leads_du_contact,
           l.created_at
      from public.appointments a
      join public.leads l on l.contact_id = a.contact_id and l.workspace_id = a.workspace_id
     where a.workspace_id = p_workspace_id
       and a.contact_id is not null and a.lead_id is null and a.status <> 'cancelled'
  ),
  cibles as (
    select distinct on (rdv_id) rdv_id, lead_id, contact_id, adresse
      from candidats
     where nom_correspond or nb_leads_du_contact = 1
     order by rdv_id, nom_correspond desc, created_at desc
  )
  update public.appointments a
     set lead_id = c.lead_id,
         -- L'adresse du lead prime sur celle du contact posee a l'etape 3 ou
         -- 4 : c'est celle de l'intervention, pas du domicile en general.
         address = coalesce(c.adresse, nullif(trim(a.address), '')),
         updated_at = now()
    from cibles c where a.id = c.rdv_id;
  get diagnostics n_etape = row_count; n := n + n_etape;

  return n;
end
$$;
