import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  Search, Plus, Sparkles, Table as TableIcon, Columns3, List, Phone, AlertTriangle, Star,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { checkDuplicateLead, createLead, fetchLeadById, fetchLeads, seedDemoLeads, updateLead } from '@/services/leads-service';
import { fetchProfiles } from '@/services/profiles-service';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type {
  Lead, Profile,
  LeadStatus, LeadSource,
} from '@/types';

import {
  statusLabels, sourceLabels, statusStyles, kanbanColumnOrder, statusSelectOptions, sourceSelectOptions, profileName, scoreColor, formatDate, leadName, vehicleLabel,
} from './lead-shared';
import { StatusBadge } from './status-badge';
import { LeadDetailSheet } from './lead-detail-sheet';

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

  // Ouverture directe depuis une autre page (les relances notamment) via
  // /leads?lead=<id>. Sans cela le lien menait a la liste sans rien ouvrir.
  const [searchParams, setSearchParams] = useSearchParams();
  const leadParam = searchParams.get('lead');

  useEffect(() => {
    if (leadParam) setSelectedLeadId(leadParam);
  }, [leadParam]);

  const fermerFiche = useCallback(() => {
    setSelectedLeadId(null);
    if (leadParam) {
      const suite = new URLSearchParams(searchParams);
      suite.delete('lead');
      setSearchParams(suite, { replace: true });
    }
  }, [leadParam, searchParams, setSearchParams]);

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

  const leadDansListe = useMemo(
    () => leads?.find((l) => l.id === selectedLeadId) ?? null,
    [leads, selectedLeadId],
  );

  // Un lead ouvert depuis les relances n'appartient pas forcement au filtre
  // courant : on le charge alors individuellement plutot que d'afficher une
  // fiche vide.
  const { data: leadCharge } = useQuery({
    queryKey: ['lead', selectedLeadId],
    queryFn: () => fetchLeadById(selectedLeadId as string),
    enabled: !!selectedLeadId && !leadDansListe,
  });

  const selectedLead = leadDansListe ?? leadCharge ?? null;

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
        onOpenChange={(open) => { if (!open) fermerFiche(); }}
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


// ============ NEW LEAD DIALOG ============

function NewLeadDialog({
  open, onOpenChange,
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
