import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('l outil de masquage est accessible depuis la gestion du CRM', async () => {
  const [routes, navigation, page] = await Promise.all([
    read('src/app/app-routes.tsx'),
    read('src/config/navigation.ts'),
    read('src/features/supplier-redaction/supplier-redaction-page.tsx'),
  ]);

  assert.match(routes, /path="\/outils\/masquer-prix"/);
  assert.match(navigation, /label: 'Masquer les prix'/);
  assert.match(page, /Télécharger la copie sans prix/);
  assert.match(page, /Prix brut, Remise, Prix net, Montant, TVA, Total/);
  assert.match(page, /Copier sur toutes les pages/);
});

test('le document fournisseur reste local et l original est preserve', async () => {
  const [page, service] = await Promise.all([
    read('src/features/supplier-redaction/supplier-redaction-page.tsx'),
    read('src/features/supplier-redaction/price-redaction-service.ts'),
  ]);

  assert.match(page, /n’est pas enregistré dans le CRM/);
  assert.doesNotMatch(service, /supabase|fetch\(|storage|upload/i);
  assert.match(service, /application\/pdf/);
  assert.match(service, /image\/jpeg/);
  assert.match(service, /MAX_DOCUMENT_SIZE = 25 \* 1024 \* 1024/);
  assert.match(service, /MAX_DOCUMENT_PAGES = 30/);
});

test('le PDF final est reconstruit en images aplaties sans texte source', async () => {
  const service = await read('src/features/supplier-redaction/price-redaction-service.ts');

  assert.match(service, /PDFDocument\.create\(\)/);
  assert.match(service, /output\.embedJpg/);
  assert.match(service, /context\.fillRect/);
  assert.match(service, /output\.addPage/);
  assert.doesNotMatch(service, /PDFDocument\.load|copyPages|drawRectangle/);
  assert.match(service, /Le texte et les[\s\S]*ne sont jamais copies/);
});
