import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const edgeFunction = readFileSync('supabase/functions/onify-sync/index.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260908150000_onify_import.sql', 'utf8');
const routes = readFileSync('src/app/app-routes.tsx', 'utf8');
const integrations = readFileSync('src/features/integrations/integrations-list-page.tsx', 'utf8');

test('Onify est uniquement lu par la fonction de synchronisation', () => {
  const getStart = edgeFunction.indexOf('async function onifyGet');
  const getEnd = edgeFunction.indexOf('function unwrapPage');
  const requestHelper = edgeFunction.slice(getStart, getEnd);

  assert.ok(getStart >= 0 && getEnd > getStart);
  assert.match(requestHelper, /method: 'GET'/);
  assert.doesNotMatch(requestHelper, /method: '(POST|PUT|PATCH|DELETE)'/);
});

test('toutes les donnees Onify utiles sont importees', () => {
  for (const endpoint of [
    '/crm/customers',
    '/billing/invoices',
    '/billing/quotes',
    '/billing/credits',
    '/callify/calls',
    '/notes',
  ]) {
    assert.ok(edgeFunction.includes(endpoint), `${endpoint} doit etre synchronise`);
  }
});

test('deux fiches Onify partageant un telephone ne reecrivent pas le meme contact', () => {
  assert.match(edgeFunction, /claimedContactIds/);
  assert.match(edgeFunction, /!claimedContactIds\.has\(identityMatch\.id\)/);
});

test('la cle Onify quitte le secret de fonction pour Supabase Vault', () => {
  assert.match(edgeFunction, /onify_api_key_\$\{workspaceId\}/);
  assert.match(edgeFunction, /vault_read_secret/);
  assert.match(edgeFunction, /vault_create_secret/);
  assert.match(edgeFunction, /Deno\.env\.get\('ONIFY_API_KEY'\)/);
});

test('la migration rend les imports idempotents et protege les avoirs par RLS', () => {
  assert.match(migration, /contacts_onify_customer_unique/);
  assert.match(migration, /invoices_onify_invoice_unique/);
  assert.match(migration, /quotes_onify_quote_unique/);
  assert.match(migration, /communications_provider_external_unique/);
  assert.match(migration, /onify_credit_notes enable row level security/);
  for (const action of ['select', 'insert', 'update', 'delete']) {
    assert.match(migration, new RegExp(`create policy "${action}_onify_credit_notes"`, 'i'));
  }
  assert.match(migration, /'\*\/10 \* \* \* \*'/);
});

test('Onify est accessible depuis les integrations du CRM', () => {
  assert.match(routes, /integrations\/onify/);
  assert.match(integrations, /name: 'Onify'/);
  assert.match(integrations, /lecture seule/);
});
