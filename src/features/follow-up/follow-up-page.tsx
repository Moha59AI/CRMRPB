import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Phone, MessageSquare, Mail, CheckCircle2, Clock,
  AlertTriangle, ListChecks, Calendar, ArrowRight,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { fetchLeads } from '@/services/leads-service';
import { fetchTasks, updateTask } from '@/services/planning-service';
import { fetchProfiles } from '@/services/profiles-service';
import type { Task, Lead, Profile } from '@/types';

const priorityConfig: Record<string, { label: string; className: string }> = {
  urgent: { label: 'Urgent', className: 'bg-red-50 text-red-600 border-red-200' },
  high: { label: 'Haute', className: 'bg-amber-50 text-amber-600 border-amber-200' },
  normal: { label: 'Normale', className: 'bg-muted text-muted-foreground border-border' },
  low: { label: 'Basse', className: 'bg-muted/50 text-muted-foreground border-border' },
};

const statusLabels: Record<string, string> = {
  new: 'Nouveau', to_call: 'À appeler', calling: 'Appel en cours', nrp: 'NRP',
  interested: 'Intéressé', documents_requested: 'Documents demandés',
  documents_received: 'Documents reçus', appointment_scheduled: 'RDV planifié',
  lost: 'Perdu', converted: 'Converti',
};

export function FollowUpPage() {
  const [statusFilter, setStatusFilter] = useState('pending');
  const [userFilter, setUserFilter] = useState('all');
  const queryClient = useQueryClient();

  const { data: tasks, isLoading, isError, refetch } = useQuery({
    queryKey: ['followup-tasks', statusFilter, userFilter],
    queryFn: () => fetchTasks({ status: statusFilter, assignedUserId: userFilter }),
  });

  const { data: leads } = useQuery({
    queryKey: ['followup-leads'],
    queryFn: () => fetchLeads({}),
  });

  const { data: profiles } = useQuery({
    queryKey: ['followup-profiles'],
    queryFn: fetchProfiles,
  });

  const leadMap = new Map<string, Lead>((leads ?? []).map((l) => [l.id, l]));
  const profileMap = new Map<string, Profile>((profiles ?? []).map((p) => [p.id, p]));

  const completeMutation = useMutation({
    mutationFn: (taskId: string) => updateTask(taskId, { status: 'done', completed_at: new Date().toISOString() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['followup-tasks'] });
      toast.success('Tâche terminée');
    },
  });

  const overdueTasks = (tasks ?? []).filter((t) => t.due_at && new Date(t.due_at) < new Date() && t.status === 'pending');
  const todayTasks = (tasks ?? []).filter((t) => {
    if (!t.due_at || t.status !== 'pending') return false;
    const due = new Date(t.due_at);
    const now = new Date();
    return due.toDateString() === now.toDateString();
  });
  const upcomingTasks = (tasks ?? []).filter((t) => {
    if (!t.due_at || t.status !== 'pending') return false;
    const due = new Date(t.due_at);
    return due > new Date() && due.toDateString() !== new Date().toDateString();
  });
  const noDateTasks = (tasks ?? []).filter((t) => !t.due_at && t.status === 'pending');

  return (
    <>
      <PageHeader
        title="Suivi"
        description="Relances et suivis en attente"
        action={
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px] rounded-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                <SelectItem value="pending">En attente</SelectItem>
                <SelectItem value="in_progress">En cours</SelectItem>
                <SelectItem value="done">Terminées</SelectItem>
              </SelectContent>
            </Select>
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="w-[160px] rounded-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                {(profiles ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.first_name} {p.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto scrollbar-thin p-6">
        {isLoading && (
          <div className="space-y-3 max-w-3xl">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <AlertTriangle className="mb-3 h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">Erreur de chargement des tâches</p>
            <Button variant="outline" className="mt-4 rounded-full" onClick={() => refetch()}>
              Réessayer
            </Button>
          </div>
        )}

        {!isLoading && !isError && (tasks ?? []).length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-muted/50">
              <ListChecks className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <h3 className="text-sm font-semibold text-foreground">Aucune tâche en attente</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Les relances et suivis apparaîtront ici.
            </p>
          </div>
        )}

        {!isLoading && !isError && (tasks ?? []).length > 0 && (
          <div className="max-w-3xl space-y-6">
            {overdueTasks.length > 0 && (
              <TaskSection
                title="En retard"
                icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
                tasks={overdueTasks}
                leadMap={leadMap}
                profileMap={profileMap}
                onComplete={(id) => completeMutation.mutate(id)}
                highlight="overdue"
              />
            )}
            {todayTasks.length > 0 && (
              <TaskSection
                title="Aujourd'hui"
                icon={<Clock className="h-4 w-4 text-primary" />}
                tasks={todayTasks}
                leadMap={leadMap}
                profileMap={profileMap}
                onComplete={(id) => completeMutation.mutate(id)}
              />
            )}
            {upcomingTasks.length > 0 && (
              <TaskSection
                title="À venir"
                icon={<Calendar className="h-4 w-4 text-muted-foreground" />}
                tasks={upcomingTasks}
                leadMap={leadMap}
                profileMap={profileMap}
                onComplete={(id) => completeMutation.mutate(id)}
              />
            )}
            {noDateTasks.length > 0 && (
              <TaskSection
                title="Sans échéance"
                icon={<ListChecks className="h-4 w-4 text-muted-foreground" />}
                tasks={noDateTasks}
                leadMap={leadMap}
                profileMap={profileMap}
                onComplete={(id) => completeMutation.mutate(id)}
              />
            )}
          </div>
        )}
      </div>
    </>
  );
}

function TaskSection({
  title, icon, tasks, leadMap, profileMap, onComplete, highlight,
}: {
  title: string;
  icon: React.ReactNode;
  tasks: Task[];
  leadMap: Map<string, Lead>;
  profileMap: Map<string, Profile>;
  onComplete: (id: string) => void;
  highlight?: 'overdue';
}) {
  return (
    <div>
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
          const isOverdue = highlight === 'overdue';

          return (
            <Card
              key={task.id}
              className={cn(
                'flex items-center gap-3 rounded-xl border p-3 transition hover:shadow-sm',
                isOverdue && 'border-red-200 bg-red-50/30'
              )}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50">
                <TaskTypeIcon type={task.type} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
                  <Badge variant="outline" className={cn('rounded-full text-[10px] shrink-0', priority.className)}>
                    {priority.label}
                  </Badge>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  {lead && (
                    <span className="truncate">
                      {lead.first_name} {lead.last_name}
                      {lead.status && <span className="ml-1">· {statusLabels[lead.status] ?? lead.status}</span>}
                    </span>
                  )}
                  {task.due_at && (
                    <span className={cn('flex items-center gap-1', isOverdue && 'text-red-500')}>
                      <Clock className="h-3 w-3" />
                      {new Date(task.due_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                  {assignee && (
                    <span>· {assignee.first_name} {assignee.last_name}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full h-8 w-8 p-0"
                  onClick={(e) => { e.stopPropagation(); onComplete(task.id); }}
                >
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function TaskTypeIcon({ type }: { type: string }) {
  switch (type) {
    case 'call': return <Phone className="h-4 w-4 text-muted-foreground" />;
    case 'sms': return <MessageSquare className="h-4 w-4 text-muted-foreground" />;
    case 'email': return <Mail className="h-4 w-4 text-muted-foreground" />;
    case 'follow_up': return <ArrowRight className="h-4 w-4 text-muted-foreground" />;
    default: return <ListChecks className="h-4 w-4 text-muted-foreground" />;
  }
}
