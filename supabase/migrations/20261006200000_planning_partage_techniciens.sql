/*
  Les comptes techniciens n'ouvrent que l'Agenda dans l'interface. Ils doivent
  cependant y voir le meme planning que l'equipe, pas seulement les rendez-vous
  qui leur sont affectes.
*/

drop policy if exists "technicien_select_appointments" on public.appointments;
create policy "technicien_select_appointments"
  on public.appointments for select
  to authenticated
  using (
    public.a_role(array['technician'])
    and workspace_id = public.get_workspace_id()
  );

-- Les informations client sont embarquees dans les rendez-vous. Sans ces deux
-- fonctions, un rendez-vous partage apparaitrait sans nom, telephone ni lieu.
create or replace function public.technicien_voit_lead(p_lead_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.windscreen_cases wc
    where wc.lead_id = p_lead_id
      and wc.workspace_id = public.get_workspace_id()
      and (wc.technician_id = auth.uid() or wc.assigned_user_id = auth.uid())
  ) or exists (
    select 1 from public.appointments a
    where a.lead_id = p_lead_id
      and a.workspace_id = public.get_workspace_id()
  );
$$;

create or replace function public.technicien_voit_contact(p_contact_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.windscreen_cases wc
    where wc.contact_id = p_contact_id
      and wc.workspace_id = public.get_workspace_id()
      and (wc.technician_id = auth.uid() or wc.assigned_user_id = auth.uid())
  ) or exists (
    select 1 from public.appointments a
    where a.contact_id = p_contact_id
      and a.workspace_id = public.get_workspace_id()
  );
$$;

grant execute on function public.technicien_voit_lead(uuid) to authenticated;
grant execute on function public.technicien_voit_contact(uuid) to authenticated;

-- Mise a jour instantanee du planning sur tous les postes connectes.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'appointments'
  ) then
    alter publication supabase_realtime add table public.appointments;
  end if;
end $$;
