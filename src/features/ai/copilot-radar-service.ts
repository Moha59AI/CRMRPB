import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/types';

export type CopilotAlertSeverity = 'urgent' | 'attention' | 'opportunity';
export type CopilotAlertDomain = 'commercial' | 'documents' | 'agenda' | 'finance' | 'assistant';

export interface CopilotAlert {
  id: string;
  severity: CopilotAlertSeverity;
  domain: CopilotAlertDomain;
  title: string;
  description: string;
  link: string;
  dueAt: string | null;
  source: 'rule' | 'ai';
}

export interface CopilotRadarData {
  alerts: CopilotAlert[];
  generatedAt: string;
}

interface RadarContext {
  userId: string;
  role: UserRole;
}

interface LeadRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  source: string;
  assigned_user_id: string | null;
  next_action_at: string | null;
  arrive_le: string;
  updated_at: string;
}

interface TaskRow {
  id: string;
  lead_id: string | null;
  case_id: string | null;
  title: string;
  priority: string;
  due_at: string | null;
}

interface AppointmentRow {
  id: string;
  lead_id: string | null;
  case_id: string | null;
  title: string;
  status: string;
  start_time: string;
}

interface CaseRow {
  id: string;
  lead_id: string | null;
  case_number: string;
  status: string;
  appointment_date: string | null;
}

interface DocumentItemRow {
  required: boolean;
  status: string;
}

interface DocumentRequestRow {
  id: string;
  lead_id: string;
  status: string;
  expires_at: string;
  last_opened_at: string | null;
  created_at: string;
  client_document_items: DocumentItemRow[] | null;
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  status: string;
  due_date: string | null;
  remaining_amount: number | string;
}

interface GiftRow {
  id: string;
  status: string;
  description: string | null;
  created_at: string;
}

interface InsightRow {
  id: string;
  lead_id: string;
  next_action: Record<string, unknown> | null;
  warnings: unknown[] | null;
  created_at: string;
}

const ACTIVE_LEAD_STATUSES = [
  'new', 'to_call', 'calling', 'nrp', 'interested',
  'documents_requested', 'documents_received', 'appointment_scheduled',
];

const severityRank: Record<CopilotAlertSeverity, number> = {
  urgent: 0,
  attention: 1,
  opportunity: 2,
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function leadName(lead: LeadRow): string {
  return [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Lead sans nom';
}

function elapsedLabel(milliseconds: number): string {
  const hours = Math.max(1, Math.floor(milliseconds / 3_600_000));
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} jour${days > 1 ? 's' : ''}`;
}

function openLeadLink(leadId: string): string {
  return `/interventions/${leadId}`;
}

function alertComparator(a: CopilotAlert, b: CopilotAlert): number {
  const severity = severityRank[a.severity] - severityRank[b.severity];
  if (severity !== 0) return severity;
  if (a.dueAt && b.dueAt) return a.dueAt.localeCompare(b.dueAt);
  if (a.dueAt) return -1;
  if (b.dueAt) return 1;
  return a.title.localeCompare(b.title, 'fr');
}

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function fetchCopilotRadar(context: RadarContext): Promise<CopilotRadarData> {
  const now = Date.now();
  const inSevenDays = new Date(now + 7 * 86_400_000).toISOString();
  const yesterday = new Date(now - 86_400_000).toISOString();
  const inTwoDays = new Date(now + 2 * 86_400_000).toISOString();
  const commercial = ['admin', 'manager', 'advisor'].includes(context.role);
  const operations = ['admin', 'manager', 'advisor', 'technician'].includes(context.role);
  const finance = ['admin', 'manager', 'accountant'].includes(context.role);

  let leadQuery = supabase
    .from('leads')
    .select('id,first_name,last_name,phone,email,status,source,assigned_user_id,next_action_at,arrive_le,updated_at')
    .is('archived_at', null)
    .in('status', ACTIVE_LEAD_STATUSES)
    .order('arrive_le', { ascending: false })
    .limit(400);
  if (context.role === 'advisor') {
    leadQuery = leadQuery.or(`assigned_user_id.eq.${context.userId},assigned_user_id.is.null`);
  }

  const [
    leadResult,
    taskResult,
    appointmentResult,
    caseResult,
    documentResult,
    invoiceResult,
    giftResult,
    insightResult,
  ] = await Promise.all([
    commercial ? leadQuery : Promise.resolve({ data: [], error: null }),
    operations
      ? supabase
          .from('tasks')
          .select('id,lead_id,case_id,title,priority,due_at')
          .in('status', ['pending', 'in_progress'])
          .lte('due_at', inSevenDays)
          .order('due_at', { ascending: true })
          .limit(300)
      : Promise.resolve({ data: [], error: null }),
    operations
      ? supabase
          .from('appointments')
          .select('id,lead_id,case_id,title,status,start_time')
          .in('status', ['scheduled', 'confirmed'])
          .gte('start_time', yesterday)
          .lte('start_time', inTwoDays)
          .order('start_time', { ascending: true })
          .limit(300)
      : Promise.resolve({ data: [], error: null }),
    operations
      ? supabase
          .from('windscreen_cases')
          .select('id,lead_id,case_number,status,appointment_date')
          .in('status', ['new', 'qualification', 'documents_pending', 'insurance_declaration', 'glass_ordered', 'appointment_scheduled'])
          .limit(300)
      : Promise.resolve({ data: [], error: null }),
    commercial
      ? supabase
          .from('client_document_requests')
          .select('id,lead_id,status,expires_at,last_opened_at,created_at,client_document_items(required,status)')
          .eq('status', 'open')
          .order('created_at', { ascending: true })
          .limit(300)
      : Promise.resolve({ data: [], error: null }),
    finance
      ? supabase
          .from('invoices')
          .select('id,invoice_number,status,due_date,remaining_amount')
          .in('status', ['sent', 'partial', 'overdue'])
          .order('due_date', { ascending: true, nullsFirst: false })
          .limit(300)
      : Promise.resolve({ data: [], error: null }),
    finance
      ? supabase
          .from('gifts')
          .select('id,status,description,created_at')
          .in('status', ['pending', 'ordered'])
          .order('created_at', { ascending: true })
          .limit(300)
      : Promise.resolve({ data: [], error: null }),
    commercial
      ? supabase
          .from('lead_ai_insights')
          .select('id,lead_id,next_action,warnings,created_at')
          .order('created_at', { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [], error: null }),
  ]);

  [
    leadResult, taskResult, appointmentResult, caseResult,
    documentResult, invoiceResult, giftResult, insightResult,
  ].forEach((result) => throwIfError(result.error));

  const leads = (leadResult.data ?? []) as LeadRow[];
  const leadsById = new Map(leads.map((lead) => [lead.id, lead]));
  const alerts = new Map<string, CopilotAlert>();
  const add = (alert: CopilotAlert) => {
    if (!alerts.has(alert.id)) alerts.set(alert.id, alert);
  };

  for (const lead of leads) {
    const name = leadName(lead);
    const arrivedAt = new Date(lead.arrive_le).getTime();
    const age = now - arrivedAt;
    if (lead.next_action_at && new Date(lead.next_action_at).getTime() < now) {
      const delay = now - new Date(lead.next_action_at).getTime();
      add({
        id: `lead-due:${lead.id}`,
        severity: delay >= 24 * 3_600_000 ? 'urgent' : 'attention',
        domain: 'commercial',
        title: `Action en retard · ${name}`,
        description: `Échéance dépassée de ${elapsedLabel(delay)}. Ouvrez la fiche avant de replanifier.`,
        link: openLeadLink(lead.id),
        dueAt: lead.next_action_at,
        source: 'rule',
      });
    } else if (['new', 'to_call'].includes(lead.status) && age >= 2 * 3_600_000) {
      add({
        id: `lead-uncontacted:${lead.id}`,
        severity: age >= 8 * 3_600_000 ? 'urgent' : 'attention',
        domain: 'commercial',
        title: `Premier contact attendu · ${name}`,
        description: `Lead reçu il y a ${elapsedLabel(age)} et toujours au début du parcours.`,
        link: openLeadLink(lead.id),
        dueAt: lead.arrive_le,
        source: 'rule',
      });
    }

    if (!lead.phone && !lead.email) {
      add({
        id: `lead-contact:${lead.id}`,
        severity: 'attention',
        domain: 'commercial',
        title: `Coordonnées à compléter · ${name}`,
        description: 'Aucun téléphone ni e-mail exploitable pour poursuivre le dossier.',
        link: openLeadLink(lead.id),
        dueAt: null,
        source: 'rule',
      });
    }

    if (lead.status === 'documents_requested' && now - new Date(lead.updated_at).getTime() > 48 * 3_600_000) {
      add({
        id: `lead-documents:${lead.id}`,
        severity: 'attention',
        domain: 'documents',
        title: `Documents à relancer · ${name}`,
        description: 'Le dossier attend des pièces depuis plus de 48 heures.',
        link: openLeadLink(lead.id),
        dueAt: lead.updated_at,
        source: 'rule',
      });
    }
  }

  for (const task of (taskResult.data ?? []) as TaskRow[]) {
    if (!task.due_at || new Date(task.due_at).getTime() >= now) continue;
    const delay = now - new Date(task.due_at).getTime();
    add({
      id: `task:${task.id}`,
      severity: task.priority === 'urgent' || delay >= 24 * 3_600_000 ? 'urgent' : 'attention',
      domain: 'commercial',
      title: task.title,
      description: `Tâche en retard de ${elapsedLabel(delay)}.`,
      link: task.lead_id ? openLeadLink(task.lead_id) : task.case_id ? '/glass' : '/follow-up',
      dueAt: task.due_at,
      source: 'rule',
    });
  }

  for (const appointment of (appointmentResult.data ?? []) as AppointmentRow[]) {
    const startsIn = new Date(appointment.start_time).getTime() - now;
    if (startsIn < 0) {
      add({
        id: `appointment-past:${appointment.id}`,
        severity: 'urgent',
        domain: 'agenda',
        title: `Rendez-vous à clôturer · ${appointment.title}`,
        description: 'Le créneau est passé mais son résultat n’est pas enregistré.',
        link: appointment.lead_id ? openLeadLink(appointment.lead_id) : '/calendar',
        dueAt: appointment.start_time,
        source: 'rule',
      });
    } else if (appointment.status === 'scheduled' && startsIn <= 24 * 3_600_000) {
      add({
        id: `appointment-confirm:${appointment.id}`,
        severity: 'attention',
        domain: 'agenda',
        title: `Rendez-vous à confirmer · ${appointment.title}`,
        description: 'Le rendez-vous commence dans moins de 24 heures.',
        link: appointment.lead_id ? openLeadLink(appointment.lead_id) : '/calendar',
        dueAt: appointment.start_time,
        source: 'rule',
      });
    }
  }

  for (const item of (caseResult.data ?? []) as CaseRow[]) {
    if (item.status !== 'documents_pending' || !item.appointment_date) continue;
    const startsIn = new Date(item.appointment_date).getTime() - now;
    if (startsIn <= 48 * 3_600_000) {
      add({
        id: `case-documents:${item.id}`,
        severity: startsIn <= 24 * 3_600_000 ? 'urgent' : 'attention',
        domain: 'documents',
        title: `Pièces manquantes · ${item.case_number}`,
        description: 'Une intervention approche alors que le dossier documentaire est incomplet.',
        link: item.lead_id ? openLeadLink(item.lead_id) : '/glass',
        dueAt: item.appointment_date,
        source: 'rule',
      });
    }
  }

  for (const request of (documentResult.data ?? []) as DocumentRequestRow[]) {
    const requestAge = now - new Date(request.created_at).getTime();
    const hasRejectedRequired = (request.client_document_items ?? [])
      .some((item) => item.required && item.status === 'rejected');
    if (hasRejectedRequired) {
      add({
        id: `document-rejected:${request.id}`,
        severity: 'urgent',
        domain: 'documents',
        title: 'Document obligatoire refusé',
        description: 'Le client doit être recontacté pour remplacer une pièce refusée.',
        link: openLeadLink(request.lead_id),
        dueAt: request.created_at,
        source: 'rule',
      });
    } else if (!request.last_opened_at && requestAge >= 24 * 3_600_000) {
      add({
        id: `document-unopened:${request.id}`,
        severity: 'attention',
        domain: 'documents',
        title: 'Lien documents non ouvert',
        description: `Le lien envoyé il y a ${elapsedLabel(requestAge)} n’a pas encore été consulté.`,
        link: openLeadLink(request.lead_id),
        dueAt: request.created_at,
        source: 'rule',
      });
    }
  }

  const overdueInvoices = ((invoiceResult.data ?? []) as InvoiceRow[]).filter((invoice) => {
    const dueAt = invoice.due_date ? new Date(invoice.due_date).getTime() : null;
    return Number(invoice.remaining_amount) >= 1
      && (invoice.status === 'overdue' || Boolean(dueAt && dueAt < now));
  });
  if (overdueInvoices.length > 0) {
    const total = overdueInvoices.reduce(
      (sum, invoice) => sum + Number(invoice.remaining_amount),
      0,
    );
    const oldestDueAt = overdueInvoices
      .map((invoice) => invoice.due_date)
      .filter((date): date is string => Boolean(date))
      .sort()[0] ?? null;
    add({
      id: 'finance:overdue-invoices',
      severity: 'urgent',
      domain: 'finance',
      title: `${overdueInvoices.length} facture${overdueInvoices.length > 1 ? 's' : ''} en retard`,
      description: `${total.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })} restent à rapprocher ou encaisser.`,
      link: '/finance',
      dueAt: oldestDueAt,
      source: 'rule',
    });
  }

  const delayedGifts = ((giftResult.data ?? []) as GiftRow[]).filter((gift) => {
    const age = now - new Date(gift.created_at).getTime();
    return age >= 7 * 86_400_000;
  });
  if (delayedGifts.length > 0) {
    const oldestGift = delayedGifts
      .slice()
      .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    add({
      id: 'finance:delayed-gifts',
      severity: 'attention',
      domain: 'finance',
      title: `${delayedGifts.length} cadeau${delayedGifts.length > 1 ? 'x' : ''} ou virement${delayedGifts.length > 1 ? 's' : ''} à finaliser`,
      description: `Le plus ancien attend depuis ${elapsedLabel(now - new Date(oldestGift.created_at).getTime())}.`,
      link: '/finance',
      dueAt: oldestGift.created_at,
      source: 'rule',
    });
  }

  const latestInsights = new Map<string, InsightRow>();
  for (const insight of (insightResult.data ?? []) as InsightRow[]) {
    if (!latestInsights.has(insight.lead_id)) latestInsights.set(insight.lead_id, insight);
  }
  for (const insight of latestInsights.values()) {
    const lead = leadsById.get(insight.lead_id);
    if (!lead) continue;
    const action = asRecord(insight.next_action);
    const suggestedAt = typeof action.suggested_at === 'string' ? action.suggested_at : null;
    const priority = typeof action.priority === 'string' ? action.priority : 'normal';
    if (
      suggestedAt
      && new Date(suggestedAt).getTime() < now
      && !alerts.has(`lead-due:${lead.id}`)
    ) {
      add({
        id: `ai-action:${lead.id}`,
        severity: priority === 'urgent' || priority === 'high' ? 'urgent' : 'attention',
        domain: 'assistant',
        title: typeof action.label === 'string' ? action.label : `Suggestion IA · ${leadName(lead)}`,
        description: typeof action.reason === 'string'
          ? action.reason
          : 'Une action suggérée par le copilote arrive à échéance.',
        link: openLeadLink(lead.id),
        dueAt: suggestedAt,
        source: 'ai',
      });
    }

    const criticalWarning = (insight.warnings ?? [])
      .map(asRecord)
      .find((warning) => warning.severity === 'critical');
    if (criticalWarning) {
      add({
        id: `ai-warning:${lead.id}`,
        severity: 'urgent',
        domain: 'assistant',
        title: `Point critique · ${leadName(lead)}`,
        description: typeof criticalWarning.message === 'string'
          ? criticalWarning.message
          : 'Une contradiction importante doit être vérifiée.',
        link: openLeadLink(lead.id),
        dueAt: insight.created_at,
        source: 'ai',
      });
    }

    const staleFor = new Date(lead.updated_at).getTime() - new Date(insight.created_at).getTime();
    if (
      staleFor > 24 * 3_600_000
      && ['interested', 'documents_requested', 'documents_received'].includes(lead.status)
    ) {
      add({
        id: `ai-stale:${lead.id}`,
        severity: 'opportunity',
        domain: 'assistant',
        title: `Analyse à actualiser · ${leadName(lead)}`,
        description: 'La fiche a évolué depuis la dernière synthèse du copilote.',
        link: openLeadLink(lead.id),
        dueAt: null,
        source: 'ai',
      });
    }
  }

  return {
    alerts: [...alerts.values()].sort(alertComparator).slice(0, 60),
    generatedAt: new Date().toISOString(),
  };
}
