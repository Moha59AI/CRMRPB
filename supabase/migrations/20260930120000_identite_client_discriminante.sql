/*
# Rattacher un lead au bon client

## Ce qui n'allait pas

`trouver_ou_creer_contact` cherchait le client par telephone, puis par
email, avec `limit 1` et sans ordre. Or un identifiant n'est pas toujours
une identite :

- 32 numeros sont portes par plusieurs fiches -- 69 contacts. Un foyer, une
  societe, un courtier. Le lead partait sur l'une d'elles, tiree au hasard
  par le plan d'execution, et le lead suivant pouvait partir sur une autre.
- 47 fiches portent `contact@relaisparebrise.fr`, l'adresse de l'entreprise,
  qu'Onify pose quand le client n'en a pas donne. Un lead arrivant avec
  cette adresse se rattachait a l'une de ces 47 personnes.

Le resultat ne se voit pas : la fiche client affiche simplement
l'intervention de quelqu'un d'autre, et l'historique de deux personnes se
melange sans que rien ne le signale.

## La regle retenue

Un identifiant n'identifie que s'il designe **exactement une** fiche. S'il
en designe plusieurs, le nom tranche ; s'il ne tranche pas, on cree une
fiche plutot que d'en choisir une au hasard.

Deux fiches pour une meme personne se rapprochent apres coup. Deux
personnes dans une meme fiche ne se separent plus : on ne sait plus quelle
intervention appartient a qui.
*/

-- ── Normalisation de l'email ──────────────────────────────────────────────
--
-- Deux fiches existent aujourd'hui avec « mailto: » devant l'adresse, une
-- forme laissee par un formulaire web. Sans ce nettoyage, la meme personne
-- ne se reconnait pas elle-meme.

create or replace function public.normaliser_email(p_email text)
returns text
language sql
immutable
as $$
  select nullif(lower(trim(regexp_replace(coalesce(p_email, ''), '^\s*mailto:\s*', '', 'i'))), '');
$$;

comment on function public.normaliser_email(text) is
  'Adresse comparable : sans prefixe mailto:, sans espaces, en minuscules';

update public.contacts
   set email = public.normaliser_email(email), updated_at = now()
 where email is not null
   and email is distinct from public.normaliser_email(email);

update public.leads
   set email = public.normaliser_email(email), updated_at = now()
 where email is not null
   and email is distinct from public.normaliser_email(email);

-- ── Rattachement ──────────────────────────────────────────────────────────

/**
 * La fiche que cet identifiant designe, ou NULL s'il en designe plusieurs.
 *
 * Le nom sert d'arbitre quand le numero est partage : deux personnes
 * derriere un meme fixe, c'est le cas courant. Sans nom qui corresponde, on
 * ne tranche pas.
 */
create or replace function public.contact_designe(
  p_workspace_id uuid,
  p_tel text,
  p_email text,
  p_cle_nom text
)
returns uuid
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
  v_n integer;
begin
  if p_tel is not null then
    select count(*), (array_agg(id))[1] into v_n, v_id
      from public.contacts
     where workspace_id = p_workspace_id
       and public.normaliser_telephone(phone) = p_tel;

    if v_n > 1 and p_cle_nom is not null and p_cle_nom <> '' then
      select count(*), (array_agg(id))[1] into v_n, v_id
        from public.contacts
       where workspace_id = p_workspace_id
         and public.normaliser_telephone(phone) = p_tel
         and public.cle_nom(concat_ws(' ', first_name, last_name)) = p_cle_nom;
    end if;

    if v_n = 1 then return v_id; end if;
  end if;

  if p_email is not null then
    select count(*), (array_agg(id))[1] into v_n, v_id
      from public.contacts
     where workspace_id = p_workspace_id
       and public.normaliser_email(email) = p_email;

    if v_n > 1 and p_cle_nom is not null and p_cle_nom <> '' then
      select count(*), (array_agg(id))[1] into v_n, v_id
        from public.contacts
       where workspace_id = p_workspace_id
         and public.normaliser_email(email) = p_email
         and public.cle_nom(concat_ws(' ', first_name, last_name)) = p_cle_nom;
    end if;

    if v_n = 1 then return v_id; end if;
  end if;

  return null;
end
$$;

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
set search_path = public, extensions
as $$
declare
  v_tel text := public.normaliser_telephone(p_phone);
  v_email text := public.normaliser_email(p_email);
  v_cle_nom text := public.cle_nom(concat_ws(' ', p_first_name, p_last_name));
  v_id uuid := public.contact_designe(p_workspace_id, v_tel, v_email, v_cle_nom);
begin
  if v_id is not null then
    -- Un rappel apporte souvent une information manquante : on complete sans
    -- jamais ecraser ce qui est deja renseigne.
    update public.contacts set
      first_name = coalesce(nullif(trim(first_name), ''), nullif(trim(p_first_name), '')),
      last_name  = coalesce(nullif(trim(last_name), ''),  nullif(trim(p_last_name), '')),
      email      = coalesce(nullif(trim(email), ''),      v_email),
      phone      = coalesce(nullif(trim(phone), ''),      p_phone),
      city       = coalesce(nullif(trim(city), ''),       nullif(trim(p_city), '')),
      updated_at = now()
    where id = v_id;
    return v_id;
  end if;

  insert into public.contacts (workspace_id, first_name, last_name, phone, email, city)
  values (p_workspace_id, nullif(trim(p_first_name), ''), nullif(trim(p_last_name), ''),
          p_phone, v_email, nullif(trim(p_city), ''))
  returning id into v_id;

  return v_id;
end
$$;

-- ── Ce qu'il reste a faire a la main ──────────────────────────────────────
--
-- Cette vue ne decide rien : elle montre les fiches qui se ressemblent assez
-- pour qu'on les regarde. Meme nom et meme numero, c'est presque surement la
-- meme personne ; meme numero et noms differents, c'est presque surement un
-- foyer. Seul un humain fait la difference, et la fusion n'est pas
-- reversible.

-- `security_invoker` comme les autres vues du CRM : sans lui, la vue lirait
-- les contacts avec les droits de son proprietaire et contournerait RLS.
create or replace view public.v_clients_a_rapprocher
with (security_invoker = on) as
with identifiants as (
  select c.id, c.workspace_id,
         public.normaliser_telephone(c.phone) as tel,
         public.normaliser_email(c.email) as email,
         public.cle_nom(concat_ws(' ', c.first_name, c.last_name)) as cle_nom
    from public.contacts c
),
groupes_tel as (
  select workspace_id, tel as valeur, 'telephone' as sur,
         array_agg(id order by id) as fiches,
         count(distinct cle_nom) filter (where cle_nom is not null and cle_nom <> '') as noms
    from identifiants where tel is not null
   group by 1, 2 having count(*) > 1
),
groupes_email as (
  select workspace_id, email as valeur, 'email' as sur,
         array_agg(id order by id) as fiches,
         count(distinct cle_nom) filter (where cle_nom is not null and cle_nom <> '') as noms
    from identifiants where email is not null
   group by 1, 2 having count(*) > 1
)
select workspace_id, sur, valeur, fiches, cardinality(fiches) as nb_fiches,
       (noms <= 1) as meme_nom
  from (select * from groupes_tel union all select * from groupes_email) g;

comment on view public.v_clients_a_rapprocher is
  'Fiches clients partageant un identifiant. meme_nom = true : doublon probable.';

grant select on public.v_clients_a_rapprocher to authenticated;
