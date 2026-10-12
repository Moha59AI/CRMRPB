import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('un asset absent ne peut plus devenir une page HTML mise en cache', async () => {
  const worker = await read('public/sw.js');
  const htaccess = await read('public/.htaccess');

  assert.match(worker, /const VERSION = 'v4'/);
  assert.match(worker, /function reponseRessourceValide/);
  assert.match(worker, /!type\.includes\('text\/html'\)/);
  assert.match(worker, /if \(enCache\) await cache\.delete\(req\)/);
  assert.match(htaccess, /RewriteRule \^assets\/ - \[R=404,L\]/);
});

test('le deploiement publie index apres toutes les ressources empreintees', async () => {
  const workflow = await read('.github/workflows/deploy-ionos.yml');
  const exclusion = workflow.indexOf('--exclude-glob index.html');
  const publication = workflow.indexOf('put -O /CRMRPB-main/CRMRPB-main/dist/ ./dist/index.html');

  assert.ok(exclusion >= 0);
  assert.ok(publication > exclusion);
});

test('le navigateur repare sans intervention un ancien cache CSS pollue', async () => {
  const main = await read('src/main.tsx');
  const recovery = await read('src/lib/stylesheet-recovery.ts');

  assert.match(main, /reparerFeuillesDeStyle\(\)/);
  assert.match(recovery, /link\[rel="stylesheet"\]\[href\]/);
  assert.match(recovery, /crm-style-reload/);
  assert.match(recovery, /if \(!feuille\.sheet\) reparer\(\)/);
});
