import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Phone, MessageSquare, Mail, MapPin, Car, History, Wrench,
  BellOff, ChevronRight, Plus, Loader2, CalendarClock, StickyNote,
  Send, CheckCircle2, Clock3, AlertTriangle, DatabaseZap,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { ChampAdresse } from '@/components/ChampAdresse';
import { Textarea } from '@/components/ui/textarea';
import { ProcedureAssureur } from '@/features/leads/procedure-assureur';
import { BarreEnregistrement } from '@/components/BarreEnregistrement';
import { useBrouillon, useAvertirSiModifie } from '@/hooks/use-brouillon';
import { messageErreurBase } from '@/lib/erreurs';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { FicheOverlay, ActionMobile, type OngletFiche } from '@/features/fiche/fiche-overlay';
import { StatusBadge } from '@/features/leads/status-badge';
import { LIBELLE_VITRAGE, formatDateTime, formatDate } from '@/features/leads/lead-shared';
import {
  fetchContactById, fetchSyntheseClient, fetchInterventionsClient,
  fetchVehiclesForContact, updateContact, creerInterventionPourClient,
  fetchSuiviClient,
} from '@/services/contacts-service';
import { fetchAffairesByContactId } from '@/services/affaires-service';
import { createNote } from '@/services/activity-service';
import { etatApresRetour, etatVersFiche } from '@/features/dossier/dossier-constants';
import { ClientDocumentHistory } from '@/features/client-documents/client-document-history';
import { FacturationClient } from '@/features/billing/facturation-client';
import { FacturesArchivees } from '@/features/billing/factures-archivees';
import { useAuth } from '@/features/auth/auth-context';
import { cheminAutorise } from '@/config/permissions';
import type { EtatOuvertureDossier } from '@/features/dossier/dossier-constants';
import type { SyntheseClient } from '@/services/contacts-service';
import type { AffaireVitrage, Lead, Contact, Communication, Note, Task } from '@/types';

type OngletClient = 'apercu' | 'suivi' | 'interventions' | 'facturation' | 'documents' | 'vehicules';

const LIBELLE_CHAMP_CLIENT: Partial<Record<keyof Contact, string>> = {
  first_name: 'Prénom', last_name: 'Nom', phone: 'Téléphone', email: 'Email',
  address: 'Adresse', city: 'Ville', postal_code: 'Code postal',
  sms_consent: 'Consentement SMS', email_consent: 'Consentement email',
  unsubscribed: 'Désinscription', notes: 'Notes',
};

const ONGLETS: readonly OngletFiche<OngletClient>[] = [
  { cle: 'apercu', label: "Vue d'ensemble" },
  { cle: 'suivi', label: 'Suivi & échanges' },
  { cle: 'interventions', label: 'Interventions' },
  { cle: 'facturation', label: 'Facturation' },
  { cle: 'documents', label: 'Documents' },
  { cle: 'vehicules', label: 'Véhicules' },
];

export function ClientModal({ pleinePage }: { pleinePage?: boolean }) {
  const { contactId } = useParams<{ contactId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [onglet, setOnglet] = useState<OngletClient>('apercu');
  const { profile } = useAuth();

  // Les factures ne sont lisibles que par ceux qui y ont droit -- la regle
  // vit dans la base. Sans ce filtre, un conseiller verrait un onglet
  // Facturation systematiquement vide.
  const voitFacturation = cheminAutorise('/billing', profile?.role ?? null);
  const onglets = useMemo(
    () => (voitFacturation ? ONGLETS : ONGLETS.filter((o) => o.cle !== 'facturation')),
    [voitFacturation],
  );

  const { data: client, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['client', contactId],
    queryFn: () => fetchContactById(contactId as string),
    enabled: !!contactId,
  });
  const { data: synthese } = useQuery({
    queryKey: ['client-synthese', contactId],
    queryFn: () => fetchSyntheseClient(contactId as string),
    enabled: !!contactId,
  });
  const { data: interventions } = useQuery({
    queryKey: ['client-interventions', contactId],
    queryFn: () => fetchInterventionsClient(contactId as string),
    enabled: !!contactId,
  });
  const { data: affaires, isLoading: affairesChargees } = useQuery({
    queryKey: ['affaires-vitrage', 'contact', contactId],
    queryFn: () => fetchAffairesByContactId(contactId as string),
    enabled: !!contactId,
  });
  const { data: vehicules } = useQuery({
    queryKey: ['client-vehicules', contactId],
    queryFn: () => fetchVehiclesForContact(contactId as string),
    enabled: !!contactId && onglet === 'vehicules',
  });
  const idsInterventions = useMemo(
    () => (interventions ?? []).map((i) => i.id),
    [interventions],
  );
  const { data: suivi, isLoading: suiviCharge } = useQuery({
    queryKey: ['client-suivi', contactId, idsInterventions],
    queryFn: () => fetchSuiviClient(contactId as string, idsInterventions),
    enabled: !!contactId && interventions !== undefined && onglet === 'suivi',
  });

  const queryClient = useQueryClient();

  const brouillon = useBrouillon<Contact>(client ?? undefined, contactId);
  useAvertirSiModifie(brouillon.estModifie);

  const [fermetureDemandee, setFermetureDemandee] = useState(false);
  const [nouvelleNote, setNouvelleNote] = useState('');

  const majClient = useMutation({
    mutationFn: async (updates: Partial<Contact>) => {
      await updateContact(contactId as string, updates);
    },
    onSuccess: () => {
      brouillon.vider();
      queryClient.invalidateQueries({ queryKey: ['client', contactId] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success('Fiche client enregistrée');
    },
    onError: (e: Error) => toast.error(messageErreurBase(e.message)),
  });

  // Un client qui revient ouvre une nouvelle intervention : c'est le geste
  // central du modele, et il n'existait nulle part depuis la fiche client.
  const nouvelleIntervention = useMutation({
    mutationFn: () => creerInterventionPourClient(client as Contact),
    onSuccess: (lead) => {
      queryClient.invalidateQueries({ queryKey: ['client-interventions', contactId] });
      queryClient.invalidateQueries({ queryKey: ['client-synthese', contactId] });
      queryClient.invalidateQueries({ queryKey: ['resumes-clients'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Intervention créée');
      navigate(`/interventions/${lead.id}`, { state: etatVersFiche(location) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ajouterNote = useMutation({
    mutationFn: async () => {
      const { error } = await createNote({
        contact_id: contactId as string,
        content: nouvelleNote.trim(),
      });
      if (error) throw new Error(error);
    },
    onSuccess: () => {
      setNouvelleNote('');
      queryClient.invalidateQueries({ queryKey: ['client-suivi', contactId] });
      toast.success('Note ajoutée au suivi client');
    },
    onError: (e: Error) => toast.error(messageErreurBase(e.message)),
  });

  const enregistrer = (apres?: () => void) => {
    const propre = Object.fromEntries(
      Object.entries(brouillon.modifications).map(([cle, v]) =>
        [cle, typeof v === 'string' ? (v.trim() || null) : v],
      ),
    ) as Partial<Contact>;

    majClient.mutate(propre, { onSuccess: () => apres?.() });
  };

  const etat = useMemo(
    () => (location.state ?? {}) as EtatOuvertureDossier,
    [location.state],
  );

  // Une fermeture peut arriver par le bouton, le fond ou Echap presque au
  // meme instant. Une seule navigation doit gagner, sinon la fiche peut etre
  // demontee pendant qu'une couche modale rend encore les clics au document.
  const fermetureEnCours = useRef(false);
  const fermer = useCallback(() => {
    if (fermetureEnCours.current) return;
    fermetureEnCours.current = true;

    if (etat.retour) {
      const { pathname, search, hash } = etat.retour;
      navigate(`${pathname}${search}${hash}`, {
        replace: true,
        state: etatApresRetour(etat),
      });
      return;
    }

    if (pleinePage || !etat.background) {
      navigate('/contacts', { replace: true });
      return;
    }

    const { pathname, search, hash } = etat.background;
    navigate(`${pathname}${search}${hash}`, { replace: true });
  }, [etat, navigate, pleinePage]);

  /** Attend la fin de l'animation Radix avant de demonter la fiche. */
  const minuteurFermeture = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (minuteurFermeture.current !== null) clearTimeout(minuteurFermeture.current);
    };
  }, []);

  const fermerApresDialogue = useCallback(() => {
    setFermetureDemandee(false);
    if (minuteurFermeture.current !== null) return;

    minuteurFermeture.current = setTimeout(() => {
      minuteurFermeture.current = null;
      fermer();
    }, 250);
  }, [fermer]);

  const fermerAvecGarde = useCallback(() => {
    if (majClient.isPending) return;
    if (brouillon.estModifie) setFermetureDemandee(true);
    else fermer();
  }, [brouillon.estModifie, fermer, majClient.isPending]);

  // Depuis un client, on ouvre une intervention : la fiche dossier se
  // substitue a celle-ci, et Echap ramene ici sans garder deux fiches montees.
  const ouvrirIntervention = (leadId: string) => {
    navigate(`/interventions/${leadId}`, { state: etatVersFiche(location) });
  };
  const ouvrirAffaire = (affaire: AffaireVitrage) => {
    if (affaire.phase === 'leads' || affaire.phase === 'perdue') {
      if (affaire.lead_id) ouvrirIntervention(affaire.lead_id);
      return;
    }
    if (affaire.glass_case_id) navigate(`/glass?id=${affaire.glass_case_id}`);
    else if (affaire.lead_id) ouvrirIntervention(affaire.lead_id);
  };

  const nom = client
    ? [client.first_name, client.last_name].filter(Boolean).join(' ').trim() || client.phone || 'Client'
    : '';

  const appeler = () => { if (client?.phone) window.location.href = `tel:${client.phone}`; };
  const sms = () => { if (client?.phone) window.location.href = `sms:${client.phone}`; };
  const email = () => { if (client?.email) window.location.href = `mailto:${client.email}`; };

  if (isError || (!isLoading && !client)) {
    return (
      <FicheOverlay
        entete={<h1 className="text-xl font-semibold">Fiche client indisponible</h1>}
        onglets={onglets} ongletActif={onglet} onChangerOnglet={setOnglet}
        onFermer={fermer} pleinePage={pleinePage}
      >
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <AlertTriangle className="mb-3 h-8 w-8 text-destructive" />
          <p className="text-sm font-medium text-foreground">
            {client === null ? 'Ce client est introuvable.' : 'Impossible de charger cette fiche.'}
          </p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {(error as Error | null)?.message ?? 'La fiche a peut-être été supprimée.'}
          </p>
          <Button variant="outline" className="mt-4 rounded-full" onClick={() => void refetch()}>
            Réessayer
          </Button>
        </div>
      </FicheOverlay>
    );
  }

  if (isLoading || !client) {
    return (
      <FicheOverlay
        entete={<Skeleton className="h-8 w-64 rounded-lg" />}
        onglets={onglets} ongletActif={onglet} onChangerOnglet={setOnglet}
        onFermer={fermer} pleinePage={pleinePage}
      >
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </FicheOverlay>
    );
  }

  // L'assureur du dossier le plus recent : c'est celui qu'on cherche quand le
  // client rappelle, et il change rarement d'une intervention a l'autre.
  const assureurHabituel = (interventions ?? [])
    .map((i) => i.insurance)
    .find((a) => a != null && a.trim() !== '') ?? null;

  // Ce que l'ecran affiche : la fiche recouverte du brouillon en cours.
  const fiche = brouillon.valeur ?? client;

  const entete = (
    <>
      <div className="flex items-center gap-2">
        <h1 className="truncate text-xl font-semibold sm:text-2xl">{nom}</h1>
        {/* Le dossier Glass fait passer la personne en client. La fidelite
            reste mesuree par plusieurs factures, pas par de simples leads. */}
        {synthese && <BadgeClient estClient={synthese.est_client} />}
        {synthese && synthese.nb_factures > 1 && (
          <Badge variant="outline" className="shrink-0 rounded-full border-done/30 bg-done-soft text-done">
            Client fidèle
          </Badge>
        )}
        {client.unsubscribed && (
          <Badge variant="outline" className="shrink-0 rounded-full border-urgent/30 bg-urgent-soft text-urgent">
            <BellOff className="mr-1 h-3 w-3" />Désinscrit
          </Badge>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {client.phone && (
          <a href={`tel:${client.phone}`} className="font-medium text-primary tabular hover:underline">
            {client.phone}
          </a>
        )}
        {client.email && (
          <a href={`mailto:${client.email}`} className="truncate hover:underline">{client.email}</a>
        )}
        {client.city && (
          <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{client.city}</span>
        )}
        {synthese && (
          <span className="flex items-center gap-1">
            <Wrench className="h-3.5 w-3.5" />
            {synthese.nb_interventions} intervention{synthese.nb_interventions > 1 ? 's' : ''}
          </span>
        )}
      </div>
    </>
  );

  return (
    <FicheOverlay
      entete={entete}
      onglets={onglets}
      ongletActif={onglet}
      onChangerOnglet={setOnglet}
      onFermer={fermerAvecGarde}
      pleinePage={pleinePage}
      piedDePage={brouillon.estModifie ? (
        <BarreEnregistrement
          nombreModifications={brouillon.champsModifies.length}
          champs={brouillon.champsModifies.map((c) => LIBELLE_CHAMP_CLIENT[c] ?? String(c))}
          enCours={majClient.isPending}
          onEnregistrer={() => enregistrer()}
          onAnnuler={brouillon.annuler}
        />
      ) : undefined}
      actionsMobile={
        <>
          <ActionMobile icone={Phone} label="Appeler" onClick={appeler} desactive={!client.phone} />
          <ActionMobile icone={MessageSquare} label="SMS" onClick={sms} desactive={!client.phone} />
          <ActionMobile icone={Mail} label="Email" onClick={email} desactive={!client.email} />
        </>
      }
    >
      {onglet === 'vehicules' ? (
        <ListeVehicules vehicules={vehicules ?? []} />
      ) : onglet === 'facturation' ? (
        <FacturationClient contactId={contactId as string} />
      ) : onglet === 'documents' ? (
        <div className="space-y-6">
          {/* Les factures sont des documents du client comme les autres, et
              elles sont gardees chez nous : c'est ici qu'on les cherche. */}
          {voitFacturation && <FacturesArchivees contactId={contactId as string} />}
          <ClientDocumentHistory interventions={interventions ?? []} />
        </div>
      ) : onglet === 'interventions' ? (
        <ListeInterventions
          interventions={interventions ?? []}
          onOuvrir={ouvrirIntervention}
        />
      ) : onglet === 'suivi' ? (
        <SuiviRelationClient
          interventions={interventions ?? []}
          communications={suivi?.communications ?? []}
          notes={suivi?.notes ?? []}
          taches={suivi?.taches ?? []}
          chargement={suiviCharge}
          nouvelleNote={nouvelleNote}
          onNouvelleNote={setNouvelleNote}
          onAjouterNote={() => ajouterNote.mutate()}
          ajoutEnCours={ajouterNote.isPending}
          onOuvrir={ouvrirIntervention}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
          <div className="min-w-0 space-y-6">
            <PilotageClient interventions={interventions ?? []} onOuvrir={ouvrirIntervention} />
            {synthese && <Synthese synthese={synthese} />}
            <AffairesVitrageClient
              affaires={affaires ?? []}
              chargement={affairesChargees}
              onOuvrir={ouvrirAffaire}
            />
            {/* L'assureur du dernier dossier, avec sa procedure : c'est ce
                qu'on cherche quand le client rappelle. */}
            {assureurHabituel && (
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Assureur habituel
                </h3>
                <ProcedureAssureur nomSaisi={assureurHabituel} />
              </section>
            )}

            <section>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Interventions
                </h3>
                <Button
                  size="sm" variant="outline" className="h-7 rounded-full text-xs"
                  onClick={() => nouvelleIntervention.mutate()}
                  disabled={nouvelleIntervention.isPending}
                >
                  {nouvelleIntervention.isPending
                    ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                    : <Plus className="mr-1.5 h-3 w-3" />}
                  Nouvelle intervention
                </Button>
              </div>
              <ListeInterventions
                interventions={(interventions ?? []).slice(0, 5)}
                onOuvrir={ouvrirIntervention}
              />
            </section>
          </div>

          <div className="space-y-4">
            <ActionsClient
              telephone={fiche.phone}
              email={fiche.email}
              onAppeler={appeler}
              onSms={sms}
              onEmail={email}
            />
            {fiche.onify_customer_id && <OnifyClientCard client={fiche} />}
            <CoordonneesClient client={fiche} onModifier={brouillon.modifier} />
            <ConsentementsClient client={fiche} onModifier={brouillon.modifier} />

            <div className="rounded-xl border border-border p-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Notes
              </h3>
              <Textarea
                rows={4}
                value={fiche.notes ?? ''}
                placeholder="Particularités, préférences, historique de la relation…"
                className="rounded-lg"
                onChange={(e) => brouillon.modifier({ notes: e.target.value })}
              />
            </div>
            <Encart titre="Client depuis" lignes={[
              ['Créé le', formatDate(client.created_at)],
              ['Première intervention', synthese?.premiere_intervention
                ? formatDate(synthese.premiere_intervention) : null],
              ['Dernière intervention', synthese?.derniere_intervention
                ? formatDate(synthese.derniere_intervention) : null],
            ]} />
          </div>
        </div>
      )}

      <AlertDialog open={fermetureDemandee} onOpenChange={setFermetureDemandee}>
        <AlertDialogContent className="sm:rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Modifications non enregistrées</AlertDialogTitle>
            <AlertDialogDescription>
              {brouillon.champsModifies
                .map((c) => LIBELLE_CHAMP_CLIENT[c] ?? String(c))
                .join(', ')} — non enregistré
              {brouillon.champsModifies.length > 1 ? 's' : ''}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Continuer la saisie</AlertDialogCancel>
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => {
                brouillon.annuler();
                fermerApresDialogue();
              }}
            >
              Fermer sans enregistrer
            </Button>
            <Button
              className="rounded-full"
              disabled={majClient.isPending}
              onClick={() => {
                // Le dialogue reste ouvert tant que la base n'a pas confirme.
                // En cas d'erreur, la saisie et les actions restent disponibles.
                enregistrer(fermerApresDialogue);
              }}
            >
              Enregistrer et fermer
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FicheOverlay>
  );
}

const STATUTS_TERMINES = new Set<Lead['status']>(['lost', 'converted']);

function PilotageClient({
  interventions, onOuvrir,
}: {
  interventions: Lead[];
  onOuvrir: (leadId: string) => void;
}) {
  const ouvertes = interventions.filter((i) => !STATUTS_TERMINES.has(i.status));
  const avecEcheance = ouvertes
    .filter((i) => i.next_action_at)
    .sort((a, b) => (a.next_action_at as string).localeCompare(b.next_action_at as string));
  const prochaine = avecEcheance[0] ?? ouvertes[0] ?? null;
  const echeance = prochaine?.next_action_at ? new Date(prochaine.next_action_at) : null;
  const enRetard = echeance ? echeance.getTime() < Date.now() : false;

  if (!prochaine) {
    return (
      <section className="rounded-xl border border-done/30 bg-done-soft px-4 py-3">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-done" />
          <div>
            <p className="text-sm font-semibold text-done">Aucun dossier client en attente</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Toutes les interventions sont terminées ou classées.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={cn(
      'rounded-xl border px-4 py-3',
      enRetard ? 'border-urgent/30 bg-urgent-soft' : 'border-primary/20 bg-primary/5',
    )}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Dossier à piloter
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {prochaine.glass_type ? LIBELLE_VITRAGE[prochaine.glass_type] : 'Intervention'}
            </span>
            <StatusBadge status={prochaine.status} />
          </div>
          <p className={cn('mt-1 text-sm', enRetard ? 'font-medium text-urgent' : 'text-muted-foreground')}>
            {echeance
              ? `${enRetard ? 'Action en retard depuis le' : 'Prochaine action le'} ${formatDateTime(prochaine.next_action_at)}`
              : 'Aucune échéance manuelle — la cadence du statut s’applique.'}
          </p>
          {ouvertes.length > 1 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {ouvertes.length} interventions sont encore ouvertes pour ce client.
            </p>
          )}
        </div>
        <Button size="sm" className="shrink-0 rounded-full" onClick={() => onOuvrir(prochaine.id)}>
          Ouvrir le dossier
          <ChevronRight className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      </div>
    </section>
  );
}

function ActionsClient({
  telephone, email, onAppeler, onSms, onEmail,
}: {
  telephone: string | null;
  email: string | null;
  onAppeler: () => void;
  onSms: () => void;
  onEmail: () => void;
}) {
  return (
    <section className="hidden rounded-xl border border-border bg-card p-4 sm:block">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Contacter le client
      </h3>
      <div className="grid grid-cols-3 gap-2">
        <Button size="sm" className="rounded-full" onClick={onAppeler} disabled={!telephone}>
          <Phone className="mr-1.5 h-3.5 w-3.5" />Appeler
        </Button>
        <Button size="sm" variant="outline" className="rounded-full" onClick={onSms} disabled={!telephone}>
          <MessageSquare className="mr-1.5 h-3.5 w-3.5" />SMS
        </Button>
        <Button size="sm" variant="outline" className="rounded-full" onClick={onEmail} disabled={!email}>
          <Mail className="mr-1.5 h-3.5 w-3.5" />Email
        </Button>
      </div>
    </section>
  );
}

/** Donnees de reference importees depuis la fiche client Onify. */
function OnifyClientCard({ client }: { client: Contact }) {
  const phones = (client.onify_phones ?? []).filter(Boolean);
  const tags = (client.onify_tags ?? [])
    .map((tag) => (typeof tag === 'string' ? tag : JSON.stringify(tag)))
    .filter(Boolean);

  return (
    <section className="rounded-xl border border-primary/20 bg-primary/5 p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
        <DatabaseZap className="h-3.5 w-3.5" />Fiche Onify synchronisée
      </h3>
      <dl className="space-y-2 text-sm">
        <LigneOnify label="Identifiant" value={client.onify_customer_id} />
        <LigneOnify label="Entreprise" value={client.onify_company} />
        <LigneOnify label="Étape" value={client.onify_stage} />
        <LigneOnify label="Source" value={client.onify_source} />
        <LigneOnify label="Téléphones" value={phones.length ? phones.join(' · ') : null} />
        <LigneOnify label="Pays" value={client.onify_country} />
        <LigneOnify label="Tags" value={tags.length ? tags.join(', ') : null} />
        <LigneOnify
          label="Synchronisé"
          value={client.onify_synced_at ? formatDateTime(client.onify_synced_at) : null}
        />
      </dl>
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Ces informations viennent d’Onify. La copie intégrale reçue par l’API est conservée dans le CRM.
      </p>
    </section>
  );
}

function LigneOnify({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right text-xs font-medium text-foreground">{value}</dd>
    </div>
  );
}

interface EvenementClient {
  id: string;
  date: string;
  icone: typeof Phone;
  titre: string;
  detail: string | null;
  leadId: string | null;
}

const ICONE_COMMUNICATION: Record<string, typeof Phone> = {
  call_outbound: Phone, call_inbound: Phone, call_missed: Phone,
  sms_outbound: MessageSquare, sms_inbound: MessageSquare,
  email_outbound: Mail, email_inbound: Mail, voicemail: Phone,
};

const LIBELLE_COMMUNICATION: Record<string, string> = {
  call_outbound: 'Appel sortant', call_inbound: 'Appel entrant',
  call_missed: 'Appel manqué', sms_outbound: 'SMS envoyé',
  sms_inbound: 'SMS reçu', email_outbound: 'Email envoyé',
  email_inbound: 'Email reçu', voicemail: 'Message vocal',
};

function SuiviRelationClient({
  interventions, communications, notes, taches, chargement,
  nouvelleNote, onNouvelleNote, onAjouterNote, ajoutEnCours, onOuvrir,
}: {
  interventions: Lead[];
  communications: Communication[];
  notes: Note[];
  taches: Task[];
  chargement: boolean;
  nouvelleNote: string;
  onNouvelleNote: (valeur: string) => void;
  onAjouterNote: () => void;
  ajoutEnCours: boolean;
  onOuvrir: (leadId: string) => void;
}) {
  const evenements: EvenementClient[] = [
    ...communications.map((c) => ({
      id: `communication-${c.id}`,
      date: c.created_at,
      icone: ICONE_COMMUNICATION[c.type] ?? MessageSquare,
      titre: LIBELLE_COMMUNICATION[c.type] ?? 'Échange',
      detail: c.content,
      leadId: c.lead_id,
    })),
    ...notes.map((n) => ({
      id: `note-${n.id}`, date: n.created_at, icone: StickyNote,
      titre: 'Note client', detail: n.content, leadId: n.lead_id,
    })),
    ...taches.map((t) => ({
      id: `tache-${t.id}`, date: t.created_at, icone: CalendarClock,
      titre: `Tâche — ${t.title}`,
      detail: t.status === 'done'
        ? 'Terminée'
        : t.due_at ? `À faire le ${formatDateTime(t.due_at)}` : 'En attente',
      leadId: t.lead_id,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const interventionsParId = new Map(interventions.map((i) => [i.id, i]));
  const tachesOuvertes = taches.filter((t) => t.status === 'pending' || t.status === 'in_progress');
  const prochaineTache = [...tachesOuvertes]
    .filter((t) => t.due_at)
    .sort((a, b) => (a.due_at as string).localeCompare(b.due_at as string))[0];

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(260px,3fr)]">
      <section className="min-w-0">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Historique complet
          </h3>
          <span className="text-xs text-muted-foreground tabular">
            {evenements.length} événement{evenements.length > 1 ? 's' : ''}
          </span>
        </div>

        {chargement ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
          </div>
        ) : evenements.length === 0 ? (
          <div className="rounded-xl border border-border py-12 text-center text-sm text-muted-foreground">
            Aucun échange ni aucune tâche enregistré pour ce client.
          </div>
        ) : (
          <ol className="border-l border-border pl-4">
            {evenements.map((e) => {
              const intervention = e.leadId ? interventionsParId.get(e.leadId) : null;
              return (
                <li key={e.id} className="relative pb-5 last:pb-0">
                  <span className="absolute -left-[23px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-background">
                    <e.icone className="h-2.5 w-2.5 text-muted-foreground" />
                  </span>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <p className="text-sm font-medium text-foreground">{e.titre}</p>
                    <time className="text-xs text-muted-foreground tabular">{formatDateTime(e.date)}</time>
                  </div>
                  {e.detail && <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">{e.detail}</p>}
                  {intervention && (
                    <button
                      type="button"
                      className="mt-1 text-xs text-primary hover:underline"
                      onClick={() => onOuvrir(intervention.id)}
                    >
                      {intervention.glass_type ? LIBELLE_VITRAGE[intervention.glass_type] : 'Voir l’intervention'}
                      {intervention.vehicle_registration ? ` · ${intervention.vehicle_registration}` : ''}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <aside className="space-y-4">
        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5" />À faire
          </h3>
          {tachesOuvertes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune tâche client en attente.</p>
          ) : (
            <>
              <p className="text-2xl font-semibold tabular">{tachesOuvertes.length}</p>
              <p className="text-xs text-muted-foreground">
                tâche{tachesOuvertes.length > 1 ? 's' : ''} ouverte{tachesOuvertes.length > 1 ? 's' : ''}
              </p>
              {prochaineTache?.due_at && (
                <p className="mt-3 border-t border-border pt-3 text-sm">
                  Prochaine échéance : {formatDateTime(prochaineTache.due_at)}
                </p>
              )}
            </>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Ajouter une note client
          </h3>
          <Textarea
            rows={5}
            value={nouvelleNote}
            onChange={(e) => onNouvelleNote(e.target.value)}
            placeholder="Préférence, information durable, résumé d’appel…"
            className="rounded-lg"
          />
          <Button
            size="sm" className="mt-2 w-full rounded-full"
            disabled={!nouvelleNote.trim() || ajoutEnCours}
            onClick={onAjouterNote}
          >
            {ajoutEnCours
              ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              : <Send className="mr-1.5 h-3.5 w-3.5" />}
            Ajouter au suivi
          </Button>
        </section>
      </aside>
    </div>
  );
}

/**
 * Coordonnees editables.
 *
 * L'adresse passe par la Base Adresse Nationale : corriger la ville a la main
 * abandonne le code INSEE et les coordonnees, qui ne lui correspondraient plus.
 */
function CoordonneesClient({
  client, onModifier,
}: { client: Contact; onModifier: (u: Partial<Contact>) => void }) {
  const [recherche, setRecherche] = useState(
    [client.address, client.postal_code, client.city].filter(Boolean).join(' '),
  );

  return (
    <div className="rounded-xl border border-border p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Coordonnées
      </h3>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <ChampClient
            label="Prénom" valeur={client.first_name}
            onChange={(v) => onModifier({ first_name: v })}
          />
          <ChampClient
            label="Nom" valeur={client.last_name}
            onChange={(v) => onModifier({ last_name: v })}
          />
        </div>
        <ChampClient
          label="Téléphone" valeur={client.phone}
          onChange={(v) => onModifier({ phone: v })}
        />
        <ChampClient
          label="Email" type="email" valeur={client.email}
          onChange={(v) => onModifier({ email: v })}
        />

        <ChampAdresse
          label="Adresse"
          valeur={recherche}
          onValeurChange={(v) => {
            setRecherche(v);
            onModifier({
              address: v, citycode: null, latitude: null,
              longitude: null, geo_precision: null,
            });
          }}
          onChoisir={(a) => {
            setRecherche([a.address, a.postal_code, a.city].filter(Boolean).join(' '));
            onModifier(a);
          }}
        />

        <div className="grid grid-cols-2 gap-3">
          <ChampClient
            label="Ville" valeur={client.city}
            onChange={(v) => onModifier({ city: v })}
          />
          <ChampClient
            label="Code postal" valeur={client.postal_code}
            onChange={(v) => onModifier({ postal_code: v })}
          />
        </div>
      </div>
    </div>
  );
}

function ChampClient({
  label, valeur, onChange, type,
}: { label: string; valeur: string | null; onChange: (v: string) => void; type?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type={type}
        value={valeur ?? ''}
        placeholder="À renseigner"
        className="rounded-lg"
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/**
 * Consentements.
 *
 * Se desinscrire prime sur les deux consentements : c'est une demande
 * explicite du client, et laisser un consentement actif a cote laisserait une
 * campagne le rattraper.
 */
function ConsentementsClient({
  client, onModifier,
}: { client: Contact; onModifier: (u: Partial<Contact>) => void }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Consentements
      </h3>

      <div className="space-y-3">
        <LigneConsentement
          label="SMS"
          actif={client.sms_consent}
          desactive={client.unsubscribed}
          onChange={(v) => onModifier({ sms_consent: v })}
        />
        <LigneConsentement
          label="Email"
          actif={client.email_consent}
          desactive={client.unsubscribed}
          onChange={(v) => onModifier({ email_consent: v })}
        />
        <LigneConsentement
          label="Désinscrit de tout"
          actif={client.unsubscribed}
          onChange={(v) => onModifier(
            v ? { unsubscribed: true, sms_consent: false, email_consent: false }
              : { unsubscribed: false },
          )}
        />
      </div>

      {client.unsubscribed && (
        <p className="mt-3 text-xs text-muted-foreground">
          Ce client a demandé à ne plus être contacté. Aucune campagne ne
          l'atteindra tant que cette case est cochée.
        </p>
      )}
    </div>
  );
}

function LigneConsentement({
  label, actif, desactive, onChange,
}: { label: string; actif: boolean; desactive?: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-foreground">{label}</span>
      <Switch
        checked={actif}
        disabled={desactive}
        onCheckedChange={onChange}
        aria-label={label}
      />
    </div>
  );
}

const PHASE_AFFAIRE: Record<AffaireVitrage['phase'], { label: string; classe: string }> = {
  leads: { label: 'Leads', classe: 'border-primary/25 bg-primary/5 text-primary' },
  glass: { label: 'Glass', classe: 'border-primary/30 bg-primary/10 text-primary' },
  agenda: { label: 'Agenda', classe: 'border-warning/35 bg-warning/10 text-warning' },
  finance: { label: 'Finance', classe: 'border-done/30 bg-done-soft text-done' },
  perdue: { label: 'Perdue', classe: 'border-urgent/30 bg-urgent-soft text-urgent' },
};

const formatMontantAffaire = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

/** Une personne peut revenir : chaque demande garde donc sa propre affaire. */
function AffairesVitrageClient({
  affaires,
  chargement,
  onOuvrir,
}: {
  affaires: AffaireVitrage[];
  chargement: boolean;
  onOuvrir: (affaire: AffaireVitrage) => void;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Affaires vitrage
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Une ligne par demande, du lead jusqu’à la finance.
          </p>
        </div>
        {!chargement && (
          <Badge variant="outline" className="rounded-full text-[10px]">
            {affaires.length}
          </Badge>
        )}
      </div>

      {chargement ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      ) : affaires.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
          Aucune affaire vitrage pour ce contact.
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {affaires.map((affaire) => {
            const phase = PHASE_AFFAIRE[affaire.phase];
            const titre = affaire.glass_reference
              ? `Dossier ${affaire.glass_reference}`
              : `Demande du ${formatDate(affaire.created_at)}`;
            const finance = Number(affaire.invoiced_amount_ht || 0);
            const couts = Number(affaire.supplier_amount_ht || 0);
            const details = affaire.phase === 'agenda' && affaire.appointment_start_time
              ? `Rendez-vous le ${formatDateTime(affaire.appointment_start_time)}`
              : affaire.phase === 'finance'
                ? `${affaire.invoice_count} facture${affaire.invoice_count > 1 ? 's' : ''}`
                  + (finance ? ` · ${formatMontantAffaire.format(finance)} HT` : '')
                  + (couts ? ` · ${formatMontantAffaire.format(couts)} de coûts` : '')
                : affaire.phase === 'glass'
                  ? 'Dossier synchronisé depuis Onify'
                  : affaire.phase === 'perdue'
                    ? 'Demande classée perdue'
                    : 'Demande en cours dans Leads';
            const ouvrable = Boolean(affaire.glass_case_id || affaire.lead_id);

            return (
              <button
                key={affaire.id}
                type="button"
                disabled={!ouvrable}
                onClick={() => onOuvrir(affaire)}
                className="group min-w-0 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/30 hover:bg-primary/[0.03] disabled:cursor-default disabled:hover:border-border disabled:hover:bg-card"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-foreground">{titre}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{details}</span>
                  </span>
                  <Badge variant="outline" className={cn('shrink-0 rounded-full text-[10px]', phase.classe)}>
                    {phase.label}
                  </Badge>
                </span>
                <span className="mt-3 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                  <span>Créée le {formatDate(affaire.created_at)}</span>
                  {ouvrable && (
                    <span className="flex items-center gap-1 font-medium text-primary">
                      Ouvrir <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

/**
 * Ce que cette personne represente, mesure sur des faits.
 *
 * Le dossier Glass Onify est maintenant le passage normal de prospect a
 * client. La facture reste utile pour les anciens imports et la fidelite.
 */
function Synthese({ synthese }: { synthese: SyntheseClient }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Chiffre valeur={synthese.nb_interventions} label="Interventions" />
      <Chiffre
        valeur={synthese.nb_dossiers_glass}
        label={synthese.nb_dossiers_glass > 1 ? 'Dossiers Glass' : 'Dossier Glass'}
        accent={synthese.nb_dossiers_glass > 0}
      />
      <Chiffre
        valeur={synthese.nb_factures}
        label={synthese.nb_factures > 1 ? 'Factures' : 'Facture'}
      />
      <Chiffre
        valeur={synthese.est_client ? formatDate(synthese.client_depuis) : '—'}
        label="Client depuis"
      />
    </div>
  );
}

/**
 * Client ou prospect.
 *
 * La regle est celle du metier : on est client des qu'un vrai dossier Glass
 * existe dans Onify. Une facture importe aussi les clients historiques.
 */
function BadgeClient({ estClient }: { estClient: boolean }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'rounded-full text-[10px]',
        estClient
          ? 'border-success/25 bg-success-soft text-success'
          : 'border-border bg-muted text-muted-foreground',
      )}
    >
      {estClient ? 'Client' : 'Prospect'}
    </Badge>
  );
}

function Chiffre({ valeur, label, accent }: {
  valeur: number | string; label: string; accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className={cn('text-2xl font-semibold tabular', accent ? 'text-done' : 'text-foreground')}>
        {valeur}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function ListeInterventions({
  interventions, onOuvrir,
}: {
  interventions: Lead[];
  onOuvrir: (leadId: string) => void;
}) {
  if (interventions.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-10 text-center">
        <History className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Aucune intervention rattachée à ce client pour l’instant.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {interventions.map((i) => (
        <li key={i.id}>
          <button
            type="button"
            onClick={() => onOuvrir(i.id)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {i.glass_type ? LIBELLE_VITRAGE[i.glass_type] : 'Intervention'}
                {i.vehicle_registration && (
                  <span className="ml-2 text-xs text-muted-foreground tabular">
                    {i.vehicle_registration}
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground tabular">
                {formatDateTime(i.received_at || i.created_at)}
              </p>
            </div>
            <StatusBadge status={i.status} className="shrink-0" />
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function ListeVehicules({ vehicules }: { vehicules: { id: string; make: string | null; model: string | null; registration: string | null }[] }) {
  if (vehicules.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-10 text-center">
        <Car className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Aucun véhicule enregistré.</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {vehicules.map((v) => (
        <li key={v.id} className="flex items-center gap-3 px-4 py-3">
          <Car className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 text-sm">
            {[v.make, v.model].filter(Boolean).join(' ') || 'Véhicule'}
          </span>
          {v.registration && (
            <span className="text-sm font-medium tabular">{v.registration}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Encart({ titre, lignes }: { titre: string; lignes: [string, string | null][] }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {titre}
      </h3>
      <dl className="space-y-2">
        {lignes.map(([label, valeur]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
            <dd className={cn('min-w-0 truncate text-right text-sm',
              valeur ? 'text-foreground' : 'text-muted-foreground/50')}>
              {valeur ?? '—'}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
