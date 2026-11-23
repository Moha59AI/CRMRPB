import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Meta et Web Google Ads ont des reperes visuels distincts', async () => {
  const badge = await read('src/features/leads/source-badge.tsx');

  assert.match(badge, /source === 'google_ads' \|\| source === 'webhook'/);
  assert.match(badge, /source === 'meta'/);
  assert.match(badge, /Web · Google Ads/);
  assert.match(badge, /Meta Lead Ads/);
  assert.match(badge, /function GoogleMark/);
  assert.match(badge, /function MetaMark/);
  assert.match(badge, /whitespace-nowrap/);
});

test('le tableau reserve une vraie largeur aux informations de traitement', async () => {
  const [page, css, statusBadge] = await Promise.all([
    read('src/features/leads/leads-page.tsx'),
    read('src/index.css'),
    read('src/features/leads/status-badge.tsx'),
  ]);

  assert.match(page, /crm-leads-table table-fixed md:min-w-\[1580px\]/);
  assert.match(page, /<col className="w-\[145px\]" \/>/);
  assert.match(page, /truncate text-sm font-bold text-foreground/);
  assert.match(css, /\.crm-leads-table thead th/);
  assert.match(statusBadge, /whitespace-nowrap/);
});

test('la source reste visible dans toutes les vues de leads', async () => {
  const page = await read('src/features/leads/leads-page.tsx');

  assert.ok(
    (page.match(/<SourceBadge source=\{lead\.source\}/g) ?? []).length >= 4,
    'le badge source doit etre rendu sur mobile, tableau, kanban et liste compacte',
  );
});
