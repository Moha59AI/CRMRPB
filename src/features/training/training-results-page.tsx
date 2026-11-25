import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, CheckCircle2, CircleX, Clock3, Eye, GraduationCap, Loader2,
  RefreshCw, Trophy, UserRound,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { EtatErreur } from '@/components/EtatErreur';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  fetchTrainingAttemptDetail,
  fetchTrainingResults,
  type TrainingAttemptDetail,
  type TrainingAttemptSummary,
} from '@/services/training-service';

function dateComplete(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function nomUtilisateur(tentative: TrainingAttemptSummary) {
  return tentative.user_name?.trim() || 'Utilisateur sans nom';
}

function StatutTentative({ tentative }: { tentative: TrainingAttemptSummary }) {
  if (tentative.status === 'in_progress') {
    return (
      <Badge variant="outline" className="rounded-full border-amber-300 text-amber-700 dark:text-amber-300">
        <Clock3 className="mr-1 h-3 w-3" /> En cours
      </Badge>
    );
  }
  if (tentative.status === 'abandoned') {
    return <Badge variant="outline" className="rounded-full font-normal text-muted-foreground">Interrompu</Badge>;
  }
  return tentative.passed ? (
    <Badge className="rounded-full border-transparent bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-200">
      <Trophy className="mr-1 h-3 w-3" /> Validé
    </Badge>
  ) : (
    <Badge variant="outline" className="rounded-full border-red-200 text-red-700 dark:border-red-900 dark:text-red-300">
      À retravailler
    </Badge>
  );
}

function DetailTentative({ tentative }: { tentative: TrainingAttemptDetail }) {
  const pourcentage = Math.round((tentative.score / tentative.total) * 100);
  return (
    <div className="space-y-5">
      <div className={cn(
        'rounded-xl border p-4',
        tentative.passed
          ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30'
          : 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30',
      )}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Score final</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{tentative.score}/{tentative.total}</p>
          </div>
          <StatutTentative tentative={{ ...tentative, status: 'completed' }} />
        </div>
        <Progress value={pourcentage} className="mt-3 h-2" />
      </div>

      <div>
        <h3 className="text-sm font-semibold">Résultat par thème</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {tentative.sections.map((section) => (
            <div key={section.name} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
              <span className="text-xs font-medium">{section.name}</span>
              <span className="shrink-0 text-xs font-semibold tabular-nums">{section.score}/{section.total}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold">Détail des réponses</h3>
        <div className="mt-3 space-y-2">
          {tentative.answers.map((answer, index) => (
            <article key={answer.id} className="rounded-xl border border-border p-3 sm:p-4">
              <div className="flex items-start gap-3">
                <span className={cn(
                  'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                  answer.correct
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
                )}>
                  {answer.correct ? <CheckCircle2 className="h-4 w-4" /> : <CircleX className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-semibold text-muted-foreground">QUESTION {index + 1}</span>
                    <Badge variant="outline" className="rounded-full text-[10px] font-normal">{answer.section}</Badge>
                  </div>
                  <p className="mt-2 text-sm font-semibold leading-5">{answer.prompt}</p>
                  <p className={cn(
                    'mt-2 text-xs leading-5',
                    answer.correct ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300',
                  )}>
                    Réponse : <span className="font-medium">{answer.selected_choice}</span>
                  </p>
                  {!answer.correct && (
                    <p className="mt-1 text-xs leading-5 text-emerald-700 dark:text-emerald-300">
                      Attendu : <span className="font-medium">{answer.correct_choice}</span>
                    </p>
                  )}
                  <p className="mt-2 rounded-lg bg-muted/50 px-3 py-2 text-xs leading-5 text-muted-foreground">
                    {answer.explanation}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TrainingResultsPage() {
  const navigate = useNavigate();
  const [selection, setSelection] = useState<TrainingAttemptSummary | null>(null);

  const resultats = useQuery({
    queryKey: ['training-results'],
    queryFn: () => fetchTrainingResults(200),
    retry: false,
  });
  const detail = useQuery({
    queryKey: ['training-attempt-detail', selection?.id],
    queryFn: () => fetchTrainingAttemptDetail(selection!.id),
    enabled: Boolean(selection?.id && selection.status === 'completed'),
    retry: false,
  });

  const terminees = resultats.data?.filter((tentative) => tentative.status === 'completed') ?? [];
  const validees = terminees.filter((tentative) => tentative.passed).length;

  return (
    <div className="flex min-h-full flex-col bg-background">
      <PageHeader
        title="Résultats de formation"
        description="Suivez les connaissances de l’équipe et les points à retravailler"
        action={
          <Button variant="outline" className="w-full rounded-full sm:w-auto" onClick={() => navigate('/formation')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Formation
          </Button>
        }
      />

      <main className="flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6">
        <div className="mx-auto max-w-6xl space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              ['Tentatives', resultats.data?.length ?? 0, GraduationCap],
              ['Terminées', terminees.length, CheckCircle2],
              ['Validées', validees, Trophy],
            ].map(([label, value, Icon]) => {
              const Icone = Icon as typeof GraduationCap;
              return (
                <div key={String(label)} className="rounded-xl border border-border bg-card p-4">
                  <Icone className="h-5 w-5 text-primary" />
                  <p className="mt-3 text-2xl font-semibold tabular-nums">{String(value)}</p>
                  <p className="text-xs text-muted-foreground">{String(label)}</p>
                </div>
              );
            })}
          </div>

          {resultats.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 rounded-xl" />
              <Skeleton className="h-16 rounded-xl" />
              <Skeleton className="h-16 rounded-xl" />
            </div>
          ) : resultats.isError ? (
            <EtatErreur
              titre="Résultats indisponibles"
              erreur={resultats.error}
              onReessayer={() => void resultats.refetch()}
              className="min-h-[320px] rounded-xl border border-dashed border-border"
            />
          ) : resultats.data?.length ? (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold">Toutes les tentatives</h2>
                  <p className="text-xs text-muted-foreground">Les plus récentes apparaissent en premier.</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => void resultats.refetch()} aria-label="Actualiser">
                  <RefreshCw className={cn('h-4 w-4', resultats.isFetching && 'animate-spin')} />
                </Button>
              </div>

              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Collaborateur</TableHead>
                      <TableHead>Quiz</TableHead>
                      <TableHead>Commencé</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                      <TableHead className="w-24 text-right">Détail</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resultats.data.map((tentative) => (
                      <TableRow key={tentative.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted"><UserRound className="h-4 w-4" /></span>
                            <span className="font-medium">{nomUtilisateur(tentative)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{tentative.quiz_title}</TableCell>
                        <TableCell className="text-muted-foreground">{dateComplete(tentative.started_at)}</TableCell>
                        <TableCell><StatutTentative tentative={tentative} /></TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {tentative.score == null ? '—' : `${tentative.score}/${tentative.total}`}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={tentative.status !== 'completed'}
                            onClick={() => setSelection(tentative)}
                            aria-label={`Voir la tentative de ${nomUtilisateur(tentative)}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="divide-y divide-border md:hidden">
                {resultats.data.map((tentative) => (
                  <button
                    key={tentative.id}
                    type="button"
                    disabled={tentative.status !== 'completed'}
                    onClick={() => setSelection(tentative)}
                    className="flex min-h-24 w-full items-center justify-between gap-3 px-4 py-3 text-left disabled:cursor-default"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{nomUtilisateur(tentative)}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{tentative.quiz_title}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{dateComplete(tentative.started_at)}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <StatutTentative tentative={tentative} />
                      <span className="text-xs font-semibold tabular-nums">
                        {tentative.score == null ? '—' : `${tentative.score}/${tentative.total}`}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 text-center">
              <GraduationCap className="h-10 w-10 text-muted-foreground/30" />
              <p className="mt-3 text-sm font-medium">Aucune tentative enregistrée</p>
            </div>
          )}
        </div>
      </main>

      <Dialog open={Boolean(selection)} onOpenChange={(open) => !open && setSelection(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{selection ? nomUtilisateur(selection) : 'Résultat'}</DialogTitle>
            <DialogDescription>
              {selection?.quiz_title} · terminé le {dateComplete(selection?.completed_at ?? null)}
            </DialogDescription>
          </DialogHeader>
          {detail.isLoading ? (
            <div className="flex min-h-60 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : detail.isError ? (
            <EtatErreur erreur={detail.error} onReessayer={() => void detail.refetch()} className="min-h-60" />
          ) : detail.data ? (
            <DetailTentative tentative={detail.data} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
