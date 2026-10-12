/*
# Véhicule Onify visible dans le planning technicien

Onify fournit la marque, le modèle et l'immatriculation dans les factures et
devis. Ces données financières ne sont pas lisibles par un technicien. Elles
sont donc recopiées, sans les montants, sur le rendez-vous auquel il a accès.

Une valeur saisie manuellement reste prioritaire. Une valeur déjà issue
d'Onify peut en revanche être rafraîchie à chaque synchronisation.
*/

alter table public.appointments
  add column if not exists vehicle_make text,
  add column if not exists vehicle_model text,
  add column if not exists vehicle_registration text,
  add column if not exists vehicle_source text;

comment on column public.appointments.vehicle_source is
  'Origine des données véhicule exposées au planning : onify, manual ou mixed.';

create or replace function public.propager_vehicules_onify(p_workspace_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v record;
  v_marque text;
  v_modele text;
  v_immat text;
  v_total integer := 0;
  v_modifies integer;
begin
  for v in
    with sources as (
      select i.contact_id,
             i.onify_payload->'vehicle' as vehicule,
             coalesce(i.onify_synced_at, i.updated_at, i.created_at) as synchronise_le
        from public.invoices i
       where i.workspace_id = p_workspace_id
         and i.contact_id is not null
         and jsonb_typeof(i.onify_payload->'vehicle') = 'object'
      union all
      select q.contact_id,
             q.onify_payload->'vehicle' as vehicule,
             coalesce(q.onify_synced_at, q.updated_at, q.created_at) as synchronise_le
        from public.quotes q
       where q.workspace_id = p_workspace_id
         and q.contact_id is not null
         and jsonb_typeof(q.onify_payload->'vehicle') = 'object'
    ), normalises as (
      select source.*,
             coalesce(
               nullif(upper(regexp_replace(source.vehicule->>'immat', '[^A-Za-z0-9]', '', 'g')), ''),
               nullif(upper(trim(coalesce(
                 source.vehicule->>'brand_model',
                 concat_ws(' ', source.vehicule->>'brand', source.vehicule->>'model')
               ))), '')
             ) as cle_vehicule
        from sources source
    ), uniques as (
      select distinct on (n.contact_id, n.cle_vehicule)
             n.contact_id, n.vehicule, n.synchronise_le, n.cle_vehicule
        from normalises n
       where n.cle_vehicule is not null
       order by n.contact_id, n.cle_vehicule, n.synchronise_le desc nulls last
    ), comptes as (
      select contact_id, count(*) as nb_vehicules
        from uniques
       group by contact_id
    )
    select u.contact_id, u.vehicule, u.synchronise_le, c.nb_vehicules
      from uniques u
      join comptes c using (contact_id)
     order by u.contact_id, u.synchronise_le desc nulls last
  loop
    v_marque := nullif(trim(v.vehicule->>'brand'), '');
    v_modele := nullif(trim(v.vehicule->>'model'), '');
    v_immat := nullif(trim(v.vehicule->>'immat'), '');

    -- Certaines réponses Onify ne donnent que « brand_model ». On retire la
    -- marque du début lorsqu'elle est déjà connue pour éviter « Renault
    -- Renault Clio » dans le planning.
    if v_modele is null then
      v_modele := nullif(trim(v.vehicule->>'brand_model'), '');
      if v_modele is not null and v_marque is not null
         and upper(v_modele) like upper(v_marque) || ' %' then
        v_modele := nullif(trim(substr(v_modele, length(v_marque) + 1)), '');
      end if;
    end if;

    if v_marque is null and v_modele is null and v_immat is null then
      continue;
    end if;

    -- La fiche commerciale reçoit les informations manquantes, sans écraser
    -- une qualification faite dans le CRM.
    update public.leads l
       set vehicle_make = coalesce(nullif(trim(l.vehicle_make), ''), v_marque),
           vehicle_model = coalesce(nullif(trim(l.vehicle_model), ''), v_modele),
           vehicle_registration = coalesce(nullif(trim(l.vehicle_registration), ''), v_immat),
           updated_at = now()
     where l.workspace_id = p_workspace_id
       and l.contact_id = v.contact_id
       and (
         (
           v_immat is not null
           and upper(regexp_replace(coalesce(l.vehicle_registration, ''), '[^A-Za-z0-9]', '', 'g'))
             = upper(regexp_replace(v_immat, '[^A-Za-z0-9]', '', 'g'))
         )
         or (
           v.nb_vehicules = 1
           and nullif(trim(l.vehicle_registration), '') is null
         )
       )
       and (
         (nullif(trim(l.vehicle_make), '') is null and v_marque is not null)
         or (nullif(trim(l.vehicle_model), '') is null and v_modele is not null)
         or (nullif(trim(l.vehicle_registration), '') is null and v_immat is not null)
       );
    get diagnostics v_modifies = row_count;
    v_total := v_total + v_modifies;

    -- Le rendez-vous porte sa propre copie non financière : le technicien la
    -- lit même lorsque les politiques RLS lui masquent la facture et le lead.
    update public.appointments a
       set vehicle_make = case
             when a.vehicle_source = 'onify' or nullif(trim(a.vehicle_make), '') is null
               then coalesce(v_marque, a.vehicle_make)
             else a.vehicle_make end,
           vehicle_model = case
             when a.vehicle_source = 'onify' or nullif(trim(a.vehicle_model), '') is null
               then coalesce(v_modele, a.vehicle_model)
             else a.vehicle_model end,
           vehicle_registration = case
             when a.vehicle_source = 'onify' or nullif(trim(a.vehicle_registration), '') is null
               then coalesce(v_immat, a.vehicle_registration)
             else a.vehicle_registration end,
           vehicle_source = case
             when a.vehicle_source = 'onify'
               or (
                 nullif(trim(a.vehicle_make), '') is null
                 and nullif(trim(a.vehicle_model), '') is null
                 and nullif(trim(a.vehicle_registration), '') is null
               ) then 'onify'
             else coalesce(a.vehicle_source, 'mixed') end,
           updated_at = now()
     where a.workspace_id = p_workspace_id
       and (
         a.contact_id = v.contact_id
         or exists (
           select 1 from public.leads l
           where l.id = a.lead_id and l.contact_id = v.contact_id
         )
       )
       and (
         (
           v_immat is not null
           and (
             upper(regexp_replace(coalesce(a.vehicle_registration, ''), '[^A-Za-z0-9]', '', 'g'))
               = upper(regexp_replace(v_immat, '[^A-Za-z0-9]', '', 'g'))
             or upper(regexp_replace(
               coalesce((regexp_match(a.title, '\(([A-Za-z0-9 -]{5,12})\)'))[1], ''),
               '[^A-Za-z0-9]', '', 'g'
             )) = upper(regexp_replace(v_immat, '[^A-Za-z0-9]', '', 'g'))
             or exists (
               select 1 from public.leads l
                where l.id = a.lead_id
                  and upper(regexp_replace(coalesce(l.vehicle_registration, ''), '[^A-Za-z0-9]', '', 'g'))
                    = upper(regexp_replace(v_immat, '[^A-Za-z0-9]', '', 'g'))
             )
           )
         )
         or (
           v.nb_vehicules = 1
           and nullif(trim(a.vehicle_registration), '') is null
           and not exists (
             select 1 from public.leads l
              where l.id = a.lead_id and nullif(trim(l.vehicle_registration), '') is not null
           )
         )
       )
       and (
         a.vehicle_source = 'onify'
         or (nullif(trim(a.vehicle_make), '') is null and v_marque is not null)
         or (nullif(trim(a.vehicle_model), '') is null and v_modele is not null)
         or (nullif(trim(a.vehicle_registration), '') is null and v_immat is not null)
       );
    get diagnostics v_modifies = row_count;
    v_total := v_total + v_modifies;
  end loop;

  return v_total;
end
$$;

comment on function public.propager_vehicules_onify(uuid) is
  'Recopie marque, modèle et plaque Onify vers les leads et rendez-vous, sans données financières.';

revoke all on function public.propager_vehicules_onify(uuid) from public, anon, authenticated;
grant execute on function public.propager_vehicules_onify(uuid) to service_role;

-- Rattrapage immédiat des factures et devis Onify déjà importés.
do $$
declare
  v_workspace record;
begin
  for v_workspace in select id from public.workspaces loop
    perform public.propager_vehicules_onify(v_workspace.id);
  end loop;
end
$$;
