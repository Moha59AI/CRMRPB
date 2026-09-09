import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, BrainCircuit, CalendarClock, ChevronRight, FileWarning,
  Lightbulb, Loader2, RefreshCw, Sparkles, WalletCards, X,
} from 'lucide-react';
import { useAuth } from '@/features/auth/auth-context';
import { fondDepuis } from '@/features/dossier/dossier-constants';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  fetchCopilotRadar, type CopilotAlert, type CopilotAlertDomain,
  type CopilotAlertSeverity,
} from './copilot-radar-service';

const domainLabels: Record<CopilotAlertDomain, string> = {
  commercial: 'Commercial',
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

function AlertItem({ alert, onOpen }: { alert: CopilotAlert; onOpen: (alert: CopilotAlert) => void }) {
  const Icon = domainIcons[alert.domain];
  return (
    <button
      type="button"
      onClick={() => onOpen(alert)}
      className="group flex w-full items-start gap-3 border-b border-border/70 px-4 py-3 text-left transition-colors last:border-0 hover:bg-muted/50"
    >
      <div className={cn(
        'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
        alert.severity === 'urgent' && 'border-urgent/25 bg-urgent-soft text-urgent',
        alert.severity === 'attention' && 'border-due/25 bg-due-soft text-due',
        alert.severity === 'opportunity' && 'border-primary/20 bg-primary/10 text-primary',
      )}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="text-sm font-medium text-foreground">{alert.title}</p>
          {alert.source === 'ai' && (
            <Badge variant="outline" className="h-5 rounded-full px-1.5 text-[9px] text-primary">
              IA
            </Badge>
          )}
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {alert.description}
        </p>
        <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
          {domainLabels[alert.domain]}
        </p>
      </div>
      <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

export function CopilotRadar() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | CopilotAlertSeverity>('all');
  const query = useQuery({
    queryKey: ['copilot-radar', profile?.id, profile?.role],
    queryFn: () => fetchCopilotRadar({ userId: profile!.id, role: profile!.role }),
    enabled: Boolean(profile),
    staleTime: 60_000,
    refetchInterval: 180_000,
    refetchIntervalInBackground: false,
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

  const alerts = useMemo(() => query.data?.alerts ?? [], [query.data?.alerts]);
  const counts = useMemo(() => ({
    urgent: alerts.filter((alert) => alert.severity === 'urgent').length,
    attention: alerts.filter((alert) => alert.severity === 'attention').length,
    opportunity: alerts.filter((alert) => alert.severity === 'opportunity').length,
  }), [alerts]);
  const filteredAlerts = filter === 'all'
    ? alerts
    : alerts.filter((alert) => alert.severity === filter);
  const badgeCount = counts.urgent + counts.attention;

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
          aria-label="Radar du copilote"
          className="animate-slide-in absolute bottom-14 right-0 flex max-h-[min(680px,calc(100dvh-7rem))] w-[calc(100vw-2rem)] max-w-md flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl"
        >
          <header className="border-b border-border px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <BrainCircuit className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">Radar copilote</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Les points qui méritent votre attention maintenant.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 rounded-full"
                  aria-label="Actualiser le radar"
                  disabled={query.isFetching}
                  onClick={() => void query.refetch()}
                >
                  {query.isFetching
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

            <div className="mt-3 flex gap-1 overflow-x-auto">
              {([
                ['all', 'Tout', alerts.length],
                ['urgent', 'Urgent', counts.urgent],
                ['attention', 'À traiter', counts.attention],
                ['opportunity', 'Opportunités', counts.opportunity],
              ] as const).map(([key, label, count]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={cn(
                    'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                    filter === key
                      ? 'bg-secondary text-secondary-foreground'
                      : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {label} · {count}
                </button>
              ))}
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
            {query.isLoading ? (
              <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Analyse des priorités…
              </div>
            ) : query.isError ? (
              <div className="px-5 py-10 text-center">
                <AlertTriangle className="mx-auto h-6 w-6 text-due" />
                <p className="mt-2 text-sm font-medium">Le radar n’a pas pu se mettre à jour</p>
                <p className="mt-1 text-xs text-muted-foreground">{(query.error as Error).message}</p>
              </div>
            ) : filteredAlerts.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <Lightbulb className="mx-auto h-7 w-7 text-primary" />
                <p className="mt-2 text-sm font-medium">Rien à signaler dans ce filtre</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Le radar se réactualise automatiquement toutes les trois minutes.
                </p>
              </div>
            ) : (
              filteredAlerts.map((alert) => (
                <AlertItem key={alert.id} alert={alert} onOpen={openAlert} />
              ))
            )}
          </div>

          <footer className="border-t border-border bg-muted/30 px-4 py-2 text-[10px] text-muted-foreground">
            Les règles métier tournent sans coût OpenAI. L’analyse IA détaillée reste lancée depuis chaque fiche.
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
