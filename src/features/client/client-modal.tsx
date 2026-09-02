import { useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Phone, MessageSquare, Mail, MapPin, Car, History, Wrench,
  BellOff, ChevronRight, Plus, Loader2,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
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
} from '@/services/contacts-service';
import { fondDepuis } from '@/features/dossier/dossier-constants';
import type { EtatOuvertureDossier } from '@/features/dossier/dossier-constants';
import type { Lead, Contact } from '@/types';

type OngletClient = 'apercu' | 'interventions' | 'vehicules';

const LIBELLE_CHAMP_CLIENT: Partial<Record<keyof Contact, string>> = {
  first_name: 'Prénom', last_name: 'Nom', phone: 'Téléphone', email: 'Email',
  address: 'Adresse', city: 'Ville', postal_code: 'Code postal',
  sms_consent: 'Consentement SMS', email_consent: 'Consentement email',
  unsubscribed: 'Désinscription', notes: 'Notes',
};

const ONGLETS: readonly OngletFiche<OngletClient>[] = [
  { cle: 'apercu', label: "Vue d'ensemble" },
  { cle: 'interventions', label: 'Interventions' },
  { cle: 'vehicules', label: 'Véhicules' },
];

export function ClientModal({ pleinePage }: { pleinePage?: boolean }) {
  const { contactId } = useParams<{ contactId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [onglet, setOnglet] = useState<OngletClient>('apercu');

  const { data: client, isLoading } = useQuery({
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
  const { data: vehicules } = useQuery({
    queryKey: ['client-vehicules', contactId],
    queryFn: () => fetchVehiclesForContact(contactId as string),
    enabled: !!contactId,
  });

  const queryClient = useQueryClient();

  const brouillon = useBrouillon<Contact>(client ?? undefined, contactId);
  useAvertirSiModifie(brouillon.estModifie);

  const [fermetureDemandee, setFermetureDemandee] = useState(false);

  const majClient = useMutation({
    mutationFn: async (updates: Partial<Contact>) => {
      const { error } = await updateContact(contactId as string, updates);
      if (error) throw new Error(error);
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
    onSuccess: (r) => {
      if (r.error || !r.lead) {
        toast.error(r.error ?? 'Création impossible');
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['client-interventions', contactId] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Intervention créée');
      navigate(`/interventions/${r.lead.id}`, { state: { background: fondDepuis(location) } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const enregistrer = (apres?: () => void) => {
    const propre = Object.fromEntries(
      Object.entries(brouillon.modifications).map(([cle, v]) =>
        [cle, typeof v === 'string' ? (v.trim() || null) : v],
      ),
    ) as Partial<Contact>;

    majClient.mutate(propre, { onSuccess: () => apres?.() });
  };

  const etat = (location.state ?? {}) as EtatOuvertureDossier;

  const fermer = () => {
    if (pleinePage || !etat.background) navigate('/contacts');
    else navigate(-1);
  };

  // Depuis un client, on ouvre une intervention : la fiche dossier se
  // superpose a celle-ci, et Echap ramene ici.
  const ouvrirIntervention = (leadId: string) => {
    navigate(`/interventions/${leadId}`, { state: { background: fondDepuis(location) } });
  };

  const nom = client
    ? [client.first_name, client.last_name].filter(Boolean).join(' ').trim() || client.phone || 'Client'
    : '';

  const appeler = () => { if (client?.phone) window.location.href = `tel:${client.phone}`; };
  const sms = () => { if (client?.phone) window.location.href = `sms:${client.phone}`; };
  const email = () => { if (client?.email) window.location.href = `mailto:${client.email}`; };

  if (isLoading || !client) {
    return (
      <FicheOverlay
        entete={<Skeleton className="h-8 w-64 rounded-lg" />}
        onglets={ONGLETS} ongletActif={onglet} onChangerOnglet={setOnglet}
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
        {synthese && synthese.nb_interventions > 1 && (
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
      onglets={ONGLETS}
      ongletActif={onglet}
      onChangerOnglet={setOnglet}
      onFermer={() => {
        if (brouillon.estModifie) setFermetureDemandee(true);
        else fermer();
      }}
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
      ) : onglet === 'interventions' ? (
        <ListeInterventions
          interventions={interventions ?? []}
          onOuvrir={ouvrirIntervention}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
          <div className="min-w-0 space-y-6">
            {synthese && <Synthese synthese={synthese} />}
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
        <AlertDialogContent className="rounded-2xl">
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
                setFermetureDemandee(false);
                fermer();
              }}
            >
              Fermer sans enregistrer
            </Button>
            <AlertDialogAction
              className="rounded-full"
              onClick={() => {
                setFermetureDemandee(false);
                enregistrer(fermer);
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

function Synthese({ synthese }: { synthese: { nb_interventions: number; nb_converties: number } }) {
  const taux = synthese.nb_interventions > 0
    ? Math.round((synthese.nb_converties / synthese.nb_interventions) * 100)
    : 0;

  return (
    <div className="grid grid-cols-3 gap-3">
      <Chiffre valeur={synthese.nb_interventions} label="Interventions" />
      <Chiffre valeur={synthese.nb_converties} label="Converties" accent />
      <Chiffre valeur={`${taux} %`} label="Taux de conversion" />
    </div>
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
