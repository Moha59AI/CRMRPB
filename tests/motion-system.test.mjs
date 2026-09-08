import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('toutes les pages utilisent une transition commune sans remonter la navigation', async () => {
  const layout = await read('src/layouts/app-layout.tsx');

  assert.match(layout, /key=\{location\.pathname\}/);
  assert.match(layout, /className="app-route-transition flex min-h-0 flex-1 flex-col overflow-hidden"/);
  assert.match(layout, /<Outlet \/>/);
});

test('les composants partages portent les interactions animees', async () => {
  const [card, button, table] = await Promise.all([
    read('src/components/ui/card.tsx'),
    read('src/components/ui/button.tsx'),
    read('src/components/ui/table.tsx'),
  ]);

  assert.match(card, /app-card-motion/);
  assert.match(button, /active:scale-\[0\.98\]/);
  assert.match(table, /app-row-motion/);
});

test('le mouvement reste desactive pour les utilisateurs sensibles', async () => {
  const css = await read('src/index.css');

  assert.match(css, /\.app-route-transition/);
  assert.match(css, /\.animate-marketing-bar/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /animation-duration: 0\.01ms !important/);
});
