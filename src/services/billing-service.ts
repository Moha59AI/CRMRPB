// Devis, factures, paiements et cadeaux

import { supabase } from '@/lib/supabase';
import type { Quote, Invoice, Payment, Gift } from '@/types';
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
