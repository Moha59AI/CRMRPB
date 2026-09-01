/*
# Tests des politiques RLS

À exécuter dans le SQL Editor **après** la migration `20260831140000_rls_par_role`.
Le script crée ses propres données, teste chaque rôle, puis nettoie tout.

## Comment il simule un utilisateur

`set local role authenticated` place la session dans le rôle applicatif, et
`request.jwt.claims` fournit le `sub` que lit `auth.uid()`. C'est exactement ce
que fait PostgREST à chaque requête : les politiques s'appliquent donc pour de
vrai, sans supposition.

## Ce qu'il vérifie

Pour chaque rôle : SELECT, INSERT, UPDATE, DELETE sur les tables sensibles, et
l'isolation entre deux espaces de travail — le test le plus important, puisqu'un
défaut d'isolation exposerait les données d'un autre atelier.

Une ligne `false` dans la colonne `ok` est un échec. Aucun échec n'est
acceptable.
*/

begin;

create temp table resultats (
  ordre serial,
  role_teste text,
  cas text,
  attendu boolean,
  obtenu boolean,
  ok boolean
) on commit drop;

-- Les tests s'executent sous le role `authenticated` : sans ces droits, ils ne
-- pourraient pas consigner leurs propres resultats dans la table temporaire,
-- creee elle par le proprietaire de la session.
grant select, insert on resultats to authenticated;
grant usage, select on sequence resultats_ordre_seq to authenticated;

-- Un test = une assertion. `attendu` dit si l'accès doit passer.
create or replace function pg_temp.verifier(
  p_role text, p_cas text, p_attendu boolean, p_requete text
) returns void language plpgsql as $$
declare
  v_obtenu boolean;
begin
  begin
    execute p_requete;
    v_obtenu := true;
  exception when others then
    v_obtenu := false;
  end;

  insert into resultats (role_teste, cas, attendu, obtenu, ok)
  values (p_role, p_cas, p_attendu, v_obtenu, v_obtenu = p_attendu);
end;
$$;

-- Compte les lignes visibles : une politique trop large se voit au nombre.
create or replace function pg_temp.compter(
  p_role text, p_cas text, p_attendu integer, p_requete text
) returns void language plpgsql as $$
declare
  v_n integer;
begin
  execute p_requete into v_n;
  insert into resultats (role_teste, cas, attendu, obtenu, ok)
  values (p_role, p_cas, true, v_n = p_attendu, v_n = p_attendu);
end;
$$;


-- ============ JEU D'ESSAI ============
-- Deux espaces distincts : sans quoi l'isolation ne peut pas être testée.

do $$
declare
  ws_a uuid := '11111111-1111-1111-1111-111111111111';
  ws_b uuid := '22222222-2222-2222-2222-222222222222';
begin
  insert into workspaces (id, name, slug) values
    (ws_a, 'Test A', 'test-a'), (ws_b, 'Test B', 'test-b');

  -- auth.users est requis par la clé étrangère de profiles.
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         u.mail, '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
  from (values
    ('aaaaaaa1-0000-0000-0000-000000000001'::uuid, 'admin@test.local'),
    ('aaaaaaa1-0000-0000-0000-000000000002'::uuid, 'manager@test.local'),
    ('aaaaaaa1-0000-0000-0000-000000000003'::uuid, 'advisor@test.local'),
    ('aaaaaaa1-0000-0000-0000-000000000004'::uuid, 'techn@test.local'),
    ('aaaaaaa1-0000-0000-0000-000000000005'::uuid, 'compta@test.local'),
    ('bbbbbbb1-0000-0000-0000-000000000001'::uuid, 'admin-b@test.local')
  ) as u(id, mail);

  insert into profiles (id, workspace_id, first_name, last_name, role) values
    ('aaaaaaa1-0000-0000-0000-000000000001', ws_a, 'Adm', 'A', 'admin'),
    ('aaaaaaa1-0000-0000-0000-000000000002', ws_a, 'Man', 'A', 'manager'),
    ('aaaaaaa1-0000-0000-0000-000000000003', ws_a, 'Adv', 'A', 'advisor'),
    ('aaaaaaa1-0000-0000-0000-000000000004', ws_a, 'Tec', 'A', 'technician'),
    ('aaaaaaa1-0000-0000-0000-000000000005', ws_a, 'Cpt', 'A', 'accountant'),
    ('bbbbbbb1-0000-0000-0000-000000000001', ws_b, 'Adm', 'B', 'admin');

  insert into leads (id, workspace_id, first_name, last_name, phone, source, status) values
    ('ccccccc1-0000-0000-0000-000000000001', ws_a, 'Lead', 'A1', '0600000101', 'manual', 'new'),
    ('ccccccc1-0000-0000-0000-000000000002', ws_a, 'Lead', 'A2', '0600000102', 'manual', 'new'),
    ('ccccccc1-0000-0000-0000-000000000009', ws_b, 'Lead', 'B1', '0600000109', 'manual', 'new');

  insert into appointments (id, workspace_id, assigned_user_id, title, start_time, end_time, type) values
    ('ddddddd1-0000-0000-0000-000000000001', ws_a, 'aaaaaaa1-0000-0000-0000-000000000004',
     'RDV du technicien', now(), now() + interval '1 hour', 'intervention'),
    ('ddddddd1-0000-0000-0000-000000000002', ws_a, 'aaaaaaa1-0000-0000-0000-000000000003',
     'RDV d''un autre', now(), now() + interval '1 hour', 'intervention');

  insert into integration_connections (workspace_id, provider, name, settings)
  values (ws_a, 'meta', 'Meta Ads', '{}'::jsonb);

  insert into invoices (workspace_id, invoice_number, amount_ht, amount_ttc)
  values (ws_a, 'TEST-001', 100, 120);
end $$;


-- ============ CONSEILLER ============
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaa1-0000-0000-0000-000000000003","role":"authenticated"}';

select pg_temp.compter('conseiller', 'voit les leads de son espace', 2,
  'select count(*)::int from leads');
select pg_temp.verifier('conseiller', 'cree un lead', true,
  $q$insert into leads (workspace_id, first_name, phone, source, status)
     values ('11111111-1111-1111-1111-111111111111', 'Nouveau', '0600000199', 'manual', 'new')$q$);
select pg_temp.verifier('conseiller', 'ne supprime pas un lead', false,
  $q$delete from leads where id = 'ccccccc1-0000-0000-0000-000000000001'$q$);
select pg_temp.compter('conseiller', 'ne voit aucune integration', 0,
  'select count(*)::int from integration_connections');
select pg_temp.compter('conseiller', 'ne voit aucune facture', 0,
  'select count(*)::int from invoices');
select pg_temp.compter('conseiller', 'ne voit aucun webhook', 0,
  'select count(*)::int from webhook_endpoints');
select pg_temp.compter('conseiller', 'ne lit pas le journal d''audit', 0,
  'select count(*)::int from audit_logs');


-- ============ TECHNICIEN ============
set local request.jwt.claims = '{"sub":"aaaaaaa1-0000-0000-0000-000000000004","role":"authenticated"}';

select pg_temp.compter('technicien', 'ne voit que ses rendez-vous', 1,
  'select count(*)::int from appointments');
select pg_temp.compter('technicien', 'ne voit pas les leads non affectes', 0,
  'select count(*)::int from leads');
select pg_temp.verifier('technicien', 'ne cree pas de lead', false,
  $q$insert into leads (workspace_id, first_name, phone, source, status)
     values ('11111111-1111-1111-1111-111111111111', 'Interdit', '0600000198', 'manual', 'new')$q$);
select pg_temp.compter('technicien', 'ne voit aucune integration', 0,
  'select count(*)::int from integration_connections');
select pg_temp.compter('technicien', 'ne voit aucune facture', 0,
  'select count(*)::int from invoices');


-- ============ COMPTABLE ============
set local request.jwt.claims = '{"sub":"aaaaaaa1-0000-0000-0000-000000000005","role":"authenticated"}';

select pg_temp.compter('comptable', 'voit les factures', 1,
  'select count(*)::int from invoices');
select pg_temp.compter('comptable', 'ne voit aucun lead', 0,
  'select count(*)::int from leads');
select pg_temp.compter('comptable', 'ne voit aucune integration', 0,
  'select count(*)::int from integration_connections');
select pg_temp.compter('comptable', 'ne voit aucun scenario', 0,
  'select count(*)::int from workflows');


-- ============ RESPONSABLE ============
set local request.jwt.claims = '{"sub":"aaaaaaa1-0000-0000-0000-000000000002","role":"authenticated"}';

select pg_temp.compter('responsable', 'voit les leads', 3,
  'select count(*)::int from leads');
select pg_temp.compter('responsable', 'ne voit aucune integration', 0,
  'select count(*)::int from integration_connections');
select pg_temp.compter('responsable', 'ne voit aucun webhook', 0,
  'select count(*)::int from webhook_endpoints');
select pg_temp.verifier('responsable', 'ne cree pas de facture', false,
  $q$insert into invoices (workspace_id, invoice_number, amount_ht, amount_ttc)
     values ('11111111-1111-1111-1111-111111111111', 'TEST-999', 10, 12)$q$);


-- ============ ADMINISTRATEUR ============
set local request.jwt.claims = '{"sub":"aaaaaaa1-0000-0000-0000-000000000001","role":"authenticated"}';

select pg_temp.compter('administrateur', 'voit les integrations', 1,
  'select count(*)::int from integration_connections');
select pg_temp.compter('administrateur', 'lit le journal d''audit', 0,
  'select count(*)::int from audit_logs');
select pg_temp.verifier('administrateur', 'supprime un lead', true,
  $q$delete from leads where id = 'ccccccc1-0000-0000-0000-000000000002'$q$);


-- ============ ISOLATION ENTRE ESPACES ============
-- Le test le plus important : un defaut ici exposerait l'atelier voisin.
set local request.jwt.claims = '{"sub":"bbbbbbb1-0000-0000-0000-000000000001","role":"authenticated"}';

select pg_temp.compter('espace B', 'ne voit que son propre lead', 1,
  'select count(*)::int from leads');
select pg_temp.compter('espace B', 'ne voit aucun rendez-vous de A', 0,
  'select count(*)::int from appointments');
select pg_temp.compter('espace B', 'ne voit aucune integration de A', 0,
  'select count(*)::int from integration_connections');
select pg_temp.verifier('espace B', 'ne modifie pas un lead de A', false,
  $q$update leads set first_name = 'Pirate'
     where id = 'ccccccc1-0000-0000-0000-000000000001'$q$);


-- ============ RÉSULTATS ============
reset role;
reset request.jwt.claims;

select
  case when bool_and(ok) then 'TOUS LES TESTS PASSENT'
       else count(*) filter (where not ok) || ' ECHEC(S)' end as verdict
from resultats;

select ordre, role_teste, cas, attendu, obtenu, ok from resultats order by ordre;


-- ============ NETTOYAGE ============
delete from appointments where workspace_id in
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
delete from invoices where workspace_id in
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
delete from integration_connections where workspace_id in
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
delete from leads where workspace_id in
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
delete from profiles where workspace_id in
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
delete from auth.users where email like '%@test.local';
delete from workspaces where id in
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

commit;
