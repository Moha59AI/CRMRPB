// Une ligne de la boîte mail
//
// Elle occupait quatre lignes empilées — correspondant, objet, deux lignes
// d'extrait, puis une rangée de pastilles — soit environ 110 px par message.
// Sur un écran de portable, six messages tenaient à l'écran, et il fallait
// faire défiler pour voir ce qu'on avait reçu dans la matinée.
//
// Gmail tient en une ligne : qui, l'objet, l'extrait en gris à la suite, la
// date à droite. On en voit vingt d'un coup, et c'est ce qui permet de
// balayer une boîte plutôt que de la lire. On reprend cette densité, avec
// nos propres repères métier — assureur, fournisseur, à rattacher — qui
// disent de quoi il s'agit avant même d'ouvrir.

import type { ReactNode } from 'react';
import { FileText, Paperclip } from 'lucide-react';
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

/** Deux lettres : un correspondant se reconnait avant de se lire. */
function initiales(valeur: string): string {
  const mots = valeur.replace(/@.*$/, '').split(/[\s._-]+/).filter(Boolean);
  if (mots.length === 0) return '?';
  return mots.slice(0, 2).map((mot) => mot[0]?.toUpperCase() ?? '').join('') || '?';
}

/**
 * Teinte stable par correspondant.
 *
 * Toutes les pastilles grises se ressemblent ; une couleur tiree du nom rend
 * la ligne reconnaissable du coin de l'oeil, et reste la meme d'un jour a
 * l'autre puisqu'elle ne depend que du texte.
 */
const TEINTES = [
  'bg-primary/10 text-primary',
  'bg-upcoming-soft text-upcoming',
  'bg-due-soft text-due',
  'bg-urgent-soft text-urgent',
  'bg-surface text-muted-foreground',
];

function teinte(valeur: string): string {
  let somme = 0;
  for (let i = 0; i < valeur.length; i += 1) somme = (somme + valeur.charCodeAt(i)) % 997;
  return TEINTES[somme % TEINTES.length];
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

export function LigneEmail({
  email, correspondant, badge, aRattacher, pdfFournisseur = 0, actif, onOuvrir,
}: LigneEmailProps) {
  const sortant = email.direction !== 'inbound';
  const extrait = (email.content ?? '').replace(/\s+/g, ' ').trim();
  const pieces = email.email_attachments?.length ?? 0;

  return (
    <button
      type="button"
      onClick={onOuvrir}
      aria-current={actif ? 'true' : undefined}
      className={cn(
        'group flex w-full items-center gap-3 border-l-2 px-3 py-2.5 text-left transition-colors',
        actif
          ? 'border-l-primary bg-primary/[0.06]'
          : 'border-l-transparent hover:bg-surface',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
          teinte(correspondant),
        )}
      >
        {initiales(correspondant)}
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
            {/* Un message sortant se lit « à qui », pas « de qui ». */}
            {sortant && <span className="font-normal text-faint">À </span>}
            {correspondant}
          </span>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {dateCourte(email.created_at)}
          </span>
        </span>

        {/* Objet et extrait sur une seule ligne : c'est ce qui fait tenir
            vingt messages a l'ecran au lieu de six. */}
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate text-sm text-foreground/90">
            {email.subject || '(Sans objet)'}
          </span>
          {extrait && (
            <span className="hidden min-w-0 flex-1 truncate text-sm text-faint sm:inline">
              — {extrait}
            </span>
          )}
          {pieces > 0 && (
            <span
              className="flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground"
              title={`${pieces} pièce${pieces > 1 ? 's' : ''} jointe${pieces > 1 ? 's' : ''}`}
            >
              <Paperclip className="h-3 w-3" aria-hidden />{pieces}
            </span>
          )}
        </span>

        {(badge || aRattacher || pdfFournisseur > 0) && (
          <span className="flex flex-wrap items-center gap-1.5">
            {badge}
            {pdfFournisseur > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-due-soft px-2 py-0.5 text-[10px] font-medium text-due">
                <FileText className="h-3 w-3" aria-hidden />
                {pdfFournisseur} PDF
              </span>
            )}
            {aRattacher && (
              <span className="rounded-full bg-due-soft px-2 py-0.5 text-[10px] font-medium text-due">
                À rattacher
              </span>
            )}
          </span>
        )}
      </span>
    </button>
  );
}
