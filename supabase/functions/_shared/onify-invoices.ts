const ONIFY_API = 'https://app.onify.fr/api';
const ONIFY_APP = 'https://app.onify.fr';

export const ONIFY_INVOICE_BUCKET = 'onify-invoices';
export const ONIFY_INVOICE_PDF_MAX_BYTES = 25 * 1024 * 1024;

type Json = Record<string, unknown>;

type StorageAdmin = {
  from: (bucket: string) => {
    upload: (
      path: string,
      body: Uint8Array,
      options: { contentType: string; upsert: boolean },
    ) => Promise<{ error: { message: string } | null }>;
  };
};

export type OnifyAdminClient = {
  rpc: (
    functionName: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  storage: StorageAdmin;
};

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  return cleaned || null;
}

function bytesArePdf(bytes: Uint8Array): boolean {
  return bytes.length >= 5
    && bytes[0] === 0x25
    && bytes[1] === 0x50
    && bytes[2] === 0x44
    && bytes[3] === 0x46
    && bytes[4] === 0x2d;
}

function decodeBase64(value: string): Uint8Array | null {
  const normalized = value.replace(/^data:application\/pdf;base64,/i, '').trim();
  if (!normalized || !/^[a-z0-9+/=\r\n]+$/i.test(normalized)) return null;
  try {
    const decoded = atob(normalized.replace(/\s/g, ''));
    const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
    return bytesArePdf(bytes) ? bytes : null;
  } catch {
    return null;
  }
}

function pdfCandidate(payload: Json): string | null {
  const data = payload.data && typeof payload.data === 'object'
    ? payload.data as Json
    : {};
  for (const candidate of [
    payload.pdf_url,
    payload.download_url,
    payload.url,
    payload.pdf,
    payload.base64,
    data.pdf_url,
    data.download_url,
    data.url,
    data.pdf,
    data.base64,
  ]) {
    const text = cleanText(candidate);
    if (text) return text;
  }
  return null;
}

function validateOnifyUrl(value: string): URL {
  const url = new URL(value, ONIFY_API);
  if (url.protocol !== 'https:') throw new Error('ONIFY_PDF_URL_INVALIDE');
  if (url.hostname !== 'app.onify.fr' && !url.hostname.endsWith('.onify.fr')) {
    throw new Error('ONIFY_PDF_URL_INVALIDE');
  }
  return url;
}

async function responsePdf(response: Response, token: string): Promise<Uint8Array> {
  const contentLength = Number(response.headers.get('Content-Length') ?? 0);
  if (contentLength > ONIFY_INVOICE_PDF_MAX_BYTES) throw new Error('ONIFY_PDF_TROP_VOLUMINEUX');

  const contentType = (response.headers.get('Content-Type') ?? '').toLowerCase();
  if (contentType.includes('application/json')) {
    const payload = await response.json().catch(() => ({})) as Json;
    const candidate = pdfCandidate(payload);
    if (!candidate) throw new Error('ONIFY_PDF_ABSENT');
    const inlinePdf = decodeBase64(candidate);
    if (inlinePdf) return inlinePdf;

    const pdfResponse = await fetch(validateOnifyUrl(candidate), {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/pdf' },
      redirect: 'follow',
    });
    if (!pdfResponse.ok) throw new Error(`ONIFY_PDF_HTTP_${pdfResponse.status}`);
    return responsePdf(pdfResponse, token);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > ONIFY_INVOICE_PDF_MAX_BYTES) throw new Error('ONIFY_PDF_TROP_VOLUMINEUX');
  if (!bytesArePdf(bytes)) throw new Error('ONIFY_PDF_INVALIDE');
  return bytes;
}

async function fetchPdfResponse(
  url: string | URL,
  token: string,
): Promise<{ bytes: Uint8Array | null; diagnostic: string }> {
  const response = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/pdf, application/json' },
    redirect: 'follow',
  });
  if (!response.ok) {
    return { bytes: null, diagnostic: `http_${response.status}` };
  }

  try {
    return { bytes: await responsePdf(response, token), diagnostic: 'ok' };
  } catch (error) {
    return {
      bytes: null,
      diagnostic: error instanceof Error ? error.message.toLowerCase() : 'invalide',
    };
  }
}

function payloadKeys(payload: Json): string {
  const root = payload.data && typeof payload.data === 'object'
    ? payload.data as Json
    : payload;
  return Object.keys(root).sort().join('|').slice(0, 220) || 'aucune';
}

export async function readOnifyToken(
  admin: OnifyAdminClient,
  workspaceId: string,
): Promise<string> {
  const { data, error } = await admin.rpc('vault_read_secret', {
    secret_name: `onify_api_key_${workspaceId}`,
  });
  if (error || !data) throw new Error('CLE_ONIFY_MANQUANTE');
  return String(data);
}

export async function fetchOnifyInvoicePdf(
  token: string,
  onifyInvoiceId: string,
): Promise<Uint8Array> {
  const encodedId = encodeURIComponent(onifyInvoiceId);
  const diagnostics: string[] = [];

  const apiPdf = await fetchPdfResponse(
    `${ONIFY_API}/billing/invoices/${encodedId}/pdf`,
    token,
  );
  if (apiPdf.bytes) return apiPdf.bytes;
  diagnostics.push(`api_pdf=${apiPdf.diagnostic}`);

  const detailResponse = await fetch(`${ONIFY_API}/billing/invoices/${encodedId}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    redirect: 'follow',
  });
  if (detailResponse.ok) {
    const payload = await detailResponse.json().catch(() => ({})) as Json;
    const candidate = pdfCandidate(payload);
    if (candidate) {
      const inlinePdf = decodeBase64(candidate);
      if (inlinePdf) return inlinePdf;
      const candidatePdf = await fetchPdfResponse(validateOnifyUrl(candidate), token);
      if (candidatePdf.bytes) return candidatePdf.bytes;
      diagnostics.push(`detail_url=${candidatePdf.diagnostic}`);
    } else {
      diagnostics.push(`detail_keys=${payloadKeys(payload)}`);
    }
  } else {
    diagnostics.push(`api_detail=http_${detailResponse.status}`);
  }

  // Ces chemins sont ceux utilises par l'interface Onify selon le type de facture.
  // On ne conserve la reponse que si elle contient effectivement un PDF valide.
  for (const [label, path] of [
    ['wysiwyg_download', `/editor/download/facture/${encodedId}`],
    ['wysiwyg', `/editor/render/facture/${encodedId}`],
    ['classic', `/invoice-pdf-details/${encodedId}`],
    ['imported', `/imported-creance-pdf/${encodedId}`],
  ] as const) {
    const result = await fetchPdfResponse(`${ONIFY_APP}${path}`, token);
    if (result.bytes) return result.bytes;
    diagnostics.push(`${label}=${result.diagnostic}`);
  }

  throw new Error(`ONIFY_PDF_INDISPONIBLE:${diagnostics.join(';').slice(0, 480)}`);
}

function safeFilename(value: string): string {
  const cleaned = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return cleaned || 'facture-onify';
}

export function onifyInvoiceStoragePath(
  workspaceId: string,
  invoiceId: string,
  invoiceNumber: string,
): string {
  return `${workspaceId}/${invoiceId}/${safeFilename(invoiceNumber)}.pdf`;
}

export async function storeOnifyInvoicePdf(
  admin: OnifyAdminClient,
  path: string,
  bytes: Uint8Array,
): Promise<void> {
  const { error } = await admin.storage.from(ONIFY_INVOICE_BUCKET).upload(path, bytes, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (error) throw new Error(`STOCKAGE_PDF_ONIFY: ${error.message}`);
}
