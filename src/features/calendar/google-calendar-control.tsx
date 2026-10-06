import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CalendarClock, CheckCircle2, ExternalLink, Link2, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/features/auth/auth-context';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  fetchGoogleCalendarStatus, setGoogleCalendarImportAll, startGoogleCalendarOAuth, syncGoogleCalendar,
} from './google-calendar-service';
import { interpreterErreurGoogle } from './erreur-google';

export function GoogleCalendarControl({ onSynced }: { onSynced: () => void }) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const status = useQuery({
    queryKey: ['google-calendar-status'],
    queryFn: fetchGoogleCalendarStatus,
    enabled: profile?.role === 'admin',
  });

  const sync = useMutation({
    mutationFn: syncGoogleCalendar,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['google-calendar-status'] });
      onSynced();
      toast.success('Google Agenda synchronisé', {
        description: [
          `${result.created} envoyé(s) à Google`,
          result.imported ? `${result.imported} repris depuis Google` : null,
          `${result.updatedInGoogle + result.updatedInCrm} mis à jour`,
        ].filter(Boolean).join(', '),
      });
    },
    onError: (error) => toast.error('Synchronisation Google Agenda impossible', {
      description: error instanceof Error ? error.message : String(error),
    }),
  });

  const synchronize = useCallback(() => sync.mutate(), [sync]);

  const importAll = useMutation({
    mutationFn: setGoogleCalendarImportAll,
    onSuccess: async (_, enabled) => {
      await queryClient.invalidateQueries({ queryKey: ['google-calendar-status'] });
      toast.success(enabled
        ? 'Les rendez-vous créés dans Google seront repris à la prochaine synchronisation'
        : 'Seuls les rendez-vous créés dans le CRM seront synchronisés');
    },
    onError: (error) => toast.error('Réglage non enregistré', {
      description: error instanceof Error ? error.message : String(error),
    }),
  });

  useEffect(() => {
    const receiveOAuth = (event: MessageEvent) => {
      if (event.data?.type !== 'google-ads-oauth') return;
      setAuthorizing(false);
      if (!event.data.success) return;
      void queryClient.invalidateQueries({ queryKey: ['google-calendar-status'] });
      toast.success('Google Agenda autorisé');
      synchronize();
    };
    window.addEventListener('message', receiveOAuth);
    return () => window.removeEventListener('message', receiveOAuth);
  }, [queryClient, synchronize]);

  if (profile?.role !== 'admin') return null;

  const value = status.data;

  async function authorize() {
    const popup = window.open('', 'google-calendar-oauth', 'width=560,height=720');
    if (!popup) {
      toast.error('Autorisez les fenêtres surgissantes pour connecter Google Agenda');
      return;
    }
    setAuthorizing(true);
    try {
      const { authUrl } = await startGoogleCalendarOAuth();
      popup.location.href = authUrl;
    } catch (error) {
      popup.close();
      setAuthorizing(false);
      toast.error(error instanceof Error ? error.message : 'Connexion Google impossible');
    }
  }

  return (
    <>
      <Button variant="outline" className="relative rounded-full gap-1.5" onClick={() => setOpen(true)}>
        <CalendarClock className="h-4 w-4" />
        Google Agenda
        {value?.authorized && (
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-success" />
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Google Agenda</DialogTitle>
            <DialogDescription>
              {status.data?.importAll
                ? 'Les rendez-vous circulent dans les deux sens : ceux du CRM vont dans votre agenda, ceux créés dans Google apparaissent dans le CRM.'
                : 'Les rendez-vous CRM sont copiés dans votre agenda. Seuls ces événements sont relus : vos rendez-vous personnels restent privés.'}
            </DialogDescription>
          </DialogHeader>

          {status.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : status.isError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Connexion indisponible</AlertTitle>
              <AlertDescription>{(status.error as Error).message}</AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{value?.calendarName || 'Agenda principal Google'}</p>
                    {/* Le compte est l'information qui manque le plus : avec
                        plusieurs comptes Google, on cherche ses rendez-vous
                        dans le mauvais agenda et on croit que rien ne part. */}
                    {value?.accountEmail ? (
                      <p className="mt-0.5 truncate text-xs text-foreground">
                        Compte : <span className="font-medium">{value.accountEmail}</span>
                      </p>
                    ) : value?.authorized ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Compte connu après la première synchronisation
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {value?.lastSyncedAt
                        ? `Dernière synchronisation : ${new Date(value.lastSyncedAt).toLocaleString('fr-FR')}`
                        : 'Pas encore synchronisé'}
                    </p>
                  </div>
                  <Badge variant="secondary" className={value?.authorized ? 'bg-success/10 text-success' : ''}>
                    {value?.authorized ? 'Connecté' : 'À connecter'}
                  </Badge>
                </div>
              </div>

              {value?.lastError && (() => {
                // Le message brut de Google, en anglais et sans lien cliquable,
                // se lit comme « ca ne marche pas » sous un badge « Connecte ».
                // La plupart de ces erreurs se reglent en un clic, hors du CRM.
                const erreur = interpreterErreurGoogle(value.lastError);
                return (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>{erreur.titre}</AlertTitle>
                    <AlertDescription className="space-y-2">
                      <p>{erreur.explication}</p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {erreur.lien && (
                          <Button asChild size="sm" variant="outline" className="h-8 rounded-full bg-background">
                            <a href={erreur.lien.url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />{erreur.lien.label}
                            </a>
                          </Button>
                        )}
                        {erreur.suite === 'synchroniser' && (
                          <Button size="sm" variant="outline" className="h-8 rounded-full bg-background"
                            onClick={() => sync.mutate()} disabled={sync.isPending}>
                            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${sync.isPending ? 'animate-spin' : ''}`} />
                            Réessayer la synchronisation
                          </Button>
                        )}
                        {erreur.suite === 'reautoriser' && (
                          <Button size="sm" variant="outline" className="h-8 rounded-full bg-background"
                            onClick={authorize} disabled={authorizing}>
                            <Link2 className="mr-1.5 h-3.5 w-3.5" />Renouveler l’autorisation
                          </Button>
                        )}
                      </div>
                      {erreur.explication !== erreur.brut && (
                        <details className="pt-1 text-xs opacity-80">
                          <summary className="cursor-pointer">Message d’origine</summary>
                          <p className="mt-1 break-words">{erreur.brut}</p>
                        </details>
                      )}
                    </AlertDescription>
                  </Alert>
                );
              })()}

              {!value?.configured && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Identifiants Google requis</AlertTitle>
                  <AlertDescription>Configurez d'abord l'accès Google dans Réglages → Intégrations → Google Ads.</AlertDescription>
                </Alert>
              )}

              {value?.authorized && (
                <div className="flex items-start justify-between gap-4 rounded-xl border border-border p-4">
                  <div className="min-w-0">
                    <Label htmlFor="google-import-all" className="text-sm font-medium">
                      Reprendre les rendez-vous créés dans Google
                    </Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Tout événement de cet agenda, y compris un rendez-vous synchronisé depuis
                      Onify, apparaît dans le CRM. Si le client est reconnu, sa fiche passe
                      automatiquement à « RDV pris ». Les événements « journée entière » sont ignorés.
                    </p>
                  </div>
                  <Switch
                    id="google-import-all"
                    checked={value.importAll}
                    disabled={importAll.isPending}
                    onCheckedChange={(enabled) => importAll.mutate(enabled)}
                  />
                </div>
              )}

              <Separator />
              <div className="flex flex-wrap gap-2">
                <Button onClick={authorize} disabled={!value?.configured || authorizing} className="rounded-full">
                  {authorizing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : value?.authorized ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <Link2 className="mr-2 h-4 w-4" />}
                  {value?.authorized ? 'Renouveler l’autorisation' : 'Connecter Google'}
                </Button>
                <Button variant="outline" onClick={() => sync.mutate()} disabled={!value?.authorized || sync.isPending} className="rounded-full">
                  <RefreshCw className={`mr-2 h-4 w-4 ${sync.isPending ? 'animate-spin' : ''}`} />
                  Synchroniser
                </Button>
                {value?.authorized && (
                  <Button asChild variant="ghost" size="icon" className="rounded-full">
                    {/* `authuser` ouvre l'agenda du compte autorise, pas celui
                        du premier compte connecte dans le navigateur. */}
                    <a
                      href={value?.accountEmail
                        ? `https://calendar.google.com/calendar/u/0/r?authuser=${encodeURIComponent(value.accountEmail)}`
                        : 'https://calendar.google.com/calendar/u/0/r'}
                      target="_blank" rel="noopener noreferrer" aria-label="Ouvrir Google Agenda">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
