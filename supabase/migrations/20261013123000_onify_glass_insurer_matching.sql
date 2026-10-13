/*
  Les libelles Glass ajoutent souvent la forme juridique au nom connu du CRM :
  "AXA FRANCE IARD", "GMF ASSURANCES", "MAAF ASSURANCES SA", etc.

  On accepte uniquement une inclusion sur un nom ou un tag suffisamment long,
  puis on privilégie la correspondance exacte et la variante la plus précise.
  Aucun assureur n'est créé automatiquement.
*/

create or replace function public.rapprocher_assureurs_glass(p_workspace_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_modifies integer := 0;
begin
  with dossiers as (
    select d.id,
           lower(trim(d.onify_insurer_name)) as nom_glass
    from public.windscreen_cases d
    where d.workspace_id = p_workspace_id
      and d.onify_glass_case_id is not null
      and d.insurer_id is null
      and nullif(trim(d.onify_insurer_name), '') is not null
  ), correspondances as (
    select d.id as dossier_id,
           (
             select a.id
             from public.insurers a
             where a.workspace_id = p_workspace_id
               and (
                 lower(trim(a.name)) = d.nom_glass
                 or exists (
                   select 1
                   from unnest(coalesce(a.tags, '{}'::text[])) tag
                   where lower(trim(tag)) = d.nom_glass
                 )
                 or (
                   length(trim(a.name)) >= 3
                   and d.nom_glass like '%' || lower(trim(a.name)) || '%'
                 )
                 or (
                   length(d.nom_glass) >= 4
                   and lower(trim(a.name)) like '%' || d.nom_glass || '%'
                 )
                 or exists (
                   select 1
                   from unnest(coalesce(a.tags, '{}'::text[])) tag
                   where length(trim(tag)) >= 3
                     and d.nom_glass like '%' || lower(trim(tag)) || '%'
                 )
               )
             order by
               (lower(trim(a.name)) = d.nom_glass) desc,
               (exists (
                 select 1 from unnest(coalesce(a.tags, '{}'::text[])) tag
                 where lower(trim(tag)) = d.nom_glass
               )) desc,
               greatest(
                 case
                   when d.nom_glass like '%' || lower(trim(a.name)) || '%'
                     then length(trim(a.name))
                   else 0
                 end,
                 coalesce((
                   select max(length(trim(tag)))
                   from unnest(coalesce(a.tags, '{}'::text[])) tag
                   where length(trim(tag)) >= 3
                     and d.nom_glass like '%' || lower(trim(tag)) || '%'
                 ), 0)
               ) desc,
               a.name
             limit 1
           ) as insurer_id
    from dossiers d
  )
  update public.windscreen_cases d
     set insurer_id = c.insurer_id,
         updated_at = now()
    from correspondances c
   where d.id = c.dossier_id
     and c.insurer_id is not null;

  get diagnostics v_modifies = row_count;
  return v_modifies;
end;
$$;

revoke all on function public.rapprocher_assureurs_glass(uuid) from public, anon, authenticated;
grant execute on function public.rapprocher_assureurs_glass(uuid) to service_role;
