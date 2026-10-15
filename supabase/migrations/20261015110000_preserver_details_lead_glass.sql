/*
  Passage Lead -> Glass sans perte d'information.

  Le dossier Onify reste la source des statuts et de l'identite Glass. Les
  informations operationnelles saisies dans le CRM (lieu, offre, franchise)
  sont conservees dans windscreen_cases, puis enrichies par les donnees
  Onify. Une modification humaine dans Glass reste prioritaire.
*/

begin;

alter table public.leads
  add column if not exists franchise_type text
    check (franchise_type is null or franchise_type in ('euro', 'percent'));

update public.leads
   set franchise_type = 'euro'
 where franchise_amount is not null
   and franchise_type is null;

comment on column public.leads.franchise_type is
  'Unite de la franchise connue : euro ou pourcentage. NULL si inconnue.';

alter table public.windscreen_cases
  add column if not exists intervention_postal_code text,
  add column if not exists intervention_city text,
  add column if not exists intervention_citycode text,
  add column if not exists intervention_latitude double precision,
  add column if not exists intervention_longitude double precision,
  add column if not exists intervention_geo_precision text
    check (intervention_geo_precision is null or intervention_geo_precision in ('exact', 'approximatif')),
  add column if not exists insurance_name text,
  add column if not exists franchise_type text
    check (franchise_type is null or franchise_type in ('euro', 'percent')),
  add column if not exists franchise_source text
    check (franchise_source is null or franchise_source in ('lead', 'onify', 'manual'));

alter table public.windscreen_cases
  alter column franchise_amount drop default;

comment on column public.windscreen_cases.insurance_name is
  'Assureur consolide et modifiable dans le CRM. onify_insurer_name conserve la valeur brute Onify.';
comment on column public.windscreen_cases.franchise_type is
  'Unite explicite de la franchise : euro ou pourcentage.';
comment on column public.windscreen_cases.franchise_source is
  'Origine de la franchise : lead, Onify ou correction manuelle.';

/*
  Les anciens dossiers Glass ont recu 0 par defaut, meme lorsque la franchise
  etait inconnue. On ne garde ce zero que s'il existe une preuve dans le lead
  ou dans un document financier Onify. Un montant non nul deja saisi est
  considere comme une correction humaine et ne sera jamais remplace.
*/
update public.windscreen_cases dossier
   set franchise_source = 'manual'
 where dossier.onify_glass_case_id is not null
   and dossier.franchise_amount is not null
   and dossier.franchise_amount <> 0
   and dossier.franchise_source is null;

update public.windscreen_cases dossier
   set franchise_amount = null,
       franchise_type = null,
       franchise_source = null
 where dossier.onify_glass_case_id is not null
   and dossier.franchise_amount = 0
   and dossier.franchise_source is null
   and not exists (
     select 1
       from public.leads lead
      where lead.id = dossier.lead_id
        and lead.franchise_amount = 0
   )
   and not exists (
     select 1
       from (
         select facture.onify_payload
           from public.invoices facture
          where facture.workspace_id = dossier.workspace_id
            and (facture.case_id = dossier.id or facture.affaire_id = dossier.affaire_id)
         union all
         select devis.onify_payload
           from public.quotes devis
          where devis.workspace_id = dossier.workspace_id
            and (devis.case_id = dossier.id or devis.affaire_id = dossier.affaire_id)
       ) document_onify
      where replace(trim(document_onify.onify_payload->'vehicle'->>'franchise'), ',', '.') = '0'
   );

create or replace function public.completer_dossiers_glass_operationnels(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_depuis_leads integer := 0;
  v_depuis_onify integer := 0;
begin
  /* Le lead complete uniquement les champs absents du dossier Glass. */
  update public.windscreen_cases dossier
     set intervention_address = coalesce(
           nullif(trim(dossier.intervention_address), ''),
           nullif(trim(coalesce(lead.intervention_address, lead.address)), '')
         ),
         intervention_postal_code = coalesce(
           nullif(trim(dossier.intervention_postal_code), ''),
           nullif(trim(coalesce(lead.intervention_postal_code, lead.postal_code)), '')
         ),
         intervention_city = coalesce(
           nullif(trim(dossier.intervention_city), ''),
           nullif(trim(coalesce(lead.intervention_city, lead.city)), '')
         ),
         intervention_citycode = coalesce(
           nullif(trim(dossier.intervention_citycode), ''),
           nullif(trim(coalesce(lead.intervention_citycode, lead.citycode)), '')
         ),
         intervention_latitude = coalesce(
           dossier.intervention_latitude,
           lead.intervention_latitude,
           lead.latitude
         ),
         intervention_longitude = coalesce(
           dossier.intervention_longitude,
           lead.intervention_longitude,
           lead.longitude
         ),
         intervention_geo_precision = coalesce(
           dossier.intervention_geo_precision,
           lead.intervention_geo_precision,
           lead.geo_precision
         ),
         insurance_name = coalesce(
           nullif(trim(dossier.insurance_name), ''),
           nullif(trim(dossier.onify_insurer_name), ''),
           nullif(trim(lead.insurance), '')
         ),
         offer = coalesce(nullif(trim(dossier.offer), ''), nullif(trim(lead.offer), '')),
         gift_type = coalesce(
           nullif(trim(dossier.gift_type), ''),
           nullif(trim(dossier.offer), ''),
           nullif(trim(lead.offer), '')
         ),
         glass_type = coalesce(dossier.glass_type, lead.glass_type),
         has_adas_camera = coalesce(lead.has_adas_camera, dossier.has_adas_camera),
         assigned_user_id = coalesce(dossier.assigned_user_id, lead.assigned_user_id),
         franchise_amount = case
           when dossier.franchise_source = 'manual' then dossier.franchise_amount
           when lead.franchise_amount is not null then lead.franchise_amount
           else dossier.franchise_amount
         end,
         franchise_type = case
           when dossier.franchise_source = 'manual' then dossier.franchise_type
           when lead.franchise_amount is not null
             then coalesce(lead.franchise_type, 'euro')
           else dossier.franchise_type
         end,
         franchise_source = case
           when dossier.franchise_source = 'manual' then 'manual'
           when lead.franchise_amount is not null then 'lead'
           else dossier.franchise_source
         end,
         updated_at = now()
    from public.leads lead
   where dossier.workspace_id = p_workspace_id
     and dossier.onify_glass_case_id is not null
     and dossier.lead_id = lead.id
     and lead.workspace_id = dossier.workspace_id
     and (
       (nullif(trim(dossier.intervention_address), '') is null
         and nullif(trim(coalesce(lead.intervention_address, lead.address)), '') is not null)
       or (nullif(trim(dossier.intervention_postal_code), '') is null
         and nullif(trim(coalesce(lead.intervention_postal_code, lead.postal_code)), '') is not null)
       or (nullif(trim(dossier.intervention_city), '') is null
         and nullif(trim(coalesce(lead.intervention_city, lead.city)), '') is not null)
       or (nullif(trim(dossier.insurance_name), '') is null
         and coalesce(nullif(trim(dossier.onify_insurer_name), ''), nullif(trim(lead.insurance), '')) is not null)
       or (nullif(trim(dossier.offer), '') is null and nullif(trim(lead.offer), '') is not null)
       or (nullif(trim(dossier.gift_type), '') is null and nullif(trim(lead.offer), '') is not null)
       or (dossier.glass_type is null and lead.glass_type is not null)
       or (lead.has_adas_camera is true and dossier.has_adas_camera is false)
       or (dossier.assigned_user_id is null and lead.assigned_user_id is not null)
       or (dossier.franchise_source is distinct from 'manual'
         and lead.franchise_amount is not null
         and (
           dossier.franchise_amount is distinct from lead.franchise_amount
           or dossier.franchise_type is distinct from coalesce(lead.franchise_type, 'euro')
           or dossier.franchise_source is distinct from 'lead'
         ))
     );
  get diagnostics v_depuis_leads = row_count;

  /*
    /recovery/cases ne contient pas la franchise. Elle est lue dans vehicle
    des devis/factures Onify deja rattaches a la meme affaire. L'unite est
    obligatoire : un pourcentage ne doit jamais devenir un montant en euros.
  */
  with franchises_onify as (
    select dossier.id as dossier_id,
           source_document.montant,
           source_document.unite
      from public.windscreen_cases dossier
      join lateral (
        select candidat.montant, candidat.unite
          from (
            select replace(trim(facture.onify_payload->'vehicle'->>'franchise'), ',', '.')::numeric as montant,
                   case
                     when lower(trim(facture.onify_payload->'vehicle'->>'franchise_type'))
                       in ('percent', 'percentage', 'pourcentage', '%') then 'percent'
                     when lower(trim(facture.onify_payload->'vehicle'->>'franchise_type'))
                       in ('euro', 'euros', 'eur', '€') then 'euro'
                     else null
                   end as unite,
                   coalesce(facture.issue_date, facture.onify_synced_at, facture.created_at) as date_source,
                   2 as priorite
              from public.invoices facture
             where facture.workspace_id = dossier.workspace_id
               and (facture.case_id = dossier.id or facture.affaire_id = dossier.affaire_id)
               and replace(trim(facture.onify_payload->'vehicle'->>'franchise'), ',', '.')
                 ~ '^[0-9]+([.][0-9]+)?$'
            union all
            select replace(trim(devis.onify_payload->'vehicle'->>'franchise'), ',', '.')::numeric as montant,
                   case
                     when lower(trim(devis.onify_payload->'vehicle'->>'franchise_type'))
                       in ('percent', 'percentage', 'pourcentage', '%') then 'percent'
                     when lower(trim(devis.onify_payload->'vehicle'->>'franchise_type'))
                       in ('euro', 'euros', 'eur', '€') then 'euro'
                     else null
                   end as unite,
                   coalesce(devis.onify_synced_at, devis.updated_at, devis.created_at) as date_source,
                   1 as priorite
              from public.quotes devis
             where devis.workspace_id = dossier.workspace_id
               and (devis.case_id = dossier.id or devis.affaire_id = dossier.affaire_id)
               and replace(trim(devis.onify_payload->'vehicle'->>'franchise'), ',', '.')
                 ~ '^[0-9]+([.][0-9]+)?$'
          ) candidat
         where candidat.unite is not null
         order by candidat.date_source desc nulls last, candidat.priorite desc
         limit 1
      ) source_document on true
     where dossier.workspace_id = p_workspace_id
       and dossier.onify_glass_case_id is not null
       and dossier.franchise_source is distinct from 'manual'
       and dossier.franchise_source is distinct from 'lead'
  )
  update public.windscreen_cases dossier
     set franchise_amount = source.montant,
         franchise_type = source.unite,
         franchise_source = 'onify',
         updated_at = now()
    from franchises_onify source
   where dossier.id = source.dossier_id
     and (
       dossier.franchise_amount is distinct from source.montant
       or dossier.franchise_type is distinct from source.unite
       or dossier.franchise_source is distinct from 'onify'
     );
  get diagnostics v_depuis_onify = row_count;

  return jsonb_build_object(
    'cases_completed_from_leads', v_depuis_leads,
    'franchises_completed_from_onify', v_depuis_onify
  );
end;
$$;

revoke all on function public.completer_dossiers_glass_operationnels(uuid)
  from public, anon, authenticated;
grant execute on function public.completer_dossiers_glass_operationnels(uuid)
  to service_role;

create or replace function public.mettre_a_jour_dossier_glass(
  p_case_id uuid,
  p_details jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_dossier public.windscreen_cases%rowtype;
  v_workspace_id uuid := public.get_workspace_id();
  v_lieu_modifie boolean := false;
  v_assurance text;
begin
  select * into v_dossier
    from public.windscreen_cases
   where id = p_case_id
     and workspace_id = v_workspace_id;

  if not found then
    raise exception 'Dossier Glass introuvable';
  end if;

  v_lieu_modifie :=
    (p_details ? 'intervention_address'
      and v_dossier.intervention_address is distinct from nullif(trim(p_details->>'intervention_address'), ''))
    or (p_details ? 'intervention_postal_code'
      and v_dossier.intervention_postal_code is distinct from nullif(trim(p_details->>'intervention_postal_code'), ''))
    or (p_details ? 'intervention_city'
      and v_dossier.intervention_city is distinct from nullif(trim(p_details->>'intervention_city'), ''));

  v_assurance := case
    when p_details ? 'insurance_name' then nullif(trim(p_details->>'insurance_name'), '')
    else v_dossier.insurance_name
  end;

  update public.windscreen_cases dossier
     set intervention_address = case when p_details ? 'intervention_address'
           then nullif(trim(p_details->>'intervention_address'), '') else dossier.intervention_address end,
         intervention_postal_code = case when p_details ? 'intervention_postal_code'
           then nullif(trim(p_details->>'intervention_postal_code'), '') else dossier.intervention_postal_code end,
         intervention_city = case when p_details ? 'intervention_city'
           then nullif(trim(p_details->>'intervention_city'), '') else dossier.intervention_city end,
         intervention_citycode = case when v_lieu_modifie then null else dossier.intervention_citycode end,
         intervention_latitude = case when v_lieu_modifie then null else dossier.intervention_latitude end,
         intervention_longitude = case when v_lieu_modifie then null else dossier.intervention_longitude end,
         intervention_geo_precision = case when v_lieu_modifie then null else dossier.intervention_geo_precision end,
         intervention_type = case when p_details ? 'intervention_type'
           then nullif(trim(p_details->>'intervention_type'), '') else dossier.intervention_type end,
         insurance_name = case when p_details ? 'insurance_name' then v_assurance else dossier.insurance_name end,
         insurer_id = case when p_details ? 'insurance_name' then (
           select assureur.id
             from public.insurers assureur
            where assureur.workspace_id = dossier.workspace_id
              and v_assurance is not null
              and (
                lower(trim(assureur.name)) = lower(v_assurance)
                or exists (
                  select 1 from unnest(coalesce(assureur.tags, '{}'::text[])) tag
                   where lower(trim(tag)) = lower(v_assurance)
                )
              )
            order by (lower(trim(assureur.name)) = lower(v_assurance)) desc, assureur.name
            limit 1
         ) else dossier.insurer_id end,
         franchise_amount = case when p_details ? 'franchise_amount'
           then nullif(trim(p_details->>'franchise_amount'), '')::numeric else dossier.franchise_amount end,
         franchise_type = case when p_details ? 'franchise_type'
           then nullif(trim(p_details->>'franchise_type'), '') else dossier.franchise_type end,
         franchise_source = case
           when p_details ? 'franchise_amount' then
             case when nullif(trim(p_details->>'franchise_amount'), '') is null then null else 'manual' end
           when p_details ? 'franchise_type' and dossier.franchise_amount is not null then 'manual'
           else dossier.franchise_source
         end,
         offer = case when p_details ? 'offer'
           then nullif(trim(p_details->>'offer'), '') else dossier.offer end,
         gift_type = case when p_details ? 'gift_type'
           then nullif(trim(p_details->>'gift_type'), '') else dossier.gift_type end,
         gift_amount = case when p_details ? 'gift_amount'
           then coalesce(nullif(trim(p_details->>'gift_amount'), '')::numeric, 0) else dossier.gift_amount end,
         insurance_contract_number = case when p_details ? 'insurance_contract_number'
           then nullif(trim(p_details->>'insurance_contract_number'), '') else dossier.insurance_contract_number end,
         insurance_claim_number = case when p_details ? 'insurance_claim_number'
           then nullif(trim(p_details->>'insurance_claim_number'), '') else dossier.insurance_claim_number end,
         insurance_claim_date = case when p_details ? 'insurance_claim_date'
           then nullif(trim(p_details->>'insurance_claim_date'), '')::date else dossier.insurance_claim_date end,
         updated_at = now()
   where dossier.id = p_case_id
     and dossier.workspace_id = v_workspace_id
  returning * into v_dossier;

  if v_dossier.lead_id is not null then
    update public.leads lead
       set intervention_address = case when p_details ? 'intervention_address'
             then v_dossier.intervention_address else lead.intervention_address end,
           intervention_postal_code = case when p_details ? 'intervention_postal_code'
             then v_dossier.intervention_postal_code else lead.intervention_postal_code end,
           intervention_city = case when p_details ? 'intervention_city'
             then v_dossier.intervention_city else lead.intervention_city end,
           intervention_citycode = case when v_lieu_modifie then null else lead.intervention_citycode end,
           intervention_latitude = case when v_lieu_modifie then null else lead.intervention_latitude end,
           intervention_longitude = case when v_lieu_modifie then null else lead.intervention_longitude end,
           intervention_geo_precision = case when v_lieu_modifie then null else lead.intervention_geo_precision end,
           insurance = case when p_details ? 'insurance_name'
             then v_dossier.insurance_name else lead.insurance end,
           offer = case when p_details ? 'offer' or p_details ? 'gift_type'
             then coalesce(v_dossier.gift_type, v_dossier.offer) else lead.offer end,
           franchise_amount = case when p_details ? 'franchise_amount'
             then v_dossier.franchise_amount else lead.franchise_amount end,
           franchise_type = case when p_details ? 'franchise_amount' or p_details ? 'franchise_type'
             then v_dossier.franchise_type else lead.franchise_type end,
           updated_at = now()
     where lead.id = v_dossier.lead_id
       and lead.workspace_id = v_workspace_id;
  end if;

  return to_jsonb(v_dossier);
end;
$$;

comment on function public.mettre_a_jour_dossier_glass(uuid, jsonb) is
  'Met a jour les informations operationnelles du dossier Glass et les recopie sur son lead historique dans la meme transaction.';

revoke all on function public.mettre_a_jour_dossier_glass(uuid, jsonb)
  from public, anon;
grant execute on function public.mettre_a_jour_dossier_glass(uuid, jsonb)
  to authenticated;

do $$
declare
  workspace record;
begin
  for workspace in select id from public.workspaces loop
    perform public.completer_dossiers_glass_operationnels(workspace.id);
  end loop;
end $$;

commit;
