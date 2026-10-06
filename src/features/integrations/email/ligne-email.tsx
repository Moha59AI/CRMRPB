// Une ligne de la boîte mail, sur la grille de Gmail
//
// Gmail aligne tout en colonnes fixes : la case, l'étoile, l'expéditeur sur
// une largeur constante, puis l'objet et l'extrait qui remplissent le reste,
// la date calée à droite. C'est cet alignement — pas la densité seule — qui
// permet de balayer une boîte : l'œil descend une colonne au lieu de relire
// chaque bloc.
//
// Le non-lu est en gras sur fond blanc, le lu en graisse normale sur fond
// légèrement teinté. C'est le repère le plus utile d'une messagerie : il dit
// ce qui reste à faire sans rien lire.

import type { ReactNode } from 'react';
import { Paperclip, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Communication } from '@/types';

export interface LigneEmailProps {
  email: Communication;
  /** Le nom du client quand on le connait, sinon l'adresse. */
  correspondant: string;
  /** Pastille metier : assureur, fournisseur, expert. */
  badge?: ReactNode;
  /** Le message n'est rattache a aucun client. */
  aRattacher?: boolean;
  /** Factures fournisseur a masquer avant transmission. */
  pdfFournisseur?: number;
  actif: boolean;
  /**
   * La liste partage l'ecran avec un message ouvert.
   *
   * Les points de rupture de Tailwind mesurent la fenetre, pas le
   * conteneur : sur un grand ecran, une liste de 440 px recevait quand meme
   * une colonne d'expediteur de 190 px et il ne restait rien pour l'objet.
   */
  etroite?: boolean;
  onOuvrir: () => void;
  /** Coche de selection, pour les actions groupees. */
  selectionne?: boolean;
  onSelectionner?: (selectionne: boolean) => void;
  onSuivre?: (suivi: boolean) => void;
}

export function dateCourte(iso: string): string {
  const date = new Date(iso);
  const aujourdhui = new Date();
  if (date.toDateString() === aujourdhui.toDateString()) {
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  if (date.getFullYear() === aujourdhui.getFullYear()) {
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  }
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

/** Un message recu jamais ouvert. Un envoi n'a jamais ete « non lu ». */
export function estNonLu(email: Communication): boolean {
  return email.direction === 'inbound' && !email.read_at;
}

export function LigneEmail({
  email, correspondant, badge, aRattacher, pdfFournisseur = 0, actif, onOuvrir,
  selectionne = false, onSelectionner, onSuivre, etroite = false,
}: LigneEmailProps) {
  const sortant = email.direction !== 'inbound';
  const nonLu = estNonLu(email);
  const suivi = Boolean(email.starred_at);
  const extrait = (email.content ?? '').replace(/\s+/g, ' ').trim();
  const pieces = email.email_attachments?.length ?? 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOuvrir}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOuvrir();
        }
      }}
      aria-current={actif ? 'true' : undefined}
      className={cn(
        'group flex h-[42px] cursor-pointer items-center gap-2 px-2 text-left transition-colors sm:gap-3 sm:px-3',
        // Gmail teinte le lu et laisse le non-lu en blanc : c'est le fond,
        // pas seulement la graisse, qui fait ressortir ce qui reste a voir.
        selectionne ? 'bg-due-soft/60 hover:bg-due-soft'
          : actif ? 'bg-primary/[0.07]'
            : nonLu ? 'bg-card hover:bg-surface' : 'bg-surface/60 hover:bg-surface',
      )}
    >
      {onSelectionner && (
        <label
          className="hidden shrink-0 cursor-pointer p-1 sm:block"
          onClick={(evenement) => evenement.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={selectionne}
            onChange={(evenement) => onSelectionner(evenement.target.checked)}
            className="h-4 w-4 cursor-pointer accent-primary"
            aria-label={`Sélectionner le message de ${correspondant}`}
          />
        </label>
      )}

      {onSuivre && (
        <button
          type="button"
          onClick={(evenement) => {
            evenement.stopPropagation();
            onSuivre(!suivi);
          }}
          aria-pressed={suivi}
          title={suivi ? 'Ne plus suivre' : 'Suivre ce message'}
          className="hidden shrink-0 p-1 sm:block"
        >
          <Star
            className={cn(
              'h-4 w-4 transition-colors',
              suivi ? 'fill-due text-due' : 'text-faint/50 hover:text-due',
            )}
            strokeWidth={1.5}
          />
        </button>
      )}

      {/* Colonne d'expediteur : largeur constante dans une meme liste, donc
          l'alignement tient, mais proportionnelle a la liste et non a la
          fenetre. */}
      <span
        className={cn(
          // Une part de la ligne plutot qu'une largeur fixe : la colonne
          // suit la place disponible au lieu de la confisquer.
          'shrink-0 truncate text-sm',
          etroite ? 'w-[34%] max-w-[150px]' : 'w-[30%] max-w-[190px] min-w-[96px]',
          nonLu ? 'font-semibold text-foreground' : 'text-muted-foreground',
        )}
      >
        {sortant && <span className="font-normal text-faint">À </span>}
        {correspondant}
      </span>

      {/* Libelles, objet et extrait sur une seule ligne, dans cet ordre :
          Gmail pose ses etiquettes avant l'objet, et c'est ce qui permet de
          filtrer du regard sans lire. Les libelles ne se compriment pas, le
          reste cede la place. */}
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        {!etroite && badge && (
          <span className="hidden max-w-[180px] shrink-0 md:inline">{badge}</span>
        )}
        {!etroite && pdfFournisseur > 0 && (
          <span className="hidden shrink-0 rounded-full bg-due-soft px-2 py-0.5 text-[10px] font-medium text-due sm:inline">
            {pdfFournisseur} PDF
          </span>
        )}
        {!etroite && aRattacher && (
          <span className="hidden shrink-0 rounded-full bg-due-soft px-2 py-0.5 text-[10px] font-medium text-due sm:inline">
            À rattacher
          </span>
        )}
        {/* Sur une liste large, l'objet s'arrete a la moitie pour laisser
            voir l'extrait. Sur une liste etroite il prend tout : l'extrait
            n'y tient pas de toute facon. */}
        <span className={cn(
          'min-w-0 flex-1 truncate text-sm',
          // L'extrait cede avant l'objet : il n'a de valeur que s'il reste
          // de la place apres lui.
          etroite ? '' : 'sm:max-w-[55%] sm:flex-none sm:shrink-0',
          nonLu ? 'font-semibold text-foreground' : 'text-foreground/85',
        )}>
          {email.subject || '(Sans objet)'}
        </span>
        {extrait && !etroite && (
          <span className="hidden min-w-0 flex-1 truncate text-sm text-faint sm:inline">
            — {extrait}
          </span>
        )}
      </span>

      {/* En etroit, un point remplace la pastille « A rattacher » : elle
          prenait la place de l'objet, et presque tout le courrier entrant la
          porte. Il se range avec le trombone, apres l'objet, pour ne pas
          decaler la colonne d'une ligne a l'autre. */}
      {etroite && aRattacher && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-due"
          title="Aucun client ou lead correspondant"
          aria-label="À rattacher"
        />
      )}

      {pieces > 0 && (
        <Paperclip
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
          aria-label={`${pieces} pièce${pieces > 1 ? 's' : ''} jointe${pieces > 1 ? 's' : ''}`}
        />
      )}

      <span className={cn(
        'w-[52px] shrink-0 text-right text-[11px] tabular-nums sm:w-[62px]',
        nonLu ? 'font-semibold text-foreground' : 'text-muted-foreground',
      )}>
        {dateCourte(email.created_at)}
      </span>
    </div>
  );
}
