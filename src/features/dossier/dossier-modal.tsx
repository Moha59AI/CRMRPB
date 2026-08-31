import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X, ChevronLeft, ChevronRight, Phone, MessageSquare, FileText,
  CalendarPlus, Car, MapPin, Shield, AlertTriangle, Check, Clock, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { LeadPipeline } from '@/features/leads/lead-pipeline';
import { StatusBadge } from '@/features/leads/status-badge';
import { LIBELLE_VITRAGE, leadName, vehicleLabel } from '@/features/leads/lead-shared';
import { fetchLeadById, updateLead } from '@/services/leads-service';
import { fetchProfiles } from '@/services/profiles-service';
import { createCommunication } from '@/services/activity-service';
import { DossierContenu } from './dossier-contenu';
import { ONGLETS, type OngletDossier, type EtatOuvertureDossier } from './dossier-constants';
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
    navigate(`/dossiers/${id}`, { state: etat, replace: true });
    setOnglet('apercu');
  }, [navigate, etat]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fermer();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fermer]);

  const majLead = useMutation({
    mutationFn: (updates: Partial<Lead>) => updateLead(leadId as string, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['relances'] });
      queryClient.invalidateQueries({ queryKey: ['relances-compteurs'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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

  const contenu = (
    <div
      className={cn(
        'flex flex-col overflow-hidden bg-background',
        pleinePage
          ? 'h-full w-full'
          : 'h-full w-full sm:h-[94vh] sm:max-h-[1000px] sm:w-[94vw] sm:max-w-[1600px] sm:rounded-2xl sm:border sm:border-border sm:shadow-2xl'
      )}
    >
      {isLoading || !lead ? (
        <div className="space-y-4 p-8">
          <Skeleton className="h-10 w-64 rounded-lg" />
          <Skeleton className="h-6 w-96 rounded-lg" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
        <>
          {/* ---- HEADER FIXE ---- */}
          <header className="shrink-0 border-b border-border px-4 pt-4 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-2">
                {liste.length > 0 && (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8 rounded-full"
                      disabled={!precedent}
                      onClick={() => precedent && allerVers(precedent)}
                      title="Dossier précédent"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="whitespace-nowrap text-xs text-muted-foreground tabular">
                      {position + 1} / {liste.length}
                    </span>
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8 rounded-full"
                      disabled={!suivant}
                      onClick={() => suivant && allerVers(suivant)}
                      title="Dossier suivant"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                <h1 className="truncate text-xl font-semibold sm:text-2xl">{leadName(lead)}</h1>
                <StatusBadge status={lead.status} />
              </div>

              <Button
                variant="ghost" size="icon"
                className="h-9 w-9 shrink-0 rounded-full hover:bg-muted"
                onClick={fermer} title="Fermer (Échap)"
              >
                <X className="h-5 w-5" />
                <span className="sr-only">Fermer</span>
              </Button>
            </div>

            {/* Identite metier : tout ce qu'il faut avant de decrocher */}
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

            {/* Actions rapides : masquees sur mobile, remplacees par la barre du bas */}
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
            </div>

            {/* Onglets : ils ne changent que le contenu */}
            <nav className="mt-3 flex gap-1 overflow-x-auto">
              {ONGLETS.map(({ cle, label }) => (
                <button
                  key={cle} type="button" onClick={() => setOnglet(cle)}
                  className={cn(
                    'whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors duration-100',
                    onglet === cle
                      ? 'border-primary font-medium text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                >
                  {label}
                </button>
              ))}
            </nav>
          </header>

          {/* ---- CONTENU SCROLLABLE ---- */}
          <div className="flex-1 overflow-y-auto scrollbar-thin p-4 sm:p-6">
            <DossierContenu
              lead={lead}
              profiles={profiles ?? []}
              onglet={onglet}
              onUpdate={(updates) => majLead.mutate(updates)}
              enregistrement={majLead.isPending}
            />
          </div>

          {/* ---- MODE RELANCE ---- */}
          {etat.mode === 'relance' && (
            <footer className="shrink-0 border-t border-border bg-muted/40 px-4 py-2.5 sm:px-6">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button size="sm" variant="outline" className="rounded-full"
                  disabled={majLead.isPending}
                  onClick={() => {
                    const demain = new Date();
                    demain.setDate(demain.getDate() + 1);
                    demain.setHours(9, 0, 0, 0);
                    majLead.mutate({ next_action_at: demain.toISOString() }, {
                      onSuccess: () => {
                        toast.success('Reporté à demain');
                        if (suivant) allerVers(suivant); else fermer();
                      },
                    });
                  }}>
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
            </footer>
          )}

          {/* ---- BARRE D'ACTIONS MOBILE ---- */}
          <footer className="flex shrink-0 items-center justify-around border-t border-border px-2 py-2 sm:hidden">
            <ActionMobile icone={Phone} label="Appeler" onClick={appeler} desactive={!lead.phone} />
            <ActionMobile icone={MessageSquare} label="SMS" onClick={envoyerSms} desactive={!lead.phone} />
            <ActionMobile icone={FileText} label="Documents" onClick={demanderDocuments} desactive={!lead.phone} />
          </footer>
        </>
      )}
    </div>
  );

  if (pleinePage) return contenu;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center animate-fade-in">
      {/* Le fond assombri ferme au clic, comme n'importe quelle surface superposee */}
      <button
        type="button" onClick={fermer} aria-label="Fermer la fiche"
        className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]"
      />
      <div className="relative z-10 h-full w-full sm:h-auto sm:w-auto">{contenu}</div>
    </div>
  );
}

function ActionMobile({
  icone: Icone, label, onClick, desactive,
}: {
  icone: typeof Phone; label: string; onClick: () => void; desactive?: boolean;
}) {
  return (
    <button
      type="button" onClick={onClick} disabled={desactive}
      className="flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-xs text-muted-foreground disabled:opacity-40"
    >
      <Icone className="h-5 w-5" />
      {label}
    </button>
  );
}
