/*
# Un client, c'est quelqu'un qui a une facture

## La regle

Elle vient du metier, et elle est plus sure que le statut du lead : 12 leads
seulement portent « converti », pendant que 136 personnes ont une facture.
Le statut se saisit a la main, donc il ne se saisit pas. La facture, elle,
arrive d'Onify toute seule.

Le CRM affichait pourtant, sur chaque fiche, un taux de conversion calcule
sur ce statut : 0 % pour presque tout le monde, y compris pour ceux qu'on
facture depuis deux ans.

## Pourquoi passer par une fonction

`invoices` n'est lisible que par l'administration -- RLS n'ouvre la table
qu'aux roles admin, manager et comptable. Une vue en `security_invoker` qui
joindrait `invoices` renverrait donc zero facture a un conseiller, et lui
annoncerait que personne n'est client.

Or savoir si l'on appelle un client ou un prospect est necessaire pour
travailler, et ce n'est pas une information financiere. La fonction ci-
dessous est `security definer` et ne rend que cela : combien de factures, la
premiere, la derniere. Aucun montant n'en sort. Elle se limite a l'espace de
l'appelant, donc elle ne traverse pas les cloisons.
*/

create or replace function public.facturation_par_contact()
returns table (
  contact_id uuid,
  nb_factures bigint,
  premiere_facture timestamptz,
  derniere_facture timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select i.contact_id,
         count(*),
         min(i.issue_date),
         max(i.issue_date)
    from public.invoices i
   where i.workspace_id = public.get_workspace_id()
     and i.contact_id is not null
     -- Une facture annulee n'a jamais fait de client.
     and i.status <> 'cancelled'
   group by i.contact_id;
$$;

comment on function public.facturation_par_contact() is
  'Anciennete de facturation par client, sans montant : lisible par tous les roles';

grant execute on function public.facturation_par_contact() to authenticated;

-- `v_clients` porte desormais la reponse a « est-ce un client ? ».
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
       (f.nb_factures is not null) as est_client
  from public.contacts c
  left join public.leads l on l.contact_id = c.id
  left join public.facturation_par_contact() f on f.contact_id = c.id
 group by c.id, c.workspace_id, c.first_name, c.last_name, c.phone, c.email, c.city,
          f.nb_factures, f.premiere_facture, f.derniere_facture;

comment on view public.v_clients is
  'Contacts et leur anciennete. est_client = true des la premiere facture non annulee.';
