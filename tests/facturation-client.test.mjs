import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('la fiche client expose la facturation du client, factures et avoirs', async () => {
  const service = await read('src/services/billing-service.ts');
  const panneau = await read('src/features/client/facturation-client.tsx');
  const fiche = await read('src/features/client/client-modal.tsx');

  assert.match(service, /from\('onify_credit_notes'\)/);
  assert.match(service, /\.eq\('contact_id', contactId\)/);
  assert.match(panneau, /BoutonPdfFacture/);
  assert.match(fiche, /cle: 'facturation'/);
});

test("l'onglet suit le droit de lire les factures, qui vit dans la base", async () => {
  const fiche = await read('src/features/client/client-modal.tsx');

  // RLS n'autorise `invoices` qu'a admin, manager et comptable : un
  // conseiller verrait sinon un onglet vide sans comprendre pourquoi.
  assert.match(fiche, /cheminAutorise\('\/billing'/);
  assert.match(fiche, /filter\(\(o\) => o\.cle !== 'facturation'\)/);
  assert.doesNotMatch(fiche, /onglets=\{ONGLETS\}/);
});

test("le detail d'une facture ne tombe pas sur un contenu Onify inattendu", async () => {
  const panneau = await read('src/features/client/facturation-client.tsx');

  assert.match(panneau, /if \(!Array\.isArray\(brutes\)\) return \[\]/);
  assert.match(panneau, /typeof brute !== 'object'/);
});
