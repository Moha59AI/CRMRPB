import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight, Phone, MessageSquare, FileText, User,
  CalendarPlus, Car, MapPin, Shield, AlertTriangle, Check, Clock, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FicheOverlay, ActionMobile } from '@/features/fiche/fiche-overlay';
import { LeadPipeline } from '@/features/leads/lead-pipeline';
import { StatusBadge } from '@/features/leads/status-badge';
import { LIBELLE_VITRAGE, leadName, vehicleLabel } from '@/features/leads/lead-shared';
import { fetchLeadById, updateLead } from '@/services/leads-service';
import { useBrouillon, useAvertirSiModifie } from '@/hooks/use-brouillon';
import { messageErreurBase } from '@/lib/erreurs';
import { BarreEnregistrement } from '@/components/BarreEnregistrement';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { LIBELLE_CHAMP_LEAD } from '@/features/leads/lead-shared';
import { fetchProfiles } from '@/services/profiles-service';
import { createCommunication } from '@/services/activity-service';
import { DossierContenu } from './dossier-contenu';
import { ONGLETS, type OngletDossier, type EtatOuvertureDossier, fondDepuis } from './dossier-constants';
import type { Lead, LeadStatus } from '@/types';

interface DossierModalProps {
  /** En plein écran (URL ouverte directement), il n'y a rien derrière à préserver. */
  pleinePage?: boolean;
}

export function DossierModal({ pleinePage }: DossierModalProps) {
  const { leadId } = useParams<{ leadId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  // Memoise : location.state renvoie un nouvel objet a chaque rendu, ce qui
  // recreerait les callbacks et annulerait toute memoisation en aval.
  const etat = useMemo(
    () => (location.state ?? {}) as EtatOuvertureDossier,
    [location.state]
  );

  const [onglet, setOnglet] = useState<OngletDossier>('apercu');

  const { data: lead, isLoading } = useQuery({
    queryKey: ['lead', leadId],
    queryFn: () => fetchLeadById(leadId as string),
    enabled: !!leadId,
  });

  const { data: profiles } = useQuery({
    queryKey: ['profiles'],
    queryFn: fetchProfiles,
  });

  const liste = etat.liste ?? [];
  const position = leadId ? liste.indexOf(leadId) : -1;
  const precedent = position > 0 ? liste[position - 1] : null;
  const suivant = position >= 0 && position < liste.length - 1 ? liste[position + 1] : null;

  const fermer = useCallback(() => {
    if (pleinePage || !etat.background) navigate('/relances');
    else navigate(-1);
  }, [pleinePage, etat.background, navigate]);

  // On remplace l'entrée d'historique : enchaîner vingt dossiers ne doit pas
  // obliger à appuyer vingt fois sur Retour pour revenir à la liste.
  const allerVers = useCallback((id: string) => {
    navigate(`/interventions/${id}`, { state: etat, replace: true });
    setOnglet('apercu');
  }, [navigate, etat]);


  const majLead = useMutation({
    // updateLead renvoie son erreur au lieu de la lever : sans ce controle,
    // onSuccess se declenche meme quand la base refuse, le brouillon se vide
    // et l'utilisateur voit « enregistre » alors que rien n'est ecrit.
    mutationFn: async (updates: Partial<Lead>) => {
      const { error } = await updateLead(leadId as string, updates);
      if (error) throw new Error(error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['relances'] });
      queryClient.invalidateQueries({ queryKey: ['relances-compteurs'] });
    },
    onError: (e: Error) => toast.error(messageErreurBase(e.message)),
  });

  // Les champs de la fiche alimentent un brouillon ; seules les actions
  // (changer le statut, demander les documents) ecrivent immediatement.
  const brouillon = useBrouillon<Lead>(lead ?? undefined, leadId);
  useAvertirSiModifie(brouillon.estModifie);

  const enregistrer = () => {
    if (!brouillon.estModifie) return;

    // Les espaces de bordure viennent de la frappe, pas de l'intention. On ne
    // les coupe qu'ici : le faire a chaque touche empecherait de taper
    // « Jean-Pierre » apres « Jean ».
    const propre = Object.fromEntries(
      Object.entries(brouillon.modifications).map(([cle, v]) =>
        [cle, typeof v === 'string' ? (v.trim() || null) : v],
      ),
    ) as Partial<Lead>;

    majLead.mutate(propre, {
      onSuccess: () => {
        brouillon.vider();
        toast.success('Fiche enregistrée');
      },
    });
  };

  // Fermer en perdant sa saisie est le defaut que ce brouillon doit eviter :
  // on demande, plutot que de fermer ou de refuser.
  const [fermetureDemandee, setFermetureDemandee] = useState(false);

  /**
   * Fermeture differee, demandee depuis le dialogue de confirmation.
   *
   * Naviguer directement depuis le bouton demonterait la fiche -- donc le
   * dialogue avec elle -- pendant que Radix est en train de le fermer. Sa
   * couche modale ne rendrait alors jamais les clics au reste de la page.
   * On ferme d'abord, on navigue au rendu suivant.
   */
  const [fermerApresDialogue, setFermerApresDialogue] = useState(false);

  useEffect(() => {
    if (!fermerApresDialogue || fermetureDemandee) return;
    setFermerApresDialogue(false);
    fermer();
  }, [fermerApresDialogue, fermetureDemandee, fermer]);

  const fermerAvecGarde = useCallback(() => {
    if (brouillon.estModifie) setFermetureDemandee(true);
    else fermer();
  }, [brouillon.estModifie, fermer]);

  const journaliser = (type: 'call_outbound' | 'sms_outbound', contenu: string) => {
    if (!leadId) return;
    createCommunication({
      lead_id: leadId, type, direction: 'outbound',
      status: type === 'call_outbound' ? 'answered' : 'sent', content: contenu,
    })
      .then(() => queryClient.invalidateQueries({ queryKey: ['lead-communications', leadId] }))
      .catch((e: Error) => toast.error(e.message));
  };

  const appeler = () => {
    if (!lead?.phone) return;
    window.location.href = `tel:${lead.phone}`;
    journaliser('call_outbound', 'Appel depuis la fiche');
  };

  const envoyerSms = () => {
    if (!lead?.phone) return;
    window.location.href = `sms:${lead.phone}`;
    journaliser('sms_outbound', 'SMS depuis la fiche');
  };

  const demanderDocuments = () => {
    if (!lead?.phone) return;
    const prenom = lead.first_name?.trim() ?? '';
    const message = `Bonjour ${prenom}, pour avancer sur votre dossier pare-brise il nous manque votre carte grise et votre attestation d'assurance. Merci de nous les envoyer. Relais Pare-Brise`;
    window.location.href = `sms:${lead.phone}?body=${encodeURIComponent(message)}`;
    journaliser('sms_outbound', message);
    majLead.mutate({ status: 'documents_requested' });
  };

  const reporterRelance = () => {
    const demain = new Date();
    demain.setDate(demain.getDate() + 1);
    demain.setHours(9, 0, 0, 0);
    majLead.mutate({ next_action_at: demain.toISOString() }, {
      onSuccess: () => {
        toast.success('Reporté à demain');
        if (suivant) allerVers(suivant); else fermer();
      },
    });
  };

  const terminerRelance = () => {
    const demain = new Date();
    demain.setDate(demain.getDate() + 1);
    demain.setHours(9, 0, 0, 0);
    majLead.mutate({ next_action_at: demain.toISOString() }, {
      onSuccess: () => {
        toast.success(`${lead ? leadName(lead) : 'Dossier'} traité`);
        if (suivant) allerVers(suivant);
        else fermer();
      },
    });
  };

  if (isLoading || !lead) {
    return (
      <FicheOverlay
        entete={<Skeleton className="h-8 w-64 rounded-lg" />}
        onglets={ONGLETS} ongletActif={onglet} onChangerOnglet={setOnglet}
        onFermer={fermerAvecGarde} pleinePage={pleinePage}
      >
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </FicheOverlay>
    );
  }

  const entete = (
    <>
      <div className="flex items-center gap-2">
        <h1 className="truncate text-xl font-semibold sm:text-2xl">{leadName(lead)}</h1>
        <StatusBadge status={lead.status} />
      </div>

      {/* Ce qu'il faut savoir avant de decrocher, sans defiler. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {lead.phone && (
          <a href={`tel:${lead.phone}`} onClick={appeler}
             className="font-medium text-primary tabular hover:underline">
            {lead.phone}
          </a>
        )}
        {lead.city && (
          <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{lead.city}</span>
        )}
        {(lead.vehicle_make || lead.vehicle_model) && (
          <span className="flex items-center gap-1"><Car className="h-3.5 w-3.5" />{vehicleLabel(lead)}</span>
        )}
        {lead.vehicle_registration && (
          <span className="font-medium text-foreground tabular">{lead.vehicle_registration}</span>
        )}
        {lead.insurance && (
          <span className="flex items-center gap-1"><Shield className="h-3.5 w-3.5" />{lead.insurance}</span>
        )}
        {lead.glass_type && (
          <span className="font-medium text-foreground">{LIBELLE_VITRAGE[lead.glass_type]}</span>
        )}
        {lead.has_adas_camera && lead.glass_type === 'pare_brise' && (
          <span className="flex items-center gap-1 rounded-full bg-due-soft px-2 py-0.5 text-xs font-medium text-due">
            <AlertTriangle className="h-3 w-3" />Calibrage
          </span>
        )}
      </div>

      <div className="mt-3">
        <LeadPipeline
          statut={lead.status}
          onChangerStatut={(statut: LeadStatus) => majLead.mutate({ status: statut })}
          desactive={majLead.isPending}
        />
      </div>

      <div className="mt-3 hidden flex-wrap gap-2 sm:flex">
        <Button size="sm" variant="outline" className="rounded-full"
          onClick={appeler} disabled={!lead.phone}>
          <Phone className="mr-1.5 h-3.5 w-3.5" />Appeler
        </Button>
        <Button size="sm" variant="outline" className="rounded-full"
          onClick={envoyerSms} disabled={!lead.phone}>
          <MessageSquare className="mr-1.5 h-3.5 w-3.5" />SMS
        </Button>
        <Button size="sm" variant="outline" className="rounded-full"
          onClick={demanderDocuments} disabled={!lead.phone}>
          <FileText className="mr-1.5 h-3.5 w-3.5" />Documents
        </Button>
        <Button size="sm" variant="outline" className="rounded-full"
          onClick={() => toast.info('La prise de rendez-vous arrive avec le module Planning')}>
          <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />RDV
        </Button>
        {lead.contact_id && (
          <Button size="sm" variant="ghost" className="rounded-full"
            onClick={() => navigate(`/clients/${lead.contact_id}`, { state: { background: fondDepuis(location) } })}>
            <User className="mr-1.5 h-3.5 w-3.5" />Fiche client
          </Button>
        )}
      </div>
    </>
  );

  const piedDePage = brouillon.estModifie ? (
    <BarreEnregistrement
      nombreModifications={brouillon.champsModifies.length}
      champs={brouillon.champsModifies.map((c) => LIBELLE_CHAMP_LEAD[c] ?? String(c))}
      enCours={majLead.isPending}
      onEnregistrer={enregistrer}
      onAnnuler={brouillon.annuler}
    />
  ) : etat.mode === 'relance' ? (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button size="sm" variant="outline" className="rounded-full"
        disabled={majLead.isPending} onClick={reporterRelance}>
        <Clock className="mr-1.5 h-3.5 w-3.5" />Reporter
      </Button>
      <Button size="sm" className="rounded-full"
        disabled={majLead.isPending} onClick={terminerRelance}>
        {majLead.isPending
          ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          : <Check className="mr-1.5 h-3.5 w-3.5" />}
        Terminer la relance
      </Button>
      {suivant && (
        <Button size="sm" variant="ghost" className="rounded-full"
          onClick={() => allerVers(suivant)}>
          Client suivant<ChevronRight className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  ) : undefined;

  return (
    <FicheOverlay
      entete={entete}
      onglets={ONGLETS}
      ongletActif={onglet}
      onChangerOnglet={setOnglet}
      onFermer={fermerAvecGarde}
      pleinePage={pleinePage}
      piedDePage={piedDePage}
      navigation={liste.length > 1 ? {
        position: position + 1,
        total: liste.length,
        precedent: precedent ? () => allerVers(precedent) : null,
        suivant: suivant ? () => allerVers(suivant) : null,
      } : undefined}
      actionsMobile={
        <>
          <ActionMobile icone={Phone} label="Appeler" onClick={appeler} desactive={!lead.phone} />
          <ActionMobile icone={MessageSquare} label="SMS" onClick={envoyerSms} desactive={!lead.phone} />
          <ActionMobile icone={FileText} label="Documents" onClick={demanderDocuments} desactive={!lead.phone} />
        </>
      }
    >
      <DossierContenu
        lead={brouillon.valeur ?? lead}
        profiles={profiles ?? []}
        onglet={onglet}
        onUpdate={brouillon.modifier}
        enregistrement={majLead.isPending}
      />

      <AlertDialog open={fermetureDemandee} onOpenChange={setFermetureDemandee}>
        <AlertDialogContent className="sm:rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Modifications non enregistrées</AlertDialogTitle>
            <AlertDialogDescription>
              {brouillon.champsModifies.length} champ
              {brouillon.champsModifies.length > 1 ? 's ont' : ' a'} été modifié
              {brouillon.champsModifies.length > 1 ? 's' : ''} sans être enregistré
              {brouillon.champsModifies.length > 1 ? 's' : ''} :{' '}
              {brouillon.champsModifies
                .map((c) => LIBELLE_CHAMP_LEAD[c] ?? String(c))
                .join(', ')}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Continuer la saisie</AlertDialogCancel>
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => {
                brouillon.annuler();
                setFermetureDemandee(false);
                setFermerApresDialogue(true);
              }}
            >
              Fermer sans enregistrer
            </Button>
            <AlertDialogAction
              className="rounded-full"
              onClick={() => {
                setFermetureDemandee(false);
                majLead.mutate(brouillon.modifications, {
                  onSuccess: () => {
                    brouillon.vider();
                    toast.success('Fiche enregistrée');
                    setFermerApresDialogue(true);
                  },
                });
              }}
            >
              Enregistrer et fermer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FicheOverlay>
  );
}
