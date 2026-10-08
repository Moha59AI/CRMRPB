import { supabase } from '@/lib/supabase';

export interface SupplierExpenseItem {
  delivery_date: string | null;
  delivery_note: string | number | null;
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

export interface SupplierExpense {
  id: string;
  supplier: string;
  document_type: 'invoice' | 'credit_note';
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
