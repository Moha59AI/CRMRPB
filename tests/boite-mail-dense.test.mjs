import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const LIGNE = 'src/features/integrations/email/ligne-email.tsx';
const PAGE = 'src/features/integrations/email/email-inbox-page.tsx';

test('un message tient sur une ligne, comme dans une vraie boîte mail', async () => {
  const ligne = await read(LIGNE);

  // L'objet et l'extrait partagent la meme ligne : c'est ce qui fait tenir
  // vingt messages a l'ecran au lieu de six.
  assert.match(ligne, /\{email\.subject \|\| '\(Sans objet\)'\}/);
  assert.match(ligne, /— \{extrait\}/);
  assert.match(ligne, /hidden min-w-0 flex-1 truncate text-sm text-faint sm:inline/);
});

test('le correspondant se reconnait avant de se lire', async () => {
  const ligne = await read(LIGNE);

  assert.match(ligne, /function initiales/);
  // Une teinte stable, tiree du nom : elle ne bouge pas d'un jour a l'autre.
  assert.match(ligne, /function teinte/);
  assert.match(ligne, /somme \+ valeur\.charCodeAt\(i\)/);
});

test('un message sortant se lit « a qui », pas « de qui »', async () => {
  const ligne = await read(LIGNE);

  assert.match(ligne, /const sortant = email\.direction !== 'inbound'/);
  assert.ok(ligne.includes('{sortant && <span className="font-normal text-faint">À </span>}'));
});

test('les reperes metier survivent a la densification', async () => {
  const ligne = await read(LIGNE);
  const page = await read(PAGE);

  // Assureur / fournisseur / expert, factures fournisseur a masquer, et
  // message non rattache : ce sont eux qui disent de quoi il s'agit avant
  // d'ouvrir.
  assert.match(ligne, /pdfFournisseur > 0 && \(/);
  assert.match(ligne, /À rattacher/);
  assert.match(page, /pdfFournisseur=\{supplierPdfCount\}/);
  assert.match(page, /badge=\{<EmailPartyBadge classification=\{classification\} \/>\}/);
});

test('la liste est une pile, pas une suite de cartes', async () => {
  const page = await read(PAGE);

  assert.match(page, /divide-y divide-border overflow-y-auto/);
  assert.doesNotMatch(page, /mb-1 w-full rounded-xl border p-3 text-left/);
});
