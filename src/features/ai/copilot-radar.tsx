import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, BrainCircuit, CalendarClock, Check, ChevronRight, Clock3,
  EyeOff, FileWarning, Lightbulb, ListChecks, Loader2, RefreshCw, Sparkles,
  WalletCards, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/features/auth/auth-context';
import { fondDepuis } from '@/features/dossier/dossier-constants';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  fetchCopilotRadar, type CopilotAlert, type CopilotAlertDomain,
  type CopilotAlertSeverity,
} from './copilot-radar-service';
import {
  fetchCopilotAlertStates, saveCopilotAlertState,
  type CopilotAlertDisposition,
} from './copilot-state-service';

const domainLabels: Record<CopilotAlertDomain, string> = {
  commercial: 'Leads',
  documents: 'Documents',
  agenda: 'Agenda',
  finance: 'Finance',
  assistant: 'Analyse IA',
};

const domainIcons = {
  commercial: Sparkles,
  documents: FileWarning,
  agenda: CalendarClock,
  finance: WalletCards,
  assistant: BrainCircuit,
};

const severityLabels: Record<CopilotAlertSeverity, string> = {
  urgent: 'Urgent',
  attention: 'À traiter',
  opportunity: 'Opportunité',
};

function actionLabel(domain: CopilotAlertDomain): string {
  if (domain === 'documents') return 'Vérifier les pièces';
  if (domain === 'agenda') return 'Voir le rendez-vous';
  if (domain === 'finance') return 'Traiter en finance';
  if (domain === 'assistant') return 'Voir l’analyse';
  return 'Ouvrir la fiche';
}

function echeanceLabel(dueAt: string | null): string | null {
  if (!dueAt) return null;
  const difference = new Date(dueAt).getTime() - Date.now();
  if (!Number.isFinite(difference)) return null;
  const heures = Math.round(Math.abs(difference) / 3_600_000);
  if (difference < 0) {
    if (heures < 24) return `En retard de ${Math.max(1, heures)} h`;
    const jours = Math.floor(heures / 24);
    return `En retard de ${jours} jour${jours > 1 ? 's' : ''}`;
  }
  if (heures < 24) return `Dans ${Math.max(1, heures)} h`;
  const jours = Math.round(heures / 24);
  return `Dans ${jours} jour${jours > 1 ? 's' : ''}`;
}

function severityClass(severity: CopilotAlertSeverity): string {
  if (severity === 'urgent') return 'border-urgent/30 bg-urgent-soft text-urgent';
  if (severity === 'attention') return 'border-due/30 bg-due-soft text-due';
  return 'border-primary/20 bg-primary/10 text-primary';
}

interface ActionRequest {
  alert: CopilotAlert;
  status: CopilotAlertDisposition;
  hours: number;
}

interface AlertActionsProps {
  alert: CopilotAlert;
  compact?: boolean;
  disabled: boolean;
  onOpen: (alert: CopilotAlert) => void;
  onDisposition: (request: ActionRequest) => void;
}

function AlertActions({
  alert, compact = false, disabled, onOpen, onDisposition,
}: AlertActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        type="button"
        size="sm"
        className={cn('rounded-full', compact && 'h-7 px-2.5 text-[11px]')}
        onClick={() => onOpen(alert)}
      >
        {actionLabel(alert.domain)}
        <ChevronRight className="ml-1 h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={cn('rounded-full', compact && 'h-7 px-2.5 text-[11px]')}
        disabled={disabled}
        onClick={() => onDisposition({ alert, status: 'snoozed', hours: 4 })}
      >
        <Clock3 className="mr-1 h-3.5 w-3.5" />
        Reporter 4 h
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={cn('rounded-full', compact && 'h-7 px-2.5 text-[11px]')}
        disabled={disabled}
        onClick={() => onDisposition({ alert, status: 'done', hours: 24 })}
      >
        <Check className="mr-1 h-3.5 w-3.5" />
        Traité
      </Button>
      {!compact && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="rounded-full text-muted-foreground"
          disabled={disabled}
          onClick={() => onDisposition({ alert, status: 'dismissed', hours: 24 * 30 })}
        >
          <EyeOff className="mr-1 h-3.5 w-3.5" />
          Masquer 30 jours
        </Button>
      )}
    </div>
  );
}

function FocusAlert({
  alert, disabled, onOpen, onDisposition,
}: Omit<AlertActionsProps, 'compact'>) {
  const Icon = domainIcons[alert.domain];
  const echeance = echeanceLabel(alert.dueAt);
  return (
    <article className="rounded-xl border border-border bg-background p-3.5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={cn(
          'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
          severityClass(alert.severity),
        )}>
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={cn('h-5 rounded-full px-1.5 text-[9px]', severityClass(alert.severity))}>
              {severityLabels[alert.severity]}
            </Badge>
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {domainLabels[alert.domain]}
            </span>
            {alert.source === 'ai' && (
              <Badge variant="outline" className="h-5 rounded-full px-1.5 text-[9px] text-primary">
                IA
              </Badge>
            )}
          </div>
          <h3 className="mt-1.5 text-sm font-semibold leading-snug text-foreground">{alert.title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Pourquoi maintenant : </span>
            {alert.description}
          </p>
          {echeance && (
            <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-due">
              <Clock3 className="h-3 w-3" />
              {echeance}
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 border-t border-border/70 pt-3">
        <AlertActions
          alert={alert}
          disabled={disabled}
          onOpen={onOpen}
          onDisposition={onDisposition}
        />
      </div>
    </article>
  );
}

function CompactAlert({
  alert, disabled, onOpen, onDisposition,
}: Omit<AlertActionsProps, 'compact'>) {
  const Icon = domainIcons[alert.domain];
  const echeance = echeanceLabel(alert.dueAt);
  return (
    <article className="border-b border-border/70 px-4 py-3 last:border-0">
      <button type="button" onClick={() => onOpen(alert)} className="group flex w-full items-start gap-3 text-left">
        <div className={cn(
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
          severityClass(alert.severity),
        )}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-sm font-medium text-foreground">{alert.title}</p>
            {alert.source === 'ai' && (
              <Badge variant="outline" className="h-5 rounded-full px-1.5 text-[9px] text-primary">IA</Badge>
            )}
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{alert.description}</p>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
            {domainLabels[alert.domain]}{echeance ? ` · ${echeance}` : ''}
          </p>
        </div>
        <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </button>
      <div className="mt-2 pl-11">
        <AlertActions
          alert={alert}
          compact
          disabled={disabled}
          onOpen={onOpen}
          onDisposition={onDisposition}
        />
      </div>
    </article>
  );
}

export function CopilotRadar() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<'all' | CopilotAlertSeverity>('all');
  const [domainFilter, setDomainFilter] = useState<'all' | CopilotAlertDomain>('all');

  const radarQuery = useQuery({
    queryKey: ['copilot-radar', profile?.id, profile?.role],
    queryFn: () => fetchCopilotRadar({ userId: profile!.id, role: profile!.role }),
    enabled: Boolean(profile),
    staleTime: 60_000,
    refetchInterval: 180_000,
    refetchIntervalInBackground: false,
  });
  const stateQuery = useQuery({
    queryKey: ['copilot-alert-states', profile?.id],
    queryFn: () => fetchCopilotAlertStates(profile!.id),
    enabled: Boolean(profile),
    staleTime: 60_000,
  });
  const disposition = useMutation({
    mutationFn: async ({ alert, status, hours }: ActionRequest) => {
      if (!profile) throw new Error('Session utilisateur indisponible');
      await saveCopilotAlertState({
        workspaceId: profile.workspace_id,
        userId: profile.id,
        alertKey: alert.id,
        status,
        hiddenUntil: new Date(Date.now() + hours * 3_600_000).toISOString(),
      });
    },
    onSuccess: async (_, request) => {
      await queryClient.invalidateQueries({ queryKey: ['copilot-alert-states', profile?.id] });
      const message = request.status === 'done'
        ? 'Retiré des priorités pour aujourd’hui'
        : request.status === 'snoozed'
          ? 'Alerte reportée de 4 heures'
          : 'Alerte masquée pendant 30 jours';
      toast.success(message);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  const hiddenKeys = useMemo(
    () => new Set((stateQuery.data?.states ?? []).map((state) => state.alert_key)),
    [stateQuery.data?.states],
  );
  const alerts = useMemo(
    () => (radarQuery.data?.alerts ?? []).filter((alert) => !hiddenKeys.has(alert.id)),
    [hiddenKeys, radarQuery.data?.alerts],
  );
  const counts = useMemo(() => ({
    urgent: alerts.filter((alert) => alert.severity === 'urgent').length,
    attention: alerts.filter((alert) => alert.severity === 'attention').length,
    opportunity: alerts.filter((alert) => alert.severity === 'opportunity').length,
  }), [alerts]);
  const filteredAlerts = useMemo(() => alerts.filter((alert) => (
    (severityFilter === 'all' || alert.severity === severityFilter)
    && (domainFilter === 'all' || alert.domain === domainFilter)
  )), [alerts, domainFilter, severityFilter]);
  const focusAlerts = filteredAlerts.slice(0, 3);
  const remainingAlerts = filteredAlerts.slice(3);
  const badgeCount = counts.urgent + counts.attention;
  const stateAvailable = !stateQuery.isError && stateQuery.data?.available !== false;

  const openAlert = (alert: CopilotAlert) => {
    if (alert.link.startsWith('/interventions/') && !location.pathname.startsWith('/interventions/')) {
      navigate(alert.link, { state: { background: fondDepuis(location) } });
    } else {
      navigate(alert.link);
    }
    setOpen(false);
  };

  if (!profile) return null;

  return (
    <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-40 md:bottom-6">
      {open && (
        <section
          aria-label="Centre d’action du copilote"
          className="animate-slide-in absolute bottom-14 right-0 flex max-h-[min(760px,calc(100dvh-7rem))] w-[calc(100vw-2rem)] max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl"
        >
          <header className="border-b border-border px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <BrainCircuit className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">Centre d’action</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {badgeCount > 0
                      ? `${badgeCount} point${badgeCount > 1 ? 's' : ''} à traiter, classés par risque.`
                      : 'Aucune urgence : surveillez les opportunités restantes.'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 rounded-full"
                  aria-label="Actualiser le centre d’action"
                  disabled={radarQuery.isFetching}
                  onClick={() => void Promise.all([radarQuery.refetch(), stateQuery.refetch()])}
                >
                  {radarQuery.isFetching
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <RefreshCw className="h-4 w-4" />}
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 rounded-full"
                  aria-label="Fermer le copilote"
                  onClick={() => setOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="mt-3 flex gap-1 overflow-x-auto pb-1">
              {([
                ['all', 'Tout', alerts.length],
                ['urgent', 'Urgent', counts.urgent],
                ['attention', 'À traiter', counts.attention],
                ['opportunity', 'Opportunités', counts.opportunity],
              ] as const).map(([key, label, count]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSeverityFilter(key)}
                  className={cn(
                    'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                    severityFilter === key
                      ? 'bg-secondary text-secondary-foreground'
                      : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {label} · {count}
                </button>
              ))}
            </div>

            <div className="mt-1.5 flex gap-1 overflow-x-auto pb-1" aria-label="Filtrer par activité">
              {(['all', 'commercial', 'documents', 'agenda', 'finance', 'assistant'] as const).map((domain) => (
                <button
                  key={domain}
                  type="button"
                  onClick={() => setDomainFilter(domain)}
                  className={cn(
                    'shrink-0 rounded-full border px-2 py-0.5 text-[10px] transition-colors',
                    domainFilter === domain
                      ? 'border-primary/30 bg-primary/10 font-medium text-primary'
                      : 'border-transparent text-muted-foreground hover:border-border',
                  )}
                >
                  {domain === 'all' ? 'Toutes les activités' : domainLabels[domain]}
                </button>
              ))}
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
            {radarQuery.isLoading || stateQuery.isLoading ? (
              <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Classement des priorités…
              </div>
            ) : radarQuery.isError ? (
              <div className="px-5 py-10 text-center">
                <AlertTriangle className="mx-auto h-6 w-6 text-due" />
                <p className="mt-2 text-sm font-medium">Le copilote n’a pas pu se mettre à jour</p>
                <p className="mt-1 text-xs text-muted-foreground">{(radarQuery.error as Error).message}</p>
              </div>
            ) : filteredAlerts.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <Lightbulb className="mx-auto h-7 w-7 text-primary" />
                <p className="mt-2 text-sm font-medium">Rien à signaler dans ce filtre</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Les points traités réapparaissent si leur cause existe encore après le délai choisi.
                </p>
              </div>
            ) : (
              <>
                <section className="space-y-2.5 bg-muted/30 px-4 py-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground">
                        <ListChecks className="h-3.5 w-3.5 text-primary" />
                        À faire maintenant
                      </h3>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Les trois actions au plus fort risque passent en premier.
                      </p>
                    </div>
                    <Badge variant="secondary" className="rounded-full">{focusAlerts.length}</Badge>
                  </div>
                  {focusAlerts.map((alert) => (
                    <FocusAlert
                      key={alert.id}
                      alert={alert}
                      disabled={!stateAvailable || disposition.isPending}
                      onOpen={openAlert}
                      onDisposition={(request) => disposition.mutate(request)}
                    />
                  ))}
                </section>

                {remainingAlerts.length > 0 && (
                  <section>
                    <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Ensuite
                      </h3>
                      <span className="text-xs tabular text-muted-foreground">{remainingAlerts.length}</span>
                    </div>
                    {remainingAlerts.map((alert) => (
                      <CompactAlert
                        key={alert.id}
                        alert={alert}
                        disabled={!stateAvailable || disposition.isPending}
                        onOpen={openAlert}
                        onDisposition={(request) => disposition.mutate(request)}
                      />
                    ))}
                  </section>
                )}
              </>
            )}
          </div>

          <footer className="border-t border-border bg-muted/30 px-4 py-2 text-[10px] leading-relaxed text-muted-foreground">
            {stateQuery.isError
              ? 'Les priorités restent consultables, mais leur rangement personnel est momentanément indisponible.'
              : stateAvailable
                ? 'Traiter, reporter ou masquer ne modifie jamais le dossier : seul votre centre d’action est rangé.'
                : 'Appliquez la migration du centre d’action pour activer Traité, Reporter et Masquer.'}
          </footer>
        </section>
      )}

      <button
        type="button"
        aria-label={badgeCount > 0 ? `Ouvrir le copilote, ${badgeCount} point(s) à traiter` : 'Ouvrir le copilote'}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'relative flex h-12 items-center gap-2 rounded-full border border-primary/20 bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.98]',
          counts.urgent > 0 && 'animate-sonnerie',
        )}
      >
        <BrainCircuit className="h-5 w-5" />
        <span className="hidden sm:inline">Copilote</span>
        {badgeCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-urgent px-1 text-[10px] font-bold text-white ring-2 ring-background">
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </button>
    </div>
  );
}
