import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, Plus, Sparkles, Table as TableIcon, Columns3, List,
  Phone, MessageSquare, Mail, FileText, PlusCircle,
  AlertTriangle, ExternalLink, Calendar, Star,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  fetchLeads, updateLead, createLead, checkDuplicateLead,
  fetchProfiles, fetchTasks, fetchCommunications, fetchNotes,
  createCommunication, createTask, createNote, createCase,
  seedDemoLeads,
} from '@/services/crm-service';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type {
  Lead, Profile, Task, Communication, Note,
  LeadStatus, LeadSource,
} from '@/types';

// ============ CONSTANTS ============

const statusLabels: Record<string, string> = {
  new: 'Nouveau',
  to_call: 'À appeler',
  calling: 'Appel en cours',
  nrp: 'NRP',
  interested: 'Intéressé',
  documents_requested: 'Documents demandés',
  documents_received: 'Documents reçus',
  appointment_scheduled: 'RDV planifié',
  lost: 'Perdu',
  converted: 'Converti',
};

const sourceLabels: Record<string, string> = {
  meta: 'Meta',
  webhook: 'Webhook',
  manual: 'Manuel',
  import: 'Import',
};

const statusStyles: Record<string, string> = {
  new: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  to_call: 'bg-amber-50 text-amber-700 border-amber-200',
  calling: 'bg-sky-50 text-sky-700 border-sky-200',
  nrp: 'bg-red-50 text-red-700 border-red-200',
  interested: 'bg-amber-50 text-amber-700 border-amber-200',
  documents_requested: 'bg-slate-100 text-slate-600 border-slate-200',
  documents_received: 'bg-slate-100 text-slate-600 border-slate-200',
  appointment_scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  lost: 'bg-red-50 text-red-700 border-red-200',
  converted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const kanbanColumnOrder: LeadStatus[] = [
  'new', 'to_call', 'calling', 'nrp', 'interested',
  'documents_requested', 'documents_received', 'appointment_scheduled',
  'lost', 'converted',
];

const statusSelectOptions: { value: LeadStatus; label: string }[] = kanbanColumnOrder.map((s) => ({
  value: s,
  label: statusLabels[s],
}));

const sourceSelectOptions: { value: LeadSource; label: string }[] = [
  { value: 'meta', label: 'Meta' },
  { value: 'webhook', label: 'Webhook' },
  { value: 'manual', label: 'Manuel' },
  { value: 'import', label: 'Import' },
];

// ============ HELPERS ============

function profileName(p?: Profile | null): string {
  if (!p) return 'Non assigné';
  return [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Conseiller';
}

function scoreColor(score: number): string {
  if (score >= 70) return 'text-emerald-600';
  if (score >= 40) return 'text-amber-600';
  return 'text-slate-400';
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function leadName(lead: Lead): string {
  return [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Sans nom';
}

function vehicleLabel(lead: Lead): string {
  const parts = [lead.vehicle_make, lead.vehicle_model].filter(Boolean);
  return parts.join(' ') || '—';
}

// ============ STATUS BADGE ============

function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn('rounded-full text-[10px] font-medium', statusStyles[status] ?? 'bg-muted text-muted-foreground border-border', className)}
    >
      {statusLabels[status] ?? status}
    </Badge>
  );
}

// ============ MAIN PAGE ============

type ViewMode = 'table' | 'kanban' | 'compact';

export function LeadsPage() {
  const queryClient = useQueryClient();

  // Search with debounce
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Filters
  const [sourceFilter, setSourceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [advisorFilter, setAdvisorFilter] = useState('all');

  // View mode
  const [view, setView] = useState<ViewMode>('table');

  // Selected lead for detail sheet
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  // New lead dialog
  const [newLeadOpen, setNewLeadOpen] = useState(false);

  // Seeding state
  const [seeding, setSeeding] = useState(false);

  // Queries
  const { data: leads, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['leads', search, sourceFilter, statusFilter, advisorFilter],
    queryFn: () => fetchLeads({
      search,
      source: sourceFilter,
      status: statusFilter,
      assignedUserId: advisorFilter,
    }),
  });

  const { data: profiles } = useQuery({
    queryKey: ['profiles'],
    queryFn: fetchProfiles,
  });

  const advisorMap = useMemo(() => {
    const m = new Map<string, Profile>();
    profiles?.forEach((p) => m.set(p.id, p));
    return m;
  }, [profiles]);

  const selectedLead = useMemo(
    () => leads?.find((l) => l.id === selectedLeadId) ?? null,
    [leads, selectedLeadId],
  );

  // Mutations
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateLead(id, { status: status as LeadStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const seedMutation = useMutation({
    mutationFn: seedDemoLeads,
    onMutate: () => setSeeding(true),
    onSettled: () => setSeeding(false),
    onSuccess: (data) => {
      if (data.error) {
        toast.error(data.error);
      } else {
        toast.success(`${data.count} lead(s) de démonstration ajouté(s)`);
        queryClient.invalidateQueries({ queryKey: ['leads'] });
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleStatusChange = useCallback((leadId: string, newStatus: string) => {
    updateStatusMutation.mutate({ id: leadId, status: newStatus });
    toast.success(`Statut changé: ${statusLabels[newStatus] ?? newStatus}`);
  }, [updateStatusMutation]);

  const hasFilters = !!search || sourceFilter !== 'all' || statusFilter !== 'all' || advisorFilter !== 'all';

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setSourceFilter('all');
    setStatusFilter('all');
    setAdvisorFilter('all');
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <PageHeader
        title="Leads"
        description="Prospects reçus depuis Meta et autres sources"
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="rounded-full"
              disabled={seeding}
              onClick={() => seedMutation.mutate()}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Données de démo
            </Button>
            <Button
              className="rounded-full"
              onClick={() => setNewLeadOpen(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Nouveau lead
            </Button>
          </div>
        }
      />

      {/* Toolbar: view toggle + filters */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-3">
        {/* View toggle */}
        <div className="inline-flex items-center rounded-lg bg-muted p-1">
          <ViewToggleButton active={view === 'table'} onClick={() => setView('table')} icon={TableIcon} label="Tableau" />
          <ViewToggleButton active={view === 'kanban'} onClick={() => setView('kanban')} icon={Columns3} label="Pipeline" />
          <ViewToggleButton active={view === 'compact'} onClick={() => setView('compact')} icon={List} label="Liste compacte" />
        </div>

        <div className="h-6 w-px bg-border" />

        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Nom, téléphone, email, ville..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="rounded-lg pl-9"
          />
        </div>

        {/* Source filter */}
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[130px] rounded-lg">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes sources</SelectItem>
            {sourceSelectOptions.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status filter */}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px] rounded-lg">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            {statusSelectOptions.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Advisor filter */}
        <Select value={advisorFilter} onValueChange={setAdvisorFilter}>
          <SelectTrigger className="w-[160px] rounded-lg">
            <SelectValue placeholder="Conseiller" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous conseillers</SelectItem>
            {profiles?.map((p) => (
              <SelectItem key={p.id} value={p.id}>{profileName(p)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" className="rounded-lg" onClick={clearFilters}>
            Effacer
          </Button>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {isLoading && <LoadingState view={view} />}

        {isError && (
          <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />
        )}

        {!isLoading && !isError && leads && leads.length === 0 && (
          <EmptyState hasFilters={hasFilters} onClear={clearFilters} />
        )}

        {!isLoading && !isError && leads && leads.length > 0 && (
          <>
            {view === 'table' && (
              <LeadsTable
                leads={leads}
                advisorMap={advisorMap}
                onRowClick={(lead) => setSelectedLeadId(lead.id)}
                onStatusChange={handleStatusChange}
              />
            )}
            {view === 'kanban' && (
              <KanbanBoard
                leads={leads}
                onStatusChange={handleStatusChange}
                onCardClick={(lead) => setSelectedLeadId(lead.id)}
              />
            )}
            {view === 'compact' && (
              <CompactList
                leads={leads}
                onRowClick={(lead) => setSelectedLeadId(lead.id)}
              />
            )}
          </>
        )}
      </div>

      {/* Detail Sheet */}
      <LeadDetailSheet
        lead={selectedLead}
        profiles={profiles ?? []}
        open={!!selectedLeadId}
        onOpenChange={(open) => { if (!open) setSelectedLeadId(null); }}
      />

      {/* New Lead Dialog */}
      <NewLeadDialog
        open={newLeadOpen}
        onOpenChange={setNewLeadOpen}
        profiles={profiles ?? []}
      />
    </div>
  );
}

// ============ VIEW TOGGLE BUTTON ============

function ViewToggleButton({
  active, onClick, icon: Icon, label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all',
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

// ============ TABLE VIEW ============

function LeadsTable({
  leads, advisorMap, onRowClick, onStatusChange,
}: {
  leads: Lead[];
  advisorMap: Map<string, Profile>;
  onRowClick: (lead: Lead) => void;
  onStatusChange: (leadId: string, status: string) => void;
}) {
  return (
    <div className="h-full overflow-y-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-xs">Date</TableHead>
            <TableHead className="text-xs">Nom</TableHead>
        <TableHead className="text-xs">Téléphone</TableHead>
        <TableHead className="text-xs">Ville</TableHead>
        <TableHead className="text-xs">Véhicule</TableHead>
        <TableHead className="text-xs">Source</TableHead>
        <TableHead className="text-xs">Statut</TableHead>
        <TableHead className="text-xs">Conseiller</TableHead>
        <TableHead className="text-xs text-right">Score</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {leads.map((lead) => {
        const advisor = lead.assigned_user_id ? advisorMap.get(lead.assigned_user_id) : null;
        return (
          <TableRow
            key={lead.id}
            className="cursor-pointer hover:bg-muted/40"
            onClick={() => onRowClick(lead)}
          >
            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
              {formatDate(lead.received_at || lead.created_at)}
            </TableCell>
            <TableCell className="text-sm font-medium text-foreground whitespace-nowrap">
              {leadName(lead)}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
              {lead.phone || '—'}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {lead.city || '—'}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
              {vehicleLabel(lead)}
            </TableCell>
            <TableCell>
              <Badge variant="secondary" className="rounded-full text-[10px]">
                {sourceLabels[lead.source] ?? lead.source}
              </Badge>
            </TableCell>
            <TableCell onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="inline-flex items-center gap-1 outline-none">
                    <StatusBadge status={lead.status} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuLabel className="text-xs">Changer le statut</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {statusSelectOptions.map((opt) => (
                    <DropdownMenuItem
                      key={opt.value}
                      onClick={() => onStatusChange(lead.id, opt.value)}
                      className={cn(lead.status === opt.value && 'font-semibold')}
                    >
                      <span className={cn('mr-2 h-2 w-2 rounded-full', statusStyles[opt.value]?.split(' ').find(c => c.startsWith('bg-')) ?? 'bg-muted')} />
                      {opt.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
              {advisor ? profileName(advisor) : <span className="text-muted-foreground/60">Non assigné</span>}
            </TableCell>
            <TableCell className="text-right">
              <span className={cn('inline-flex items-center gap-1 text-sm font-semibold', scoreColor(lead.score))}>
                <Star className="h-3.5 w-3.5" />
                {lead.score}
              </span>
            </TableCell>
          </TableRow>
        );
      })}
    </TableBody>
  </Table>
</div>
  );
}

// ============ KANBAN VIEW ============

function KanbanBoard({
  leads, onStatusChange, onCardClick,
}: {
  leads: Lead[];
  onStatusChange: (leadId: string, status: string) => void;
  onCardClick: (lead: Lead) => void;
}) {
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const leadsByStatus = useMemo(() => {
    const m = new Map<string, Lead[]>();
    kanbanColumnOrder.forEach((s) => m.set(s, []));
    leads.forEach((l) => {
      const arr = m.get(l.status);
      if (arr) arr.push(l);
    });
    return m;
  }, [leads]);

  return (
    <div className="h-full overflow-x-auto overflow-y-hidden">
      <div className="flex h-full gap-3 p-4">
        {kanbanColumnOrder.map((status) => {
          const colLeads = leadsByStatus.get(status) ?? [];
          return (
            <div
              key={status}
              className="flex w-72 shrink-0 flex-col"
              onDragOver={(e) => { e.preventDefault(); setDragOverColumn(status); }}
              onDragLeave={(e) => {
                if (e.currentTarget === e.target) setDragOverColumn(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const leadId = e.dataTransfer.getData('text/plain');
                setDragOverColumn(null);
                setDraggingId(null);
                if (leadId) onStatusChange(leadId, status);
              }}
            >
              {/* Column header */}
              <div
                className={cn(
                  'mb-2 flex items-center justify-between rounded-lg px-3 py-2 transition-colors',
                  dragOverColumn === status
                    ? 'bg-primary/10 ring-1 ring-primary/30'
                    : 'bg-muted/50',
                )}
              >
                <span className="text-xs font-semibold text-muted-foreground">
                  {statusLabels[status]}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {colLeads.length}
                </span>
              </div>

              {/* Column body */}
              <div className="flex-1 overflow-y-auto space-y-2 px-0.5 pb-2">
                {colLeads.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border/60 p-4 text-center">
                    <p className="text-xs text-muted-foreground/50">Aucun lead</p>
                  </div>
                )}
                {colLeads.map((lead) => (
                  <KanbanCard
                    key={lead.id}
                    lead={lead}
                    isDragging={draggingId === lead.id}
                    onDragStart={() => setDraggingId(lead.id)}
                    onDragEnd={() => { setDraggingId(null); setDragOverColumn(null); }}
                    onClick={() => onCardClick(lead)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KanbanCard({
  lead, isDragging, onDragStart, onDragEnd, onClick,
}: {
  lead: Lead;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onClick: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', lead.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={cn(
        'cursor-grab rounded-lg border border-border bg-white p-3 shadow-sm transition-all hover:shadow-md active:cursor-grabbing',
        isDragging && 'opacity-40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-foreground leading-tight">
          {leadName(lead)}
        </p>
        {lead.score > 0 && (
          <span className={cn('inline-flex items-center gap-0.5 text-[10px] font-semibold shrink-0', scoreColor(lead.score))}>
            <Star className="h-3 w-3" />
            {lead.score}
          </span>
        )}
      </div>
      {lead.phone && (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Phone className="h-3 w-3" />
          {lead.phone}
        </p>
      )}
      {lead.city && (
        <p className="text-xs text-muted-foreground">{lead.city}</p>
      )}
      {(lead.vehicle_make || lead.vehicle_model) && (
        <p className="mt-1 text-xs text-muted-foreground/70">{vehicleLabel(lead)}</p>
      )}
    </div>
  );
}

// ============ COMPACT LIST VIEW ============

function CompactList({
  leads, onRowClick,
}: {
  leads: Lead[];
  onRowClick: (lead: Lead) => void;
}) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="divide-y divide-border">
        {leads.map((lead) => (
          <button
            key={lead.id}
            onClick={() => onRowClick(lead)}
            className="flex w-full items-center gap-3 px-6 py-2 text-left hover:bg-muted/40 transition-colors"
          >
            <span className="w-2 h-2 rounded-full shrink-0 bg-muted-foreground/30" />
            <span className="text-sm font-medium text-foreground min-w-[140px] truncate">
              {leadName(lead)}
            </span>
            <span className="text-xs text-muted-foreground min-w-[120px] truncate">
              {lead.phone || '—'}
            </span>
            <span className="text-xs text-muted-foreground flex-1 truncate">
              {lead.city || '—'}
            </span>
            <Badge variant="secondary" className="rounded-full text-[10px] shrink-0">
              {sourceLabels[lead.source] ?? lead.source}
            </Badge>
            <StatusBadge status={lead.status} className="shrink-0" />
            <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold shrink-0 w-12 justify-end', scoreColor(lead.score))}>
              {lead.score > 0 && <Star className="h-3 w-3" />}
              {lead.score || ''}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ============ DETAIL SHEET ============

function LeadDetailSheet({
  lead, profiles, open, onOpenChange,
}: {
  lead: Lead | null;
  profiles: Profile[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('infos');
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

  const handleAddNote = () => {
    if (!noteContent.trim()) return;
    createNoteMutation.mutate({ lead_id: lead.id, content: noteContent.trim() });
  };

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

  const dateValue = lead.next_action_at ? lead.next_action_at.split('T')[0] : '';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[600px] sm:max-w-[600px] overflow-y-auto p-0">
        {/* Header */}
        <div className="border-b border-border px-6 pt-6 pb-4">
          <SheetHeader className="space-y-1">
            <SheetTitle className="text-xl">{leadName(lead)}</SheetTitle>
            <SheetDescription>
              Reçu le {formatDateTime(lead.received_at || lead.created_at)}
              {lead.campaign_name && ` · ${lead.campaign_name}`}
            </SheetDescription>
          </SheetHeader>

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
              <TabsTrigger value="infos">Infos</TabsTrigger>
              <TabsTrigger value="suivi">Suivi</TabsTrigger>
              <TabsTrigger value="communications">Communications</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
              <TabsTrigger value="historique">Historique</TabsTrigger>
            </TabsList>

            {/* ===== INFOS TAB ===== */}
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

// ============ NEW LEAD DIALOG ============

function NewLeadDialog({
  open, onOpenChange, profiles,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profiles: Profile[];
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    email: '',
    city: '',
    vehicle_registration: '',
    vehicle_make: '',
    vehicle_model: '',
    source: 'manual' as LeadSource,
    insurance: '',
    offer: '',
  });

  // Duplicate check
  const { data: duplicates } = useQuery({
    queryKey: ['lead-dup-check', form.phone, form.email, form.vehicle_registration],
    queryFn: () => checkDuplicateLead({
      phone: form.phone || undefined,
      email: form.email || undefined,
      vehicle_registration: form.vehicle_registration || undefined,
    }),
    enabled: open && !!(form.phone || form.email || form.vehicle_registration),
  });

  const createMutation = useMutation({
    mutationFn: () => createLead(form),
    onSuccess: (data) => {
      if (data.error) {
        toast.error(data.error);
      } else {
        toast.success('Lead créé');
        queryClient.invalidateQueries({ queryKey: ['leads'] });
        onOpenChange(false);
        resetForm();
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const resetForm = () => {
    setForm({
      first_name: '', last_name: '', phone: '', email: '', city: '',
      vehicle_registration: '', vehicle_make: '', vehicle_model: '',
      source: 'manual', insurance: '', offer: '',
    });
  };

  const dupFields = new Set(duplicates?.map((d) => d.field) ?? []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-xl">
        <DialogHeader>
          <DialogTitle>Nouveau lead</DialogTitle>
          <DialogDescription>Créer un lead manuellement</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto">
          {/* Name */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Prénom</Label>
              <Input
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                className="rounded-lg"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Nom</Label>
              <Input
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                className="rounded-lg"
              />
            </div>
          </div>

          {/* Contact */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Téléphone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className={cn('rounded-lg', dupFields.has('phone') && 'border-amber-400')}
              />
              {dupFields.has('phone') && (
                <p className="text-[10px] text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Doublon possible
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Email</Label>
              <Input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={cn('rounded-lg', dupFields.has('email') && 'border-amber-400')}
              />
              {dupFields.has('email') && (
                <p className="text-[10px] text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Doublon possible
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Ville</Label>
              <Input
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className="rounded-lg"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Source</Label>
              <Select
                value={form.source}
                onValueChange={(v) => setForm({ ...form, source: v as LeadSource })}
              >
                <SelectTrigger className="rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sourceSelectOptions.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Vehicle */}
          <div className="rounded-lg border border-border p-3 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Véhicule</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Immat.</Label>
                <Input
                  value={form.vehicle_registration}
                  onChange={(e) => setForm({ ...form, vehicle_registration: e.target.value })}
                  className={cn('rounded-lg', dupFields.has('vehicle_registration') && 'border-amber-400')}
                />
                {dupFields.has('vehicle_registration') && (
                  <p className="text-[10px] text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Doublon
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Marque</Label>
                <Input
                  value={form.vehicle_make}
                  onChange={(e) => setForm({ ...form, vehicle_make: e.target.value })}
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Modèle</Label>
                <Input
                  value={form.vehicle_model}
                  onChange={(e) => setForm({ ...form, vehicle_model: e.target.value })}
                  className="rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* Insurance & offer */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Assurance</Label>
              <Input
                value={form.insurance}
                onChange={(e) => setForm({ ...form, insurance: e.target.value })}
                className="rounded-lg"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Offre</Label>
              <Input
                value={form.offer}
                onChange={(e) => setForm({ ...form, offer: e.target.value })}
                className="rounded-lg"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            className="rounded-full"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || (!form.first_name && !form.last_name && !form.phone)}
          >
            {createMutation.isPending ? 'Création...' : 'Créer le lead'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
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

// ============ LOADING / ERROR / EMPTY STATES ============

function LoadingState({ view }: { view: ViewMode }) {
  if (view === 'kanban') {
    return (
      <div className="h-full overflow-x-auto p-4">
        <div className="flex gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="w-72 shrink-0 space-y-2">
              <Skeleton className="h-9 w-full rounded-lg" />
              {Array.from({ length: 3 }).map((_, j) => (
                <Skeleton key={j} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (view === 'compact') {
    return (
      <div className="p-0">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full rounded-none" />
        ))}
      </div>
    );
  }
  return (
    <div className="p-6 space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-red-50">
        <AlertTriangle className="h-6 w-6 text-red-600" />
      </div>
      <p className="text-sm text-muted-foreground">{message || 'Erreur de chargement'}</p>
      <Button variant="outline" className="mt-4 rounded-full" onClick={onRetry}>
        Réessayer
      </Button>
    </div>
  );
}

function EmptyState({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-muted/50">
        <Search className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <h3 className="text-sm font-semibold text-foreground">
        {hasFilters ? 'Aucun résultat' : 'Aucun lead pour le moment'}
      </h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {hasFilters
          ? 'Essayez de modifier vos filtres de recherche.'
          : 'Les leads reçus depuis Meta Lead Ads et les webhooks apparaîtront ici.'}
      </p>
      {hasFilters && (
        <Button variant="outline" className="mt-4 rounded-full" onClick={onClear}>
          Effacer les filtres
        </Button>
      )}
    </div>
  );
}
