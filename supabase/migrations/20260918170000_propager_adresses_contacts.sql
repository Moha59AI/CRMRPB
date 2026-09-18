/*
# Propagation de l'adresse du contact vers ses leads

## Le problème

La synchronisation Onify écrit l'adresse complète sur le **contact**. Mais le
travail quotidien se fait dans la fiche du **lead** — c'est elle qu'ouvrent
les relances, elle qui part sur la carte des interventions — et rien ne
reportait jamais l'adresse du contact vers ses leads.

Un lead arrivé par webhook Meta Ads ne porte qu'un code postal et une ville.
Le client donne ensuite son adresse chez Onify ; elle arrive sur le contact ;
le lead reste à « 59960 Neuville-en-Ferrain ». Vu de l'utilisateur, « le CRM
ne récupère pas les adresses ».

## La règle

On ne remplit que ce qui manque. Un lead dont l'adresse est vide, ou réduite
à « code postal + ville », reçoit celle du contact. Un lead qui porte déjà
une vraie rue n'est pas touché : elle peut être une adresse d'intervention
différente du domicile, saisie exprès.

Quand l'adresse change, le cache de géocodage du lead est remis à zéro :
sinon la carte le laisserait au centre de la commune alors qu'on connaît
désormais le numéro.
*/

create or replace function public.propager_adresses_contacts(p_workspace_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.leads l
     set address       = c.address,
         postal_code   = coalesce(nullif(trim(c.postal_code), ''), l.postal_code),
         city          = coalesce(nullif(trim(c.city), ''), l.city),
         citycode      = null,
         latitude      = null,
         longitude     = null,
         geo_precision = null,
         updated_at    = now()
    from public.contacts c
   where c.id = l.contact_id
     and l.workspace_id = p_workspace_id
     and c.workspace_id = p_workspace_id
     and nullif(trim(c.address), '') is not null
     and l.address is distinct from c.address
     -- Le lead n'a pas de rue : vide, réduit à la ville, à « CP Ville »,
     -- ou commençant par un code postal.
     and (
       nullif(trim(l.address), '') is null
       or trim(l.address) = trim(coalesce(l.city, ''))
       or trim(l.address) = trim(concat_ws(' ', l.postal_code, l.city))
       or l.address ~ '^\s*\d{5}\s'
     );

  get diagnostics n = row_count;
  return n;
end
$$;

comment on function public.propager_adresses_contacts(uuid) is
  'Reporte l''adresse du contact vers ses leads qui n''ont pas de rue. Appelée après chaque synchronisation Onify.';

-- Appelée par la fonction edge avec la clé service : aucun droit à ouvrir aux
-- rôles applicatifs.
revoke all on function public.propager_adresses_contacts(uuid) from public, anon, authenticated;
grant execute on function public.propager_adresses_contacts(uuid) to service_role;
