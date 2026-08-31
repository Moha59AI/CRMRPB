/*
# Politiques RLS par rôle

## Ce qui existait

Toutes les tables appliquaient la même règle : `workspace_id =
get_workspace_id()`. Autrement dit, tout membre authentifié d'un espace pouvait
créer, modifier et supprimer n'importe quoi — factures, campagnes, scénarios,
connexions d'intégration et webhooks compris. Le rôle du profil n'était lu
nulle part.

Les politiques appliquent désormais `MATRICE-ROLES.md`.

## Comment lire ce fichier

Les politiques d'une même table sont **permissives** : PostgreSQL les combine
par OU. C'est ce qui permet d'ajouter les accès du technicien par-dessus la
règle générale, sans dupliquer ni compliquer cette dernière.

Le technicien est traité à part parce que son périmètre n'est pas un rôle mais
une affectation : il voit ses interventions, pas celles des autres.
*/

-- ============ LECTURE DU RÔLE ============
-- SECURITY DEFINER pour lire profiles sans repasser par la RLS de profiles,
-- qui provoquerait une récursion — même raison que get_workspace_id().

create or replace function public.mon_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() limit 1;
$$;

create or replace function public.a_role(p_roles text[])
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(public.mon_role() = any(p_roles), false);
$$;

grant execute on function public.mon_role() to authenticated;
grant execute on function public.a_role(text[]) to authenticated;


-- ============ PÉRIMÈTRE DU TECHNICIEN ============
-- Un lead lui est visible s'il est rattaché à un dossier ou à un rendez-vous
-- qui lui est affecté.

create or replace function public.technicien_voit_lead(p_lead_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from windscreen_cases wc
    where wc.lead_id = p_lead_id
      and (wc.technician_id = auth.uid() or wc.assigned_user_id = auth.uid())
  ) or exists (
    select 1 from appointments a
    where a.lead_id = p_lead_id and a.assigned_user_id = auth.uid()
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
    select 1 from windscreen_cases wc
    where wc.contact_id = p_contact_id
      and (wc.technician_id = auth.uid() or wc.assigned_user_id = auth.uid())
  );
$$;

grant execute on function public.technicien_voit_lead(uuid) to authenticated;
grant execute on function public.technicien_voit_contact(uuid) to authenticated;


-- ============ RÈGLE GÉNÉRALE, TABLE PAR TABLE ============

do $$
declare
  r record;
begin
  for r in
    select * from (values
      -- table,               select,                              insert,                    update,                    delete
      ('leads',               'admin,manager,advisor',             'admin,manager,advisor',   'admin,manager,advisor',   'admin,manager'),
      ('contacts',            'admin,manager,advisor,accountant',  'admin,manager,advisor',   'admin,manager,advisor',   'admin,manager'),
      ('vehicles',            'admin,manager,advisor',             'admin,manager,advisor',   'admin,manager,advisor',   'admin,manager'),
      ('insurers',            'admin,manager,advisor,accountant',  'admin,manager',           'admin,manager',           'admin'),
      ('windscreen_cases',    'admin,manager,advisor,accountant',  'admin,manager,advisor',   'admin,manager,advisor',   'admin,manager'),
      ('case_documents',      'admin,manager,advisor,accountant',  'admin,manager,advisor',   'admin,manager,advisor',   'admin,manager'),
      ('appointments',        'admin,manager,advisor',             'admin,manager,advisor',   'admin,manager,advisor',   'admin,manager'),
      ('tasks',               'admin,manager,advisor',             'admin,manager,advisor',   'admin,manager,advisor',   'admin,manager'),
      -- Une note ou un echange consigne est une trace, pas un brouillon.
      ('notes',               'admin,manager,advisor',             'admin,manager,advisor',   'admin,manager',           'admin'),
      ('communications',      'admin,manager,advisor',             'admin,manager,advisor',   'admin,manager',           'admin'),
      ('activities',          'admin,manager,advisor',             'admin,manager,advisor',   'admin',                   'admin'),
      ('sms_templates',       'admin,manager,advisor',             'admin,manager',           'admin,manager',           'admin,manager'),
      ('campaigns',           'admin,manager,advisor',             'admin,manager',           'admin,manager',           'admin,manager'),
      -- Un scenario envoie des SMS en masse et appelle des API externes :
      -- sa suppression reste a l'administrateur.
      ('workflows',           'admin,manager,advisor',             'admin,manager',           'admin,manager',           'admin'),
      ('workflow_runs',       'admin,manager,advisor',             'admin,manager',           'admin',                   'admin'),
      ('quotes',              'admin,manager,accountant',          'admin,manager,accountant','admin,manager,accountant','admin,accountant'),
      -- Une facture emise et un paiement encaisse relevent du comptable.
      ('invoices',            'admin,manager,accountant',          'admin,accountant',        'admin,accountant',        'admin'),
      ('payments',            'admin,manager,accountant',          'admin,accountant',        'admin,accountant',        'admin'),
      ('gifts',               'admin,manager,accountant',          'admin,manager,accountant','admin,manager,accountant','admin'),
      ('after_sales_cases',   'admin,manager,advisor,accountant',  'admin,manager,advisor',   'admin,manager,advisor',   'admin,manager'),
      -- integration_connections porte les references aux secrets du Vault :
      -- y lire revient a tenir les cles Meta.
      ('integration_connections', 'admin',                         'admin',                   'admin',                   'admin'),
      ('meta_forms',          'admin,manager',                     'admin',                   'admin',                   'admin'),
      ('webhook_endpoints',   'admin',                             'admin',                   'admin',                   'admin'),
      ('webhook_events',      'admin,manager',                     'admin',                   'admin',                   'admin')
    ) as t(tbl, sel, ins, upd, del)
  loop
    execute format('drop policy if exists "select_%s" on %I', r.tbl, r.tbl);
    execute format(
      'create policy "select_%s" on %I for select to authenticated
         using (workspace_id = public.get_workspace_id() and public.a_role(string_to_array(%L, '','')))',
      r.tbl, r.tbl, r.sel);

    execute format('drop policy if exists "insert_%s" on %I', r.tbl, r.tbl);
    execute format(
      'create policy "insert_%s" on %I for insert to authenticated
         with check (workspace_id = public.get_workspace_id() and public.a_role(string_to_array(%L, '','')))',
      r.tbl, r.tbl, r.ins);

    execute format('drop policy if exists "update_%s" on %I', r.tbl, r.tbl);
    execute format(
      'create policy "update_%s" on %I for update to authenticated
         using (workspace_id = public.get_workspace_id() and public.a_role(string_to_array(%L, '','')))
         with check (workspace_id = public.get_workspace_id() and public.a_role(string_to_array(%L, '','')))',
      r.tbl, r.tbl, r.upd, r.upd);

    execute format('drop policy if exists "delete_%s" on %I', r.tbl, r.tbl);
    execute format(
      'create policy "delete_%s" on %I for delete to authenticated
         using (workspace_id = public.get_workspace_id() and public.a_role(string_to_array(%L, '','')))',
      r.tbl, r.tbl, r.del);
  end loop;
end $$;


-- ============ ACCÈS DU TECHNICIEN ============
-- Politiques additionnelles : PostgreSQL combine les politiques permissives
-- par OU. Le technicien voit donc ses interventions en plus de la regle
-- generale, sans que celle-ci ait a le prevoir.

drop policy if exists "technicien_select_appointments" on appointments;
create policy "technicien_select_appointments" on appointments for select
  to authenticated using (
    public.a_role(array['technician']) and assigned_user_id = auth.uid()
  );

drop policy if exists "technicien_update_appointments" on appointments;
create policy "technicien_update_appointments" on appointments for update
  to authenticated using (
    public.a_role(array['technician']) and assigned_user_id = auth.uid()
  ) with check (
    public.a_role(array['technician']) and assigned_user_id = auth.uid()
  );

drop policy if exists "technicien_select_cases" on windscreen_cases;
create policy "technicien_select_cases" on windscreen_cases for select
  to authenticated using (
    public.a_role(array['technician'])
    and (technician_id = auth.uid() or assigned_user_id = auth.uid())
  );

drop policy if exists "technicien_update_cases" on windscreen_cases;
create policy "technicien_update_cases" on windscreen_cases for update
  to authenticated using (
    public.a_role(array['technician'])
    and (technician_id = auth.uid() or assigned_user_id = auth.uid())
  ) with check (
    public.a_role(array['technician'])
    and (technician_id = auth.uid() or assigned_user_id = auth.uid())
  );

-- Les coordonnees du client de ses interventions : sans le telephone, le
-- technicien ne peut ni prevenir d'un retard ni se faire ouvrir un portail.
drop policy if exists "technicien_select_leads" on leads;
create policy "technicien_select_leads" on leads for select
  to authenticated using (
    public.a_role(array['technician']) and public.technicien_voit_lead(id)
  );

drop policy if exists "technicien_select_contacts" on contacts;
create policy "technicien_select_contacts" on contacts for select
  to authenticated using (
    public.a_role(array['technician']) and public.technicien_voit_contact(id)
  );

drop policy if exists "technicien_select_tasks" on tasks;
create policy "technicien_select_tasks" on tasks for select
  to authenticated using (
    public.a_role(array['technician']) and assigned_user_id = auth.uid()
  );

drop policy if exists "technicien_update_tasks" on tasks;
create policy "technicien_update_tasks" on tasks for update
  to authenticated using (
    public.a_role(array['technician']) and assigned_user_id = auth.uid()
  ) with check (
    public.a_role(array['technician']) and assigned_user_id = auth.uid()
  );

-- Il consigne ce qu'il constate sur place, sur ses interventions uniquement.
drop policy if exists "technicien_insert_notes" on notes;
create policy "technicien_insert_notes" on notes for insert
  to authenticated with check (
    public.a_role(array['technician'])
    and workspace_id = public.get_workspace_id()
    and (lead_id is null or public.technicien_voit_lead(lead_id))
  );

drop policy if exists "technicien_select_notes" on notes;
create policy "technicien_select_notes" on notes for select
  to authenticated using (
    public.a_role(array['technician'])
    and (lead_id is null or public.technicien_voit_lead(lead_id))
  );

drop policy if exists "technicien_select_documents" on case_documents;
create policy "technicien_select_documents" on case_documents for select
  to authenticated using (
    public.a_role(array['technician'])
    and exists (select 1 from windscreen_cases wc
                where wc.id = case_documents.case_id
                  and (wc.technician_id = auth.uid() or wc.assigned_user_id = auth.uid()))
  );


-- ============ TABLES TRANSVERSES ============

-- Chacun ne voit et ne traite que ses propres notifications.
drop policy if exists "select_notifications" on notifications;
create policy "select_notifications" on notifications for select
  to authenticated using (
    workspace_id = public.get_workspace_id()
    and (user_id = auth.uid() or public.a_role(array['admin']))
  );

drop policy if exists "update_notifications" on notifications;
create policy "update_notifications" on notifications for update
  to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "insert_notifications" on notifications;
create policy "insert_notifications" on notifications for insert
  to authenticated with check (workspace_id = public.get_workspace_id());

-- Le journal d'audit se lit par l'administrateur seul. L'ecriture reste
-- ouverte pour que l'application puisse tracer, mais chacun ne signe que sous
-- son propre identifiant.
drop policy if exists "select_audit_logs" on audit_logs;
create policy "select_audit_logs" on audit_logs for select
  to authenticated using (
    workspace_id = public.get_workspace_id() and public.a_role(array['admin'])
  );

drop policy if exists "insert_audit_logs" on audit_logs;
create policy "insert_audit_logs" on audit_logs for insert
  to authenticated with check (
    workspace_id = public.get_workspace_id()
    and (user_id is null or user_id = auth.uid())
  );

-- L'espace de travail se lit par tous ses membres, ne se modifie que par
-- l'administrateur, et ne se cree plus depuis l'application : c'est
-- initialiser_premier_admin qui s'en charge.
drop policy if exists "select_workspaces" on workspaces;
create policy "select_workspaces" on workspaces for select
  to authenticated using (id = public.get_workspace_id());

drop policy if exists "insert_workspaces" on workspaces;

drop policy if exists "update_workspaces" on workspaces;
create policy "update_workspaces" on workspaces for update
  to authenticated using (
    id = public.get_workspace_id() and public.a_role(array['admin'])
  ) with check (
    id = public.get_workspace_id() and public.a_role(array['admin'])
  );

-- Le profil se cree desormais par le trigger handle_new_user, en SECURITY
-- DEFINER : plus aucune insertion depuis le navigateur.
drop policy if exists "insert_own_profile" on profiles;

drop policy if exists "update_own_profile" on profiles;
create policy "update_own_profile" on profiles for update
  to authenticated using (auth.uid() = id) with check (auth.uid() = id);


-- ============ RESTRICTION PAR COLONNE POUR LE TECHNICIEN ============
-- La RLS filtre des lignes, jamais des colonnes : un technicien autorise a
-- modifier son intervention pourrait sinon en changer la marge ou le montant.
-- Les GRANT par colonne portent sur les roles PostgreSQL, pas sur les roles
-- applicatifs — un trigger de validation est le seul moyen propre.

create or replace function public.verifier_colonnes_technicien()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.mon_role() is distinct from 'technician' then
    return new;
  end if;

  if new.franchise_amount is distinct from old.franchise_amount
     or new.gift_amount is distinct from old.gift_amount
     or new.estimated_margin is distinct from old.estimated_margin
     or new.offer is distinct from old.offer
     or new.insurer_id is distinct from old.insurer_id
     or new.contact_id is distinct from old.contact_id
     or new.lead_id is distinct from old.lead_id
     or new.technician_id is distinct from old.technician_id
     or new.assigned_user_id is distinct from old.assigned_user_id
  then
    raise exception 'Un technicien ne peut modifier que les informations d''intervention';
  end if;

  return new;
end;
$$;

drop trigger if exists cases_colonnes_technicien on windscreen_cases;
create trigger cases_colonnes_technicien
  before update on windscreen_cases
  for each row execute function public.verifier_colonnes_technicien();
