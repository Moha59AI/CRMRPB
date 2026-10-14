import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import {
  Search, Plus, FileText, Car, Shield, Wrench, Gift as GiftIcon, Calendar,
  Phone, MessageSquare, Receipt, CheckCircle2, Circle, AlertCircle,
  ArrowRight, ExternalLink, Loader2, X, RefreshCw, CalendarClock,
  ClipboardCheck, Banknote, ChevronRight, Clock3, LayoutDashboard,
  LayoutGrid, List, SlidersHorizontal, Send, ArrowUpDown,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FicheOverlay } from '@/features/fiche/fiche-overlay';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import type {
  WindscreenCase, Task, Profile, Lead, Contact,
  Insurer, Note, Activity, Invoice,
} from '@/types';
import { createNote, fetchActivities, fetchCommunications, fetchNotes } from '@/services/activity-service';
import { fetchGifts, fetchInvoices, fetchQuotes } from '@/services/billing-service';
import { fetchAfterSalesCases, fetchCaseById, fetchCaseDocuments, fetchGlassCases, toggleCaseDocument } from '@/services/cases-service';
import { fetchContacts, fetchInsurers } from '@/services/contacts-service';
import { fetchLeads } from '@/services/leads-service';
import {
  createTask, fetchAppointments, fetchTasks, type AppointmentAvecClient,
} from '@/services/planning-service';
import { fetchProfiles } from '@/services/profiles-service';
import { fetchAffaireByCaseId } from '@/services/affaires-service';
import { useEstMobile } from '@/hooks/use-media-query';
import { syncOnify } from '@/features/integrations/onify/onify-service';
import { useAuth } from '@/features/auth/auth-context';
import { cn } from '@/lib/utils';
import { Vehicle3DViewer } from './vehicle-3d-viewer';
import { VehicleThumbnail } from './vehicle-thumbnail';

// ============ CONSTANTS ============

const caseStatusLabels: Record<string, string> = {
  new: 'Nouveau',
  qualification: 'Qualification',
  documents_pending: 'Documents en attente',
  insurance_declaration: 'Déclaration assurance',
  glass_ordered: 'Vitrage commandé',
  appointment_scheduled: 'RDV planifié',
  intervention_done: 'Intervention réalisée',
  invoice_sent: 'Facture envoyée',
  payment_pending: 'Attente règlement',
  payment_received: 'Règlement reçu',
  gift_given: 'Cadeau remis',
  sav: 'SAV',
  completed: 'Terminé',
};

const caseStatusOrder: string[] = [
  'new', 'qualification', 'documents_pending', 'insurance_declaration',
  'glass_ordered', 'appointment_scheduled', 'intervention_done',
  'invoice_sent', 'payment_pending', 'payment_received', 'gift_given',
  'sav', 'completed',
];

type GlassStage = 'preparation' | 'planning' | 'intervention' | 'finance' | 'done' | 'sav';
type GlassProcessStep = 'declare' | 'sign' | 'lre' | 'followup' | 'paid';
type GlassProcessFilter = 'all' | GlassProcessStep;
type GlassViewMode = 'list' | 'cards';
type GlassInsightPanel = 'priorities' | 'appointments' | null;
type GlassSortOrder = 'arrival_desc' | 'arrival_asc' | 'updated_desc';

const glassStageDefinitions: Array<{
  key: GlassStage;
  label: string;
  description: string;
  statuses: string[];
}> = [
  {
    key: 'preparation',
    label: 'À préparer',
    description: 'Dossier et accord',
    statuses: ['new', 'qualification', 'documents_pending', 'insurance_declaration'],
  },
  {
    key: 'planning',
    label: 'Commande & RDV',
    description: 'Vitrage et créneau',
    statuses: ['glass_ordered', 'appointment_scheduled'],
  },
  {
    key: 'intervention',
    label: 'Intervention',
    description: 'Travaux réalisés',
    statuses: ['intervention_done'],
  },
  {
    key: 'finance',
    label: 'Facturation',
    description: 'Facture et règlement',
    statuses: ['invoice_sent', 'payment_pending'],
  },
  {
    key: 'done',
    label: 'Clôturés',
    description: 'Dossiers terminés',
    statuses: ['payment_received', 'gift_given', 'completed'],
  },
  {
    key: 'sav',
    label: 'SAV',
    description: 'À reprendre',
    statuses: ['sav'],
  },
];

function glassStageOf(caseData: WindscreenCase): GlassStage {
  if (caseData.status === 'sav') return 'sav';
  if (caseData.onify_archived) return 'done';
  return glassStageDefinitions.find((stage) => stage.statuses.includes(caseData.status))?.key ?? 'preparation';
}

const glassProcessDefinitions: Array<{
  key: GlassProcessStep;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  { key: 'declare', label: 'À déclarer', shortLabel: 'Décl.', description: 'Dossier à contrôler' },
  { key: 'sign', label: 'À signer', shortLabel: 'Sign.', description: 'Signature et intervention' },
  { key: 'lre', label: 'LRE à envoyer', shortLabel: 'LRE', description: 'Dossier à transmettre' },
  { key: 'followup', label: 'En relance', shortLabel: 'Rel.', description: 'Règlement à suivre' },
  { key: 'paid', label: 'Payés', shortLabel: 'Payé', description: 'Règlement terminé' },
];

function normalizeGlassSignal(...values: Array<string | null | undefined>): string {
  return values
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr-FR');
}

/**
 * La barre suit les cinq jalons visibles dans Onify. Les libellés Onify font
 * foi quand ils existent ; le statut CRM ne sert que de repli pour les
 * anciens dossiers. Un dossier finalisé mais non réglé reste en relance.
 */
function glassProcessStepOf(caseData: WindscreenCase): GlassProcessStep {
  const signal = normalizeGlassSignal(
    caseData.onify_stage,
    caseData.onify_status_code,
    caseData.onify_status_label,
    caseData.onify_work_status_code,
    caseData.onify_work_status_label,
    caseData.onify_payment_status,
  );

  if (
    caseData.status === 'payment_received'
    || caseData.status === 'gift_given'
    || caseData.onify_payment_status === 'complete'
    || /\b(paye|reglement complet|solde)\b/.test(signal)
  ) return 'paid';

  if (
    caseData.status === 'payment_pending'
    || caseData.status === 'completed'
    || ['tva_only', 'insurance_only', 'partial'].includes(caseData.onify_payment_status ?? '')
    || /(relance|attente reglement|partiellement paye|finalise)/.test(signal)
  ) return 'followup';

  if (
    caseData.status === 'invoice_sent'
    || caseData.status === 'intervention_done'
    || /(lre|lettre recommandee|a transmettre|a envoyer)/.test(signal)
  ) return 'lre';

  if (
    ['insurance_declaration', 'glass_ordered', 'appointment_scheduled'].includes(caseData.status)
    || /(sign|travaux autorises|travaux en attente|intervention)/.test(signal)
  ) return 'sign';

  return 'declare';
}

function glassProcessIndex(caseData: WindscreenCase): number {
  return glassProcessDefinitions.findIndex((step) => step.key === glassProcessStepOf(caseData));
}

type GlassInvoiceSummary = {
  hasInvoice: boolean;
  total: number;
  paid: number;
  due: number;
};

function summarizeInvoices(invoices: Invoice[]): GlassInvoiceSummary {
  if (invoices.length === 0) return { hasInvoice: false, total: 0, paid: 0, due: 0 };
  return invoices.reduce<GlassInvoiceSummary>((summary, invoice) => ({
    hasInvoice: true,
    total: summary.total + Number(invoice.amount_ttc || 0),
    paid: summary.paid + Number(invoice.amount_paid || 0),
    due: summary.due + Number(invoice.remaining_amount || 0),
  }), { hasInvoice: true, total: 0, paid: 0, due: 0 });
}

function daysSince(date: string | null | undefined): number | null {
  if (!date) return null;
  const timestamp = new Date(date).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((Date.now() - timestamp) / (24 * 60 * 60 * 1000)));
}

function glassCaseTimestamp(caseData: WindscreenCase, sortOrder: GlassSortOrder): number | null {
  const date = sortOrder === 'updated_desc'
    ? caseData.onify_updated_at ?? caseData.updated_at ?? caseData.onify_created_at ?? caseData.created_at
    : caseData.onify_created_at ?? caseData.created_at;
  if (!date) return null;
  const timestamp = new Date(date).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function compareGlassCases(a: WindscreenCase, b: WindscreenCase, sortOrder: GlassSortOrder): number {
  const aTimestamp = glassCaseTimestamp(a, sortOrder);
  const bTimestamp = glassCaseTimestamp(b, sortOrder);
  if (aTimestamp == null && bTimestamp == null) {
    return (a.onify_reference ?? a.case_number).localeCompare(
      b.onify_reference ?? b.case_number,
      'fr',
      { numeric: true },
    );
  }
  if (aTimestamp == null) return 1;
  if (bTimestamp == null) return -1;
  const dateComparison = sortOrder === 'arrival_asc'
    ? aTimestamp - bTimestamp
    : bTimestamp - aTimestamp;
  if (dateComparison !== 0) return dateComparison;
  return (a.onify_reference ?? a.case_number).localeCompare(
    b.onify_reference ?? b.case_number,
    'fr',
    { numeric: true },
  );
}

const onifyPaymentLabels: Record<string, string> = {
  pending: 'Aucun règlement reçu',
  tva_only: 'TVA réglée',
  insurance_only: 'Part assureur réglée',
  partial: 'Règlement partiel',
  complete: 'Règlement complet',
};

function getStatusColor(status: string): string {
  const early = ['new', 'qualification'];
  const mid = ['documents_pending', 'insurance_declaration', 'glass_ordered', 'appointment_scheduled', 'payment_pending'];
  const late = ['intervention_done', 'invoice_sent', 'payment_received', 'gift_given', 'completed'];
  const problem = ['sav'];
  if (early.includes(status)) return 'bg-upcoming-soft text-upcoming border-upcoming/25';
  if (mid.includes(status)) return 'bg-due-soft text-due border-due/25';
  if (late.includes(status)) return 'bg-done-soft text-done border-done/25';
  if (problem.includes(status)) return 'bg-urgent-soft text-urgent border-urgent/25';
  return 'bg-muted/50 text-foreground border-border';
}

const commTypeLabels: Record<string, string> = {
  sms_outbound: 'SMS envoyé', sms_inbound: 'SMS reçu',
  call_outbound: 'Appel sortant', call_inbound: 'Appel entrant',
  call_missed: 'Appel manqué', voicemail: 'Messagerie vocale',
  email_outbound: 'Email envoyé', email_inbound: 'Email reçu', note: 'Note',
};
const commStatusLabels: Record<string, string> = {
  pending: 'En attente', sent: 'Envoyé', delivered: 'Livré', failed: 'Échec',
  received: 'Reçu', answered: 'Répondu', missed: 'Manqué', cancelled: 'Annulé',
};
const taskStatusLabels: Record<string, string> = {
  pending: 'En attente', in_progress: 'En cours', done: 'Terminé', cancelled: 'Annulé',
};
const taskPriorityLabels: Record<string, string> = {
  low: 'Basse', normal: 'Normale', high: 'Haute', urgent: 'Urgente',
};
const taskTypeLabels: Record<string, string> = {
  call: 'Appel', sms: 'SMS', email: 'Email', follow_up: 'Relance', document: 'Document', other: 'Autre',
};
const appointmentStatusLabels: Record<string, string> = {
  scheduled: 'Planifié', confirmed: 'Confirmé', completed: 'Terminé', cancelled: 'Annulé', no_show: 'Absent',
};
const appointmentTypeLabels: Record<string, string> = {
  intervention: 'Intervention', call: 'Appel', meeting: 'Rendez-vous', other: 'Autre',
};
const invoiceStatusLabels: Record<string, string> = {
  draft: 'Brouillon', sent: 'Envoyée', paid: 'Payée', partial: 'Partielle', overdue: 'En retard', cancelled: 'Annulée',
};
const quoteStatusLabels: Record<string, string> = {
  draft: 'Brouillon', sent: 'Envoyé', accepted: 'Accepté', rejected: 'Refusé', expired: 'Expiré',
};
const giftStatusLabels: Record<string, string> = {
  pending: 'En attente', ordered: 'Commandé', given: 'Remis', cancelled: 'Annulé',
};
const afterSalesStatusLabels: Record<string, string> = {
  open: 'Ouvert', in_progress: 'En cours', resolved: 'Résolu', closed: 'Fermé',
};
const interventionTypeLabels: Record<string, string> = {
  home: 'À domicile', workshop: 'Atelier',
};

const euroFormat = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
function formatEuro(amount: number | null | undefined): string {
  if (amount == null || amount === 0) return '—';
  return euroFormat.format(amount);
}
function formatEuroExact(amount: number | null | undefined): string {
  if (amount == null) return '—';
  return euroFormat.format(amount);
}
function formatDate(date: string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function formatDateTime(date: string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function clientNameForCase(
  caseData: WindscreenCase,
  contactMap: Map<string, Contact>,
  leadMap: Map<string, Lead>,
): string {
  const contact = caseData.contact_id ? contactMap.get(caseData.contact_id) : null;
  if (contact) return `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() || 'Client sans nom';
  const lead = caseData.lead_id ? leadMap.get(caseData.lead_id) : null;
  return lead ? `${lead.first_name ?? ''} ${lead.last_name ?? ''}`.trim() || 'Client sans nom' : 'Client non rattaché';
}

function vehicleIdentityForCase(caseData: WindscreenCase, leadMap: Map<string, Lead>) {
  if (caseData.onify_vehicle_make || caseData.onify_vehicle_model) {
    return { make: caseData.onify_vehicle_make, model: caseData.onify_vehicle_model };
  }
  const lead = caseData.lead_id ? leadMap.get(caseData.lead_id) : null;
  return { make: lead?.vehicle_make ?? null, model: lead?.vehicle_model ?? null };
}

function vehicleForCase(caseData: WindscreenCase, leadMap: Map<string, Lead>): string {
  const vehicle = vehicleIdentityForCase(caseData, leadMap);
  return [vehicle.make, vehicle.model].filter(Boolean).join(' ');
}

function insurerForCase(
  caseData: WindscreenCase,
  insurerMap: Map<string, Insurer>,
  leadMap: Map<string, Lead>,
): string {
  if (caseData.onify_insurer_name) return caseData.onify_insurer_name;
  const insurer = caseData.insurer_id ? insurerMap.get(caseData.insurer_id) : null;
  if (insurer?.name) return insurer.name;
  const lead = caseData.lead_id ? leadMap.get(caseData.lead_id) : null;
  return lead?.insurance ?? '';
}

type GlassPriority = {
  caseData: WindscreenCase;
  title: string;
  detail: string;
  tone: 'urgent' | 'warning' | 'info';
  score: number;
};

// ============ MAIN PAGE ============

export function GlassPage() {
  const estMobile = useEstMobile();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [advisorFilter, setAdvisorFilter] = useState('all');
  const [insurerFilter, setInsurerFilter] = useState('all');
  const [billingFilter, setBillingFilter] = useState('all');
  const [processFilter, setProcessFilter] = useState<GlassProcessFilter>('all');
  const [sortOrder, setSortOrder] = useState<GlassSortOrder>('arrival_desc');
  const [viewMode, setViewMode] = useState<GlassViewMode>('list');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [insightPanel, setInsightPanel] = useState<GlassInsightPanel>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(searchParams.get('id'));
  const ouvrirDossier = (id: string) => {
    setSelectedCaseId(id);
    setSearchParams({ id }, { replace: true });
  };
  const fermerDossier = () => {
    setSelectedCaseId(null);
    setSearchParams({}, { replace: true });
  };

  const { data: glassCases, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['cases', 'glass', 'all'],
    queryFn: () => fetchGlassCases({}),
  });

  const synchroniser = useMutation({
    mutationFn: syncOnify,
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['cases'] }),
        queryClient.invalidateQueries({ queryKey: ['contacts'] }),
        queryClient.invalidateQueries({ queryKey: ['resumes-clients'] }),
        queryClient.invalidateQueries({ queryKey: ['leads'] }),
      ]);
      toast.success(
        `${result.glassCases} dossier${result.glassCases > 1 ? 's' : ''} Glass vérifié${result.glassCases > 1 ? 's' : ''}`,
      );
    },
    onError: (syncError: Error) => toast.error(syncError.message || 'Synchronisation Onify impossible'),
  });

  const { data: leads } = useQuery({ queryKey: ['leads-all'], queryFn: () => fetchLeads({}) });
  const { data: contacts } = useQuery({ queryKey: ['contacts-all'], queryFn: () => fetchContacts({}) });
  const { data: profiles } = useQuery({ queryKey: ['profiles-all'], queryFn: fetchProfiles });
  const { data: insurers } = useQuery({ queryKey: ['insurers-all'], queryFn: () => fetchInsurers() });
  const { data: allInvoices } = useQuery({
    queryKey: ['invoices-all'],
    queryFn: () => fetchInvoices({}),
  });
  const [dashboardRange] = useState(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 90);
    return { start: start.toISOString(), end: end.toISOString() };
  });
  const { data: appointments, isLoading: appointmentsLoading } = useQuery({
    queryKey: ['appointments', 'glass-dashboard', dashboardRange.start, dashboardRange.end],
    queryFn: () => fetchAppointments({ startDate: dashboardRange.start, endDate: dashboardRange.end }),
  });

  const leadMap = useMemo(() => {
    const m = new Map<string, Lead>();
    (leads ?? []).forEach((l) => m.set(l.id, l));
    return m;
  }, [leads]);

  const contactMap = useMemo(() => {
    const m = new Map<string, Contact>();
    (contacts ?? []).forEach((c) => m.set(c.id, c));
    return m;
  }, [contacts]);

  const profileMap = useMemo(() => {
    const m = new Map<string, Profile>();
    (profiles ?? []).forEach((p) => m.set(p.id, p));
    return m;
  }, [profiles]);

  const insurerMap = useMemo(() => {
    const m = new Map<string, Insurer>();
    (insurers ?? []).forEach((i) => m.set(i.id, i));
    return m;
  }, [insurers]);

  const allCases = useMemo(() => glassCases ?? [], [glassCases]);

  const processCounts = useMemo(() => {
    const counts: Record<GlassProcessStep, number> = {
      declare: 0,
      sign: 0,
      lre: 0,
      followup: 0,
      paid: 0,
    };
    allCases.forEach((caseData) => { counts[glassProcessStepOf(caseData)] += 1; });
    return counts;
  }, [allCases]);

  const invoicesByCase = useMemo(() => {
    const byCase = new Map<string, Invoice[]>();
    const caseByAffaire = new Map(
      allCases
        .filter((caseData) => Boolean(caseData.affaire_id))
        .map((caseData) => [caseData.affaire_id, caseData.id]),
    );

    (allInvoices ?? []).forEach((invoice) => {
      const caseId = invoice.case_id
        ?? (invoice.affaire_id ? caseByAffaire.get(invoice.affaire_id) : null);
      if (!caseId) return;
      byCase.set(caseId, [...(byCase.get(caseId) ?? []), invoice]);
    });
    return byCase;
  }, [allCases, allInvoices]);

  const availableInsurers = useMemo(() => (
    Array.from(new Set(allCases
      .map((caseData) => insurerForCase(caseData, insurerMap, leadMap))
      .filter((name): name is string => Boolean(name))))
      .sort((a, b) => a.localeCompare(b, 'fr'))
  ), [allCases, insurerMap, leadMap]);

  const linkedGlassAppointments = useMemo(() => {
    const byId = new Map(allCases.map((caseData) => [caseData.id, caseData]));
    const byAffaire = new Map(allCases.map((caseData) => [caseData.affaire_id, caseData]));
    return (appointments ?? [])
      .filter((appointment) => ['scheduled', 'confirmed'].includes(appointment.status))
      .map((appointment) => ({
        appointment,
        caseData: (appointment.case_id ? byId.get(appointment.case_id) : null)
          ?? (appointment.affaire_id ? byAffaire.get(appointment.affaire_id) : null),
      }))
      .filter((item): item is { appointment: AppointmentAvecClient; caseData: WindscreenCase } => Boolean(item.caseData));
  }, [allCases, appointments]);

  const dashboardAppointments = useMemo(
    () => linkedGlassAppointments.slice(0, 6),
    [linkedGlassAppointments],
  );

  const appointmentLinks = useMemo(() => {
    const links = new Set<string>();
    linkedGlassAppointments.forEach(({ appointment }) => {
      if (appointment.case_id) links.add(`case:${appointment.case_id}`);
      if (appointment.affaire_id) links.add(`affaire:${appointment.affaire_id}`);
    });
    return links;
  }, [linkedGlassAppointments]);

  const allPriorities = useMemo(() => {
    const now = Date.now();
    return allCases
      .map((caseData): GlassPriority | null => {
        if (glassStageOf(caseData) === 'done') return null;
        const reference = caseData.onify_reference ?? caseData.case_number;
        const linkedAppointment = appointmentLinks.has(`case:${caseData.id}`)
          || appointmentLinks.has(`affaire:${caseData.affaire_id}`)
          || Boolean(caseData.appointment_date && new Date(caseData.appointment_date).getTime() >= now);
        const appointmentTime = caseData.appointment_date
          ? new Date(caseData.appointment_date).getTime()
          : null;

        if (caseData.status === 'sav') {
          return { caseData, title: 'SAV à traiter', detail: `${reference} · reprise nécessaire`, tone: 'urgent', score: 100 };
        }
        if (caseData.status === 'payment_pending') {
          return { caseData, title: 'Règlement à suivre', detail: `${reference} · dossier non soldé`, tone: 'warning', score: 92 };
        }
        if (!caseData.contact_id && !caseData.lead_id) {
          return { caseData, title: 'Client à rattacher', detail: `${reference} · aucun contact relié`, tone: 'urgent', score: 88 };
        }
        if (appointmentTime && appointmentTime >= now && appointmentTime - now <= 48 * 60 * 60 * 1000) {
          return { caseData, title: 'Rendez-vous proche', detail: `${reference} · ${formatDateTime(caseData.appointment_date)}`, tone: 'info', score: 84 };
        }
        if (!caseData.onify_vehicle_registration && !caseData.vehicle_id && !vehicleForCase(caseData, leadMap)) {
          return { caseData, title: 'Véhicule à compléter', detail: `${reference} · plaque et modèle absents`, tone: 'warning', score: 76 };
        }
        if (glassStageOf(caseData) === 'preparation'
          && !caseData.onify_insurer_name
          && !caseData.insurer_id
          && !insurerForCase(caseData, insurerMap, leadMap)) {
          return { caseData, title: 'Assurance à compléter', detail: `${reference} · assureur non renseigné`, tone: 'warning', score: 70 };
        }
        if (['insurance_declaration', 'glass_ordered'].includes(caseData.status) && !linkedAppointment) {
          return { caseData, title: 'Rendez-vous à planifier', detail: `${reference} · aucun créneau relié`, tone: 'info', score: 64 };
        }

        const lastUpdate = caseData.onify_updated_at ?? caseData.updated_at;
        const ageInDays = Math.floor((now - new Date(lastUpdate).getTime()) / (24 * 60 * 60 * 1000));
        if (ageInDays >= 7) {
          return { caseData, title: 'Dossier sans mise à jour', detail: `${reference} · ${ageInDays} jours`, tone: 'info', score: 40 + Math.min(ageInDays, 30) };
        }
        return null;
      })
      .filter((priority): priority is GlassPriority => priority !== null)
      .sort((a, b) => b.score - a.score);
  }, [allCases, appointmentLinks, insurerMap, leadMap]);

  const visibleCases = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('fr-FR');
    return allCases.filter((caseData) => {
      if (processFilter !== 'all' && glassProcessStepOf(caseData) !== processFilter) return false;
      if (statusFilter !== 'all' && caseData.status !== statusFilter) return false;
      if (advisorFilter !== 'all' && caseData.assigned_user_id !== advisorFilter) return false;
      if (insurerFilter !== 'all' && insurerForCase(caseData, insurerMap, leadMap) !== insurerFilter) return false;

      const invoiceSummary = summarizeInvoices(invoicesByCase.get(caseData.id) ?? []);
      if (billingFilter === 'no_invoice' && invoiceSummary.hasInvoice) return false;
      if (billingFilter === 'due' && (!invoiceSummary.hasInvoice || invoiceSummary.due <= 0)) return false;
      if (billingFilter === 'paid' && (!invoiceSummary.hasInvoice || invoiceSummary.due > 0)) return false;

      if (!needle) return true;
      const searchable = [
        caseData.case_number,
        caseData.onify_reference,
        caseData.onify_vehicle_registration,
        vehicleForCase(caseData, leadMap),
        insurerForCase(caseData, insurerMap, leadMap),
        clientNameForCase(caseData, contactMap, leadMap),
        caseData.onify_status_label,
        caseData.onify_work_status_label,
      ].filter(Boolean).join(' ').toLocaleLowerCase('fr-FR');
      return searchable.includes(needle);
    }).sort((a, b) => compareGlassCases(a, b, sortOrder));
  }, [
    advisorFilter, allCases, billingFilter, contactMap, insurerFilter, insurerMap,
    invoicesByCase, leadMap, processFilter, search, sortOrder, statusFilter,
  ]);

  const activeCount = allCases.length - processCounts.paid;
  const lastSyncAt = allCases
    .map((caseData) => caseData.onify_synced_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  const activeFilterCount = [
    statusFilter !== 'all',
    advisorFilter !== 'all',
    insurerFilter !== 'all',
    billingFilter !== 'all',
  ].filter(Boolean).length;

  return (
    <>
      <PageHeader
        title="Glass"
        description="Tous les dossiers Glass repris depuis Onify, pilotés du premier contrôle jusqu'au règlement"
        action={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {profile?.role === 'admin' && (
              <Button
                variant="outline"
                className="w-full rounded-full sm:w-auto"
                onClick={() => synchroniser.mutate()}
                disabled={synchroniser.isPending}
              >
                {synchroniser.isPending
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <RefreshCw className="mr-2 h-4 w-4" />}
                Synchroniser Onify
              </Button>
            )}
            <Button
              className="w-full rounded-full sm:w-auto"
              onClick={() => window.open('https://app.onify.fr/glass/edition', '_blank', 'noopener,noreferrer')}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Créer dans Onify
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto bg-muted/15 scrollbar-thin">
        <div className="gutter-x space-y-5 py-5 sm:py-6">
        {isLoading && (
          <div className="space-y-5">
            <Skeleton className="h-36 w-full rounded-2xl" />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full rounded-2xl" />
              ))}
            </div>
            <Skeleton className="h-72 w-full rounded-2xl" />
          </div>
        )}

        {isError && (
          <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-border bg-card p-12 text-center shadow-sm">
            <AlertCircle className="mb-3 h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">{(error as Error)?.message || 'Erreur de chargement'}</p>
            <Button variant="outline" className="mt-4 rounded-full" onClick={() => refetch()}>
              Réessayer
            </Button>
          </div>
        )}

        {!isLoading && !isError && allCases.length === 0 && (
          <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-border bg-card p-12 text-center shadow-sm">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-muted/50">
              <FileText className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <h3 className="text-sm font-semibold text-foreground">Aucun dossier Glass synchronisé</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Le contact reste un prospect tant que ses pièces ne sont pas reçues. Après création dans Onify, le dossier apparaît ici et le contact passe automatiquement dans Clients.
            </p>
            <Button
              className="mt-4 rounded-full"
              onClick={() => window.open('https://app.onify.fr/glass/edition', '_blank', 'noopener,noreferrer')}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Ouvrir Onify
            </Button>
          </div>
        )}

        {!isLoading && !isError && allCases.length > 0 && (
          <>
            <GlassDashboardSummary
              total={allCases.length}
              active={activeCount}
              priorities={allPriorities.length}
              appointments={linkedGlassAppointments.length}
              paid={processCounts.paid}
              lastSyncAt={lastSyncAt}
              activePanel={insightPanel}
              onTogglePanel={(panel) => setInsightPanel((current) => current === panel ? null : panel)}
            />

            <GlassWorkflow
              total={allCases.length}
              counts={processCounts}
              activeStep={processFilter}
              onStepChange={(step) => {
                setProcessFilter((current) => current === step ? 'all' : step);
                setStatusFilter('all');
              }}
            />

            {insightPanel === 'priorities' && (
              <GlassPriorities
                priorities={allPriorities.slice(0, 8)}
                leadMap={leadMap}
                contactMap={contactMap}
                onOpen={ouvrirDossier}
              />
            )}

            {insightPanel === 'appointments' && (
              <GlassUpcomingAppointments
                appointments={dashboardAppointments}
                loading={appointmentsLoading}
                leadMap={leadMap}
                contactMap={contactMap}
                onOpen={ouvrirDossier}
              />
            )}

            <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div>
                  <div className="flex items-center gap-2">
                    <LayoutDashboard className="h-4 w-4 text-primary" />
                    <h2 className="text-sm font-semibold text-foreground">Mes dossiers Glass</h2>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {visibleCases.length} dossier{visibleCases.length > 1 ? 's' : ''} affiché{visibleCases.length > 1 ? 's' : ''} sur {allCases.length}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {processFilter !== 'all' && (
                    <Badge variant="outline" className="hidden rounded-full border-primary/30 bg-primary/5 text-primary sm:inline-flex">
                      {glassProcessDefinitions.find((step) => step.key === processFilter)?.label}
                    </Badge>
                  )}
                  {!estMobile && (
                    <div className="flex rounded-xl border border-border bg-muted/30 p-1" aria-label="Choisir l'affichage">
                      <button
                        type="button"
                        aria-label="Vue cartes"
                        aria-pressed={viewMode === 'cards'}
                        onClick={() => setViewMode('cards')}
                        className={cn(
                          'flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors',
                          viewMode === 'cards' && 'bg-card text-foreground shadow-sm',
                        )}
                      >
                        <LayoutGrid className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Vue liste"
                        aria-pressed={viewMode === 'list'}
                        onClick={() => setViewMode('list')}
                        className={cn(
                          'flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors',
                          viewMode === 'list' && 'bg-card text-foreground shadow-sm',
                        )}
                      >
                        <List className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/20 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1 sm:min-w-[320px]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Rechercher un dossier, un client, une plaque..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="rounded-xl bg-card pl-9"
                    />
                  </div>
                </div>

                <Select value={sortOrder} onValueChange={(value) => setSortOrder(value as GlassSortOrder)}>
                  <SelectTrigger className="w-full rounded-xl bg-card sm:w-[230px]" aria-label="Trier les dossiers">
                    <ArrowUpDown className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="arrival_desc">Arrivée : plus récents</SelectItem>
                    <SelectItem value="arrival_asc">Arrivée : plus anciens</SelectItem>
                    <SelectItem value="updated_desc">Dernière mise à jour</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  type="button"
                  variant={filtersOpen || activeFilterCount > 0 ? 'secondary' : 'outline'}
                  className="rounded-xl"
                  onClick={() => setFiltersOpen((open) => !open)}
                >
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  Filtres avancés
                  {activeFilterCount > 0 && (
                    <span className="ml-2 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>

                {(search || activeFilterCount > 0 || processFilter !== 'all') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => {
                      setSearch('');
                      setStatusFilter('all');
                      setAdvisorFilter('all');
                      setInsurerFilter('all');
                      setBillingFilter('all');
                      setProcessFilter('all');
                    }}
                  >
                    <X className="mr-1 h-3.5 w-3.5" />
                    Effacer
                  </Button>
                )}
              </div>

              {filtersOpen && (
                <div className="grid gap-3 border-b border-border bg-card px-4 py-4 sm:grid-cols-2 sm:px-5 xl:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Statut du dossier</Label>
                    <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); setProcessFilter('all'); }}>
                      <SelectTrigger className="w-full rounded-lg bg-card"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tous les statuts</SelectItem>
                        {caseStatusOrder.map((status) => (
                          <SelectItem key={status} value={status}>{caseStatusLabels[status]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Assurance</Label>
                    <Select value={insurerFilter} onValueChange={setInsurerFilter}>
                      <SelectTrigger className="w-full rounded-lg bg-card"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Toutes les assurances</SelectItem>
                        {availableInsurers.map((insurer) => (
                          <SelectItem key={insurer} value={insurer}>{insurer}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Règlement</Label>
                    <Select value={billingFilter} onValueChange={setBillingFilter}>
                      <SelectTrigger className="w-full rounded-lg bg-card"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tous les règlements</SelectItem>
                        <SelectItem value="no_invoice">Sans facture</SelectItem>
                        <SelectItem value="due">Montant restant dû</SelectItem>
                        <SelectItem value="paid">Facture soldée</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Conseiller</Label>
                    <Select value={advisorFilter} onValueChange={setAdvisorFilter}>
                      <SelectTrigger className="w-full rounded-lg bg-card"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tous les conseillers</SelectItem>
                        {(profiles ?? []).map((advisor) => (
                          <SelectItem key={advisor.id} value={advisor.id}>
                            {advisor.first_name} {advisor.last_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {visibleCases.length === 0 ? (
                <div className="flex min-h-48 flex-col items-center justify-center p-8 text-center">
                  <Search className="h-7 w-7 text-muted-foreground" />
                  <p className="mt-3 text-sm font-medium text-foreground">Aucun dossier avec ces filtres</p>
                  <p className="mt-1 text-xs text-muted-foreground">Effacez un filtre ou choisissez une autre étape.</p>
                </div>
              ) : estMobile ? (
                <ul className="divide-y divide-border">
                  {visibleCases.map((caseData) => (
                    <CaseMobileRow
                      key={caseData.id}
                      caseData={caseData}
                      leadMap={leadMap}
                      contactMap={contactMap}
                      profileMap={profileMap}
                      insurerMap={insurerMap}
                      invoices={invoicesByCase.get(caseData.id) ?? []}
                      onOpen={() => ouvrirDossier(caseData.id)}
                    />
                  ))}
                </ul>
              ) : viewMode === 'cards' ? (
                <div className="grid gap-4 bg-muted/10 p-4 md:grid-cols-2 2xl:grid-cols-3">
                  {visibleCases.map((caseData) => (
                    <GlassCaseCard
                      key={caseData.id}
                      caseData={caseData}
                      leadMap={leadMap}
                      contactMap={contactMap}
                      insurerMap={insurerMap}
                      invoices={invoicesByCase.get(caseData.id) ?? []}
                      onOpen={() => ouvrirDossier(caseData.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="min-w-[1180px]">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-[18%] text-xs">Client / dépôt</TableHead>
                        <TableHead className="text-xs">Véhicule</TableHead>
                        <TableHead className="w-[18%] text-xs">Assurance / intervention</TableHead>
                        <TableHead className="text-xs">Statut du dossier</TableHead>
                        <TableHead className="w-[230px] text-xs">Avancement</TableHead>
                        <TableHead className="text-xs">Montants / règlement</TableHead>
                        <TableHead className="text-right text-xs">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleCases.map((caseData) => (
                        <CaseRow
                          key={caseData.id}
                          caseData={caseData}
                          leadMap={leadMap}
                          contactMap={contactMap}
                          profileMap={profileMap}
                          insurerMap={insurerMap}
                          invoices={invoicesByCase.get(caseData.id) ?? []}
                          onOpen={() => ouvrirDossier(caseData.id)}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>
          </>
        )}
        </div>
      </div>

      {/* Detail sheet */}
      {selectedCaseId && (
        <CaseDetailSheet
          caseId={selectedCaseId}
          onClose={fermerDossier}
          leadMap={leadMap}
          contactMap={contactMap}
          profileMap={profileMap}
          insurerMap={insurerMap}
        />
      )}

    </>
  );
}

function GlassDashboardSummary({
  total, active, priorities, appointments, paid, lastSyncAt, activePanel, onTogglePanel,
}: {
  total: number;
  active: number;
  priorities: number;
  appointments: number;
  paid: number;
  lastSyncAt?: string;
  activePanel: GlassInsightPanel;
  onTogglePanel: (panel: Exclude<GlassInsightPanel, null>) => void;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card px-4 py-4 shadow-sm sm:px-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Wrench className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Glass · dossiers</p>
            <p className="mt-0.5 text-sm font-medium text-foreground">{total} dossiers synchronisés depuis Onify</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <div className="flex min-w-[130px] items-center gap-3 rounded-xl border border-border bg-muted/20 px-3 py-2.5">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            <span>
              <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">Actifs</span>
              <span className="block text-sm font-semibold tabular-nums text-foreground">{active}</span>
            </span>
          </div>
          <button
            type="button"
            aria-pressed={activePanel === 'priorities'}
            onClick={() => onTogglePanel('priorities')}
            className={cn(
              'flex min-w-[130px] items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
              activePanel === 'priorities' ? 'border-due/40 bg-due-soft' : 'border-border hover:bg-muted/30',
            )}
          >
            <AlertCircle className="h-4 w-4 text-due" />
            <span>
              <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">À traiter</span>
              <span className="block text-sm font-semibold tabular-nums text-foreground">{priorities}</span>
            </span>
          </button>
          <button
            type="button"
            aria-pressed={activePanel === 'appointments'}
            onClick={() => onTogglePanel('appointments')}
            className={cn(
              'flex min-w-[130px] items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
              activePanel === 'appointments' ? 'border-upcoming/40 bg-upcoming-soft' : 'border-border hover:bg-muted/30',
            )}
          >
            <CalendarClock className="h-4 w-4 text-upcoming" />
            <span>
              <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">RDV à venir</span>
              <span className="block text-sm font-semibold tabular-nums text-foreground">{appointments}</span>
            </span>
          </button>
          <div className="flex min-w-[130px] items-center gap-3 rounded-xl border border-border bg-done-soft/60 px-3 py-2.5">
            <CheckCircle2 className="h-4 w-4 text-done" />
            <span>
              <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">Payés</span>
              <span className="block text-sm font-semibold tabular-nums text-foreground">{paid}</span>
            </span>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
        <RefreshCw className="h-3.5 w-3.5 text-primary" />
        <span>Dernière synchro : {lastSyncAt ? formatDateTime(lastSyncAt) : 'non disponible'}</span>
      </div>
    </section>
  );
}

function GlassWorkflow({
  total, counts, activeStep, onStepChange,
}: {
  total: number;
  counts: Record<GlassProcessStep, number>;
  activeStep: GlassProcessFilter;
  onStepChange: (step: GlassProcessStep) => void;
}) {
  const icons: Record<GlassProcessStep, typeof FileText> = {
    declare: Shield,
    sign: ClipboardCheck,
    lre: Send,
    followup: Phone,
    paid: Banknote,
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="overflow-x-auto px-3 py-4 scrollbar-thin sm:px-5">
        <div className="relative grid min-w-[720px] grid-cols-6 gap-2">
          <span className="pointer-events-none absolute left-[8.5%] right-[8.5%] top-[19px] h-px bg-border" />
          <button
            type="button"
            aria-pressed={activeStep === 'all'}
            onClick={() => activeStep !== 'all' && onStepChange(activeStep)}
            className="group relative z-10 flex flex-col items-center text-center"
          >
            <span className={cn(
              'flex h-10 w-10 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm transition-colors',
              activeStep === 'all' && 'border-primary bg-primary text-primary-foreground',
            )}>
              <LayoutDashboard className="h-4 w-4" />
            </span>
            <span className="mt-2 text-xs font-semibold text-foreground">Tous</span>
            <span className="mt-0.5 text-[11px] font-semibold tabular-nums text-primary">{total}</span>
          </button>

          {glassProcessDefinitions.map((step) => {
          const Icon = icons[step.key];
          const selected = activeStep === step.key;
          return (
            <button
              key={step.key}
              type="button"
              aria-pressed={selected}
              onClick={() => onStepChange(step.key)}
              className="group relative z-10 flex flex-col items-center text-center"
            >
              <span className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm transition-all group-hover:border-primary/40 group-hover:text-primary',
                selected && 'border-primary bg-primary text-primary-foreground ring-4 ring-primary/10',
                step.key === 'paid' && !selected && 'border-done/35 bg-done-soft text-done',
              )}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="mt-2 text-xs font-semibold text-foreground">{step.label}</span>
              <span className="mt-0.5 text-[11px] font-semibold tabular-nums text-primary">{counts[step.key]}</span>
            </button>
          );
        })}
        </div>
      </div>
    </section>
  );
}

function GlassPriorities({
  priorities, leadMap, contactMap, onOpen,
}: {
  priorities: GlassPriority[];
  leadMap: Map<string, Lead>;
  contactMap: Map<string, Contact>;
  onOpen: (id: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
        <div>
          <h2 className="text-sm font-semibold text-foreground">À traiter en priorité</h2>
          <p className="mt-1 text-xs text-muted-foreground">Les dossiers qui demandent une action claire.</p>
        </div>
        <Badge variant="outline" className="rounded-full bg-surface text-xs">{priorities.length}</Badge>
      </div>

      {priorities.length === 0 ? (
        <div className="flex min-h-44 flex-col items-center justify-center p-8 text-center">
          <CheckCircle2 className="h-7 w-7 text-done" />
          <p className="mt-3 text-sm font-medium text-foreground">Aucune priorité détectée</p>
          <p className="mt-1 text-xs text-muted-foreground">Les dossiers actifs sont à jour.</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {priorities.map((priority) => {
            const Icon = priority.tone === 'urgent' ? AlertCircle : priority.tone === 'warning' ? ClipboardCheck : Clock3;
            const clientName = clientNameForCase(priority.caseData, contactMap, leadMap);
            const vehicle = vehicleForCase(priority.caseData, leadMap);
            return (
              <button
                key={priority.caseData.id}
                type="button"
                onClick={() => onOpen(priority.caseData.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/35 sm:px-5"
              >
                <span className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                  priority.tone === 'urgent' && 'bg-urgent-soft text-urgent',
                  priority.tone === 'warning' && 'bg-due-soft text-due',
                  priority.tone === 'info' && 'bg-upcoming-soft text-upcoming',
                )}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="truncate text-sm font-semibold text-foreground">{clientName}</span>
                    {vehicle && <span className="truncate text-[11px] text-muted-foreground">{vehicle}</span>}
                  </span>
                  <span className="mt-0.5 block text-xs font-medium text-foreground">{priority.title}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{priority.detail}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function GlassUpcomingAppointments({
  appointments, loading, leadMap, contactMap, onOpen,
}: {
  appointments: Array<{ appointment: AppointmentAvecClient; caseData: WindscreenCase }>;
  loading: boolean;
  leadMap: Map<string, Lead>;
  contactMap: Map<string, Contact>;
  onOpen: (id: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Prochains rendez-vous</h2>
          <p className="mt-1 text-xs text-muted-foreground">Créneaux reliés aux dossiers Glass.</p>
        </div>
        <Calendar className="h-4 w-4 text-primary" />
      </div>

      {loading ? (
        <div className="space-y-3 p-4">
          {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-14 w-full rounded-lg" />)}
        </div>
      ) : appointments.length === 0 ? (
        <div className="flex min-h-44 flex-col items-center justify-center p-8 text-center">
          <CalendarClock className="h-7 w-7 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-foreground">Aucun rendez-vous relié</p>
          <p className="mt-1 text-xs text-muted-foreground">Les prochains créneaux Glass apparaîtront ici.</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {appointments.map(({ appointment, caseData }) => {
            const start = new Date(appointment.start_time);
            const clientName = clientNameForCase(caseData, contactMap, leadMap);
            return (
              <button
                key={appointment.id}
                type="button"
                onClick={() => onOpen(caseData.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/35 sm:px-5"
              >
                <span className="flex w-12 shrink-0 flex-col items-center rounded-lg border border-primary/20 bg-primary/5 px-1.5 py-1.5 text-primary">
                  <span className="text-[9px] font-semibold uppercase">{start.toLocaleDateString('fr-FR', { month: 'short' })}</span>
                  <span className="text-lg font-semibold leading-none tabular-nums">{start.toLocaleDateString('fr-FR', { day: '2-digit' })}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">{clientName}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · {appointment.title}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                    {appointment.address || vehicleForCase(caseData, leadMap) || caseData.onify_reference || caseData.case_number}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function CaseMobileRow({
  caseData, leadMap, contactMap, profileMap, insurerMap, invoices, onOpen,
}: {
  caseData: WindscreenCase;
  leadMap: Map<string, Lead>;
  contactMap: Map<string, Contact>;
  profileMap: Map<string, Profile>;
  insurerMap: Map<string, Insurer>;
  invoices: Invoice[];
  onOpen: () => void;
}) {
  const clientName = clientNameForCase(caseData, contactMap, leadMap);
  const vehicleIdentity = vehicleIdentityForCase(caseData, leadMap);
  const vehicleInfo = vehicleForCase(caseData, leadMap);
  const insurerName = insurerForCase(caseData, insurerMap, leadMap);
  const advisor = caseData.assigned_user_id
    ? profileMap.get(caseData.assigned_user_id)
    : null;
  const advisorName = advisor
    ? `${advisor.first_name ?? ''} ${advisor.last_name ?? ''}`.trim()
    : '';
  const invoiceSummary = summarizeInvoices(invoices);
  const currentStep = glassProcessDefinitions.find((step) => step.key === glassProcessStepOf(caseData));

  return (
    <li className="p-3">
      <button
        type="button"
        onClick={onOpen}
        className="w-full rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-colors active:bg-muted/40"
        aria-label={`Ouvrir le dossier ${caseData.case_number}`}
      >
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-foreground">{clientName}</span>
            <span className="mt-1 block text-[11px] font-medium text-muted-foreground">
              {caseData.onify_reference ?? caseData.case_number} · déposé le {formatDate(caseData.onify_created_at ?? caseData.created_at)}
            </span>
          </span>
          <StatusBadge
            status={caseData.status}
            label={caseData.onify_work_status_label ?? caseData.onify_status_label}
            className="shrink-0"
          />
        </span>

        <span className="mt-3 flex items-center gap-3 text-xs">
          <VehicleThumbnail
            make={vehicleIdentity.make}
            model={vehicleIdentity.model}
            className="h-14 w-20"
          />
          <span className="min-w-0 text-foreground">
            <span className="block truncate font-medium">{vehicleInfo || 'Véhicule non renseigné'}</span>
            <span className="text-[11px] text-muted-foreground">{caseData.onify_vehicle_registration || 'Plaque non renseignée'}</span>
          </span>
        </span>
        <span className="mt-2 flex items-center gap-2 text-xs">
          <Shield className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
          <span className="min-w-0 truncate text-muted-foreground">{insurerName || 'Assurance non renseignée'}</span>
        </span>

        <span className="mt-4 block">
          <GlassProgressTrack caseData={caseData} compact />
        </span>

        <span className="mt-4 flex items-end justify-between gap-3 border-t border-border pt-3">
          <span className="min-w-0 text-[11px] text-muted-foreground">
            <span className="block truncate">{advisorName || 'Non attribué'} · RDV {formatDate(caseData.appointment_date)}</span>
            <span className="mt-0.5 block font-semibold text-foreground">
              {invoiceSummary.hasInvoice
                ? `${formatEuroExact(invoiceSummary.due)} restant dû`
                : 'Pas de facture'}
            </span>
          </span>
          <span className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
            {currentStep?.key === 'paid' ? 'Consulter' : currentStep?.label}
          </span>
        </span>
      </button>
    </li>
  );
}

function GlassCaseCard({
  caseData, leadMap, contactMap, insurerMap, invoices, onOpen,
}: {
  caseData: WindscreenCase;
  leadMap: Map<string, Lead>;
  contactMap: Map<string, Contact>;
  insurerMap: Map<string, Insurer>;
  invoices: Invoice[];
  onOpen: () => void;
}) {
  const clientName = clientNameForCase(caseData, contactMap, leadMap);
  const vehicleIdentity = vehicleIdentityForCase(caseData, leadMap);
  const vehicle = vehicleForCase(caseData, leadMap);
  const insurer = insurerForCase(caseData, insurerMap, leadMap);
  const invoiceSummary = summarizeInvoices(invoices);
  const process = glassProcessDefinitions.find((step) => step.key === glassProcessStepOf(caseData));

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
      <button type="button" className="block w-full text-left" onClick={onOpen}>
        <span className="flex items-start justify-between gap-3 border-b border-border px-4 py-4">
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-foreground">{clientName}</span>
            <span className="mt-1 block text-[11px] text-muted-foreground">
              {caseData.onify_reference ?? caseData.case_number} · déposé le {formatDate(caseData.onify_created_at ?? caseData.created_at)}
            </span>
          </span>
          <StatusBadge status={caseData.status} label={caseData.onify_work_status_label ?? caseData.onify_status_label} className="shrink-0" />
        </span>

        <span className="block p-4">
          <span className="flex items-center gap-3 rounded-xl bg-muted/25 p-3">
            <VehicleThumbnail
              make={vehicleIdentity.make}
              model={vehicleIdentity.model}
              className="h-14 w-20 shadow-sm"
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-foreground">{vehicle || 'Véhicule à compléter'}</span>
              <span className="mt-0.5 block text-xs font-medium tracking-wide text-muted-foreground">
                {caseData.onify_vehicle_registration || 'Immatriculation non renseignée'}
              </span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">{caseData.glass_type || 'Vitrage à préciser'}</span>
            </span>
          </span>

          <span className="mt-4 block"><GlassProgressTrack caseData={caseData} compact /></span>

          <span className="mt-4 grid grid-cols-2 gap-3">
            <span className="rounded-xl border border-border p-3">
              <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">Assurance</span>
              <span className="mt-1 block truncate text-xs font-semibold text-foreground">{insurer || 'À compléter'}</span>
              <span className="mt-1 block text-[11px] text-muted-foreground">Franchise {formatEuro(caseData.franchise_amount)}</span>
            </span>
            <span className="rounded-xl border border-border p-3">
              <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">Règlement</span>
              <span className="mt-1 block text-xs font-semibold text-foreground">
                {invoiceSummary.hasInvoice ? formatEuroExact(invoiceSummary.total) : 'Pas de facture'}
              </span>
              <span className="mt-1 block text-[11px] text-muted-foreground">
                {invoiceSummary.hasInvoice ? `${formatEuroExact(invoiceSummary.due)} restant dû` : 'Montant indisponible'}
              </span>
            </span>
          </span>
        </span>

        <span className="flex items-center justify-between border-t border-border bg-muted/15 px-4 py-3">
          <span className="text-[11px] text-muted-foreground">
            {caseData.appointment_date ? `RDV ${formatDateTime(caseData.appointment_date)}` : 'Aucun rendez-vous planifié'}
          </span>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
            {process?.key === 'paid' ? 'Consulter' : process?.label}
            <ChevronRight className="h-3.5 w-3.5" />
          </span>
        </span>
      </button>
    </article>
  );
}

// ============ CASE ROW ============

function CaseRow({
  caseData, leadMap, contactMap, profileMap, insurerMap, invoices, onOpen,
}: {
  caseData: WindscreenCase;
  leadMap: Map<string, Lead>;
  contactMap: Map<string, Contact>;
  profileMap: Map<string, Profile>;
  insurerMap: Map<string, Insurer>;
  invoices: Invoice[];
  onOpen: () => void;
}) {
  const clientName = clientNameForCase(caseData, contactMap, leadMap);
  const vehicleIdentity = vehicleIdentityForCase(caseData, leadMap);
  const vehicleInfo = vehicleForCase(caseData, leadMap);
  const insurerName = insurerForCase(caseData, insurerMap, leadMap);
  const advisor = caseData.assigned_user_id ? profileMap.get(caseData.assigned_user_id) : null;
  const advisorName = advisor ? `${advisor.first_name ?? ''} ${advisor.last_name ?? ''}`.trim() : null;
  const invoiceSummary = summarizeInvoices(invoices);
  const currentStep = glassProcessDefinitions.find((step) => step.key === glassProcessStepOf(caseData));
  const age = daysSince(caseData.onify_updated_at ?? caseData.updated_at);

  return (
    <TableRow className="cursor-pointer align-top hover:bg-muted/35" onClick={onOpen}>
      <TableCell className="py-4">
        <p className="max-w-[220px] truncate text-sm font-semibold text-foreground">{clientName}</p>
        <p className="mt-1 text-[11px] font-medium text-muted-foreground">{caseData.onify_reference ?? caseData.case_number}</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">Déposé le {formatDate(caseData.onify_created_at ?? caseData.created_at)}</p>
        {caseData.appointment_date && (
          <p className="mt-1 text-[10px] font-medium text-primary">RDV {formatDateTime(caseData.appointment_date)}</p>
        )}
      </TableCell>
      <TableCell className="py-4">
        <div className="flex min-w-[230px] items-center gap-3">
          <VehicleThumbnail
            make={vehicleIdentity.make}
            model={vehicleIdentity.model}
            className="h-14 w-20"
          />
          <div className="min-w-0">
            <p className="max-w-[180px] truncate text-sm font-medium text-foreground">{vehicleInfo || 'À compléter'}</p>
            <p className="mt-1 text-xs font-medium tracking-wide text-muted-foreground">{caseData.onify_vehicle_registration || '—'}</p>
          </div>
        </div>
      </TableCell>
      <TableCell className="py-4">
        <p className="max-w-[200px] truncate text-sm font-medium text-foreground">{insurerName || 'Assurance à compléter'}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">Franchise · {formatEuro(caseData.franchise_amount)}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{caseData.glass_type || 'Vitrage à préciser'}</p>
      </TableCell>
      <TableCell className="py-4">
        <StatusBadge
          status={caseData.status}
          label={caseData.onify_work_status_label ?? caseData.onify_status_label}
        />
        <p className="mt-2 text-[10px] text-muted-foreground">
          {age == null ? 'Mise à jour inconnue' : `Mis à jour il y a ${age} j`}
        </p>
        {advisorName && <p className="mt-0.5 max-w-[150px] truncate text-[10px] text-muted-foreground">{advisorName}</p>}
      </TableCell>
      <TableCell className="py-4">
        <GlassProgressTrack caseData={caseData} compact />
      </TableCell>
      <TableCell className="py-4">
        {invoiceSummary.hasInvoice ? (
          <>
            <p className="text-sm font-semibold text-foreground">{formatEuroExact(invoiceSummary.total)}</p>
            <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">TTC facturé</p>
            <p className={cn('mt-1 text-xs font-medium', invoiceSummary.due > 0 ? 'text-due' : 'text-done')}>
              {invoiceSummary.due > 0 ? `${formatEuroExact(invoiceSummary.due)} restant dû` : 'Soldé'}
            </p>
          </>
        ) : (
          <>
            <p className="text-xs font-medium text-due">Pas de facture</p>
            <p className="mt-1 text-[10px] text-muted-foreground">Montant indisponible</p>
          </>
        )}
      </TableCell>
      <TableCell className="py-4 text-right">
        <Button
          type="button"
          size="sm"
          variant={currentStep?.key === 'paid' ? 'outline' : 'secondary'}
          className="rounded-full whitespace-nowrap"
          onClick={(event) => { event.stopPropagation(); onOpen(); }}
        >
          {currentStep?.key === 'paid' ? 'Consulter' : currentStep?.label}
          <ChevronRight className="ml-1 h-3.5 w-3.5" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function GlassProgressTrack({ caseData, compact = false }: { caseData: WindscreenCase; compact?: boolean }) {
  const activeIndex = glassProcessIndex(caseData);

  return (
    <div className="relative grid grid-cols-5 gap-1" aria-label={`Avancement : ${glassProcessDefinitions[activeIndex]?.label ?? 'À déclarer'}`}>
      <span className="pointer-events-none absolute left-[10%] right-[10%] top-[9px] h-px bg-border" />
      {glassProcessDefinitions.map((step, index) => {
        const completed = index < activeIndex;
        const active = index === activeIndex;
        return (
          <span key={step.key} className="relative z-10 flex min-w-0 flex-col items-center text-center">
            <span className={cn(
              'flex h-[19px] w-[19px] items-center justify-center rounded-full border bg-card text-[9px] font-semibold',
              completed && 'border-done bg-done text-white',
              active && 'border-primary bg-primary text-primary-foreground ring-2 ring-primary/10',
              !completed && !active && 'border-border text-muted-foreground',
            )}>
              {completed ? <CheckCircle2 className="h-3 w-3" /> : index + 1}
            </span>
            <span className={cn(
              'mt-1 block max-w-full truncate text-[9px] font-medium',
              active ? 'text-primary' : completed ? 'text-done' : 'text-muted-foreground',
              compact && 'tracking-tight',
            )}>{step.shortLabel}</span>
          </span>
        );
      })}
    </div>
  );
}

function GlassHeaderAmount({
  label, value, alert = false,
}: {
  label: string;
  value: string;
  alert?: boolean;
}) {
  return (
    <div className="min-w-[82px] px-2 py-1">
      <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn(
        'mt-0.5 truncate text-xs font-semibold tabular-nums text-foreground',
        alert && 'text-due',
      )}>{value}</p>
    </div>
  );
}

function GlassCaseActionBar({
  onDocuments, onAppointment, onFinance,
}: {
  onDocuments: () => void;
  onAppointment: () => void;
  onFinance: () => void;
}) {
  return (
    <section className="grid overflow-hidden rounded-xl border border-border bg-card md:grid-cols-3 md:divide-x md:divide-border">
      <div className="border-b border-border p-4 md:border-b-0">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Préparer le dossier</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" className="rounded-full" onClick={onDocuments}>
            <FileText className="mr-1.5 h-3.5 w-3.5" />
            Documents
          </Button>
          <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={onAppointment}>
            <Calendar className="mr-1.5 h-3.5 w-3.5" />
            Rendez-vous
          </Button>
        </div>
      </div>
      <div className="border-b border-border p-4 md:border-b-0">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Transmettre</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-2 rounded-full"
          onClick={() => window.open('https://app.onify.fr/glass', '_blank', 'noopener,noreferrer')}
        >
          <Send className="mr-1.5 h-3.5 w-3.5" />
          Ouvrir le dossier Onify
        </Button>
      </div>
      <div className="p-4">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Clôturer le dossier</p>
        <Button type="button" size="sm" variant="outline" className="mt-2 rounded-full" onClick={onFinance}>
          <Banknote className="mr-1.5 h-3.5 w-3.5" />
          Suivre le règlement
        </Button>
      </div>
    </section>
  );
}

// ============ STATUS BADGE ============

function StatusBadge({
  status, label, className = '',
}: { status: string; label?: string | null; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={`rounded-full text-[10px] font-medium border ${getStatusColor(status)} ${className}`}
    >
      {label ?? caseStatusLabels[status] ?? status}
    </Badge>
  );
}

// ============ CASE DETAIL SHEET ============

function CaseDetailSheet({
  caseId, onClose, leadMap, contactMap, profileMap, insurerMap,
}: {
  caseId: string;
  onClose: () => void;
  leadMap: Map<string, Lead>;
  contactMap: Map<string, Contact>;
  profileMap: Map<string, Profile>;
  insurerMap: Map<string, Insurer>;
}) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('resume');

  const { data: caseData, isLoading: caseLoading } = useQuery({
    queryKey: ['case', caseId],
    queryFn: () => fetchCaseById(caseId),
    enabled: !!caseId,
  });

  const { data: affaire } = useQuery({
    queryKey: ['affaire-vitrage', 'case', caseId],
    queryFn: () => fetchAffaireByCaseId(caseId),
    enabled: !!caseId,
  });

  const { data: documents, isLoading: docsLoading } = useQuery({
    queryKey: ['case-documents', caseId],
    queryFn: () => fetchCaseDocuments(caseId),
    enabled: !!caseId,
  });

  const { data: tasks, isLoading: tasksLoading } = useQuery({
    queryKey: ['case-tasks', caseId],
    queryFn: () => fetchTasks({ caseId }),
    enabled: !!caseId,
  });

  const { data: allAppointments, isLoading: apptsLoading } = useQuery({
    queryKey: ['appointments-all'],
    queryFn: () => fetchAppointments({}),
    enabled: !!caseId,
  });
  const appointments = useMemo(
    () => (allAppointments ?? []).filter((a) => a.case_id === caseId),
    [allAppointments, caseId],
  );

  const { data: communications, isLoading: commsLoading } = useQuery({
    queryKey: ['case-communications', caseId],
    queryFn: () => fetchCommunications({ caseId }),
    enabled: !!caseId,
  });

  const { data: allInvoices, isLoading: invoicesLoading } = useQuery({
    queryKey: ['invoices-all'],
    queryFn: () => fetchInvoices({}),
    enabled: !!caseId,
  });
  const invoices = useMemo(
    () => (allInvoices ?? []).filter((i) => i.case_id === caseId),
    [allInvoices, caseId],
  );
  const invoiceSummary = useMemo(() => summarizeInvoices(invoices), [invoices]);

  const { data: allQuotes, isLoading: quotesLoading } = useQuery({
    queryKey: ['quotes-all'],
    queryFn: () => fetchQuotes(),
    enabled: !!caseId,
  });
  const quotes = useMemo(
    () => (allQuotes ?? []).filter((q) => q.case_id === caseId),
    [allQuotes, caseId],
  );

  const { data: allGifts, isLoading: giftsLoading } = useQuery({
    queryKey: ['gifts-all'],
    queryFn: () => fetchGifts({}),
    enabled: !!caseId,
  });
  const gifts = useMemo(
    () => (allGifts ?? []).filter((g) => g.case_id === caseId),
    [allGifts, caseId],
  );

  const { data: allSav, isLoading: savLoading } = useQuery({
    queryKey: ['sav-all'],
    queryFn: () => fetchAfterSalesCases({}),
    enabled: !!caseId,
  });
  const savCases = useMemo(
    () => (allSav ?? []).filter((s) => s.case_id === caseId),
    [allSav, caseId],
  );

  const { data: notes, isLoading: notesLoading } = useQuery({
    queryKey: ['case-notes', caseId],
    queryFn: () => fetchNotes({ caseId }),
    enabled: !!caseId,
  });

  const { data: allActivities, isLoading: activitiesLoading } = useQuery({
    queryKey: ['activities-all'],
    queryFn: () => fetchActivities({ limit: 200 }),
    enabled: !!caseId,
  });
  const activities = useMemo(
    () => (allActivities ?? []).filter((a) => a.entity_id === caseId),
    [allActivities, caseId],
  );

  // Document toggle mutation
  const docToggleMutation = useMutation({
    mutationFn: ({ id, uploaded }: { id: string; uploaded: boolean }) => toggleCaseDocument(id, uploaded),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-documents', caseId] });
    },
    onError: (err) => toast.error((err as Error)?.message || 'Erreur de mise à jour'),
  });

  // Task creation
  const taskMutation = useMutation({
    mutationFn: (task: Partial<Task>) => createTask({ ...task, case_id: caseId }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      queryClient.invalidateQueries({ queryKey: ['case-tasks', caseId] });
      toast.success('Tâche ajoutée');
    },
    onError: (err) => toast.error((err as Error)?.message || 'Erreur'),
  });

  // Note creation
  const noteMutation = useMutation({
    mutationFn: (content: string) => createNote({ case_id: caseId, content }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      queryClient.invalidateQueries({ queryKey: ['case-notes', caseId] });
      toast.success('Note ajoutée');
    },
    onError: (err) => toast.error((err as Error)?.message || 'Erreur'),
  });

  const clientName = useMemo(() => {
    if (!caseData) return '—';
    if (caseData.contact_id) {
      const c = contactMap.get(caseData.contact_id);
      if (c) return `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim();
    }
    if (caseData.lead_id) {
      const l = leadMap.get(caseData.lead_id);
      if (l) return `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim();
    }
    return '—';
  }, [caseData, contactMap, leadMap]);

  const clientInfo = useMemo(() => {
    if (!caseData) return null;
    if (caseData.contact_id) return contactMap.get(caseData.contact_id) ?? null;
    if (caseData.lead_id) return leadMap.get(caseData.lead_id) ?? null;
    return null;
  }, [caseData, contactMap, leadMap]);

  const leadInfo = useMemo(() => {
    if (!caseData?.lead_id) return null;
    return leadMap.get(caseData.lead_id) ?? null;
  }, [caseData, leadMap]);

  const insurerInfo = useMemo(() => {
    if (!caseData?.insurer_id) return null;
    return insurerMap.get(caseData.insurer_id) ?? null;
  }, [caseData, insurerMap]);

  const advisorName = useMemo(() => {
    if (!caseData?.assigned_user_id) return null;
    const p = profileMap.get(caseData.assigned_user_id);
    return p ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() : null;
  }, [caseData, profileMap]);

  const caseTabs = [
    { value: 'resume', label: 'Résumé', icon: FileText },
    { value: 'suivi', label: 'Suivi', icon: CheckCircle2 },
    { value: 'vehicule', label: 'Véhicule', icon: Car },
    { value: 'assurance', label: 'Assurance', icon: Shield },
    { value: 'documents', label: 'Documents', icon: FileText },
    { value: 'rdv', label: 'Rendez-vous', icon: Calendar },
    { value: 'communications', label: 'Communications', icon: MessageSquare },
    { value: 'facturation', label: 'Facturation', icon: Receipt },
    { value: 'cadeau', label: 'Cadeau', icon: GiftIcon },
    { value: 'sav', label: 'SAV', icon: Wrench },
    { value: 'historique', label: 'Historique', icon: AlertCircle },
  ];

  const entete = (
    <>
      {caseLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-7 w-48 rounded-lg" />
          <Skeleton className="h-4 w-72 rounded-lg" />
        </div>
      ) : caseData ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold sm:text-2xl">{clientName}</h1>
              <StatusBadge
                status={caseData.status}
                label={caseData.onify_work_status_label ?? caseData.onify_status_label}
              />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {caseData.onify_reference ?? caseData.case_number} · déposé le {formatDate(caseData.onify_created_at ?? caseData.created_at)}
            </p>
            <div className="mt-3 max-w-xl">
              <GlassProgressTrack caseData={caseData} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-muted/20 p-2.5">
            <GlassHeaderAmount
              label="Facturé"
              value={invoiceSummary.hasInvoice ? formatEuroExact(invoiceSummary.total) : '—'}
            />
            <GlassHeaderAmount
              label="Encaissé"
              value={invoiceSummary.hasInvoice ? formatEuroExact(invoiceSummary.paid) : '—'}
            />
            <GlassHeaderAmount
              label="Reste"
              value={invoiceSummary.hasInvoice ? formatEuroExact(invoiceSummary.due) : 'Pas de facture'}
              alert={invoiceSummary.hasInvoice && invoiceSummary.due > 0}
            />
          </div>
        </div>
      ) : (
        <>
          <h1 className="text-xl font-semibold sm:text-2xl">Dossier</h1>
          <p className="mt-1 text-sm text-muted-foreground">Détails du dossier</p>
        </>
      )}
    </>
  );

  return (
    <FicheOverlay
      entete={entete}
      onglets={caseTabs.map((t) => ({ cle: t.value, label: t.label }))}
      ongletActif={tab}
      onChangerOnglet={(v) => setTab(v)}
      onFermer={() => { onClose(); setTab('resume'); }}
    >

        {!caseData && !caseLoading && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <AlertCircle className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Dossier introuvable</p>
          </div>
        )}

        {caseData && (
          <div className="space-y-4">
            {/* La barre d'onglets est desormais portee par la coque partagee. */}
            <Tabs value={tab} onValueChange={setTab}>

              {/* === RÉSUMÉ === */}
              <TabsContent value="resume" className="space-y-4 mt-4">
                <GlassCaseActionBar
                  onDocuments={() => setTab('documents')}
                  onAppointment={() => setTab('rdv')}
                  onFinance={() => setTab('facturation')}
                />

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-4">
                    <Section title="Client & véhicule">
                      <InfoRow label="Client" value={clientName} />
                      <InfoRow label="Téléphone" value={clientInfo?.phone ?? null} />
                      <InfoRow label="Email" value={clientInfo?.email ?? null} />
                      <InfoRow label="Adresse" value={[
                        (clientInfo as Contact)?.address ?? (clientInfo as Lead)?.address,
                        (clientInfo as Contact)?.postal_code ?? (clientInfo as Lead)?.postal_code,
                        (clientInfo as Contact)?.city ?? (clientInfo as Lead)?.city,
                      ].filter(Boolean).join(', ') || null} />
                      <div className="my-2 border-t border-border" />
                      <InfoRow label="Marque / Modèle" value={[
                        caseData.onify_vehicle_make ?? leadInfo?.vehicle_make,
                        caseData.onify_vehicle_model ?? leadInfo?.vehicle_model,
                      ].filter(Boolean).join(' ') || null} />
                      <InfoRow label="Immatriculation" value={caseData.onify_vehicle_registration ?? leadInfo?.vehicle_registration} />
                      <InfoRow label="Vitrage" value={caseData.glass_type} />
                      <InfoRow label="ADAS" value={caseData.has_adas_camera ? 'Caméra présente' : 'Non renseigné'} />
                    </Section>

                    <Section title="Intervention">
                      <InfoRow label="Statut des travaux" value={caseData.onify_work_status_label ?? caseData.onify_work_status_code} />
                      <InfoRow label="Technicien / conseiller" value={advisorName} />
                      <InfoRow label="Type" value={caseData.intervention_type ? interventionTypeLabels[caseData.intervention_type] : null} />
                      <InfoRow label="Rendez-vous" value={formatDateTime(caseData.appointment_date)} />
                      <InfoRow label="Adresse" value={caseData.intervention_address} />
                    </Section>
                  </div>

                  <div className="space-y-4">
                    <Section title="Sinistre & assurance">
                      <InfoRow label="Compagnie" value={caseData.onify_insurer_name ?? insurerInfo?.name ?? leadInfo?.insurance} />
                      <InfoRow label="Franchise" value={formatEuro(caseData.franchise_amount)} />
                      <InfoRow label="N° contrat" value={caseData.insurance_contract_number} />
                      <InfoRow label="N° sinistre" value={caseData.insurance_claim_number} />
                      <InfoRow label="Date du sinistre" value={formatDate(caseData.insurance_claim_date)} />
                    </Section>

                    <Section title="Documents & règlement">
                      <InfoRow
                        label="Documents client"
                        value={documents && documents.length > 0
                          ? `${documents.filter((document) => document.uploaded).length} / ${documents.length} reçus`
                          : 'Aucun document demandé'}
                      />
                      <InfoRow label="Factures" value={invoices.length > 0 ? `${invoices.length}` : 'Aucune facture'} />
                      <InfoRow label="Total facturé" value={invoiceSummary.hasInvoice ? formatEuroExact(invoiceSummary.total) : null} />
                      <InfoRow label="Encaissé" value={invoiceSummary.hasInvoice ? formatEuroExact(invoiceSummary.paid) : null} />
                      <InfoRow label="Reste dû" value={invoiceSummary.hasInvoice ? formatEuroExact(invoiceSummary.due) : null} />
                      <InfoRow label="Marge estimée" value={formatEuro(caseData.estimated_margin)} />
                    </Section>
                  </div>
                </div>

                {caseData.onify_glass_case_id && (
                  <Section title="Suivi Glass Onify">
                    <div className="grid gap-x-8 md:grid-cols-2">
                      <InfoRow label="Référence Glass" value={caseData.onify_reference ?? caseData.case_number} />
                      <InfoRow label="Type de dossier" value={caseData.onify_type} />
                      <InfoRow label="Statut du dossier" value={caseData.onify_status_label ?? caseData.onify_status_code} />
                      <InfoRow label="Étape Onify" value={caseData.onify_stage} />
                      <InfoRow label="Vitrages" value={caseData.onify_glass_items?.join(', ') || null} />
                      <InfoRow
                        label="Règlement"
                        value={caseData.onify_payment_status
                          ? onifyPaymentLabels[caseData.onify_payment_status] ?? caseData.onify_payment_status
                          : null}
                      />
                      <InfoRow label="Dernière mise à jour" value={formatDateTime(caseData.onify_updated_at ?? caseData.onify_synced_at)} />
                    </div>
                  </Section>
                )}

                <AffaireJourney
                  hasLead={Boolean(leadInfo)}
                  appointmentCount={appointments.length}
                  invoiceCount={invoices.length}
                  supplierDocumentCount={affaire?.supplier_document_count ?? 0}
                  onAgenda={() => setTab('rdv')}
                  onFinance={() => setTab('facturation')}
                />
              </TabsContent>

              {/* === SUIVI === */}
              <TabsContent value="suivi" className="space-y-3 mt-4">
                <SuiviTab caseId={caseId} tasks={tasks ?? []} isLoading={tasksLoading} onCreate={taskMutation} />
              </TabsContent>

              {/* === VÉHICULE === */}
              <TabsContent value="vehicule" className="space-y-3 mt-4">
                <Vehicle3DViewer
                  make={caseData.onify_vehicle_make ?? leadInfo?.vehicle_make}
                  model={caseData.onify_vehicle_model ?? leadInfo?.vehicle_model}
                  registration={caseData.onify_vehicle_registration ?? leadInfo?.vehicle_registration}
                />
                <Section title="Détails du véhicule">
                  <InfoRow label="Marque" value={caseData.onify_vehicle_make ?? leadInfo?.vehicle_make} />
                  <InfoRow label="Modèle" value={caseData.onify_vehicle_model ?? leadInfo?.vehicle_model} />
                  <InfoRow label="Immatriculation" value={caseData.onify_vehicle_registration ?? leadInfo?.vehicle_registration} />
                </Section>
                <Section title="Vitrage">
                  <InfoRow label="Type de vitrage" value={caseData.glass_type} />
                  <InfoRow label="Capteurs" value={caseData.has_sensors ? 'Oui' : 'Non'} />
                  <InfoRow label="Caméra ADAS" value={caseData.has_adas_camera ? 'Oui' : 'Non'} />
                </Section>
                <Section title="Intervention">
                  <InfoRow label="Type" value={caseData.intervention_type ? interventionTypeLabels[caseData.intervention_type] : null} />
                  <InfoRow label="Adresse" value={caseData.intervention_address} />
                </Section>
              </TabsContent>

              {/* === ASSURANCE === */}
              <TabsContent value="assurance" className="space-y-3 mt-4">
                <Section title="Compagnie d'assurance">
                  <InfoRow label="Nom" value={caseData.onify_insurer_name ?? insurerInfo?.name ?? leadInfo?.insurance} />
                  <InfoRow label="Téléphone" value={insurerInfo?.phone ?? null} />
                  <InfoRow label="Email" value={insurerInfo?.email ?? null} />
                </Section>
                <Section title="Contrat & Sinistre">
                  <InfoRow label="N° contrat" value={caseData.insurance_contract_number} />
                  <InfoRow label="N° sinistre" value={caseData.insurance_claim_number} />
                  <InfoRow label="Date du sinistre" value={formatDate(caseData.insurance_claim_date)} />
                  <InfoRow label="Franchise" value={formatEuro(caseData.franchise_amount)} />
                </Section>
              </TabsContent>

              {/* === DOCUMENTS === */}
              <TabsContent value="documents" className="space-y-3 mt-4">
                {docsLoading ? (
                  <SkeletonList count={5} />
                ) : documents && documents.length > 0 ? (
                  <>
                    <div className="flex items-center justify-between rounded-xl border border-border p-3">
                      <span className="text-xs text-muted-foreground">
                        {documents.filter((d) => d.uploaded).length}/{documents.length} documents uploadés
                      </span>
                      <Badge variant="secondary" className="rounded-full text-[10px]">
                        {Math.round((documents.filter((d) => d.uploaded).length / documents.length) * 100)}%
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      {documents.map((doc) => (
                        <div key={doc.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                          <Checkbox
                            checked={doc.uploaded}
                            onCheckedChange={(checked) =>
                              docToggleMutation.mutate({ id: doc.id, uploaded: !!checked })
                            }
                            disabled={docToggleMutation.isPending}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">{doc.label}</p>
                            <p className="text-xs text-muted-foreground">
                              {doc.uploaded ? `Uploadé le ${formatDate(doc.uploaded_at)}` : 'Non uploadé'}
                            </p>
                          </div>
                          {doc.uploaded ? (
                            <CheckCircle2 className="h-4 w-4 text-done" />
                          ) : (
                            <Circle className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <EmptyTab icon={<FileText className="h-7 w-7" strokeWidth={1.5} />} title="Aucun document" description="Les documents requis apparaîtront ici." />
                )}
              </TabsContent>

              {/* === RENDEZ-VOUS === */}
              <TabsContent value="rdv" className="space-y-3 mt-4">
                {apptsLoading ? (
                  <SkeletonList count={3} />
                ) : appointments.length > 0 ? (
                  appointments.map((a) => (
                    <div key={a.id} className="rounded-xl border border-border p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium text-foreground">{a.title}</span>
                        </div>
                        <Badge variant="outline" className="rounded-full text-[10px]">
                          {appointmentStatusLabels[a.status] ?? a.status}
                        </Badge>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <span>Début: {formatDateTime(a.start_time)}</span>
                        <span>Fin: {formatDateTime(a.end_time)}</span>
                        <span>Type: {appointmentTypeLabels[a.type] ?? a.type}</span>
                        {a.address && <span>Adresse: {a.address}</span>}
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyTab icon={<Calendar className="h-7 w-7" strokeWidth={1.5} />} title="Aucun rendez-vous" description="Les rendez-vous liés à ce dossier s'afficheront ici." />
                )}
              </TabsContent>

              {/* === COMMUNICATIONS === */}
              <TabsContent value="communications" className="space-y-3 mt-4">
                {commsLoading ? (
                  <SkeletonList count={4} />
                ) : communications && communications.length > 0 ? (
                  communications.map((c) => (
                    <div key={c.id} className="rounded-xl border border-border p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {c.type.startsWith('call') ? (
                            <Phone className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <MessageSquare className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="text-sm font-medium text-foreground">
                            {commTypeLabels[c.type] ?? c.type}
                          </span>
                        </div>
                        <Badge variant="outline" className="rounded-full text-[10px]">
                          {commStatusLabels[c.status] ?? c.status}
                        </Badge>
                      </div>
                      {c.content && <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{c.content}</p>}
                      <p className="mt-2 text-xs text-muted-foreground">{formatDateTime(c.created_at)}</p>
                    </div>
                  ))
                ) : (
                  <EmptyTab icon={<MessageSquare className="h-7 w-7" strokeWidth={1.5} />} title="Aucune communication" description="Les SMS, appels et emails liés à ce dossier s'afficheront ici." />
                )}
              </TabsContent>

              {/* === FACTURATION === */}
              <TabsContent value="facturation" className="space-y-4 mt-4">
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Factures</p>
                  {invoicesLoading ? (
                    <SkeletonList count={2} />
                  ) : invoices.length > 0 ? (
                    <div className="space-y-2">
                      {invoices.map((inv) => (
                        <div key={inv.id} className="rounded-xl border border-border p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Receipt className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-medium text-foreground">{inv.invoice_number}</span>
                            </div>
                            <Badge variant="outline" className="rounded-full text-[10px]">
                              {invoiceStatusLabels[inv.status] ?? inv.status}
                            </Badge>
                          </div>
                          <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                            <span>Montant HT: {formatEuro(inv.amount_ht)}</span>
                            <span>Montant TTC: {formatEuro(inv.amount_ttc)}</span>
                            <span>Payé: {formatEuro(inv.amount_paid)}</span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">Émise le {formatDate(inv.issue_date)}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyTab icon={<Receipt className="h-7 w-7" strokeWidth={1.5} />} title="Aucune facture" description="Les factures liées à ce dossier apparaîtront ici." />
                  )}
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Devis</p>
                  {quotesLoading ? (
                    <SkeletonList count={2} />
                  ) : quotes.length > 0 ? (
                    <div className="space-y-2">
                      {quotes.map((q) => (
                        <div key={q.id} className="rounded-xl border border-border p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-medium text-foreground">{q.quote_number}</span>
                            </div>
                            <Badge variant="outline" className="rounded-full text-[10px]">
                              {quoteStatusLabels[q.status] ?? q.status}
                            </Badge>
                          </div>
                          <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                            <span>Montant HT: {formatEuro(q.amount_ht)}</span>
                            <span>Montant TTC: {formatEuro(q.amount_ttc)}</span>
                            <span>Franchise: {formatEuro(q.franchise_amount)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyTab icon={<FileText className="h-7 w-7" strokeWidth={1.5} />} title="Aucun devis" description="Les devis liés à ce dossier apparaîtront ici." />
                  )}
                </div>
              </TabsContent>

              {/* === CADEAU === */}
              <TabsContent value="cadeau" className="space-y-3 mt-4">
                <Section title="Cadeau du dossier">
                  <InfoRow label="Type" value={caseData.gift_type} />
                  <InfoRow label="Montant" value={formatEuro(caseData.gift_amount)} />
                </Section>
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Cadeaux enregistrés</p>
                  {giftsLoading ? (
                    <SkeletonList count={2} />
                  ) : gifts.length > 0 ? (
                    <div className="space-y-2">
                      {gifts.map((g) => (
                        <div key={g.id} className="rounded-xl border border-border p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <GiftIcon className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-medium text-foreground">
                                {g.type === 'gift' ? 'Cadeau' : 'Virement'}
                              </span>
                            </div>
                            <Badge variant="outline" className="rounded-full text-[10px]">
                              {giftStatusLabels[g.status] ?? g.status}
                            </Badge>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                            <span>Montant: {formatEuro(g.amount)}</span>
                            {g.description && <span>{g.description}</span>}
                          </div>
                          {g.given_at && <p className="mt-1 text-xs text-muted-foreground">Remis le {formatDate(g.given_at)}</p>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyTab icon={<GiftIcon className="h-7 w-7" strokeWidth={1.5} />} title="Aucun cadeau" description="Les cadeaux liés à ce dossier apparaîtront ici." />
                  )}
                </div>
              </TabsContent>

              {/* === SAV === */}
              <TabsContent value="sav" className="space-y-3 mt-4">
                {savLoading ? (
                  <SkeletonList count={2} />
                ) : savCases.length > 0 ? (
                  savCases.map((s) => (
                    <div key={s.id} className="rounded-xl border border-border p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Wrench className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium text-foreground">{s.reason || 'SAV'}</span>
                        </div>
                        <Badge variant="outline" className="rounded-full text-[10px]">
                          {afterSalesStatusLabels[s.status] ?? s.status}
                        </Badge>
                      </div>
                      {s.description && <p className="mt-2 text-sm text-muted-foreground">{s.description}</p>}
                      <p className="mt-2 text-xs text-muted-foreground">Créé le {formatDate(s.created_at)}</p>
                    </div>
                  ))
                ) : (
                  <EmptyTab icon={<Wrench className="h-7 w-7" strokeWidth={1.5} />} title="Aucun SAV" description="Les dossiers de service après-vente liés apparaîtront ici." />
                )}
              </TabsContent>

              {/* === HISTORIQUE === */}
              <TabsContent value="historique" className="space-y-3 mt-4">
                <HistoriqueTab
                  notes={notes ?? []}
                  activities={activities}
                  notesLoading={notesLoading}
                  activitiesLoading={activitiesLoading}
                  onAddNote={noteMutation}
                />
              </TabsContent>
            </Tabs>
          </div>
        )}
    </FicheOverlay>
  );
}

function AffaireJourney({
  hasLead,
  appointmentCount,
  invoiceCount,
  supplierDocumentCount,
  onAgenda,
  onFinance,
}: {
  hasLead: boolean;
  appointmentCount: number;
  invoiceCount: number;
  supplierDocumentCount: number;
  onAgenda: () => void;
  onFinance: () => void;
}) {
  const steps = [
    {
      label: 'Leads',
      detail: hasLead ? 'Origine archivée' : 'Import historique',
      done: hasLead,
      active: false,
      onClick: undefined,
    },
    {
      label: 'Glass',
      detail: 'Dossier Onify',
      done: true,
      active: true,
      onClick: undefined,
    },
    {
      label: 'Agenda',
      detail: appointmentCount > 0
        ? `${appointmentCount} rendez-vous`
        : 'À planifier',
      done: appointmentCount > 0,
      active: false,
      onClick: onAgenda,
    },
    {
      label: 'Finance',
      detail: invoiceCount > 0
        ? `${invoiceCount} facture${invoiceCount > 1 ? 's' : ''}`
        : supplierDocumentCount > 0
          ? `${supplierDocumentCount} coût${supplierDocumentCount > 1 ? 's' : ''} fournisseur`
          : 'À alimenter',
      done: invoiceCount > 0 || supplierDocumentCount > 0,
      active: false,
      onClick: onFinance,
    },
  ] as const;

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Affaire vitrage
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Une seule affaire, le même contact, de la demande jusqu’à la marge.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-4">
        {steps.map((step, index) => {
          const contenu = (
            <>
              <span className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-foreground">{step.label}</span>
                {step.done && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
              </span>
              <span className="mt-1 block text-[11px] text-muted-foreground">{step.detail}</span>
            </>
          );

          return (
            <div key={step.label} className="relative flex min-w-0 items-stretch gap-2">
              {step.onClick ? (
                <button
                  type="button"
                  onClick={step.onClick}
                  className="w-full rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-primary/35 hover:bg-primary/5"
                >
                  {contenu}
                </button>
              ) : (
                <div className={step.active
                  ? 'w-full rounded-lg border border-primary/30 bg-primary/5 p-3'
                  : 'w-full rounded-lg border border-border bg-background p-3'}
                >
                  {contenu}
                </div>
              )}
              {index < steps.length - 1 && (
                <ArrowRight className="absolute -right-2.5 top-1/2 z-10 hidden h-3 w-3 -translate-y-1/2 text-muted-foreground sm:block" />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ============ SUIVI TAB ============

function SuiviTab({
  tasks, isLoading, onCreate,
}: {
  caseId: string;
  tasks: Task[];
  isLoading: boolean;
  onCreate: UseMutationResult<{ error: string | null; task: Task | null }, Error, Partial<Task>, unknown>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('follow_up');
  const [priority, setPriority] = useState('normal');
  const [dueAt, setDueAt] = useState('');

  const handleSubmit = () => {
    if (!title.trim()) { toast.error('Le titre est requis'); return; }
    onCreate.mutate({
      title: title.trim(),
      type: type as Task['type'],
      priority: priority as Task['priority'],
      status: 'pending',
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
    });
    setTitle(''); setType('follow_up'); setPriority('normal'); setDueAt('');
    setShowForm(false);
  };

  return (
    <>
      <div className="flex justify-end">
        <Button size="sm" className="rounded-full" onClick={() => setShowForm(!showForm)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Ajouter une tâche
        </Button>
      </div>

      {showForm && (
        <div className="space-y-3 rounded-xl border border-border p-4">
          <div className="space-y-1.5">
            <Label className="text-sm">Titre</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Rappeler le client..." className="rounded-lg" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(taskTypeLabels).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Priorité</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(taskPriorityLabels).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Échéance</Label>
              <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="rounded-lg" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" className="rounded-full" onClick={() => setShowForm(false)}>Annuler</Button>
            <Button size="sm" className="rounded-full" onClick={handleSubmit} disabled={onCreate.isPending}>
              {onCreate.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
              Enregistrer
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <SkeletonList count={3} />
      ) : tasks.length > 0 ? (
        <div className="space-y-2">
          {tasks.map((t) => (
            <div key={t.id} className="rounded-xl border border-border p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {t.status === 'done' ? (
                    <CheckCircle2 className="h-4 w-4 text-done" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className={`text-sm font-medium ${t.status === 'done' ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                    {t.title}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {t.priority === 'urgent' && (
                    <Badge variant="outline" className="rounded-full text-[10px] border-urgent/25 bg-urgent-soft text-urgent">
                      Urgent
                    </Badge>
                  )}
                  <Badge variant="secondary" className="rounded-full text-[10px]">
                    {taskStatusLabels[t.status] ?? t.status}
                  </Badge>
                </div>
              </div>
              <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
                <span>{taskTypeLabels[t.type] ?? t.type}</span>
                {t.due_at && <span>Échéance: {formatDateTime(t.due_at)}</span>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        !showForm && (
          <EmptyTab icon={<CheckCircle2 className="h-7 w-7" strokeWidth={1.5} />} title="Aucune tâche" description="Ajoutez une tâche pour suivre les actions à mener sur ce dossier." />
        )
      )}
    </>
  );
}

// ============ HISTORIQUE TAB ============

function HistoriqueTab({
  notes, activities, notesLoading, activitiesLoading, onAddNote,
}: {
  notes: Note[];
  activities: Activity[];
  notesLoading: boolean;
  activitiesLoading: boolean;
  onAddNote: UseMutationResult<{ error: string | null; note: Note | null }, Error, string, unknown>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [content, setContent] = useState('');

  const handleAdd = () => {
    if (!content.trim()) { toast.error('La note est vide'); return; }
    onAddNote.mutate(content.trim());
    setContent('');
    setShowForm(false);
  };

  return (
    <>
      <div className="flex justify-end">
        <Button size="sm" variant="outline" className="rounded-full" onClick={() => setShowForm(!showForm)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Ajouter une note
        </Button>
      </div>

      {showForm && (
        <div className="space-y-3 rounded-xl border border-border p-4">
          <Textarea
            placeholder="Saisissez votre note..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            className="rounded-lg resize-none"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" className="rounded-full" onClick={() => setShowForm(false)}>Annuler</Button>
            <Button size="sm" className="rounded-full" onClick={handleAdd} disabled={onAddNote.isPending}>
              {onAddNote.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
              Enregistrer
            </Button>
          </div>
        </div>
      )}

      {/* Notes */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Notes</p>
        {notesLoading ? (
          <SkeletonList count={2} />
        ) : notes.length > 0 ? (
          <div className="space-y-2">
            {notes.map((n) => (
              <div key={n.id} className="rounded-xl border border-border p-4">
                <p className="text-xs text-muted-foreground">{formatDateTime(n.created_at)}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{n.content}</p>
              </div>
            ))}
          </div>
        ) : (
          !showForm && <p className="text-sm text-muted-foreground">Aucune note pour le moment.</p>
        )}
      </div>

      {/* Activities */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Activités</p>
        {activitiesLoading ? (
          <SkeletonList count={3} />
        ) : activities.length > 0 ? (
          <div className="space-y-2">
            {activities.map((a) => (
              <div key={a.id} className="rounded-xl border border-border p-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground">{a.action}</span>
                  {a.entity_type && (
                    <Badge variant="secondary" className="rounded-full text-[10px]">{a.entity_type}</Badge>
                  )}
                </div>
                {a.description && <p className="mt-1 text-sm text-muted-foreground">{a.description}</p>}
                <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(a.created_at)}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Aucune activité enregistrée.</p>
        )}
      </div>
    </>
  );
}

// ============ SMALL REUSABLE COMPONENTS ============

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-xs text-muted-foreground whitespace-nowrap">{label}</span>
      <span className="text-sm text-foreground text-right break-words">{value || '—'}</span>
    </div>
  );
}

function EmptyTab({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border p-8 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-muted/50 text-muted-foreground">
        {icon}
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-xs text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function SkeletonList({ count }: { count: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  );
}
