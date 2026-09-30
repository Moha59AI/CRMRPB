import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import {
  fetchOnifyInvoicePdf,
  ONIFY_INVOICE_BUCKET,
  onifyInvoiceStoragePath,
  readOnifyToken,
  storeOnifyInvoicePdf,
} from '../_shared/onify-invoices.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const admin = createClient(supabaseUrl, serviceRoleKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type InvoiceRow = {
  id: string;
  invoice_number: string;
  onify_invoice_id: string | null;
  onify_pdf_path: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function cleanText(value: unknown, max = 200): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function disposition(value: unknown): 'inline' | 'attachment' {
  return value === 'attachment' ? 'attachment' : 'inline';
}

function filename(value: string): string {
  const cleaned = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._ -]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 120);
  return `${cleaned || 'facture-onify'}.pdf`;
}

async function requireFinanceUser(req: Request): Promise<{ workspaceId: string }> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error('UNAUTHORIZED');

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('workspace_id, role')
    .eq('id', data.user.id)
    .maybeSingle();
  if (profileError || !profile) throw new Error('FORBIDDEN');
  if (!['admin', 'manager', 'accountant'].includes(profile.role)) throw new Error('FORBIDDEN');
  return { workspaceId: profile.workspace_id as string };
}

async function cachedPdf(path: string): Promise<Blob | null> {
  const { data, error } = await admin.storage.from(ONIFY_INVOICE_BUCKET).download(path);
  if (error || !data) return null;
  return data;
}

function pdfResponse(blob: Blob, invoiceNumber: string, mode: 'inline' | 'attachment') {
  const safeName = filename(invoiceNumber);
  return new Response(blob.stream(), {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/pdf',
      'Content-Length': String(blob.size),
      'Content-Disposition': `${mode}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  try {
    const { workspaceId } = await requireFinanceUser(req);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const invoiceId = cleanText(body.invoice_id, 80);
    const mode = disposition(body.disposition);
    if (!invoiceId) throw new Error('FACTURE_INVALIDE');

    const { data, error } = await admin
      .from('invoices')
      .select('id, invoice_number, onify_invoice_id, onify_pdf_path')
      .eq('id', invoiceId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const invoice = data as InvoiceRow | null;
    if (!invoice) throw new Error('FACTURE_INTROUVABLE');
    if (!invoice.onify_invoice_id) throw new Error('FACTURE_NON_ONIFY');

    if (invoice.onify_pdf_path) {
      const cached = await cachedPdf(invoice.onify_pdf_path);
      if (cached) return pdfResponse(cached, invoice.invoice_number, mode);
    }

    const token = await readOnifyToken(admin, workspaceId);
    const bytes = await fetchOnifyInvoicePdf(token, invoice.onify_invoice_id);
    const path = onifyInvoiceStoragePath(workspaceId, invoice.id, invoice.invoice_number);
    await storeOnifyInvoicePdf(admin, path, bytes);

    const { error: updateError } = await admin.from('invoices').update({
      onify_pdf_path: path,
      onify_pdf_synced_at: new Date().toISOString(),
      onify_pdf_checked_at: new Date().toISOString(),
      onify_pdf_error: null,
    }).eq('id', invoice.id).eq('workspace_id', workspaceId);
    if (updateError) throw new Error(updateError.message);

    return pdfResponse(new Blob([bytes], { type: 'application/pdf' }), invoice.invoice_number, mode);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === 'UNAUTHORIZED'
      ? 401
      : message === 'FORBIDDEN'
        ? 403
        : message.endsWith('INTROUVABLE') || message === 'FACTURE_NON_ONIFY'
          ? 404
          : message.startsWith('ONIFY_PDF_HTTP_')
              || message.startsWith('ONIFY_PDF_INDISPONIBLE')
              || message.startsWith('STOCKAGE_PDF_ONIFY')
            ? 502
            : 400;
    const friendly = message === 'FACTURE_NON_ONIFY'
      ? "Cette facture ne provient pas d'Onify."
      : message.startsWith('ONIFY_PDF_HTTP_')
        ? `Onify n'a pas fourni le PDF (${message.replace('ONIFY_PDF_HTTP_', 'HTTP ')}).`
        : message.startsWith('ONIFY_PDF_INDISPONIBLE')
          ? "Onify ne permet pas encore de récupérer automatiquement ce PDF."
        : message === 'ONIFY_PDF_ABSENT' || message === 'ONIFY_PDF_INVALIDE'
          ? "Onify n'a pas renvoyé un PDF valide."
          : message;
    return json({ error: friendly }, status);
  }
});
