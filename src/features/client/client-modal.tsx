import { useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Phone, MessageSquare, Mail, MapPin, Car, History, Wrench,
  BellOff, ChevronRight,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { FicheOverlay, ActionMobile, type OngletFiche } from '@/features/fiche/fiche-overlay';
import { StatusBadge } from '@/features/leads/status-badge';
import { LIBELLE_VITRAGE, formatDateTime, formatDate } from '@/features/leads/lead-shared';
import {
  fetchContactById, fetchSyntheseClient, fetchInterventionsClient,
  fetchVehiclesForContact,
} from '@/services/contacts-service';
import type { EtatOuvertureDossier } from '@/features/dossier/dossier-constants';
import type { Lead } from '@/types';

type OngletClient = 'apercu' | 'interventions' | 'vehicules';

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

  const etat = (location.state ?? {}) as EtatOuvertureDossier;

  const fermer = () => {
    if (pleinePage || !etat.background) navigate('/contacts');
    else navigate(-1);
  };

  // Depuis un client, on ouvre une intervention : la fiche dossier se
  // superpose a celle-ci, et Echap ramene ici.
  const ouvrirIntervention = (leadId: string) => {
    navigate(`/interventions/${leadId}`, { state: { background: location } });
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
      onFermer={fermer}
      pleinePage={pleinePage}
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
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Interventions
              </h3>
              <ListeInterventions
                interventions={(interventions ?? []).slice(0, 5)}
                onOuvrir={ouvrirIntervention}
              />
            </section>
          </div>

          <div className="space-y-4">
            <Encart titre="Coordonnées" lignes={[
              ['Téléphone', client.phone],
              ['Email', client.email],
              ['Adresse', client.address],
              ['Ville', client.city],
              ['Code postal', client.postal_code],
            ]} />
            <Encart titre="Consentements" lignes={[
              ['SMS', client.sms_consent ? 'Accordé' : 'Refusé'],
              ['Email', client.email_consent ? 'Accordé' : 'Refusé'],
              ['Désinscrit', client.unsubscribed ? 'Oui' : 'Non'],
            ]} />
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
    </FicheOverlay>
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
