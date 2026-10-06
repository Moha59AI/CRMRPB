// L'en-tête d'un message ouvert
//
// C'était un tableau encadré de cinq lignes — De, À, Date, Correspondant,
// Rattachement — qui occupait 180 px avant la première phrase du message.
// On lisait cinq étiquettes pour apprendre une chose : qui écrit.
//
// Gmail tient en deux lignes et sans cadre : l'expéditeur, son adresse, la
// date à droite ; en dessous, « à … » et un chevron qui déplie le reste.
// L'information est là, elle ne prend la place que lorsqu'on la demande.

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Communication } from '@/types';

/** Deux lettres : un correspondant se reconnait avant de se lire. */
function initiales(valeur: string): string {
  const mots = valeur.replace(/@.*$/, '').split(/[\s._-]+/).filter(Boolean);
  if (mots.length === 0) return '?';
  return mots.slice(0, 2).map((mot) => mot[0]?.toUpperCase() ?? '').join('') || '?';
}

function dateComplete(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export interface EnteteMessageProps {
  email: Communication;
  /** Le nom du client quand on le connait. */
  nom: string | null;
  /** Assureur, fournisseur, expert — null si ce n'est ni l'un ni l'autre. */
  correspondant?: string | null;
  /** Le message n'est rattache a aucun client. */
  aRattacher?: boolean;
}

export function EnteteMessage({ email, nom, correspondant, aRattacher }: EnteteMessageProps) {
  const [deplie, setDeplie] = useState(false);
  const entrant = email.direction === 'inbound';
  const adresse = (entrant ? email.sender_email : email.recipient_email) ?? 'Adresse inconnue';
  const affiche = nom ?? adresse;

  return (
    <div className="flex items-start gap-3 py-1">
      <span
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-semibold text-muted-foreground"
      >
        {initiales(affiche)}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm font-semibold text-foreground">{affiche}</span>
          {nom && (
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              &lt;{adresse}&gt;
            </span>
          )}
          <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
            {dateComplete(email.created_at)}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setDeplie((etat) => !etat)}
          aria-expanded={deplie}
          className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="truncate">
            à {email.recipient_email ?? 'destinataire inconnu'}
          </span>
          <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform', deplie && 'rotate-180')} />
        </button>

        {deplie && (
          <dl className="mt-2 grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
            <dt className="text-muted-foreground">De</dt>
            <dd className="break-all text-foreground">{email.sender_email ?? '—'}</dd>

            <dt className="text-muted-foreground">À</dt>
            <dd className="break-all text-foreground">{email.recipient_email ?? '—'}</dd>

            <dt className="text-muted-foreground">Date</dt>
            <dd className="capitalize text-foreground">
              {new Date(email.created_at).toLocaleString('fr-FR', {
                weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </dd>

            {correspondant && (
              <>
                <dt className="text-muted-foreground">Type</dt>
                <dd className="text-foreground">{correspondant}</dd>
              </>
            )}

            {email.provider && (
              <>
                <dt className="text-muted-foreground">Source</dt>
                <dd className="uppercase tracking-wide text-muted-foreground">{email.provider}</dd>
              </>
            )}
          </dl>
        )}

        {/* Seule information qui appelle une action : elle reste visible. */}
        {aRattacher && (
          <p className="mt-1.5 text-xs font-medium text-due">
            Aucun client ou lead correspondant
          </p>
        )}
      </div>
    </div>
  );
}
