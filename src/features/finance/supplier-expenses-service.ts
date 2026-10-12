import { supabase } from '@/lib/supabase';
import { getWorkspaceId } from '@/services/workspace';

export interface SupplierExpenseItem {
  delivery_date: string | null;
  delivery_note: string | number | null;
  delivery_note_number?: string | null;
  vehicle_registration?: string | null;
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
}

export type SupplierDocumentType = 'delivery_note' | 'invoice' | 'credit_note';
export type SupplierAccountingStatus =
  | 'committed'
  | 'card_to_confirm'
  | 'paid_card_invoice_pending'
  | 'invoiced_unpaid'
  | 'payment_scheduled'
  | 'paid'
  | 'credited'
  | 'review_required';
export type SupplierPaymentMethod =
  | 'unknown'
  | 'supplier_account'
  | 'card'
  | 'direct_debit'
  | 'bank_transfer'
  | 'other';
export type SupplierPaymentStatus = 'unknown' | 'unpaid' | 'scheduled' | 'paid' | 'refunded';

export interface SupplierExpense {
  id: string;
  supplier: string;
  document_type: SupplierDocumentType;
  document_number: string;
  invoice_date: string;
  amount_ht: number;
  vat_amount: number;
  amount_ttc: number;
  expected_payment_method: string | null;
  due_date: string | null;
  sites: string | null;
  item_count: number;
  items: SupplierExpenseItem[];
  pdf_available_in_source: boolean;
  pdf_filename: string | null;
  pdf_storage_path: string | null;
  portal_date: string | null;
  observation: string | null;
  source_import: string;
  accounting_status?: SupplierAccountingStatus;
  amount_basis?: 'provisional' | 'final';
  payment_method?: SupplierPaymentMethod;
  payment_status?: SupplierPaymentStatus;
  delivery_note_number?: string | null;
  invoice_number?: string | null;
  order_number?: string | null;
  credit_note_numbers?: string[];
  gross_amount_ht?: number | null;
  gross_vat_amount?: number | null;
  gross_amount_ttc?: number | null;
  credit_amount_ht?: number;
  credit_vat_amount?: number;
  credit_amount_ttc?: number;
  invoice_received_at?: string | null;
  paid_at?: string | null;
  source_communication_id?: string | null;
  source_attachment_id?: string | null;
  analysis_confidence?: number | null;
  needs_review?: boolean;
  document_review_required?: boolean;
  payment_confirmation_required?: boolean;
  lead_id?: string | null;
  case_id?: string | null;
  contact_id?: string | null;
  customer_invoice_id?: string | null;
}

export interface SupplierAccountOverview {
  workspace_id: string;
  supplier: string;
  account_id: string | null;
  credit_limit_ttc: number | null;
  warning_threshold: number | null;
  payment_terms: string | null;
  overflow_payment_method: 'card' | 'bank_transfer' | 'other' | null;
  auto_card_over_limit: boolean | null;
  outstanding_ttc: number;
  paid_card_ttc: number;
  provisional_documents: number;
  review_documents: number;
  remaining_credit_ttc: number | null;
  usage_percent: number | null;
  credit_limit_reached: boolean;
}

export interface SupplierDocumentAnalysis {
  id: string;
  communication_id: string;
  attachment_id: string;
  storage_path: string;
  filename: string;
  supplier_expense_id: string | null;
  linked_expense_ids: string[];
  status: 'completed' | 'review_required' | 'ignored' | 'failed';
  model: string | null;
  document_type: 'delivery_note' | 'invoice' | 'credit_note' | 'other';
  supplier: string | null;
  document_number: string | null;
  confidence: number | null;
  warnings: string[];
  created_at: string;
}

export interface SupplierDocumentJob {
  id: string;
  communication_id: string;
  attachment_id: string;
  filename: string;
  status: 'pending' | 'processing' | 'completed' | 'review_required' | 'failed' | 'ignored';
  attempts: number;
  analysis_id: string | null;
  last_error: string | null;
  created_at: string;
}

export async function fetchSupplierExpenses(): Promise<SupplierExpense[]> {
  const { data, error } = await supabase
    .from('supplier_expenses')
    .select('*')
    .order('invoice_date', { ascending: false })
    .order('document_number', { ascending: false })
    .limit(2_000);

  if (error) throw new Error(error.message);
  return (data as SupplierExpense[] | null) ?? [];
}

export async function fetchSupplierAccountOverview(): Promise<SupplierAccountOverview[]> {
  const { data, error } = await supabase
    .from('v_supplier_account_overview')
    .select('*')
    .order('supplier');
  if (error) throw new Error(error.message);
  return (data as SupplierAccountOverview[] | null) ?? [];
}

export async function saveSupplierAccount(input: {
  supplier: string;
  creditLimitTtc: number | null;
  warningThreshold: number;
  autoCardOverLimit: boolean;
}) {
  const workspaceId = await getWorkspaceId();
  const { error } = await supabase.from('supplier_accounts').upsert({
    workspace_id: workspaceId,
    supplier: input.supplier,
    credit_limit_ttc: input.creditLimitTtc,
    warning_threshold: input.warningThreshold,
    payment_terms: '30_eom',
    overflow_payment_method: 'card',
    auto_card_over_limit: input.autoCardOverLimit,
  }, { onConflict: 'workspace_id,supplier' });
  if (error) throw new Error(error.message);
}

export async function fetchSupplierDocumentAnalyses(): Promise<SupplierDocumentAnalysis[]> {
  const { data, error } = await supabase
    .from('supplier_document_analyses')
    .select('id, communication_id, attachment_id, storage_path, filename, supplier_expense_id, linked_expense_ids, status, model, document_type, supplier, document_number, confidence, warnings, created_at')
    .order('created_at', { ascending: false })
    .limit(2_000);
  if (error) throw new Error(error.message);
  return (data as SupplierDocumentAnalysis[] | null) ?? [];
}

export async function fetchSupplierDocumentJobs(): Promise<SupplierDocumentJob[]> {
  const { data, error } = await supabase
    .from('supplier_document_jobs')
    .select('id, communication_id, attachment_id, filename, status, attempts, analysis_id, last_error, created_at')
    .order('created_at', { ascending: false })
    .limit(2_000);
  if (error) throw new Error(error.message);
  return (data as SupplierDocumentJob[] | null) ?? [];
}

export async function retrySupplierDocumentJob(jobId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('supplier-document-process', {
    body: { jobId, force: true },
  });
  if (error) throw new Error(error.message);
}

export async function confirmSupplierExpensePayment(expense: SupplierExpense): Promise<void> {
  const { error } = await supabase.rpc('confirm_supplier_expense_payment', {
    p_expense_id: expense.id,
  });
  if (error) throw new Error(error.message);
}
