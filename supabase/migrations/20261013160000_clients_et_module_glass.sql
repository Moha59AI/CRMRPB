/*
  Clients issus de Glass Onify

  Le parcours metier devient explicite :
    lead -> pieces recues -> dossier Glass Onify -> client.

  La fiche contact existe deja pendant la phase prospect afin d'eviter les
  doublons et de conserver l'historique. Elle devient un client des qu'un
  dossier Glass Onify reel lui est rattache, sans attendre la facture.

  Les champs normalises servent a l'interface. La reponse client Onify brute
  est aussi conservee pour ne perdre aucune information exposee par l'API.
*/

alter table public.contacts
  add column if not exists onify_company text,
  add column if not exists onify_country text,
  add column if not exists onify_phones text[] not null default '{}',
  add column if not exists onify_customer_added_at timestamptz,
  add column if not exists onify_payload jsonb;

comment on column public.contacts.onify_payload is
  'Copie integrale de la fiche client retournee par GET /api/crm/customers.';
comment on column public.contacts.onify_phones is
  'Tous les numeros Onify. contacts.phone reste le numero principal affiche.';

create or replace function public.dossiers_glass_par_contact()
returns table (
  contact_id uuid,
  nb_dossiers_glass bigint,
  premier_dossier_glass timestamptz,
  dernier_dossier_glass timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select dossier.contact_id,
         count(*),
         min(coalesce(dossier.onify_created_at, dossier.created_at)),
         max(coalesce(dossier.onify_created_at, dossier.created_at))
    from public.windscreen_cases dossier
   where dossier.workspace_id = public.get_workspace_id()
     and dossier.contact_id is not null
     and dossier.onify_glass_case_id is not null
   group by dossier.contact_id;
$$;

comment on function public.dossiers_glass_par_contact() is
  'Nombre et anciennete des vrais dossiers Glass Onify, sans exposer le payload.';

revoke all on function public.dossiers_glass_par_contact() from public, anon;
grant execute on function public.dossiers_glass_par_contact() to authenticated;

-- L'ordre des colonnes existantes est conserve pour pouvoir remplacer la vue
-- sans casser ses consommateurs. Les informations Glass sont ajoutees a la fin.
create or replace view public.v_clients
with (security_invoker = on) as
select c.id,
       c.workspace_id,
       c.first_name,
       c.last_name,
       c.phone,
       c.email,
       c.city,
       count(l.id) as nb_interventions,
       count(l.id) filter (where l.status = 'converted') as nb_converties,
       min(coalesce(l.received_at, l.created_at)) as premiere_intervention,
       max(coalesce(l.received_at, l.created_at)) as derniere_intervention,
       coalesce(f.nb_factures, 0) as nb_factures,
       f.premiere_facture,
       f.derniere_facture,
       (g.nb_dossiers_glass is not null or f.nb_factures is not null) as est_client,
       coalesce(g.nb_dossiers_glass, 0) as nb_dossiers_glass,
       g.premier_dossier_glass,
       g.dernier_dossier_glass,
       case
         when g.premier_dossier_glass is null then f.premiere_facture
         when f.premiere_facture is null then g.premier_dossier_glass
         else least(g.premier_dossier_glass, f.premiere_facture)
       end as client_depuis,
       case
         when g.nb_dossiers_glass is not null and f.nb_factures is not null
           then 'onify_glass_et_facture'
         when g.nb_dossiers_glass is not null then 'onify_glass'
         when f.nb_factures is not null then 'facture'
         else null
       end as origine_client
  from public.contacts c
  left join public.leads l on l.contact_id = c.id
  left join public.facturation_par_contact() f on f.contact_id = c.id
  left join public.dossiers_glass_par_contact() g on g.contact_id = c.id
 group by c.id, c.workspace_id, c.first_name, c.last_name, c.phone, c.email, c.city,
          f.nb_factures, f.premiere_facture, f.derniere_facture,
          g.nb_dossiers_glass, g.premier_dossier_glass, g.dernier_dossier_glass;

comment on view public.v_clients is
  'Contacts et anciennete. Client des le premier dossier Glass Onify ou la premiere facture non annulee.';
