// Devis, factures, paiements et cadeaux

import { supabase, supabaseUrl } from '@/lib/supabase';
import type { Quote, Invoice, Payment, Gift, OnifyCreditNote } from '@/types';
import { getWorkspaceId } from '@/services/workspace';

export async function fetchQuotes(): Promise<Quote[]> {
  const { data, error } = await supabase
    .from('quotes')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as Quote[]) ?? [];
}

export async function createQuote(q: Partial<Quote>): Promise<{ error: string | null; quote: Quote | null }> {
  const wsId = await getWorkspaceId();
  const { data, error } = await supabase
    .from('quotes')
    .insert({ ...q, workspace_id: wsId })
    .select('*')
    .maybeSingle();
  if (error) return { error: error.message, quote: null };
  return { error: null, quote: data as Quote };
}

export async function fetchInvoices(params: { status?: string }): Promise<Invoice[]> {
  let query = supabase.from('invoices').select('*').order('issue_date', { ascending: false });
  if (params.status && params.status !== 'all') query = query.eq('status', params.status);
  const { data, error } = await query.limit(200);
  if (error) throw new Error(error.message);
  return (data as Invoice[]) ?? [];
}

export interface FacturationClient {
  factures: Invoice[];
  avoirs: OnifyCreditNote[];
  paiements: Payment[];
}

/**
 * Tout ce qui a ete facture a un client.
 *
 * Les trois listes viennent d'Onify par la synchronisation. Les paiements
 * servent a dire ce qui reste du : `remaining_amount` seul ne dit pas quand ni
 * comment le client a regle.
 */
export async function fetchFacturationClient(contactId: string): Promise<FacturationClient> {
  const [factures, avoirs] = await Promise.all([
    supabase.from('invoices').select('*')
      .eq('contact_id', contactId)
      .order('issue_date', { ascending: false, nullsFirst: false }),
    supabase.from('onify_credit_notes').select('*')
      .eq('contact_id', contactId)
      .order('issue_date', { ascending: false, nullsFirst: false }),
  ]);
  if (factures.error) throw new Error(factures.error.message);
  if (avoirs.error) throw new Error(avoirs.error.message);

  const listeFactures = (factures.data as Invoice[]) ?? [];
  if (listeFactures.length === 0) {
    return { factures: [], avoirs: (avoirs.data as OnifyCreditNote[]) ?? [], paiements: [] };
  }

  const { data: paiements, error } = await supabase
    .from('payments').select('*')
    .in('invoice_id', listeFactures.map((f) => f.id))
    .order('payment_date', { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);

  return {
    factures: listeFactures,
    avoirs: (avoirs.data as OnifyCreditNote[]) ?? [],
    paiements: (paiements as Payment[]) ?? [],
  };
}

/**
 * Recupere le PDF d'origine d'une facture Onify.
 *
 * La cle Onify reste sur le serveur : on passe par la fonction
 * `onify-invoice-pdf`, avec le jeton de session de l'utilisateur. Elle sert le
 * PDF mis en cache et ne retourne vers Onify que la premiere fois.
 */
export async function fetchFacturePdf(invoiceId: string): Promise<Blob> {
  const { data: session, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);
  const accessToken = session.session?.access_token;
  if (!accessToken) throw new Error('Session expirée, reconnectez-vous');

  const response = await fetch(`${supabaseUrl}/functions/v1/onify-invoice-pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ invoice_id: invoiceId, disposition: 'inline' }),
  });

  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(messageErreurPdf(result.error, response.status));
  }
  return response.blob();
}

function messageErreurPdf(erreur: string | undefined, statut: number): string {
  if (!erreur) return `PDF inaccessible : HTTP ${statut}`;
  if (erreur === 'CLE_ONIFY_MANQUANTE') {
    return 'Connectez Onify dans Réglages › Intégrations pour accéder aux PDF.';
  }
  if (erreur === 'FORBIDDEN') return "Votre rôle ne permet pas d'ouvrir les factures.";
  if (erreur === 'UNAUTHORIZED') return 'Session expirée, reconnectez-vous';
  return erreur;
}

export async function createInvoice(inv: Partial<Invoice>): Promise<{ error: string | null; invoice: Invoice | null }> {
  const wsId = await getWorkspaceId();
  const { data, error } = await supabase
    .from('invoices')
    .insert({ ...inv, workspace_id: wsId })
    .select('*')
    .maybeSingle();
  if (error) return { error: error.message, invoice: null };
  return { error: null, invoice: data as Invoice };
}

export async function updateInvoice(id: string, updates: Partial<Invoice>): Promise<{ error: string | null }> {
  const { error } = await supabase.from('invoices').update(updates).eq('id', id);
  return { error: error?.message ?? null };
}

export async function fetchPayments(invoiceId?: string): Promise<Payment[]> {
  let query = supabase.from('payments').select('*').order('payment_date', { ascending: false });
  if (invoiceId) query = query.eq('invoice_id', invoiceId);
  const { data, error } = await query.limit(200);
  if (error) throw new Error(error.message);
  return (data as Payment[]) ?? [];
}

export async function createPayment(p: Partial<Payment>): Promise<{ error: string | null; payment: Payment | null }> {
  const wsId = await getWorkspaceId();
  const { data, error } = await supabase
    .from('payments')
    .insert({ ...p, workspace_id: wsId })
    .select('*')
    .maybeSingle();
  if (error) return { error: error.message, payment: null };
  return { error: null, payment: data as Payment };
}

export async function fetchGifts(params: { status?: string }): Promise<Gift[]> {
  let query = supabase.from('gifts').select('*').order('created_at', { ascending: false });
  if (params.status && params.status !== 'all') query = query.eq('status', params.status);
  const { data, error } = await query.limit(200);
  if (error) throw new Error(error.message);
  return (data as Gift[]) ?? [];
}

export async function createGift(g: Partial<Gift>): Promise<{ error: string | null; gift: Gift | null }> {
  const wsId = await getWorkspaceId();
  const { data, error } = await supabase
    .from('gifts')
    .insert({ ...g, workspace_id: wsId })
    .select('*')
    .maybeSingle();
  if (error) return { error: error.message, gift: null };
  return { error: null, gift: data as Gift };
}

export async function updateGift(id: string, updates: Partial<Gift>): Promise<{ error: string | null }> {
  const { error } = await supabase.from('gifts').update(updates).eq('id', id);
  return { error: error?.message ?? null };
}

// ============ AFTER_SALES_CASES ============
