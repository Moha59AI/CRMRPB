import { supabase } from '@/lib/supabase';
import { fetchSupplierExpenses, type SupplierExpense } from './supplier-expenses-service';

export interface SupplierMatchCandidate {
  workspace_id: string;
  supplier_expense_id: string;
  supplier_item_index: number;
  supplier: string;
  document_type: 'invoice' | 'credit_note';
  document_number: string;
  supplier_invoice_date: string;
  item_date: string;
  category: string;
  sku: string;
  supplier_description: string;
  supplier_amount_ht: number;
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  case_id: string | null;
  contact_id: string | null;
  customer_name: string;
  invoice_amount_ht: number;
  date_gap_days: number;
  candidate_count: number;
  candidate_rank: number;
  confidence: number;
}

export interface SupplierExpenseAllocation {
  id: string;
  workspace_id: string;
  supplier_expense_id: string;
  supplier_item_index: number;
  invoice_id: string;
  case_id: string | null;
  contact_id: string | null;
  amount_ht: number;
  match_method: 'manual' | 'sku_reviewed';
  confidence: number;
  confirmed: boolean;
  created_at: string;
}

export interface InvoiceProfitability {
  workspace_id: string;
  invoice_id: string;
  invoice_number: string;
  issue_date: string;
  status: string;
  case_id: string | null;
  contact_id: string | null;
  customer_name: string;
  billed_amount_ht: number;
  billed_amount_ttc: number;
  credit_amount_ttc: number;
  credit_amount_ht: number;
  net_revenue_ht: number;
  supplier_cost_ht: number;
  gift_cost: number;
  actual_gross_margin_ht: number | null;
  allocated_supplier_lines: number;
  minimum_confidence: number | null;
  collected_amount: number;
  supplier_cost_known: boolean;
}

export interface FinancialConnectionsData {
  candidates: SupplierMatchCandidate[];
  allocations: SupplierExpenseAllocation[];
  profitability: InvoiceProfitability[];
  supplierExpenses: SupplierExpense[];
}

const missingMigrationCodes = new Set(['42P01', 'PGRST200', 'PGRST205']);

export async function fetchFinancialConnections(): Promise<FinancialConnectionsData> {
  const [candidates, allocations, profitability, supplierExpenses] = await Promise.all([
    supabase
      .from('v_supplier_match_candidates')
      .select('*')
      .order('confidence', { ascending: false })
      .order('item_date', { ascending: false })
      .limit(5_000),
    supabase
      .from('supplier_expense_allocations')
      .select('*')
      .eq('confirmed', true)
      .order('created_at', { ascending: false })
      .limit(5_000),
    supabase
      .from('v_financial_invoice_profitability')
      .select('*')
      .order('issue_date', { ascending: false })
      .limit(5_000),
    fetchSupplierExpenses(),
  ]);

  const failed = [candidates, allocations, profitability].find((result) => result.error);
  if (failed?.error) {
    if (missingMigrationCodes.has(failed.error.code ?? '')) {
      throw new Error('La migration d’interconnexion financière doit être appliquée dans Supabase.');
    }
    throw new Error(failed.error.message);
  }

  return {
    candidates: (candidates.data as SupplierMatchCandidate[] | null) ?? [],
    allocations: (allocations.data as SupplierExpenseAllocation[] | null) ?? [],
    profitability: (profitability.data as InvoiceProfitability[] | null) ?? [],
    supplierExpenses,
  };
}

export async function confirmSupplierMatch(candidate: SupplierMatchCandidate): Promise<void> {
  const { error } = await supabase.from('supplier_expense_allocations').insert({
    workspace_id: candidate.workspace_id,
    supplier_expense_id: candidate.supplier_expense_id,
    supplier_item_index: candidate.supplier_item_index,
    invoice_id: candidate.invoice_id,
    case_id: candidate.case_id,
    contact_id: candidate.contact_id,
    amount_ht: candidate.supplier_amount_ht,
    match_method: 'sku_reviewed',
    confidence: candidate.confidence,
    confirmed: true,
  });

  if (error) throw new Error(error.message);
}

export async function removeSupplierMatch(allocationId: string): Promise<void> {
  const { error } = await supabase
    .from('supplier_expense_allocations')
    .delete()
    .eq('id', allocationId);

  if (error) throw new Error(error.message);
}

export function countLinkableSupplierLines(expenses: SupplierExpense[]): number {
  return expenses.reduce((total, expense) => total + expense.items.filter((item) => (
    ['Pare-brise', 'Autres vitrages'].includes(item.category ?? '')
    && Boolean(item.sku?.trim())
    && Number(item.amount_ht ?? 0) !== 0
  )).length, 0);
}
