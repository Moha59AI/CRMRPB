import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const MODEL = 'gpt-5.6-terra';
const INPUT_USD_PER_MILLION = 2;
const OUTPUT_USD_PER_MILLION = 12;
const BATCH_SIZE = 2;
const MAX_ATTEMPTS = 6;
const MAX_PDF_BYTES = 15 * 1024 * 1024;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

type DocumentType = 'delivery_note' | 'invoice' | 'credit_note' | 'other';
type PaymentMethod = 'unknown' | 'supplier_account' | 'card' | 'direct_debit' | 'bank_transfer' | 'other';
type JobStatus = 'pending' | 'processing' | 'completed' | 'review_required' | 'failed' | 'ignored';

type SupplierDocumentJob = {
  id: string;
  workspace_id: string;
  communication_id: string;
  attachment_id: string;
  storage_path: string;
  filename: string;
  content_type: string | null;
  supplier_hint: string | null;
  status: JobStatus;
  attempts: number;
};

type ExtractedItem = {
  delivery_note_number: string | null;
  delivery_date: string | null;
  vehicle_registration: string | null;
  site: string | null;
  category: string | null;
  sku: string | null;
  description: string | null;
  quantity: number | null;
  gross_unit_price_ht: number | null;
  discount_rate: number | null;
  net_unit_price_ht: number | null;
  amount_ht: number | null;
  page: number | null;
};

type ExtractedDocument = {
  document_type: DocumentType;
  supplier: string | null;
  document_number: string | null;
  document_date: string | null;
  invoice_number: string | null;
  related_invoice_number: string | null;
  delivery_note_numbers: string[];
  order_number: string | null;
  due_date: string | null;
  payment_method: PaymentMethod;
  payment_is_confirmed: boolean;
  payment_date: string | null;
  vehicle_registration: string | null;
  amount_ht: number | null;
  vat_amount: number | null;
  amount_ttc: number | null;
  confidence: number;
  warnings: string[];
  items: ExtractedItem[];
};

type Relationship = {
  leadId: string;
  caseId: string | null;
  contactId: string | null;
  customerInvoiceId: string | null;
};

type AccountingResult = {
  expenseId: string | null;
  expenseIds: string[];
  reviewRequired: boolean;
  warnings: string[];
};

type ExpenseWriteResult = {
  expenseId: string;
  reviewRequired: boolean;
  warnings: string[];
};

type AnalysisResult = {
  document: ExtractedDocument;
  fileSha256: string;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number | null;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function dateValue(value: unknown): string | null {
  const text = stringValue(value);
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return text;
}

function normalizeReference(value: string | null): string {
  return (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeRegistration(value: string | null): string {
  return normalizeReference(value);
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function backoffDate(attempts: number): string {
  const minutes = Math.pow(2, Math.min(attempts, MAX_ATTEMPTS));
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function constantTimeEquals(left: string, right: string): boolean {
  if (!left || !right || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function automationAuthorized(req: Request): boolean {
  const provided = req.headers.get('apikey') ?? '';
  const configured = Deno.env.get('SUPABASE_SECRET_KEYS') ?? '';
  try {
    const expected = (JSON.parse(configured) as Record<string, string>).automations ?? '';
    return constantTimeEquals(provided, expected);
  } catch {
    return false;
  }
}

async function authenticatedWorkspace(req: Request): Promise<string | null> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return null;
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('workspace_id, role')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError || !profile || !['admin', 'manager', 'accountant'].includes(profile.role)) return null;
  return profile.workspace_id as string;
}

async function readOpenAiKey(workspaceId: string): Promise<string> {
  const { data, error } = await admin.rpc('vault_read_secret', {
    secret_name: `openai_api_key_${workspaceId}`,
  });
  if (error) throw new Error(`VAULT_READ_FAILED: ${error.message}`);
  if (typeof data !== 'string' || !data) throw new Error('OPENAI_NOT_CONFIGURED');
  return data;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 32_768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function responseText(payload: Record<string, unknown>): string | null {
  if (typeof payload.output_text === 'string') return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    const content = Array.isArray(asObject(item).content) ? asObject(item).content as unknown[] : [];
    for (const part of content) {
      const text = asObject(part).text;
      if (typeof text === 'string') return text;
    }
  }
  return null;
}

function normalizeItem(value: unknown): ExtractedItem {
  const item = asObject(value);
  return {
    delivery_note_number: stringValue(item.delivery_note_number),
    delivery_date: dateValue(item.delivery_date),
    vehicle_registration: stringValue(item.vehicle_registration),
    site: stringValue(item.site),
    category: stringValue(item.category),
    sku: stringValue(item.sku),
    description: stringValue(item.description),
    quantity: numberValue(item.quantity),
    gross_unit_price_ht: numberValue(item.gross_unit_price_ht),
    discount_rate: numberValue(item.discount_rate),
    net_unit_price_ht: numberValue(item.net_unit_price_ht),
    amount_ht: numberValue(item.amount_ht),
    page: typeof item.page === 'number' && Number.isInteger(item.page) ? item.page : null,
  };
}

function normalizeExtractedDocument(value: unknown, supplierHint: string | null): ExtractedDocument {
  const raw = asObject(value);
  const allowedTypes: DocumentType[] = ['delivery_note', 'invoice', 'credit_note', 'other'];
  const allowedMethods: PaymentMethod[] = [
    'unknown', 'supplier_account', 'card', 'direct_debit', 'bank_transfer', 'other',
  ];
  const documentType = allowedTypes.includes(raw.document_type as DocumentType)
    ? raw.document_type as DocumentType
    : 'other';
  const paymentMethod = allowedMethods.includes(raw.payment_method as PaymentMethod)
    ? raw.payment_method as PaymentMethod
    : 'unknown';
  const items = Array.isArray(raw.items) ? raw.items.slice(0, 250).map(normalizeItem) : [];
  const rawDeliveryNotes = Array.isArray(raw.delivery_note_numbers)
    ? raw.delivery_note_numbers.map(stringValue)
    : [];
  return {
    document_type: documentType,
    // Le domaine d'envoi reconnu est plus fiable et plus stable que la façon
    // dont le nom commercial est imprimé sur le document.
    supplier: supplierHint ?? stringValue(raw.supplier),
    document_number: stringValue(raw.document_number),
    document_date: dateValue(raw.document_date),
    invoice_number: stringValue(raw.invoice_number),
    related_invoice_number: stringValue(raw.related_invoice_number),
    delivery_note_numbers: uniqueStrings([
      ...rawDeliveryNotes,
      ...items.map((item) => item.delivery_note_number),
    ]),
    order_number: stringValue(raw.order_number),
    due_date: dateValue(raw.due_date),
    payment_method: paymentMethod,
    payment_is_confirmed: raw.payment_is_confirmed === true,
    payment_date: dateValue(raw.payment_date),
    vehicle_registration: stringValue(raw.vehicle_registration),
    amount_ht: numberValue(raw.amount_ht),
    vat_amount: numberValue(raw.vat_amount),
    amount_ttc: numberValue(raw.amount_ttc),
    confidence: Math.min(100, Math.max(0, numberValue(raw.confidence) ?? 0)),
    warnings: Array.isArray(raw.warnings)
      ? raw.warnings.map(stringValue).filter((warning): warning is string => Boolean(warning)).slice(0, 30)
      : [],
    items,
  };
}

function extractionSchema() {
  const nullableString = { type: ['string', 'null'] };
  const nullableNumber = { type: ['number', 'null'] };
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'document_type', 'supplier', 'document_number', 'document_date', 'invoice_number',
      'related_invoice_number', 'delivery_note_numbers', 'order_number', 'due_date',
      'payment_method', 'payment_is_confirmed', 'payment_date', 'vehicle_registration',
      'amount_ht', 'vat_amount', 'amount_ttc', 'confidence', 'warnings', 'items',
    ],
    properties: {
      document_type: { type: 'string', enum: ['delivery_note', 'invoice', 'credit_note', 'other'] },
      supplier: nullableString,
      document_number: nullableString,
      document_date: nullableString,
      invoice_number: nullableString,
      related_invoice_number: nullableString,
      delivery_note_numbers: { type: 'array', items: { type: 'string' }, maxItems: 50 },
      order_number: nullableString,
      due_date: nullableString,
      payment_method: {
        type: 'string',
        enum: ['unknown', 'supplier_account', 'card', 'direct_debit', 'bank_transfer', 'other'],
      },
      payment_is_confirmed: { type: 'boolean' },
      payment_date: nullableString,
      vehicle_registration: nullableString,
      amount_ht: nullableNumber,
      vat_amount: nullableNumber,
      amount_ttc: nullableNumber,
      confidence: { type: 'number', minimum: 0, maximum: 100 },
      warnings: { type: 'array', items: { type: 'string' }, maxItems: 30 },
      items: {
        type: 'array',
        maxItems: 250,
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'delivery_note_number', 'delivery_date', 'vehicle_registration', 'site',
            'category', 'sku', 'description', 'quantity', 'gross_unit_price_ht',
            'discount_rate', 'net_unit_price_ht', 'amount_ht', 'page',
          ],
          properties: {
            delivery_note_number: nullableString,
            delivery_date: nullableString,
            vehicle_registration: nullableString,
            site: nullableString,
            category: nullableString,
            sku: nullableString,
            description: nullableString,
            quantity: nullableNumber,
            gross_unit_price_ht: nullableNumber,
            discount_rate: nullableNumber,
            net_unit_price_ht: nullableNumber,
            amount_ht: nullableNumber,
            page: { type: ['integer', 'null'] },
          },
        },
      },
    },
  };
}

async function analyzePdf(job: SupplierDocumentJob, force: boolean): Promise<AnalysisResult> {
  const { data: blob, error: downloadError } = await admin.storage
    .from('email-attachments')
    .download(job.storage_path);
  if (downloadError || !blob) throw new Error(`PDF_DOWNLOAD_FAILED: ${downloadError?.message ?? 'fichier absent'}`);
  if (blob.size <= 0 || blob.size > MAX_PDF_BYTES) throw new Error('PDF_SIZE_NOT_ALLOWED');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const fileSha256 = await sha256(bytes);

  if (!force) {
    const { data: previous } = await admin
      .from('supplier_document_analyses')
      .select('model, extracted_data, input_tokens, output_tokens, estimated_cost_usd')
      .eq('workspace_id', job.workspace_id)
      .eq('file_sha256', fileSha256)
      .in('status', ['completed', 'review_required'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (previous?.extracted_data) {
      const document = normalizeExtractedDocument(previous.extracted_data, job.supplier_hint);
      document.warnings = uniqueStrings([...document.warnings, 'Analyse identique réutilisée sans nouvel envoi IA.']);
      return {
        document,
        fileSha256,
        model: previous.model,
        inputTokens: previous.input_tokens,
        outputTokens: previous.output_tokens,
        estimatedCostUsd: 0,
      };
    }
  }

  const apiKey = await readOpenAiKey(job.workspace_id);
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      reasoning: { effort: 'low' },
      store: false,
      max_output_tokens: 8_000,
      instructions: [
        'Tu analyses un document comptable fournisseur de vitrage automobile en français.',
        'Classe-le comme bon de livraison, facture, avoir ou autre.',
        'N invente jamais une référence, une immatriculation, une date, un montant ou un paiement.',
        'Une valeur illisible ou absente doit être null et doit diminuer la confiance.',
        'Distingue le numéro du document, le numéro de facture, les numéros de bons de livraison et le numéro de commande.',
        'Pour une facture récapitulative, rattache chaque ligne au bon de livraison indiqué sur cette ligne.',
        'Extrais toutes les lignes utiles, notamment vitrage, accessoires, transport, remises et retours.',
        'Les montants doivent conserver leur signe tel qu imprimé. Un avoir est classé credit_note même si ses totaux sont positifs.',
        'payment_is_confirmed est vrai uniquement si le document prouve explicitement un règlement déjà effectué.',
        'Une simple mention carte bancaire, LCR, prélèvement, échéance ou mode de paiement ne prouve pas le paiement.',
        'Normalise uniquement les espaces superflus, sans réécrire les références techniques.',
        'La confiance est un score global de 0 à 100. Signale dans warnings toute ambiguïté ou incohérence arithmétique.',
      ].join(' '),
      input: [{
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: `Analyse le PDF ${job.filename}. Fournisseur présumé : ${job.supplier_hint ?? 'inconnu'}.`,
          },
          {
            type: 'input_file',
            filename: job.filename,
            file_data: `data:application/pdf;base64,${bytesToBase64(bytes)}`,
          },
        ],
      }],
      text: {
        format: {
          type: 'json_schema',
          name: 'supplier_document_analysis',
          strict: true,
          schema: extractionSchema(),
        },
      },
    }),
  });

  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    const error = asObject(payload.error);
    throw new Error(`OPENAI_FAILED: ${stringValue(error.message) ?? `HTTP ${response.status}`}`);
  }
  const rawText = responseText(payload);
  if (!rawText) throw new Error('OPENAI_EMPTY_RESPONSE');
  const document = normalizeExtractedDocument(JSON.parse(rawText), job.supplier_hint);
  const usage = asObject(payload.usage);
  const inputTokens = typeof usage.input_tokens === 'number' ? usage.input_tokens : null;
  const outputTokens = typeof usage.output_tokens === 'number' ? usage.output_tokens : null;
  const estimatedCostUsd = inputTokens === null || outputTokens === null
    ? null
    : (inputTokens * INPUT_USD_PER_MILLION + outputTokens * OUTPUT_USD_PER_MILLION) / 1_000_000;
  return { document, fileSha256, model: MODEL, inputTokens, outputTokens, estimatedCostUsd };
}

function completeAmounts(document: ExtractedDocument): {
  amountHt: number | null;
  vatAmount: number | null;
  amountTtc: number | null;
  derived: boolean;
} {
  let amountHt = document.amount_ht;
  let vatAmount = document.vat_amount;
  let amountTtc = document.amount_ttc;
  let derived = false;
  if (amountHt !== null && vatAmount !== null && amountTtc === null) {
    amountTtc = roundMoney(amountHt + vatAmount);
    derived = true;
  } else if (amountHt !== null && amountTtc !== null && vatAmount === null) {
    vatAmount = roundMoney(amountTtc - amountHt);
    derived = true;
  } else if (vatAmount !== null && amountTtc !== null && amountHt === null) {
    amountHt = roundMoney(amountTtc - vatAmount);
    derived = true;
  }
  return { amountHt, vatAmount, amountTtc, derived };
}

function validateExtraction(document: ExtractedDocument): { warnings: string[]; reviewRequired: boolean } {
  const warnings = [...document.warnings];
  const amounts = completeAmounts(document);
  if (!document.supplier) warnings.push('Fournisseur non identifié.');
  if (!document.document_number) warnings.push('Numéro de document absent ou illisible.');
  if (!document.document_date) warnings.push('Date du document absente ou illisible.');
  if (amounts.amountHt === null || amounts.vatAmount === null || amounts.amountTtc === null) {
    warnings.push('Totaux HT, TVA ou TTC incomplets : aucune dépense ne sera créée automatiquement.');
  } else if (Math.abs(roundMoney(amounts.amountHt + amounts.vatAmount - amounts.amountTtc)) > 0.05) {
    warnings.push('Les totaux HT + TVA ne correspondent pas au TTC.');
  }
  if (amounts.derived) warnings.push('Un total manquant a été calculé à partir des deux autres montants lus.');
  if (document.confidence < 80) warnings.push(`Confiance de lecture insuffisante (${document.confidence} %).`);
  if (document.document_type === 'other') warnings.push('Le PDF ne ressemble pas à un BL, une facture ou un avoir fournisseur.');
  const blocking = !document.supplier
    || !document.document_number
    || !document.document_date
    || amounts.amountHt === null
    || amounts.vatAmount === null
    || amounts.amountTtc === null;
  return {
    warnings: uniqueStrings(warnings),
    reviewRequired: blocking || document.confidence < 80 || warnings.some((warning) => (
      warning.includes('ne correspondent pas') || warning.includes('ambigu')
    )),
  };
}

async function resolveRelationships(
  workspaceId: string,
  document: ExtractedDocument,
): Promise<{ byRegistration: Map<string, Relationship>; primary: Relationship | null; warnings: string[] }> {
  const registrations = uniqueStrings([
    document.vehicle_registration,
    ...document.items.map((item) => item.vehicle_registration),
  ]).map(normalizeRegistration).filter((value) => value.length >= 4);
  const byRegistration = new Map<string, Relationship>();
  const warnings: string[] = [];
  if (registrations.length === 0) return { byRegistration, primary: null, warnings };

  const { data: leads, error: leadError } = await admin
    .from('leads')
    .select('id, contact_id, vehicle_registration, created_at')
    .eq('workspace_id', workspaceId)
    .not('vehicle_registration', 'is', null)
    .order('created_at', { ascending: false })
    .limit(2_000);
  if (leadError) throw new Error(`LEAD_MATCH_FAILED: ${leadError.message}`);

  for (const registration of registrations) {
    const matches = (leads ?? []).filter((lead) => (
      normalizeRegistration(lead.vehicle_registration as string | null) === registration
    ));
    if (matches.length !== 1) {
      if (matches.length > 1) warnings.push(`Immatriculation ${registration} présente sur plusieurs leads.`);
      continue;
    }
    const lead = matches[0];
    const { data: caseRow, error: caseError } = await admin
      .from('windscreen_cases')
      .select('id, contact_id')
      .eq('workspace_id', workspaceId)
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (caseError) throw new Error(`CASE_MATCH_FAILED: ${caseError.message}`);
    const contactId = caseRow?.contact_id ?? lead.contact_id ?? null;
    let customerInvoiceId: string | null = null;
    let invoiceQuery = admin
      .from('invoices')
      .select('id, case_id, contact_id, issue_date, onify_payload')
      .eq('workspace_id', workspaceId)
      .neq('status', 'cancelled')
      .order('issue_date', { ascending: false })
      .limit(20);
    if (caseRow?.id) invoiceQuery = invoiceQuery.eq('case_id', caseRow.id);
    else if (contactId) invoiceQuery = invoiceQuery.eq('contact_id', contactId);
    else invoiceQuery = invoiceQuery.eq('id', '00000000-0000-0000-0000-000000000000');
    const { data: invoices, error: invoiceError } = await invoiceQuery;
    if (invoiceError) throw new Error(`CUSTOMER_INVOICE_MATCH_FAILED: ${invoiceError.message}`);
    const exactInvoices = (invoices ?? []).filter((invoice) => {
      const vehicle = asObject(asObject(invoice.onify_payload).vehicle);
      return normalizeRegistration(stringValue(vehicle.immat)) === registration;
    });
    const candidates = exactInvoices.length > 0 ? exactInvoices : (invoices ?? []);
    if (candidates.length === 1) customerInvoiceId = candidates[0].id as string;
    else if (candidates.length > 1) warnings.push(`Plusieurs factures client possibles pour ${registration}.`);
    byRegistration.set(registration, {
      leadId: lead.id as string,
      caseId: caseRow?.id as string | undefined ?? null,
      contactId: contactId as string | null,
      customerInvoiceId,
    });
  }

  const relationships = [...byRegistration.values()];
  const primary = relationships.length > 0 && relationships.every((row) => row.leadId === relationships[0].leadId)
    ? relationships[0]
    : null;
  return { byRegistration, primary, warnings: uniqueStrings(warnings) };
}

async function supplierPaymentState(
  workspaceId: string,
  supplier: string,
  document: ExtractedDocument,
  amountTtc: number,
) {
  const { data: overview } = await admin
    .from('v_supplier_account_overview')
    .select('credit_limit_ttc, outstanding_ttc, auto_card_over_limit, overflow_payment_method')
    .eq('workspace_id', workspaceId)
    .ilike('supplier', supplier)
    .limit(1)
    .maybeSingle();
  const explicitMethod = document.payment_method;
  const limit = numberValue(overview?.credit_limit_ttc);
  const outstanding = numberValue(overview?.outstanding_ttc) ?? 0;
  const projected = roundMoney(outstanding + Math.max(0, amountTtc));
  const mustUseCard = explicitMethod === 'unknown'
    && overview?.auto_card_over_limit === true
    && overview?.overflow_payment_method === 'card'
    && limit !== null
    && projected >= limit;
  const paymentMethod: PaymentMethod = explicitMethod !== 'unknown'
    ? explicitMethod
    : mustUseCard ? 'card' : 'supplier_account';
  const scheduled = !document.payment_is_confirmed
    && paymentMethod !== 'card'
    && document.due_date !== null
    && document.due_date >= new Date().toISOString().slice(0, 10);
  const paymentStatus = document.payment_is_confirmed ? 'paid' : scheduled ? 'scheduled' : 'unpaid';
  let accountingStatus = document.document_type === 'delivery_note'
    ? 'committed'
    : scheduled ? 'payment_scheduled' : 'invoiced_unpaid';
  if (document.payment_is_confirmed) {
    accountingStatus = document.document_type === 'delivery_note' && paymentMethod === 'card'
      ? 'paid_card_invoice_pending'
      : 'paid';
  } else if (paymentMethod === 'card') {
    accountingStatus = 'card_to_confirm';
  }
  return {
    paymentMethod,
    paymentStatus,
    accountingStatus,
    paidAt: document.payment_is_confirmed ? document.payment_date ?? null : null,
    warning: mustUseCard
      ? `Plafond fournisseur atteint ou dépassé (${projected.toFixed(2)} € TTC projetés) : paiement CB à confirmer.`
      : null,
  };
}

function expectedPaymentMethod(method: PaymentMethod): string | null {
  const labels: Record<PaymentMethod, string | null> = {
    unknown: null,
    supplier_account: 'Compte fournisseur',
    card: 'Carte bancaire',
    direct_debit: 'Prélèvement / LCR',
    bank_transfer: 'Virement',
    other: 'Autre',
  };
  return labels[method];
}

async function autoAllocateExpense(
  workspaceId: string,
  expenseId: string,
  items: ExtractedItem[],
  fallbackRegistration: string | null,
  relationships: Map<string, Relationship>,
) {
  const { error: deleteError } = await admin
    .from('supplier_expense_allocations')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('supplier_expense_id', expenseId)
    .eq('match_method', 'vehicle_auto');
  if (deleteError) throw new Error(`ALLOCATION_RESET_FAILED: ${deleteError.message}`);

  const rows: Array<Record<string, unknown>> = [];
  items.forEach((item, index) => {
    const registration = normalizeRegistration(item.vehicle_registration ?? fallbackRegistration);
    const relationship = relationships.get(registration);
    if (!relationship?.customerInvoiceId || item.amount_ht === null) return;
    rows.push({
      workspace_id: workspaceId,
      supplier_expense_id: expenseId,
      supplier_item_index: index,
      invoice_id: relationship.customerInvoiceId,
      case_id: relationship.caseId,
      contact_id: relationship.contactId,
      amount_ht: item.amount_ht,
      match_method: 'vehicle_auto',
      confidence: 100,
      confirmed: true,
    });
  });
  if (rows.length === 0) return;
  const { error } = await admin.from('supplier_expense_allocations').upsert(rows, {
    onConflict: 'workspace_id,supplier_expense_id,supplier_item_index',
  });
  if (error) throw new Error(`ALLOCATION_WRITE_FAILED: ${error.message}`);
}

async function existingExpenseFromSource(job: SupplierDocumentJob): Promise<string | null> {
  const { data, error } = await admin
    .from('supplier_expenses')
    .select('id')
    .eq('workspace_id', job.workspace_id)
    .eq('source_communication_id', job.communication_id)
    .eq('source_attachment_id', job.attachment_id)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`SOURCE_LOOKUP_FAILED: ${error.message}`);
  return data?.id as string | undefined ?? null;
}

function expenseItems(items: ExtractedItem[]): Array<Record<string, unknown>> {
  return items.map((item) => ({
    delivery_date: item.delivery_date,
    delivery_note: item.delivery_note_number,
    delivery_note_number: item.delivery_note_number,
    vehicle_registration: item.vehicle_registration,
    site: item.site,
    category: item.category,
    sku: item.sku,
    description: item.description,
    quantity: item.quantity,
    gross_unit_price_ht: item.gross_unit_price_ht,
    discount_rate: item.discount_rate,
    net_unit_price_ht: item.net_unit_price_ht,
    amount_ht: item.amount_ht,
    page: item.page,
  }));
}

function sourceFields(job: SupplierDocumentJob) {
  return {
    source_communication_id: job.communication_id,
    source_attachment_id: job.attachment_id,
    pdf_available_in_source: true,
    pdf_filename: job.filename,
    pdf_storage_path: job.storage_path,
  };
}

async function processDeliveryNote(
  job: SupplierDocumentJob,
  document: ExtractedDocument,
  initialReview: boolean,
  initialWarnings: string[],
): Promise<AccountingResult> {
  const existingFromSource = await existingExpenseFromSource(job);
  if (existingFromSource) return { expenseId: existingFromSource, expenseIds: [existingFromSource], reviewRequired: initialReview, warnings: initialWarnings };
  if (!document.supplier || !document.document_number || !document.document_date) {
    return { expenseId: null, expenseIds: [], reviewRequired: true, warnings: initialWarnings };
  }
  const amounts = completeAmounts(document);
  if (amounts.amountHt === null || amounts.vatAmount === null || amounts.amountTtc === null) {
    return { expenseId: null, expenseIds: [], reviewRequired: true, warnings: initialWarnings };
  }

  const { data: existing, error: existingError } = await admin
    .from('supplier_expenses')
    .select('id')
    .eq('workspace_id', job.workspace_id)
    .ilike('supplier', document.supplier)
    .eq('document_number', document.document_number)
    .limit(1)
    .maybeSingle();
  if (existingError) throw new Error(`BL_LOOKUP_FAILED: ${existingError.message}`);
  if (existing) return { expenseId: existing.id, expenseIds: [existing.id], reviewRequired: initialReview, warnings: initialWarnings };

  const relationships = await resolveRelationships(job.workspace_id, document);
  const payment = await supplierPaymentState(job.workspace_id, document.supplier, document, amounts.amountTtc);
  const warnings = uniqueStrings([...initialWarnings, ...relationships.warnings, payment.warning]);
  const documentReviewRequired = initialReview || relationships.warnings.length > 0;
  const paymentConfirmationRequired = payment.accountingStatus === 'card_to_confirm';
  const reviewRequired = documentReviewRequired || paymentConfirmationRequired;
  const accountingStatus = documentReviewRequired && !paymentConfirmationRequired
    ? 'review_required'
    : payment.accountingStatus;
  const row = {
    workspace_id: job.workspace_id,
    supplier: document.supplier,
    document_type: 'delivery_note',
    document_number: document.document_number,
    delivery_note_number: document.document_number,
    order_number: document.order_number,
    invoice_date: document.document_date,
    amount_ht: amounts.amountHt,
    vat_amount: amounts.vatAmount,
    amount_ttc: amounts.amountTtc,
    gross_amount_ht: amounts.amountHt,
    gross_vat_amount: amounts.vatAmount,
    gross_amount_ttc: amounts.amountTtc,
    expected_payment_method: expectedPaymentMethod(payment.paymentMethod),
    due_date: document.due_date,
    sites: uniqueStrings(document.items.map((item) => item.site)).join(' / ') || null,
    item_count: document.items.length,
    items: expenseItems(document.items),
    portal_date: document.document_date,
    observation: warnings.join(' · ') || null,
    source_import: 'supplier-email-ai',
    accounting_status: accountingStatus,
    amount_basis: 'provisional',
    payment_method: payment.paymentMethod,
    payment_status: payment.paymentStatus,
    paid_at: payment.paidAt,
    analysis_confidence: document.confidence,
    needs_review: reviewRequired,
    document_review_required: documentReviewRequired,
    payment_confirmation_required: paymentConfirmationRequired,
    lead_id: relationships.primary?.leadId ?? null,
    case_id: relationships.primary?.caseId ?? null,
    contact_id: relationships.primary?.contactId ?? null,
    customer_invoice_id: relationships.primary?.customerInvoiceId ?? null,
    analysis_metadata: { vehicle_registration: document.vehicle_registration, warnings },
    ...sourceFields(job),
  };
  const { data: inserted, error } = await admin.from('supplier_expenses').insert(row).select('id').single();
  if (error) throw new Error(`BL_WRITE_FAILED: ${error.message}`);
  await autoAllocateExpense(
    job.workspace_id,
    inserted.id,
    document.items,
    document.vehicle_registration,
    relationships.byRegistration,
  );
  return { expenseId: inserted.id, expenseIds: [inserted.id], reviewRequired, warnings };
}

async function deliveryNoteMatches(
  workspaceId: string,
  supplier: string,
  references: string[],
): Promise<Array<Record<string, unknown>>> {
  if (references.length === 0) return [];
  const normalized = new Set(references.map(normalizeReference));
  const { data, error } = await admin
    .from('supplier_expenses')
    .select('*')
    .eq('workspace_id', workspaceId)
    .ilike('supplier', supplier)
    .in('document_type', ['delivery_note', 'invoice'])
    .limit(500);
  if (error) throw new Error(`BL_MATCH_FAILED: ${error.message}`);
  return (data ?? []).filter((row) => (
    normalized.has(normalizeReference(stringValue(row.delivery_note_number)))
    || normalized.has(normalizeReference(stringValue(row.document_number)))
  ));
}

function invoiceAccountingState(document: ExtractedDocument, method: PaymentMethod) {
  if (document.payment_is_confirmed) return 'paid';
  if (method === 'card') return 'card_to_confirm';
  return 'invoiced_unpaid';
}

async function updateExpenseWithInvoice(
  job: SupplierDocumentJob,
  document: ExtractedDocument,
  expense: Record<string, unknown>,
  items: ExtractedItem[],
  amounts: { amountHt: number; vatAmount: number; amountTtc: number },
  relationships: Awaited<ReturnType<typeof resolveRelationships>>,
  warnings: string[],
  reviewRequired: boolean,
  attachSource: boolean,
): Promise<ExpenseWriteResult> {
  const calculatedPayment = await supplierPaymentState(job.workspace_id, document.supplier ?? '', document, amounts.amountTtc);
  const knownPaymentMethods: PaymentMethod[] = [
    'unknown', 'supplier_account', 'card', 'direct_debit', 'bank_transfer', 'other',
  ];
  const existingPaymentMethod = knownPaymentMethods.includes(expense.payment_method as PaymentMethod)
    ? expense.payment_method as PaymentMethod
    : 'unknown';
  const existingPaymentStatus = stringValue(expense.payment_status) ?? 'unknown';
  let paymentMethod = calculatedPayment.paymentMethod;
  let paymentStatus = calculatedPayment.paymentStatus;
  let paymentAccountingStatus = calculatedPayment.accountingStatus;
  let paidAt = calculatedPayment.paidAt;
  let paymentWarning = calculatedPayment.warning;

  if (existingPaymentStatus === 'paid' || document.payment_is_confirmed) {
    paymentMethod = document.payment_method !== 'unknown'
      ? document.payment_method
      : existingPaymentMethod;
    paymentStatus = 'paid';
    paymentAccountingStatus = 'paid';
    paidAt = document.payment_date ?? stringValue(expense.paid_at);
    paymentWarning = null;
  } else if (Boolean(expense.payment_confirmation_required) || stringValue(expense.accounting_status) === 'card_to_confirm') {
    paymentMethod = 'card';
    paymentStatus = 'unpaid';
    paymentAccountingStatus = 'card_to_confirm';
    paidAt = null;
    paymentWarning = 'Paiement par carte toujours à confirmer.';
  } else if (document.payment_method === 'unknown' && existingPaymentMethod !== 'unknown') {
    paymentMethod = existingPaymentMethod;
    paymentStatus = existingPaymentStatus;
    paymentAccountingStatus = existingPaymentStatus === 'scheduled'
      ? 'payment_scheduled'
      : invoiceAccountingState(document, existingPaymentMethod);
    paidAt = stringValue(expense.paid_at);
    paymentWarning = null;
  }

  const allWarnings = uniqueStrings([...warnings, paymentWarning]);
  const existingCreditHt = numberValue(expense.credit_amount_ht) ?? 0;
  const existingCreditVat = numberValue(expense.credit_vat_amount) ?? 0;
  const existingCreditTtc = numberValue(expense.credit_amount_ttc) ?? 0;
  const documentReviewRequired = reviewRequired;
  const paymentConfirmationRequired = paymentAccountingStatus === 'card_to_confirm';
  const effectiveReview = documentReviewRequired || paymentConfirmationRequired;
  const source = attachSource ? sourceFields(job) : {};
  const update = {
    document_type: 'invoice',
    invoice_number: document.invoice_number ?? document.document_number,
    order_number: document.order_number ?? stringValue(expense.order_number),
    invoice_date: document.document_date,
    invoice_received_at: new Date().toISOString(),
    amount_ht: roundMoney(amounts.amountHt - existingCreditHt),
    vat_amount: roundMoney(amounts.vatAmount - existingCreditVat),
    amount_ttc: roundMoney(amounts.amountTtc - existingCreditTtc),
    gross_amount_ht: amounts.amountHt,
    gross_vat_amount: amounts.vatAmount,
    gross_amount_ttc: amounts.amountTtc,
    expected_payment_method: expectedPaymentMethod(paymentMethod),
    due_date: document.due_date,
    sites: uniqueStrings(items.map((item) => item.site)).join(' / ') || stringValue(expense.sites),
    item_count: items.length,
    items: expenseItems(items),
    pdf_available_in_source: true,
    pdf_filename: attachSource ? job.filename : expense.pdf_filename,
    pdf_storage_path: attachSource ? job.storage_path : expense.pdf_storage_path,
    observation: allWarnings.join(' · ') || null,
    source_import: 'supplier-email-ai',
    accounting_status: documentReviewRequired && !paymentConfirmationRequired
      ? 'review_required'
      : paymentAccountingStatus,
    amount_basis: 'final',
    payment_method: paymentMethod,
    payment_status: paymentStatus,
    paid_at: paidAt,
    analysis_confidence: document.confidence,
    needs_review: effectiveReview,
    document_review_required: documentReviewRequired,
    payment_confirmation_required: paymentConfirmationRequired,
    lead_id: relationships.primary?.leadId ?? expense.lead_id ?? null,
    case_id: relationships.primary?.caseId ?? expense.case_id ?? null,
    contact_id: relationships.primary?.contactId ?? expense.contact_id ?? null,
    customer_invoice_id: relationships.primary?.customerInvoiceId ?? expense.customer_invoice_id ?? null,
    analysis_metadata: { vehicle_registration: document.vehicle_registration, warnings: allWarnings },
    ...source,
  };
  const { error } = await admin.from('supplier_expenses').update(update).eq('id', expense.id);
  if (error) throw new Error(`INVOICE_UPDATE_FAILED: ${error.message}`);
  await autoAllocateExpense(
    job.workspace_id,
    expense.id as string,
    items,
    document.vehicle_registration,
    relationships.byRegistration,
  );
  return { expenseId: expense.id as string, reviewRequired: effectiveReview, warnings: allWarnings };
}

async function insertStandaloneInvoice(
  job: SupplierDocumentJob,
  document: ExtractedDocument,
  amounts: { amountHt: number; vatAmount: number; amountTtc: number },
  relationships: Awaited<ReturnType<typeof resolveRelationships>>,
  warnings: string[],
  reviewRequired: boolean,
): Promise<ExpenseWriteResult> {
  const supplier = document.supplier ?? '';
  const payment = await supplierPaymentState(job.workspace_id, supplier, document, amounts.amountTtc);
  const allWarnings = uniqueStrings([...warnings, payment.warning]);
  const documentReviewRequired = reviewRequired || relationships.warnings.length > 0;
  const paymentConfirmationRequired = payment.accountingStatus === 'card_to_confirm';
  const effectiveReview = documentReviewRequired || paymentConfirmationRequired;
  const invoiceNumber = document.invoice_number ?? document.document_number ?? '';
  const row = {
    workspace_id: job.workspace_id,
    supplier,
    document_type: 'invoice',
    document_number: invoiceNumber,
    invoice_number: invoiceNumber,
    order_number: document.order_number,
    delivery_note_number: document.delivery_note_numbers.length === 1 ? document.delivery_note_numbers[0] : null,
    invoice_date: document.document_date,
    invoice_received_at: new Date().toISOString(),
    amount_ht: amounts.amountHt,
    vat_amount: amounts.vatAmount,
    amount_ttc: amounts.amountTtc,
    gross_amount_ht: amounts.amountHt,
    gross_vat_amount: amounts.vatAmount,
    gross_amount_ttc: amounts.amountTtc,
    expected_payment_method: expectedPaymentMethod(payment.paymentMethod),
    due_date: document.due_date,
    sites: uniqueStrings(document.items.map((item) => item.site)).join(' / ') || null,
    item_count: document.items.length,
    items: expenseItems(document.items),
    portal_date: document.document_date,
    observation: allWarnings.join(' · ') || null,
    source_import: 'supplier-email-ai',
    accounting_status: documentReviewRequired && !paymentConfirmationRequired
      ? 'review_required'
      : payment.accountingStatus,
    amount_basis: 'final',
    payment_method: payment.paymentMethod,
    payment_status: payment.paymentStatus,
    paid_at: payment.paidAt,
    analysis_confidence: document.confidence,
    needs_review: effectiveReview,
    document_review_required: documentReviewRequired,
    payment_confirmation_required: paymentConfirmationRequired,
    lead_id: relationships.primary?.leadId ?? null,
    case_id: relationships.primary?.caseId ?? null,
    contact_id: relationships.primary?.contactId ?? null,
    customer_invoice_id: relationships.primary?.customerInvoiceId ?? null,
    analysis_metadata: { vehicle_registration: document.vehicle_registration, warnings: allWarnings },
    ...sourceFields(job),
  };
  const { data: inserted, error } = await admin.from('supplier_expenses').insert(row).select('id').single();
  if (error) throw new Error(`INVOICE_WRITE_FAILED: ${error.message}`);
  await autoAllocateExpense(
    job.workspace_id,
    inserted.id,
    document.items,
    document.vehicle_registration,
    relationships.byRegistration,
  );
  return { expenseId: inserted.id as string, reviewRequired: effectiveReview, warnings: allWarnings };
}

async function attachInvoiceSourceToExisting(
  job: SupplierDocumentJob,
  document: ExtractedDocument,
  expenses: Array<Record<string, unknown>>,
  reviewRequired: boolean,
  warnings: string[],
  relationships: Awaited<ReturnType<typeof resolveRelationships>>,
) {
  if (expenses.length === 0) return;
  const first = expenses[0];
  const documentReviewRequired = Boolean(first.document_review_required) || reviewRequired;
  const paymentConfirmationRequired = document.payment_is_confirmed
    ? false
    : Boolean(first.payment_confirmation_required);
  const update: Record<string, unknown> = {
    ...sourceFields(job),
    invoice_received_at: new Date().toISOString(),
    analysis_confidence: document.confidence,
    needs_review: documentReviewRequired || paymentConfirmationRequired,
    document_review_required: documentReviewRequired,
    payment_confirmation_required: paymentConfirmationRequired,
    observation: uniqueStrings([stringValue(first.observation), ...warnings]).join(' · ') || null,
    lead_id: relationships.primary?.leadId ?? first.lead_id ?? null,
    case_id: relationships.primary?.caseId ?? first.case_id ?? null,
    contact_id: relationships.primary?.contactId ?? first.contact_id ?? null,
    customer_invoice_id: relationships.primary?.customerInvoiceId ?? first.customer_invoice_id ?? null,
    analysis_metadata: {
      ...asObject(first.analysis_metadata),
      vehicle_registration: document.vehicle_registration,
      latest_invoice_source: {
        communication_id: job.communication_id,
        attachment_id: job.attachment_id,
        filename: job.filename,
      },
      warnings,
    },
  };
  if (document.payment_is_confirmed && stringValue(first.accounting_status) !== 'credited') {
    update.payment_method = document.payment_method !== 'unknown'
      ? document.payment_method
      : stringValue(first.payment_method) ?? 'unknown';
    update.payment_status = 'paid';
    update.accounting_status = 'paid';
    update.paid_at = document.payment_date ?? stringValue(first.paid_at);
  }
  const { error } = await admin.from('supplier_expenses').update(update).eq('id', first.id);
  if (error) throw new Error(`INVOICE_SOURCE_LINK_FAILED: ${error.message}`);
  await autoAllocateExpense(
    job.workspace_id,
    first.id as string,
    document.items,
    document.vehicle_registration,
    relationships.byRegistration,
  );
}

async function processInvoice(
  job: SupplierDocumentJob,
  document: ExtractedDocument,
  initialReview: boolean,
  initialWarnings: string[],
): Promise<AccountingResult> {
  const existingFromSource = await existingExpenseFromSource(job);
  if (existingFromSource) return { expenseId: existingFromSource, expenseIds: [existingFromSource], reviewRequired: initialReview, warnings: initialWarnings };
  if (!document.supplier || !document.document_number || !document.document_date) {
    return { expenseId: null, expenseIds: [], reviewRequired: true, warnings: initialWarnings };
  }
  const completed = completeAmounts(document);
  if (completed.amountHt === null || completed.vatAmount === null || completed.amountTtc === null) {
    return { expenseId: null, expenseIds: [], reviewRequired: true, warnings: initialWarnings };
  }
  const amounts = { amountHt: completed.amountHt, vatAmount: completed.vatAmount, amountTtc: completed.amountTtc };
  const invoiceNumber = document.invoice_number ?? document.document_number;
  const { data: alreadyInvoiced, error: alreadyError } = await admin
    .from('supplier_expenses')
    .select('*')
    .eq('workspace_id', job.workspace_id)
    .ilike('supplier', document.supplier)
    .eq('invoice_number', invoiceNumber)
    .limit(20);
  if (alreadyError) throw new Error(`INVOICE_LOOKUP_FAILED: ${alreadyError.message}`);
  if ((alreadyInvoiced ?? []).length > 0) {
    const existingRows = (alreadyInvoiced ?? []) as Array<Record<string, unknown>>;
    const existingRelationships = await resolveRelationships(job.workspace_id, document);
    const existingWarnings = uniqueStrings([...initialWarnings, ...existingRelationships.warnings]);
    const existingReview = initialReview || existingRelationships.warnings.length > 0 || existingRows.some((row) => (
      Boolean(row.document_review_required)
      || (!document.payment_is_confirmed && Boolean(row.payment_confirmation_required))
    ));
    await attachInvoiceSourceToExisting(
      job,
      document,
      existingRows,
      initialReview || existingRelationships.warnings.length > 0,
      existingWarnings,
      existingRelationships,
    );
    const ids = existingRows.map((row) => row.id as string);
    return { expenseId: ids[0], expenseIds: ids, reviewRequired: existingReview, warnings: existingWarnings };
  }

  const relationships = await resolveRelationships(job.workspace_id, document);
  const warnings = uniqueStrings([...initialWarnings, ...relationships.warnings]);
  const references = uniqueStrings([
    ...document.delivery_note_numbers,
    ...document.items.map((item) => item.delivery_note_number),
  ]);
  const matches = await deliveryNoteMatches(job.workspace_id, document.supplier, references);
  if (matches.length === 0) {
    const inserted = await insertStandaloneInvoice(
      job,
      document,
      amounts,
      relationships,
      warnings,
      initialReview || relationships.warnings.length > 0,
    );
    return {
      expenseId: inserted.expenseId,
      expenseIds: [inserted.expenseId],
      reviewRequired: inserted.reviewRequired,
      warnings: inserted.warnings,
    };
  }

  if (references.length > 1 && matches.length !== references.length) {
    warnings.push('Tous les BL mentionnés sur la facture n ont pas été retrouvés : aucune dépense provisoire n a été finalisée.');
    return {
      expenseId: matches[0].id as string,
      expenseIds: matches.map((row) => row.id as string),
      reviewRequired: true,
      warnings: uniqueStrings(warnings),
    };
  }

  if (matches.length === 1) {
    const updated = await updateExpenseWithInvoice(
      job,
      document,
      matches[0],
      document.items,
      amounts,
      relationships,
      warnings,
      initialReview || relationships.warnings.length > 0,
      true,
    );
    return {
      expenseId: updated.expenseId,
      expenseIds: [updated.expenseId],
      reviewRequired: updated.reviewRequired,
      warnings: updated.warnings,
    };
  }

  const groups = new Map<string, ExtractedItem[]>();
  for (const item of document.items) {
    const key = normalizeReference(item.delivery_note_number);
    if (!key && Math.abs(item.amount_ht ?? 0) > 0.005) {
      warnings.push('La facture regroupe plusieurs BL mais certaines lignes n indiquent aucun numéro de BL.');
      return { expenseId: matches[0].id as string, expenseIds: matches.map((row) => row.id as string), reviewRequired: true, warnings: uniqueStrings(warnings) };
    }
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const matchKeys = matches.map((expense) => normalizeReference(
    stringValue(expense.delivery_note_number) ?? stringValue(expense.document_number),
  ));
  if (matchKeys.some((key) => !groups.has(key)) || matches.length !== references.length) {
    warnings.push('La facture multi-BL ne peut pas être ventilée sans ambiguïté : contrôle manuel requis.');
    return { expenseId: matches[0].id as string, expenseIds: matches.map((row) => row.id as string), reviewRequired: true, warnings: uniqueStrings(warnings) };
  }
  const groupTotals = matchKeys.map((key) => roundMoney((groups.get(key) ?? []).reduce(
    (sum, item) => sum + (item.amount_ht ?? 0), 0,
  )));
  const groupedHt = roundMoney(groupTotals.reduce((sum, value) => sum + value, 0));
  if (Math.abs(groupedHt - amounts.amountHt) > Math.max(1, Math.abs(amounts.amountHt) * 0.01)) {
    warnings.push('La somme des lignes ventilées par BL ne correspond pas au total HT de la facture.');
    return { expenseId: matches[0].id as string, expenseIds: matches.map((row) => row.id as string), reviewRequired: true, warnings: uniqueStrings(warnings) };
  }

  const expenseIds: string[] = [];
  let finalReviewRequired = initialReview || relationships.warnings.length > 0;
  let finalWarnings = [...warnings];
  let allocatedVat = 0;
  let allocatedTtc = 0;
  for (const [index, expense] of matches.entries()) {
    const key = matchKeys[index];
    const groupHt = groupTotals[index];
    const last = index === matches.length - 1;
    const groupVat = last
      ? roundMoney(amounts.vatAmount - allocatedVat)
      : roundMoney(amounts.vatAmount * (groupHt / (groupedHt || 1)));
    const groupTtc = last
      ? roundMoney(amounts.amountTtc - allocatedTtc)
      : roundMoney(groupHt + groupVat);
    allocatedVat = roundMoney(allocatedVat + groupVat);
    allocatedTtc = roundMoney(allocatedTtc + groupTtc);
    const updated = await updateExpenseWithInvoice(
      job,
      document,
      expense,
      groups.get(key) ?? [],
      { amountHt: groupHt, vatAmount: groupVat, amountTtc: groupTtc },
      relationships,
      warnings,
      initialReview || relationships.warnings.length > 0,
      index === 0,
    );
    expenseIds.push(updated.expenseId);
    finalReviewRequired = finalReviewRequired || updated.reviewRequired;
    finalWarnings = uniqueStrings([...finalWarnings, ...updated.warnings]);
  }
  return {
    expenseId: expenseIds[0] ?? null,
    expenseIds,
    reviewRequired: finalReviewRequired,
    warnings: finalWarnings,
  };
}

async function applyCreditToExpense(
  expense: Record<string, unknown>,
  document: ExtractedDocument,
  credit: { amountHt: number; vatAmount: number; amountTtc: number },
  warnings: string[],
) {
  const grossHt = numberValue(expense.gross_amount_ht) ?? numberValue(expense.amount_ht) ?? 0;
  const grossVat = numberValue(expense.gross_vat_amount) ?? numberValue(expense.vat_amount) ?? 0;
  const grossTtc = numberValue(expense.gross_amount_ttc) ?? numberValue(expense.amount_ttc) ?? 0;
  const priorCreditHt = numberValue(expense.credit_amount_ht) ?? 0;
  const priorCreditVat = numberValue(expense.credit_vat_amount) ?? 0;
  const priorCreditTtc = numberValue(expense.credit_amount_ttc) ?? 0;
  const creditNoteNumbers = uniqueStrings([
    ...(Array.isArray(expense.credit_note_numbers) ? expense.credit_note_numbers.map(stringValue) : []),
    document.document_number,
  ]);
  const totalCreditHt = roundMoney(priorCreditHt + Math.abs(credit.amountHt));
  const totalCreditVat = roundMoney(priorCreditVat + Math.abs(credit.vatAmount));
  const totalCreditTtc = roundMoney(priorCreditTtc + Math.abs(credit.amountTtc));
  const { error } = await admin.from('supplier_expenses').update({
    amount_ht: roundMoney(grossHt - totalCreditHt),
    vat_amount: roundMoney(grossVat - totalCreditVat),
    amount_ttc: roundMoney(grossTtc - totalCreditTtc),
    credit_amount_ht: totalCreditHt,
    credit_vat_amount: totalCreditVat,
    credit_amount_ttc: totalCreditTtc,
    credit_note_numbers: creditNoteNumbers,
    accounting_status: 'credited',
    payment_status: document.payment_is_confirmed ? 'refunded' : expense.payment_status,
    needs_review: Boolean(expense.needs_review),
    observation: uniqueStrings([stringValue(expense.observation), ...warnings]).join(' · ') || null,
  }).eq('id', expense.id);
  if (error) throw new Error(`CREDIT_UPDATE_FAILED: ${error.message}`);
}

async function processCreditNote(
  job: SupplierDocumentJob,
  document: ExtractedDocument,
  initialReview: boolean,
  initialWarnings: string[],
): Promise<AccountingResult> {
  const existingFromSource = await existingExpenseFromSource(job);
  if (existingFromSource) return { expenseId: existingFromSource, expenseIds: [existingFromSource], reviewRequired: initialReview, warnings: initialWarnings };
  if (!document.supplier || !document.document_number || !document.document_date) {
    return { expenseId: null, expenseIds: [], reviewRequired: true, warnings: initialWarnings };
  }
  const completed = completeAmounts(document);
  if (completed.amountHt === null || completed.vatAmount === null || completed.amountTtc === null) {
    return { expenseId: null, expenseIds: [], reviewRequired: true, warnings: initialWarnings };
  }
  const credit = {
    amountHt: Math.abs(completed.amountHt),
    vatAmount: Math.abs(completed.vatAmount),
    amountTtc: Math.abs(completed.amountTtc),
  };
  const { data: alreadyApplied } = await admin
    .from('supplier_expenses')
    .select('id')
    .eq('workspace_id', job.workspace_id)
    .ilike('supplier', document.supplier)
    .contains('credit_note_numbers', [document.document_number])
    .limit(1)
    .maybeSingle();
  if (alreadyApplied) return { expenseId: alreadyApplied.id, expenseIds: [alreadyApplied.id], reviewRequired: initialReview, warnings: initialWarnings };

  const relatedInvoice = document.related_invoice_number ?? document.invoice_number;
  let matches: Array<Record<string, unknown>> = [];
  if (relatedInvoice) {
    const { data, error } = await admin
      .from('supplier_expenses')
      .select('*')
      .eq('workspace_id', job.workspace_id)
      .ilike('supplier', document.supplier)
      .eq('invoice_number', relatedInvoice)
      .limit(100);
    if (error) throw new Error(`CREDIT_INVOICE_LOOKUP_FAILED: ${error.message}`);
    matches = data ?? [];
  }
  if (matches.length === 0 && document.delivery_note_numbers.length > 0) {
    matches = await deliveryNoteMatches(job.workspace_id, document.supplier, document.delivery_note_numbers);
  }

  if (matches.length === 1) {
    await applyCreditToExpense(matches[0], document, credit, initialWarnings);
    return { expenseId: matches[0].id as string, expenseIds: [matches[0].id as string], reviewRequired: initialReview, warnings: initialWarnings };
  }
  if (matches.length > 1) {
    const groups = new Map<string, ExtractedItem[]>();
    for (const item of document.items) {
      const key = normalizeReference(item.delivery_note_number);
      if (key) groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    const matchKeys = matches.map((expense) => normalizeReference(
      stringValue(expense.delivery_note_number) ?? stringValue(expense.document_number),
    ));
    if (matchKeys.every((key) => groups.has(key))) {
      const ids: string[] = [];
      for (const [index, expense] of matches.entries()) {
        const itemCreditHt = Math.abs((groups.get(matchKeys[index]) ?? []).reduce(
          (sum, item) => sum + (item.amount_ht ?? 0), 0,
        ));
        const ratio = credit.amountHt > 0 ? itemCreditHt / credit.amountHt : 0;
        await applyCreditToExpense(expense, document, {
          amountHt: roundMoney(itemCreditHt),
          vatAmount: roundMoney(credit.vatAmount * ratio),
          amountTtc: roundMoney(itemCreditHt + credit.vatAmount * ratio),
        }, initialWarnings);
        ids.push(expense.id as string);
      }
      return { expenseId: ids[0] ?? null, expenseIds: ids, reviewRequired: initialReview, warnings: initialWarnings };
    }
    const warnings = uniqueStrings([...initialWarnings, 'Avoir lié à plusieurs BL sans ventilation fiable : contrôle manuel requis.']);
    return { expenseId: matches[0].id as string, expenseIds: matches.map((row) => row.id as string), reviewRequired: true, warnings };
  }

  const relationships = await resolveRelationships(job.workspace_id, document);
  const warnings = uniqueStrings([...initialWarnings, ...relationships.warnings, 'Aucune facture ou BL d origine retrouvé : avoir enregistré séparément.']);
  const row = {
    workspace_id: job.workspace_id,
    supplier: document.supplier,
    document_type: 'credit_note',
    document_number: document.document_number,
    invoice_number: relatedInvoice,
    invoice_date: document.document_date,
    amount_ht: -credit.amountHt,
    vat_amount: -credit.vatAmount,
    amount_ttc: -credit.amountTtc,
    gross_amount_ht: 0,
    gross_vat_amount: 0,
    gross_amount_ttc: 0,
    credit_amount_ht: credit.amountHt,
    credit_vat_amount: credit.vatAmount,
    credit_amount_ttc: credit.amountTtc,
    credit_note_numbers: [document.document_number],
    expected_payment_method: expectedPaymentMethod(document.payment_method),
    due_date: document.due_date,
    sites: uniqueStrings(document.items.map((item) => item.site)).join(' / ') || null,
    item_count: document.items.length,
    items: expenseItems(document.items),
    portal_date: document.document_date,
    observation: warnings.join(' · '),
    source_import: 'supplier-email-ai',
    accounting_status: 'credited',
    amount_basis: 'final',
    payment_method: document.payment_method,
    payment_status: document.payment_is_confirmed ? 'refunded' : 'unknown',
    analysis_confidence: document.confidence,
    needs_review: true,
    document_review_required: true,
    payment_confirmation_required: false,
    lead_id: relationships.primary?.leadId ?? null,
    case_id: relationships.primary?.caseId ?? null,
    contact_id: relationships.primary?.contactId ?? null,
    customer_invoice_id: relationships.primary?.customerInvoiceId ?? null,
    analysis_metadata: { vehicle_registration: document.vehicle_registration, warnings },
    ...sourceFields(job),
  };
  const { data: inserted, error } = await admin.from('supplier_expenses').insert(row).select('id').single();
  if (error) throw new Error(`CREDIT_WRITE_FAILED: ${error.message}`);
  await autoAllocateExpense(
    job.workspace_id,
    inserted.id,
    document.items,
    document.vehicle_registration,
    relationships.byRegistration,
  );
  return { expenseId: inserted.id, expenseIds: [inserted.id], reviewRequired: true, warnings };
}

async function applyAccounting(job: SupplierDocumentJob, document: ExtractedDocument): Promise<AccountingResult> {
  const validation = validateExtraction(document);
  if (document.document_type === 'other') {
    return { expenseId: null, expenseIds: [], reviewRequired: false, warnings: validation.warnings };
  }
  if (document.document_type === 'delivery_note') {
    return processDeliveryNote(job, document, validation.reviewRequired, validation.warnings);
  }
  if (document.document_type === 'invoice') {
    return processInvoice(job, document, validation.reviewRequired, validation.warnings);
  }
  return processCreditNote(job, document, validation.reviewRequired, validation.warnings);
}

async function persistAnalysis(
  job: SupplierDocumentJob,
  analysis: AnalysisResult,
  result: AccountingResult,
): Promise<{ id: string; status: JobStatus }> {
  const status: JobStatus = analysis.document.document_type === 'other'
    ? 'ignored'
    : result.reviewRequired ? 'review_required' : 'completed';
  const amounts = completeAmounts(analysis.document);
  const row = {
    workspace_id: job.workspace_id,
    communication_id: job.communication_id,
    attachment_id: job.attachment_id,
    storage_path: job.storage_path,
    filename: job.filename,
    file_sha256: analysis.fileSha256,
    supplier_expense_id: result.expenseId,
    linked_expense_ids: result.expenseIds,
    status,
    model: analysis.model,
    document_type: analysis.document.document_type,
    supplier: analysis.document.supplier,
    document_number: analysis.document.document_number,
    document_date: analysis.document.document_date,
    amount_ht: amounts.amountHt,
    vat_amount: amounts.vatAmount,
    amount_ttc: amounts.amountTtc,
    confidence: analysis.document.confidence,
    extracted_data: analysis.document,
    warnings: result.warnings,
    input_tokens: analysis.inputTokens,
    output_tokens: analysis.outputTokens,
    estimated_cost_usd: analysis.estimatedCostUsd,
  };
  const { data, error } = await admin.from('supplier_document_analyses').upsert(row, {
    onConflict: 'workspace_id,communication_id,attachment_id',
  }).select('id').single();
  if (error) throw new Error(`ANALYSIS_WRITE_FAILED: ${error.message}`);
  return { id: data.id as string, status };
}

async function notifyReview(job: SupplierDocumentJob, document: ExtractedDocument, warnings: string[]) {
  const { data: recipients, error } = await admin
    .from('profiles')
    .select('id')
    .eq('workspace_id', job.workspace_id)
    .in('role', ['admin', 'manager', 'accountant']);
  if (error || !recipients?.length) return;
  const body = [
    document.supplier ?? job.supplier_hint ?? 'Fournisseur inconnu',
    document.document_number ?? job.filename,
    warnings[0] ?? 'Contrôle comptable requis',
  ].join(' — ').slice(0, 500);
  const dedupKey = `supplier-document-review-${job.id}`;
  const { data: existing } = await admin
    .from('notifications')
    .select('user_id')
    .eq('workspace_id', job.workspace_id)
    .eq('dedup_key', dedupKey);
  const existingUsers = new Set((existing ?? []).map((notification) => notification.user_id as string));
  const rows = recipients.filter((recipient) => !existingUsers.has(recipient.id as string)).map((recipient) => ({
    workspace_id: job.workspace_id,
    user_id: recipient.id,
    title: 'Document fournisseur à contrôler',
    body,
    type: 'finance',
    link: '/finance/fournisseurs',
    dedup_key: dedupKey,
  }));
  if (rows.length === 0) return;
  const { error: insertError } = await admin.from('notifications').insert(rows);
  if (insertError && insertError.code !== '23505') {
    console.error('SUPPLIER_REVIEW_NOTIFICATION_FAILED', insertError.message);
  }
}

async function markJob(
  jobId: string,
  status: JobStatus,
  values: Record<string, unknown> = {},
) {
  const { error } = await admin.from('supplier_document_jobs').update({
    status,
    ...values,
    updated_at: new Date().toISOString(),
  }).eq('id', jobId);
  if (error) throw new Error(`JOB_UPDATE_FAILED: ${error.message}`);
}

async function processJob(job: SupplierDocumentJob, force: boolean) {
  const attempts = job.attempts + 1;
  const { data: claimed, error: claimError } = await admin
    .from('supplier_document_jobs')
    .update({
      status: 'processing',
      attempts,
      started_at: new Date().toISOString(),
      completed_at: null,
      last_error: null,
    })
    .eq('id', job.id)
    .in('status', ['pending', 'failed'])
    .select('*')
    .maybeSingle();
  if (claimError) throw new Error(`JOB_CLAIM_FAILED: ${claimError.message}`);
  if (!claimed) return { skipped: true, id: job.id };

  try {
    const analysis = await analyzePdf(claimed as SupplierDocumentJob, force);
    const accounting = await applyAccounting(claimed as SupplierDocumentJob, analysis.document);
    const persisted = await persistAnalysis(claimed as SupplierDocumentJob, analysis, accounting);
    await markJob(job.id, persisted.status, {
      analysis_id: persisted.id,
      completed_at: new Date().toISOString(),
      last_error: null,
    });
    if (persisted.status === 'review_required') {
      await notifyReview(claimed as SupplierDocumentJob, analysis.document, accounting.warnings);
    }
    return {
      skipped: false,
      id: job.id,
      status: persisted.status,
      documentType: analysis.document.document_type,
      expenseIds: accounting.expenseIds,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await admin.from('supplier_document_analyses').upsert({
      workspace_id: job.workspace_id,
      communication_id: job.communication_id,
      attachment_id: job.attachment_id,
      storage_path: job.storage_path,
      filename: job.filename,
      status: 'failed',
      document_type: 'other',
      supplier: job.supplier_hint,
      extracted_data: {},
      warnings: [message.slice(0, 500)],
    }, { onConflict: 'workspace_id,communication_id,attachment_id' });
    await markJob(job.id, 'failed', {
      last_error: message.slice(0, 500),
      available_at: backoffDate(attempts),
      completed_at: null,
    });
    return { skipped: false, id: job.id, status: 'failed', error: message };
  }
}

async function loadJobs(workspaceId: string | null, jobId: string | null): Promise<SupplierDocumentJob[]> {
  if (jobId) {
    let query = admin.from('supplier_document_jobs').select('*').eq('id', jobId);
    if (workspaceId) query = query.eq('workspace_id', workspaceId);
    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(`JOB_READ_FAILED: ${error.message}`);
    return data ? [data as SupplierDocumentJob] : [];
  }
  const { data, error } = await admin
    .from('supplier_document_jobs')
    .select('*')
    .in('status', ['pending', 'failed'])
    .lt('attempts', MAX_ATTEMPTS)
    .lte('available_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);
  if (error) throw new Error(`JOBS_READ_FAILED: ${error.message}`);
  return (data ?? []) as SupplierDocumentJob[];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method Not Allowed' }, 405);

  try {
    const automation = automationAuthorized(req);
    const workspaceId = automation ? null : await authenticatedWorkspace(req);
    if (!automation && !workspaceId) return jsonResponse({ error: 'Unauthorized' }, 401);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const jobId = stringValue(body.jobId);
    const force = body.force === true;
    if (!automation && !jobId) return jsonResponse({ error: 'jobId requis' }, 400);
    const jobs = await loadJobs(workspaceId, jobId);
    const results = [];
    for (const job of jobs) results.push(await processJob(job, force));
    return jsonResponse({ processed: results.filter((row) => !row.skipped).length, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === 'OPENAI_NOT_CONFIGURED' ? 503 : 500;
    return jsonResponse({ error: message }, status);
  }
});
