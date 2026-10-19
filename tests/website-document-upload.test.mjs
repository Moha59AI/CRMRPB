import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('le webhook du site accepte les documents sans les mettre dans le payload json', async () => {
  const webhook = await read('supabase/functions/inbound-webhook/index.ts');

  assert.match(webhook, /multipart\/form-data/);
  assert.match(webhook, /req\.formData\(\)/);
  assert.match(webhook, /carte_grise:[\s\S]*documentType: 'registration'/);
  assert.match(webhook, /attestation_assurance:[\s\S]*documentType: 'insurance_cert'/);
  assert.match(webhook, /photo_vehicule:[\s\S]*documentType: 'photo_windscreen'/);
  assert.match(webhook, /documents: parsedRequest\.documents\.map/);
  assert.doesNotMatch(webhook, /arrayBuffer\(\)[\s\S]{0,200}payload/);
});

test('les pieces du site sont controlees puis rangees dans le portail documentaire prive', async () => {
  const webhook = await read('supabase/functions/inbound-webhook/index.ts');

  assert.match(webhook, /detectDocumentType/);
  assert.match(webhook, /maxDocumentBytes = 10 \* 1024 \* 1024/);
  assert.match(webhook, /maxDocumentsBytes = 10 \* 1024 \* 1024/);
  assert.match(webhook, /\.from\('client_document_requests'\)/);
  assert.match(webhook, /\.from\('client_document_items'\)/);
  assert.match(webhook, /\.from\(clientDocumentBucket\)[\s\S]*\.upload\(storagePath/);
  assert.match(webhook, /status: 'uploaded'/);
  assert.match(webhook, /original_name: document\.originalName/);
  assert.match(webhook, /event_type: 'document_uploaded'/);
});

test('les documents du site sont rattaches au lead cree et font avancer son statut', async () => {
  const webhook = await read('supabase/functions/inbound-webhook/index.ts');

  assert.match(webhook, /data: storedLeadId/);
  assert.match(webhook, /attachWebsiteDocuments\(endpoint\.workspace_id, leadId, parsedRequest\.documents\)/);
  assert.match(webhook, /complete \? 'documents_received' : 'documents_requested'/);
  assert.match(webhook, /documents_received: attachedDocuments\.count/);
  assert.match(webhook, /document_request_id: attachedDocuments\.requestId/);
});
