import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Trash2, Copy, MoreHorizontal, Pencil, ArrowRight,
  TrendingUp, Edit, ArrowRightLeft, PhoneOff, CalendarPlus, Clock,
  CalendarX, FilePlus, FileWarning, CheckCircle2, Receipt, DollarSign,
  Gift, AlertCircle, Wrench, Webhook, Hand, Repeat,
  MessageSquare, Mail, CheckSquare, Phone, UserPlus, StickyNote,
  Bell, Tag, GitBranch, Globe, Code, Workflow as WorkflowIcon,
  Loader2, ChevronLeft, Save, Play, Sparkles, Search, ShieldCheck,
  Filter, MapPin, Shield, Users, Calendar,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  ReactFlow, Background, Controls, MiniMap, useNodesState, useEdgesState, addEdge,
  Handle, Position, type Node, type Edge, type Connection, type NodeProps,
  type OnConnect,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  createWorkflow,
  deleteWorkflow,
  fetchWorkflows,
  installWorkflowAlerts,
  runWorkflowAlertsNow,
  updateWorkflow,
} from '@/services/automation-service';
import { useAuth } from '@/features/auth/auth-context';
import type { Workflow } from '@/types';

// ---------------------------------------------------------------------------
// Catalog definitions
// ---------------------------------------------------------------------------

interface CatalogItem {
  type: string;
  label: string;
  icon: typeof TrendingUp;
  description?: string;
}

const TRIGGER_ITEMS: CatalogItem[] = [
  { type: 'new_lead', label: 'Nouveau lead reçu', icon: TrendingUp },
  { type: 'lead_modified', label: 'Lead modifié', icon: Edit },
  { type: 'status_changed', label: "Changement d'étape", icon: ArrowRightLeft },
  { type: 'nrp', label: 'Prospect non joignable', icon: PhoneOff },
  { type: 'appointment_created', label: 'Rendez-vous créé', icon: CalendarPlus },
  { type: 'appointment_24h', label: 'Rendez-vous dans 24h', icon: Clock },
  { type: 'appointment_cancelled', label: 'Rendez-vous annulé', icon: CalendarX },
  { type: 'document_added', label: 'Document ajouté', icon: FilePlus },
  { type: 'document_missing', label: 'Document manquant', icon: FileWarning },
  { type: 'intervention_done', label: 'Intervention terminée', icon: CheckCircle2 },
  { type: 'invoice_sent', label: 'Facture envoyée', icon: Receipt },
  { type: 'payment_received', label: 'Règlement reçu', icon: DollarSign },
  { type: 'gift_to_give', label: 'Cadeau à remettre', icon: Gift },
  { type: 'no_activity', label: 'Dossier sans activité', icon: AlertCircle },
  { type: 'sav_created', label: 'SAV créé', icon: Wrench },
  { type: 'webhook_received', label: 'Webhook reçu', icon: Webhook },
  { type: 'manual_trigger', label: 'Déclenchement manuel', icon: Hand },
  { type: 'schedule', label: 'Planification récurrente', icon: Repeat },
];

const CONDITION_ITEMS: CatalogItem[] = [
  { type: 'source', label: 'Source du lead', icon: Filter },
  { type: 'city', label: 'Ville', icon: MapPin },
  { type: 'insurance', label: 'Assurance', icon: Shield },
  { type: 'offer', label: 'Offre choisie', icon: Tag },
  { type: 'status', label: 'Statut', icon: ArrowRightLeft },
  { type: 'advisor', label: 'Conseiller', icon: Users },
  { type: 'franchise', label: 'Montant de franchise', icon: DollarSign },
  { type: 'gift_amount', label: 'Montant du cadeau', icon: Gift },
  { type: 'documents', label: 'Documents reçus ou manquants', icon: FileWarning },
  { type: 'elapsed_time', label: "Temps écoulé depuis la création", icon: Clock },
  { type: 'appointment_date', label: 'Date du rendez-vous', icon: Calendar },
  { type: 'last_call_result', label: 'Résultat du dernier appel', icon: Phone },
];

const ACTION_ITEMS: CatalogItem[] = [
  { type: 'send_sms', label: 'Envoyer un SMS', icon: MessageSquare },
  { type: 'send_email', label: 'Envoyer un e-mail', icon: Mail },
  { type: 'create_task', label: 'Créer une tâche', icon: CheckSquare },
  { type: 'schedule_call', label: 'Planifier un appel', icon: Phone },
  { type: 'change_status', label: 'Changer le statut', icon: ArrowRightLeft },
  { type: 'assign_advisor', label: 'Affecter un conseiller', icon: UserPlus },
  { type: 'add_note', label: 'Ajouter une note', icon: StickyNote },
  { type: 'send_notification', label: 'Envoyer une notification', icon: Bell },
  { type: 'add_tag', label: 'Ajouter/retirer une étiquette', icon: Tag },
  { type: 'create_appointment', label: 'Créer un rendez-vous', icon: CalendarPlus },
  { type: 'wait', label: 'Attendre une durée', icon: Clock },
  { type: 'condition', label: 'Exécuter une condition', icon: GitBranch },
  { type: 'call_api', label: 'Appeler une API externe', icon: Globe },
  { type: 'trigger_webhook', label: 'Déclencher un webhook', icon: Webhook },
  { type: 'run_javascript', label: 'Exécuter du JavaScript', icon: Code },
];

const TRIGGER_ICONS: Record<string, typeof TrendingUp> = Object.fromEntries(
  TRIGGER_ITEMS.map((t) => [t.type, t.icon]),
);
const TRIGGER_LABELS: Record<string, string> = Object.fromEntries(
  TRIGGER_ITEMS.map((t) => [t.type, t.label]),
);
const ACTION_LABELS: Record<string, string> = Object.fromEntries(
  ACTION_ITEMS.map((a) => [a.type, a.label]),
);
const ACTION_ICONS: Record<string, typeof TrendingUp> = Object.fromEntries(
  ACTION_ITEMS.map((a) => [a.type, a.icon]),
);

type NodeKind = 'trigger' | 'condition' | 'action';
interface NodeData extends Record<string, unknown> {
  kind: NodeKind;
  itemType: string;
  label: string;
  config: Record<string, unknown>;
}

function iconForNode(kind: NodeKind, itemType: string): typeof TrendingUp {
  if (kind === 'trigger') return TRIGGER_ICONS[itemType] ?? WorkflowIcon;
  if (kind === 'action') return ACTION_ICONS[itemType] ?? WorkflowIcon;
  return GitBranch;
}

// ---------------------------------------------------------------------------
// Relative time helper
// ---------------------------------------------------------------------------

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'à venir';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "à l'instant";
  const min = Math.floor(sec / 60);
  if (min < 60) return `il y a ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `il y a ${hr} h`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `il y a ${day} j`;
  const month = Math.floor(day / 30);
  if (month < 12) return `il y a ${month} mois`;
  return `il y a ${Math.floor(month / 12)} an(s)`;
}

// ---------------------------------------------------------------------------
// Custom node component for React Flow
// ---------------------------------------------------------------------------

const KIND_STYLES: Record<NodeKind, { ring: string; iconBg: string; handle: string }> = {
  trigger: { ring: 'ring-emerald-200', iconBg: 'bg-done-soft text-done', handle: '!bg-done' },
  condition: { ring: 'ring-amber-200', iconBg: 'bg-due-soft text-due', handle: '!bg-due' },
  action: { ring: 'ring-blue-200', iconBg: 'bg-upcoming-soft text-upcoming', handle: '!bg-upcoming' },
};

function FlowNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as NodeData;
  const Icon = iconForNode(nodeData.kind, nodeData.itemType);
  const styles = KIND_STYLES[nodeData.kind];
  return (
    <div
      className={`min-w-[200px] max-w-[240px] rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm transition-shadow ${
        selected ? 'ring-2 ring-offset-1 ' + styles.ring : ''
      }`}
    >
      {nodeData.kind !== 'trigger' && (
        <Handle
          type="target"
          position={Position.Top}
          className={`!h-3 !w-3 !border-2 !border-white ${styles.handle}`}
        />
      )}
      <div className="flex items-center gap-2">
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${styles.iconBg}`}>
          <Icon className="h-4 w-4" strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {nodeData.kind === 'trigger' ? 'Déclencheur' : nodeData.kind === 'condition' ? 'Condition' : 'Action'}
          </p>
          <p className="truncate text-sm font-semibold text-foreground">{nodeData.label}</p>
        </div>
      </div>
      {nodeData.kind !== 'action' && (
        <Handle
          type="source"
          position={Position.Bottom}
          className={`!h-3 !w-3 !border-2 !border-white ${styles.handle}`}
        />
      )}
    </div>
  );
}

const nodeTypes = { workflowNode: FlowNode };

function isManagedAlertWorkflow(workflow: Workflow): boolean {
  return workflow.flow_data?.managed_alert === true
    && typeof workflow.flow_data?.system_key === 'string';
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export function WorkflowsPage() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [builderWorkflow, setBuilderWorkflow] = useState<Workflow | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Workflow | null>(null);

  const { data: workflows, isLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: fetchWorkflows,
  });

  const canManage = profile?.role === 'admin' || profile?.role === 'manager';
  const canDelete = profile?.role === 'admin';
  const managedAlertWorkflows = (workflows ?? []).filter(isManagedAlertWorkflow);

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateWorkflow(id, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workflows'] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteWorkflow(id),
    onSuccess: () => {
      toast.success('Scénario supprimé');
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const installAlertsMutation = useMutation({
    mutationFn: installWorkflowAlerts,
    onSuccess: (created) => {
      toast.success(created > 0 ? `${created} alertes installées` : 'Les alertes sont déjà installées');
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const runAlertsMutation = useMutation({
    mutationFn: runWorkflowAlertsNow,
    onSuccess: (result) => {
      toast.success('Contrôle terminé', {
        description: result.notifications_created > 0
          ? `${result.notifications_created} nouvelle${result.notifications_created > 1 ? 's' : ''} notification${result.notifications_created > 1 ? 's' : ''}.`
          : 'Aucune nouvelle alerte : les dossiers déjà signalés aujourd’hui ne sont pas répétés.',
      });
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function handleDuplicate(wf: Workflow) {
    // Creating a new workflow with the same flow data triggers a list refresh.
    try {
      await createWorkflow({
        name: `${wf.name} (copie)`,
        description: wf.description,
        trigger_type: wf.trigger_type,
        trigger_config: wf.trigger_config,
        conditions: wf.conditions,
        actions: wf.actions,
        flow_data: wf.flow_data,
        enabled: false,
      });
      toast.success('Scénario dupliqué');
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de dupliquer ce scénario.');
    }
  }

  function openNewBuilder() {
    setBuilderWorkflow(null);
    setShowBuilder(true);
  }

  function openEditBuilder(wf: Workflow) {
    setBuilderWorkflow(wf);
    setShowBuilder(true);
  }

  function closeBuilder() {
    setShowBuilder(false);
    setBuilderWorkflow(null);
  }

  if (showBuilder) {
    return (
      <WorkflowBuilder
        workflow={builderWorkflow}
        onClose={closeBuilder}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['workflows'] });
          closeBuilder();
        }}
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Scénarios"
        description="Automatisations"
        action={
          canManage ? <Button className="rounded-full" onClick={openNewBuilder}>
            <Plus className="mr-2 h-4 w-4" />
            Nouveau scénario
          </Button> : undefined
        }
      />

      <div className="flex-1 overflow-y-auto p-3 scrollbar-thin sm:p-6">
        {!isLoading && (
          <WorkflowAlertOverview
            workflows={managedAlertWorkflows}
            canManage={canManage}
            isInstalling={installAlertsMutation.isPending}
            isRunning={runAlertsMutation.isPending}
            onInstall={() => installAlertsMutation.mutate()}
            onRun={() => runAlertsMutation.mutate()}
          />
        )}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : workflows && workflows.length > 0 ? (
          <WorkflowsList
            workflows={workflows}
            onToggle={(id, enabled) => toggleMutation.mutate({ id, enabled })}
            onEdit={openEditBuilder}
            onDuplicate={handleDuplicate}
            onDelete={(wf) => setDeleteTarget(wf)}
            canManage={canManage}
            canDelete={canDelete}
          />
        ) : (
          <EmptyState onCreate={openNewBuilder} canManage={canManage} />
        )}
      </div>

      <DeleteDialog
        workflow={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={(id) => {
          deleteMutation.mutate(id);
          setDeleteTarget(null);
        }}
      />
    </>
  );
}

function WorkflowAlertOverview({
  workflows,
  canManage,
  isInstalling,
  isRunning,
  onInstall,
  onRun,
}: {
  workflows: Workflow[];
  canManage: boolean;
  isInstalling: boolean;
  isRunning: boolean;
  onInstall: () => void;
  onRun: () => void;
}) {
  const activeCount = workflows.filter((workflow) => workflow.enabled).length;
  const latestRun = workflows
    .map((workflow) => workflow.last_run_at)
    .filter((date): date is string => Boolean(date))
    .sort()
    .at(-1) ?? null;

  return (
    <div className="mb-6 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-done-soft text-done">
            <ShieldCheck className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">Alertes opérationnelles</h2>
              {workflows.length > 0 && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {activeCount}/{workflows.length} actives
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {workflows.length > 0
                ? `Contrôle automatique toutes les 15 minutes${latestRun ? ` · dernier passage ${relativeTime(latestRun)}` : ''}.`
                : 'Six contrôles prêts à l’emploi pour les leads, relances, documents, rendez-vous et finances.'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Une même anomalie n’est notifiée qu’une fois par jour. Aucun statut ni champ client n’est modifié.
            </p>
          </div>
        </div>

        {canManage && (
          workflows.length === 0 ? (
            <Button className="rounded-full" onClick={onInstall} disabled={isInstalling}>
              {isInstalling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
              Installer les alertes
            </Button>
          ) : (
            <Button variant="outline" className="rounded-full" onClick={onRun} disabled={isRunning || activeCount === 0}>
              {isRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Contrôler maintenant
            </Button>
          )
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// List view
// ---------------------------------------------------------------------------

function WorkflowsList({
  workflows,
  onToggle,
  onEdit,
  onDuplicate,
  onDelete,
  canManage,
  canDelete,
}: {
  workflows: Workflow[];
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: (wf: Workflow) => void;
  onDuplicate: (wf: Workflow) => void;
  onDelete: (wf: Workflow) => void;
  canManage: boolean;
  canDelete: boolean;
}) {
  const [sourceFilter, setSourceFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');

  const filtered = useMemo(() => {
    return workflows.filter((wf) => {
      if (sourceFilter !== 'all' && wf.trigger_type !== sourceFilter) return false;
      if (stateFilter === 'enabled' && !wf.enabled) return false;
      if (stateFilter === 'disabled' && wf.enabled) return false;
      return true;
    });
  }, [workflows, sourceFilter, stateFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Source</Label>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="h-9 w-[200px] rounded-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les sources</SelectItem>
              {TRIGGER_ITEMS.map((t) => (
                <SelectItem key={t.type} value={t.type}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">État</Label>
          <Select value={stateFilter} onValueChange={setStateFilter}>
            <SelectTrigger className="h-9 w-[160px] rounded-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les états</SelectItem>
              <SelectItem value="enabled">Actif</SelectItem>
              <SelectItem value="disabled">Inactif</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} scénario{filtered.length > 1 ? 's' : ''}
        </span>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">Scénario</TableHead>
              <TableHead>Déclencheur</TableHead>
              <TableHead className="w-[24px]"></TableHead>
              <TableHead>Actions</TableHead>
              <TableHead className="text-right">Réussites</TableHead>
              <TableHead className="text-right">Échecs</TableHead>
              <TableHead>Dernière exécution</TableHead>
              <TableHead className="text-center">État</TableHead>
              <TableHead className="w-[40px] pr-4"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((wf) => (
              <WorkflowRow
                key={wf.id}
                wf={wf}
                onToggle={onToggle}
                onEdit={onEdit}
                onDuplicate={onDuplicate}
                onDelete={onDelete}
                canManage={canManage}
                canDelete={canDelete}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function WorkflowRow({
  wf, onToggle, onEdit, onDuplicate, onDelete, canManage, canDelete,
}: {
  wf: Workflow;
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: (wf: Workflow) => void;
  onDuplicate: (wf: Workflow) => void;
  onDelete: (wf: Workflow) => void;
  canManage: boolean;
  canDelete: boolean;
}) {
  const managedAlert = isManagedAlertWorkflow(wf);
  const TriggerIcon = TRIGGER_ICONS[wf.trigger_type] ?? WorkflowIcon;
  const actions = Array.isArray(wf.actions) ? (wf.actions as { type?: string; label?: string }[]) : [];
  const actionLabels = actions
    .map((a) => a.label || ACTION_LABELS[a.type ?? ''] || a.type || 'action')
    .join(', ');

  return (
    <TableRow className="group">
      <TableCell className="pl-4">
        <button
          onClick={() => { if (!managedAlert && canManage) onEdit(wf); }}
          className="text-left"
          disabled={managedAlert || !canManage}
        >
          <p className="text-sm font-medium text-foreground group-hover:text-foreground/80">{wf.name}</p>
          {managedAlert && (
            <span className="mt-1 inline-flex rounded-full bg-done-soft px-2 py-0.5 text-[10px] font-medium text-done">
              Alerte automatique
            </span>
          )}
          {wf.description && (
            <p className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground">{wf.description}</p>
          )}
        </button>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-done-soft text-done">
            <TriggerIcon className="h-4 w-4" strokeWidth={1.8} />
          </div>
          <span className="text-sm text-foreground">
            {TRIGGER_LABELS[wf.trigger_type] ?? wf.trigger_type}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground">{actions.length} action{actions.length > 1 ? 's' : ''}</span>
          {actionLabels && (
            <span className="max-w-[220px] truncate text-xs text-muted-foreground">{actionLabels}</span>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right">
        <span className="text-sm font-medium text-done">{wf.success_count ?? 0}</span>
      </TableCell>
      <TableCell className="text-right">
        <span className="text-sm font-medium text-destructive">{wf.failure_count ?? 0}</span>
      </TableCell>
      <TableCell>
        <span className="text-xs text-muted-foreground">{relativeTime(wf.last_run_at)}</span>
      </TableCell>
      <TableCell className="text-center">
        <Switch
          checked={wf.enabled}
          onCheckedChange={(checked) => onToggle(wf.id, checked)}
          disabled={!canManage}
        />
      </TableCell>
      <TableCell className="pr-4">
        {canManage && !managedAlert && <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" aria-label="Actions du scénario">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={() => onEdit(wf)}>
              <Pencil className="mr-2 h-4 w-4" />
              Modifier
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDuplicate(wf)}>
              <Copy className="mr-2 h-4 w-4" />
              Dupliquer
            </DropdownMenuItem>
            {canDelete && (
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(wf)}>
                <Trash2 className="mr-2 h-4 w-4" />
                Supprimer
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>}
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ onCreate, canManage }: { onCreate: () => void; canManage: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-muted/50">
        <WorkflowIcon className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <h3 className="text-sm font-semibold text-foreground">Aucun scénario configuré</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Créez votre premier scénario d'automatisation pour gagner du temps sur les tâches répétitives.
      </p>
      {canManage && (
        <Button className="mt-4 rounded-full" onClick={onCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nouveau scénario
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delete dialog
// ---------------------------------------------------------------------------

function DeleteDialog({
  workflow, onClose, onConfirm,
}: {
  workflow: Workflow | null;
  onClose: () => void;
  onConfirm: (id: string) => void;
}) {
  return (
    <Dialog open={!!workflow} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:rounded-xl">
        <DialogHeader>
          <DialogTitle>Supprimer le scénario</DialogTitle>
          <DialogDescription>
            Êtes-vous sûr de vouloir supprimer « {workflow?.name} » ? Cette action est irréversible.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            className="rounded-full"
            onClick={() => workflow && onConfirm(workflow.id)}
          >
            Supprimer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Builder view (React Flow)
// ---------------------------------------------------------------------------

interface BuilderState {
  name: string;
  description: string;
  nodes: Node<NodeData>[];
  edges: Edge[];
}

function defaultTriggerNode(): Node<NodeData> {
  return {
    id: 'trigger-1',
    type: 'workflowNode',
    position: { x: 320, y: 40 },
    data: { kind: 'trigger', itemType: 'new_lead', label: 'Nouveau lead reçu', config: {} },
  };
}

function WorkflowBuilder({
  workflow, onClose, onSaved,
}: {
  workflow: Workflow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(workflow?.name ?? 'Nouveau scénario');
  const [description, setDescription] = useState(workflow?.description ?? '');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const idCounter = useRef(100);

  // Initialise nodes/edges from existing flow_data or a default trigger.
  const initial: BuilderState = useMemo(() => {
    if (workflow?.flow_data && Array.isArray((workflow.flow_data as { nodes?: unknown }).nodes)) {
      const fd = workflow.flow_data as { nodes: Node<NodeData>[]; edges: Edge[] };
      return {
        name: workflow.name,
        description: workflow.description ?? '',
        nodes: fd.nodes ?? [defaultTriggerNode()],
        edges: fd.edges ?? [],
      };
    }
    return { name: '', description: '', nodes: [defaultTriggerNode()], edges: [] };
  }, [workflow]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);

  const onConnect: OnConnect = useCallback(
    (connection: Connection) =>
      setEdges((eds) => addEdge({ ...connection, animated: true }, eds)),
    [setEdges],
  );

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  function nextId(prefix: string): string {
    idCounter.current += 1;
    return `${prefix}-${idCounter.current}`;
  }

  function addNode(kind: NodeKind, item: CatalogItem) {
    const id = nextId(kind);
    const lastNode = nodes[nodes.length - 1];
    const y = lastNode ? lastNode.position.y + 130 : 60;
    const newNode: Node<NodeData> = {
      id,
      type: 'workflowNode',
      position: { x: 320 + (Math.random() * 80 - 40), y },
      data: { kind, itemType: item.type, label: item.label, config: {} },
    };
    setNodes((nds) => [...nds, newNode]);
    setSelectedNodeId(id);
  }

  function updateSelectedNodeData(patch: Partial<NodeData>) {
    if (!selectedNodeId) return;
    setNodes((nds) =>
      nds.map((n) =>
        n.id === selectedNodeId ? { ...n, data: { ...(n.data as unknown as NodeData), ...patch } } : n,
      ),
    );
  }

  function deleteSelectedNode() {
    if (!selectedNodeId) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setSelectedNodeId(null);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const triggerNode = nodes.find((n) => (n.data as unknown as NodeData).kind === 'trigger');
      const triggerType = triggerNode ? (triggerNode.data as unknown as NodeData).itemType : 'manual_trigger';
      const actionNodes = nodes
        .filter((n) => (n.data as unknown as NodeData).kind === 'action')
        .map((n) => ({ type: (n.data as unknown as NodeData).itemType, label: (n.data as unknown as NodeData).label }));
      const conditionNodes = nodes
        .filter((n) => (n.data as unknown as NodeData).kind === 'condition')
        .map((n) => ({ type: (n.data as unknown as NodeData).itemType, label: (n.data as unknown as NodeData).label }));

      const payload: Partial<Workflow> = {
        name,
        description: description || null,
        trigger_type: triggerType,
        trigger_config: {},
        conditions: conditionNodes,
        actions: actionNodes,
        flow_data: { nodes, edges },
      };

      if (workflow) {
        return updateWorkflow(workflow.id, payload);
      }
      return createWorkflow({ ...payload, enabled: false });
    },
    onSuccess: () => {
      toast.success(workflow ? 'Scénario mis à jour' : 'Scénario créé');
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function handleTest() {
    toast.success('Test exécuté', {
      description: `Le scénario « ${name} » a été simulé avec ${nodes.length} nœud(s).`,
    });
  }

  // Keyboard delete
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
        e.preventDefault();
        deleteSelectedNode();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId, nodes, edges]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
        <Button variant="ghost" size="icon" className="rounded-lg" onClick={onClose} aria-label="Fermer le scénario">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex flex-1 items-center gap-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-9 max-w-xs rounded-lg border-none bg-transparent px-2 text-base font-semibold shadow-none focus-visible:ring-0"
            placeholder="Nom du scénario"
          />
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="h-9 max-w-xs rounded-lg border-none bg-transparent px-2 text-sm text-muted-foreground shadow-none focus-visible:ring-0"
            placeholder="Description (optionnelle)"
          />
        </div>
        <Button variant="outline" className="rounded-full" onClick={handleTest}>
          <Play className="mr-2 h-4 w-4" />
          Tester
        </Button>
        <Button
          className="rounded-full"
          disabled={saveMutation.isPending || !name.trim()}
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Enregistrer
        </Button>
      </div>

      {/* Body: 3 panels */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel - catalog */}
        <div className="flex w-72 shrink-0 flex-col border-r border-border bg-card">
          <div className="border-b border-border p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher..."
                className="h-9 rounded-lg pl-8 text-sm"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin p-3">
            <CatalogSection
              title="Déclencheurs"
              items={TRIGGER_ITEMS}
              search={search}
              onAdd={(item) => addNode('trigger', item)}
              accent="emerald"
            />
            <CatalogSection
              title="Conditions"
              items={CONDITION_ITEMS}
              search={search}
              onAdd={(item) => addNode('condition', item)}
              accent="amber"
            />
            <CatalogSection
              title="Actions"
              items={ACTION_ITEMS}
              search={search}
              onAdd={(item) => addNode('action', item)}
              accent="blue"
            />
          </div>
        </div>

        {/* Center - canvas */}
        <div className="relative flex-1 bg-muted/30">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            defaultEdgeOptions={{ animated: true, style: { stroke: '#cbd5e1', strokeWidth: 2 } }}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#e2e8f0" gap={20} />
            <Controls className="!rounded-lg !border !border-border !bg-card !shadow-sm" />
            <MiniMap
              className="!rounded-lg !border !border-border !bg-card"
              maskColor="rgba(0,0,0,0.05)"
              nodeColor={(n) => {
                const kind = (n.data as unknown as NodeData)?.kind;
                if (kind === 'trigger') return '#10b981';
                if (kind === 'condition') return '#f59e0b';
                return '#3b82f6';
              }}
            />
          </ReactFlow>
          {nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <Sparkles className="mx-auto h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
                <p className="mt-2 text-sm text-muted-foreground">
                  Ajoutez un nœud depuis le panneau de gauche
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right panel - properties */}
        <div className="flex w-80 shrink-0 flex-col border-l border-border bg-card">
          {selectedNode ? (
            <NodeProperties
              node={selectedNode}
              data={selectedNode.data as unknown as NodeData}
              onUpdate={updateSelectedNodeData}
              onDelete={deleteSelectedNode}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-muted/50">
                <Pencil className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
              </div>
              <p className="text-sm font-medium text-foreground">Aucun nœud sélectionné</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Cliquez sur un nœud du canvas pour modifier ses propriétés.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Catalog section (left panel)
// ---------------------------------------------------------------------------

const ACCENT_CLASSES: Record<string, { icon: string; hover: string }> = {
  emerald: { icon: 'bg-done-soft text-done', hover: 'hover:border-done/25 hover:bg-done-soft/50' },
  amber: { icon: 'bg-due-soft text-due', hover: 'hover:border-due/25 hover:bg-due-soft/50' },
  blue: { icon: 'bg-upcoming-soft text-upcoming', hover: 'hover:border-upcoming/25 hover:bg-upcoming-soft/50' },
};

function CatalogSection({
  title, items, search, onAdd, accent,
}: {
  title: string;
  items: CatalogItem[];
  search: string;
  onAdd: (item: CatalogItem) => void;
  accent: 'emerald' | 'amber' | 'blue';
}) {
  const q = search.trim().toLowerCase();
  const filtered = q ? items.filter((i) => i.label.toLowerCase().includes(q)) : items;
  const styles = ACCENT_CLASSES[accent];

  if (filtered.length === 0) return null;

  return (
    <div className="mb-4">
      <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="space-y-1">
        {filtered.map((item) => {
          const Icon = item.icon ?? WorkflowIcon;
          return (
            <button
              key={item.type}
              onClick={() => onAdd(item)}
              className={`flex w-full items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 text-left transition-colors ${styles.hover}`}
            >
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${styles.icon}`}>
                <Icon className="h-4 w-4" strokeWidth={1.8} />
              </div>
              <span className="flex-1 text-sm text-foreground">{item.label}</span>
              <Plus className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Node properties (right panel)
// ---------------------------------------------------------------------------

function NodeProperties({
  node, data, onUpdate, onDelete,
}: {
  node: Node<NodeData>;
  data: NodeData;
  onUpdate: (patch: Partial<NodeData>) => void;
  onDelete: () => void;
}) {
  const Icon = iconForNode(data.kind, data.itemType);
  const styles = KIND_STYLES[data.kind];
  const [configText, setConfigText] = useState(() => {
    try { return JSON.stringify(data.config ?? {}, null, 2); } catch { return '{}'; }
  });

  // Sync local config text when node selection changes.
  useEffect(() => {
    try { setConfigText(JSON.stringify(data.config ?? {}, null, 2)); } catch { setConfigText('{}'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  function commitConfig() {
    try {
      const parsed = JSON.parse(configText || '{}');
      onUpdate({ config: parsed });
    } catch {
      toast.error('JSON invalide dans la configuration');
    }
  }

  const kindLabel = data.kind === 'trigger' ? 'Déclencheur' : data.kind === 'condition' ? 'Condition' : 'Action';

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-border p-4">
        <div className="flex items-center gap-2.5">
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${styles.iconBg}`}>
            <Icon className="h-4 w-4" strokeWidth={1.8} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{kindLabel}</p>
            <p className="truncate text-sm font-semibold text-foreground">{data.label}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto scrollbar-thin p-4">
        <div className="space-y-2">
          <Label className="text-xs">Libellé</Label>
          <Input
            value={data.label}
            onChange={(e) => onUpdate({ label: e.target.value })}
            className="rounded-lg text-sm"
          />
        </div>

        {data.kind === 'trigger' && (
          <div className="space-y-2">
            <Label className="text-xs">Type de déclencheur</Label>
            <Select value={data.itemType} onValueChange={(v) => {
              const item = TRIGGER_ITEMS.find((t) => t.type === v);
              if (item) onUpdate({ itemType: v, label: item.label });
            }}>
              <SelectTrigger className="rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIGGER_ITEMS.map((t) => (
                  <SelectItem key={t.type} value={t.type}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {data.kind === 'action' && (
          <div className="space-y-2">
            <Label className="text-xs">Type d'action</Label>
            <Select value={data.itemType} onValueChange={(v) => {
              const item = ACTION_ITEMS.find((a) => a.type === v);
              if (item) onUpdate({ itemType: v, label: item.label });
            }}>
              <SelectTrigger className="rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTION_ITEMS.map((a) => (
                  <SelectItem key={a.type} value={a.type}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {data.kind === 'condition' && (
          <div className="space-y-2">
            <Label className="text-xs">Type de condition</Label>
            <Select value={data.itemType} onValueChange={(v) => {
              const item = CONDITION_ITEMS.find((c) => c.type === v);
              if (item) onUpdate({ itemType: v, label: item.label });
            }}>
              <SelectTrigger className="rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONDITION_ITEMS.map((c) => (
                  <SelectItem key={c.type} value={c.type}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-xs">Configuration (JSON)</Label>
          <Textarea
            value={configText}
            onChange={(e) => setConfigText(e.target.value)}
            onBlur={commitConfig}
            className="min-h-[120px] rounded-lg font-mono text-xs"
            placeholder="{}"
          />
          <p className="text-[10px] text-muted-foreground">
            Paramètres spécifiques au nœud (modèle SMS, durée d'attente, etc.).
          </p>
        </div>
      </div>

      <div className="border-t border-border p-4">
        <Button
          variant="outline"
          className="w-full rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Supprimer ce nœud
        </Button>
      </div>
    </div>
  );
}
