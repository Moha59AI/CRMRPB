import { useEffect, useState } from 'react';
import { AlertTriangle, Info, MapPin } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { lienItineraire } from '@/services/adresse-service';
import { LeadAddressFields, type ValeurAdresseLead } from './lead-address-fields';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { Lead, GlassType } from '@/types';
import { LIBELLE_VITRAGE } from './lead-shared';

/**
 * Qualification vitrage.
 *
 * Ce sont les questions du premier appel : quel vitrage, y a-t-il une caméra
 * derrière le pare-brise, quelle assurance, quel reste à charge. Elles
 * déterminent le prix, la durée d'intervention et ce qu'on annonce au client.
 *
 * Chaque champ est enregistré à la sortie du champ — au téléphone, on n'a pas
 * le temps de chercher un bouton « enregistrer ».
 */

interface LeadQualificationProps {
  lead: Lead;
  onUpdate: (updates: Partial<Lead>) => void;
  desactive?: boolean;
}

/** Identité et coordonnées du prospect, modifiables depuis la fiche lead. */
export function LeadIdentity({ lead, onUpdate, desactive }: LeadQualificationProps) {
  const adresse: ValeurAdresseLead = {
    address: lead.address,
    postal_code: lead.postal_code,
    city: lead.city,
    citycode: lead.citycode,
    latitude: lead.latitude,
    longitude: lead.longitude,
    geo_precision: lead.geo_precision,
  };

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Identité et contact
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <ChampTexte id="lead_first_name" label="Prénom" valeur={lead.first_name}
            onValider={(v) => onUpdate({ first_name: v })} desactive={desactive} />
          <ChampTexte id="lead_last_name" label="Nom" valeur={lead.last_name}
            onValider={(v) => onUpdate({ last_name: v })} desactive={desactive} />
          <ChampTexte id="lead_phone" label="Téléphone" valeur={lead.phone}
            onValider={(v) => onUpdate({ phone: v })} desactive={desactive} />
          <ChampTexte id="lead_email" label="Email" valeur={lead.email}
            onValider={(v) => onUpdate({ email: v })} desactive={desactive} />
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Adresse principale</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Elle est utilisée comme adresse d'intervention tant qu'aucune autre adresse n'est indiquée.
          </p>
        </div>
        <LeadAddressFields
          idPrefix={`lead-${lead.id}-main`}
          value={adresse}
          onUpdate={onUpdate}
          disabled={desactive}
        />
      </section>
    </div>
  );
}

export function LeadQualification({ lead, onUpdate, desactive }: LeadQualificationProps) {
  const calibrageRequis = lead.has_adas_camera === true && lead.glass_type === 'pare_brise';

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Intervention
        </h3>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="glass_type">Vitrage concerné</Label>
            <Select
              value={lead.glass_type ?? ''}
              disabled={desactive}
              onValueChange={(v) => onUpdate({ glass_type: v as GlassType })}
            >
              <SelectTrigger id="glass_type" className="rounded-lg">
                <SelectValue placeholder="À qualifier" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(LIBELLE_VITRAGE) as GlassType[]).map((k) => (
                  <SelectItem key={k} value={k}>{LIBELLE_VITRAGE[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adas">Caméra ADAS</Label>
            <Select
              value={lead.has_adas_camera === null || lead.has_adas_camera === undefined
                ? '' : lead.has_adas_camera ? 'oui' : 'non'}
              disabled={desactive}
              onValueChange={(v) => onUpdate({ has_adas_camera: v === 'oui' })}
            >
              <SelectTrigger id="adas" className="rounded-lg">
                <SelectValue placeholder="À vérifier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="oui">Oui, caméra présente</SelectItem>
                <SelectItem value="non">Non</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {calibrageRequis && (
          <div className="flex items-start gap-2 rounded-lg bg-due-soft px-3 py-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-due" />
            <p className="text-xs text-due">
              <span className="font-medium">Calibrage nécessaire.</span>{' '}
              Pare-brise avec caméra : prévoir le temps et le coût de recalibrage,
              et l'annoncer au client dès maintenant.
            </p>
          </div>
        )}

        {lead.has_adas_camera === null && lead.glass_type === 'pare_brise' && (
          <div className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              Pensez à demander s'il y a une caméra derrière le rétroviseur :
              c'est ce qui change le plus le prix.
            </p>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Véhicule
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <ChampTexte
            id="vehicle_make" label="Marque" valeur={lead.vehicle_make}
            onValider={(v) => onUpdate({ vehicle_make: v })} desactive={desactive}
          />
          <ChampTexte
            id="vehicle_model" label="Modèle" valeur={lead.vehicle_model}
            onValider={(v) => onUpdate({ vehicle_model: v })} desactive={desactive}
          />
          <ChampTexte
            id="vehicle_registration" label="Immatriculation"
            valeur={lead.vehicle_registration} majuscules
            onValider={(v) => onUpdate({ vehicle_registration: v?.toUpperCase() ?? null })}
            desactive={desactive}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Lieu de l'intervention
        </h3>
        <AdresseIntervention lead={lead} onUpdate={onUpdate} desactive={desactive} />
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Assurance et offre
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <ChampTexte
            id="insurance" label="Assureur" valeur={lead.insurance}
            onValider={(v) => onUpdate({ insurance: v })} desactive={desactive}
          />
          <div className="space-y-1.5">
            <Label htmlFor="franchise">Reste à charge</Label>
            <div className="relative">
              <Input
                id="franchise" type="number" inputMode="decimal" min={0} step="0.01"
                value={lead.franchise_amount ?? ''}
                placeholder="Non su"
                disabled={desactive}
                className="rounded-lg pr-7 tabular"
                onChange={(e) => {
                  const brut = e.target.value;
                  onUpdate({ franchise_amount: brut === '' ? null : Number(brut) });
                }}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                €
              </span>
            </div>
          </div>
          <div className="sm:col-span-2">
            <ChampTexte
              id="offer" label="Offre / cadeau annoncé" valeur={lead.offer}
              onValider={(v) => onUpdate({ offer: v })} desactive={desactive}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

interface ChampTexteProps {
  id: string;
  label: string;
  valeur: string | null;
  onValider: (valeur: string | null) => void;
  desactive?: boolean;
  majuscules?: boolean;
}

/**
 * Par défaut l'intervention a lieu à l'adresse principale du lead. Une adresse
 * différente n'est enregistrée que lorsque le conseiller la demande.
 */
function AdresseIntervention({ lead, onUpdate, desactive }: LeadQualificationProps) {
  const aUneAdresseDifferente = Boolean(
    lead.intervention_address || lead.intervention_postal_code || lead.intervention_city,
  );
  const [adresseDifferente, setAdresseDifferente] = useState(aUneAdresseDifferente);

  useEffect(() => {
    setAdresseDifferente(aUneAdresseDifferente);
    // Le choix local doit rester ouvert avant la saisie du premier champ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);

  const adresseIntervention: ValeurAdresseLead = adresseDifferente ? {
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

  const itineraire = lienItineraire(adresseIntervention);

  const mettreAJourAdresseIntervention = (adresse: Partial<ValeurAdresseLead>) => {
    const updates: Partial<Lead> = {};
    if ('address' in adresse) updates.intervention_address = adresse.address ?? null;
    if ('postal_code' in adresse) updates.intervention_postal_code = adresse.postal_code ?? null;
    if ('city' in adresse) updates.intervention_city = adresse.city ?? null;
    if ('citycode' in adresse) updates.intervention_citycode = adresse.citycode ?? null;
    if ('latitude' in adresse) updates.intervention_latitude = adresse.latitude ?? null;
    if ('longitude' in adresse) updates.intervention_longitude = adresse.longitude ?? null;
    if ('geo_precision' in adresse) updates.intervention_geo_precision = adresse.geo_precision ?? null;
    onUpdate(updates);
  };

  const utiliserAdressePrincipale = (identique: boolean) => {
    setAdresseDifferente(!identique);
    if (identique) {
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
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/20 p-3">
        <Checkbox
          checked={!adresseDifferente}
          disabled={desactive}
          onCheckedChange={(valeur) => utiliserAdressePrincipale(valeur === true)}
          className="mt-0.5"
        />
        <span>
          <span className="block text-sm font-medium text-foreground">Même adresse que l'adresse principale</span>
          <span className="block text-xs text-muted-foreground">Décochez seulement si le véhicule se trouve ailleurs.</span>
        </span>
      </label>

      {adresseDifferente ? (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <p className="mb-3 text-sm font-semibold text-foreground">Autre adresse d'intervention</p>
          <LeadAddressFields
            idPrefix={`lead-${lead.id}-intervention`}
            value={adresseIntervention}
            onUpdate={mettreAJourAdresseIntervention}
            disabled={desactive}
          />
        </div>
      ) : (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          {[lead.address, lead.postal_code, lead.city].filter(Boolean).join(' ') || 'Adresse principale à renseigner'}
        </p>
      )}

      {adresseIntervention.citycode ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <MapPin className="h-3 w-3" />
            {adresseIntervention.city} · commune {adresseIntervention.citycode}
          </span>
          {itineraire && adresseIntervention.geo_precision === 'exact' && (
            <a
              href={itineraire}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary hover:underline"
            >
              Itinéraire
            </a>
          )}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Champ alimentant le brouillon à chaque frappe.
 *
 * On ne coupe pas les espaces ici : « Jean » suivi d'un espace deviendrait
 * « Jean » et empêcherait de taper « Jean-Pierre ». Le nettoyage se fait à
 * l'enregistrement.
 */
function ChampTexte({ id, label, valeur, onValider, desactive, majuscules }: ChampTexteProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={valeur ?? ''}
        placeholder="À renseigner"
        disabled={desactive}
        className={cn('rounded-lg', majuscules && 'uppercase tabular')}
        onChange={(e) => onValider(e.target.value)}
      />
    </div>
  );
}
