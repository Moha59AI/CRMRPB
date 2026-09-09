import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowRight, BrainCircuit, CheckCircle2, Clipboard, ExternalLink,
  ListChecks, Loader2, MessageSquare, PhoneCall, RefreshCw, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { Lead, Note, TaskType } from '@/types';
import { formatDateTime } from '@/features/leads/lead-shared';
import { createTask } from '@/services/planning-service';
import { cn } from '@/lib/utils';
import {
  analyzeLead, fetchLatestLeadInsight, type AiActionChannel,
  type AiDetectedInformation, type AiPriority,
} from './lead-ai-service';

interface LeadAiAssistantProps {
  lead: Lead;
  notes: Note[];
  onVoirHistorique: () => void;
}

const confidenceLabels: Record<AiDetectedInformation['confidence'], string> = {
  high: 'Confirmé',
  medium: 'Probable',
  low: 'À vérifier',
};

const priorityLabels: Record<AiPriority, string> = {
  urgent: 'Urgent',
  high: 'Prioritaire',
  normal: 'Normal',
  low: 'Faible',
};

const channelLabels: Record<AiActionChannel, string> = {
  call: 'Appel',
  sms: 'SMS',
  email: 'E-mail',
  task: 'Tâche',
  none: 'Vérification',
};

function taskTypeForChannel(channel: AiActionChannel | undefined): TaskType {
  if (channel === 'call' || channel === 'sms' || channel === 'email') return channel;
  return 'follow_up';
}

export function LeadAiAssistant({
  lead, notes, onVoirHistorique,
}: LeadAiAssistantProps) {
  const queryClient = useQueryClient();
  const queryKey = ['lead-ai-insight', lead.id];
  const { data: insight, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchLatestLeadInsight(lead.id),
  });
  const analyser = useMutation({
    mutationFn: () => analyzeLead(lead.id),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKey, result);
      toast.success('Analyse du lead actualisée');
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const creerTache = useMutation({
    mutationFn: async () => {
      if (!insight?.next_action) throw new Error('Aucune action à transformer en tâche');
      const action = insight.next_action;
      const result = await createTask({
        lead_id: lead.id,
        assigned_user_id: lead.assigned_user_id,
        title: action.label.slice(0, 160),
        description: [
          action.objective ? `Objectif : ${action.objective}` : null,
          `Pourquoi : ${action.reason}`,
          'Suggestion du copilote validée par un conseiller.',
        ].filter(Boolean).join('\n'),
        type: taskTypeForChannel(action.channel),
        priority: action.priority ?? 'normal',
        status: 'pending',
        due_at: action.suggested_at,
      });
      if (result.error) throw new Error(result.error);
      if (!result.task) throw new Error('La tâche n’a pas été créée');
      return result.task;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lead-tasks', lead.id] }),
        queryClient.invalidateQueries({ queryKey: ['today', 'tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['relances'] }),
        queryClient.invalidateQueries({ queryKey: ['copilot-radar'] }),
      ]);
      toast.success('Tâche ajoutée à la file de travail');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const copierMessage = async () => {
    const message = insight?.next_action?.draft_message;
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
      toast.success('Message copié');
    } catch {
      toast.error('Impossible de copier le message');
    }
  };

  const latestNoteAt = notes.reduce<string | null>(
    (latest, note) => !latest || note.created_at > latest ? note.created_at : latest,
    null,
  );
  const needsRefresh = Boolean(
    insight
    && (
      lead.updated_at > insight.created_at
      || (latestNoteAt && latestNoteAt > insight.created_at)
      || notes.length !== insight.source_notes_count
    ),
  );
  const sourceNotes = insight?.evidence
    .map((evidence) => ({
      evidence,
      note: notes.find((note) => note.id === evidence.note_id),
    }))
    .filter((source) => source.note) ?? [];

  if (isLoading) {
    return <Skeleton className="h-32 w-full rounded-xl" />;
  }

  return (
    <section className="overflow-hidden rounded-xl border border-primary/20 bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-primary/10 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BrainCircuit className="h-4 w-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">Copilote IA</h3>
              {needsRefresh && (
                <Badge variant="outline" className="rounded-full border-due/30 bg-due-soft text-[10px] text-due">
                  À actualiser
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Suggestions uniquement — aucune modification automatique.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant={insight ? 'outline' : 'default'}
          className="rounded-full"
          disabled={analyser.isPending}
          onClick={() => analyser.mutate()}
        >
          {analyser.isPending
            ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            : insight
              ? <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
          {analyser.isPending ? 'Analyse…' : insight ? 'Actualiser' : 'Analyser'}
        </Button>
      </div>

      {!insight ? (
        <div className="px-4 py-5 text-sm text-muted-foreground">
          Lancez une analyse pour résumer la fiche et les commentaires, repérer les informations utiles et suggérer la prochaine action.
        </div>
      ) : (
        <div className="space-y-4 px-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Résumé</p>
            <p className="mt-1 text-sm leading-relaxed text-foreground">{insight.summary}</p>
          </div>

          {insight.detected_information.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Informations détectées
              </p>
              <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                {insight.detected_information.map((information, index) => (
                  <div key={information.label + index} className="rounded-lg border border-border/70 bg-background/70 px-3 py-2">
                    <dt className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>{information.label}</span>
                      <span>{confidenceLabels[information.confidence]}</span>
                    </dt>
                    <dd className="mt-0.5 text-sm font-medium">{information.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {insight.next_action && (
            <div className="rounded-lg border border-primary/20 bg-primary/[0.06] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
                  <ArrowRight className="h-3.5 w-3.5" />
                  Prochaine action suggérée
                </p>
                <div className="flex items-center gap-1.5">
                  {insight.next_action.channel && (
                    <Badge variant="outline" className="rounded-full text-[10px]">
                      {insight.next_action.channel === 'call' && <PhoneCall className="mr-1 h-3 w-3" />}
                      {insight.next_action.channel === 'sms' && <MessageSquare className="mr-1 h-3 w-3" />}
                      {channelLabels[insight.next_action.channel]}
                    </Badge>
                  )}
                  {insight.next_action.priority && (
                    <Badge
                      variant="outline"
                      className={cn(
                        'rounded-full text-[10px]',
                        insight.next_action.priority === 'urgent' && 'border-urgent/30 bg-urgent-soft text-urgent',
                        insight.next_action.priority === 'high' && 'border-due/30 bg-due-soft text-due',
                      )}
                    >
                      {priorityLabels[insight.next_action.priority]}
                    </Badge>
                  )}
                </div>
              </div>
              <p className="mt-1 text-sm font-semibold">{insight.next_action.label}</p>
              {insight.next_action.objective && (
                <p className="mt-1 text-xs font-medium text-foreground">
                  Objectif : {insight.next_action.objective}
                </p>
              )}
              <p className="mt-0.5 text-xs text-muted-foreground">{insight.next_action.reason}</p>
              {insight.next_action.suggested_at && (
                <p className="mt-1 text-xs font-medium">
                  Date proposée : {formatDateTime(insight.next_action.suggested_at)}
                </p>
              )}
              {(insight.next_action.checklist?.length ?? 0) > 0 && (
                <div className="mt-3 rounded-lg border border-border/70 bg-background/70 p-2.5">
                  <p className="flex items-center gap-1.5 text-xs font-medium">
                    <ListChecks className="h-3.5 w-3.5 text-primary" />
                    À vérifier pendant l’action
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {insight.next_action.checklist?.map((item, index) => (
                      <li key={index} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {insight.next_action.channel !== 'none' && (
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 rounded-full"
                    disabled={creerTache.isPending}
                    onClick={() => creerTache.mutate()}
                  >
                    {creerTache.isPending
                      ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                    Créer la tâche
                  </Button>
                )}
                {insight.next_action.draft_message && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-full"
                    onClick={() => void copierMessage()}
                  >
                    <Clipboard className="mr-1.5 h-3.5 w-3.5" />
                    Copier le message
                  </Button>
                )}
              </div>
            </div>
          )}

          {insight.warnings.length > 0 && (
            <div className="space-y-1.5">
              {insight.warnings.map((warning, index) => (
                <div
                  key={index}
                  className={cn(
                    'flex items-start gap-2 rounded-lg border px-3 py-2 text-xs',
                    warning.severity === 'critical'
                      ? 'border-urgent/30 bg-urgent-soft text-urgent'
                      : 'border-due/30 bg-due-soft text-due',
                  )}
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div>
                    <p>{warning.message}</p>
                    {warning.category !== 'general' && (
                      <p className="mt-0.5 text-[10px] uppercase tracking-wide opacity-70">
                        {warning.category}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3 text-[11px] text-muted-foreground">
            <span>
              Analysé le {formatDateTime(insight.created_at)} · {insight.source_notes_count} commentaire{insight.source_notes_count > 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-3">
              {insight.estimated_cost_usd !== null && (
                <span>Coût estimé : {insight.estimated_cost_usd.toFixed(4)} $</span>
              )}
              {sourceNotes.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-auto rounded-full px-2 py-1 text-[11px]"
                  onClick={onVoirHistorique}
                >
                  <ExternalLink className="mr-1 h-3 w-3" />
                  Voir les sources
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
