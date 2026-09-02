import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bell, BellRing, Check, TrendingUp } from 'lucide-react';
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

  // Temps reel : le serveur pousse, on ne sonde pas.
  useEffect(() => {
    if (!profile?.id) return;

    return ecouterNotifications(profile.id, (n) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-non-lues'] });
      // Un nouveau lead change aussi les listes ouvertes derriere.
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['relances'] });

      alerterSysteme(n);
    });
  }, [profile?.id, queryClient]);

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
        setOuvert(o);
        // La permission se demande au premier geste volontaire, pas au
        // chargement : reclamee d'emblee, elle se refuse par reflexe.
        if (o) demanderPermission();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            'relative rounded-lg text-muted-foreground hover:text-foreground',
            reduit ? 'h-9 w-full p-0' : 'h-9 w-full justify-start gap-3 px-3',
          )}
          aria-label={compte > 0 ? `${compte} notification(s) non lue(s)` : 'Notifications'}
        >
          {compte > 0 ? <BellRing className="h-4 w-4 shrink-0" /> : <Bell className="h-4 w-4 shrink-0" />}
          {!reduit && <span className="text-sm">Notifications</span>}

          {compte > 0 && (
            <span
              className={cn(
                'absolute flex h-4 min-w-4 items-center justify-center rounded-full',
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
 * Demande la permission d'alerter, une seule fois.
 *
 * `default` signifie que rien n'a encore ete demande. Une fois refusee, le
 * navigateur ne redemandera pas : insister est inutile.
 */
function demanderPermission(): void {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'default') return;
  Notification.requestPermission().catch(() => {
    // Refus ou navigateur sans support : le CRM affiche la pastille, c'est tout.
  });
}

/**
 * Alerte systeme, quand elle est autorisee.
 *
 * Sans elle, un conseiller qui a le CRM dans un onglet en arriere-plan ne
 * verrait jamais la pastille -- donc jamais le lead.
 */
function alerterSysteme(n: Notification): void {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  // L'onglet est au premier plan : la pastille suffit, une alerte systeme
  // par-dessus serait redondante.
  if (document.visibilityState === 'visible') return;

  try {
    new Notification(n.title, {
      body: n.body ?? undefined,
      icon: '/icon-192.png',
      // Un seul lead ne doit pas empiler cinq alertes identiques.
      tag: n.id,
    });
  } catch {
    // Certains navigateurs mobiles refusent le constructeur hors service
    // worker : la pastille reste.
  }
}
