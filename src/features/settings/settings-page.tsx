import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  RefreshCw, Users, Plug, Webhook, ArrowRight, ScrollText,
  Activity, Loader2, ShieldAlert,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/features/auth/auth-context';
import { fetchEtatSysteme, fetchJournalAudit } from '@/services/admin-service';
import { fetchProfiles } from '@/services/profiles-service';
import { roleLabels } from '@/config/roles';
import { cn } from '@/lib/utils';
import { CarteEtat } from './components/carte-etat';
import { SectionEntreprise } from './components/section-entreprise';
import { diagnostiquerMeta, diagnostiquerCron, niveauGlobal, formaterDuree } from './diagnostic';

const BANDEAU = {
  ok: { texte: 'Tout fonctionne', classe: 'bg-done-soft text-done border-done/20' },
  attention: { texte: 'À surveiller', classe: 'bg-due-soft text-due border-due/30' },
  probleme: { texte: 'Intervention requise', classe: 'bg-destructive/10 text-destructive border-destructive/30' },
  inactif: { texte: 'Pas encore de données', classe: 'bg-muted text-muted-foreground border-border' },
};

export function SettingsPage() {
  const { profile } = useAuth();
  const estAdmin = profile?.role === 'admin';

  // Un panneau de controle doit refleter l'etat courant sans qu'on y pense :
  // il se rafraichit seul, et le bouton sert quand on vient de corriger.
  const {
    data: etat, isLoading, isError, error, refetch, isFetching,
  } = useQuery({
    queryKey: ['etat-systeme'],
    queryFn: fetchEtatSysteme,
    enabled: estAdmin,
    refetchInterval: 60_000,
    retry: false,
  });

  const niveau = niveauGlobal(etat);
  const bandeau = BANDEAU[niveau];

  return (
    <>
      <PageHeader
        title="Panneau de contrôle"
        description={
          estAdmin
            ? "État du système, réglages et accès"
            : "Réglages de l'espace de travail"
        }
        action={
          estAdmin ? (
            <div className="flex items-center gap-3">
              {etat && (
                <span
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs font-medium',
                    bandeau.classe,
                  )}
                >
                  {bandeau.texte}
                </span>
              )}
              <Button
                variant="outline" size="sm" className="rounded-full"
                onClick={() => refetch()} disabled={isFetching}
              >
                <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', isFetching && 'animate-spin')} />
                Actualiser
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="overflow-y-auto p-6">
        <Tabs defaultValue={estAdmin ? 'etat' : 'entreprise'} className="space-y-6">
          <TabsList className="rounded-full">
            {estAdmin && <TabsTrigger value="etat" className="rounded-full">Vue d'ensemble</TabsTrigger>}
            <TabsTrigger value="entreprise" className="rounded-full">Entreprise</TabsTrigger>
            {estAdmin && <TabsTrigger value="journal" className="rounded-full">Journal</TabsTrigger>}
          </TabsList>

          {estAdmin && (
            <TabsContent value="etat" className="space-y-6">
              {isLoading && (
                <div className="grid gap-4 md:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-36 rounded-xl" />
                  ))}
                </div>
              )}

              {isError && (
                <Card className="rounded-xl border border-destructive/30">
                  <CardContent className="flex items-start gap-3 p-4">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        État du système indisponible
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {(error as Error)?.message}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Si le message mentionne une fonction absente, la migration
                        <code className="mx-1 rounded bg-muted px-1 py-0.5">
                          20260901100000_panneau_admin
                        </code>
                        n'a pas encore été appliquée.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {etat && (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <CarteEtat
                      sujet="Réception Meta"
                      constat={diagnostiquerMeta(etat.meta, etat.cron)}
                      lien="/settings/integrations/meta"
                      chiffres={[
                        { label: 'en attente', valeur: etat.meta.en_attente ?? 0 },
                        { label: 'en échec', valeur: etat.meta.en_erreur ?? 0 },
                        { label: 'traités', valeur: etat.meta.traites ?? 0 },
                      ]}
                    />

                    <CarteEtat
                      sujet="Traitement automatique"
                      constat={diagnostiquerCron(etat.cron)}
                      chiffres={[
                        { label: 'traités 24 h', valeur: etat.meta.traites_24h ?? 0 },
                        {
                          label: 'échecs 1 h',
                          valeur: etat.cron.echecs_recents ?? 0,
                        },
                        {
                          label: 'dernier lead',
                          valeur: etat.meta.dernier_recu
                            ? formaterDuree(Date.now() - new Date(etat.meta.dernier_recu).getTime())
                            : '—',
                        },
                      ]}
                    />
                  </div>

                  {/* Activité commerciale : le panneau sert aussi à voir si le
                      CRM est nourri, pas seulement s'il tourne. */}
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Compteur
                      label="Leads au total" valeur={etat.leads.total}
                      icone={<Activity className="h-4 w-4" />}
                    />
                    <Compteur
                      label="Reçus sous 24 h" valeur={etat.leads.recus_24h}
                      icone={<Activity className="h-4 w-4" />}
                    />
                    <Compteur
                      label="Jamais contactés" valeur={etat.leads.jamais_contactes}
                      accent={etat.leads.jamais_contactes > 0}
                      lien="/relances"
                      icone={<Activity className="h-4 w-4" />}
                    />
                    <Compteur
                      label="Convertis" valeur={etat.leads.convertis}
                      icone={<Activity className="h-4 w-4" />}
                    />
                  </div>

                  <Card className="rounded-xl border border-border">
                    <CardHeader>
                      <CardTitle className="text-sm">Administration</CardTitle>
                      <CardDescription className="text-xs">
                        {etat.equipe.membres} membre{etat.equipe.membres > 1 ? 's' : ''}
                        {etat.equipe.invitations_en_attente > 0 &&
                          ` · ${etat.equipe.invitations_en_attente} invitation${
                            etat.equipe.invitations_en_attente > 1 ? 's' : ''
                          } en attente`}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-3 sm:grid-cols-3">
                      <Raccourci
                        to="/settings/users" icone={<Users className="h-4 w-4" />}
                        titre="Utilisateurs"
                        detail={
                          etat.equipe.invitations_en_attente > 0
                            ? `${etat.equipe.invitations_en_attente} en attente`
                            : 'Inviter, changer un rôle'
                        }
                        signale={etat.equipe.invitations_en_attente > 0}
                      />
                      <Raccourci
                        to="/settings/integrations" icone={<Plug className="h-4 w-4" />}
                        titre="Intégrations"
                        detail={
                          etat.integrations.find((i) => i.statut === 'error')
                            ? 'Une connexion en erreur'
                            : `${etat.integrations.filter((i) => i.statut === 'connected').length} connectée(s)`
                        }
                        signale={etat.integrations.some((i) => i.statut === 'error')}
                      />
                      <Raccourci
                        to="/settings/webhooks" icone={<Webhook className="h-4 w-4" />}
                        titre="Webhooks"
                        detail="Endpoints entrants"
                      />
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>
          )}

          <TabsContent value="entreprise">
            <SectionEntreprise modifiable={estAdmin} />
          </TabsContent>

          {estAdmin && (
            <TabsContent value="journal">
              <JournalAudit />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </>
  );
}

function Compteur({
  label, valeur, icone, accent, lien,
}: {
  label: string; valeur: number; icone: React.ReactNode;
  accent?: boolean; lien?: string;
}) {
  const contenu = (
    <div
      className={cn(
        'rounded-xl border bg-card p-4 transition-colors',
        accent ? 'border-due/30' : 'border-border',
        lien && 'hover:border-primary/40',
      )}
    >
      <div className={cn('mb-2', accent ? 'text-due' : 'text-muted-foreground')}>{icone}</div>
      <p className="text-2xl font-semibold tabular-nums text-foreground">{valeur}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );

  return lien ? <Link to={lien}>{contenu}</Link> : contenu;
}

function Raccourci({
  to, icone, titre, detail, signale,
}: {
  to: string; icone: React.ReactNode; titre: string;
  detail: string; signale?: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors',
        signale ? 'border-due/30 bg-due-soft/40' : 'border-border',
        'hover:border-primary/40 hover:bg-muted/40',
      )}
    >
      <div className={cn('shrink-0', signale ? 'text-due' : 'text-muted-foreground')}>
        {icone}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{titre}</p>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </Link>
  );
}

const LIBELLES_ACTION: Record<string, string> = {
  role_modifie: 'Rôle modifié',
  acces_retire: 'Accès retiré',
  seed_demo_leads: 'Données de démonstration générées',
};

function JournalAudit() {
  const { data: entrees, isLoading } = useQuery({
    queryKey: ['journal-audit'],
    queryFn: () => fetchJournalAudit(30),
  });

  const { data: profils } = useQuery({ queryKey: ['profiles'], queryFn: fetchProfiles });

  const nomDe = (id: string | null) => {
    if (!id) return 'Système';
    const p = profils?.find((x) => x.id === id);
    if (!p) return 'Compte supprimé';
    return [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Sans nom';
  };

  return (
    <Card className="rounded-xl border border-border">
      <CardHeader className="flex flex-row items-start space-y-0">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/40">
            <ScrollText className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-sm">Journal d'administration</CardTitle>
            <CardDescription className="text-xs">
              Les actions sensibles, consignées en base. Visible des seuls administrateurs.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement…
          </div>
        )}

        {!isLoading && (!entrees || entrees.length === 0) && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Aucune action enregistrée pour le moment.
          </p>
        )}

        {entrees && entrees.length > 0 && (
          <div className="divide-y divide-border">
            {entrees.map((e) => (
              <div key={e.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-foreground">
                    {LIBELLES_ACTION[e.action] ?? e.action}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    par {nomDe(e.user_id)}
                    {e.metadata?.avant != null && e.metadata?.apres != null && (
                      <>
                        {' · '}
                        {roleLabels[e.metadata.avant as keyof typeof roleLabels] ??
                          String(e.metadata.avant)}
                        {' → '}
                        {roleLabels[e.metadata.apres as keyof typeof roleLabels] ??
                          String(e.metadata.apres)}
                      </>
                    )}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="shrink-0 rounded-full text-[10px] font-normal text-muted-foreground"
                >
                  {new Date(e.created_at).toLocaleString('fr-FR', {
                    day: '2-digit', month: '2-digit',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
