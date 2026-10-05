import {
  AlertCircle, Car, CheckCircle2, MapPin, Phone, Shield,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { lienItineraire } from '@/services/adresse-service';
import { LIBELLE_VITRAGE } from '@/features/leads/lead-shared';
import { LeadAddressFields, type ValeurAdresseLead } from '@/features/leads/lead-address-fields';
import { ChampAssureur } from '@/features/leads/champ-assureur';
import type { GlassType, Lead } from '@/types';

interface ResumeItemProps {
  icone: typeof Phone;
  titre: string;
  incomplet?: boolean;
  children: ReactNode;
  action?: ReactNode;
}

interface LeadOverviewSummaryProps {
  lead: Lead;
  onUpdate: (updates: Partial<Lead>) => void;
  disabled?: boolean;
}

export function LeadOverviewSummary({ lead, onUpdate, disabled }: LeadOverviewSummaryProps) {
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
  const adresseComplete = Boolean(adresse.address && adresse.postal_code && adresse.city);
  const itineraire = lienItineraire(adresse);
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
    <section
      aria-labelledby="resume-lead"
      className="overflow-visible rounded-xl border border-border bg-card"
    >
      <div className="grid gap-3 border-b border-border bg-muted/25 px-3 py-3 sm:px-4 md:grid-cols-[minmax(0,1fr)_minmax(12rem,18rem)] md:items-center">
        <div>
          <h2 id="resume-lead" className="text-sm font-semibold text-foreground">Résumé opérationnel</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Modifiez directement les informations utiles au traitement de la demande.
          </p>
        </div>
        <div className="min-w-0">
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

      <div className="grid gap-px bg-border xl:grid-cols-2">
        <ResumeItem
          icone={Phone}
          titre="Contact"
          incomplet={!lead.phone}
        >
          <ContactEditor lead={lead} onUpdate={onUpdate} disabled={disabled} />
        </ResumeItem>

        <ResumeItem
          icone={Car}
          titre="Véhicule et vitrage"
          incomplet={!lead.vehicle_registration || !lead.glass_type}
        >
          <VehiculeEditor lead={lead} onUpdate={onUpdate} disabled={disabled} />
        </ResumeItem>

        <ResumeItem
          icone={MapPin}
          titre={adresseDifferente ? "Adresse d'intervention" : 'Adresse principale utilisée'}
          incomplet={!adresseComplete}
          action={itineraire ? (
            <a href={itineraire} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
              Ouvrir l’itinéraire
            </a>
          ) : undefined}
        >
          <AdresseEditor lead={lead} onUpdate={onUpdate} disabled={disabled} />
        </ResumeItem>

        <ResumeItem
          icone={Shield}
          titre="Assurance et offre"
          incomplet={!lead.insurance || !lead.offer}
        >
          <AssuranceEditor lead={lead} onUpdate={onUpdate} disabled={disabled} />
        </ResumeItem>
      </div>

      <div className="border-t border-primary/15 bg-primary/5 px-3 py-2 text-xs text-muted-foreground sm:px-4">
        Les champs sont toujours modifiables. Les changements restent en brouillon jusqu’à ce que vous appuyiez sur « Enregistrer ».
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

function ResumeItem({ icone: Icone, titre, incomplet, children, action }: ResumeItemProps) {
  return (
    <div className="min-w-0 bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-muted-foreground">
        <span className="inline-flex min-w-0 items-center gap-2">
          <Icone className="h-3.5 w-3.5 shrink-0" />
          <span>{titre}</span>
        </span>
        <span className="ml-auto flex items-center gap-3">
          {action}
          {incomplet ? <span className="text-[10px] font-semibold uppercase tracking-wide text-due">À compléter</span> : null}
        </span>
      </div>
      <div className="mt-3 min-w-0">{children}</div>
    </div>
  );
}

function ContactEditor({ lead, onUpdate, disabled }: LeadOverviewSummaryProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <ChampResume id={`resume-${lead.id}-prenom`} label="Prénom" value={lead.first_name ?? ''}
        disabled={disabled} onChange={(value) => onUpdate({ first_name: value })} />
      <ChampResume id={`resume-${lead.id}-nom`} label="Nom" value={lead.last_name ?? ''}
        disabled={disabled} onChange={(value) => onUpdate({ last_name: value })} />
      <ChampResume id={`resume-${lead.id}-telephone`} label="Téléphone" value={lead.phone ?? ''}
        type="tel" disabled={disabled} onChange={(value) => onUpdate({ phone: value })} />
      <ChampResume id={`resume-${lead.id}-email`} label="E-mail" value={lead.email ?? ''}
        type="email" disabled={disabled} onChange={(value) => onUpdate({ email: value })} />
    </div>
  );
}

function VehiculeEditor({ lead, onUpdate, disabled }: LeadOverviewSummaryProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <ChampResume id={`resume-${lead.id}-immatriculation`} label="Immatriculation"
        value={lead.vehicle_registration ?? ''} disabled={disabled} uppercase
        onChange={(value) => onUpdate({ vehicle_registration: value.toUpperCase() })} />
      <ChampResume id={`resume-${lead.id}-marque`} label="Marque" value={lead.vehicle_make ?? ''}
        disabled={disabled} onChange={(value) => onUpdate({ vehicle_make: value })} />
      <ChampResume id={`resume-${lead.id}-modele`} label="Modèle" value={lead.vehicle_model ?? ''}
        disabled={disabled} onChange={(value) => onUpdate({ vehicle_model: value })} />
      <div className="space-y-1.5">
        <Label htmlFor={`resume-${lead.id}-vitrage`}>Vitrage</Label>
        <Select
          value={lead.glass_type ?? ''}
          disabled={disabled}
          onValueChange={(value) => onUpdate({ glass_type: value as GlassType })}
        >
          <SelectTrigger id={`resume-${lead.id}-vitrage`} className="rounded-lg">
            <SelectValue placeholder="À qualifier" />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(LIBELLE_VITRAGE) as GlassType[]).map((type) => (
              <SelectItem key={type} value={type}>{LIBELLE_VITRAGE[type]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={`resume-${lead.id}-adas`}>Caméra ADAS</Label>
        <Select
          value={lead.has_adas_camera == null ? '' : lead.has_adas_camera ? 'oui' : 'non'}
          disabled={disabled}
          onValueChange={(value) => onUpdate({ has_adas_camera: value === 'oui' })}
        >
          <SelectTrigger id={`resume-${lead.id}-adas`} className="rounded-lg">
            <SelectValue placeholder="À vérifier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="oui">Oui, caméra présente</SelectItem>
            <SelectItem value="non">Non</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function AdresseEditor({ lead, onUpdate, disabled }: LeadOverviewSummaryProps) {
  const aUneAdresseDifferente = Boolean(
    lead.intervention_address || lead.intervention_postal_code || lead.intervention_city,
  );
  const [adresseDifferente, setAdresseDifferente] = useState(aUneAdresseDifferente);

  useEffect(() => setAdresseDifferente(aUneAdresseDifferente), [lead.id, aUneAdresseDifferente]);

  const adresse: ValeurAdresseLead = adresseDifferente ? {
    address: lead.intervention_address,
    postal_code: lead.intervention_postal_code,
    city: lead.intervention_city,
    citycode: lead.intervention_citycode,
    latitude: lead.intervention_latitude,
    longitude: lead.intervention_longitude,
    geo_precision: lead.intervention_geo_precision,
  } : {
    address: lead.address,
    postal_code: lead.postal_code,
    city: lead.city,
    citycode: lead.citycode,
    latitude: lead.latitude,
    longitude: lead.longitude,
    geo_precision: lead.geo_precision,
  };

  const mettreAJour = (updates: Partial<ValeurAdresseLead>) => {
    if (!adresseDifferente) {
      onUpdate(updates);
      return;
    }

    const leadUpdates: Partial<Lead> = {};
    if ('address' in updates) leadUpdates.intervention_address = updates.address ?? null;
    if ('postal_code' in updates) leadUpdates.intervention_postal_code = updates.postal_code ?? null;
    if ('city' in updates) leadUpdates.intervention_city = updates.city ?? null;
    if ('citycode' in updates) leadUpdates.intervention_citycode = updates.citycode ?? null;
    if ('latitude' in updates) leadUpdates.intervention_latitude = updates.latitude ?? null;
    if ('longitude' in updates) leadUpdates.intervention_longitude = updates.longitude ?? null;
    if ('geo_precision' in updates) leadUpdates.intervention_geo_precision = updates.geo_precision ?? null;
    onUpdate(leadUpdates);
  };

  const changerAdresseDifferente = (active: boolean) => {
    setAdresseDifferente(active);
    if (!active) {
      onUpdate({
        intervention_address: null,
        intervention_postal_code: null,
        intervention_city: null,
        intervention_citycode: null,
        intervention_latitude: null,
        intervention_longitude: null,
        intervention_geo_precision: null,
      });
    }
  };

  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-muted/20 p-3">
        <Checkbox
          checked={adresseDifferente}
          disabled={disabled}
          onCheckedChange={(value) => changerAdresseDifferente(value === true)}
          className="mt-0.5"
        />
        <span>
          <span className="block text-xs font-medium text-foreground">Autre adresse d’intervention</span>
          <span className="block text-[11px] text-muted-foreground">Sinon, l’adresse principale est utilisée.</span>
        </span>
      </label>
      <LeadAddressFields
        idPrefix={`resume-${lead.id}-${adresseDifferente ? 'intervention' : 'principale'}`}
        value={adresse}
        onUpdate={mettreAJour}
        disabled={disabled}
      />
    </div>
  );
}

function AssuranceEditor({ lead, onUpdate, disabled }: LeadOverviewSummaryProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <ChampAssureur
        id={`resume-${lead.id}-assurance`}
        valeur={lead.insurance}
        onChange={(value) => onUpdate({ insurance: value })}
        desactive={disabled}
      />
      <div className="space-y-1.5">
        <Label htmlFor={`resume-${lead.id}-franchise`}>Reste à charge</Label>
        <div className="relative">
          <Input
            id={`resume-${lead.id}-franchise`}
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={lead.franchise_amount ?? ''}
            disabled={disabled}
            className="rounded-lg pr-7 tabular"
            placeholder="Non su"
            onChange={(event) => {
              const value = event.target.value;
              onUpdate({ franchise_amount: value === '' ? null : Number(value) });
            }}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
        </div>
      </div>
      <div className="sm:col-span-2">
        <ChampResume id={`resume-${lead.id}-offre`} label="Cadeau / offre"
          value={lead.offer ?? ''} disabled={disabled}
          onChange={(value) => onUpdate({ offer: value })} />
      </div>
    </div>
  );
}

interface ChampResumeProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  type?: 'text' | 'tel' | 'email';
  uppercase?: boolean;
}

function ChampResume({ id, label, value, onChange, disabled, type = 'text', uppercase }: ChampResumeProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        disabled={disabled}
        className={cn('rounded-lg', uppercase && 'uppercase')}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
