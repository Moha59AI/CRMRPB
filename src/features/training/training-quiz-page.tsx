import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronRight, CircleX,
  GraduationCap, Lightbulb, Loader2, RotateCcw, ShieldCheck, Trophy, X,
} from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { EtatErreur } from '@/components/EtatErreur';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  answerTrainingQuiz,
  fetchTrainingAttemptState,
  startTrainingQuiz,
  type TrainingAttemptState,
  type TrainingCorrection,
  type TrainingSectionProgress,
} from '@/services/training-service';

const LETTRES = ['A', 'B', 'C', 'D'];

function ProgressionSections({
  sections,
  correction,
  sectionCourante,
}: {
  sections: TrainingSectionProgress[];
  correction: TrainingCorrection | null;
  sectionCourante?: string;
}) {
  return (
    <div className="grid min-w-[720px] grid-cols-5 gap-2 lg:min-w-0">
      {sections.map((section, index) => {
        const reponseLocale = correction && section.name === sectionCourante ? 1 : 0;
        const repondu = Math.min(section.total, section.answered + reponseLocale);
        const actif = section.name === sectionCourante;
        return (
          <div
            key={section.name}
            className={cn(
              'rounded-lg border px-3 py-2.5 transition-colors',
              actif ? 'border-primary/40 bg-primary/5' : 'border-border bg-background',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
                {index + 1}. {section.name}
              </p>
              <span className="shrink-0 text-[10px] font-semibold tabular-nums text-muted-foreground">
                {repondu}/{section.total}
              </span>
            </div>
            <Progress value={section.total ? (repondu / section.total) * 100 : 0} className="mt-2 h-1.5" />
          </div>
        );
      })}
    </div>
  );
}

function Bilan({
  etat,
  onRecommencer,
  chargement,
}: {
  etat: TrainingAttemptState;
  onRecommencer: () => void;
  chargement: boolean;
}) {
  const navigate = useNavigate();
  const score = etat.score ?? 0;
  const pourcentage = Math.round((score / etat.total) * 100);
  const valide = Boolean(etat.passed);

  return (
    <main className="flex-1 overflow-y-auto px-3 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-4xl space-y-5">
        <Card className={cn(
          'overflow-hidden border-2 shadow-sm',
          valide ? 'border-emerald-300 dark:border-emerald-800' : 'border-amber-300 dark:border-amber-900',
        )}>
          <div className={cn('h-2', valide ? 'bg-emerald-500' : 'bg-amber-400')} />
          <CardContent className="p-5 text-center sm:p-8">
            <div className={cn(
              'mx-auto flex h-16 w-16 items-center justify-center rounded-2xl',
              valide
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
            )}>
              {valide ? <Trophy className="h-8 w-8" /> : <GraduationCap className="h-8 w-8" />}
            </div>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Quiz terminé
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              {score}/{etat.total}
            </h1>
            <p className={cn(
              'mt-2 text-base font-semibold',
              valide ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300',
            )}>
              {valide ? 'Validation obtenue' : `Encore un effort — ${etat.pass_score}/${etat.total} requis`}
            </p>
            <Progress value={pourcentage} className="mx-auto mt-5 h-2.5 max-w-xl" />
            <p className="mt-2 text-xs text-muted-foreground">{pourcentage} % de bonnes réponses</p>

            <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
              <Button variant="outline" className="min-h-11 rounded-full" onClick={() => navigate('/formation')}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Retour à la formation
              </Button>
              <Button className="min-h-11 rounded-full" onClick={onRecommencer} disabled={chargement}>
                {chargement ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                Repasser le quiz
              </Button>
            </div>
          </CardContent>
        </Card>

        <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
          <h2 className="text-base font-semibold">Résultat par thème</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {etat.sections.map((section) => {
              const sectionScore = section.correct ?? 0;
              const sectionPct = section.total ? Math.round((sectionScore / section.total) * 100) : 0;
              return (
                <div key={section.name} className="rounded-lg border border-border bg-muted/20 p-3">
                  <p className="min-h-8 text-xs font-medium leading-4">{section.name}</p>
                  <p className="mt-3 text-xl font-semibold tabular-nums">{sectionScore}/{section.total}</p>
                  <Progress value={sectionPct} className="mt-2 h-1.5" />
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
              <Lightbulb className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Réponses à revoir</h2>
              <p className="text-xs text-muted-foreground">Les points à retenir pour la prochaine tentative.</p>
            </div>
          </div>

          {etat.review.length === 0 ? (
            <div className="mt-4 flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <p className="text-sm font-medium">Aucune erreur : toutes les réponses sont correctes.</p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {etat.review.map((reponse, index) => (
                <article key={reponse.id} className="rounded-xl border border-border p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-50 text-xs font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">
                      {index + 1}
                    </span>
                    <div className="min-w-0 space-y-2">
                      <Badge variant="outline" className="rounded-full text-[10px] font-normal">{reponse.section}</Badge>
                      <h3 className="text-sm font-semibold leading-6">{reponse.prompt}</h3>
                      <p className="text-xs text-red-700 dark:text-red-300">
                        Votre réponse : <span className="font-medium">{reponse.selected_choice}</span>
                      </p>
                      <p className="text-xs text-emerald-700 dark:text-emerald-300">
                        Bonne réponse : <span className="font-medium">{reponse.correct_choice}</span>
                      </p>
                      <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs leading-5 text-muted-foreground">
                        {reponse.explanation}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export function TrainingQuizPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { quizCode = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const attemptId = searchParams.get('tentative');
  const [selection, setSelection] = useState<number | null>(null);
  const [correction, setCorrection] = useState<TrainingCorrection | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);

  const tentative = useQuery({
    queryKey: ['training-attempt', quizCode, attemptId ?? 'new'],
    queryFn: () => attemptId
      ? fetchTrainingAttemptState(attemptId)
      : startTrainingQuiz(quizCode),
    enabled: Boolean(quizCode),
    retry: false,
    // Sans identifiant, la RPC reprend une tentative en cours ou en crée une
    // nouvelle. Elle doit donc être rejouée à chaque nouvelle ouverture du
    // parcours, même si React Query possède encore l'ancien écran en cache.
    staleTime: 0,
    refetchOnMount: 'always',
  });

  useEffect(() => {
    if (!attemptId && tentative.data?.attempt_id) {
      setSearchParams({ tentative: tentative.data.attempt_id }, { replace: true });
    }
  }, [attemptId, setSearchParams, tentative.data?.attempt_id]);

  const repondre = useMutation({
    mutationFn: (choicePosition: number) => {
      const etat = tentative.data;
      if (!etat?.question) throw new Error('Aucune question active.');
      return answerTrainingQuiz(etat.attempt_id, etat.question.id, choicePosition);
    },
    onSuccess: setCorrection,
    onError: (error: Error) => toast.error('Réponse non enregistrée', { description: error.message }),
  });

  const recommencer = useMutation({
    mutationFn: () => startTrainingQuiz(quizCode, true),
    onSuccess: (etat) => {
      setSelection(null);
      setCorrection(null);
      queryClient.setQueryData(['training-attempt', quizCode, etat.attempt_id], etat);
      setSearchParams({ tentative: etat.attempt_id }, { replace: true });
      void queryClient.invalidateQueries({ queryKey: ['training-catalog'] });
    },
    onError: (error: Error) => toast.error('Nouveau quiz impossible', { description: error.message }),
  });

  const etat = tentative.data;
  const question = etat?.question;
  const progression = useMemo(() => {
    if (!etat) return 0;
    const repondu = etat.answered + (correction ? 1 : 0);
    return Math.min(100, Math.round((repondu / etat.total) * 100));
  }, [correction, etat]);

  const suivant = async () => {
    setSelection(null);
    setCorrection(null);
    await tentative.refetch();
    mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (tentative.isLoading) {
    return (
      <div className="flex min-h-full flex-col bg-background">
        <div className="border-b border-border px-3 py-4 sm:px-6"><Skeleton className="h-10 w-64" /></div>
        <div className="mx-auto w-full max-w-4xl space-y-4 p-3 sm:p-6">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-[420px] rounded-xl" />
        </div>
      </div>
    );
  }

  if (tentative.isError || !etat) {
    return (
      <div className="flex min-h-full flex-col bg-background">
        <div className="border-b border-border px-3 py-3 sm:px-6">
          <Button variant="ghost" className="rounded-full" onClick={() => navigate('/formation')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Formation
          </Button>
        </div>
        <EtatErreur
          titre="Le quiz ne peut pas s’ouvrir"
          erreur={tentative.error}
          onReessayer={() => void tentative.refetch()}
          className="flex-1"
        />
      </div>
    );
  }

  if (etat.status === 'completed') {
    return (
      <div className="flex min-h-full flex-col bg-background">
        <div className="flex min-h-16 items-center justify-between gap-3 border-b border-border px-3 py-3 sm:px-6">
          <Button variant="ghost" className="rounded-full" onClick={() => navigate('/formation')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Formation
          </Button>
          <Badge variant="outline" className="rounded-full">{etat.title}</Badge>
        </div>
        <Bilan etat={etat} onRecommencer={() => recommencer.mutate()} chargement={recommencer.isPending} />
      </div>
    );
  }

  if (!question) {
    return (
      <EtatErreur
        titre="Question introuvable"
        erreur="Rechargez le quiz pour poursuivre votre tentative."
        onReessayer={() => void tentative.refetch()}
        className="min-h-full"
      />
    );
  }

  return (
    <div className="flex min-h-full flex-col bg-muted/20">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-3 px-3 py-3 sm:px-6">
          <Button variant="ghost" className="min-h-11 rounded-full px-3" onClick={() => navigate('/formation')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Quitter
          </Button>
          <div className="min-w-0 text-center">
            <p className="truncate text-sm font-semibold">{etat.title}</p>
            <p className="text-xs text-muted-foreground">Question {question.position} sur {etat.total}</p>
          </div>
          <Badge variant="outline" className="hidden rounded-full tabular-nums sm:inline-flex">{progression} %</Badge>
        </div>
        <Progress value={progression} className="h-1 rounded-none" />
      </header>

      <div className="border-b border-border bg-background px-3 py-3 sm:px-6">
        <div className="mx-auto max-w-6xl overflow-x-auto pb-1">
          <ProgressionSections
            sections={etat.sections}
            correction={correction}
            sectionCourante={question.section}
          />
        </div>
      </div>

      <main ref={mainRef} className="flex-1 overflow-y-auto px-3 py-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:px-6 sm:py-7">
        <Card className="mx-auto max-w-3xl overflow-hidden border-border shadow-sm">
          <CardContent className="p-4 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge className="rounded-full border-transparent bg-primary/10 text-primary hover:bg-primary/10">
                {question.section}
              </Badge>
              <span className="text-xs font-medium text-muted-foreground">
                {question.section_position}/{question.section_total} dans ce thème
              </span>
            </div>

            <h1 className="mt-5 text-xl font-semibold leading-8 tracking-tight sm:text-2xl sm:leading-9">
              {question.prompt}
            </h1>

            <div className="mt-6 space-y-3" role="radiogroup" aria-label="Choix de réponse">
              {question.choices.map((choix, index) => {
                const choisi = selection === index;
                const bonne = correction?.correct_position === index;
                const mauvaiseChoisie = Boolean(correction && choisi && !bonne);
                return (
                  <button
                    key={`${question.id}-${index}`}
                    type="button"
                    role="radio"
                    aria-checked={choisi}
                    disabled={Boolean(correction) || repondre.isPending}
                    onClick={() => setSelection(index)}
                    className={cn(
                      'group flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-3 text-left text-sm leading-5 transition-all sm:px-4',
                      !correction && choisi && 'border-primary bg-primary/5 ring-2 ring-primary/15',
                      !correction && !choisi && 'border-border bg-background hover:border-primary/40 hover:bg-muted/30',
                      correction && bonne && 'border-emerald-500 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100',
                      mauvaiseChoisie && 'border-red-500 bg-red-50 text-red-950 dark:bg-red-950/40 dark:text-red-100',
                      correction && !bonne && !mauvaiseChoisie && 'border-border bg-muted/20 text-muted-foreground opacity-65',
                    )}
                  >
                    <span className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-xs font-semibold',
                      !correction && choisi && 'border-primary bg-primary text-primary-foreground',
                      !correction && !choisi && 'border-border bg-muted/40 text-muted-foreground',
                      correction && bonne && 'border-emerald-600 bg-emerald-600 text-white',
                      mauvaiseChoisie && 'border-red-600 bg-red-600 text-white',
                    )}>
                      {correction && bonne ? <Check className="h-4 w-4" /> : mauvaiseChoisie ? <X className="h-4 w-4" /> : LETTRES[index]}
                    </span>
                    <span className="flex-1 font-medium">{choix}</span>
                    {correction && bonne && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />}
                    {mauvaiseChoisie && <CircleX className="h-5 w-5 shrink-0 text-red-600" />}
                  </button>
                );
              })}
            </div>

            {correction && (
              <div
                role="status"
                className={cn(
                  'mt-5 rounded-xl border p-4',
                  correction.correct
                    ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30'
                    : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30',
                )}
              >
                <p className={cn(
                  'flex items-center gap-2 text-sm font-semibold',
                  correction.correct ? 'text-emerald-800 dark:text-emerald-200' : 'text-red-800 dark:text-red-200',
                )}>
                  {correction.correct ? <CheckCircle2 className="h-4 w-4" /> : <CircleX className="h-4 w-4" />}
                  {correction.correct ? 'Bonne réponse' : 'Réponse incorrecte'}
                </p>
                <div className="mt-3 flex items-start gap-2 text-sm leading-6 text-foreground/80">
                  <Lightbulb className="mt-1 h-4 w-4 shrink-0 text-amber-600" />
                  <p>{correction.explanation}</p>
                </div>
              </div>
            )}

            <div className="mt-6 flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground sm:justify-start">
                <ShieldCheck className="h-3.5 w-3.5" /> La correction est faite par le serveur
              </p>
              {correction ? (
                <Button className="min-h-12 rounded-full px-6" onClick={() => void suivant()} disabled={tentative.isFetching}>
                  {tentative.isFetching && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {correction.finished ? 'Voir mon résultat' : 'Question suivante'}
                  {!tentative.isFetching && <ChevronRight className="ml-2 h-4 w-4" />}
                </Button>
              ) : (
                <Button
                  className="min-h-12 rounded-full px-6"
                  disabled={selection == null || repondre.isPending}
                  onClick={() => selection != null && repondre.mutate(selection)}
                >
                  {repondre.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                  Valider ma réponse
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
