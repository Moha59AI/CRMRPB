import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, Calendar, CalendarClock, CheckCircle2, Clock,
  FileText, Inbox, ListChecks, Mail, MessageSquare, Phone, Play, Search,
  ShieldCheck, UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { fetchLeads } from '@/services/leads-service';
import { fetchTasks, updateTask } from '@/services/planning-service';
import { fetchProfiles } from '@/services/profiles-service';
import { statusLabels } from '@/features/leads/lead-shared';
import type { Lead, Profile, Task, TaskStatus } from '@/types';

const priorityConfig: Record<string, { label: string; className: string }> = {
  urgent: { label: 'Urgent', className: 'bg-urgent-soft text-urgent border-urgent/25' },
  high: { label: 'Haute', className: 'bg-due-soft text-due border-due/25' },
  normal: { label: 'Normale', className: 'bg-muted text-muted-foreground border-border' },
  low: { label: 'Basse', className: 'bg-muted/50 text-muted-foreground border-border' },
};

const statusConfig: Record<TaskStatus, { label: string; className: string }> = {
  pending: { label: 'À faire', className: 'border-due/25 bg-due-soft text-due' },
  in_progress: { label: 'En cours', className: 'border-primary/25 bg-primary/10 text-primary' },
  done: { label: 'Terminée', className: 'border-done/25 bg-done-soft text-done' },
  cancelled: { label: 'Annulée', className: 'border-border bg-muted text-muted-foreground' },
};

function estActive(task: Task): boolean {
  return task.status === 'pending' || task.status === 'in_progress';
}

function pourSaisieDate(iso: string | null): string {
  const date = iso ? new Date(iso) : new Date(Date.now() + 60 * 60 * 1_000);
  const decalage = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - decalage).toISOString().slice(0, 16);
}

export function FollowUpPage() {
  const [statusFilter, setStatusFilter] = useState('active');
  const [userFilter, setUserFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [taskToReschedule, setTaskToReschedule] = useState<Task | null>(null);
  const [newDueAt, setNewDueAt] = useState('');
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const taskQuery = useQuery({
    queryKey: ['followup-tasks', statusFilter, userFilter],
    queryFn: () => fetchTasks({
      assignedUserId: userFilter,
      statuses: statusFilter === 'active' ? ['pending', 'in_progress'] : undefined,
      status: statusFilter === 'active' ? undefined : statusFilter,
    }),
  });
  const activeMetricQuery = useQuery({
    queryKey: ['followup-tasks', 'active', userFilter],
    queryFn: () => fetchTasks({
      assignedUserId: userFilter,
      statuses: ['pending', 'in_progress'],
    }),
  });
  const { data: tasks, isLoading, isError, refetch } = taskQuery;

  const { data: leads } = useQuery({
    queryKey: ['followup-leads'],
    queryFn: () => fetchLeads({}),
  });

  const { data: profiles } = useQuery({
    queryKey: ['followup-profiles'],
    queryFn: fetchProfiles,
  });

  const leadMap = useMemo(
    () => new Map<string, Lead>((leads ?? []).map((lead) => [lead.id, lead])),
    [leads],
  );
  const profileMap = useMemo(
    () => new Map<string, Profile>((profiles ?? []).map((profile) => [profile.id, profile])),
    [profiles],
  );

  const filteredTasks = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('fr-FR');
    return (tasks ?? []).filter((task) => {
      const statusOk = statusFilter === 'all'
        || (statusFilter === 'active' && estActive(task))
        || task.status === statusFilter;
      if (!statusOk) return false;
      if (!needle) return true;
      const lead = task.lead_id ? leadMap.get(task.lead_id) : null;
      const haystack = [
        task.title, task.description, lead?.first_name, lead?.last_name,
        lead?.phone, lead?.vehicle_registration,
      ].filter(Boolean).join(' ').toLocaleLowerCase('fr-FR');
      return haystack.includes(needle);
    });
  }, [leadMap, search, statusFilter, tasks]);

  const now = Date.now();
  const debutJour = new Date();
  debutJour.setHours(0, 0, 0, 0);
  const finJour = new Date(debutJour);
  finJour.setDate(finJour.getDate() + 1);

  const activeTasks = filteredTasks.filter(estActive);
  const overdueTasks = activeTasks.filter((task) => task.due_at && new Date(task.due_at).getTime() < now);
  const todayTasks = activeTasks.filter((task) => {
    if (!task.due_at) return false;
    const due = new Date(task.due_at).getTime();
    return due >= now && due < finJour.getTime();
  });
  const upcomingTasks = activeTasks.filter((task) => (
    task.due_at && new Date(task.due_at).getTime() >= finJour.getTime()
  ));
  const noDateTasks = activeTasks.filter((task) => !task.due_at);
  const doneTasks = filteredTasks
    .filter((task) => task.status === 'done')
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const cancelledTasks = filteredTasks
    .filter((task) => task.status === 'cancelled')
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  const allActive = activeMetricQuery.data ?? [];
  const metricOverdue = allActive.filter((task) => task.due_at && new Date(task.due_at).getTime() < now).length;
  const metricToday = allActive.filter((task) => {
    if (!task.due_at) return false;
    const due = new Date(task.due_at).getTime();
    return due >= debutJour.getTime() && due < finJour.getTime();
  }).length;
  const metricEmail = allActive.filter((task) => task.origin === 'email_auto').length;

  const mutateStatus = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: TaskStatus }) => {
      const result = await updateTask(taskId, {
        status,
        completed_at: status === 'done' ? new Date().toISOString() : null,
      });
      if (result.error) throw new Error(result.error);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['followup-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['lead-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['accueil', 'taches'] });
      queryClient.invalidateQueries({ queryKey: ['relances'] });
      toast.success(variables.status === 'done' ? 'Tâche terminée' : 'Tâche démarrée');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rescheduleMutation = useMutation({
    mutationFn: async () => {
      if (!taskToReschedule || !newDueAt) throw new Error('Choisissez une nouvelle échéance.');
      const date = new Date(newDueAt);
      if (Number.isNaN(date.getTime())) throw new Error('La date choisie est invalide.');
      const result = await updateTask(taskToReschedule.id, { due_at: date.toISOString() });
      if (result.error) throw new Error(result.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['followup-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['lead-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['accueil', 'taches'] });
      setTaskToReschedule(null);
      toast.success('Tâche reprogrammée');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openTask = (task: Task) => {
    if (task.lead_id) navigate(`/interventions/${task.lead_id}`);
    else if (task.contact_id) navigate(`/clients/${task.contact_id}`);
    else if (task.source_communication_id) navigate('/emails');
  };

  const hasResults = filteredTasks.length > 0;

  return (
    <>
      <PageHeader
        title="Tâches"
        description="Tout ce que l'équipe doit rappeler, envoyer ou vérifier"
        action={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full rounded-full sm:w-[145px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">À faire</SelectItem>
                <SelectItem value="all">Toutes</SelectItem>
                <SelectItem value="pending">En attente</SelectItem>
                <SelectItem value="in_progress">En cours</SelectItem>
                <SelectItem value="done">Terminées</SelectItem>
                <SelectItem value="cancelled">Annulées</SelectItem>
              </SelectContent>
            </Select>
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="w-full rounded-full sm:w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toute l'équipe</SelectItem>
                {(profiles ?? []).map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {[profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Utilisateur'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-3 scrollbar-thin sm:p-6">
        <div className="mx-auto max-w-6xl space-y-5">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <MetricCard icon={ListChecks} label="À faire" value={allActive.length} tone="primary" />
            <MetricCard icon={AlertTriangle} label="En retard" value={metricOverdue} tone="urgent" />
            <MetricCard icon={CalendarClock} label="Aujourd'hui" value={metricToday} tone="due" />
            <MetricCard icon={ShieldCheck} label="Experts / assurances" value={metricEmail} tone="done" />
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher une tâche, un client, un téléphone ou une plaque…"
              className="h-11 rounded-xl bg-card pl-9"
            />
          </div>

          {isLoading && (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          )}

          {isError && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/5 py-16 text-center">
              <AlertTriangle className="mb-3 h-8 w-8 text-destructive" />
              <p className="text-sm font-medium text-foreground">Impossible de charger les tâches</p>
              <Button variant="outline" className="mt-4 rounded-full" onClick={() => refetch()}>
                Réessayer
              </Button>
            </div>
          )}

          {!isLoading && !isError && !hasResults && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card py-16 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface">
                <Inbox className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Aucune tâche avec ces filtres</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Programmez un rappel depuis une fiche lead, ou modifiez les filtres.
              </p>
            </div>
          )}

          {!isLoading && !isError && hasResults && (
            <div className="space-y-6">
              <TaskSection
                title="En retard"
                icon={<AlertTriangle className="h-4 w-4 text-urgent" />}
                tasks={overdueTasks}
                leadMap={leadMap}
                profileMap={profileMap}
                onOpen={openTask}
                onStart={(id) => mutateStatus.mutate({ taskId: id, status: 'in_progress' })}
                onComplete={(id) => mutateStatus.mutate({ taskId: id, status: 'done' })}
                onReschedule={(task) => { setTaskToReschedule(task); setNewDueAt(pourSaisieDate(task.due_at)); }}
                highlight="overdue"
              />
              <TaskSection
                title="Aujourd'hui"
                icon={<Clock className="h-4 w-4 text-primary" />}
                tasks={todayTasks}
                leadMap={leadMap}
                profileMap={profileMap}
                onOpen={openTask}
                onStart={(id) => mutateStatus.mutate({ taskId: id, status: 'in_progress' })}
                onComplete={(id) => mutateStatus.mutate({ taskId: id, status: 'done' })}
                onReschedule={(task) => { setTaskToReschedule(task); setNewDueAt(pourSaisieDate(task.due_at)); }}
              />
              <TaskSection
                title="À venir"
                icon={<Calendar className="h-4 w-4 text-muted-foreground" />}
                tasks={upcomingTasks}
                leadMap={leadMap}
                profileMap={profileMap}
                onOpen={openTask}
                onStart={(id) => mutateStatus.mutate({ taskId: id, status: 'in_progress' })}
                onComplete={(id) => mutateStatus.mutate({ taskId: id, status: 'done' })}
                onReschedule={(task) => { setTaskToReschedule(task); setNewDueAt(pourSaisieDate(task.due_at)); }}
              />
              <TaskSection
                title="Sans échéance"
                icon={<ListChecks className="h-4 w-4 text-muted-foreground" />}
                tasks={noDateTasks}
                leadMap={leadMap}
                profileMap={profileMap}
                onOpen={openTask}
                onStart={(id) => mutateStatus.mutate({ taskId: id, status: 'in_progress' })}
                onComplete={(id) => mutateStatus.mutate({ taskId: id, status: 'done' })}
                onReschedule={(task) => { setTaskToReschedule(task); setNewDueAt(pourSaisieDate(task.due_at)); }}
              />
              <TaskSection
                title="Terminées"
                icon={<CheckCircle2 className="h-4 w-4 text-done" />}
                tasks={doneTasks}
                leadMap={leadMap}
                profileMap={profileMap}
                onOpen={openTask}
                onStart={() => undefined}
                onComplete={() => undefined}
                onReschedule={() => undefined}
              />
              <TaskSection
                title="Annulées"
                icon={<ListChecks className="h-4 w-4 text-muted-foreground" />}
                tasks={cancelledTasks}
                leadMap={leadMap}
                profileMap={profileMap}
                onOpen={openTask}
                onStart={() => undefined}
                onComplete={() => undefined}
                onReschedule={() => undefined}
              />
            </div>
          )}
        </div>
      </div>

      <Dialog open={Boolean(taskToReschedule)} onOpenChange={(open) => { if (!open) setTaskToReschedule(null); }}>
        <DialogContent className="sm:max-w-md sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle>Reprogrammer la tâche</DialogTitle>
            <DialogDescription>{taskToReschedule?.title}</DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => { event.preventDefault(); rescheduleMutation.mutate(); }}>
            <div className="space-y-1.5 py-2">
              <Label htmlFor="task-reschedule">Nouvelle date et heure</Label>
              <Input
                id="task-reschedule"
                type="datetime-local"
                value={newDueAt}
                onChange={(event) => setNewDueAt(event.target.value)}
                required
                autoFocus
              />
            </div>
            <DialogFooter className="mt-4 gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setTaskToReschedule(null)}>Annuler</Button>
              <Button type="submit" disabled={!newDueAt || rescheduleMutation.isPending}>
                {rescheduleMutation.isPending ? 'Enregistrement…' : 'Reprogrammer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MetricCard({
  icon: Icon, label, value, tone,
}: {
  icon: typeof ListChecks;
  label: string;
  value: number;
  tone: 'primary' | 'urgent' | 'due' | 'done';
}) {
  const colors = {
    primary: 'bg-primary/10 text-primary',
    urgent: 'bg-urgent-soft text-urgent',
    due: 'bg-due-soft text-due',
    done: 'bg-done-soft text-done',
  };
  return (
    <Card className="flex items-center gap-3 rounded-xl p-3 shadow-none sm:p-4">
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', colors[tone])}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xl font-semibold tabular-nums text-foreground">{value}</p>
        <p className="truncate text-[11px] text-muted-foreground sm:text-xs">{label}</p>
      </div>
    </Card>
  );
}

function TaskSection({
  title, icon, tasks, leadMap, profileMap, onOpen, onStart, onComplete, onReschedule, highlight,
}: {
  title: string;
  icon: React.ReactNode;
  tasks: Task[];
  leadMap: Map<string, Lead>;
  profileMap: Map<string, Profile>;
  onOpen: (task: Task) => void;
  onStart: (id: string) => void;
  onComplete: (id: string) => void;
  onReschedule: (task: Task) => void;
  highlight?: 'overdue';
}) {
  if (tasks.length === 0) return null;
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <Badge variant="secondary" className="rounded-full text-[10px]">{tasks.length}</Badge>
      </div>
      <div className="space-y-2">
        {tasks.map((task) => {
          const lead = task.lead_id ? leadMap.get(task.lead_id) : null;
          const assignee = task.assigned_user_id ? profileMap.get(task.assigned_user_id) : null;
          const priority = priorityConfig[task.priority] ?? priorityConfig.normal;
          const status = statusConfig[task.status];
          const isOverdue = highlight === 'overdue';
          const canOpen = Boolean(task.lead_id || task.contact_id || task.source_communication_id);

          return (
            <Card
              key={task.id}
              role={canOpen ? 'button' : undefined}
              tabIndex={canOpen ? 0 : undefined}
              onClick={() => { if (canOpen) onOpen(task); }}
              onKeyDown={(event) => {
                if (canOpen && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault();
                  onOpen(task);
                }
              }}
              className={cn(
                'flex flex-col gap-3 rounded-xl border p-3 transition sm:flex-row sm:items-center',
                canOpen && 'cursor-pointer hover:border-border-strong hover:shadow-sm',
                isOverdue && 'border-urgent/25 bg-urgent-soft/25',
                task.status === 'done' && 'bg-done-soft/20 opacity-80',
              )}
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface">
                  <TaskTypeIcon type={task.type} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="min-w-0 truncate text-sm font-medium text-foreground">{task.title}</p>
                    <Badge variant="outline" className={cn('shrink-0 rounded-full text-[10px]', priority.className)}>
                      {priority.label}
                    </Badge>
                    <Badge variant="outline" className={cn('shrink-0 rounded-full text-[10px]', status.className)}>
                      {status.label}
                    </Badge>
                    {task.origin === 'email_auto' && (
                      <Badge variant="outline" className="shrink-0 rounded-full border-primary/20 bg-primary/5 text-[10px] text-primary">
                        Expert / assurance
                      </Badge>
                    )}
                  </div>
                  {task.description && (
                    <p className="mt-1 truncate text-xs text-muted-foreground">{task.description.replace(/\s+/g, ' ')}</p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {lead && (
                      <span className="flex min-w-0 items-center gap-1 truncate">
                        <UserRound className="h-3 w-3 shrink-0" />
                        <span className="truncate">
                          {[lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Lead sans nom'}
                          {lead.status && <span> · {statusLabels[lead.status] ?? lead.status}</span>}
                        </span>
                      </span>
                    )}
                    {task.due_at && (
                      <span className={cn('flex items-center gap-1', isOverdue && 'font-medium text-urgent')}>
                        <Clock className="h-3 w-3" />
                        {new Date(task.due_at).toLocaleString('fr-FR', {
                          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    )}
                    {assignee && (
                      <span>· {[assignee.first_name, assignee.last_name].filter(Boolean).join(' ') || 'Utilisateur'}</span>
                    )}
                  </div>
                </div>
              </div>

              {estActive(task) && (
                <div className="flex shrink-0 items-center justify-end gap-1 border-t border-border pt-2 sm:border-0 sm:pt-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-full px-2.5 text-xs"
                    onClick={(event) => { event.stopPropagation(); onReschedule(task); }}
                  >
                    <CalendarClock className="mr-1 h-3.5 w-3.5" />
                    Reprogrammer
                  </Button>
                  {task.status === 'pending' && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full"
                      aria-label={`Démarrer : ${task.title}`}
                      onClick={(event) => { event.stopPropagation(); onStart(task.id); }}
                    >
                      <Play className="h-3.5 w-3.5 text-primary" />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    aria-label={`Terminer : ${task.title}`}
                    onClick={(event) => { event.stopPropagation(); onComplete(task.id); }}
                  >
                    <CheckCircle2 className="h-4 w-4 text-done" />
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function TaskTypeIcon({ type }: { type: string }) {
  switch (type) {
    case 'call': return <Phone className="h-4 w-4 text-muted-foreground" />;
    case 'sms': return <MessageSquare className="h-4 w-4 text-muted-foreground" />;
    case 'email': return <Mail className="h-4 w-4 text-muted-foreground" />;
    case 'document': return <FileText className="h-4 w-4 text-muted-foreground" />;
    case 'follow_up': return <ArrowRight className="h-4 w-4 text-muted-foreground" />;
    default: return <ListChecks className="h-4 w-4 text-muted-foreground" />;
  }
}
