import { supabase } from '@/lib/supabase';
import type {
  Contact, Gift, Insurer, Invoice, OnifyCreditNote, Payment, Quote, WindscreenCase,
} from '@/types';

export interface FinancialDashboardData {
  invoices: Invoice[];
  payments: Payment[];
  quotes: Quote[];
  credits: OnifyCreditNote[];
  gifts: Gift[];
  contacts: Pick<Contact, 'id' | 'first_name' | 'last_name'>[];
  cases: Pick<WindscreenCase, 'id' | 'insurer_id'>[];
  insurers: Pick<Insurer, 'id' | 'name'>[];
}

export async function fetchFinancialDashboardData(): Promise<FinancialDashboardData> {
  const [invoices, payments, quotes, credits, gifts, contacts, cases, insurers] = await Promise.all([
    supabase.from('invoices').select('*').order('issue_date', { ascending: false }).limit(5000),
    supabase.from('payments').select('*').order('payment_date', { ascending: false }).limit(5000),
    supabase.from('quotes').select('*').order('created_at', { ascending: false }).limit(5000),
    supabase.from('onify_credit_notes').select('*').order('issue_date', { ascending: false }).limit(5000),
    supabase.from('gifts').select('*').order('created_at', { ascending: false }).limit(5000),
    supabase.from('contacts').select('id, first_name, last_name').limit(10000),
    supabase.from('windscreen_cases').select('id, insurer_id').limit(10000),
    supabase.from('insurers').select('id, name').limit(1000),
  ]);

  const failed = [invoices, payments, quotes, credits, gifts, contacts, cases, insurers]
    .find((result) => result.error);
  if (failed?.error) throw new Error(failed.error.message);

  return {
    invoices: (invoices.data as Invoice[]) ?? [],
    payments: (payments.data as Payment[]) ?? [],
    quotes: (quotes.data as Quote[]) ?? [],
    credits: (credits.data as OnifyCreditNote[]) ?? [],
    gifts: (gifts.data as Gift[]) ?? [],
    contacts: (contacts.data as Pick<Contact, 'id' | 'first_name' | 'last_name'>[]) ?? [],
    cases: (cases.data as Pick<WindscreenCase, 'id' | 'insurer_id'>[]) ?? [],
    insurers: (insurers.data as Pick<Insurer, 'id' | 'name'>[]) ?? [],
  };
}
