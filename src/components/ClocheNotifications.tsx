import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Bell,
  BellOff,
  BellRing,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileCheck2,
  Inbox,
  Loader2,
  Mail,
  RefreshCw,
  Smartphone,
  Sparkles,
  UserRoundPlus,
  Volume2,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/auth-context';
import {
  compterNonLues,
  ecouterNotifications,
  fetchNotifications,
  marquerLue,
  marquerToutesLues,
} from '@/services/notifications-service';
import type { Notification } from '@/types';
import {
  afficherAlerte,
  demanderAlertes,
  etatAlertes,
  testerAlertes,
  verifierAlertes,
  type EtatAlertes,
} from '@/lib/alertes';

const CLE_NOTIFICATIONS = ['notifications'] as const;
const CLE_COMPTEUR = ['notifications-unread-count'] as const;

type FiltreNotification = 'toutes' | 'non_lues' | 'leads' | 'actions' | 'messages';
type CategorieNotification = Exclude<FiltreNotification, 'toutes' | 'non_lues'>;

interface ApparenceNotification {
  categorie: CategorieNotification;
  etiquette: string;
  Icone: LucideIcon;
  classeIcone: string;
}

const APPARENCE_PAR_TYPE: Record<string, ApparenceNotification> = {
  lead: {
    categorie: 'leads',
    etiquette: 'Lead',
    Icone: UserRoundPlus,
    classeIcone: 'bg-primary/10 text-primary',
  },
  documents_received: {
    categorie: 'messages',
    etiquette: 'Documents',
    Icone: FileCheck2,
    classeIcone: 'bg-done-soft text-done',
  },
  email_received: {
    categorie: 'messages',
    etiquette: 'Email',
    Icone: Mail,
    classeIcone: 'bg-upcoming-soft text-upcoming',
  },
  ai: {
    categorie: 'actions',
    etiquette: 'Copilote',
    Icone: Sparkles,
    classeIcone: 'bg-due-soft text-due',
  },
  workflow: {
    categorie: 'actions',
    etiquette: 'À traiter',
    Icone: Clock3,
    classeIcone: 'bg-urgent-soft text-urgent',
  },
};

const APPARENCE_DEFAUT: ApparenceNotification = {
  categorie: 'actions',
  etiquette: 'Information',
  Icone: Bell,
  classeIcone: 'bg-muted text-muted-foreground',
};

const FILTRES: Array<{ id: FiltreNotification; label: string }> = [
  { id: 'toutes', label: 'Toutes' },
  { id: 'non_lues', label: 'Non lues' },
  { id: 'leads', label: 'Leads' },
  { id: 'actions', label: 'À traiter' },
  { id: 'messages', label: 'Messages' },
];

function apparenceNotification(notification: Notification): ApparenceNotification {
  return APPARENCE_PAR_TYPE[notification.type] ?? APPARENCE_DEFAUT;
}

function ilYA(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.floor(h / 24);
  if (j === 1) return 'hier';
  if (j < 7) return `il y a ${j} jours`;
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(new Date(iso));
}

function groupeDate(iso: string): string {
  const date = new Date(iso);
  const aujourdHui = new Date();
  const debutAujourdhui = new Date(
    aujourdHui.getFullYear(),
    aujourdHui.getMonth(),
    aujourdHui.getDate(),
  );
  const debutDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const jours = Math.round((debutAujourdhui.getTime() - debutDate.getTime()) / 86_400_000);

  if (jours <= 0) return "Aujourd'hui";
  if (jours === 1) return 'Hier';
  if (jours <= 7) return '7 derniers jours';
  return 'Plus anciennes';
}

function filtrerNotifications(
  notifications: Notification[],
  filtre: FiltreNotification,
): Notification[] {
  if (filtre === 'toutes') return notifications;
  if (filtre === 'non_lues') return notifications.filter((notification) => !notification.read);
  return notifications.filter(
    (notification) => apparenceNotification(notification).categorie === filtre,
  );
}

/**
 * Centre de notifications commun au telephone et a l'ordinateur.
 *
 * AppLayout ne monte qu'une instance a la fois. C'est important : deux
 * cloches masquees par CSS ouvriraient deux abonnements Realtime et feraient
 * deux fois le meme travail a chaque nouvelle alerte.
 */
export function ClocheNotifications({
  reduit,
  mobile = false,
}: {
  reduit?: boolean;
  mobile?: boolean;
}) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [ouvert, setOuvert] = useState(false);
  const [filtre, setFiltre] = useState<FiltreNotification>('toutes');
  const [marquageGlobal, setMarquageGlobal] = useState(false);
  const [alertes, setAlertes] = useState<EtatAlertes>(() => etatAlertes());

  useEffect(() => {
    if (!profile?.id) return;
    verifierAlertes().then(setAlertes);
  }, [profile?.id]);

  const [arrivees, setArrivees] = useState(0);
  const idsALOuverture = useRef<Set<string>>(new Set());

  const {
    data: notifications = [],
    isLoading: notificationsEnChargement,
    isError: notificationsEnErreur,
    refetch: rechargerNotifications,
  } = useQuery({
    queryKey: CLE_NOTIFICATIONS,
    queryFn: () => fetchNotifications(50),
    enabled: !!profile?.id,
  });

  const {
    data: nonLues,
    refetch: rechargerCompteur,
  } = useQuery({
    queryKey: CLE_COMPTEUR,
    queryFn: compterNonLues,
    enabled: !!profile?.id,
  });

  const minuteurRafraichissement = useRef<number | null>(null);

  useEffect(() => {
    if (!profile?.id) return;

    const desabonner = ecouterNotifications(profile.id, (notification) => {
      queryClient.setQueryData<Notification[]>(CLE_NOTIFICATIONS, (actuelles = []) => {
        if (actuelles.some((actuelle) => actuelle.id === notification.id)) return actuelles;
        return [notification, ...actuelles].slice(0, 50);
      });
      if (!notification.read) {
        queryClient.setQueryData<number>(CLE_COMPTEUR, (compte = 0) => compte + 1);
      }

      if (minuteurRafraichissement.current !== null) {
        window.clearTimeout(minuteurRafraichissement.current);
      }
      minuteurRafraichissement.current = window.setTimeout(() => {
        minuteurRafraichissement.current = null;
        queryClient.invalidateQueries({ queryKey: CLE_NOTIFICATIONS });
        queryClient.invalidateQueries({ queryKey: CLE_COMPTEUR });
        queryClient.invalidateQueries({ queryKey: ['leads'] });
        queryClient.invalidateQueries({ queryKey: ['relances'] });
      }, 800);

      setArrivees((valeur) => valeur + 1);

      // Un appareil correctement inscrit recoit deja le push serveur. Cette
      // alerte Realtime ne sert que de secours si l'inscription a echoue.
      if (document.visibilityState !== 'visible' && alertes !== 'autorisee') {
        afficherAlerte({
          titre: notification.title,
          corps: notification.body,
          lien: notification.link,
          etiquette: notification.id,
        });
      }
    });

    return () => {
      desabonner();
      if (minuteurRafraichissement.current !== null) {
        window.clearTimeout(minuteurRafraichissement.current);
      }
    };
  }, [profile?.id, queryClient, alertes]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const auMessage = (e: MessageEvent) => {
      if (e.data?.type === 'naviguer' && typeof e.data.lien === 'string') {
        navigate(e.data.lien);
      }
    };

    navigator.serviceWorker.addEventListener('message', auMessage);
    return () => navigator.serviceWorker.removeEventListener('message', auMessage);
  }, [navigate]);

  const compte = nonLues ?? notifications.filter((notification) => !notification.read).length;
  const notificationsVisibles = useMemo(
    () => filtrerNotifications(notifications, filtre),
    [notifications, filtre],
  );
  const groupes = useMemo(() => {
    const resultat = new Map<string, Notification[]>();
    for (const notification of notificationsVisibles) {
      const groupe = groupeDate(notification.created_at);
      resultat.set(groupe, [...(resultat.get(groupe) ?? []), notification]);
    }
    return [...resultat.entries()];
  }, [notificationsVisibles]);

  const mettreAJourLocalement = (id: string): (() => void) => {
    const listeAvant = queryClient.getQueryData<Notification[]>(CLE_NOTIFICATIONS);
    const compteurAvant = queryClient.getQueryData<number>(CLE_COMPTEUR);
    const etaitNonLue = listeAvant?.some((notification) => notification.id === id && !notification.read);

    queryClient.setQueryData<Notification[]>(CLE_NOTIFICATIONS, (actuelles = []) =>
      actuelles.map((notification) => (
        notification.id === id ? { ...notification, read: true } : notification
      )),
    );
    if (etaitNonLue) {
      queryClient.setQueryData<number>(CLE_COMPTEUR, (actuel = 0) => Math.max(0, actuel - 1));
    }

    return () => {
      queryClient.setQueryData(CLE_NOTIFICATIONS, listeAvant);
      queryClient.setQueryData(CLE_COMPTEUR, compteurAvant);
    };
  };

  const marquerNotification = async (notification: Notification) => {
    if (notification.read) return;
    const annuler = mettreAJourLocalement(notification.id);
    try {
      await marquerLue(notification.id);
    } catch (error) {
      annuler();
      toast.error('Notification non modifiée', {
        description: error instanceof Error ? error.message : 'Veuillez réessayer.',
      });
    }
  };

  const ouvrirNotification = (notification: Notification) => {
    void marquerNotification(notification);
    setOuvert(false);
    if (notification.link) navigate(notification.link);
  };

  const toutMarquer = async () => {
    const listeAvant = queryClient.getQueryData<Notification[]>(CLE_NOTIFICATIONS);
    const compteurAvant = queryClient.getQueryData<number>(CLE_COMPTEUR);
    setMarquageGlobal(true);
    queryClient.setQueryData<Notification[]>(CLE_NOTIFICATIONS, (actuelles = []) =>
      actuelles.map((notification) => ({ ...notification, read: true })),
    );
    queryClient.setQueryData(CLE_COMPTEUR, 0);

    try {
      await marquerToutesLues();
    } catch (error) {
      queryClient.setQueryData(CLE_NOTIFICATIONS, listeAvant);
      queryClient.setQueryData(CLE_COMPTEUR, compteurAvant);
      toast.error('Les notifications n’ont pas été modifiées', {
        description: error instanceof Error ? error.message : 'Veuillez réessayer.',
      });
    } finally {
      setMarquageGlobal(false);
    }
  };

  const recharger = () => {
    void Promise.all([rechargerNotifications(), rechargerCompteur()]);
  };

  return (
    <Popover
      open={ouvert}
      onOpenChange={(prochainEtat) => {
        if (prochainEtat) {
          idsALOuverture.current = new Set(notifications.map((notification) => notification.id));
        }
        setOuvert(prochainEtat);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            'relative rounded-lg text-muted-foreground hover:text-foreground',
            reduit ? 'h-11 w-full p-0 md:h-9' : 'h-11 w-full justify-start gap-3 px-3 md:h-9',
          )}
          aria-label={compte > 0 ? `${compte} notification(s) non lue(s)` : 'Notifications'}
        >
          <span
            key={arrivees}
            className={cn('inline-flex shrink-0', arrivees > 0 && 'animate-sonnerie')}
          >
            {compte > 0 ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
          </span>
          {!reduit && <span className="text-sm">Notifications</span>}
          <span className="sr-only" aria-live="polite">
            {compte > 0 ? `${compte} notification(s) à consulter` : 'Aucune notification non lue'}
          </span>

          {arrivees > 0 && (
            <span
              key={`onde-${arrivees}`}
              aria-hidden="true"
              className={cn(
                'animate-onde pointer-events-none absolute h-4 w-4 rounded-full bg-primary',
                reduit ? 'right-1 top-1' : 'right-2 top-1.5',
              )}
            />
          )}

          {compte > 0 && (
            <span
              key={`compte-${compte}`}
              className={cn(
                'animate-pastille absolute flex h-4 min-w-4 items-center justify-center rounded-full',
                'bg-primary px-1 text-[10px] font-semibold text-primary-foreground',
                reduit ? 'right-1 top-1' : 'right-2 top-1.5',
              )}
            >
              {compte > 99 ? '99+' : compte}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align={mobile ? 'end' : 'start'}
        side={mobile ? 'bottom' : 'right'}
        sideOffset={mobile ? 8 : 6}
        className="w-[calc(100vw-1rem)] max-w-[26rem] overflow-hidden rounded-xl p-0 shadow-lg sm:w-[26rem]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Centre de notifications</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {compte > 0 ? `${compte} à consulter` : 'Vous êtes à jour'}
            </p>
          </div>
          {compte > 0 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={marquageGlobal}
              onClick={() => void toutMarquer()}
              className="h-8 shrink-0 rounded-full px-2.5 text-xs"
            >
              {marquageGlobal
                ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                : <Check className="mr-1.5 h-3.5 w-3.5" />}
              Tout lire
            </Button>
          )}
        </div>

        <BandeauAlertes etat={alertes} onChange={setAlertes} />

        <div className="border-b border-border px-3 py-2">
          <div className="scrollbar-thin flex gap-1 overflow-x-auto pb-0.5" aria-label="Filtrer les notifications">
            {FILTRES.map((option) => {
              const active = filtre === option.id;
              const nombre = option.id === 'non_lues' ? compte : null;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFiltre(option.id)}
                  className={cn(
                    'flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors',
                    active
                      ? 'bg-secondary text-secondary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {option.label}
                  {nombre !== null && nombre > 0 && (
                    <span className={cn(
                      'min-w-4 rounded-full px-1 text-[10px] tabular-nums',
                      active ? 'bg-background/80 text-foreground' : 'bg-primary/10 text-primary',
                    )}>
                      {nombre}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="max-h-[min(31rem,calc(100dvh-13rem))] overflow-y-auto overscroll-contain">
          {notificationsEnChargement && <ChargementNotifications />}

          {notificationsEnErreur && !notificationsEnChargement && (
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <CircleAlert className="mb-2 h-6 w-6 text-destructive" />
              <p className="text-sm font-medium text-foreground">Chargement impossible</p>
              <p className="mt-1 text-xs text-muted-foreground">Vos alertes restent conservées.</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-4 rounded-full"
                onClick={recharger}
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Réessayer
              </Button>
            </div>
          )}

          {!notificationsEnChargement && !notificationsEnErreur && groupes.length === 0 && (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <Inbox className="h-5 w-5 text-muted-foreground" />
              </span>
              <p className="text-sm font-medium text-foreground">
                {filtre === 'non_lues' ? 'Tout est traité' : 'Aucune notification'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {filtre === 'non_lues'
                  ? 'Les prochaines alertes apparaîtront ici.'
                  : 'Aucun élément ne correspond à ce filtre.'}
              </p>
            </div>
          )}

          {!notificationsEnChargement && !notificationsEnErreur && groupes.map(([groupe, elements]) => (
            <section key={groupe} aria-labelledby={`groupe-${groupe.replace(/\s+/g, '-').toLowerCase()}`}>
              <div className="sticky top-0 z-10 border-b border-border/70 bg-popover/95 px-4 py-1.5 backdrop-blur">
                <p
                  id={`groupe-${groupe.replace(/\s+/g, '-').toLowerCase()}`}
                  className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  {groupe}
                </p>
              </div>
              {elements.map((notification) => (
                <NotificationLigne
                  key={notification.id}
                  notification={notification}
                  nouvelle={!idsALOuverture.current.has(notification.id)}
                  onOuvrir={ouvrirNotification}
                />
              ))}
            </section>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NotificationLigne({
  notification,
  nouvelle,
  onOuvrir,
}: {
  notification: Notification;
  nouvelle: boolean;
  onOuvrir: (notification: Notification) => void;
}) {
  const apparence = apparenceNotification(notification);
  const Icone = apparence.Icone;

  return (
    <button
      type="button"
      onClick={() => onOuvrir(notification)}
      className={cn(
        'group flex w-full items-start gap-3 border-b border-border/70 px-4 py-3 text-left transition-colors last:border-b-0',
        'hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        !notification.read && 'bg-primary/[0.045]',
        nouvelle && 'animate-entree-notification',
      )}
    >
      <span className={cn(
        'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
        apparence.classeIcone,
      )}>
        <Icone className="h-4 w-4" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={cn(
            'min-w-0 flex-1 text-sm leading-5',
            notification.read ? 'text-muted-foreground' : 'font-semibold text-foreground',
          )}>
            {notification.title}
          </span>
          {!notification.read && (
            <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Non lue" />
          )}
        </span>
        {notification.body && (
          <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">
            {notification.body}
          </span>
        )}
        <span className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
          <span>{apparence.etiquette}</span>
          <span aria-hidden="true">•</span>
          <time dateTime={notification.created_at}>{ilYA(notification.created_at)}</time>
        </span>
      </span>

      {notification.link && (
        <ChevronRight className="mt-3 h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
      )}
    </button>
  );
}

function ChargementNotifications() {
  return (
    <div className="space-y-1 p-3" aria-label="Chargement des notifications">
      {[0, 1, 2].map((index) => (
        <div key={index} className="flex items-start gap-3 rounded-lg p-2">
          <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2 py-0.5">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-2.5 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

function BandeauAlertes({
  etat,
  onChange,
}: {
  etat: EtatAlertes;
  onChange: (etat: EtatAlertes) => void;
}) {
  if (etat === 'indisponible') return null;

  if (etat === 'installation_requise') {
    return (
      <div className="flex items-start gap-2 border-b border-border bg-muted/50 px-4 py-2.5">
        <Smartphone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <p className="text-xs leading-snug text-muted-foreground">
          Sur iPhone, ajoutez d’abord le CRM à l’écran d’accueil, ouvrez-le
          depuis son icône puis activez les notifications ici.
        </p>
      </div>
    );
  }

  if (etat === 'activation') {
    return (
      <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-2.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Vérification de cet appareil…
      </div>
    );
  }

  if (etat === 'autorisee') {
    return (
      <div className="flex items-center justify-between gap-2 border-b border-border bg-done-soft/40 px-4 py-2.5">
        <span className="flex items-center gap-1.5 text-xs text-done">
          <Volume2 className="h-3.5 w-3.5" />
          Alertes actives sur cet appareil
        </span>
        <button
          type="button"
          className="text-xs font-medium text-muted-foreground hover:text-foreground"
          onClick={async () => {
            if (!(await testerAlertes())) onChange('erreur');
          }}
        >
          Tester
        </button>
      </div>
    );
  }

  if (etat === 'refusee') {
    return (
      <div className="flex items-start gap-2 border-b border-border bg-muted/50 px-4 py-2.5">
        <BellOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <p className="text-xs leading-snug text-muted-foreground">
          Alertes bloquées par le navigateur. Réactivez-les depuis l’icône à
          gauche de l’adresse du site.
        </p>
      </div>
    );
  }

  if (etat === 'erreur') {
    return (
      <div className="flex items-center justify-between gap-2 border-b border-border bg-destructive/5 px-4 py-2.5">
        <span className="text-xs text-destructive">Activation incomplète sur cet appareil</span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 rounded-full text-xs"
          onClick={async () => {
            onChange('activation');
            onChange(await demanderAlertes());
          }}
        >
          Réessayer
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/50 px-4 py-2.5">
      <span className="text-xs text-muted-foreground">
        Être alerté même quand le CRM est fermé
      </span>
      <Button
        size="sm"
        className="h-7 rounded-full text-xs"
        onClick={async () => {
          onChange('activation');
          onChange(await demanderAlertes());
        }}
      >
        Activer
      </Button>
    </div>
  );
}
