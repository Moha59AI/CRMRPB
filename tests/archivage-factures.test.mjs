import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('la synchronisation archive le PDF des factures qui n en ont pas', async () => {
  const sync = await read('supabase/functions/onify-sync/index.ts');

  // Le document n'etait recupere qu'au premier clic : une facture que
  // personne n'ouvrait n'etait jamais conservee.
  assert.match(sync, /async function archiverPdfFactures/);
  assert.match(sync, /\.is\('onify_pdf_path', null\)/);
  assert.match(sync, /const pdfs = await archiverPdfFactures\(workspaceId, token\)/);
  // La logique de recuperation n'est pas dupliquee.
  assert.match(sync, /from '\.\.\/_shared\/onify-invoices\.ts'/);
});

test('un arriere ne fait pas deborder la synchronisation', async () => {
  const sync = await read('supabase/functions/onify-sync/index.ts');

  assert.match(sync, /const PAR_TOUR = 15;/);
  assert.match(sync, /\.limit\(PAR_TOUR\)/);
  // Une facture introuvable chez Onify ne se redemande pas toutes les dix
  // minutes.
  assert.match(sync, /const DELAI_AVANT_NOUVEL_ESSAI = 24 \* 3600 \* 1000;/);
  assert.match(sync, /onify_pdf_checked_at\.is\.null,onify_pdf_checked_at\.lt\./);
});

test('un echec se note au lieu d interrompre le reste', async () => {
  const sync = await read('supabase/functions/onify-sync/index.ts');

  const bloc = sync.slice(sync.indexOf('async function archiverPdfFactures'));
  assert.match(bloc, /catch \(erreur\)/);
  assert.match(bloc, /onify_pdf_error: message\.slice\(0, 500\)/);
});

test('les factures conservees se voient dans les documents du client', async () => {
  const panneau = await read('src/features/billing/factures-archivees.tsx');
  const fiche = await read('src/features/client/client-modal.tsx');

  assert.match(panneau, /\.filter\(\(f\) => f\.onify_pdf_path\)/);
  assert.match(panneau, /Factures conservées dans le CRM/);
  // Les factures ne sont lisibles que par l'administration.
  assert.match(fiche, /\{voitFacturation && <FacturesArchivees/);
});
