import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const PANNEAU = 'src/features/billing/facturation-client.tsx';

test('la fiche client expose la facturation du client, factures et avoirs', async () => {
  const service = await read('src/services/billing-service.ts');
  const panneau = await read(PANNEAU);
  const fiche = await read('src/features/client/client-modal.tsx');

  assert.match(service, /from\('onify_credit_notes'\)/);
  assert.match(service, /\.eq\('contact_id', contactId\)/);
  assert.match(panneau, /BoutonPdfFacture/);
  assert.match(fiche, /cle: 'facturation'/);
});

test('la fiche lead montre la facturation de son client, pas un ecran vide', async () => {
  const contenu = await read('src/features/dossier/dossier-contenu.tsx');

  // La facturation vit sur le client : l'attacher au dossier vitrage
  // revenait a n'afficher jamais rien -- deux dossiers pour 146 factures.
  assert.match(contenu, /onglet === 'facturation'/);
  assert.match(contenu, /<FacturationClient contactId=\{lead\.contact_id\}/);
  assert.match(contenu, /plaque=\{lead\.vehicle_registration\}/);

  // Le repli « section a venir » reste, mais pour l'onglet Assurance seul :
  // la facturation doit etre traitee avant de l'atteindre.
  const facturation = contenu.indexOf("onglet === 'facturation'");
  const repli = contenu.indexOf("return <OngletAVenir onglet={onglet} />");
  assert.ok(facturation > 0 && facturation < repli);
});

test('la facture du vehicule concerne passe devant et s ouvre', async () => {
  const panneau = await read(PANNEAU);

  assert.match(panneau, /function memePlaque/);
  assert.match(panneau, /useState\(Boolean\(concernee\)\)/);
  assert.match(panneau, /gauche\.length >= 5 && gauche === propre\(b\)/);
});

test("l'onglet suit le droit de lire les factures, sur les deux fiches", async () => {
  const client = await read('src/features/client/client-modal.tsx');
  const lead = await read('src/features/dossier/dossier-modal.tsx');

  for (const source of [client, lead]) {
    assert.match(source, /cheminAutorise\('\/billing'/);
    assert.match(source, /filter\(\(o\) => o\.cle !== 'facturation'\)/);
    assert.doesNotMatch(source, /onglets=\{ONGLETS\}/);
  }
});

test("le detail d'une facture ne tombe pas sur un contenu Onify inattendu", async () => {
  const panneau = await read(PANNEAU);

  assert.match(panneau, /if \(!Array\.isArray\(brutes\)\) return \[\]/);
  assert.match(panneau, /typeof brute !== 'object'/);
});
