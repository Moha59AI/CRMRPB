import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('la delegation est reservee a un administrateur, temporaire et auditee', async () => {
  const migration = await read('supabase/migrations/20261124100000_admin_impersonation.sql');

  assert.match(migration, /create table if not exists public\.impersonation_sessions/);
  assert.match(migration, /v_acteur\.role <> 'admin'/);
  assert.match(migration, /now\(\) \+ interval '60 minutes'/);
  assert.match(migration, /'impersonation_started'/);
  assert.match(migration, /'impersonation_ended'/);
  assert.match(migration, /revoke all on table public\.impersonation_sessions from public, anon, authenticated/);
});

test('les droits et le perimetre technicien utilisent la personne ciblee', async () => {
  const migration = await read('supabase/migrations/20261124100000_admin_impersonation.sql');

  assert.match(migration, /create or replace function public\.utilisateur_effectif\(\)/);
  assert.match(migration, /where id = public\.utilisateur_effectif\(\)/);
  assert.match(migration, /assigned_user_id = public\.utilisateur_effectif\(\)/);
  assert.match(migration, /technician_id = public\.utilisateur_effectif\(\)/);
  assert.match(migration, /user_id = public\.utilisateur_effectif\(\)/);
  assert.match(migration, /public\.a_role\(array\['technician'\]\)/);
});

test('l identite auth reelle reste celle de l administrateur', async () => {
  const migration = await read('supabase/migrations/20261124100000_admin_impersonation.sql');

  assert.match(migration, /actor_user_id, target_user_id/);
  assert.match(migration, /auth\.uid\(\),\s*'impersonation_started'/);
  assert.match(migration, /auth\.uid\(\),\s*'impersonation_ended'/);
  assert.doesNotMatch(migration, /password/i);
});

test('l interface avertit en permanence et permet de revenir au compte admin', async () => {
  const [users, banner, auth, layout] = await Promise.all([
    read('src/features/settings/users-page.tsx'),
    read('src/features/auth/impersonation-banner.tsx'),
    read('src/features/auth/auth-context.tsx'),
    read('src/layouts/app-layout.tsx'),
  ]);

  assert.match(users, /Voir comme/);
  assert.match(users, /Ouvrir sa vue/);
  assert.match(users, /Toutes les actions[\s\S]*identité réelle/);
  assert.match(banner, /Revenir à mon compte/);
  assert.match(banner, /actions tracées/);
  assert.match(layout, /<ImpersonationBanner \/>/);
  assert.match(auth, /crm:impersonation-changed/);
  assert.match(auth, /window\.location\.reload\(\)/);
  assert.match(auth, /fetchImpersonationActive/);
});
