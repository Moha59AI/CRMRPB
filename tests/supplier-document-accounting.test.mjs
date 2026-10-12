import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('un BL crée une dépense provisoire sans attendre la facture', async () => {
  const [migration, processor] = await Promise.all([
    read('supabase/migrations/20261012100000_supplier_document_accounting.sql'),
    read('supabase/functions/supplier-document-process/index.ts'),
  ]);
  assert.match(migration, /document_type in \('delivery_note', 'invoice', 'credit_note'\)/);
  assert.match(migration, /amount_basis in \('provisional', 'final'\)/);
  assert.match(processor, /processDeliveryNote/);
  assert.match(processor, /amount_basis: 'provisional'/);
  assert.match(processor, /accounting_status: accountingStatus/);
});

test('la facture finalise le BL existant sans doubler le coût', async () => {
  const [migration, processor] = await Promise.all([
    read('supabase/migrations/20261012100000_supplier_document_accounting.sql'),
    read('supabase/functions/supplier-document-process/index.ts'),
  ]);
  assert.match(migration, /supplier_expenses_delivery_note_idx/);
  assert.match(migration, /supplier_expenses_invoice_number_idx/);
  assert.match(processor, /deliveryNoteMatches/);
  assert.match(processor, /updateExpenseWithInvoice/);
  assert.match(processor, /attachInvoiceSourceToExisting/);
  assert.match(processor, /linked_expense_ids: result\.expenseIds/);
  assert.match(processor, /amount_basis: 'final'/);
  assert.match(processor, /Tous les BL mentionnés sur la facture n ont pas été retrouvés/);
  assert.doesNotMatch(processor, /insertStandaloneInvoice[\s\S]{0,300}matches\.length === 1/);
});

test('le plafond fournisseur bascule en carte mais ne marque pas payé sans preuve', async () => {
  const [migration, processor, page] = await Promise.all([
    read('supabase/migrations/20261012100000_supplier_document_accounting.sql'),
    read('supabase/functions/supplier-document-process/index.ts'),
    read('src/features/finance/supplier-expenses-page.tsx'),
  ]);
  assert.match(migration, /create table if not exists public\.supplier_accounts/);
  assert.match(migration, /credit_limit_ttc/);
  assert.match(migration, /auto_card_over_limit/);
  assert.match(migration, /document_review_required/);
  assert.match(migration, /payment_confirmation_required/);
  assert.match(migration, /confirm_supplier_expense_payment/);
  assert.match(migration, /supplier_expense_payment_confirmed/);
  assert.match(migration, /due_date >= current_date[\s\S]*then 'scheduled'/);
  assert.match(processor, /projected >= limit/);
  assert.match(processor, /accountingStatus = 'card_to_confirm'/);
  assert.match(processor, /document\.payment_is_confirmed \? 'paid' : scheduled \? 'scheduled' : 'unpaid'/);
  assert.match(processor, /paidAt: document\.payment_is_confirmed \? document\.payment_date \?\? null : null/);
  assert.match(page, /Confirmer le paiement CB/);
  assert.match(page, /Le paiement reste « à confirmer » jusqu’à présence d’une preuve/);
});

test('les PDF fournisseurs sont mis en file et lus avec une sortie structurée', async () => {
  const [migration, inbound, processor, config] = await Promise.all([
    read('supabase/migrations/20261012100000_supplier_document_accounting.sql'),
    read('supabase/functions/_shared/inbound-email.ts'),
    read('supabase/functions/supplier-document-process/index.ts'),
    read('supabase/config.toml'),
  ]);
  assert.match(migration, /create table if not exists public\.supplier_document_jobs/);
  assert.match(migration, /create table if not exists public\.supplier_document_analyses/);
  assert.match(migration, /cron\.schedule\([\s\S]*supplier-document-process/);
  assert.match(inbound, /correspondant\.type === 'fournisseur'/);
  assert.match(inbound, /from\('supplier_document_jobs'\)\.upsert/);
  assert.match(processor, /type: 'input_file'/);
  assert.match(processor, /type: 'json_schema'/);
  assert.match(processor, /N invente jamais une référence, une immatriculation, une date, un montant ou un paiement/);
  assert.match(config, /\[functions\.supplier-document-process\][\s\S]*verify_jwt = false/);
});

test('Finance, Mail et les réglages IA montrent le cycle comptable et les contrôles requis', async () => {
  const [supplierPage, mailPage, financePage, aiSettings] = await Promise.all([
    read('src/features/finance/supplier-expenses-page.tsx'),
    read('src/features/integrations/email/email-inbox-page.tsx'),
    read('src/features/finance/financial-dashboard-page.tsx'),
    read('src/features/ai/ai-settings-page.tsx'),
  ]);
  for (const marker of ['BL engagés', 'Plafonds fournisseurs', 'CB à confirmer', 'Documents d’origine']) {
    assert.ok(supplierPage.includes(marker), `${marker} doit être visible côté fournisseurs`);
  }
  for (const marker of ['Analyse IA en cours', 'Intégré aux dépenses', 'Contrôle comptable requis']) {
    assert.ok(mailPage.includes(marker), `${marker} doit être visible dans Mail`);
  }
  assert.match(financePage, /supplierProvisionalHt/);
  assert.match(financePage, /supplierFinalHt/);
  assert.match(financePage, /supplierOutstandingTtc/);
  assert.match(financePage, /BL engagés provisoires HT/);
  assert.match(aiSettings, /Analyse automatique des PDF fournisseurs/);
  assert.match(aiSettings, /Aucun document ne peut confirmer seul un débit bancaire/);
});

test('les nouvelles tables comptables sont protégées par RLS', async () => {
  const migration = await read('supabase/migrations/20261012100000_supplier_document_accounting.sql');
  for (const table of ['supplier_accounts', 'supplier_document_analyses', 'supplier_document_jobs']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(migration, /profile\.role in \('admin', 'manager', 'accountant'\)/);
  assert.match(migration, /profile\.role in \('admin', 'accountant'\)/);
});

test('les dépenses fournisseurs restent lisibles et triées par date du document', async () => {
  const [service, page] = await Promise.all([
    read('src/features/finance/supplier-expenses-service.ts'),
    read('src/features/finance/supplier-expenses-page.tsx'),
  ]);
  assert.match(service, /order\('invoice_date',[\s\S]{0,100}order\('updated_at'/);
  assert.match(page, /Date document/);
  assert.match(page, /LCR prévue/);
  assert.match(page, /Facture reçue · non réglée/);
  assert.match(page, /Détail indisponible/);
  assert.match(page, /Date à confirmer/);
});

test('une facture sans date alimente la marge avec la date de réception et reste à contrôler', async () => {
  const [processor, migration] = await Promise.all([
    read('supabase/functions/supplier-document-process/index.ts'),
    read('supabase/migrations/20261012153000_supplier_expense_data_coherence.sql'),
  ]);
  assert.match(processor, /function documentForAccounting/);
  assert.match(processor, /expense_date_basis: 'received_at'/);
  assert.match(processor, /source_received_at: communication\?\.delivered_at \?\? communication\?\.created_at/);
  assert.match(processor, /force \? \['pending', 'failed', 'review_required'\]/);
  assert.match(migration, /analysis\.document_date is null/);
  assert.match(migration, /analysis\.supplier_expense_id is null/);
  assert.match(migration, /Aucun montant n'est recalculé ou inventé/);
});
