import { useCallback, useEffect, useState } from 'react';
import {
  Phone, MessageSquare, Clock, Check, SkipForward, X, Car, MapPin,
  History, CheckCircle2, Loader2, ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  reporterRelance, marquerRelanceTraitee, journaliserAction,
  enregistrerResultatAppel, type Relance,
} from '@/services/relances-service';
import { DialogueResultatAppel, type ChoixResultat } from './dialogue-resultat-appel';
import { resultatParCle } from '../resultat-appel';

/**
 * Mode concentré : un dossier à la fois, passage automatique au suivant.
 *
 * L'objectif est d'enchaîner trente à cinquante appels sans revenir à la liste
 * ni lâcher le clavier. Chaque action avance la file — c'est ce qui fait la
 * différence entre traiter dix relances et en traiter cinquante.
 */

const RACCOURCIS = [
  { touche: 'A', libelle: 'Appeler' },
  { touche: 'S', libelle: 'SMS' },
  { touche: 'R', libelle: 'Reporter' },
  { touche: 'T', libelle: 'Traité' },
  { touche: 'F', libelle: 'Fiche' },
  { touche: '→', libelle: 'Passer' },
  { touche: 'Échap', libelle: 'Quitter' },
];

interface SessionRelanceProps {
  file: Relance[];
  onFermer: () => void;
  onTermine: () => void;
  onOuvrirFiche: (leadId: string) => void;
}

export function SessionRelance({ file, onFermer, onTermine, onOuvrirFiche }: SessionRelanceProps) {
  // Qualifier est ce qui fait sortir le lead de la file. Sans ce dialogue, la
  // session faisait defiler des leads qui revenaient tous le lendemain.
  const [aQualifier, setAQualifier] = useState<Relance | null>(null);
  const [contexte, setContexte] = useState<'appel' | 'traitement'>('appel');
  const [index, setIndex] = useState(0);
  const [traitees, setTraitees] = useState(0);
  const [occupe, setOccupe] = useState(false);

  const relance = file[index];
  const fini = index >= file.length;

  const suivant = useCallback(() => {
    setIndex((i) => i + 1);
    setOccupe(false);
  }, []);

  const appeler = useCallback(() => {
    if (!relance?.phone) {
      toast.error('Aucun téléphone sur cette fiche');
      return;
    }
    window.location.href = `tel:${relance.phone}`;
    void journaliserAction(relance, 'call_outbound', 'Appel — session de relance')
      .catch((e: Error) => toast.error(e.message));
    setContexte('appel');
    setAQualifier(relance);
  }, [relance]);

  const envoyerSms = useCallback(() => {
    if (!relance?.phone) {
      toast.error('Aucun téléphone sur cette fiche');
      return;
    }
    const prenom = relance.titre.split(' ')[0];
    const message = `Bonjour ${prenom}, nous avons tenté de vous joindre au sujet de votre pare-brise. Rappelez-nous quand vous voulez. Relais Pare-Brise`;
    window.location.href = `sms:${relance.phone}?body=${encodeURIComponent(message)}`;
    void journaliserAction(relance, 'sms_outbound', message)
      .catch((e: Error) => toast.error(e.message));
  }, [relance]);

  const reporter = useCallback(async () => {
    if (!relance || occupe) return;
    setOccupe(true);
    try {
      await reporterRelance(relance, 1);
      toast.success(`${relance.titre} reporté à demain`);
      setTraitees((t) => t + 1);
      suivant();
    } catch (e) {
      toast.error((e as Error).message);
      setOccupe(false);
    }
  }, [relance, occupe, suivant]);

  const traiter = useCallback(async () => {
    if (!relance || occupe) return;

    // Sur un lead, « traite » ne veut rien dire : marquerRelanceTraitee se
    // contentait de reporter d'un jour, donc le lead revenait a l'identique.
    if (relance.leadId && !relance.taskId && !relance.appointmentId) {
      setContexte('traitement');
      setAQualifier(relance);
      return;
    }

    setOccupe(true);
    try {
      await marquerRelanceTraitee(relance);
      toast.success(`${relance.titre} traité`);
      setTraitees((t) => t + 1);
      suivant();
    } catch (e) {
      toast.error((e as Error).message);
      setOccupe(false);
    }
  }, [relance, occupe, suivant]);

  const qualifier = useCallback(async (choix: ChoixResultat) => {
    if (!aQualifier?.leadId) return;
    setOccupe(true);
    try {
      const resultat = resultatParCle(choix.cle);
      await enregistrerResultatAppel({
        leadId: aQualifier.leadId,
        statut: resultat.statut,
        prochaineAction: choix.prochaineAction,
        note: choix.note,
      });
      toast.success(
        resultat.sortDeFile
          ? `${aQualifier.titre} quitte les relances`
          : `${aQualifier.titre} — ${resultat.label.toLowerCase()}`,
      );
      setAQualifier(null);
      setTraitees((t) => t + 1);
      // On enchaine : c'est tout l'interet de la session.
      suivant();
    } catch (e) {
      toast.error((e as Error).message);
      setOccupe(false);
    }
  }, [aQualifier, suivant]);

  // Les raccourcis sont la raison d'être du mode : on ne quitte pas le clavier.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Le dialogue de resultat a ses propres raccourcis : laisser passer
      // ceux-ci relancerait un appel ou passerait au lead suivant en plein
      // milieu de la qualification.
      if (aQualifier) return;
      const cible = e.target as HTMLElement | null;
      if (cible && ['INPUT', 'TEXTAREA'].includes(cible.tagName)) return;

      switch (e.key.toLowerCase()) {
        case 'escape': onFermer(); break;
        case 'a': e.preventDefault(); appeler(); break;
        case 's': e.preventDefault(); envoyerSms(); break;
        case 'r': e.preventDefault(); void reporter(); break;
        case 't': e.preventDefault(); void traiter(); break;
        case 'f':
          if (relance?.leadId) { e.preventDefault(); onOuvrirFiche(relance.leadId); }
          break;
        case 'arrowright': e.preventDefault(); suivant(); break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [appeler, envoyerSms, reporter, traiter, suivant, onFermer, onOuvrirFiche, relance, aQualifier]);

  const progression = file.length > 0 ? Math.round((index / file.length) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background animate-fade-in">
      {/* Barre de progression */}
      <div className="h-0.5 w-full bg-muted">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${progression}%` }}
        />
      </div>

      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-baseline gap-3">
          <span className="text-sm font-semibold">Session de relance</span>
          <span className="text-sm text-muted-foreground tabular">
            {Math.min(index + 1, file.length)} / {file.length}
          </span>
          {traitees > 0 && (
            <span className="text-sm text-done tabular">{traitees} traitées</span>
          )}
        </div>
        <Button variant="ghost" size="sm" className="rounded-full" onClick={onFermer}>
          <X className="mr-1.5 h-4 w-4" />
          Quitter
        </Button>
      </header>

      {fini ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-done-soft">
            <CheckCircle2 className="h-8 w-8 text-done" />
          </div>
          <h2 className="text-xl font-semibold">Session terminée</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {traitees} relance{traitees > 1 ? 's' : ''} traitée{traitees > 1 ? 's' : ''} sur {file.length}.
          </p>
          <Button className="mt-6 rounded-full" onClick={onTermine}>
            Revenir à la liste
          </Button>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center overflow-y-auto p-6">
          <div className="w-full max-w-xl">
            <p className="text-sm font-medium text-muted-foreground">{relance.motif}</p>

            <h1 className="mt-1 text-3xl font-semibold tracking-tight">{relance.titre}</h1>

            {relance.phone && (
              <a
                href={`tel:${relance.phone}`}
                onClick={appeler}
                className="mt-2 inline-block text-xl text-primary tabular hover:underline"
              >
                {relance.phone}
              </a>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
              {relance.vehicule && (
                <span className="flex items-center gap-1.5">
                  <Car className="h-4 w-4" />
                  {relance.vehicule}
                  {relance.immatriculation && (
                    <span className="font-medium text-foreground tabular">
                      {relance.immatriculation}
                    </span>
                  )}
                </span>
              )}
              {relance.city && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" />
                  {relance.city}
                </span>
              )}
              {relance.attemptCount > 0 && (
                <span className="flex items-center gap-1.5">
                  <History className="h-4 w-4" />
                  {relance.attemptCount} tentative{relance.attemptCount > 1 ? 's' : ''}
                </span>
              )}
            </div>

            {relance.waitingMinutes !== null && (
              <p className={cn(
                'mt-4 text-sm font-medium',
                relance.waitingMinutes > 120 ? 'text-urgent'
                  : relance.waitingMinutes > 30 ? 'text-due' : 'text-done'
              )}>
                {relance.waitingMinutes < 60
                  ? `Arrivé il y a ${relance.waitingMinutes} minutes`
                  : `Arrivé il y a ${Math.floor(relance.waitingMinutes / 60)} heures`}
              </p>
            )}

            <div className="mt-8 flex flex-wrap gap-2">
              <Button size="lg" className="rounded-full" onClick={appeler} disabled={!relance.phone}>
                <Phone className="mr-2 h-4 w-4" />
                Appeler
              </Button>
              <Button size="lg" variant="outline" className="rounded-full"
                onClick={envoyerSms} disabled={!relance.phone}>
                <MessageSquare className="mr-2 h-4 w-4" />
                SMS
              </Button>
              <Button size="lg" variant="outline" className="rounded-full"
                onClick={() => void reporter()} disabled={occupe}>
                {occupe ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        : <Clock className="mr-2 h-4 w-4" />}
                Reporter
              </Button>
              <Button size="lg" variant="outline"
                className="rounded-full border-done/30 text-done hover:bg-done-soft hover:text-done"
                onClick={() => void traiter()} disabled={occupe}>
                <Check className="mr-2 h-4 w-4" />
                Traité
              </Button>
              <Button size="lg" variant="ghost" className="rounded-full" onClick={suivant}>
                <SkipForward className="mr-2 h-4 w-4" />
                Passer
              </Button>
              {relance.leadId && (
                // Panneau lateral : la session reste montee derriere, on
                // reprend l'enchainement a la fermeture.
                <Button size="lg" variant="ghost" className="rounded-full"
                  onClick={() => onOuvrirFiche(relance.leadId as string)}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Fiche
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <footer className="flex flex-wrap items-center justify-center gap-4 border-t border-border px-6 py-2.5">
        {RACCOURCIS.map(({ touche, libelle }) => (
          <span key={touche} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
              {touche}
            </kbd>
            {libelle}
          </span>
        ))}
      </footer>

      <DialogueResultatAppel
        ouvert={aQualifier !== null}
        onOuvertChange={(o) => { if (!o) { setAQualifier(null); setOccupe(false); } }}
        nom={aQualifier?.titre ?? ''}
        contexte={contexte}
        enCours={occupe}
        onValider={(choix) => void qualifier(choix)}
      />

    </div>
  );
}
