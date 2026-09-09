import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('un wrapper Radix ferme ne maintient pas le verrou de clic', async () => {
  const source = await read('src/lib/verrou-pointeur.ts');

  assert.doesNotMatch(source, /^\s*'\[data-radix-popper-content-wrapper\]',/m);
  assert.match(source, /\[data-radix-popper-content-wrapper\] \[data-state="open"\]/);
  assert.match(source, /document\.body\.style\.removeProperty\('pointer-events'\)/);
});

test('la fiche lead attend la fermeture du dialogue avant de naviguer', async () => {
  const dossier = await read('src/features/dossier/dossier-modal.tsx');
  const overlay = await read('src/features/fiche/fiche-overlay.tsx');

  assert.match(dossier, /fermetureEnCours\.current/);
  assert.doesNotMatch(dossier, /navigate\(-1\)/);
  assert.match(dossier, /setTimeout\(\(\) => \{/);
  assert.match(dossier, /enregistrer\(fermerApresDialogue\)/);
  assert.doesNotMatch(dossier, /<AlertDialogAction[\s\S]*Enregistrer et fermer/);
  assert.match(overlay, /dialogueImbrique/);
  assert.match(overlay, /\[data-state="open"\]\[role="alertdialog"\]/);
});
