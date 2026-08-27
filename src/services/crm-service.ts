import { supabase } from '@/lib/supabase';
import type {
  Lead, Contact, Vehicle, Insurer, WindscreenCase, CaseDocument,
  Appointment, Task, Note, Activity, Communication, SmsTemplate,
  Notification, Workflow, WorkflowRun, Campaign, Quote, Invoice,
  Payment, Gift, AfterSalesCase, Profile,
} from '@/types';

async function getWorkspaceId(): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not authenticated');

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', userId)
    .maybeSingle();

  if (!profile?.workspace_id) throw new Error('No workspace found');
  return profile.workspace_id;
}

async function getWorkspaceIdSync(): Promise<string> {
  return getWorkspaceId();
}

export { getWorkspaceId, getWorkspaceIdSync };

// ============ PROFILES ============
export async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('first_name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as Profile[]) ?? [];
}

// ============ LEADS ============
export async function fetchLeads(params: {
  search?: string;
  source?: string;
  status?: string;
  assignedUserId?: string;
}): Promise<Lead[]> {
  let query = supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false });

  if (params.search) {
    const s = params.search.trim();
    query = query.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%,city.ilike.%${s}%,vehicle_registration.ilike.%${s}%`);
  }
  if (params.source && params.source !== 'all') query = query.eq('source', params.source);
  if (params.status && params.status !== 'all') query = query.eq('status', params.status);
  if (params.assignedUserId && params.assignedUserId !== 'all') query = query.eq('assigned_user_id', params.assignedUserId);

  const { data, error } = await query.limit(200);
  if (error) throw new Error(error.message);
  return (data as Lead[]) ?? [];
}

export async function fetchLeadById(id: string): Promise<Lead | null> {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Lead | null;
}

export async function updateLeadStatus(id: string, status: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('leads').update({ status }).eq('id', id);
  return { error: error?.message ?? null };
}

export async function updateLead(id: string, updates: Partial<Lead>): Promise<{ error: string | null }> {
  const { error } = await supabase.from('leads').update(updates).eq('id', id);
  return { error: error?.message ?? null };
}

export async function createLead(lead: Partial<Lead>): Promise<{ error: string | null; lead: Lead | null }> {
  const wsId = await getWorkspaceId();
  const { data, error } = await supabase
    .from('leads')
    .insert({ ...lead, workspace_id: wsId, source: lead.source ?? 'manual' })
    .select('*')
    .maybeSingle();
  if (error) return { error: error.message, lead: null };
  return { error: null, lead: data as Lead };
}

export async function checkDuplicateLead(lead: {
  phone?: string | null;
  email?: string | null;
  vehicle_registration?: string | null;
  excludeId?: string;
}): Promise<{ field: string; count: number }[]> {
  const duplicates: { field: string; count: number }[] = [];
  const conditions: string[] = [];
  if (lead.phone) conditions.push(`phone.eq.${lead.phone}`);
  if (lead.email) conditions.push(`email.eq.${lead.email}`);
  if (lead.vehicle_registration) conditions.push(`vehicle_registration.eq.${lead.vehicle_registration}`);
  if (conditions.length === 0) return duplicates;

  let query = supabase.from('leads').select('id, phone, email, vehicle_registration').or(conditions.join(','));
  if (lead.excludeId) query = query.neq('id', lead.excludeId);

  const { data } = await query;
  if (!data) return duplicates;

  if (lead.phone && data.some((d) => d.phone === lead.phone)) {
    duplicates.push({ field: 'phone', count: data.filter((d) => d.phone === lead.phone).length });
  }
  if (lead.email && data.some((d) => d.email === lead.email)) {
    duplicates.push({ field: 'email', count: data.filter((d) => d.email === lead.email).length });
  }
  if (lead.vehicle_registration && data.some((d) => d.vehicle_registration === lead.vehicle_registration)) {
    duplicates.push({ field: 'vehicle_registration', count: data.filter((d) => d.vehicle_registration === lead.vehicle_registration).length });
  }
  return duplicates;
}

// ============ CONTACTS ============
export async function fetchContacts(params: { search?: string }): Promise<Contact[]> {
  let query = supabase.from('contacts').select('*').order('created_at', { ascending: false });
  if (params.search) {
    const s = params.search.trim();
    query = query.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%,city.ilike.%${s}%`);
  }
  const { data, error } = await query.limit(200);
  if (error) throw new Error(error.message);
  return (data as Contact[]) ?? [];
}

export async function createContact(contact: Partial<Contact>): Promise<{ error: string | null; contact: Contact | null }> {
  const wsId = await getWorkspaceId();
  const { data, error } = await supabase
    .from('contacts')
    .insert({ ...contact, workspace_id: wsId })
    .select('*')
    .maybeSingle();
  if (error) return { error: error.message, contact: null };
  return { error: null, contact: data as Contact };
}

export async function updateContact(id: string, updates: Partial<Contact>): Promise<{ error: string | null }> {
  const { error } = await supabase.from('contacts').update(updates).eq('id', id);
  return { error: error?.message ?? null };
}

// ============ VEHICLES ============
export async function fetchVehiclesForContact(contactId: string): Promise<Vehicle[]> {
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .eq('contact_id', contactId);
  if (error) throw new Error(error.message);
  return (data as Vehicle[]) ?? [];
}

// ============ INSURERS ============
export async function fetchInsurers(): Promise<Insurer[]> {
  const { data, error } = await supabase
    .from('insurers')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as Insurer[]) ?? [];
}

export async function createInsurer(name: string): Promise<{ error: string | null; insurer: Insurer | null }> {
  const wsId = await getWorkspaceId();
  const { data, error } = await supabase
    .from('insurers')
    .insert({ name, workspace_id: wsId })
    .select('*')
    .maybeSingle();
  if (error) return { error: error.message, insurer: null };
  return { error: null, insurer: data as Insurer };
}

// ============ WINDSCREEN_CASES ============
export async function fetchCases(params: {
  search?: string;
  status?: string;
  assignedUserId?: string;
}): Promise<WindscreenCase[]> {
  let query = supabase.from('windscreen_cases').select('*').order('created_at', { ascending: false });
  if (params.status && params.status !== 'all') query = query.eq('status', params.status);
  if (params.assignedUserId && params.assignedUserId !== 'all') query = query.eq('assigned_user_id', params.assignedUserId);
  if (params.search) {
    const s = params.search.trim();
    query = query.or(`case_number.ilike.%${s}%,internal_notes.ilike.%${s}%`);
  }
  const { data, error } = await query.limit(200);
  if (error) throw new Error(error.message);
  return (data as WindscreenCase[]) ?? [];
}

export async function fetchCaseById(id: string): Promise<WindscreenCase | null> {
  const { data, error } = await supabase
    .from('windscreen_cases')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as WindscreenCase | null;
}

export async function createCase(c: Partial<WindscreenCase>): Promise<{ error: string | null; caseData: WindscreenCase | null }> {
  const wsId = await getWorkspaceId();
  const { data, error } = await supabase
    .from('windscreen_cases')
    .insert({ ...c, workspace_id: wsId })
    .select('*')
    .maybeSingle();
  if (error) return { error: error.message, caseData: null };
  return { error: null, caseData: data as WindscreenCase };
}

export async function updateCase(id: string, updates: Partial<WindscreenCase>): Promise<{ error: string | null }> {
  const { error } = await supabase.from('windscreen_cases').update(updates).eq('id', id);
  return { error: error?.message ?? null };
}

// ============ CASE_DOCUMENTS ============
export async function fetchCaseDocuments(caseId: string): Promise<CaseDocument[]> {
  const { data, error } = await supabase
    .from('case_documents')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as CaseDocument[]) ?? [];
}

export async function toggleCaseDocument(id: string, uploaded: boolean): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('case_documents')
    .update({ uploaded, uploaded_at: uploaded ? new Date().toISOString() : null })
    .eq('id', id);
  return { error: error?.message ?? null };
}

export async function createCaseDocument(doc: Partial<CaseDocument>): Promise<{ error: string | null }> {
  const wsId = await getWorkspaceId();
  const { error } = await supabase
    .from('case_documents')
    .insert({ ...doc, workspace_id: wsId });
  return { error: error?.message ?? null };
}

// ============ APPOINTMENTS ============
export async function fetchAppointments(params: {
  startDate?: string;
  endDate?: string;
  assignedUserId?: string;
}): Promise<Appointment[]> {
  let query = supabase.from('appointments').select('*').order('start_time', { ascending: true });
  if (params.startDate) query = query.gte('start_time', params.startDate);
  if (params.endDate) query = query.lte('start_time', params.endDate);
  if (params.assignedUserId && params.assignedUserId !== 'all') query = query.eq('assigned_user_id', params.assignedUserId);
  const { data, error } = await query.limit(200);
  if (error) throw new Error(error.message);
  return (data as Appointment[]) ?? [];
}

export async function createAppointment(appt: Partial<Appointment>): Promise<{ error: string | null; appointment: Appointment | null }> {
  const wsId = await getWorkspaceId();
  const { data, error } = await supabase
    .from('appointments')
    .insert({ ...appt, workspace_id: wsId })
    .select('*')
    .maybeSingle();
  if (error) return { error: error.message, appointment: null };
  return { error: null, appointment: data as Appointment };
}

export async function updateAppointment(id: string, updates: Partial<Appointment>): Promise<{ error: string | null }> {
  const { error } = await supabase.from('appointments').update(updates).eq('id', id);
  return { error: error?.message ?? null };
}

export async function deleteAppointment(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('appointments').delete().eq('id', id);
  return { error: error?.message ?? null };
}

// ============ TASKS ============
export async function fetchTasks(params: {
  status?: string;
  assignedUserId?: string;
  leadId?: string;
  caseId?: string;
}): Promise<Task[]> {
  let query = supabase.from('tasks').select('*').order('due_at', { ascending: true, nullsFirst: false });
  if (params.status && params.status !== 'all') query = query.eq('status', params.status);
  if (params.assignedUserId && params.assignedUserId !== 'all') query = query.eq('assigned_user_id', params.assignedUserId);
  if (params.leadId) query = query.eq('lead_id', params.leadId);
  if (params.caseId) query = query.eq('case_id', params.caseId);
  const { data, error } = await query.limit(200);
  if (error) throw new Error(error.message);
  return (data as Task[]) ?? [];
}

export async function createTask(task: Partial<Task>): Promise<{ error: string | null; task: Task | null }> {
  const wsId = await getWorkspaceId();
  const { data, error } = await supabase
    .from('tasks')
    .insert({ ...task, workspace_id: wsId })
    .select('*')
    .maybeSingle();
  if (error) return { error: error.message, task: null };
  return { error: null, task: data as Task };
}

export async function updateTask(id: string, updates: Partial<Task>): Promise<{ error: string | null }> {
  const { error } = await supabase.from('tasks').update(updates).eq('id', id);
  return { error: error?.message ?? null };
}

// ============ NOTES ============
export async function fetchNotes(params: { leadId?: string; caseId?: string; contactId?: string }): Promise<Note[]> {
  let query = supabase.from('notes').select('*').order('created_at', { ascending: false });
  if (params.leadId) query = query.eq('lead_id', params.leadId);
  if (params.caseId) query = query.eq('case_id', params.caseId);
  if (params.contactId) query = query.eq('contact_id', params.contactId);
  const { data, error } = await query.limit(100);
  if (error) throw new Error(error.message);
  return (data as Note[]) ?? [];
}

export async function createNote(note: Partial<Note>): Promise<{ error: string | null; note: Note | null }> {
  const wsId = await getWorkspaceId();
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('notes')
    .insert({ ...note, workspace_id: wsId, user_id: userData.user?.id ?? null })
    .select('*')
    .maybeSingle();
  if (error) return { error: error.message, note: null };
  return { error: null, note: data as Note };
}

// ============ ACTIVITIES ============
export async function fetchActivities(params: { limit?: number }): Promise<Activity[]> {
  let query = supabase.from('activities').select('*').order('created_at', { ascending: false });
  if (params.limit) query = query.limit(params.limit);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as Activity[]) ?? [];
}

export async function createActivity(activity: Partial<Activity>): Promise<void> {
  const wsId = await getWorkspaceId();
  const { data: userData } = await supabase.auth.getUser();
  await supabase
    .from('activities')
    .insert({ ...activity, workspace_id: wsId, user_id: userData.user?.id ?? null });
}

// ============ COMMUNICATIONS ============
export async function fetchCommunications(params: {
  leadId?: string;
  caseId?: string;
  contactId?: string;
  type?: string;
}): Promise<Communication[]> {
  let query = supabase.from('communications').select('*').order('created_at', { ascending: false });
  if (params.leadId) query = query.eq('lead_id', params.leadId);
  if (params.caseId) query = query.eq('case_id', params.caseId);
  if (params.contactId) query = query.eq('contact_id', params.contactId);
  if (params.type && params.type !== 'all') query = query.eq('type', params.type);
  const { data, error } = await query.limit(200);
  if (error) throw new Error(error.message);
  return (data as Communication[]) ?? [];
}

export async function createCommunication(comm: Partial<Communication>): Promise<{ error: string | null; comm: Communication | null }> {
  const wsId = await getWorkspaceId();
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('communications')
    .insert({ ...comm, workspace_id: wsId, user_id: userData.user?.id ?? null, provider: 'demo' })
    .select('*')
    .maybeSingle();
  if (error) return { error: error.message, comm: null };
  return { error: null, comm: data as Communication };
}

// ============ SMS_TEMPLATES ============
export async function fetchSmsTemplates(): Promise<SmsTemplate[]> {
  const { data, error } = await supabase
    .from('sms_templates')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as SmsTemplate[]) ?? [];
}

export async function createSmsTemplate(name: string, content: string, category: string): Promise<{ error: string | null }> {
  const wsId = await getWorkspaceId();
  const { error } = await supabase
    .from('sms_templates')
    .insert({ name, content, category, workspace_id: wsId });
  return { error: error?.message ?? null };
}

// ============ NOTIFICATIONS ============
export async function fetchNotifications(): Promise<Notification[]> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user?.id) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userData.user.id)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data as Notification[]) ?? [];
}

export async function markNotificationRead(id: string): Promise<void> {
  await supabase.from('notifications').update({ read: true }).eq('id', id);
}

// ============ WORKFLOWS ============
export async function fetchWorkflows(): Promise<Workflow[]> {
  const { data, error } = await supabase
    .from('workflows')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as Workflow[]) ?? [];
}

export async function createWorkflow(wf: Partial<Workflow>): Promise<{ error: string | null; workflow: Workflow | null }> {
  const wsId = await getWorkspaceId();
  const { data, error } = await supabase
    .from('workflows')
    .insert({ ...wf, workspace_id: wsId })
    .select('*')
    .maybeSingle();
  if (error) return { error: error.message, workflow: null };
  return { error: null, workflow: data as Workflow };
}

export async function updateWorkflow(id: string, updates: Partial<Workflow>): Promise<{ error: string | null }> {
  const { error } = await supabase.from('workflows').update(updates).eq('id', id);
  return { error: error?.message ?? null };
}

export async function deleteWorkflow(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('workflows').delete().eq('id', id);
  return { error: error?.message ?? null };
}

export async function fetchWorkflowRuns(workflowId: string): Promise<WorkflowRun[]> {
  const { data, error } = await supabase
    .from('workflow_runs')
    .select('*')
    .eq('workflow_id', workflowId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data as WorkflowRun[]) ?? [];
}

// ============ CAMPAIGNS ============
export async function fetchCampaigns(): Promise<Campaign[]> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as Campaign[]) ?? [];
}

export async function createCampaign(c: Partial<Campaign>): Promise<{ error: string | null; campaign: Campaign | null }> {
  const wsId = await getWorkspaceId();
  const { data, error } = await supabase
    .from('campaigns')
    .insert({ ...c, workspace_id: wsId })
    .select('*')
    .maybeSingle();
  if (error) return { error: error.message, campaign: null };
  return { error: null, campaign: data as Campaign };
}

export async function updateCampaign(id: string, updates: Partial<Campaign>): Promise<{ error: string | null }> {
  const { error } = await supabase.from('campaigns').update(updates).eq('id', id);
  return { error: error?.message ?? null };
}

// ============ QUOTES ============
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

// ============ INVOICES ============
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

// ============ PAYMENTS ============
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

// ============ GIFTS ============
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
export async function fetchAfterSalesCases(params: { status?: string }): Promise<AfterSalesCase[]> {
  let query = supabase.from('after_sales_cases').select('*').order('created_at', { ascending: false });
  if (params.status && params.status !== 'all') query = query.eq('status', params.status);
  const { data, error } = await query.limit(200);
  if (error) throw new Error(error.message);
  return (data as AfterSalesCase[]) ?? [];
}

export async function createAfterSalesCase(a: Partial<AfterSalesCase>): Promise<{ error: string | null; caseData: AfterSalesCase | null }> {
  const wsId = await getWorkspaceId();
  const { data, error } = await supabase
    .from('after_sales_cases')
    .insert({ ...a, workspace_id: wsId })
    .select('*')
    .maybeSingle();
  if (error) return { error: error.message, caseData: null };
  return { error: null, caseData: data as AfterSalesCase };
}

export async function updateAfterSalesCase(id: string, updates: Partial<AfterSalesCase>): Promise<{ error: string | null }> {
  const { error } = await supabase.from('after_sales_cases').update(updates).eq('id', id);
  return { error: error?.message ?? null };
}

// ============ DEMO DATA ============
export async function seedDemoLeads(): Promise<{ count: number; error: string | null }> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { count: 0, error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', userId)
    .maybeSingle();

  if (!profile?.workspace_id) return { count: 0, error: 'No workspace found' };

  const { data, error } = await supabase.rpc('seed_demo_leads', {
    p_workspace_id: profile.workspace_id,
  });

  if (error) return { count: 0, error: error.message };
  return { count: data as number, error: null };
}
