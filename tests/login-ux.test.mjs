import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('la connexion reprend une mise en page visuelle sans sacrifier le mobile', async () => {
  const page = await read('src/features/auth/login-page.tsx');

  assert.match(page, /src="\/login-collage\.jpg"/);
  assert.match(page, /lg:grid-cols-/);
  assert.match(page, /lg:hidden/);
  assert.match(page, /Chaque dossier, au même endroit/);
});

test('le formulaire garde ses aides de connexion et des erreurs lisibles', async () => {
  const page = await read('src/features/auth/login-page.tsx');

  assert.match(page, /autoComplete="email"/);
  assert.match(page, /autoComplete="current-password"/);
  assert.match(page, /aria-pressed=\{passwordVisible\}/);
  assert.match(page, /role="alert"/);
  assert.match(page, /Adresse e-mail ou mot de passe incorrect/);
});

test('le visuel de connexion reste leger pour le premier chargement', async () => {
  const asset = await stat(new URL('../public/login-collage.jpg', import.meta.url));

  assert.ok(asset.size < 400_000, `Le visuel pese ${asset.size} octets`);
});
