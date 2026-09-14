import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Bell, BellRing, Check, TrendingUp, BellOff, Volume2, Loader2, Smartphone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/auth-context';
import {
  fetchNotifications, compterNonLues, marquerLue, marquerToutesLues,
  ecouterNotifications,
} from '@/services/notifications-service';
import type { Notification } from '@/types';
import {
  etatAlertes, demanderAlertes, afficherAlerte, testerAlertes, verifierAlertes,
  type EtatAlertes,
} from '@/lib/alertes';

/**
 * Cloche des notifications.
 *
 * L'arrivée se fait en temps réel : une notification qui n'apparaîtrait qu'au
 * rechargement n'est pas une notification, c'est une liste.
 *
 * Quand le navigateur l'autorise, une alerte système double l'affichage — un
 * conseiller qui a le CRM dans un onglet en arrière-plan ne verrait jamais la
 * pastille. La permission n'est demandée qu'au premier clic sur la cloche :
 * la réclamer au chargement fait refuser par réflexe.
 */

function ilYA(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.floor(h / 24);
  return j === 1 ? 'hier' : `il y a ${j} jours`;
}

export function ClocheNotifications({ reduit }: { reduit?: boolean }) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [ouvert, setOuvert] = useState(false);
  const [alertes, setAlertes] = useState<EtatAlertes>(() => etatAlertes());

  useEffect(() => {
    if (!profile?.id) return;
    verifierAlertes().then(setAlertes);
  }, [profile?.id]);

  /*
   * Nombre d'arrivées depuis le chargement.
   *
   * Ce n'est pas une donnée affichée : il sert de clé React. Une animation
   * CSS ne rejoue pas si la classe est déjà posée — deux leads coup sur coup
   * ne feraient sonner la cloche qu'une fois. En changeant de clé, l'élément
   * est remonté et le mouvement repart à zéro.
   */
  const [arrivees, setArrivees] = useState(0);

  /* Ce que le panneau contenait à son ouverture : le reste vient d'arriver. */
  const idsALOuverture = useRef<Set<string>>(new Set());

  const { data: notifications } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetchNotifications(),
    enabled: !!profile?.id,
  });

  const { data: nonLues } = useQuery({
    queryKey: ['notifications-non-lues'],
    queryFn: compterNonLues,
    enabled: !!profile?.id,
  });

  /*
   * Temps reel : le serveur pousse, on ne sonde pas.
   *
   * Les invalidations sont regroupees. La file Meta traite vingt-cinq leads
   * par lot : sans ce delai, vingt-cinq notifications arrivees en quelques
   * secondes declenchaient une centaine de rechargements simultanes, et
   * l'interface se figeait le temps qu'ils passent.
   */
  const minuteurRafraichissement = useRef<number | null>(null);

  useEffect(() => {
    if (!profile?.id) return;

    const desabonner = ecouterNotifications(profile.id, (n) => {
      if (minuteurRafraichissement.current !== null) {
        window.clearTimeout(minuteurRafraichissement.current);
      }
      minuteurRafraichissement.current = window.setTimeout(() => {
        minuteurRafraichissement.current = null;
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        queryClient.invalidateQueries({ queryKey: ['notifications-non-lues'] });
        // Un nouveau lead change aussi les listes ouvertes derriere.
        queryClient.invalidateQueries({ queryKey: ['leads'] });
        queryClient.invalidateQueries({ queryKey: ['relances'] });
      }, 800);

      // Le mouvement part tout de suite, sans attendre le regroupement des
      // rechargements : sonner une seconde apres l'arrivee donnerait
      // l'impression que le CRM traine.
      setArrivees((v) => v + 1);

      // L'onglet est au premier plan : la pastille suffit, une alerte
      // par-dessus serait redondante.
      if (document.visibilityState !== 'visible' && alertes !== 'autorisee') {
        afficherAlerte({
          titre: n.title, corps: n.body, lien: n.link, etiquette: n.id,
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

  // Le clic sur une alerte systeme demande au service worker de reveiller
  // l'onglet ; c'est lui qui nous transmet la destination. Naviguer par le
  // routeur plutot que recharger evite de perdre l'ecran en cours.
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

  const compte = nonLues ?? 0;

  const ouvrir = (n: Notification) => {
    setOuvert(false);
    if (!n.read) {
      marquerLue(n.id).then(() => {
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        queryClient.invalidateQueries({ queryKey: ['notifications-non-lues'] });
      });
    }
    if (n.link) navigate(n.link);
  };

  const toutMarquer = async () => {
    await marquerToutesLues();
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    queryClient.invalidateQueries({ queryKey: ['notifications-non-lues'] });
  };

  return (
    <Popover
      open={ouvert}
      onOpenChange={(o) => {
        // Fige avant le rendu du panneau : ce qui est deja la ne doit pas
        // s'animer comme si ca venait d'arriver.
        if (o) idsALOuverture.current = new Set((notifications ?? []).map((x) => x.id));
        setOuvert(o);
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
          {/* La cle remonte l'element a chaque arrivee, ce qui rejoue la
              sonnerie. Au premier rendu il n'y a rien a annoncer. */}
          <span
            key={arrivees}
            className={cn('inline-flex shrink-0', arrivees > 0 && 'animate-sonnerie')}
          >
            {compte > 0 ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
          </span>
          {!reduit && <span className="text-sm">Notifications</span>}

          {/* L'onde ne depend pas du compteur : celui-ci n'arrive qu'apres le
              regroupement des rechargements, soit presque une seconde plus
              tard, et l'onde serait partie sans avoir rien accompagne. */}
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
              {compte > 9 ? '9+' : compte}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" side="right" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-sm font-semibold text-foreground">Notifications</p>
          {compte > 0 && (
            <button
              type="button"
              onClick={toutMarquer}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Check className="h-3 w-3" />
              Tout marquer comme lu
            </button>
          )}
        </div>

        <BandeauAlertes etat={alertes} onChange={setAlertes} />

        <div className="max-h-96 overflow-y-auto">
          {(!notifications || notifications.length === 0) && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Aucune notification.
            </p>
          )}

          {notifications?.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => ouvrir(n)}
              className={cn(
                'flex w-full items-start gap-2.5 border-b border-border px-3 py-2.5 text-left last:border-b-0',
                'hover:bg-muted/50',
                !n.read && 'bg-primary/5',
                // Arrivee sous les yeux, panneau deja ouvert.
                !idsALOuverture.current.has(n.id) && 'animate-entree-notification',
              )}
            >
              <span className={cn('mt-0.5 shrink-0', n.read ? 'text-muted-foreground' : 'text-primary')}>
                <TrendingUp className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn('block truncate text-sm', n.read ? 'text-muted-foreground' : 'font-medium text-foreground')}>
                  {n.title}
                </span>
                {n.body && (
                  <span className="block truncate text-xs text-muted-foreground">{n.body}</span>
                )}
                <span className="mt-0.5 block text-[11px] text-muted-foreground/70">
                  {ilYA(n.created_at)}
                </span>
              </span>
              {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Etat des alertes systeme, et moyen de l'changer.
 *
 * Sans ce bandeau, une permission refusee est invisible : l'utilisateur voit
 * la pastille, n'a aucune alerte, et n'a aucun moyen de comprendre pourquoi.
 */
function BandeauAlertes({
  etat, onChange,
}: { etat: EtatAlertes; onChange: (e: EtatAlertes) => void }) {
  if (etat === 'indisponible') return null;

  if (etat === 'installation_requise') {
    return (
      <div className="flex items-start gap-2 border-b border-border bg-muted/50 px-3 py-2">
        <Smartphone className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
        <p className="text-xs leading-snug text-muted-foreground">
          Sur iPhone, ajoutez d’abord le CRM à l’écran d’accueil, ouvrez-le
          depuis son icône puis activez les notifications ici.
        </p>
      </div>
    );
  }

  if (etat === 'activation') {
    return (
      <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Vérification de cet appareil…
      </div>
    );
  }

  if (etat === 'autorisee') {
    return (
      <div className="flex items-center justify-between gap-2 border-b border-border bg-done-soft/40 px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs text-done">
          <Volume2 className="h-3 w-3" />
          Push actif sur cet appareil
        </span>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
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
      <div className="flex items-start gap-2 border-b border-border bg-muted/50 px-3 py-2">
        <BellOff className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
        <p className="text-xs leading-snug text-muted-foreground">
          Alertes refusées pour ce site. Le navigateur ne redemandera pas :
          il faut les réactiver dans ses réglages, à l’icône à gauche de
          l’adresse.
        </p>
      </div>
    );
  }

  if (etat === 'erreur') {
    return (
      <div className="flex items-center justify-between gap-2 border-b border-border bg-destructive/5 px-3 py-2">
        <span className="text-xs text-destructive">Activation incomplète sur cet appareil</span>
        <Button
          size="sm"
          variant="outline"
          className="h-6 rounded-full text-xs"
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
    <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/50 px-3 py-2">
      <span className="text-xs text-muted-foreground">
        Recevoir les alertes même CRM fermé
      </span>
      <Button
        size="sm"
        className="h-6 rounded-full text-xs"
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
