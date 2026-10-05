import {
  AlertCircle, Camera, Car, CheckCircle2, Gift, MapPin, Phone, Shield,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { lienItineraire } from '@/services/adresse-service';
import { LIBELLE_VITRAGE, vehicleLabel } from '@/features/leads/lead-shared';
import type { Lead } from '@/types';

interface ResumeItemProps {
  icone: typeof Phone;
  titre: string;
  valeur: ReactNode;
  secondaire?: ReactNode;
  incomplet?: boolean;
}

const formatMontant = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
});

export function LeadOverviewSummary({ lead }: { lead: Lead }) {
  const adresseDifferente = Boolean(
    lead.intervention_address || lead.intervention_postal_code || lead.intervention_city,
  );
  const adresse = adresseDifferente ? {
    address: lead.intervention_address,
    postal_code: lead.intervention_postal_code,
    city: lead.intervention_city,
    latitude: lead.intervention_latitude,
    longitude: lead.intervention_longitude,
  } : {
    address: lead.address,
    postal_code: lead.postal_code,
    city: lead.city,
    latitude: lead.latitude,
    longitude: lead.longitude,
  };
  const adresseLisible = [adresse.address, adresse.postal_code, adresse.city]
    .filter(Boolean)
    .join(' ');
  const adresseComplete = Boolean(adresse.address && adresse.postal_code && adresse.city);
  const itineraire = lienItineraire(adresse);
  const vehicule = vehicleLabel(lead);
  const vehiculeLisible = vehicule === '—' ? '' : vehicule;
  const manquants = [
    !lead.phone && 'Téléphone',
    !adresseComplete && "Adresse d'intervention",
    !lead.vehicle_registration && 'Immatriculation',
    !lead.glass_type && 'Vitrage',
    !lead.insurance && 'Assurance',
    !lead.offer && 'Cadeau / offre',
  ].filter((item): item is string => Boolean(item));
  const totalChamps = 6;
  const champsComplets = totalChamps - manquants.length;

  return (
    <section aria-labelledby="resume-lead" className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-muted/25 px-4 py-3">
        <div>
          <h2 id="resume-lead" className="text-sm font-semibold text-foreground">Résumé opérationnel</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Les informations utiles pour traiter la demande sans parcourir toute la fiche.
          </p>
        </div>
        <div className="min-w-44">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-muted-foreground">Fiche complétée</span>
            <span className="font-semibold tabular text-foreground">{champsComplets}/{totalChamps}</span>
          </div>
          <div
            className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="Complétude de la fiche"
            aria-valuemin={0}
            aria-valuemax={totalChamps}
            aria-valuenow={champsComplets}
          >
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${Math.round((champsComplets / totalChamps) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-px bg-border sm:grid-cols-2">
        <ResumeItem
          icone={Phone}
          titre="Contact"
          incomplet={!lead.phone}
          valeur={lead.phone ? (
            <a href={`tel:${lead.phone}`} className="font-semibold text-primary hover:underline">
              {lead.phone}
            </a>
          ) : 'Téléphone à renseigner'}
          secondaire={lead.email ? (
            <a href={`mailto:${lead.email}`} className="break-all hover:text-foreground hover:underline">
              {lead.email}
            </a>
          ) : 'E-mail non renseigné'}
        />

        <ResumeItem
          icone={Car}
          titre="Véhicule et vitrage"
          incomplet={!lead.vehicle_registration || !lead.glass_type}
          valeur={lead.vehicle_registration || vehiculeLisible || 'Véhicule à renseigner'}
          secondaire={
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {vehiculeLisible && lead.vehicle_registration ? <span>{vehiculeLisible}</span> : null}
              {lead.glass_type ? <span>{LIBELLE_VITRAGE[lead.glass_type]}</span> : <span>Vitrage à qualifier</span>}
              {lead.has_adas_camera && lead.glass_type === 'pare_brise' ? (
                <span className="inline-flex items-center gap-1 font-medium text-due">
                  <Camera className="h-3 w-3" /> Calibrage
                </span>
              ) : null}
            </span>
          }
        />

        <ResumeItem
          icone={MapPin}
          titre={adresseDifferente ? "Adresse d'intervention" : 'Adresse principale utilisée'}
          incomplet={!adresseComplete}
          valeur={adresseLisible || 'Adresse à renseigner'}
          secondaire={itineraire ? (
            <a href={itineraire} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
              Ouvrir l’itinéraire
            </a>
          ) : 'Aucun itinéraire disponible'}
        />

        <ResumeItem
          icone={Shield}
          titre="Assurance et offre"
          incomplet={!lead.insurance || !lead.offer}
          valeur={lead.insurance || 'Assurance à renseigner'}
          secondaire={
            <span className="space-y-1">
              <span className="flex items-start gap-1.5">
                <Gift className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{lead.offer || 'Cadeau / offre à renseigner'}</span>
              </span>
              {lead.franchise_amount != null ? (
                <span className="block">Reste à charge : {formatMontant.format(lead.franchise_amount)}</span>
              ) : null}
            </span>
          }
        />
      </div>

      <div className={cn(
        'flex items-start gap-2.5 border-t px-4 py-3 text-xs',
        manquants.length === 0 ? 'border-done/20 bg-done-soft text-done' : 'border-due/20 bg-due-soft text-foreground',
      )}>
        {manquants.length === 0 ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-due" />
        )}
        <div>
          <p className="font-medium">
            {manquants.length === 0
              ? 'Les informations essentielles sont complètes.'
              : `${manquants.length} information${manquants.length > 1 ? 's' : ''} à compléter`}
          </p>
          {manquants.length > 0 ? (
            <p className="mt-0.5 text-muted-foreground">{manquants.join(' · ')}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ResumeItem({ icone: Icone, titre, valeur, secondaire, incomplet }: ResumeItemProps) {
  return (
    <div className="min-w-0 bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icone className="h-3.5 w-3.5 shrink-0" />
        <span>{titre}</span>
        {incomplet ? <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-due">À compléter</span> : null}
      </div>
      <div className={cn('mt-2 break-words text-sm font-medium', incomplet && 'text-muted-foreground')}>
        {valeur}
      </div>
      {secondaire ? <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{secondaire}</div> : null}
    </div>
  );
}
