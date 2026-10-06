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
  onOuvrir: () => void;
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
}: LigneEmailProps) {
  const sortant = email.direction !== 'inbound';
  const nonLu = estNonLu(email);
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
        actif ? 'bg-primary/[0.07]' : nonLu ? 'bg-card hover:bg-surface' : 'bg-surface/60 hover:bg-surface',
      )}
    >
      {/* L'etoile n'agit pas encore : elle tient sa colonne pour que les
          lignes restent alignees le jour ou elle agira. */}
      <Star
        aria-hidden
        className="hidden h-4 w-4 shrink-0 text-faint/50 sm:block"
        strokeWidth={1.5}
      />

      {/* Colonne d'expediteur a largeur fixe : c'est elle qui fait l'alignement. */}
      <span
        className={cn(
          'w-[104px] shrink-0 truncate text-sm sm:w-[140px] xl:w-[190px]',
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
        {badge && <span className="hidden max-w-[180px] shrink-0 md:inline">{badge}</span>}
        {pdfFournisseur > 0 && (
          <span className="hidden shrink-0 rounded-full bg-due-soft px-2 py-0.5 text-[10px] font-medium text-due sm:inline">
            {pdfFournisseur} PDF
          </span>
        )}
        {aRattacher && (
          <span className="hidden shrink-0 rounded-full bg-due-soft px-2 py-0.5 text-[10px] font-medium text-due sm:inline">
            À rattacher
          </span>
        )}
        {/* `shrink-0` sans plafond laissait un objet long passer sous la
            date. Il ne depasse plus la moitie de la ligne : au-dela, c'est
            l'extrait qui ne sert plus a rien, pas l'objet. */}
        <span className={cn(
          'min-w-0 max-w-full shrink truncate text-sm sm:max-w-[52%] sm:shrink-0',
          nonLu ? 'font-semibold text-foreground' : 'text-foreground/85',
        )}>
          {email.subject || '(Sans objet)'}
        </span>
        {extrait && (
          <span className="hidden min-w-0 flex-1 truncate text-sm text-faint sm:inline">
            — {extrait}
          </span>
        )}
      </span>

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
