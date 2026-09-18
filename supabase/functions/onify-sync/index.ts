import {
  adminClient, automationAuthorized, corsHeaders, jsonResponse, requireAdmin, sha256,
} from '../_shared/google-ads.ts';

const ONIFY_API = 'https://app.onify.fr/api';
const PAGE_SIZE = 100;
const NOTES_PAGE_SIZE = 25;

type Json = Record<string, unknown>;

type Pagination = {
  page?: number;
  total_pages?: number;
  has_next?: boolean;
};

type Page<T> = {
  items: T[];
  pagination: Pagination;
};

type OnifyCustomer = Json & {
  id: string | number;
  external_id?: string | null;
  prenom?: string | null;
  nom?: string | null;
  entreprise?: string | null;
  email?: string | null;
  telephones?: string[] | null;
  adresse?: { rue?: string; cp?: string; ville?: string; pays?: string } | null;
  statut_tunnel?: { id?: string | number; libelle?: string } | null;
  tags?: unknown[] | null;
  source?: string | null;
  date_ajout?: string | null;
};

type OnifyInvoice = Json & {
  invoice_id: string | number;
  contact_id?: string | number | null;
  code?: string | null;
  statut?: string | null;
  montant_ht?: number;
  montant_tva?: number;
  montant_ttc?: number;
  montant_regle?: number;
  reste_du?: number;
  date_facture?: string | null;
  date_echeance?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  objet?: string | null;
  type?: string | null;
  lignes?: unknown[] | null;
  vehicule?: Json | null;
  totaux?: Json | null;
};

type OnifyQuote = Json & {
  quote_id: string | number;
  contact_id?: string | number | null;
  code?: string | null;
  statut?: string | null;
  montant_ht?: number;
  montant_tva?: number;
  montant_ttc?: number;
  signe?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  objet?: string | null;
  lignes?: unknown[] | null;
  vehicule?: Json | null;
};

type OnifyCredit = Json & {
  credit_id: string | number;
  invoice_id?: string | number | null;
  contact_id?: string | number | null;
  code?: string | null;
  invoice_code?: string | null;
  statut?: string | null;
  montant_ttc?: number;
  date_facture?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  objet?: string | null;
  type?: string | null;
  totaux?: Json | null;
};

type OnifyCall = Json & {
  call_id: string | number;
  contact_id?: string | number | null;
  direction?: string;
  statut?: string;
  started_at?: string | null;
  ended_at?: string | null;
  duree_sec?: number | null;
  notes?: string | null;
  tags?: unknown[] | null;
};

type SyncCounts = {
  contacts: number;
  /** Leads ayant recu l'adresse de leur contact. */
  leadAddresses: number;
  notes: number;
  calls: number;
  invoices: number;
  quotes: number;
  credits: number;
  notesRemaining: boolean;
};

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  return cleaned || null;
}

function numeric(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizePhone(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length > 9 ? digits.slice(-9) : digits;
}

function normalizeEmail(value: unknown): string {
  return String(value ?? '').trim().toLocaleLowerCase('fr-FR');
}

function onifyParams(params: Record<string, string | number | undefined>): string {
  const result = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') result.set(key, String(value));
  }
  const query = result.toString();
  return query ? `?${query}` : '';
}

async function onifyGet<T>(
  token: string,
  endpoint: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  const response = await fetch(`${ONIFY_API}${endpoint}${onifyParams(params)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const responseText = await response.text();
  let payload: Json = {};
  try {
    payload = responseText ? JSON.parse(responseText) as Json : {};
  } catch {
    payload = { message: responseText.slice(0, 1000) };
  }
  if (!response.ok || payload.success === false) {
    throw new Error(String(payload.message ?? `Onify HTTP ${response.status}`));
  }
  return payload as T;
}

function unwrapPage<T>(payload: Json): Page<T> {
  const data = payload.data;
  if (Array.isArray(data)) return { items: data as T[], pagination: {} };
  const envelope = data && typeof data === 'object' ? data as Json : {};
  return {
    items: Array.isArray(envelope.data) ? envelope.data as T[] : [],
    pagination: (envelope.pagination ?? {}) as Pagination,
  };
}

async function listPage<T>(
  token: string,
  endpoint: string,
  page: number,
  perPage: number,
  extra: Record<string, string | number | undefined> = {},
): Promise<Page<T>> {
  const payload = await onifyGet<Json>(token, endpoint, {
    ...extra, page, per_page: perPage,
  });
  return unwrapPage<T>(payload);
}

async function listAll<T>(
  token: string,
  endpoint: string,
  updatedSince?: string,
): Promise<T[]> {
  const items: T[] = [];
  let page = 1;
  let hasNext = true;
  while (hasNext && page <= 100) {
    const result = await listPage<T>(token, endpoint, page, PAGE_SIZE, {
      updated_since: updatedSince,
    });
    items.push(...result.items);
    hasNext = result.pagination.has_next === true
      || (result.pagination.total_pages != null && page < result.pagination.total_pages);
    page++;
  }
  if (hasNext) throw new Error(`Onify: pagination incomplete pour ${endpoint}`);
  return items;
}

async function onifyToken(workspaceId: string): Promise<string> {
  const secretName = `onify_api_key_${workspaceId}`;
  const { data } = await adminClient.rpc('vault_read_secret', { secret_name: secretName });
  if (data) return String(data);

  // Amorçage unique depuis les secrets chiffrés de la fonction. Dès la
  // première synchronisation, la clé est également conservée dans Vault.
  const bootstrap = Deno.env.get('ONIFY_API_KEY') ?? '';
  if (!bootstrap) throw new Error('Cle API Onify manquante');
  const { error } = await adminClient.rpc('vault_create_secret', {
    new_secret_name: secretName,
    new_secret: bootstrap,
  });
  if (error) throw new Error(`Stockage Vault Onify impossible : ${error.message}`);
  return bootstrap;
}

async function ensureConnection(workspaceId: string) {
  const { data, error } = await adminClient
    .from('integration_connections')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('provider', 'onify')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return data;

  const { data: created, error: createError } = await adminClient
    .from('integration_connections')
    .insert({
      workspace_id: workspaceId,
      provider: 'onify',
      name: 'Onify',
      status: 'not_configured',
      settings: { direction: 'onify_to_crm', api_key_ref: 'stored' },
    })
    .select('*')
    .single();
  if (createError) throw new Error(createError.message);
  return created;
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

async function upsertBatches(
  table: string,
  rows: Json[],
  onConflict: string,
): Promise<void> {
  for (const batch of chunks(rows, 300)) {
    if (!batch.length) continue;
    const { error } = await adminClient.from(table).upsert(batch, { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function syncContacts(
  workspaceId: string,
  customers: OnifyCustomer[],
): Promise<Map<string, string>> {
  const { data: existing, error } = await adminClient
    .from('contacts')
    .select([
      'id', 'first_name', 'last_name', 'phone', 'email', 'address', 'city', 'postal_code',
      'onify_customer_id', 'onify_external_id', 'onify_source', 'onify_stage', 'onify_tags',
    ].join(','))
    .eq('workspace_id', workspaceId)
    .limit(10000);
  if (error) throw new Error(error.message);

  const byOnifyId = new Map((existing ?? [])
    .filter((row) => row.onify_customer_id)
    .map((row) => [String(row.onify_customer_id), row]));
  const byPhone = new Map((existing ?? [])
    .filter((row) => normalizePhone(row.phone))
    .map((row) => [normalizePhone(row.phone), row]));
  const byEmail = new Map((existing ?? [])
    .filter((row) => normalizeEmail(row.email))
    .map((row) => [normalizeEmail(row.email), row]));
  const updateRows: Json[] = [];
  const insertRows: Json[] = [];
  const syncedAt = new Date().toISOString();

  // Une meme fiche Onify peut revenir deux fois si la pagination glisse
  // pendant la lecture. Deux lignes pour un meme identifiant dans un lot,
  // et Postgres refuse tout le lot.
  const uniques = new Map<string, OnifyCustomer>();
  for (const customer of customers) uniques.set(String(customer.id), customer);

  // Plusieurs fiches Onify peuvent partager un telephone ou un email. Une
  // ligne CRM existante ne peut absorber qu'un seul identifiant Onify : les
  // autres fiches restent distinctes afin de conserver leurs documents et
  // appels sans provoquer deux mises a jour du meme contact dans un batch.
  //
  // Deux passes, et l'ordre compte. Une fiche rapprochee par telephone
  // pouvait reclamer un contact avant que la fiche qui le possede par
  // identifiant ne soit traitee : deux mises a jour visaient la meme ligne,
  // et la synchronisation entiere echouait -- « cannot affect row a second
  // time ». Les correspondances exactes sont donc reservees en premier ; le
  // rapprochement par identite ne se fait que sur ce qui reste.
  const claimedContactIds = new Set<string>();
  const exactByCustomer = new Map<string, (typeof existing)[number]>();
  for (const [onifyId] of uniques) {
    const exact = byOnifyId.get(onifyId);
    if (exact) {
      exactByCustomer.set(onifyId, exact);
      claimedContactIds.add(exact.id);
    }
  }

  for (const customer of uniques.values()) {
    const onifyId = String(customer.id);
    const phone = cleanText(customer.telephones?.[0]);
    const email = cleanText(customer.email);
    const exactMatch = exactByCustomer.get(onifyId);
    const identityMatch = exactMatch ? undefined : (
      (phone ? byPhone.get(normalizePhone(phone)) : undefined)
      ?? (email ? byEmail.get(normalizeEmail(email)) : undefined)
    );
    const match = exactMatch
      ?? (identityMatch && !claimedContactIds.has(identityMatch.id) ? identityMatch : undefined);
    const address = customer.adresse ?? {};
    const shared = {
      workspace_id: workspaceId,
      first_name: cleanText(customer.prenom) ?? match?.first_name ?? null,
      last_name: cleanText(customer.nom) ?? cleanText(customer.entreprise) ?? match?.last_name ?? null,
      phone: phone ?? match?.phone ?? null,
      email: email ?? match?.email ?? null,
      address: cleanText(address.rue) ?? match?.address ?? null,
      postal_code: cleanText(address.cp) ?? match?.postal_code ?? null,
      city: cleanText(address.ville) ?? match?.city ?? null,
      onify_customer_id: onifyId,
      onify_external_id: cleanText(customer.external_id),
      onify_source: cleanText(customer.source),
      onify_stage: cleanText(customer.statut_tunnel?.libelle),
      onify_tags: Array.isArray(customer.tags) ? customer.tags : [],
      onify_synced_at: syncedAt,
    };
    if (match) {
      claimedContactIds.add(match.id);
      updateRows.push({ ...shared, id: match.id });
    } else {
      insertRows.push(shared);
    }
  }

  await upsertBatches('contacts', updateRows, 'id');
  await upsertBatches('contacts', insertRows, 'workspace_id,onify_customer_id');

  const { data: synced, error: syncedError } = await adminClient
    .from('contacts')
    .select('id, onify_customer_id')
    .eq('workspace_id', workspaceId)
    .not('onify_customer_id', 'is', null)
    .limit(10000);
  if (syncedError) throw new Error(syncedError.message);
  return new Map((synced ?? []).map((row) => [String(row.onify_customer_id), row.id]));
}

function invoiceStatus(status: unknown): string {
  const value = String(status ?? '').toLocaleLowerCase('fr-FR');
  if (value.includes('partiellement')) return 'partial';
  if (value.includes('pay')) return 'paid';
  if (value.includes('envoy')) return 'sent';
  if (value.includes('annul')) return 'cancelled';
  return 'draft';
}

function quoteStatus(status: unknown, signed: boolean | undefined): string {
  if (signed) return 'accepted';
  const value = String(status ?? '').toLocaleLowerCase('fr-FR');
  if (value.includes('termin') || value.includes('accept')) return 'accepted';
  if (value.includes('refus')) return 'rejected';
  if (value.includes('expir')) return 'expired';
  if (value.includes('envoy')) return 'sent';
  return 'draft';
}

function vatRate(totalHt: number, vat: number): number {
  if (!totalHt) return 20;
  return Math.round((vat / totalHt) * 10_000) / 100;
}

async function syncInvoices(
  workspaceId: string,
  invoices: OnifyInvoice[],
  contactIds: Map<string, string>,
): Promise<Map<string, string>> {
  const syncedAt = new Date().toISOString();
  const rows = invoices.map((invoice) => {
    const totalHt = numeric(invoice.montant_ht);
    const totals = invoice.totaux ?? {};
    return {
      workspace_id: workspaceId,
      contact_id: invoice.contact_id == null ? null : contactIds.get(String(invoice.contact_id)) ?? null,
      invoice_number: cleanText(invoice.code) ?? `ONIFY-${invoice.invoice_id}`,
      amount_ht: totalHt,
      tva_rate: vatRate(totalHt, numeric(invoice.montant_tva)),
      amount_ttc: numeric(invoice.montant_ttc),
      franchise_amount: numeric(totals.franchise_amount),
      insurance_amount: numeric(totals.du_assurance),
      estimated_margin: numeric(totals.margin_amount),
      amount_paid: numeric(invoice.montant_regle),
      remaining_amount: numeric(invoice.reste_du),
      issue_date: invoice.date_facture ?? invoice.created_at ?? syncedAt,
      due_date: invoice.date_echeance ?? null,
      status: invoiceStatus(invoice.statut),
      onify_invoice_id: String(invoice.invoice_id),
      onify_payload: {
        object: invoice.objet ?? null,
        type: invoice.type ?? null,
        lines: invoice.lignes ?? [],
        vehicle: invoice.vehicule ?? null,
        totals,
        onify_updated_at: invoice.updated_at ?? null,
      },
      onify_synced_at: syncedAt,
    };
  });
  await upsertBatches('invoices', rows, 'workspace_id,onify_invoice_id');
  const { data, error } = await adminClient
    .from('invoices')
    .select('id, onify_invoice_id')
    .eq('workspace_id', workspaceId)
    .not('onify_invoice_id', 'is', null)
    .limit(10000);
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((row) => [String(row.onify_invoice_id), row.id]));
}

async function syncQuotes(
  workspaceId: string,
  quotes: OnifyQuote[],
  contactIds: Map<string, string>,
): Promise<void> {
  const syncedAt = new Date().toISOString();
  const rows = quotes.map((quote) => {
    const totalHt = numeric(quote.montant_ht);
    return {
      workspace_id: workspaceId,
      contact_id: quote.contact_id == null ? null : contactIds.get(String(quote.contact_id)) ?? null,
      quote_number: cleanText(quote.code) ?? `ONIFY-${quote.quote_id}`,
      amount_ht: totalHt,
      tva_rate: vatRate(totalHt, numeric(quote.montant_tva)),
      amount_ttc: numeric(quote.montant_ttc),
      status: quoteStatus(quote.statut, quote.signe),
      onify_quote_id: String(quote.quote_id),
      onify_payload: {
        object: quote.objet ?? null,
        lines: quote.lignes ?? [],
        vehicle: quote.vehicule ?? null,
        signed: quote.signe ?? false,
        onify_updated_at: quote.updated_at ?? null,
      },
      onify_synced_at: syncedAt,
    };
  });
  await upsertBatches('quotes', rows, 'workspace_id,onify_quote_id');
}

async function syncCredits(
  workspaceId: string,
  credits: OnifyCredit[],
  contactIds: Map<string, string>,
  invoiceIds: Map<string, string>,
): Promise<void> {
  const syncedAt = new Date().toISOString();
  const rows = credits.map((credit) => ({
    workspace_id: workspaceId,
    contact_id: credit.contact_id == null ? null : contactIds.get(String(credit.contact_id)) ?? null,
    invoice_id: credit.invoice_id == null ? null : invoiceIds.get(String(credit.invoice_id)) ?? null,
    onify_credit_id: String(credit.credit_id),
    credit_number: cleanText(credit.code) ?? `ONIFY-AVOIR-${credit.credit_id}`,
    invoice_number: cleanText(credit.invoice_code),
    object: cleanText(credit.objet),
    status: cleanText(credit.statut),
    amount_ttc: numeric(credit.montant_ttc),
    issue_date: credit.date_facture ?? credit.created_at ?? null,
    onify_payload: {
      type: credit.type ?? null,
      totals: credit.totaux ?? null,
      onify_updated_at: credit.updated_at ?? null,
    },
    onify_synced_at: syncedAt,
  }));
  await upsertBatches('onify_credit_notes', rows, 'workspace_id,onify_credit_id');
}

async function syncCalls(
  workspaceId: string,
  calls: OnifyCall[],
  contactIds: Map<string, string>,
): Promise<void> {
  const rows = calls.map((call) => {
    const inbound = call.direction === 'inbound';
    const missed = call.statut === 'no_answer';
    return {
      workspace_id: workspaceId,
      contact_id: call.contact_id == null ? null : contactIds.get(String(call.contact_id)) ?? null,
      type: inbound ? (missed ? 'call_missed' : 'call_inbound') : 'call_outbound',
      direction: inbound ? 'inbound' : 'outbound',
      status: missed ? 'missed' : 'answered',
      content: cleanText(call.notes),
      subject: 'Appel Onify',
      duration_seconds: numeric(call.duree_sec),
      provider: 'onify',
      external_id: String(call.call_id),
      created_at: call.started_at ?? call.ended_at ?? new Date().toISOString(),
    };
  });
  await upsertBatches('communications', rows, 'workspace_id,provider,external_id');
}

function noteContent(note: Json): string | null {
  for (const key of ['content', 'contenu', 'note', 'texte', 'description']) {
    const value = cleanText(note[key]);
    if (value) return value;
  }
  return null;
}

async function syncNotesPage(
  workspaceId: string,
  token: string,
  pageNumber: number,
  contactIds: Map<string, string>,
): Promise<{ count: number; nextPage: number; remaining: boolean }> {
  const customerPage = await listPage<OnifyCustomer>(
    token, '/crm/customers', pageNumber, NOTES_PAGE_SIZE,
  );
  const rows: Json[] = [];
  const syncedAt = new Date().toISOString();

  const pages = await Promise.all(customerPage.items.map(async (customer) => ({
    customer,
    notes: (await listPage<Json>(token, `/crm/customers/${customer.id}/notes`, 1, 100)).items,
  })));
  for (const { customer, notes } of pages) {
    const contactId = contactIds.get(String(customer.id));
    if (!contactId) continue;
    for (const note of notes) {
      const content = noteContent(note);
      if (!content) continue;
      const createdAt = cleanText(note.created_at) ?? cleanText(note.date_creation)
        ?? cleanText(note.date) ?? syncedAt;
      const sourceId = note.id ?? note.note_id;
      const externalId = sourceId == null
        ? await sha256(`${customer.id}|${createdAt}|${content}`)
        : String(sourceId);
      rows.push({
        workspace_id: workspaceId,
        contact_id: contactId,
        content,
        provider: 'onify',
        external_id: externalId,
        onify_synced_at: syncedAt,
        created_at: createdAt,
      });
    }
  }
  await upsertBatches('notes', rows, 'workspace_id,provider,external_id');
  const remaining = customerPage.pagination.has_next === true
    || (customerPage.pagination.total_pages != null
      && pageNumber < customerPage.pagination.total_pages);
  return { count: rows.length, nextPage: remaining ? pageNumber + 1 : 1, remaining };
}

async function syncWorkspace(workspaceId: string): Promise<SyncCounts> {
  const connection = await ensureConnection(workspaceId);
  const settings = (connection.settings ?? {}) as Json;
  const token = await onifyToken(workspaceId);
  const lastSync = cleanText(settings.last_sync_at);
  const updatedSince = lastSync
    ? new Date(new Date(lastSync).getTime() - 5 * 60_000).toISOString()
    : undefined;

  const [customers, invoices, quotes, credits, calls] = await Promise.all([
    listAll<OnifyCustomer>(token, '/crm/customers', updatedSince),
    listAll<OnifyInvoice>(token, '/billing/invoices', updatedSince),
    listAll<OnifyQuote>(token, '/billing/quotes', updatedSince),
    listAll<OnifyCredit>(token, '/billing/credits', updatedSince),
    listAll<OnifyCall>(token, '/callify/calls', updatedSince),
  ]);

  const contactIds = await syncContacts(workspaceId, customers);

  // L'adresse arrive sur le contact ; le travail se fait dans la fiche du
  // lead. Sans ce report, un lead ne au webhook garde « CP Ville » alors que
  // le client a donne sa rue chez Onify. Ne remplit que ce qui manque.
  const { data: leadAddresses, error: propagationError } = await adminClient
    .rpc('propager_adresses_contacts', { p_workspace_id: workspaceId });
  if (propagationError) throw new Error(`propagation adresses: ${propagationError.message}`);
  // Une synchronisation incrementale peut ne renvoyer aucun contact. On relit
  // alors la correspondance complete nécessaire aux documents et aux appels.
  if (!contactIds.size) {
    const { data, error } = await adminClient.from('contacts')
      .select('id, onify_customer_id')
      .eq('workspace_id', workspaceId)
      .not('onify_customer_id', 'is', null)
      .limit(10000);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) contactIds.set(String(row.onify_customer_id), row.id);
  }
  const invoiceIds = await syncInvoices(workspaceId, invoices, contactIds);
  await syncQuotes(workspaceId, quotes, contactIds);
  await syncCredits(workspaceId, credits, contactIds, invoiceIds);
  await syncCalls(workspaceId, calls, contactIds);
  const notes = await syncNotesPage(
    workspaceId,
    token,
    Math.max(1, numeric(settings.notes_page) || 1),
    contactIds,
  );

  const counts: SyncCounts = {
    contacts: customers.length,
    leadAddresses: Number(leadAddresses ?? 0),
    notes: notes.count,
    calls: calls.length,
    invoices: invoices.length,
    quotes: quotes.length,
    credits: credits.length,
    notesRemaining: notes.remaining,
  };
  const { data: fresh, error: freshError } = await adminClient
    .from('integration_connections')
    .select('settings')
    .eq('id', connection.id)
    .single();
  if (freshError) throw new Error(freshError.message);
  const { error: updateError } = await adminClient
    .from('integration_connections')
    .update({
      status: 'connected',
      last_success_at: new Date().toISOString(),
      last_error: null,
      settings: {
        ...((fresh.settings ?? {}) as Json),
        direction: 'onify_to_crm',
        api_key_ref: 'stored',
        last_sync_at: new Date().toISOString(),
        notes_page: notes.nextPage,
        notes_remaining: notes.remaining,
        last_counts: counts,
      },
    })
    .eq('id', connection.id);
  if (updateError) throw new Error(updateError.message);
  return counts;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method Not Allowed' }, 405);

  try {
    let workspaceIds: string[] = [];
    if (automationAuthorized(req)) {
      const { data, error } = await adminClient
        .from('integration_connections')
        .select('workspace_id')
        .eq('provider', 'onify');
      if (error) throw new Error(error.message);
      workspaceIds = [...new Set((data ?? []).map((row) => row.workspace_id))];
    } else {
      workspaceIds = [(await requireAdmin(req)).workspaceId];
    }

    const results = [];
    for (const workspaceId of workspaceIds) {
      try {
        results.push({ workspaceId, success: true, ...(await syncWorkspace(workspaceId)) });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await adminClient.from('integration_connections')
          .update({ status: 'error', last_error: message })
          .eq('workspace_id', workspaceId)
          .eq('provider', 'onify');
        results.push({ workspaceId, success: false, error: message });
      }
    }

    const failed = results.filter((result) => !result.success);
    return jsonResponse({
      success: failed.length === 0,
      results,
      error: failed.length ? failed.map((result) => result.error).join(' | ') : null,
    }, failed.length ? 400 : 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === 'UNAUTHORIZED' ? 401 : message === 'FORBIDDEN' ? 403 : 500;
    return jsonResponse({ success: false, error: message }, status);
  }
});
