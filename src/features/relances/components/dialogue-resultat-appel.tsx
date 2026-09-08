import { useCallback, useEffect, useState } from 'react';
import { Loader2, PhoneOff, Check, CalendarClock, MessageSquare } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  RESULTATS, DELAIS_RAPPEL, dansNHeures, type CleResultat, type Resultat,
} from '../resultat-appel';

/**
 * Résultat d'un appel.
 *
 * S'ouvre juste après avoir composé le numéro. C'est la pièce qui manquait :
 * sans elle, appeler n'incrémentait qu'un compteur, le statut ne bougeait pas,
 * et le lead revenait en tête de file aussitôt.
 *
 * Chaque issue annonce son effet sur la file avant d'être choisie. Un
 * conseiller ne devrait pas avoir à connaître les cadences par cœur pour
 * savoir ce qu'il déclenche.
 *
 * Aucune issue par défaut, et pas de fermeture par mégarde : un appel dont
 * le résultat n'est pas saisi laisse le lead exactement là où il était, ce qui
 * ramène le défaut qu'on corrige.
 */

export interface ChoixResultat {
  cle: CleResultat;
  /** Date de rappel, pour « à rappeler plus tard ». */
  prochaineAction: string | null;
  note: string | null;
  /** Ouvre le SMS NRP pre-rempli apres l'enregistrement de l'etape. */
  envoyerSmsNrp: boolean;
}

interface DialogueResultatAppelProps {
  ouvert: boolean;
  onOuvertChange: (v: boolean) => void;
  /** Nom affiché, pour vérifier qu'on qualifie le bon lead. */
  nom: string;
  /**
   * D'où vient la demande. Un appel qu'on vient de passer et une relance
   * qu'on déclare traitée n'appellent pas la même question.
   */
  contexte?: 'appel' | 'traitement';
  enCours?: boolean;
  telephone?: string | null;
  onValider: (choix: ChoixResultat) => void;
}

export function DialogueResultatAppel({
  ouvert, onOuvertChange, nom, enCours, telephone, onValider, contexte = 'appel',
}: DialogueResultatAppelProps) {
  const [choisi, setChoisi] = useState<Resultat | null>(null);
  const [heures, setHeures] = useState<number>(24);
  const [datePersonnalisee, setDatePersonnalisee] = useState('');
  const [note, setNote] = useState('');

  // Chaque appel repart d'une ardoise vierge : garder le choix precedent
  // ferait qualifier le suivant sans y penser.
  useEffect(() => {
    if (ouvert) {
      setChoisi(null);
      setHeures(24);
      setDatePersonnalisee('');
      setNote('');
    }
  }, [ouvert]);

  const valider = useCallback((avecSmsNrp = false) => {
    if (!choisi) return;
    onValider({
      cle: choisi.cle,
      prochaineAction: choisi.demandeDelai
        ? datePersonnalisee
          ? new Date(datePersonnalisee).toISOString()
          : dansNHeures(heures)
        : null,
      note: note.trim() || null,
      envoyerSmsNrp: choisi.cle === 'sans_reponse' && avecSmsNrp,
    });
  }, [choisi, heures, datePersonnalisee, note, onValider]);

  // Les chiffres affiches choisissent une issue, Entree valide sans SMS. Le mode session ne
  // quitte pas le clavier : un dialogue qui obligerait a prendre la souris
  // casserait ce qui fait son interet.
  useEffect(() => {
    if (!ouvert) return;

    const auClavier = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const rang = Number(e.key);
      if (rang >= 1 && rang <= RESULTATS.length) {
        e.preventDefault();
        // Le mode session ecoute la meme fenetre : sans cet arret, un chiffre
        // choisirait une issue *et* declencherait un de ses raccourcis.
        e.stopPropagation();
        setChoisi(RESULTATS[rang - 1]);
        return;
      }

      if (e.key === 'Enter' && choisi && !enCours) {
        e.preventDefault();
        e.stopPropagation();
        valider(false);
      }
    };

    window.addEventListener('keydown', auClavier);
    return () => window.removeEventListener('keydown', auClavier);
  }, [ouvert, choisi, enCours, valider]);

  return (
    <Dialog open={ouvert} onOpenChange={onOuvertChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:rounded-2xl sm:max-w-md">
        <DialogHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <PhoneOff className="h-5 w-5 text-muted-foreground" />
          </div>
          <DialogTitle>
            {contexte === 'appel' ? "Comment s'est passé l'appel ?" : 'Où en est ce lead ?'}
          </DialogTitle>
          <DialogDescription>
            {nom} — choisissez l’étape réelle pour programmer la bonne suite.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          {RESULTATS.map((r, i) => {
            const actif = choisi?.cle === r.cle;
            return (
              <button
                key={r.cle}
                type="button"
                onClick={() => setChoisi(r)}
                className={cn(
                  'flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors',
                  actif
                    ? r.negatif
                      ? 'border-destructive/40 bg-destructive/5'
                      : 'border-primary/40 bg-primary/5'
                    : 'border-border hover:bg-muted/50',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                    actif
                      ? r.negatif
                        ? 'border-destructive bg-destructive text-destructive-foreground'
                        : 'border-primary bg-primary text-primary-foreground'
                      : 'border-muted-foreground/40',
                  )}
                >
                  {actif && <Check className="h-2.5 w-2.5" />}
                </span>

                <span className="min-w-0 flex-1">
                  <span className={cn(
                    'block text-sm font-medium',
                    r.negatif && actif ? 'text-destructive' : 'text-foreground',
                  )}>
                    {r.label}
                  </span>
                  {/* L'effet sur la file, dit avant le choix : personne ne
                      devrait connaitre les cadences par coeur. */}
                  <span className="block text-xs text-muted-foreground">{r.effet}</span>
                </span>

                {/* Un raccourci qu'on ne voit pas n'existe pas. */}
                <kbd className="mt-0.5 hidden shrink-0 rounded border border-border px-1.5 text-[10px] text-muted-foreground sm:block">
                  {i + 1}
                </kbd>
              </button>
            );
          })}
        </div>

        {choisi?.demandeDelai && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-foreground">Rappeler</p>
            <div className="flex flex-wrap gap-1.5">
              {DELAIS_RAPPEL.map((d) => (
                <Button
                  key={d.heures}
                  type="button"
                  size="sm"
                  variant={heures === d.heures ? 'default' : 'outline'}
                  className="h-7 rounded-full text-xs"
                  onClick={() => { setHeures(d.heures); setDatePersonnalisee(''); }}
                >
                  {d.label}
                </Button>
              ))}
            </div>
            <div className="relative pt-1">
              <CalendarClock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-[calc(50%-2px)] text-muted-foreground" />
              <input
                type="datetime-local"
                value={datePersonnalisee}
                min={dateLocalePourChamp(new Date())}
                onChange={(e) => setDatePersonnalisee(e.target.value)}
                aria-label="Date et heure personnalisées du rappel"
                className="flex h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>
        )}

        {choisi && (
          <div className="space-y-1.5">
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Après validation : </span>
              {choisi.effet}
            </p>
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={placeholderNote(choisi.cle)}
              className="rounded-lg"
            />
            {choisi.cle === 'sans_reponse' && telephone && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Le SMS commercial sera prérempli avec l’offre du client. Vous pourrez le relire avant l’envoi.
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button" variant="ghost" className="rounded-full"
            onClick={() => onOuvertChange(false)}
            disabled={enCours}
          >
            Plus tard
          </Button>
          {choisi?.cle === 'sans_reponse' && telephone ? (
            <>
              <Button
                type="button" variant="outline" className="rounded-full"
                disabled={enCours}
                onClick={() => valider(false)}
              >
                Enregistrer sans SMS
              </Button>
              <Button
                type="button" className="rounded-full"
                disabled={enCours}
                onClick={() => valider(true)}
              >
                {enCours
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <MessageSquare className="mr-2 h-4 w-4" />}
                Enregistrer + SMS
              </Button>
            </>
          ) : (
            <Button
              type="button" className="rounded-full"
              disabled={!choisi || enCours}
              onClick={() => valider(false)}
            >
              {enCours && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enregistrer l’étape
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function dateLocalePourChamp(date: Date): string {
  const decalage = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - decalage).toISOString().slice(0, 16);
}

function placeholderNote(cle: CleResultat): string {
  if (cle === 'pas_interesse') return 'Pourquoi le client refuse ? Prix, délai, déjà équipé…';
  if (cle === 'documents') return 'Quels documents manquent ?';
  if (cle === 'rappeler') return 'Motif du rappel et disponibilité du client';
  if (cle === 'rdv') return 'Créneau convenu et lieu du rendez-vous';
  if (cle === 'cloture') return 'Intervention réalisée, précision utile (facultatif)';
  if (cle === 'faux_numero') return 'Précisez le problème rencontré';
  return "Résumé utile de l'appel (facultatif)";
}
