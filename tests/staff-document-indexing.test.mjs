import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('la fiche permet a l equipe de classer plusieurs PDF ou photos', async () => {
  const panel = await read('src/features/dossier/documents-client-panel.tsx');
  const indexer = await read('src/features/dossier/staff-document-indexer.tsx');
  const service = await read('src/services/client-documents-service.ts');

  assert.match(panel, /<StaffDocumentIndexer/);
  assert.match(indexer, /Indexer un document nous-mêmes/);
  assert.match(indexer, /Classer dans/);
  assert.match(indexer, /type="file"/);
  assert.match(indexer, /multiple/);
  assert.match(indexer, /Ajouter à la fiche/);
  assert.match(indexer, /admin', 'manager', 'advisor/);
  assert.match(service, /ensureStaffClientDocumentRequest/);
  assert.match(service, /uploadStaffClientDocument/);
  assert.match(service, /staff-client-documents/);
  assert.match(service, /uploadToSignedUrl/);
});

test('l indexation interne est authentifiee, limitee au workspace et controle les fichiers', async () => {
  const edge = await read('supabase/functions/staff-client-documents/index.ts');
  const config = await read('supabase/config.toml');

  assert.match(config, /\[functions\.staff-client-documents\]\s+verify_jwt = true/);
  assert.match(edge, /admin\.auth\.getUser/);
  assert.match(edge, /admin', 'manager', 'advisor/);
  assert.match(edge, /\.eq\('workspace_id', workspaceId\)/);
  assert.match(edge, /application\/pdf/);
  assert.match(edge, /image\/jpeg/);
  assert.match(edge, /12 \* 1024 \* 1024/);
  assert.match(edge, /createSignedUploadUrl/);
  assert.match(edge, /startsWith\(expectedPrefix\)/);
  assert.match(edge, /client_document_files/);
  assert.match(edge, /client_document_items/);
});

test('les pieces indexees font avancer le dossier et restent identifiables dans l historique', async () => {
  const edge = await read('supabase/functions/staff-client-documents/index.ts');
  const migration = await read('supabase/migrations/20261127150000_indexation_interne_documents.sql');
  const timeline = await read('src/features/client-documents/client-document-activity-timeline.tsx');

  assert.match(edge, /complete \? 'documents_received' : 'documents_requested'/);
  assert.match(edge, /event_type: 'staff_document_uploaded'/);
  assert.match(migration, /'staff_document_uploaded'/);
  assert.match(timeline, /Document indexé par l’équipe/);
});
