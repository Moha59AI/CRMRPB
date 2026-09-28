import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('le bon de remise de cadeau est accessible et reprend le cadeau choisi du lead', async () => {
  const dossier = await read('src/features/dossier/dossier-contenu.tsx');
  const dialogue = await read('src/features/dossier/gift-voucher-dialog.tsx');

  assert.match(dossier, /Bon de remise de cadeau/);
  assert.match(dossier, /lead\.offer/);
  assert.match(dossier, /Préparer et imprimer/);
  assert.match(dialogue, /cadeau: valeurOuVide\(lead\.offer\)/);
  assert.match(dialogue, /Cadeau sélectionné/);
  assert.match(dialogue, /Sélectionnez le cadeau avant d’imprimer/);
  assert.match(dialogue, /Référence dossier/);
  assert.match(dialogue, /Date du sinistre/);
  assert.match(dialogue, /Bénéficiaire/);
  assert.match(dialogue, /TVA restant à régler/);
  assert.match(dialogue, /window\.open\('', '_blank'\)/);
});

test('le PDF cadeau est regenere depuis un modele generique aplati', async () => {
  const service = await read('src/features/dossier/gift-voucher-service.ts');
  const modele = new URL('../public/templates/bon-remise-cadeau-modele.pdf', import.meta.url);

  await access(modele);
  assert.match(service, /PDFDocument\.load/);
  assert.match(service, /bon-remise-cadeau-modele\.pdf/);
  assert.match(service, /texte: data\.cadeau/);
  assert.match(service, /document\.setTitle/);
  assert.match(service, /new Blob/);
  assert.doesNotMatch(service, /ABC TRAVAUX ET SERVICES|CW-158-XV|PROTEC BTP|iPhone 14/);
});

test('les champs inconnus ne sont pas inventes depuis la franchise du lead', async () => {
  const dialogue = await read('src/features/dossier/gift-voucher-dialog.tsx');

  assert.match(dialogue, /Une franchise n'est pas une TVA/);
  assert.match(dialogue, /tvaRestante: ''/);
  assert.match(dialogue, /dateSinistre: ''/);
});
