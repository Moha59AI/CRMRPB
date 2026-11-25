import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight, CheckCircle2, ClipboardCheck, GraduationCap, History,
  LockKeyhole, RotateCcw, ShieldCheck, Sparkles, Trophy,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { EtatErreur } from '@/components/EtatErreur';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/auth-context';
import { fetchTrainingCatalog, type TrainingQuizCatalogItem } from '@/services/training-service';

function dateCourte(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function CarteQuiz({ quiz }: { quiz: TrainingQuizCatalogItem }) {
  const navigate = useNavigate();
  const tentative = quiz.latest_attempt;
  const terminee = tentative?.status === 'completed';
  const enCours = tentative?.status === 'in_progress';
  const pourcentage = terminee && tentative.total > 0
    ? Math.round(((tentative.score ?? 0) / tentative.total) * 100)
    : 0;

  const ouvrir = (attemptId?: string) => {
    const suffixe = attemptId ? `?tentative=${encodeURIComponent(attemptId)}` : '';
    navigate(`/formation/${quiz.code}${suffixe}`);
  };

  return (
    <Card className="overflow-hidden border-border shadow-sm">
      <div className="h-1.5 bg-gradient-to-r from-emerald-500 via-lime-400 to-amber-400" />
      <CardHeader className="gap-4 p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ClipboardCheck className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <CardTitle className="text-lg">{quiz.title}</CardTitle>
                <Badge variant="outline" className="rounded-full font-normal">
                  {quiz.total} questions
                </Badge>
              </div>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                {quiz.description}
              </p>
            </div>
          </div>
          <Badge className="w-fit rounded-full border-transparent bg-emerald-50 text-emerald-700 hover:bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300">
            Validation à {quiz.pass_score}/{quiz.total}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-4 pt-0 sm:p-6 sm:pt-0">
        <div className="grid gap-2 sm:grid-cols-5">
          {quiz.sections.map((section, index) => (
            <div key={section} className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Partie {index + 1}
              </p>
              <p className="mt-1 text-xs font-medium leading-4 text-foreground">{section}</p>
            </div>
          ))}
        </div>

        {enCours && tentative ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900 dark:bg-amber-950/30">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
                  <History className="h-4 w-4" /> Quiz en cours
                </p>
                <p className="mt-1 text-xs text-amber-800/80 dark:text-amber-300/80">
                  Commencé le {dateCourte(tentative.started_at)}. Votre progression est conservée.
                </p>
              </div>
              <Button className="min-h-11 rounded-full" onClick={() => ouvrir(tentative.id)}>
                Reprendre <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : terminee && tentative ? (
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {tentative.passed ? (
                    <Badge className="rounded-full border-transparent bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-200">
                      <Trophy className="mr-1 h-3.5 w-3.5" /> Validé
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="rounded-full border-amber-300 text-amber-700 dark:text-amber-300">
                      À retravailler
                    </Badge>
                  )}
                  <span className="text-sm font-semibold tabular-nums">
                    {tentative.score}/{tentative.total} · {pourcentage} %
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {dateCourte(tentative.completed_at)}
                  </span>
                </div>
                <Progress value={pourcentage} className="h-2 max-w-xl" />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" className="min-h-11 rounded-full" onClick={() => ouvrir(tentative.id)}>
                  Voir le résultat
                </Button>
                <Button className="min-h-11 rounded-full" onClick={() => ouvrir()}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Repasser
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <Button className="min-h-11 w-full rounded-full sm:w-auto" onClick={() => ouvrir()}>
            Commencer le quiz <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function TrainingPage() {
  const navigate = useNavigate();
  const { profile, actorProfile, impersonation } = useAuth();
  const vueDeleguee = Boolean(impersonation || (
    profile?.id && actorProfile?.id && profile.id !== actorProfile.id
  ));

  const catalogue = useQuery({
    queryKey: ['training-catalog'],
    queryFn: fetchTrainingCatalog,
    enabled: !vueDeleguee,
    retry: false,
  });

  return (
    <div className="flex min-h-full flex-col bg-background">
      <PageHeader
        title="Formation"
        description="Validez les réflexes commerciaux essentiels du CRM"
        action={profile?.role === 'admin' && !vueDeleguee ? (
          <Button
            variant="outline"
            className="w-full rounded-full sm:w-auto"
            onClick={() => navigate('/formation/resultats')}
          >
            <History className="mr-2 h-4 w-4" /> Résultats de l’équipe
          </Button>
        ) : undefined}
      />

      <main className="flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6">
        <div className="mx-auto max-w-6xl space-y-5">
          <section className="relative overflow-hidden rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50 via-background to-lime-50 p-5 dark:border-emerald-900/70 dark:from-emerald-950/40 dark:via-background dark:to-lime-950/20 sm:p-7">
            <div className="absolute -right-10 -top-12 h-44 w-44 rounded-full bg-emerald-300/20 blur-3xl" />
            <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
                  <Sparkles className="h-4 w-4" /> Parcours commercial
                </p>
                <h2 className="mt-3 max-w-2xl text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                  Une mise en situation courte, basée sur le travail réel
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Une question par écran, une correction immédiate et un bilan par thème. Les choix changent d’ordre à chaque tentative.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 lg:w-[330px]">
                {[
                  ['20', 'questions'],
                  ['5', 'thèmes'],
                  ['16/20', 'requis'],
                ].map(([valeur, libelle]) => (
                  <div key={libelle} className="rounded-xl border border-white/70 bg-background/80 px-3 py-4 text-center shadow-sm backdrop-blur">
                    <p className="text-xl font-semibold tabular-nums">{valeur}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{libelle}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {vueDeleguee ? (
            <Alert className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
              <LockKeyhole className="h-4 w-4" />
              <AlertTitle>Quiz indisponible en mode « Voir comme »</AlertTitle>
              <AlertDescription>
                Revenez à votre propre compte. Latefa doit passer le quiz depuis sa session afin que le résultat lui soit attribué.
              </AlertDescription>
            </Alert>
          ) : catalogue.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-64 rounded-xl" />
            </div>
          ) : catalogue.isError ? (
            <EtatErreur
              titre="Formation indisponible"
              erreur={catalogue.error}
              onReessayer={() => void catalogue.refetch()}
              className="min-h-[300px] rounded-xl border border-dashed border-border"
            />
          ) : catalogue.data?.length ? (
            <div className="space-y-4">
              {catalogue.data.map((quiz) => <CarteQuiz key={quiz.code} quiz={quiz} />)}
            </div>
          ) : (
            <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 text-center">
              <GraduationCap className="h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm font-medium">Aucune formation disponible</p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              [ShieldCheck, 'Correction sécurisée', 'Les bonnes réponses restent sur le serveur jusqu’à votre choix.'],
              [CheckCircle2, 'Retour immédiat', 'Vous comprenez tout de suite pourquoi une réponse est juste ou fausse.'],
              [Trophy, 'Résultat traçable', 'Chaque tentative et le détail par thème sont enregistrés.'],
            ].map(([Icon, titre, texte]) => {
              const Icone = Icon as typeof ShieldCheck;
              return (
                <div key={String(titre)} className="rounded-xl border border-border bg-card p-4">
                  <Icone className="h-5 w-5 text-primary" />
                  <p className="mt-3 text-sm font-semibold">{String(titre)}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{String(texte)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
