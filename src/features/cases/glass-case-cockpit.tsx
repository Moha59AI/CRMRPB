import type { ReactNode } from 'react';
import {
  Activity as ActivityIcon,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  FileText,
  Mail,
  MapPin,
  Phone,
  Receipt,
  RefreshCw,
  ShieldCheck,
  UserRound,
  WalletCards,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LogoAssureur } from '@/features/insurers/insurer-logo';
import { cn } from '@/lib/utils';
import type {
  Activity,
  CaseDocument,
  Contact,
  Lead,
  WindscreenCase,
} from '@/types';
import type { AppointmentAvecClient } from '@/services/planning-service';

export interface GlassCockpitFinance {
  hasInvoice: boolean;
  total: number;
  paid: number;
  due: number;
}

interface GlassCaseCockpitProps {
  caseData: WindscreenCase;
  client: Contact | Lead | null;
  lead: Lead | null;
  clientName: string;
  insurerName: string | null;
  advisorName: string | null;
  documents: CaseDocument[];
  appointments: AppointmentAvecClient[];
  activities: Activity[];
  invoiceCount: number;
  finance: GlassCockpitFinance;
  supplierDocumentCount: number;
  vehicleVisual: ReactNode;
  operationalEditor: ReactNode;
  onDocuments: () => void;
  onAppointment: () => void;
  onFinance: () => void;
  onHistory: () => void;
}

const euroFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const paymentLabels: Record<string, string> = {
  pending: 'Aucun règlement reçu',
  tva_only: 'TVA réglée',
  insurance_only: 'Part assureur réglée',
  partial: 'Règlement partiel',
  complete: 'Règlement complet',
};

const appointmentStatusLabels: Record<string, string> = {
  scheduled: 'Planifié',
  confirmed: 'Confirmé',
  completed: 'Terminé',
  cancelled: 'Annulé',
  no_show: 'Absent',
};

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Non renseignée';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? dateFormatter.format(date) : 'Non renseignée';
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Non planifié';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? dateTimeFormatter.format(date) : 'Non planifié';
}

function formatFranchise(caseData: WindscreenCase): string {
  if (caseData.franchise_amount == null) return 'À renseigner';
  if (caseData.franchise_type === 'percent') return `${caseData.franchise_amount} %`;
  return euroFormatter.format(caseData.franchise_amount);
}

function SourceBadge({ source }: { source: 'lead' | 'onify' | 'manual' | null }) {
  if (!source) return null;
  const label = source === 'onify' ? 'Onify' : source === 'lead' ? 'Lead' : 'CRM';
  return (
    <Badge
      variant="outline"
      className={cn(
        'h-5 rounded-full px-2 text-[9px] font-semibold uppercase tracking-wide',
        source === 'onify' && 'border-upcoming/30 bg-upcoming-soft text-upcoming',
        source === 'lead' && 'border-due/30 bg-due-soft text-due',
        source === 'manual' && 'border-primary/30 bg-primary/5 text-primary',
      )}
    >
      {label}
    </Badge>
  );
}

function CockpitCard({
  icon: Icon,
  title,
  eyebrow,
  action,
  children,
  className,
}: {
  icon: typeof Calendar;
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('overflow-hidden rounded-2xl border border-border bg-card shadow-sm', className)}>
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-4.5 w-4.5" aria-hidden />
          </span>
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {eyebrow}
              </p>
            )}
            <h3 className="truncate text-sm font-semibold text-foreground">{title}</h3>
          </div>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function DocumentsCard({
  documents,
  onOpen,
}: {
  documents: CaseDocument[];
  onOpen: () => void;
}) {
  const received = documents.filter((document) => document.uploaded).length;
  const complete = documents.length > 0 && received === documents.length;
  const progress = documents.length > 0 ? Math.round((received / documents.length) * 100) : 0;

  return (
    <CockpitCard
      icon={FileText}
      title="Documents du dossier"
      eyebrow="Documents & règlement"
      action={(
        <Button type="button" size="sm" variant="ghost" className="h-8 rounded-full text-xs" onClick={onOpen}>
          Tout voir
          <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden />
        </Button>
      )}
    >
      <div className="p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              {received}<span className="text-sm font-medium text-muted-foreground"> / {documents.length}</span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {complete ? 'Dossier documentaire complet' : documents.length > 0 ? 'Pièces reçues' : 'Aucune pièce demandée'}
            </p>
          </div>
          <Badge
            variant="outline"
            className={cn(
              'rounded-full',
              complete
                ? 'border-done/30 bg-done-soft text-done'
                : 'border-due/30 bg-due-soft text-due',
            )}
          >
            {complete ? 'Complet' : 'À compléter'}
          </Badge>
        </div>

        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-muted">
          <span className="block h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>

        {documents.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {documents.slice(0, 6).map((document) => (
              <button
                key={document.id}
                type="button"
                onClick={onOpen}
                className="flex min-w-0 items-center gap-2.5 rounded-xl border border-border bg-muted/20 px-3 py-2.5 text-left transition-colors hover:border-border-strong hover:bg-muted/40"
              >
                <span className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border',
                  document.uploaded
                    ? 'border-done/30 bg-done-soft text-done'
                    : 'border-border bg-card text-muted-foreground',
                )}>
                  {document.uploaded ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3 w-3" />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium text-foreground">{document.label}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {document.uploaded ? `Reçu${document.uploaded_at ? ` · ${formatDate(document.uploaded_at)}` : ''}` : 'En attente'}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={onOpen}
            className="flex w-full items-center justify-center rounded-xl border border-dashed border-border px-4 py-7 text-xs font-medium text-muted-foreground hover:border-primary/35 hover:text-primary"
          >
            Ouvrir la gestion des documents
          </button>
        )}
      </div>
    </CockpitCard>
  );
}

function AppointmentCard({
  appointment,
  advisorName,
  onOpen,
}: {
  appointment: AppointmentAvecClient | null;
  advisorName: string | null;
  onOpen: () => void;
}) {
  return (
    <CockpitCard
      icon={Calendar}
      title="Rendez-vous"
      action={(
        <Button type="button" size="sm" variant="ghost" className="h-8 rounded-full text-xs" onClick={onOpen}>
          Ouvrir
        </Button>
      )}
    >
      <div className="p-4">
        {appointment ? (
          <>
            <div className="rounded-xl bg-primary px-4 py-3 text-primary-foreground shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-primary-foreground/75">
                Prochaine intervention
              </p>
              <p className="mt-1 text-lg font-semibold">{formatDateTime(appointment.start_time)}</p>
            </div>
            <div className="mt-3 space-y-2.5">
              <CompactLine icon={UserRound} label="Technicien" value={advisorName ?? 'Non assigné'} />
              <CompactLine icon={MapPin} label="Lieu" value={appointment.address ?? 'Adresse du dossier'} />
              <CompactLine
                icon={Clock3}
                label="Statut"
                value={appointmentStatusLabels[appointment.status] ?? appointment.status ?? 'Planifié'}
              />
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-due/40 bg-due-soft px-4 py-5 text-center">
            <Calendar className="mx-auto h-6 w-6 text-due" aria-hidden />
            <p className="mt-2 text-sm font-semibold text-foreground">Aucun rendez-vous</p>
            <p className="mt-1 text-xs text-muted-foreground">Le dossier doit encore être planifié.</p>
            <Button type="button" size="sm" className="mt-3 rounded-full" onClick={onOpen}>
              Planifier
            </Button>
          </div>
        )}
      </div>
    </CockpitCard>
  );
}

function CompactLine({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Calendar;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-xs font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}

function FinanceCard({
  finance,
  estimatedMargin,
  invoiceCount,
  supplierDocumentCount,
  onOpen,
}: {
  finance: GlassCockpitFinance;
  estimatedMargin: number;
  invoiceCount: number;
  supplierDocumentCount: number;
  onOpen: () => void;
}) {
  return (
    <CockpitCard
      icon={WalletCards}
      title="Finance"
      action={(
        <Button type="button" size="sm" variant="ghost" className="h-8 rounded-full text-xs" onClick={onOpen}>
          Détail
        </Button>
      )}
    >
      <div className="grid grid-cols-2 gap-px bg-border">
        <FinancialMetric label="Facturé" value={finance.hasInvoice ? euroFormatter.format(finance.total) : '—'} />
        <FinancialMetric label="Encaissé" value={finance.hasInvoice ? euroFormatter.format(finance.paid) : '—'} positive={finance.paid > 0} />
        <FinancialMetric label="Reste dû" value={finance.hasInvoice ? euroFormatter.format(finance.due) : '—'} warning={finance.due > 0} />
        <FinancialMetric label="Marge estimée" value={estimatedMargin ? euroFormatter.format(estimatedMargin) : '—'} positive={estimatedMargin > 0} />
      </div>
      <div className="flex flex-wrap gap-2 px-4 py-3">
        <Badge variant="outline" className="rounded-full text-[10px]">{invoiceCount} facture{invoiceCount > 1 ? 's' : ''}</Badge>
        <Badge variant="outline" className="rounded-full text-[10px]">{supplierDocumentCount} pièce{supplierDocumentCount > 1 ? 's' : ''} fournisseur</Badge>
      </div>
    </CockpitCard>
  );
}

function FinancialMetric({
  label,
  value,
  positive,
  warning,
}: {
  label: string;
  value: string;
  positive?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="min-w-0 bg-card px-4 py-3">
      <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn(
        'mt-1 truncate text-sm font-semibold tabular-nums text-foreground',
        positive && 'text-done',
        warning && 'text-due',
      )}>{value}</p>
    </div>
  );
}

function ClientCard({
  client,
  clientName,
}: {
  client: Contact | Lead | null;
  clientName: string;
}) {
  const address = [client?.address, client?.postal_code, client?.city].filter(Boolean).join(' ');

  return (
    <CockpitCard icon={UserRound} title="Contact" eyebrow="Même client, même affaire">
      <div className="p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground">
            {clientName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '—'}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{clientName}</p>
            <p className="truncate text-xs text-muted-foreground">{address || 'Adresse non renseignée'}</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button asChild type="button" size="sm" variant="outline" className="min-w-0 rounded-xl">
            <a href={client?.phone ? `tel:${client.phone}` : undefined} aria-disabled={!client?.phone}>
              <Phone className="mr-1.5 h-3.5 w-3.5" />
              <span className="truncate">{client?.phone ?? 'Téléphone'}</span>
            </a>
          </Button>
          <Button asChild type="button" size="sm" variant="outline" className="min-w-0 rounded-xl">
            <a href={client?.email ? `mailto:${client.email}` : undefined} aria-disabled={!client?.email}>
              <Mail className="mr-1.5 h-3.5 w-3.5" />
              <span className="truncate">Email</span>
            </a>
          </Button>
        </div>
      </div>
    </CockpitCard>
  );
}

function OnifyCard({
  caseData,
  insurerName,
}: {
  caseData: WindscreenCase;
  insurerName: string | null;
}) {
  return (
    <CockpitCard
      icon={RefreshCw}
      title="Suivi Glass Onify"
      action={<SourceBadge source="onify" />}
    >
      <div className="p-4">
        <div className="flex items-center gap-3 rounded-xl border border-upcoming/20 bg-upcoming-soft p-3">
          <LogoAssureur nom={insurerName} taille="md" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{insurerName || 'Assurance non renseignée'}</p>
            <p className="truncate text-[10px] text-muted-foreground">
              {caseData.onify_reference ?? caseData.case_number}
            </p>
          </div>
        </div>
        <div className="mt-3 space-y-2">
          <StatusLine label="Type de dossier" value={caseData.onify_type ?? 'Non renseigné'} />
          <StatusLine label="Dossier" value={caseData.onify_status_label ?? caseData.onify_status_code ?? 'Synchronisé'} />
          <StatusLine label="Statut des travaux" value={caseData.onify_work_status_label ?? caseData.onify_work_status_code ?? 'Non renseigné'} />
          <StatusLine label="Vitrage Onify" value={caseData.onify_glass_items?.join(', ') || 'Non renseigné'} />
          <StatusLine
            label="Règlement"
            value={caseData.onify_payment_status ? paymentLabels[caseData.onify_payment_status] ?? caseData.onify_payment_status : 'Non renseigné'}
          />
          <StatusLine label="Dernière synchro" value={formatDateTime(caseData.onify_updated_at ?? caseData.onify_synced_at)} />
        </div>
      </div>
    </CockpitCard>
  );
}

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="max-w-[65%] text-right text-xs font-medium text-foreground">{value}</span>
    </div>
  );
}

function ActivityCard({
  activities,
  onOpen,
}: {
  activities: Activity[];
  onOpen: () => void;
}) {
  const latest = [...activities]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 4);

  return (
    <CockpitCard
      icon={ActivityIcon}
      title="Activité récente"
      action={(
        <Button type="button" size="sm" variant="ghost" className="h-8 rounded-full text-xs" onClick={onOpen}>
          Historique
        </Button>
      )}
    >
      <div className="p-4">
        {latest.length > 0 ? (
          <ol className="space-y-0">
            {latest.map((activity, index) => (
              <li key={activity.id} className="relative flex gap-3 pb-4 last:pb-0">
                {index < latest.length - 1 && (
                  <span className="absolute left-[7px] top-4 h-[calc(100%-8px)] w-px bg-border" />
                )}
                <span className="relative z-10 mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-card bg-primary" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold capitalize text-foreground">
                    {activity.action.replace(/_/g, ' ')}
                  </p>
                  {activity.description && (
                    <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">
                      {activity.description}
                    </p>
                  )}
                  <p className="mt-1 text-[9px] text-muted-foreground">{formatDateTime(activity.created_at)}</p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="py-3 text-center text-xs text-muted-foreground">Aucune activité enregistrée.</p>
        )}
      </div>
    </CockpitCard>
  );
}

export function GlassCaseCockpit({
  caseData,
  client,
  lead,
  clientName,
  insurerName,
  advisorName,
  documents,
  appointments,
  activities,
  invoiceCount,
  finance,
  supplierDocumentCount,
  vehicleVisual,
  operationalEditor,
  onDocuments,
  onAppointment,
  onFinance,
  onHistory,
}: GlassCaseCockpitProps) {
  const vehicleMake = caseData.onify_vehicle_make ?? lead?.vehicle_make;
  const vehicleModel = caseData.onify_vehicle_model ?? lead?.vehicle_model;
  const registration = caseData.onify_vehicle_registration ?? lead?.vehicle_registration;
  const sortedAppointments = [...appointments].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
  );
  const nextAppointment = sortedAppointments.find((appointment) => new Date(appointment.end_time).getTime() >= Date.now())
    ?? sortedAppointments[sortedAppointments.length - 1]
    ?? null;
  const receivedDocuments = documents.filter((document) => document.uploaded).length;
  const documentsComplete = documents.length > 0 && receivedDocuments === documents.length;
  const completionItems = [
    Boolean(vehicleMake && vehicleModel && registration),
    Boolean(caseData.intervention_address && caseData.intervention_city),
    Boolean(insurerName),
    caseData.franchise_amount != null,
    documentsComplete,
    appointments.length > 0,
  ];
  const completionCount = completionItems.filter(Boolean).length;
  const completionPercentage = Math.round((completionCount / completionItems.length) * 100);

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-2xl bg-secondary px-4 py-4 text-secondary-foreground shadow-md sm:px-6 sm:py-5">
        <span className="pointer-events-none absolute -right-14 -top-24 h-56 w-56 rounded-full bg-primary/25 blur-3xl" />
        <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.42fr)] lg:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-full border-white/15 bg-white/10 text-[10px] text-white hover:bg-white/10">
                Client & véhicule
              </Badge>
              <SourceBadge source={caseData.onify_glass_case_id ? 'onify' : lead ? 'lead' : 'manual'} />
            </div>
            <h2 className="mt-3 text-balance text-xl font-semibold sm:text-2xl">
              {vehicleMake || vehicleModel ? [vehicleMake, vehicleModel].filter(Boolean).join(' ') : 'Véhicule à identifier'}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-secondary-foreground/70">
              <span>{registration || 'Immatriculation manquante'}</span>
              <span>{caseData.glass_type || 'Vitrage à qualifier'}</span>
              <span>{caseData.has_adas_camera ? 'ADAS détecté' : 'ADAS non renseigné'}</span>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.07] p-3.5 backdrop-blur-sm">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-secondary-foreground/55">
                  Dossier opérationnel
                </p>
                <p className="mt-1 text-sm font-semibold">{completionCount} / {completionItems.length} éléments prêts</p>
              </div>
              <span className="text-lg font-semibold tabular-nums text-primary">{completionPercentage}%</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <span className="block h-full rounded-full bg-primary transition-all" style={{ width: `${completionPercentage}%` }} />
            </div>
            <p className="mt-2 text-[10px] text-secondary-foreground/55">
              Adresse, assurance, franchise, documents et rendez-vous sont contrôlés ici.
            </p>
          </div>
        </div>
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,7fr)_minmax(300px,3fr)]">
        <main className="min-w-0 space-y-5">
          {vehicleVisual}
          {operationalEditor}
          <DocumentsCard documents={documents} onOpen={onDocuments} />
        </main>

        <aside className="min-w-0 space-y-5">
          <AppointmentCard appointment={nextAppointment} advisorName={advisorName} onOpen={onAppointment} />
          <FinanceCard
            finance={finance}
            estimatedMargin={caseData.estimated_margin}
            invoiceCount={invoiceCount}
            supplierDocumentCount={supplierDocumentCount}
            onOpen={onFinance}
          />
          <ClientCard client={client} clientName={clientName} />
          <OnifyCard caseData={caseData} insurerName={insurerName} />
          <ActivityCard activities={activities} onOpen={onHistory} />
        </aside>
      </div>

      <section className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-3 sm:p-5">
        <SummaryTile icon={ShieldCheck} label="Assurance" value={insurerName || 'À renseigner'} detail={`Franchise · ${formatFranchise(caseData)}`} />
        <SummaryTile icon={Receipt} label="Finance" value={finance.hasInvoice ? euroFormatter.format(finance.total) : 'Pas de facture'} detail={finance.due > 0 ? `${euroFormatter.format(finance.due)} restant dû` : finance.hasInvoice ? 'Dossier soldé' : 'Montant indisponible'} />
        <SummaryTile icon={CheckCircle2} label="Arrivée du dossier" value={formatDate(caseData.onify_created_at ?? caseData.created_at)} detail={caseData.onify_stage || 'Étape Onify non renseignée'} />
      </section>
    </div>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Calendar;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-xl bg-muted/30 p-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-card text-primary shadow-sm">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{value}</p>
        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
