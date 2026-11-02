import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CalendarClock, Check, Clock3, FileText, Mail, MessageSquare,
  Phone, Plus, RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { createTask, updateTask } from '@/services/planning-service';
import type { Lead, Profile, Task, TaskPriority, TaskType } from '@/types';

const ACTIONS_RAPIDES: Array<{ label: string; title: string; type: TaskType; icon: typeof Phone }> = [
  { label: 'Rappel', title: 'Rappeler le client', type: 'call', icon: Phone },
  { label: 'Documents', title: 'Relancer les documents', type: 'document', icon: FileText },
  { label: 'SMS', title: 'Envoyer un SMS au client', type: 'sms', icon: MessageSquare },
];

const ICONE_TYPE: Record<TaskType, typeof Phone> = {
  call: Phone,
  sms: MessageSquare,
  email: Mail,
  follow_up: RotateCcw,
  document: FileText,
  other: CalendarClock,
};

function prochaineEcheance(): string {
  const date = new Date(Date.now() + 60 * 60 * 1_000);
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  const decalage = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - decalage).toISOString().slice(0, 16);
}

function libelleEcheance(value: string | null): string {
  if (!value) return 'Sans échéance';
  return new Date(value).toLocaleString('fr-FR', {
    weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export function LeadTasksPanel({
  lead, profiles, tasks,
}: {
  lead: Lead;
  profiles: Profile[];
  tasks: Task[];
}) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState('Rappeler le client');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<TaskType>('call');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [dueAt, setDueAt] = useState(prochaineEcheance);
  const [assignedUserId, setAssignedUserId] = useState(lead.assigned_user_id ?? 'unassigned');

  const activeTasks = useMemo(() => tasks
    .filter((task) => task.status === 'pending' || task.status === 'in_progress')
    .sort((a, b) => {
      if (!a.due_at) return 1;
      if (!b.due_at) return -1;
      return a.due_at.localeCompare(b.due_at);
    }), [tasks]);

  const rafraichir = () => {
    queryClient.invalidateQueries({ queryKey: ['lead-tasks', lead.id] });
    queryClient.invalidateQueries({ queryKey: ['followup-tasks'] });
    queryClient.invalidateQueries({ queryKey: ['accueil', 'taches'] });
    queryClient.invalidateQueries({ queryKey: ['relances'] });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error('Donnez un titre à la tâche.');
      const echeance = new Date(dueAt);
      if (!dueAt || Number.isNaN(echeance.getTime())) throw new Error('Choisissez une date et une heure.');
      const result = await createTask({
        lead_id: lead.id,
        contact_id: lead.contact_id,
        assigned_user_id: assignedUserId === 'unassigned' ? null : assignedUserId,
        title: title.trim(),
        description: description.trim() || null,
        type,
        priority,
        status: 'pending',
        due_at: echeance.toISOString(),
        completed_at: null,
        origin: 'manual',
      });
      if (result.error) throw new Error(result.error);
      return result.task;
    },
    onSuccess: () => {
      rafraichir();
      setDialogOpen(false);
      toast.success('Tâche programmée');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const completeMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const result = await updateTask(taskId, {
        status: 'done',
        completed_at: new Date().toISOString(),
      });
      if (result.error) throw new Error(result.error);
    },
    onSuccess: () => {
      rafraichir();
      toast.success('Tâche terminée');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const ouvrirFormulaire = (action?: typeof ACTIONS_RAPIDES[number]) => {
    setTitle(action?.title ?? 'Rappeler le client');
    setDescription('');
    setType(action?.type ?? 'call');
    setPriority('normal');
    setDueAt(prochaineEcheance());
    setAssignedUserId(lead.assigned_user_id ?? 'unassigned');
    setDialogOpen(true);
  };

  return (
    <>
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Tâches du lead</h3>
              {activeTasks.length > 0 && (
                <Badge variant="secondary" className="rounded-full text-[10px]">{activeTasks.length}</Badge>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">Programmez un rappel sans quitter la fiche.</p>
          </div>
          <Button type="button" size="sm" className="rounded-full" onClick={() => ouvrirFormulaire()}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Programmer une tâche
          </Button>
        </div>

        <div className="p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            {ACTIONS_RAPIDES.map((action) => {
              const Icon = action.icon;
              return (
                <Button
                  key={action.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-full text-xs"
                  onClick={() => ouvrirFormulaire(action)}
                >
                  <Icon className="mr-1.5 h-3.5 w-3.5" />
                  {action.label}
                </Button>
              );
            })}
          </div>

          {activeTasks.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-surface px-3 py-4 text-center">
              <p className="text-sm font-medium text-foreground">Aucune tâche en cours</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Le prochain rappel apparaîtra ici.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeTasks.slice(0, 4).map((task) => {
                const Icon = ICONE_TYPE[task.type] ?? CalendarClock;
                const overdue = Boolean(task.due_at && new Date(task.due_at).getTime() < Date.now());
                return (
                  <div
                    key={task.id}
                    className={cn(
                      'flex items-center gap-3 rounded-lg border border-border px-3 py-2.5',
                      overdue && 'border-urgent/25 bg-urgent-soft/25',
                    )}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
                      <p className={cn('mt-0.5 flex items-center gap-1 text-xs text-muted-foreground', overdue && 'text-urgent')}>
                        <Clock3 className="h-3 w-3" />
                        {libelleEcheance(task.due_at)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 rounded-full"
                      aria-label={`Terminer : ${task.title}`}
                      disabled={completeMutation.isPending}
                      onClick={() => completeMutation.mutate(task.id)}
                    >
                      <Check className="h-4 w-4 text-primary" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle>Programmer une tâche</DialogTitle>
            <DialogDescription>
              Cette tâche sera rattachée à {lead.first_name || lead.last_name
                ? [lead.first_name, lead.last_name].filter(Boolean).join(' ')
                : 'ce lead'} et visible dans le module Tâches.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); createMutation.mutate(); }}>
            <div className="space-y-1.5">
              <Label htmlFor="task-title">Action à faire</Label>
              <Input
                id="task-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ex. Rappeler le client"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="task-description">Détail (facultatif)</Label>
              <Textarea
                id="task-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Ce qu'il faut vérifier ou demander…"
                className="min-h-20"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={type} onValueChange={(value) => setType(value as TaskType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="call">Appel</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="document">Documents</SelectItem>
                    <SelectItem value="follow_up">Relance</SelectItem>
                    <SelectItem value="other">Autre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priorité</Label>
                <Select value={priority} onValueChange={(value) => setPriority(value as TaskPriority)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Basse</SelectItem>
                    <SelectItem value="normal">Normale</SelectItem>
                    <SelectItem value="high">Haute</SelectItem>
                    <SelectItem value="urgent">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="task-due-at">Date et heure</Label>
              <Input
                id="task-due-at"
                type="datetime-local"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label>Responsable</Label>
              <Select value={assignedUserId} onValueChange={setAssignedUserId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Non assigné</SelectItem>
                  {profiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {[profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Utilisateur'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={createMutation.isPending || !title.trim() || !dueAt}>
                <CalendarClock className="mr-1.5 h-4 w-4" />
                {createMutation.isPending ? 'Programmation…' : 'Programmer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
