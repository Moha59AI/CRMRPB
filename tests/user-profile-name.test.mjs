import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('un administrateur peut nommer un utilisateur directement dans la liste', async () => {
  const [page, service] = await Promise.all([
    read('src/features/settings/users-page.tsx'),
    read('src/services/admin-service.ts'),
  ]);

  assert.match(page, /Modifier le nom de \$\{nom\}/);
  assert.match(page, /placeholder="Prénom"/);
  assert.match(page, /placeholder="Nom"/);
  assert.match(page, /enregistrerNom\.mutate\(editionNom\)/);
  assert.match(service, /rpc\('renommer_membre'/);
});

test('le renommage est limite aux administrateurs du meme espace et audite', async () => {
  const migration = await read('supabase/migrations/20261008120000_renommer_utilisateur.sql');

  assert.match(migration, /id = auth\.uid\(\) and role = 'admin'/);
  assert.match(migration, /id = p_membre and workspace_id = v_ws/);
  assert.match(migration, /v_prenom is null and v_nom is null/);
  assert.match(migration, /char_length\(coalesce\(v_prenom, ''\)\) > 80/);
  assert.match(migration, /'utilisateur_renomme'/);
  assert.match(migration, /revoke all on function public\.renommer_membre/);
});
