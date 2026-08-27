import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  TrendingUp,
  Phone,
  CalendarDays,
  FileWarning,
  AlertCircle,
  Receipt,
  Gift,
  Wrench,
  PhoneCall,
  MessageSquare,
  FolderOpen,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Inbox,
} from 'lucide-react';

import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

import {
  fetchLeads,
  fetchTasks,
  fetchAppointments,
  fetchActivities,
  fetchInvoices,
  fetchGifts,
  fetchAfterSalesCases,
  fetchCases,
  updateTask,
} from '@/services/crm-service';
import type {
  Lead,
  Task,
  Appointment,
  Activity,
  Invoice,
  Gift as GiftType,
  AfterSalesCase,
  WindscreenCase,
  TaskPriority,
} from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function endOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(23, 59, 59, 999);
  return c;
}

function isSameDay(a: string | Date, ref: Date): boolean {
  const d = typeof a === 'string' ? new Date(a) : a;
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

function isToday(iso: string | null | undefined): boolean {
  if (!iso) return false;
  return isSameDay(iso, new Date());
}

function isOverdue(iso: string | null | undefined): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() < Date.now() && !isToday(iso);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'hier';
  if (d < 7) return `il y a ${d} jours`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

const PRIORITY_RANK: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  urgent: 'Urgent',
  high: 'Haute',
  normal: 'Normale',
  low: 'Basse',
};

const TASK_TYPE_LABEL: Record<string, string> = {
  call: 'Appel',
  sms: 'SMS',
  email: 'Email',
  follow_up: 'Relance',
  document: 'Document',
  other: 'Autre',
};

// ---------------------------------------------------------------------------
// Metric card
// ---------------------------------------------------------------------------

interface MetricCardProps {
  icon: typeof TrendingUp;
  value: number | string;
  label: string;
  loading: boolean;
  accent?: boolean;
  href?: string;
}

function MetricCard({ icon: Icon, value, label, loading, accent, href }: MetricCardProps) {
  const content = (
    <Card
      className={cn(
        'rounded-xl border border-border p-4 transition-shadow hover:shadow-sm',
        href && 'cursor-pointer'
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/40">
          <Icon
            className="h-4 w-4"
            style={accent ? { color: 'hsl(var(--primary))' } : { color: 'hsl(var(--muted-foreground))' }}
          />
        </div>
        {accent && value !== 0 && (
          <span
            className="text-[11px] font-medium"
            style={{ color: 'hsl(var(--primary))' }}
          >
            •
          </span>
        )}
      </div>
      <div className="mt-3">
        {loading ? (
          <Skeleton className="h-7 w-12" />
        ) : (
          <div className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {value}
          </div>
        )}
        <p className="mt-0.5 text-[13px] text-muted-foreground">{label}</p>
      </div>
    </Card>
  );

  if (href) {
    return (
      <a href={href} className="block">
        {content}
      </a>
    );
  }
  return content;
}

// ---------------------------------------------------------------------------
// Priority action row
// ---------------------------------------------------------------------------

interface PriorityActionProps {
  task: Task;
  onCall: (t: Task) => void;
  onSms: (t: Task) => void;
  onOpenCase: (t: Task) => void;
  onComplete: (t: Task) => void;
}

function PriorityAction({ task, onCall, onSms, onOpenCase, onComplete }: PriorityActionProps) {
  const due = task.due_at ? new Date(task.due_at) : null;
  const overdue = due ? due.getTime() < Date.now() : false;

  return (
    <div className="flex items-center gap-3 border-b border-border px-2 py-3 last:border-0">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40">
        {task.type === 'call' ? (
          <PhoneCall className="h-4 w-4 text-muted-foreground" />
        ) : task.type === 'sms' ? (
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
        ) : (
          <Clock className="h-4 w-4 text-muted-foreground" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
        <div className="mt-1 flex items-center gap-2">
          <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
            {TASK_TYPE_LABEL[task.type] ?? task.type}
          </Badge>
          {due && (
            <span
              className={cn(
                'text-[11px] tabular-nums',
                overdue ? 'font-medium text-destructive' : 'text-muted-foreground'
              )}
            >
              {overdue ? 'En retard · ' : ''}
              {due.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}{' '}
              {formatTime(task.due_at!)}
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full"
          onClick={() => onCall(task)}
          title="Appeler"
        >
          <PhoneCall className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full"
          onClick={() => onSms(task)}
          title="SMS"
        >
          <MessageSquare className="h-4 w-4" />
        </Button>
        {task.case_id && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={() => onOpenCase(task)}
            title="Ouvrir le dossier"
          >
            <FolderOpen className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full"
          onClick={() => onComplete(task)}
          title="Terminer"
        >
          <CheckCircle2 className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity row
// ---------------------------------------------------------------------------

function ActivityRow({ activity }: { activity: Activity }) {
  const meta = activityDescription(activity);
  return (
    <div className="flex items-start gap-3 px-2 py-2.5">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40">
        <meta.icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">
          {activity.description ?? activity.action}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {activity.entity_type} · {formatRelative(activity.created_at)}
        </p>
      </div>
    </div>
  );
}

function activityDescription(a: Activity): { icon: typeof TrendingUp } {
  const action = (a.action ?? '').toLowerCase();
  if (action.includes('call') || action.includes('appel')) return { icon: PhoneCall };
  if (action.includes('sms')) return { icon: MessageSquare };
  if (action.includes('lead')) return { icon: TrendingUp };
  if (action.includes('appointment') || action.includes('rendez')) return { icon: CalendarDays };
  if (action.includes('invoice') || action.includes('facture')) return { icon: Receipt };
  if (action.includes('case') || action.includes('dossier')) return { icon: FolderOpen };
  return { icon: ArrowUpRight };
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ icon: Icon, message }: { icon: typeof TrendingUp; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <Icon className="h-6 w-6 text-muted-foreground/60" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function TodayPage() {
  const queryClient = useQueryClient();
  const now = useMemo(() => new Date(), []);

  const dayStart = useMemo(() => startOfDay(now).toISOString(), [now]);
  const dayEnd = useMemo(() => endOfDay(now).toISOString(), [now]);

  // ---- Data queries -------------------------------------------------------

  const leadsQuery = useQuery<Lead[], Error>({
    queryKey: ['today', 'leads'],
    queryFn: () => fetchLeads({}),
  });

  const tasksQuery = useQuery<Task[], Error>({
    queryKey: ['today', 'tasks', 'pending'],
    queryFn: () => fetchTasks({ status: 'pending' }),
  });

  const appointmentsQuery = useQuery<Appointment[], Error>({
    queryKey: ['today', 'appointments', dayStart, dayEnd],
    queryFn: () => fetchAppointments({ startDate: dayStart, endDate: dayEnd }),
  });

  const activitiesQuery = useQuery<Activity[], Error>({
    queryKey: ['today', 'activities'],
    queryFn: () => fetchActivities({ limit: 10 }),
  });

  const invoicesQuery = useQuery<Invoice[], Error>({
    queryKey: ['today', 'invoices'],
    queryFn: () => fetchInvoices({}),
  });

  const giftsQuery = useQuery<GiftType[], Error>({
    queryKey: ['today', 'gifts', 'pending'],
    queryFn: () => fetchGifts({ status: 'pending' }),
  });

  const savQuery = useQuery<AfterSalesCase[], Error>({
    queryKey: ['today', 'sav', 'open'],
    queryFn: () => fetchAfterSalesCases({ status: 'open' }),
  });

  const casesQuery = useQuery<WindscreenCase[], Error>({
    queryKey: ['today', 'cases', 'overdue'],
    queryFn: () => fetchCases({}),
  });

  // ---- Derived metrics ----------------------------------------------------

  const leadsToday = useMemo(() => {
    const leads = leadsQuery.data ?? [];
    return leads.filter((l) => isToday(l.created_at));
  }, [leadsQuery.data]);

  const prospectsToCall = useMemo(() => {
    const leads = leadsQuery.data ?? [];
    return leads.filter((l) => l.status === 'to_call' || l.status === 'nrp');
  }, [leadsQuery.data]);

  const appointmentsToday = appointmentsQuery.data ?? [];

  const tasksToday = useMemo(() => {
    const tasks = tasksQuery.data ?? [];
    return tasks
      .filter((t) => t.due_at && isToday(t.due_at))
      .sort((a, b) => {
        const pa = PRIORITY_RANK[a.priority] ?? 9;
        const pb = PRIORITY_RANK[b.priority] ?? 9;
        if (pa !== pb) return pa - pb;
        return new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime();
      });
  }, [tasksQuery.data]);

  const documentsMissing = useMemo(() => {
    // Cases in documents_pending status — surfaced as "documents manquants"
    const cases = casesQuery.data ?? [];
    return cases.filter((c) => c.status === 'documents_pending');
  }, [casesQuery.data]);

  const overdueCases = useMemo(() => {
    const cases = casesQuery.data ?? [];
    return cases.filter(
      (c) =>
        c.appointment_date &&
        isOverdue(c.appointment_date) &&
        c.status !== 'intervention_done' &&
        c.status !== 'invoice_sent' &&
        c.status !== 'payment_received' &&
        c.status !== 'completed'
    );
  }, [casesQuery.data]);

  const invoicesPending = useMemo(() => {
    const inv = invoicesQuery.data ?? [];
    return inv.filter((i) => i.status === 'sent' || i.status === 'partial');
  }, [invoicesQuery.data]);

  const giftsPending = giftsQuery.data ?? [];
  const savOpen = savQuery.data ?? [];

  const anyLoading =
    leadsQuery.isLoading ||
    tasksQuery.isLoading ||
    appointmentsQuery.isLoading ||
    activitiesQuery.isLoading ||
    invoicesQuery.isLoading ||
    giftsQuery.isLoading ||
    savQuery.isLoading ||
    casesQuery.isLoading;

  // ---- Actions ------------------------------------------------------------

  function handleCall(task: Task) {
    toast.info(`Appel en cours…`, { description: task.title });
  }

  function handleSms(task: Task) {
    toast.info(`Ouverture SMS…`, { description: task.title });
  }

  function handleOpenCase(task: Task) {
    if (task.case_id) {
      window.location.href = `/cases?id=${task.case_id}`;
    }
  }

  async function handleComplete(task: Task) {
    const { error } = await updateTask(task.id, {
      status: 'done',
      completed_at: new Date().toISOString(),
    });
    if (error) {
      toast.error('Impossible de terminer la tâche', { description: error });
      return;
    }
    toast.success('Tâche terminée', { description: task.title });
    void queryClient.invalidateQueries({ queryKey: ['today', 'tasks'] });
  }

  // ---- Render -------------------------------------------------------------

  const metrics: MetricCardProps[] = [
    {
      icon: TrendingUp,
      value: leadsToday.length,
      label: "Leads reçus aujourd'hui",
      loading: leadsQuery.isLoading,
      accent: leadsToday.length > 0,
      href: '/leads',
    },
    {
      icon: Phone,
      value: prospectsToCall.length,
      label: 'Prospects à rappeler',
      loading: leadsQuery.isLoading,
      accent: prospectsToCall.length > 0,
      href: '/leads',
    },
    {
      icon: CalendarDays,
      value: appointmentsToday.length,
      label: 'Rendez-vous du jour',
      loading: appointmentsQuery.isLoading,
      accent: appointmentsToday.length > 0,
      href: '/calendar',
    },
    {
      icon: FileWarning,
      value: documentsMissing.length,
      label: 'Documents manquants',
      loading: casesQuery.isLoading,
      href: '/cases',
    },
    {
      icon: AlertCircle,
      value: overdueCases.length,
      label: 'Dossiers en retard',
      loading: casesQuery.isLoading,
      href: '/cases',
    },
    {
      icon: Receipt,
      value: invoicesPending.length,
      label: 'Factures en attente',
      loading: invoicesQuery.isLoading,
      href: '/billing',
    },
    {
      icon: Gift,
      value: giftsPending.length,
      label: 'Cadeaux/virements à effectuer',
      loading: giftsQuery.isLoading,
      href: '/cases',
    },
    {
      icon: Wrench,
      value: savOpen.length,
      label: 'SAV ouverts',
      loading: savQuery.isLoading,
      href: '/cases',
    },
  ];

  return (
    <div className="min-h-full bg-background">
      <PageHeader title="Aujourd'hui" description="Vue d'ensemble de la journée" />

      <div className="space-y-8 p-6">
        {/* ---------------- Metrics ---------------- */}
        <section>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {metrics.map((m) => (
              <MetricCard key={m.label} {...m} />
            ))}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* ---------------- Priority actions ---------------- */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Actions prioritaires</h2>
              {tasksToday.length > 0 && (
                <Badge variant="outline" className="rounded-full px-2 py-0.5 text-[11px]">
                  {tasksToday.length} {tasksToday.length > 1 ? 'tâches' : 'tâche'}
                </Badge>
              )}
            </div>

            <Card className="rounded-xl border border-border p-2">
              {tasksQuery.isLoading ? (
                <div className="space-y-3 p-2">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-9 w-9 rounded-lg" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/3" />
                      </div>
                      <Skeleton className="h-8 w-8 rounded-full" />
                    </div>
                  ))}
                </div>
              ) : tasksToday.length === 0 ? (
                <EmptyState
                  icon={CheckCircle2}
                  message="Aucune action prioritaire pour aujourd'hui."
                />
              ) : (
                tasksToday.map((task) => (
                  <PriorityAction
                    key={task.id}
                    task={task}
                    onCall={handleCall}
                    onSms={handleSms}
                    onOpenCase={handleOpenCase}
                    onComplete={handleComplete}
                  />
                ))
              )}
            </Card>
          </section>

          {/* ---------------- Recent activity ---------------- */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Activité récente</h2>
              {!anyLoading && (activitiesQuery.data?.length ?? 0) > 0 && (
                <Badge variant="outline" className="rounded-full px-2 py-0.5 text-[11px]">
                  10 dernières
                </Badge>
              )}
            </div>

            <Card className="rounded-xl border border-border p-2">
              {activitiesQuery.isLoading ? (
                <div className="space-y-3 p-2">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-7 w-7 rounded-md" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-2/3" />
                        <Skeleton className="h-3 w-1/4" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (activitiesQuery.data?.length ?? 0) === 0 ? (
                <EmptyState icon={Inbox} message="Aucune activité récente." />
              ) : (
                activitiesQuery.data!.map((a) => <ActivityRow key={a.id} activity={a} />)
              )}
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}
