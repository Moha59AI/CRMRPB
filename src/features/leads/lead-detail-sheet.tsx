// Fiche detaillee d'un lead, en panneau lateral.
//
// Vit dans son propre fichier pour pouvoir s'ouvrir depuis n'importe quel
// ecran. Ouverte depuis les relances, elle evite de quitter la file en
// cours de traitement.

import {
  useState, useMemo, useEffect,
} from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Phone, MessageSquare, Mail, FileText, PlusCircle, Calendar, Star,
  Car, MapPin, Shield, AlertTriangle,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { createCommunication, createNote, fetchCommunications, fetchNotes } from '@/services/activity-service';
import { createCase } from '@/services/cases-service';
import {
  updateLead,
} from '@/services/leads-service';
import { createTask, fetchTasks } from '@/services/planning-service';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type {
  Lead, Profile, Task, Communication, Note,
  LeadStatus,
} from '@/types';
import {
  sourceLabels, statusSelectOptions, profileName, scoreColor,
  formatDate, formatDateTime, leadName, vehicleLabel, LIBELLE_VITRAGE,
} from './lead-shared';
import { StatusBadge } from './status-badge';
import { LeadPipeline } from './lead-pipeline';
import { LeadQualification } from './lead-qualification';

// ============ DETAIL SHEET ============

export function LeadDetailSheet({
  lead, profiles, open, onOpenChange,
}: {
  lead: Lead | null;
  profiles: Profile[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('qualification');
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [noteContent, setNoteContent] = useState('');

  // Sync notes local state when lead changes
  const [notesValue, setNotesValue] = useState('');
  useEffect(() => {
    if (lead) setNotesValue(lead.advisor_notes ?? '');
  }, [lead?.id, lead?.advisor_notes]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Lead> }) => updateLead(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Related data queries (only enabled when sheet is open)
  const { data: tasks, isLoading: tasksLoading } = useQuery({
    queryKey: ['lead-tasks', lead?.id],
    queryFn: () => fetchTasks({ leadId: lead!.id }),
    enabled: !!lead && open,
  });

  const { data: communications, isLoading: commsLoading } = useQuery({
    queryKey: ['lead-communications', lead?.id],
    queryFn: () => fetchCommunications({ leadId: lead!.id }),
    enabled: !!lead && open,
  });

  const { data: notes, isLoading: notesLoading } = useQuery({
    queryKey: ['lead-notes', lead?.id],
    queryFn: () => fetchNotes({ leadId: lead!.id }),
    enabled: !!lead && open,
  });

  // Create mutations
  const createTaskMutation = useMutation({
    mutationFn: (task: Partial<Task>) => createTask(task),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-tasks', lead?.id] });
      toast.success('Tâche créée');
      setShowTaskForm(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const createCommMutation = useMutation({
    mutationFn: (comm: Partial<Communication>) => createCommunication(comm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-communications', lead?.id] });
      toast.success('Communication enregistrée');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const createNoteMutation = useMutation({
    mutationFn: (note: Partial<Note>) => createNote(note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-notes', lead?.id] });
      toast.success('Note ajoutée');
      setNoteContent('');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const createCaseMutation = useMutation({
    mutationFn: () => createCase({
      case_number: `RPB-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
      lead_id: lead!.id,
      status: 'new',
    }),
    onSuccess: (data) => {
      if (data.error) {
        toast.error(data.error);
      } else {
        toast.success('Dossier créé');
        queryClient.invalidateQueries({ queryKey: ['leads'] });
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Build history timeline from tasks, communications, and notes
  const historyItems = useMemo(() => {
    const items: { date: string; icon: React.ReactNode; label: string; detail?: string }[] = [];
    communications?.forEach((c) => {
      items.push({
        date: c.created_at,
        icon: c.type.startsWith('call') ? <Phone className="h-3.5 w-3.5" /> :
              c.type.startsWith('sms') ? <MessageSquare className="h-3.5 w-3.5" /> :
              c.type.startsWith('email') ? <Mail className="h-3.5 w-3.5" /> :
              <FileText className="h-3.5 w-3.5" />,
        label: c.type.replace(/_/g, ' '),
        detail: c.content ?? undefined,
      });
    });
    tasks?.forEach((t) => {
      items.push({
        date: t.created_at,
        icon: <PlusCircle className="h-3.5 w-3.5" />,
        label: `Tâche: ${t.title}`,
        detail: t.status === 'done' ? 'Terminée' : t.status === 'pending' ? 'En attente' : undefined,
      });
    });
    notes?.forEach((n) => {
      items.push({
        date: n.created_at,
        icon: <FileText className="h-3.5 w-3.5" />,
        label: 'Note',
        detail: n.content,
      });
    });
    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [communications, tasks, notes]);

  if (!lead) return null;

  // Handlers
  const handleFieldUpdate = (updates: Partial<Lead>) => {
    updateMutation.mutate({ id: lead.id, updates });
  };

  const handleQuickCall = () => {
    if (lead.phone) window.location.href = `tel:${lead.phone}`;
    createCommMutation.mutate({
      lead_id: lead.id,
      type: 'call_outbound',
      direction: 'outbound',
      status: 'answered',
      content: 'Appel sortant',
    });
  };

  const handleQuickSMS = () => {
    if (lead.phone) window.location.href = `sms:${lead.phone}`;
    createCommMutation.mutate({
      lead_id: lead.id,
      type: 'sms_outbound',
      direction: 'outbound',
      status: 'sent',
      content: 'SMS envoyé',
    });
  };

  const handleQuickEmail = () => {
    if (lead.email) window.location.href = `mailto:${lead.email}`;
    createCommMutation.mutate({
      lead_id: lead.id,
      type: 'email_outbound',
      direction: 'outbound',
      status: 'sent',
      content: 'Email envoyé',
    });
  };

  // Le SMS part pre-rempli : au telephone, on n'ecrit pas un message a la main.
  const handleDemanderDocuments = () => {
    if (!lead.phone) return;
    const prenom = lead.first_name?.trim() || '';
    const message = `Bonjour ${prenom}, pour avancer sur votre dossier pare-brise il nous manque votre carte grise et votre attestation d'assurance. Merci de nous les envoyer. Relais Pare-Brise`;
    window.location.href = `sms:${lead.phone}?body=${encodeURIComponent(message)}`;
    createCommMutation.mutate({
      lead_id: lead.id, type: 'sms_outbound', direction: 'outbound',
      status: 'sent', content: message,
    });
    handleFieldUpdate({ status: 'documents_requested' });
  };

  const handleAddNote = () => {
    if (!noteContent.trim()) return;
    createNoteMutation.mutate({ lead_id: lead.id, content: noteContent.trim() });
  };

  const dateValue = lead.next_action_at ? lead.next_action_at.split('T')[0] : '';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[600px] sm:max-w-[600px] overflow-y-auto p-0">
        {/* Header */}
        <div className="border-b border-border px-6 pt-6 pb-4">
          <SheetHeader className="space-y-1">
            <div className="flex items-start justify-between gap-3">
              <SheetTitle className="text-xl">{leadName(lead)}</SheetTitle>
              <StatusBadge status={lead.status} />
            </div>
            <SheetDescription className="sr-only">
              Fiche du lead {leadName(lead)}
            </SheetDescription>
          </SheetHeader>

          {/* Ce qu'il faut savoir avant de decrocher : le vitrage, le vehicule,
              l'assureur. Sans ca il faut fouiller les onglets pendant l'appel. */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
            {lead.phone && (
              <a href={`tel:${lead.phone}`} className="font-medium text-primary tabular hover:underline">
                {lead.phone}
              </a>
            )}
            {lead.glass_type && (
              <span className="font-medium text-foreground">
                {LIBELLE_VITRAGE[lead.glass_type]}
              </span>
            )}
            {lead.has_adas_camera && lead.glass_type === 'pare_brise' && (
              <span className="flex items-center gap-1 rounded-full bg-due-soft px-2 py-0.5 text-xs font-medium text-due">
                <AlertTriangle className="h-3 w-3" />
                Calibrage
              </span>
            )}
            {(lead.vehicle_make || lead.vehicle_model) && (
              <span className="flex items-center gap-1">
                <Car className="h-3.5 w-3.5" />
                {vehicleLabel(lead)}
              </span>
            )}
            {lead.vehicle_registration && (
              <span className="font-medium text-foreground tabular">{lead.vehicle_registration}</span>
            )}
            {lead.city && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {lead.city}
              </span>
            )}
            {lead.insurance && (
              <span className="flex items-center gap-1">
                <Shield className="h-3.5 w-3.5" />
                {lead.insurance}
              </span>
            )}
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            Reçu le {formatDateTime(lead.received_at || lead.created_at)}
            {lead.campaign_name && ` · ${lead.campaign_name}`}
          </p>

          <div className="mt-4">
            <LeadPipeline
              statut={lead.status}
              onChangerStatut={(statut: LeadStatus) => handleFieldUpdate({ status: statut })}
              desactive={updateMutation.isPending}
            />
          </div>

          {/* Quick actions */}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="rounded-full" onClick={handleQuickCall} disabled={!lead.phone}>
              <Phone className="mr-1.5 h-3.5 w-3.5" />
              Appeler
            </Button>
            <Button size="sm" variant="outline" className="rounded-full" onClick={handleQuickSMS} disabled={!lead.phone}>
              <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
              SMS
            </Button>
            <Button size="sm" variant="outline" className="rounded-full" onClick={handleQuickEmail} disabled={!lead.email}>
              <Mail className="mr-1.5 h-3.5 w-3.5" />
              Email
            </Button>
            <Button size="sm" variant="outline" className="rounded-full" onClick={handleDemanderDocuments} disabled={!lead.phone}>
              <FileText className="mr-1.5 h-3.5 w-3.5" />
              Demander documents
            </Button>
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => createCaseMutation.mutate()} disabled={createCaseMutation.isPending}>
              <FileText className="mr-1.5 h-3.5 w-3.5" />
              Créer dossier
            </Button>
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => { setActiveTab('suivi'); setShowTaskForm(true); }}>
              <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
              Ajouter tâche
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6 py-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full justify-start">
              <TabsTrigger value="qualification">Qualification</TabsTrigger>
              <TabsTrigger value="infos">Infos</TabsTrigger>
              <TabsTrigger value="suivi">Suivi</TabsTrigger>
              <TabsTrigger value="communications">Communications</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
              <TabsTrigger value="historique">Historique</TabsTrigger>
            </TabsList>

            {/* ===== INFOS TAB ===== */}
            <TabsContent value="qualification" className="mt-4">
              <LeadQualification
                lead={lead}
                onUpdate={handleFieldUpdate}
                desactive={updateMutation.isPending}
              />
            </TabsContent>

            <TabsContent value="infos" className="space-y-5 mt-4">
              {/* Contact info */}
              <Section title="Contact">
                <div className="grid grid-cols-2 gap-3">
                  <DetailField label="Téléphone" value={lead.phone} />
                  <DetailField label="Email" value={lead.email} />
                  <DetailField label="Ville" value={lead.city} />
                </div>
              </Section>

              {/* Vehicle info */}
              <Section title="Véhicule">
                <div className="grid grid-cols-3 gap-3">
                  <DetailField label="Immatriculation" value={lead.vehicle_registration} />
                  <DetailField label="Marque" value={lead.vehicle_make} />
                  <DetailField label="Modèle" value={lead.vehicle_model} />
                </div>
              </Section>

              {/* Source info */}
              <Section title="Source & campagne">
                <div className="grid grid-cols-2 gap-3">
                  <DetailField label="Source" value={sourceLabels[lead.source] ?? lead.source} />
                  <DetailField label="Assurance" value={lead.insurance} />
                  <DetailField label="Offre" value={lead.offer} />
                  <DetailField label="Campagne" value={lead.campaign_name} />
                </div>
              </Section>

              {/* Editable fields */}
              <Section title="Gestion">
                <div className="grid grid-cols-2 gap-4">
                  {/* Status */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Statut</Label>
                    <Select
                      value={lead.status}
                      onValueChange={(v) => handleFieldUpdate({ status: v as LeadStatus })}
                    >
                      <SelectTrigger className="rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {statusSelectOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Advisor */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Conseiller</Label>
                    <Select
                      value={lead.assigned_user_id ?? 'unassigned'}
                      onValueChange={(v) => handleFieldUpdate({ assigned_user_id: v === 'unassigned' ? null : v })}
                    >
                      <SelectTrigger className="rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Non assigné</SelectItem>
                        {profiles.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{profileName(p)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Score */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Score</Label>
                    <div className="flex items-center gap-2">
                      <Star className={cn('h-4 w-4', scoreColor(lead.score))} />
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={lead.score}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          handleFieldUpdate({ score: isNaN(val) ? 0 : Math.max(0, Math.min(100, val)) });
                        }}
                        className="rounded-lg w-24"
                      />
                      <span className="text-xs text-muted-foreground">/ 100</span>
                    </div>
                  </div>

                  {/* Next action date */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Prochaine action</Label>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <Input
                        type="date"
                        value={dateValue}
                        onChange={(e) => {
                          const val = e.target.value;
                          handleFieldUpdate({ next_action_at: val ? new Date(val).toISOString() : null });
                        }}
                        className="rounded-lg"
                      />
                    </div>
                  </div>
                </div>

                {/* Advisor notes */}
                <div className="mt-4 space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Notes conseiller</Label>
                  <Textarea
                    value={notesValue}
                    onChange={(e) => setNotesValue(e.target.value)}
                    onBlur={() => {
                      if (notesValue !== (lead.advisor_notes ?? '')) {
                        handleFieldUpdate({ advisor_notes: notesValue });
                      }
                    }}
                    placeholder="Ajouter des notes internes..."
                    className="rounded-lg min-h-[80px] resize-y"
                  />
                </div>
              </Section>
            </TabsContent>

            {/* ===== SUIVI (TASKS) TAB ===== */}
            <TabsContent value="suivi" className="space-y-3 mt-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-foreground">Tâches</h4>
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => setShowTaskForm(!showTaskForm)}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Ajouter
                </Button>
              </div>

              {showTaskForm && (
                <TaskForm
                  onSubmit={(task) => createTaskMutation.mutate({ ...task, lead_id: lead.id })}
                  isLoading={createTaskMutation.isPending}
                  onCancel={() => setShowTaskForm(false)}
                />
              )}

              {tasksLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-lg" />
                  ))}
                </div>
              ) : tasks && tasks.length > 0 ? (
                <div className="space-y-2">
                  {tasks.map((task) => (
                    <div key={task.id} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-foreground">{task.title}</p>
                        <Badge
                          variant="outline"
                          className={cn(
                            'rounded-full text-[10px]',
                            task.status === 'done' && 'bg-emerald-50 text-emerald-700 border-emerald-200',
                            task.status === 'pending' && 'bg-amber-50 text-amber-700 border-amber-200',
                            task.status === 'in_progress' && 'bg-blue-50 text-blue-700 border-blue-200',
                            task.status === 'cancelled' && 'bg-red-50 text-red-700 border-red-200',
                          )}
                        >
                          {task.status === 'done' ? 'Terminée' : task.status === 'pending' ? 'En attente' : task.status === 'in_progress' ? 'En cours' : 'Annulée'}
                        </Badge>
                      </div>
                      {task.description && (
                        <p className="mt-1 text-xs text-muted-foreground">{task.description}</p>
                      )}
                      <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
                        <span className="capitalize">{task.type.replace(/_/g, ' ')}</span>
                        {task.due_at && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(task.due_at)}
                          </span>
                        )}
                        {task.priority === 'high' || task.priority === 'urgent' ? (
                          <span className="text-red-600 font-medium">{task.priority}</span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">Aucune tâche</p>
              )}
            </TabsContent>

            {/* ===== COMMUNICATIONS TAB ===== */}
            <TabsContent value="communications" className="space-y-3 mt-4">
              <h4 className="text-sm font-semibold text-foreground">Historique des communications</h4>
              {commsLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-lg" />
                  ))}
                </div>
              ) : communications && communications.length > 0 ? (
                <div className="space-y-2">
                  {communications.map((comm) => (
                    <div key={comm.id} className="rounded-lg border border-border p-3">
                      <div className="flex items-center gap-2">
                        {comm.type.startsWith('call') && <Phone className="h-3.5 w-3.5 text-muted-foreground" />}
                        {comm.type.startsWith('sms') && <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />}
                        {comm.type.startsWith('email') && <Mail className="h-3.5 w-3.5 text-muted-foreground" />}
                        <span className="text-sm font-medium text-foreground capitalize">
                          {comm.type.replace(/_/g, ' ')}
                        </span>
                        <Badge variant="secondary" className="rounded-full text-[10px] ml-auto">
                          {comm.direction === 'outbound' ? 'Sortant' : 'Entrant'}
                        </Badge>
                      </div>
                      {comm.content && (
                        <p className="mt-1 text-xs text-muted-foreground">{comm.content}</p>
                      )}
                      <p className="mt-1.5 text-[10px] text-muted-foreground">{formatDateTime(comm.created_at)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">Aucune communication</p>
              )}
            </TabsContent>

            {/* ===== NOTES TAB ===== */}
            <TabsContent value="notes" className="space-y-3 mt-4">
              <h4 className="text-sm font-semibold text-foreground">Notes</h4>

              {/* Add note */}
              <div className="space-y-2">
                <Textarea
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Écrire une note..."
                  className="rounded-lg min-h-[60px] resize-y"
                />
                <Button
                  size="sm"
                  className="rounded-full"
                  onClick={handleAddNote}
                  disabled={!noteContent.trim() || createNoteMutation.isPending}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Ajouter
                </Button>
              </div>

              {notesLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-lg" />
                  ))}
                </div>
              ) : notes && notes.length > 0 ? (
                <div className="space-y-2">
                  {notes.map((note) => (
                    <div key={note.id} className="rounded-lg border border-border bg-muted/30 p-3">
                      <p className="text-sm text-foreground whitespace-pre-wrap">{note.content}</p>
                      <p className="mt-1.5 text-[10px] text-muted-foreground">{formatDateTime(note.created_at)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-4 text-center text-sm text-muted-foreground">Aucune note</p>
              )}
            </TabsContent>

            {/* ===== HISTORIQUE TAB ===== */}
            <TabsContent value="historique" className="space-y-2 mt-4">
              <h4 className="text-sm font-semibold text-foreground">Historique</h4>
              {historyItems.length > 0 ? (
                <div className="space-y-2">
                  {historyItems.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-3 rounded-lg border border-border p-3">
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted/50 text-muted-foreground">
                        {item.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground capitalize">{item.label}</p>
                        {item.detail && (
                          <p className="mt-0.5 text-xs text-muted-foreground truncate">{item.detail}</p>
                        )}
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{formatDateTime(item.date)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">Aucun historique</p>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ============ TASK FORM (inline in Suivi tab) ============

function TaskForm({
  onSubmit, isLoading, onCancel,
}: {
  onSubmit: (task: Partial<Task>) => void;
  isLoading: boolean;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<Task['type']>('call');
  const [priority, setPriority] = useState<Task['priority']>('normal');
  const [dueAt, setDueAt] = useState('');

  return (
    <div className="rounded-lg border border-border p-3 space-y-3 bg-muted/20">
      <Input
        placeholder="Titre de la tâche"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="rounded-lg"
      />
      <div className="grid grid-cols-3 gap-2">
        <Select value={type} onValueChange={(v) => setType(v as Task['type'])}>
          <SelectTrigger className="rounded-lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="call">Appel</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="follow_up">Relance</SelectItem>
            <SelectItem value="document">Document</SelectItem>
            <SelectItem value="other">Autre</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={(v) => setPriority(v as Task['priority'])}>
          <SelectTrigger className="rounded-lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Basse</SelectItem>
            <SelectItem value="normal">Normale</SelectItem>
            <SelectItem value="high">Haute</SelectItem>
            <SelectItem value="urgent">Urgente</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          className="rounded-lg"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" className="rounded-full" onClick={onCancel}>Annuler</Button>
        <Button
          size="sm"
          className="rounded-full"
          disabled={!title.trim() || isLoading}
          onClick={() => onSubmit({
            title: title.trim(),
            type,
            priority,
            status: 'pending',
            due_at: dueAt ? new Date(dueAt).toISOString() : null,
          })}
        >
          Créer
        </Button>
      </div>
    </div>
  );
}

// ============ SHARED SMALL COMPONENTS ============

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value || '—'}</p>
    </div>
  );
}
