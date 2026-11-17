/*
  Empêcher qu'un dossier Onify recrée le lead qui l'a précédé

  Le dossier Glass arrive après le lead et doit enrichir cette même affaire.
  L'ancien rapprochement comptait tous les leads d'un contact. Dès qu'un
  client avait un ancien passage, le lead courant n'était plus considéré
  comme unique et un nouveau lead d'import était créé.

  Cette migration ajoute trois protections :

  - le bouton « Créer dans Onify » marque explicitement le lead de départ ;
  - le retour Onify recherche seulement parmi les affaires actives qui ne
    possèdent pas encore de dossier Onify ;
  - les doublons déjà créés automatiquement sont archivés et leur dossier est
    remis sur le lead d'origine, mais uniquement si la correspondance est
    unique. Aucun rapprochement ambigu n'est forcé.
*/

begin;

alter table public.leads
  add column if not exists onify_handoff_at timestamptz;

comment on column public.leads.onify_handoff_at is
  'Date à laquelle cette affaire a été ouverte dans Onify depuis sa fiche CRM. Effacée dès que le dossier Onify est rattaché.';

create index if not exists leads_onify_handoff_pending_idx
  on public.leads (workspace_id, contact_id, onify_handoff_at desc)
  where onify_handoff_at is not null and onify_case_id is null;

/*
  Le candidat n'est choisi que si le meilleur niveau de preuve ne contient
  qu'une seule fiche. L'immatriculation et le passage explicite depuis le CRM
  priment sur le simple contact. Un ancien dossier déjà lié est exclu : un
  client peut légitimement revenir plusieurs fois avec le même véhicule.
*/
create or replace function public.trouver_lead_pour_dossier_onify(
  p_workspace_id uuid,
  p_case_id uuid,
  p_onify_glass_case_id text,
  p_contact_id uuid,
  p_vehicle_registration text,
  p_onify_created_at timestamptz,
  p_exclude_lead_id uuid default null
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  with contexte as (
    select
      nullif(
        upper(regexp_replace(coalesce(p_vehicle_registration, ''), '[^A-Za-z0-9]', '', 'g')),
        ''
      ) as immatriculation,
      (
        select public.normaliser_telephone(contact.phone)
        from public.contacts contact
        where contact.id = p_contact_id
          and contact.workspace_id = p_workspace_id
      ) as telephone,
      (
        select public.normaliser_email(contact.email)
        from public.contacts contact
        where contact.id = p_contact_id
          and contact.workspace_id = p_workspace_id
      ) as email,
      (
        select public.cle_nom(concat_ws(' ', contact.first_name, contact.last_name))
        from public.contacts contact
        where contact.id = p_contact_id
          and contact.workspace_id = p_workspace_id
      ) as nom,
      coalesce(p_onify_created_at, now()) as date_dossier
  ), candidats as (
    select
      lead.id,
      lead.onify_handoff_at,
      lead.received_at,
      lead.created_at,
      case
        when lead.onify_case_id = p_case_id
          or (
            nullif(trim(p_onify_glass_case_id), '') is not null
            and lead.onify_glass_case_id = p_onify_glass_case_id
          ) then 0
        when lead.contact_id = p_contact_id
          and contexte.immatriculation is not null
          and upper(regexp_replace(coalesce(lead.vehicle_registration, ''), '[^A-Za-z0-9]', '', 'g'))
            = contexte.immatriculation
          and coalesce(lead.received_at, lead.created_at)
            between contexte.date_dossier - interval '180 days'
                and contexte.date_dossier + interval '2 days'
          then 10
        when lead.contact_id = p_contact_id
          and lead.onify_handoff_at is not null
          and lead.onify_handoff_at >= coalesce(p_onify_created_at, now()) - interval '14 days'
          and lead.onify_handoff_at <= coalesce(p_onify_created_at, now()) + interval '1 day'
          then 20
        when contexte.immatriculation is not null
          and upper(regexp_replace(coalesce(lead.vehicle_registration, ''), '[^A-Za-z0-9]', '', 'g'))
            = contexte.immatriculation
          and coalesce(lead.received_at, lead.created_at)
            between contexte.date_dossier - interval '180 days'
                and contexte.date_dossier + interval '2 days'
          then 30
        when lead.contact_id = p_contact_id
          and coalesce(lead.received_at, lead.created_at)
            between contexte.date_dossier - interval '90 days'
                and contexte.date_dossier + interval '2 days'
          then 40
        when contexte.telephone is not null
          and public.normaliser_telephone(lead.phone) = contexte.telephone
          and contexte.nom is not null
          and public.cle_nom(concat_ws(' ', lead.first_name, lead.last_name)) = contexte.nom
          and coalesce(lead.received_at, lead.created_at)
            between contexte.date_dossier - interval '90 days'
                and contexte.date_dossier + interval '2 days'
          then 50
        when contexte.email is not null
          and contexte.email <> 'contact@relaisparebrise.fr'
          and public.normaliser_email(lead.email) = contexte.email
          and contexte.nom is not null
          and public.cle_nom(concat_ws(' ', lead.first_name, lead.last_name)) = contexte.nom
          and coalesce(lead.received_at, lead.created_at)
            between contexte.date_dossier - interval '90 days'
                and contexte.date_dossier + interval '2 days'
          then 60
        else null
      end as priorite
    from public.leads lead
    cross join contexte
    where lead.workspace_id = p_workspace_id
      and (p_exclude_lead_id is null or lead.id <> p_exclude_lead_id)
      and (
        lead.onify_case_id is null
        or lead.onify_case_id = p_case_id
      )
      and (
        lead.onify_glass_case_id is null
        or lead.onify_glass_case_id = p_onify_glass_case_id
      )
      and not exists (
        select 1
        from public.windscreen_cases autre_dossier
        where autre_dossier.workspace_id = lead.workspace_id
          and autre_dossier.lead_id = lead.id
          and autre_dossier.onify_glass_case_id is not null
          and autre_dossier.id <> p_case_id
      )
      and (
        lead.onify_case_id = p_case_id
        or lead.onify_glass_case_id = p_onify_glass_case_id
        or (
          lead.archived_at is null
          and lead.status not in ('lost', 'converted')
        )
      )
  ), meilleure_priorite as (
    select min(priorite) as valeur
    from candidats
    where priorite is not null
  ), meilleurs as (
    select candidat.*
    from candidats candidat
    cross join meilleure_priorite meilleure
    where candidat.priorite = meilleure.valeur
  )
  select case
    when count(*) = 1 then (
      array_agg(
        id
        order by onify_handoff_at desc nulls last,
                 received_at desc nulls last,
                 created_at desc,
                 id
      )
    )[1]
    else null
  end
  from meilleurs;
$$;

comment on function public.trouver_lead_pour_dossier_onify(uuid, uuid, text, uuid, text, timestamptz, uuid) is
  'Retourne le seul lead actif et non encore lié qui correspond sûrement au dossier Onify. NULL en cas de doute.';

revoke all on function public.trouver_lead_pour_dossier_onify(uuid, uuid, text, uuid, text, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.trouver_lead_pour_dossier_onify(uuid, uuid, text, uuid, text, timestamptz, uuid)
  to service_role;

/* Marque la fiche exacte depuis laquelle l'utilisateur ouvre Onify. */
create or replace function public.preparer_passage_lead_onify(p_lead_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid := public.get_workspace_id();
  v_date timestamptz;
begin
  if v_workspace_id is null then
    raise exception 'Espace de travail introuvable';
  end if;

  update public.leads lead
     set onify_handoff_at = now(),
         updated_at = now()
   where lead.id = p_lead_id
     and lead.workspace_id = v_workspace_id
     and lead.archived_at is null
     and lead.onify_case_id is null
  returning lead.onify_handoff_at into v_date;

  if v_date is null then
    raise exception 'Ce lead est introuvable, archivé ou déjà rattaché à Onify';
  end if;

  return v_date;
end;
$$;

revoke all on function public.preparer_passage_lead_onify(uuid) from public, anon;
grant execute on function public.preparer_passage_lead_onify(uuid) to authenticated;

/*
  Protection en temps réel : elle s'exécute avant le trigger qui prépare
  affaire_id, afin que le dossier reprenne immédiatement l'affaire du lead.
*/
create or replace function public.rattacher_dossier_onify_avant_ecriture()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_id uuid;
begin
  if new.onify_glass_case_id is null or new.lead_id is not null then
    return new;
  end if;

  if new.id is null then new.id := gen_random_uuid(); end if;

  v_lead_id := public.trouver_lead_pour_dossier_onify(
    new.workspace_id,
    new.id,
    new.onify_glass_case_id,
    new.contact_id,
    new.onify_vehicle_registration,
    new.onify_created_at,
    null
  );

  if v_lead_id is not null then
    new.lead_id := v_lead_id;
    select lead.affaire_id,
           coalesce(new.contact_id, lead.contact_id)
      into new.affaire_id, new.contact_id
      from public.leads lead
     where lead.id = v_lead_id
       and lead.workspace_id = new.workspace_id;
  end if;

  return new;
end;
$$;

revoke all on function public.rattacher_dossier_onify_avant_ecriture()
  from public, anon, authenticated;

drop trigger if exists dossiers_onify_rattacher_lead on public.windscreen_cases;
create trigger dossiers_onify_rattacher_lead
before insert or update of
  onify_glass_case_id, contact_id, onify_vehicle_registration, onify_created_at, lead_id
on public.windscreen_cases
for each row execute function public.rattacher_dossier_onify_avant_ecriture();

create or replace function public.consommer_passage_lead_onify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.onify_glass_case_id is not null and new.lead_id is not null then
    update public.leads lead
       set onify_handoff_at = null,
           updated_at = now()
     where lead.id = new.lead_id
       and lead.workspace_id = new.workspace_id
       and lead.onify_handoff_at is not null;
  end if;
  return new;
end;
$$;

revoke all on function public.consommer_passage_lead_onify()
  from public, anon, authenticated;

drop trigger if exists dossiers_onify_consommer_passage on public.windscreen_cases;
create trigger dossiers_onify_consommer_passage
after insert or update of onify_glass_case_id, lead_id
on public.windscreen_cases
for each row execute function public.consommer_passage_lead_onify();

/*
  Répare les doublons strictement techniques déjà créés par la migration
  d'import. La fiche d'import est conservée dans les archives avec la trace de
  la fusion ; aucune fiche saisie manuellement n'est supprimée.
*/
do $$
declare
  v_dossier record;
  v_lead_id uuid;
begin
  for v_dossier in
    select dossier.id as case_id,
           dossier.workspace_id,
           dossier.contact_id,
           dossier.onify_glass_case_id,
           dossier.onify_vehicle_registration,
           dossier.onify_created_at,
           lead_importe.id as imported_lead_id
      from public.windscreen_cases dossier
      join public.leads lead_importe
        on lead_importe.id = dossier.lead_id
       and lead_importe.workspace_id = dossier.workspace_id
     where dossier.onify_glass_case_id is not null
       and lead_importe.source = 'import'
       and lead_importe.onify_case_id = dossier.id
       and lead_importe.raw_payload->>'source' = 'onify'
     order by coalesce(dossier.onify_created_at, dossier.created_at) desc,
              dossier.id
  loop
    v_lead_id := public.trouver_lead_pour_dossier_onify(
      v_dossier.workspace_id,
      v_dossier.case_id,
      v_dossier.onify_glass_case_id,
      v_dossier.contact_id,
      v_dossier.onify_vehicle_registration,
      v_dossier.onify_created_at,
      v_dossier.imported_lead_id
    );

    if v_lead_id is null then continue; end if;

    update public.leads lead_importe
       set archived_at = coalesce(lead_importe.archived_at, now()),
           onify_case_id = null,
           onify_glass_case_id = null,
           onify_reference = null,
           onify_handoff_at = null,
           raw_payload = coalesce(lead_importe.raw_payload, '{}'::jsonb)
             || jsonb_build_object(
               'duplicate_merged_into_lead_id', v_lead_id,
               'duplicate_merged_at', now()
             ),
           updated_at = now()
     where lead_importe.id = v_dossier.imported_lead_id
       and lead_importe.workspace_id = v_dossier.workspace_id
       and lead_importe.source = 'import'
       and lead_importe.onify_case_id = v_dossier.case_id;

    if found then
      update public.windscreen_cases dossier
         set lead_id = v_lead_id,
             updated_at = now()
       where dossier.id = v_dossier.case_id
         and dossier.workspace_id = v_dossier.workspace_id
         and dossier.lead_id = v_dossier.imported_lead_id;
    end if;
  end loop;
end;
$$;

/* Rattache aussi les dossiers restés sans lead, un par un pour garantir le 1:1. */
do $$
declare
  v_dossier record;
  v_lead_id uuid;
begin
  for v_dossier in
    select dossier.id,
           dossier.workspace_id,
           dossier.contact_id,
           dossier.onify_glass_case_id,
           dossier.onify_vehicle_registration,
           dossier.onify_created_at
      from public.windscreen_cases dossier
     where dossier.onify_glass_case_id is not null
       and dossier.lead_id is null
     order by coalesce(dossier.onify_created_at, dossier.created_at) desc,
              dossier.id
  loop
    v_lead_id := public.trouver_lead_pour_dossier_onify(
      v_dossier.workspace_id,
      v_dossier.id,
      v_dossier.onify_glass_case_id,
      v_dossier.contact_id,
      v_dossier.onify_vehicle_registration,
      v_dossier.onify_created_at,
      null
    );

    if v_lead_id is not null then
      update public.windscreen_cases dossier
         set lead_id = v_lead_id,
             updated_at = now()
       where dossier.id = v_dossier.id
         and dossier.workspace_id = v_dossier.workspace_id
         and dossier.lead_id is null;
    end if;
  end loop;
end;
$$;

/* Copie les données Onify sur les leads réparés et rattache leurs documents. */
do $$
declare
  v_workspace record;
begin
  for v_workspace in
    select distinct dossier.workspace_id
    from public.windscreen_cases dossier
    where dossier.onify_glass_case_id is not null
  loop
    perform public.avancer_leads_apres_dossier_glass(v_workspace.workspace_id);
  end loop;
end;
$$;

commit;
