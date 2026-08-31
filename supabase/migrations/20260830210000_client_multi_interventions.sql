/*
# Un client, plusieurs interventions

## Le modèle visé

  contact (le client, une personne)  1 ── N  leads (une intervention chacun)

## Ce qui existait

`leads` portait l'identité en dur (prénom, nom, téléphone, email) sans aucun
lien vers une personne, et `contacts` portait un `lead_id` — la relation
pointait donc contact → lead, en un pour un.

Résultat : un client qui rappelle six mois plus tard pour une lunette arrière
créait un second lead sans lien avec le premier. Son historique était perdu,
et rien ne permettait de savoir qu'on avait déjà travaillé avec lui.

## Le rattachement

Un trigger sur `leads` résout le contact à l'insertion, à partir du téléphone
normalisé puis de l'e-mail. Le passage par un trigger et non par la fonction
webhook est délibéré : leads arrivent aussi par saisie manuelle, par import et
par l'API. Une règle posée en base couvre tous les chemins, présents et futurs.

`contacts.lead_id` devient trompeur mais n'est pas supprimé : des données y
sont peut-être déjà rattachées. Il ne doit plus être utilisé.
*/

-- ============ NORMALISATION DU TÉLÉPHONE ============
-- Sans elle, « +33 6 12 34 56 78 » et « 0612345678 » désignent deux personnes
-- différentes, et le rattachement ne sert à rien.

create or replace function public.normaliser_telephone(p_tel text)
returns text
language plpgsql
immutable
as $$
declare
  chiffres text;
begin
  if p_tel is null then
    return null;
  end if;

  chiffres := regexp_replace(p_tel, '[^0-9]', '', 'g');

  -- 0033... et 33... ramenés au format national
  if chiffres like '0033%' then
    chiffres := '0' || substring(chiffres from 5);
  elsif length(chiffres) = 11 and chiffres like '33%' then
    chiffres := '0' || substring(chiffres from 3);
  end if;

  -- Numéro français à 9 chiffres sans le zéro initial
  if length(chiffres) = 9 then
    chiffres := '0' || chiffres;
  end if;

  if length(chiffres) < 9 then
    return null; -- trop court pour identifier qui que ce soit
  end if;

  return chiffres;
end;
$$;


-- ============ LIEN LEAD -> CLIENT ============

alter table leads add column if not exists contact_id uuid
  references contacts(id) on delete set null;

create index if not exists leads_contact_id_idx on leads (contact_id);

-- Recherche de doublon : l'index porte sur le téléphone normalisé, sinon
-- chaque rattachement balaierait toute la table.
create index if not exists contacts_phone_normalise_idx
  on contacts (workspace_id, (public.normaliser_telephone(phone)));

create index if not exists contacts_email_idx
  on contacts (workspace_id, lower(email));


-- ============ RÉSOLUTION DU CLIENT ============

create or replace function public.trouver_ou_creer_contact(
  p_workspace_id uuid,
  p_phone text,
  p_email text,
  p_first_name text,
  p_last_name text,
  p_city text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tel text := public.normaliser_telephone(p_phone);
  v_email text := nullif(lower(trim(p_email)), '');
  v_id uuid;
begin
  -- Le téléphone prime : c'est l'identifiant le plus fiable du métier.
  if v_tel is not null then
    select id into v_id from contacts
    where workspace_id = p_workspace_id
      and public.normaliser_telephone(phone) = v_tel
    limit 1;
  end if;

  if v_id is null and v_email is not null then
    select id into v_id from contacts
    where workspace_id = p_workspace_id and lower(email) = v_email
    limit 1;
  end if;

  if v_id is not null then
    -- Un rappel apporte souvent une information manquante : on complète sans
    -- jamais écraser ce qui est déjà renseigné.
    update contacts set
      first_name = coalesce(nullif(trim(first_name), ''), nullif(trim(p_first_name), '')),
      last_name  = coalesce(nullif(trim(last_name), ''),  nullif(trim(p_last_name), '')),
      email      = coalesce(nullif(trim(email), ''),      v_email),
      phone      = coalesce(nullif(trim(phone), ''),      p_phone),
      city       = coalesce(nullif(trim(city), ''),       nullif(trim(p_city), '')),
      updated_at = now()
    where id = v_id;
    return v_id;
  end if;

  insert into contacts (workspace_id, first_name, last_name, phone, email, city)
  values (p_workspace_id, nullif(trim(p_first_name), ''), nullif(trim(p_last_name), ''),
          p_phone, v_email, nullif(trim(p_city), ''))
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.trouver_ou_creer_contact(uuid, text, text, text, text, text)
  to authenticated, service_role;


-- ============ RATTACHEMENT AUTOMATIQUE ============

create or replace function public.rattacher_lead_au_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.contact_id is not null then
    return new;
  end if;

  if new.phone is null and new.email is null then
    return new; -- rien pour identifier la personne
  end if;

  new.contact_id := public.trouver_ou_creer_contact(
    new.workspace_id, new.phone, new.email,
    new.first_name, new.last_name, new.city
  );

  return new;
end;
$$;

drop trigger if exists leads_rattacher_contact on leads;
create trigger leads_rattacher_contact
  before insert or update of phone, email on leads
  for each row execute function public.rattacher_lead_au_contact();


-- ============ RATTRAPAGE DE L'EXISTANT ============
-- Les leads déjà en base sont rattachés dans l'ordre chronologique : le plus
-- ancien crée le contact, les suivants le retrouvent. Traiter dans le
-- désordre créerait des contacts en double.

do $$
declare
  l record;
begin
  for l in
    select id, workspace_id, phone, email, first_name, last_name, city
    from leads
    where contact_id is null and (phone is not null or email is not null)
    order by coalesce(received_at, created_at)
  loop
    update leads
    set contact_id = public.trouver_ou_creer_contact(
      l.workspace_id, l.phone, l.email, l.first_name, l.last_name, l.city)
    where id = l.id;
  end loop;
end $$;


-- ============ VUE DE SYNTHÈSE CLIENT ============

drop view if exists public.v_clients;

create view public.v_clients
with (security_invoker = on)
as
select
  c.id,
  c.workspace_id,
  c.first_name,
  c.last_name,
  c.phone,
  c.email,
  c.city,
  count(l.id)                                           as nb_interventions,
  count(l.id) filter (where l.status = 'converted')      as nb_converties,
  min(coalesce(l.received_at, l.created_at))             as premiere_intervention,
  max(coalesce(l.received_at, l.created_at))             as derniere_intervention
from contacts c
left join leads l on l.contact_id = c.id
group by c.id, c.workspace_id, c.first_name, c.last_name, c.phone, c.email, c.city;

grant select on public.v_clients to authenticated;

comment on column contacts.lead_id is
  'OBSOLETE : la relation est desormais leads.contact_id. Ne plus utiliser.';
