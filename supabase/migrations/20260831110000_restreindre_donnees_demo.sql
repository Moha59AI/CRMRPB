/*
# Restreint la generation de donnees de demonstration

`seed_demo_leads` est SECURITY DEFINER et n'etait revoquee que pour `anon` :
n'importe quel utilisateur authentifie -- un conseiller, un technicien --
pouvait donc injecter des leads fictifs dans l'espace de production, sans
aucune trace.

La fonction verifie desormais le role de l'appelant. Le masquage du bouton
cote interface reste utile pour ne pas le proposer, mais ne protege rien :
l'appel RPC est atteignable directement avec la cle anon.
*/

create or replace function public.seed_demo_leads(p_workspace_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_avant integer;
  v_apres integer;
begin
  select role into v_role from profiles
  where id = auth.uid() and workspace_id = p_workspace_id;

  if v_role is distinct from 'admin' then
    raise exception 'Seul un administrateur peut generer des donnees de demonstration';
  end if;

  select count(*) into v_avant from leads where workspace_id = p_workspace_id;

  insert into leads (workspace_id, first_name, last_name, phone, email, city, source, status, received_at)
  values
    (p_workspace_id, 'Démo', 'Martin',  '0600000001', 'demo1@example.test', 'Lille',    'manual', 'new',    now() - interval '2 hours'),
    (p_workspace_id, 'Démo', 'Bernard', '0600000002', 'demo2@example.test', 'Roubaix',  'manual', 'nrp',    now() - interval '2 days'),
    (p_workspace_id, 'Démo', 'Petit',   '0600000003', 'demo3@example.test', 'Tourcoing','manual', 'interested', now() - interval '5 days');

  select count(*) into v_apres from leads where workspace_id = p_workspace_id;

  insert into audit_logs (workspace_id, user_id, action, entity_type, metadata)
  values (p_workspace_id, auth.uid(), 'demo_data_seeded', 'lead',
          jsonb_build_object('crees', v_apres - v_avant));

  return v_apres - v_avant;
end;
$$;

revoke all on function public.seed_demo_leads(uuid) from public, anon;
grant execute on function public.seed_demo_leads(uuid) to authenticated;
