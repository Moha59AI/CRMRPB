import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const MIGRATION = 'supabase/migrations/20261005140000_joindre_pdf_facture.sql';

test('une facture sans document propose de le recuperer, pas un bouton qui echoue', async () => {
  const bouton = await read('src/features/billing/bouton-pdf-facture.tsx');

  assert.match(bouton, /if \(!facture\.onify_pdf_path\) return <ActionsSansPdf/);
  assert.match(bouton, /lienFactureOnify/);
  assert.match(bouton, /televerserPdfFacture/);
});

test('un fichier renomme ne passe pas pour un PDF', async () => {
  const service = await read('src/services/billing-service.ts');

  // Le type annonce par le systeme se change en renommant : on lit les
  // octets, sinon la visionneuse afficherait du vide.
  assert.match(service, /fichier\.slice\(0, 5\)\.arrayBuffer\(\)/);
  assert.match(service, /entete\[0\] === 0x25 && entete\[1\] === 0x50/);
  assert.match(service, /n'est pas un PDF/);
});

test('le depot reste dans son espace et dans les bons roles', async () => {
  const sql = await read(MIGRATION);

  assert.match(sql, /bucket_id = 'onify-invoices'/);
  assert.match(sql, /\(storage\.foldername\(name\)\)\[1\] = public\.get_workspace_id\(\)::text/);
  assert.match(sql, /public\.a_role\(array\['admin', 'accountant'\]\)/);
  // La lecture passe toujours par la fonction, qui verifie espace et role.
  assert.doesNotMatch(sql, /for select/);
});

test('une facture deposee est indistinguable d une facture archivee', async () => {
  const service = await read('src/services/billing-service.ts');

  // Meme bucket, meme forme de chemin que la synchronisation.
  assert.match(service, /\$\{workspaceId\}\/\$\{facture\.id\}\/\$\{nom\}\.pdf/);
  assert.match(service, /onify_pdf_error: null/);
});
