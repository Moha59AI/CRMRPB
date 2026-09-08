import { memo } from 'react';
import {
  Phone, MessageSquare, Clock, Check, FileText, CalendarClock,
  ListTodo, Sparkles, ExternalLink, Car, MapPin, Archive,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { Relance, RelanceKind, UrgencyLevel, PriorityLevel } from '@/services/relances-service';

const ICONE: Record<RelanceKind, typeof Phone> = {
  nouveau: Sparkles,
  rappel: Phone,
  documents: FileText,
  rdv: CalendarClock,
  tache: ListTodo,
};

const POINT: Record<UrgencyLevel, string> = {
  urgent: 'bg-urgent',
  due: 'bg-due',
  upcoming: 'bg-upcoming',
};

const DELAI_STYLE: Record<UrgencyLevel, string> = {
  urgent: 'text-urgent',
  due: 'text-due',
  upcoming: 'text-muted-foreground',
};

const PRIORITE_STYLE: Record<PriorityLevel, string> = {
  urgent: 'bg-urgent-soft text-urgent',
  haute: 'bg-due-soft text-due',
  normale: 'bg-muted text-muted-foreground',
  faible: 'bg-muted text-muted-foreground/70',
};

const PRIORITE_LIBELLE: Record<PriorityLevel, string> = {
  urgent: 'Urgent',
  haute: 'Haute',
  normale: 'Normale',
  faible: 'Faible',
};

/**
 * Actions proposées selon l'étape du lead. Un dossier qui attend des documents
 * ne se traite pas comme un lead jamais appelé : proposer les mêmes boutons
 * partout obligerait à réfléchir à chaque ligne.
 */
const ACTIONS_PAR_TYPE: Record<RelanceKind, ('appeler' | 'sms' | 'documents')[]> = {
  nouveau: ['appeler', 'sms'],
  rappel: ['appeler', 'sms'],
  documents: ['documents', 'appeler'],
  rdv: ['appeler', 'sms'],
  tache: [],
};

function libelleDelai(r: Relance): string {
  // Sur un lead jamais appele, la journee est une unite trop grossiere :
  // tout se joue dans le premier quart d'heure.
  if (r.waitingMinutes !== null) {
    const m = r.waitingMinutes;
    if (m < 1) return "a l'instant";
    if (m < 60) return `il y a ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `il y a ${h} h`;
    const j = Math.floor(h / 24);
    return j === 1 ? 'il y a 1 jour' : `il y a ${j} jours`;
  }
  if (r.urgency === 'urgent') {
    return r.daysLate === 1 ? '1 j de retard' : `${r.daysLate} j de retard`;
  }
  if (r.urgency === 'due') return "Aujourd'hui";
  const jours = Math.round(
    (new Date(r.dueAt).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000
  );
  return jours === 1 ? 'Demain' : `Dans ${jours} j`;
}

const TYPE_ACTION_LIBELLE: Record<string, string> = {
  call_outbound: 'Appel',
  call_inbound: 'Appel reçu',
  call_missed: 'Appel manqué',
  sms_outbound: 'SMS envoyé',
  sms_inbound: 'SMS reçu',
  email_outbound: 'Email envoyé',
  email_inbound: 'Email reçu',
  voicemail: 'Messagerie',
  note: 'Note',
};

function libelleDerniereAction(r: Relance): string | null {
  if (!r.lastActionAt) return null;
  const quand = new Date(r.lastActionAt);
  const jours = Math.round((Date.now() - quand.getTime()) / 86_400_000);
  const heure = quand.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const quandTexte = jours === 0 ? `aujourd'hui ${heure}`
    : jours === 1 ? `hier ${heure}`
    : `il y a ${jours} j`;
  return `${TYPE_ACTION_LIBELLE[r.lastActionType ?? ''] ?? 'Action'} ${quandTexte}`;
}

interface RelanceRowProps {
  relance: Relance;
  selectionnee: boolean;
  enCours: boolean;
  onSelection: (id: string, valeur: boolean) => void;
  onAppeler: (r: Relance) => void;
  onSms: (r: Relance) => void;
  onDemanderDocuments: (r: Relance) => void;
  onReporter: (r: Relance) => void;
  onArchiver: (r: Relance) => void;
  onTraiter: (r: Relance) => void;
  onOuvrir: (r: Relance) => void;
}

export const RelanceRow = memo(function RelanceRow({
  relance, selectionnee, enCours, onSelection,
  onAppeler, onSms, onDemanderDocuments, onReporter, onTraiter, onOuvrir,
  onArchiver,
}: RelanceRowProps) {
  const Icone = ICONE[relance.kind];
  const actions = ACTIONS_PAR_TYPE[relance.kind];
  const derniere = libelleDerniereAction(relance);
  const estLeadAQualifier = Boolean(
    relance.leadId && !relance.taskId && !relance.appointmentId,
  );

  return (
    <div
      className={cn(
        'group flex flex-col gap-1.5',
        'md:grid md:grid-cols-[auto_auto_auto_minmax(0,2fr)_minmax(0,2fr)_auto_auto] md:items-center md:gap-3',
        'border-b border-border px-3 py-2 transition-colors duration-100',
        'hover:bg-muted/50',
        selectionnee && 'bg-accent/40',
        enCours && 'animate-check-out pointer-events-none'
      )}
    >
      <div className="flex items-center gap-2 md:contents">
        {/* Toujours visible au téléphone : sans survol, une case masquée
            serait introuvable. */}
        <Checkbox
          checked={selectionnee}
          onCheckedChange={(v) => onSelection(relance.id, v === true)}
          aria-label={`Sélectionner ${relance.titre}`}
          className="transition-opacity md:opacity-0 md:group-hover:opacity-100 md:data-[state=checked]:opacity-100"
        />

        <span className={cn('h-2 w-2 rounded-full', POINT[relance.urgency])} aria-hidden />

        <span
          className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', PRIORITE_STYLE[relance.priority])}
          title={`Score de priorité : ${relance.score}`}
        >
          {PRIORITE_LIBELLE[relance.priority]}
        </span>

        {/* Le delai remonte sur cette ligne au telephone, ou il tiendrait mal
            en fin de carte. */}
        <span className={cn('ml-auto text-xs font-medium tabular md:hidden',
          relance.waitingMinutes !== null
            ? relance.waitingMinutes > 120 ? 'text-urgent'
              : relance.waitingMinutes > 30 ? 'text-due' : 'text-done'
            : DELAI_STYLE[relance.urgency])}>
          {libelleDelai(relance)}
        </span>
      </div>

      {/* Identité */}
      <button type="button" onClick={() => onOuvrir(relance)} className="min-w-0 text-left">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-medium text-foreground">{relance.titre}</span>
          {relance.phone && (
            <span className="shrink-0 text-xs text-muted-foreground tabular">{relance.phone}</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {relance.vehicule && (
            <span className="flex min-w-0 items-center gap-1">
              <Car className="h-3 w-3 shrink-0" />
              <span className="truncate">{relance.vehicule}</span>
            </span>
          )}
          {relance.immatriculation && (
            <span className="shrink-0 font-medium tabular">{relance.immatriculation}</span>
          )}
          {relance.city && (
            <span className="flex min-w-0 items-center gap-1">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{relance.city}</span>
            </span>
          )}
          {relance.insurance && (
            <span className="hidden truncate xl:inline">{relance.insurance}</span>
          )}
        </div>
      </button>

      {/* Motif et dernière action */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <Icone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate text-sm text-foreground">{relance.motif}</span>
        </div>
        {(derniere || relance.attemptCount > 0) && (
          <p className="truncate text-xs text-muted-foreground">
            {derniere ?? 'Aucun échange récent'}
            {relance.attemptCount > 0 && (
              <span> · {relance.attemptCount} tentative{relance.attemptCount > 1 ? 's' : ''}</span>
            )}
          </p>
        )}
      </div>

      <span className={cn('hidden shrink-0 text-xs font-medium tabular md:inline',
        relance.waitingMinutes !== null
          ? relance.waitingMinutes > 120 ? 'text-urgent'
            : relance.waitingMinutes > 30 ? 'text-due' : 'text-done'
          : DELAI_STYLE[relance.urgency])}>
        {libelleDelai(relance)}
      </span>

      {/* Actions : masquées au repos pour garder la liste calme, mais
          atteignables au clavier via focus-within. */}
      <div className={cn(
        'flex shrink-0 items-center gap-0.5 transition-opacity duration-100',
        // Sans survol sur un ecran tactile, des actions masquees sont des
        // actions perdues.
        'justify-end md:justify-start md:opacity-0 md:focus-within:opacity-100 md:group-hover:opacity-100',
      )}>
        {actions.includes('appeler') && relance.phone && (
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full"
            onClick={() => onAppeler(relance)} title="Appeler">
            <Phone className="h-3.5 w-3.5" />
            <span className="sr-only">Appeler {relance.titre}</span>
          </Button>
        )}
        {actions.includes('sms') && relance.phone && (
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full"
            onClick={() => onSms(relance)} title="Envoyer un SMS">
            <MessageSquare className="h-3.5 w-3.5" />
            <span className="sr-only">SMS à {relance.titre}</span>
          </Button>
        )}
        {actions.includes('documents') && (
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full"
            onClick={() => onDemanderDocuments(relance)} title="Demander les documents">
            <FileText className="h-3.5 w-3.5" />
            <span className="sr-only">Demander les documents</span>
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full"
          onClick={() => onReporter(relance)} title="Reporter à demain">
          <Clock className="h-3.5 w-3.5" />
          <span className="sr-only">Reporter à demain</span>
        </Button>
        {relance.leadId && !relance.taskId && !relance.appointmentId && !relance.caseId && (
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full"
            onClick={() => onArchiver(relance)} title="Archiver ce lead">
            <Archive className="h-3.5 w-3.5" />
            <span className="sr-only">Archiver {relance.titre}</span>
          </Button>
        )}
        <Button variant="ghost" size="icon"
          className="h-7 w-7 rounded-full text-done hover:bg-done-soft hover:text-done"
          onClick={() => onTraiter(relance)}
          title={estLeadAQualifier ? 'Changer l’étape du lead' : 'Marquer comme traité'}>
          <Check className="h-3.5 w-3.5" />
          <span className="sr-only">
            {estLeadAQualifier ? 'Changer l’étape du lead' : 'Marquer comme traité'}
          </span>
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full"
          onClick={() => onOuvrir(relance)} title="Ouvrir le dossier">
          <ExternalLink className="h-3.5 w-3.5" />
          <span className="sr-only">Ouvrir le dossier</span>
        </Button>
      </div>
    </div>
  );
});
