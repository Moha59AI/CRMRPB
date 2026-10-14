import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import {
  Search, Plus, FileText, Car, Shield, Wrench, Gift as GiftIcon, Calendar,
  Phone, MessageSquare, Receipt, CheckCircle2, Circle, AlertCircle,
  ArrowRight, ExternalLink, Loader2, X, RefreshCw, CalendarClock,
  ClipboardCheck, Banknote, ChevronRight, Clock3, LayoutDashboard,
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
  Insurer, Note, Activity,
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
type GlassStageFilter = 'all' | GlassStage;

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

function vehicleForCase(caseData: WindscreenCase, leadMap: Map<string, Lead>): string {
  const onifyVehicle = [caseData.onify_vehicle_make, caseData.onify_vehicle_model]
    .filter(Boolean).join(' ');
  if (onifyVehicle) return onifyVehicle;
  const lead = caseData.lead_id ? leadMap.get(caseData.lead_id) : null;
  return lead ? [lead.vehicle_make, lead.vehicle_model].filter(Boolean).join(' ') : '';
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
  const [stageFilter, setStageFilter] = useState<GlassStageFilter>('all');
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

  const stageCounts = useMemo(() => {
    const counts: Record<GlassStage, number> = {
      preparation: 0,
      planning: 0,
      intervention: 0,
      finance: 0,
      done: 0,
      sav: 0,
    };
    allCases.forEach((caseData) => { counts[glassStageOf(caseData)] += 1; });
    return counts;
  }, [allCases]);

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
      if (stageFilter !== 'all' && glassStageOf(caseData) !== stageFilter) return false;
      if (statusFilter !== 'all' && caseData.status !== statusFilter) return false;
      if (advisorFilter !== 'all' && caseData.assigned_user_id !== advisorFilter) return false;
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
    });
  }, [advisorFilter, allCases, contactMap, insurerMap, leadMap, search, stageFilter, statusFilter]);

  const activeCount = allCases.length - stageCounts.done;
  const lastSyncAt = allCases
    .map((caseData) => caseData.onify_synced_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

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
              done={stageCounts.done}
              lastSyncAt={lastSyncAt}
            />

            <GlassWorkflow
              counts={stageCounts}
              activeStage={stageFilter}
              onStageChange={(stage) => {
                setStageFilter((current) => current === stage ? 'all' : stage);
                setStatusFilter('all');
              }}
            />

            <div className="grid gap-5 xl:grid-cols-[1.25fr_0.9fr]">
              <GlassPriorities
                priorities={allPriorities.slice(0, 6)}
                leadMap={leadMap}
                contactMap={contactMap}
                onOpen={ouvrirDossier}
              />
              <GlassUpcomingAppointments
                appointments={dashboardAppointments}
                loading={appointmentsLoading}
                leadMap={leadMap}
                contactMap={contactMap}
                onOpen={ouvrirDossier}
              />
            </div>

            <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="flex flex-col gap-2 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div>
                  <div className="flex items-center gap-2">
                    <LayoutDashboard className="h-4 w-4 text-primary" />
                    <h2 className="text-sm font-semibold text-foreground">Tous les dossiers</h2>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {visibleCases.length} dossier{visibleCases.length > 1 ? 's' : ''} affiché{visibleCases.length > 1 ? 's' : ''} sur {allCases.length}
                  </p>
                </div>
                {stageFilter !== 'all' && (
                  <Badge variant="outline" className="w-fit rounded-full border-primary/30 bg-primary/5 text-primary">
                    Étape : {glassStageDefinitions.find((stage) => stage.key === stageFilter)?.label}
                  </Badge>
                )}
              </div>

              <div className="flex flex-wrap items-end gap-3 border-b border-border bg-muted/20 px-4 py-4 sm:px-5">
                <div className="w-full min-w-0 space-y-1.5 sm:min-w-[240px] sm:flex-1">
                  <Label className="text-xs text-muted-foreground">Recherche</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Client, référence, plaque, véhicule, assurance..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="rounded-lg bg-card pl-9"
                    />
                  </div>
                </div>

                <div className="w-full space-y-1.5 sm:w-auto">
                  <Label className="text-xs text-muted-foreground">Statut</Label>
                  <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); setStageFilter('all'); }}>
                    <SelectTrigger className="w-full rounded-lg bg-card sm:w-[190px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous les statuts</SelectItem>
                      {caseStatusOrder.map((status) => (
                        <SelectItem key={status} value={status}>{caseStatusLabels[status]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="w-full space-y-1.5 sm:w-auto">
                  <Label className="text-xs text-muted-foreground">Conseiller</Label>
                  <Select value={advisorFilter} onValueChange={setAdvisorFilter}>
                    <SelectTrigger className="w-full rounded-lg bg-card sm:w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous</SelectItem>
                      {(profiles ?? []).map((profile) => (
                        <SelectItem key={profile.id} value={profile.id}>
                          {profile.first_name} {profile.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {(search || statusFilter !== 'all' || advisorFilter !== 'all' || stageFilter !== 'all') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-lg"
                    onClick={() => {
                      setSearch('');
                      setStatusFilter('all');
                      setAdvisorFilter('all');
                      setStageFilter('all');
                    }}
                  >
                    <X className="mr-1 h-3.5 w-3.5" />
                    Effacer
                  </Button>
                )}
              </div>

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
                      onOpen={() => ouvrirDossier(caseData.id)}
                    />
                  ))}
                </ul>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs">N° dossier</TableHead>
                        <TableHead className="text-xs">Client</TableHead>
                        <TableHead className="text-xs">Véhicule</TableHead>
                        <TableHead className="text-xs">Assurance</TableHead>
                        <TableHead className="text-xs">Statut</TableHead>
                        <TableHead className="text-xs">Conseiller</TableHead>
                        <TableHead className="text-xs">Date RDV</TableHead>
                        <TableHead className="text-xs text-right">Franchise</TableHead>
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
  total, active, priorities, appointments, done, lastSyncAt,
}: {
  total: number;
  active: number;
  priorities: number;
  appointments: number;
  done: number;
  lastSyncAt?: string;
}) {
  const metrics = [
    {
      icon: ClipboardCheck,
      label: 'Dossiers actifs',
      value: active,
      detail: 'Encore dans le parcours',
      tone: 'primary',
    },
    {
      icon: AlertCircle,
      label: 'À traiter',
      value: priorities,
      detail: 'Actions détectées',
      tone: priorities > 0 ? 'warning' : 'done',
    },
    {
      icon: CalendarClock,
      label: 'RDV à venir',
      value: appointments,
      detail: 'Sur les 90 prochains jours',
      tone: 'upcoming',
    },
    {
      icon: CheckCircle2,
      label: 'Clôturés',
      value: done,
      detail: 'Réglés ou terminés',
      tone: 'done',
    },
  ] as const;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-4 bg-gradient-to-br from-primary/10 via-card to-done-soft/60 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Wrench className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Vue opérationnelle</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">Pilotage Glass</h2>
              <span className="text-sm font-medium text-muted-foreground">{total} dossiers Onify</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Voyez immédiatement ce qui avance, ce qui bloque et les prochains rendez-vous.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border/80 bg-card/80 px-3 py-2 text-xs text-muted-foreground shadow-sm backdrop-blur">
          <RefreshCw className="h-3.5 w-3.5 text-primary" />
          <span>Dernière synchro : {lastSyncAt ? formatDateTime(lastSyncAt) : 'non disponible'}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-4 sm:divide-y-0">
        {metrics.map(({ icon: Icon, label, value, detail, tone }) => (
          <div key={label} className="relative min-w-0 px-4 py-4 sm:px-5">
            <div className="flex items-center justify-between gap-3">
              <span className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg',
                tone === 'warning' && 'bg-due-soft text-due',
                tone === 'upcoming' && 'bg-upcoming-soft text-upcoming',
                tone === 'done' && 'bg-done-soft text-done',
                tone === 'primary' && 'bg-primary/10 text-primary',
              )}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">{value}</span>
            </div>
            <p className="mt-3 truncate text-xs font-medium text-foreground">{label}</p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function GlassWorkflow({
  counts, activeStage, onStageChange,
}: {
  counts: Record<GlassStage, number>;
  activeStage: GlassStageFilter;
  onStageChange: (stage: GlassStage) => void;
}) {
  const icons: Record<GlassStage, typeof FileText> = {
    preparation: FileText,
    planning: CalendarClock,
    intervention: Wrench,
    finance: Banknote,
    done: CheckCircle2,
    sav: AlertCircle,
  };
  const maximum = Math.max(1, ...Object.values(counts));

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Parcours des dossiers</h2>
          <p className="mt-1 text-xs text-muted-foreground">Cliquez sur une étape pour afficher uniquement les dossiers concernés.</p>
        </div>
        {activeStage !== 'all' && <span className="text-xs font-medium text-primary">Filtre actif</span>}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {glassStageDefinitions.map((stage) => {
          const Icon = icons[stage.key];
          const selected = activeStage === stage.key;
          const percentage = Math.max(5, (counts[stage.key] / maximum) * 100);
          return (
            <button
              key={stage.key}
              type="button"
              aria-pressed={selected}
              onClick={() => onStageChange(stage.key)}
              className={cn(
                'group rounded-xl border px-3 py-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-sm',
                selected ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border bg-surface/60',
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-lg bg-card text-muted-foreground shadow-sm transition-colors group-hover:text-primary',
                  selected && 'bg-primary text-primary-foreground',
                  stage.key === 'sav' && !selected && 'bg-urgent-soft text-urgent',
                  stage.key === 'done' && !selected && 'bg-done-soft text-done',
                )}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className={cn(
                  'text-xl font-semibold tabular-nums',
                  stage.key === 'sav' && counts[stage.key] > 0 ? 'text-urgent' : 'text-foreground',
                )}>{counts[stage.key]}</span>
              </span>
              <span className="mt-3 block text-xs font-semibold text-foreground">{stage.label}</span>
              <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{stage.description}</span>
              <span className="mt-3 block h-1 overflow-hidden rounded-full bg-muted">
                <span
                  className={cn(
                    'block h-full rounded-full transition-[width] duration-500',
                    stage.key === 'sav' ? 'bg-urgent' : stage.key === 'done' ? 'bg-done' : 'bg-primary',
                  )}
                  style={{ width: `${percentage}%` }}
                />
              </span>
            </button>
          );
        })}
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
  caseData, leadMap, contactMap, profileMap, insurerMap, onOpen,
}: {
  caseData: WindscreenCase;
  leadMap: Map<string, Lead>;
  contactMap: Map<string, Contact>;
  profileMap: Map<string, Profile>;
  insurerMap: Map<string, Insurer>;
  onOpen: () => void;
}) {
  const clientName = useMemo(() => {
    const contact = caseData.contact_id ? contactMap.get(caseData.contact_id) : null;
    if (contact) return `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim();
    const lead = caseData.lead_id ? leadMap.get(caseData.lead_id) : null;
    return lead ? `${lead.first_name ?? ''} ${lead.last_name ?? ''}`.trim() : 'Client non renseigné';
  }, [caseData.contact_id, caseData.lead_id, contactMap, leadMap]);

  const lead = caseData.lead_id ? leadMap.get(caseData.lead_id) : null;
  const vehicleInfo = [caseData.onify_vehicle_make, caseData.onify_vehicle_model]
    .filter(Boolean).join(' ')
    || (lead ? [lead.vehicle_make, lead.vehicle_model].filter(Boolean).join(' ') : '');
  const insurerName = caseData.onify_insurer_name
    ?? (caseData.insurer_id ? insurerMap.get(caseData.insurer_id)?.name : null)
    ?? lead?.insurance;
  const advisor = caseData.assigned_user_id
    ? profileMap.get(caseData.assigned_user_id)
    : null;
  const advisorName = advisor
    ? `${advisor.first_name ?? ''} ${advisor.last_name ?? ''}`.trim()
    : '';

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="w-full px-4 py-3 text-left transition-colors active:bg-muted/50"
        aria-label={`Ouvrir le dossier ${caseData.case_number}`}
      >
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-xs font-medium text-muted-foreground">
              {caseData.onify_reference ?? caseData.case_number}
            </span>
            <span className="mt-0.5 block truncate text-sm font-semibold text-foreground">{clientName}</span>
          </span>
          <StatusBadge
            status={caseData.status}
            label={caseData.onify_work_status_label ?? caseData.onify_status_label}
            className="shrink-0"
          />
        </span>

        <span className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="truncate">{vehicleInfo || 'Véhicule non renseigné'}</span>
          <span className="truncate text-right">{insurerName || 'Assurance non renseignée'}</span>
          <span className="truncate">{advisorName || 'Non attribué'}</span>
          <span className="text-right tabular">RDV {formatDate(caseData.appointment_date)}</span>
        </span>

        {caseData.franchise_amount != null && caseData.franchise_amount !== 0 && (
          <span className="mt-2 block text-right text-sm font-semibold text-foreground tabular">
            {formatEuro(caseData.franchise_amount)}
          </span>
        )}
      </button>
    </li>
  );
}

// ============ CASE ROW ============

function CaseRow({
  caseData, leadMap, contactMap, profileMap, insurerMap, onOpen,
}: {
  caseData: WindscreenCase;
  leadMap: Map<string, Lead>;
  contactMap: Map<string, Contact>;
  profileMap: Map<string, Profile>;
  insurerMap: Map<string, Insurer>;
  onOpen: () => void;
}) {
  const clientName = useMemo(() => {
    if (caseData.contact_id) {
      const c = contactMap.get(caseData.contact_id);
      if (c) return `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim();
    }
    if (caseData.lead_id) {
      const l = leadMap.get(caseData.lead_id);
      if (l) return `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim();
    }
    return '—';
  }, [caseData, leadMap, contactMap]);

  const vehicleInfo = useMemo(() => {
    const onify = [caseData.onify_vehicle_make, caseData.onify_vehicle_model]
      .filter(Boolean).join(' ');
    if (onify) return onify;
    if (caseData.lead_id) {
      const l = leadMap.get(caseData.lead_id);
      if (l) return [l.vehicle_make, l.vehicle_model].filter(Boolean).join(' ') || null;
    }
    return null;
  }, [caseData, leadMap]);

  const insurerName = useMemo(() => {
    if (caseData.onify_insurer_name) return caseData.onify_insurer_name;
    if (caseData.insurer_id) {
      const i = insurerMap.get(caseData.insurer_id);
      if (i) return i.name;
    }
    if (caseData.lead_id) {
      const l = leadMap.get(caseData.lead_id);
      if (l?.insurance) return l.insurance;
    }
    return null;
  }, [caseData, insurerMap, leadMap]);

  const advisorName = useMemo(() => {
    if (caseData.assigned_user_id) {
      const p = profileMap.get(caseData.assigned_user_id);
      if (p) return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
    }
    return null;
  }, [caseData, profileMap]);

  return (
    <TableRow className="cursor-pointer hover:bg-muted/40" onClick={onOpen}>
      <TableCell className="text-sm font-medium text-foreground whitespace-nowrap">
        {caseData.onify_reference ?? caseData.case_number}
      </TableCell>
      <TableCell className="text-sm text-foreground">{clientName}</TableCell>
      <TableCell className="text-sm text-muted-foreground">{vehicleInfo || '—'}</TableCell>
      <TableCell className="text-sm text-muted-foreground">{insurerName || '—'}</TableCell>
      <TableCell>
        <StatusBadge
          status={caseData.status}
          label={caseData.onify_work_status_label ?? caseData.onify_status_label}
        />
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{advisorName || '—'}</TableCell>
      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
        {formatDate(caseData.appointment_date)}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground text-right whitespace-nowrap">
        {formatEuro(caseData.franchise_amount)}
      </TableCell>
    </TableRow>
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
      <h1 className="truncate text-xl font-semibold sm:text-2xl">
        {caseLoading ? <Skeleton className="h-7 w-48 rounded-lg" /> : (caseData?.case_number ?? 'Dossier')}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {caseData ? `${clientName} — créé le ${formatDate(caseData.created_at)}` : 'Détails du dossier'}
      </p>
      {caseData && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Label className="whitespace-nowrap text-xs text-muted-foreground">Statut</Label>
          <StatusBadge
            status={caseData.status}
            label={caseData.onify_work_status_label ?? caseData.onify_status_label}
          />
          <span className="text-xs text-muted-foreground">Synchronisé depuis Onify</span>
        </div>
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
                <AffaireJourney
                  hasLead={Boolean(leadInfo)}
                  appointmentCount={appointments.length}
                  invoiceCount={invoices.length}
                  supplierDocumentCount={affaire?.supplier_document_count ?? 0}
                  onAgenda={() => setTab('rdv')}
                  onFinance={() => setTab('facturation')}
                />

                <Section title="Informations du dossier">
                  <InfoRow label="N° dossier" value={caseData.case_number} />
                  <InfoRow label="Statut" value={caseStatusLabels[caseData.status] ?? caseData.status} />
                  <InfoRow label="Conseiller" value={advisorName} />
                  <InfoRow label="Date de création" value={formatDate(caseData.created_at)} />
                  <InfoRow label="Type d'intervention" value={caseData.intervention_type ? interventionTypeLabels[caseData.intervention_type] : null} />
                </Section>

                {caseData.onify_glass_case_id && (
                  <Section title="Suivi Glass Onify">
                    <InfoRow label="Référence Glass" value={caseData.onify_reference ?? caseData.case_number} />
                    <InfoRow label="Type de dossier" value={caseData.onify_type} />
                    <InfoRow label="Statut du dossier" value={caseData.onify_status_label ?? caseData.onify_status_code} />
                    <InfoRow label="Statut des travaux" value={caseData.onify_work_status_label ?? caseData.onify_work_status_code} />
                    <InfoRow label="Étape Onify" value={caseData.onify_stage} />
                    <InfoRow
                      label="Règlement"
                      value={caseData.onify_payment_status
                        ? onifyPaymentLabels[caseData.onify_payment_status] ?? caseData.onify_payment_status
                        : null}
                    />
                    <InfoRow label="Vitrages" value={caseData.onify_glass_items?.join(', ') || null} />
                    <InfoRow label="Dernière mise à jour" value={formatDateTime(caseData.onify_updated_at ?? caseData.onify_synced_at)} />
                  </Section>
                )}

                <Section title="Client">
                  <InfoRow label="Nom" value={clientName} />
                  <InfoRow label="Téléphone" value={clientInfo?.phone ?? null} />
                  <InfoRow label="Email" value={clientInfo?.email ?? null} />
                  <InfoRow label="Ville" value={(clientInfo as Contact)?.city ?? (clientInfo as Lead)?.city ?? null} />
                </Section>

                <Section title="Véhicule">
                  <InfoRow label="Marque / Modèle" value={[
                    caseData.onify_vehicle_make ?? leadInfo?.vehicle_make,
                    caseData.onify_vehicle_model ?? leadInfo?.vehicle_model,
                  ].filter(Boolean).join(' ') || null} />
                  <InfoRow label="Immatriculation" value={caseData.onify_vehicle_registration ?? leadInfo?.vehicle_registration} />
                  <InfoRow label="Type de vitrage" value={caseData.glass_type} />
                  <InfoRow label="Capteurs" value={caseData.has_sensors ? 'Oui' : 'Non'} />
                  <InfoRow label="Caméra ADAS" value={caseData.has_adas_camera ? 'Oui' : 'Non'} />
                </Section>

                <Section title="Assurance">
                  <InfoRow label="Compagnie" value={caseData.onify_insurer_name ?? insurerInfo?.name ?? leadInfo?.insurance} />
                  <InfoRow label="N° contrat" value={caseData.insurance_contract_number} />
                  <InfoRow label="N° sinistre" value={caseData.insurance_claim_number} />
                  <InfoRow label="Date du sinistre" value={formatDate(caseData.insurance_claim_date)} />
                </Section>

                <Section title="Rendez-vous">
                  <InfoRow label="Date RDV" value={formatDateTime(caseData.appointment_date)} />
                  <InfoRow label="Adresse" value={caseData.intervention_address} />
                </Section>

                {/* Financial summary */}
                <div className="rounded-xl border border-border p-4">
                  <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Synthèse financière
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <FinanceItem label="Franchise" value={formatEuro(caseData.franchise_amount)} />
                    <FinanceItem label="Cadeau" value={formatEuro(caseData.gift_amount)} />
                    <FinanceItem label="Marge estimée" value={formatEuro(caseData.estimated_margin)} />
                    <FinanceItem
                      label="Total factures"
                      value={invoices.length > 0 ? formatEuro(invoices.reduce((s, i) => s + i.amount_ttc, 0)) : '—'}
                    />
                  </div>
                  {invoices.length > 0 && (
                    <div className="mt-3 space-y-1.5 border-t border-border pt-3">
                      {invoices.map((inv) => (
                        <div key={inv.id} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{inv.invoice_number}</span>
                          <span className="font-medium text-foreground">{formatEuro(inv.amount_ttc)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* === SUIVI === */}
              <TabsContent value="suivi" className="space-y-3 mt-4">
                <SuiviTab caseId={caseId} tasks={tasks ?? []} isLoading={tasksLoading} onCreate={taskMutation} />
              </TabsContent>

              {/* === VÉHICULE === */}
              <TabsContent value="vehicule" className="space-y-3 mt-4">
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

function FinanceItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground">{value}</p>
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
