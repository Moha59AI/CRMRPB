import { useState, useMemo, useEffect, useCallback } from 'react';
import { fondDepuis } from '@/features/dossier/dossier-constants';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Search, Plus, Sparkles, Table as TableIcon, Columns3, List, Phone, AlertTriangle, Star,
  Archive, ArchiveRestore, Trash2,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/features/auth/auth-context';
import { peutSupprimer } from '@/config/permissions';
import { DialogueArchivage } from './dialogue-archivage';
import { DialogueSuppressionArchives } from './dialogue-suppression-archives';
import { ConfirmerSuppression } from '@/components/ConfirmerSuppression';
import { useEstMobile } from '@/hooks/use-media-query';
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
import {
  checkDuplicateLead, createLead, fetchLeads, seedDemoLeads, updateLead, supprimerLead,
} from '@/services/leads-service';
import { fetchProfiles } from '@/services/profiles-service';
import { LeadAddressFields } from './lead-address-fields';
import { messageErreurBase } from '@/lib/erreurs';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { OUTILS_DEMO_ACTIFS } from '@/config/features';
import type {
  Lead, Profile,
  LeadStatus, LeadSource,
} from '@/types';

import {
  statusLabels, sourceLabels, statusStyles, kanbanColumnOrder, statusSelectOptions, sourceSelectOptions, profileName, scoreColor, formatDate, leadName, vehicleLabel,
} from './lead-shared';
import { StatusBadge } from './status-badge';

// ============ MAIN PAGE ============

type ViewMode = 'table' | 'kanban' | 'compact';

export function LeadsPage() {
  const queryClient = useQueryClient();
  const { profile: profileCourant } = useAuth();
  // Sur telephone, le tableau et le pipeline sont illisibles : la liste en
  // cartes remplace la vue choisie, quelle qu'elle soit.
  const estMobile = useEstMobile();

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

  const navigate = useNavigate();
  const location = useLocation();

  // Une intervention s'ouvre en surface superposee : la liste reste montee
  // derriere, avec ses filtres et son defilement.
  const ouvrirIntervention = (leadId: string) => {
    navigate(`/interventions/${leadId}`, { state: { background: fondDepuis(location) } });
  };

  // New lead dialog
  const [newLeadOpen, setNewLeadOpen] = useState(false);

  // Seeding state
  const [seeding, setSeeding] = useState(false);

  // Les archives se consultent, elles ne se melangent pas a la file de
  // travail : c'est tout l'interet de les avoir sorties.
  const [voirArchives, setVoirArchives] = useState(false);
  const [archivageOuvert, setArchivageOuvert] = useState(false);
  const [suppressionOuverte, setSuppressionOuverte] = useState(false);
  const [aSupprimer, setASupprimer] = useState<Lead | null>(null);

  const suppressionUnitaire = useMutation({
    mutationFn: (id: string) => supprimerLead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['relances'] });
      setASupprimer(null);
      toast.success('Lead supprimé');
    },
    onError: (e: Error) => {
      setASupprimer(null);
      toast.error(messageErreurBase(e.message));
    },
  });

  // Queries
  const { data: leads, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['leads', search, sourceFilter, statusFilter, advisorFilter, voirArchives],
    queryFn: () => fetchLeads({
      search,
      source: sourceFilter,
      status: statusFilter,
      assignedUserId: advisorFilter,
      archives: voirArchives,
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

  // Mutations
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await updateLead(id, { status: status as LeadStatus });
      if (error) throw new Error(error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (err: Error) => toast.error(messageErreurBase(err.message)),
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
            {/* Outil de developpement : jamais visible en production, et la
                fonction SQL est en plus reservee aux administrateurs. */}
            {OUTILS_DEMO_ACTIFS && (
              <Button
                variant="outline"
                className="rounded-full"
                disabled={seeding}
                onClick={() => seedMutation.mutate()}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Données de démo
              </Button>
            )}
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
        <div className="hidden items-center rounded-lg bg-muted p-1 md:inline-flex">
          <ViewToggleButton active={view === 'table'} onClick={() => setView('table')} icon={TableIcon} label="Tableau" />
          <ViewToggleButton active={view === 'kanban'} onClick={() => setView('kanban')} icon={Columns3} label="Pipeline" />
          <ViewToggleButton active={view === 'compact'} onClick={() => setView('compact')} icon={List} label="Liste compacte" />
        </div>

        <div className="h-6 w-px bg-border" />

        {/* Archives : consulter, et ranger. */}
        <div className="flex items-center gap-1.5">
          <Button
            variant={voirArchives ? 'default' : 'outline'}
            size="sm"
            className="rounded-full"
            onClick={() => setVoirArchives((v) => !v)}
          >
            {voirArchives
              ? <ArchiveRestore className="mr-1.5 h-3.5 w-3.5" />
              : <Archive className="mr-1.5 h-3.5 w-3.5" />}
            {voirArchives ? 'Voir les actifs' : 'Archives'}
          </Button>

          {!voirArchives ? (
            <Button
              variant="outline" size="sm" className="rounded-full"
              onClick={() => setArchivageOuvert(true)}
            >
              Archiver les anciens
            </Button>
          ) : peutSupprimer(profileCourant?.role ?? null) && (
            <Button
              variant="outline" size="sm"
              className="rounded-full text-destructive hover:text-destructive"
              onClick={() => setSuppressionOuverte(true)}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Vider les archives
            </Button>
          )}
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
            {estMobile && (
              <ListeMobile
                leads={leads}
                onOuvrir={(lead) => ouvrirIntervention(lead.id)}
                onSupprimer={
                  peutSupprimer(profileCourant?.role ?? null) ? setASupprimer : undefined
                }
              />
            )}
            {!estMobile && view === 'table' && (
              <LeadsTable
                leads={leads}
                advisorMap={advisorMap}
                onRowClick={(lead) => ouvrirIntervention(lead.id)}
                onStatusChange={handleStatusChange}
                onSupprimer={
                  peutSupprimer(profileCourant?.role ?? null) ? setASupprimer : undefined
                }
              />
            )}
            {!estMobile && view === 'kanban' && (
              <KanbanBoard
                leads={leads}
                onStatusChange={handleStatusChange}
                onCardClick={(lead) => ouvrirIntervention(lead.id)}
              />
            )}
            {!estMobile && view === 'compact' && (
              <CompactList
                leads={leads}
                onRowClick={(lead) => ouvrirIntervention(lead.id)}
              />
            )}
          </>
        )}
      </div>

      <DialogueArchivage ouvert={archivageOuvert} onOuvertChange={setArchivageOuvert} />
      <DialogueSuppressionArchives
        ouvert={suppressionOuverte} onOuvertChange={setSuppressionOuverte}
      />

      <ConfirmerSuppression
        ouvert={aSupprimer !== null}
        onOuvertChange={(o) => !o && setASupprimer(null)}
        nom={
          aSupprimer
            ? [aSupprimer.first_name, aSupprimer.last_name].filter(Boolean).join(' ')
              || aSupprimer.phone || 'Sans nom'
            : ''
        }
        consequence="Les notes et tâches de ce lead sont détruites avec lui. Les appels, SMS et rendez-vous sont conservés mais perdent leur lien."
        alternative={
          <>
            L'archiver le retire des listes et des relances sans rien détruire,
            et reste réversible.
          </>
        }
        enCours={suppressionUnitaire.isPending}
        onConfirmer={() => aSupprimer && suppressionUnitaire.mutate(aSupprimer.id)}
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

/**
 * Liste en cartes, pour telephone.
 *
 * Le tableau porte huit colonnes : a 375 px, chacune ferait quarante pixels.
 * La carte reprend ce qu'on lit pour decider d'appeler -- qui, quel numero, ou,
 * quel statut, depuis quand -- et rien d'autre.
 *
 * Le numero est un lien `tel:` distinct de la carte : sur un telephone, ouvrir
 * la fiche et lancer l'appel sont deux gestes differents, et le second doit
 * rester a un doigt.
 */
function ListeMobile({
  leads, onOuvrir, onSupprimer,
}: {
  leads: Lead[];
  onOuvrir: (lead: Lead) => void;
  onSupprimer?: (lead: Lead) => void;
}) {
  return (
    <div className="h-full overflow-y-auto">
      <ul className="divide-y divide-border">
        {leads.map((lead) => (
          <li key={lead.id} className="flex items-stretch">
            <button
              type="button"
              onClick={() => onOuvrir(lead)}
              className="min-w-0 flex-1 px-4 py-3 text-left active:bg-muted/50"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-medium text-foreground">
                  {leadName(lead)}
                </span>
                <StatusBadge status={lead.status} className="shrink-0" />
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {lead.city && <span className="truncate">{lead.city}</span>}
                {vehicleLabel(lead) && <span className="truncate">{vehicleLabel(lead)}</span>}
                <span className="tabular">{formatDate(lead.arrive_le)}</span>
              </div>
            </button>

            {lead.phone && (
              <a
                href={`tel:${lead.phone}`}
                aria-label={`Appeler ${leadName(lead)}`}
                className="flex w-14 shrink-0 items-center justify-center border-l border-border text-primary active:bg-muted/50"
              >
                <Phone className="h-4 w-4" />
              </a>
            )}

            {onSupprimer && (
              <button
                type="button"
                aria-label={`Supprimer ${leadName(lead)}`}
                onClick={() => onSupprimer(lead)}
                className="flex w-11 shrink-0 items-center justify-center border-l border-border text-muted-foreground active:bg-muted/50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function LeadsTable({
  leads, advisorMap, onRowClick, onStatusChange, onSupprimer,
}: {
  leads: Lead[];
  advisorMap: Map<string, Profile>;
  onRowClick: (lead: Lead) => void;
  onStatusChange: (leadId: string, status: string) => void;
  /** Absent quand le role ne permet pas de supprimer. */
  onSupprimer?: (lead: Lead) => void;
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
        <TableHead className="text-xs">Cadeau</TableHead>
        <TableHead className="text-xs">Source</TableHead>
        <TableHead className="text-xs">Statut</TableHead>
        <TableHead className="text-xs">Conseiller</TableHead>
        <TableHead className="text-xs text-right">Score</TableHead>
        {onSupprimer && <TableHead className="w-10" />}
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
            <TableCell className="max-w-44 truncate text-sm text-muted-foreground" title={lead.offer ?? undefined}>
              {lead.offer || '—'}
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
            {onSupprimer && (
              <TableCell className="pr-2 text-right">
                <Button
                  variant="ghost" size="sm"
                  className="h-7 w-7 rounded-full p-0 text-muted-foreground hover:text-destructive"
                  aria-label={`Supprimer ${[lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'ce lead'}`}
                  // Sans cela, le clic ouvrirait aussi la fiche.
                  onClick={(e) => { e.stopPropagation(); onSupprimer(lead); }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TableCell>
            )}
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
        'cursor-grab rounded-lg border border-border bg-card p-3 shadow-sm transition-all hover:shadow-md active:cursor-grabbing',
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
    // L'adresse complete, et non plus la seule ville : c'est ce qui permet a
    // l'intervention d'apparaitre au bon endroit sur la carte de l'agenda.
    address: '',
    city: '',
    postal_code: '',
    citycode: null as string | null,
    latitude: null as number | null,
    longitude: null as number | null,
    geo_precision: null as 'exact' | 'approximatif' | null,
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
      first_name: '', last_name: '', phone: '', email: '',
      address: '', city: '', postal_code: '',
      citycode: null, latitude: null, longitude: null, geo_precision: null,
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
                className={cn('rounded-lg', dupFields.has('phone') && 'border-due/40')}
              />
              {dupFields.has('phone') && (
                <p className="text-[10px] text-due flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Doublon possible
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Email</Label>
              <Input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={cn('rounded-lg', dupFields.has('email') && 'border-due/40')}
              />
              {dupFields.has('email') && (
                <p className="text-[10px] text-due flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Doublon possible
                </p>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border p-3 space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Adresse principale
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Elle sera aussi utilisée comme adresse d'intervention par défaut.
              </p>
            </div>
            <LeadAddressFields
              idPrefix="new-lead-main"
              value={form}
              onUpdate={(updates) => setForm((courant) => ({
                ...courant,
                ...updates,
                address: updates.address ?? courant.address,
                postal_code: updates.postal_code ?? courant.postal_code,
                city: updates.city ?? courant.city,
              }))}
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

          {/* Vehicle */}
          <div className="rounded-lg border border-border p-3 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Véhicule</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Immat.</Label>
                <Input
                  value={form.vehicle_registration}
                  onChange={(e) => setForm({ ...form, vehicle_registration: e.target.value })}
                  className={cn('rounded-lg', dupFields.has('vehicle_registration') && 'border-due/40')}
                />
                {dupFields.has('vehicle_registration') && (
                  <p className="text-[10px] text-due flex items-center gap-1">
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
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-urgent-soft">
        <AlertTriangle className="h-6 w-6 text-urgent" />
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
