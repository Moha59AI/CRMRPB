import { useEffect, useState } from 'react';
import { AlertTriangle, Info, MapPin } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChampAdresse } from '@/components/ChampAdresse';
import { lienItineraire } from '@/services/adresse-service';
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
                defaultValue={lead.franchise_amount ?? ''}
                placeholder="Non su"
                disabled={desactive}
                className="rounded-lg pr-7 tabular"
                onBlur={(e) => {
                  const brut = e.target.value.trim();
                  const valeur = brut === '' ? null : Number(brut);
                  if (valeur !== lead.franchise_amount) {
                    onUpdate({ franchise_amount: valeur });
                  }
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
 * Adresse de l'intervention, assistée par la Base Adresse Nationale.
 *
 * Choisir une suggestion enregistre en une fois la voie, le code postal, la
 * ville, le code INSEE et les coordonnées — c'est ce qui permet ensuite au
 * technicien d'ouvrir un itinéraire sans retaper quoi que ce soit.
 *
 * Une adresse absente du référentiel reste saisissable : elle est enregistrée
 * telle quelle, sans code INSEE.
 */
function AdresseIntervention({ lead, onUpdate, desactive }: LeadQualificationProps) {
  const complete = [lead.address, lead.postal_code, lead.city].filter(Boolean).join(' ');
  const [saisie, setSaisie] = useState(complete);
  const itineraire = lienItineraire(lead);

  // La fiche change quand on passe au lead suivant : sans cette remise a jour,
  // l'adresse du precedent resterait affichee.
  useEffect(() => {
    setSaisie([lead.address, lead.postal_code, lead.city].filter(Boolean).join(' '));
  }, [lead.id, lead.address, lead.postal_code, lead.city]);

  return (
    <div className="space-y-2">
      <ChampAdresse
        id="adresse_intervention"
        valeur={saisie}
        onValeurChange={setSaisie}
        desactive={desactive}
        placeholder="Numéro, rue, ville…"
        onChoisir={(a) => onUpdate(a)}
        onBlur={() => {
          // Saisie libre : on ne garde que le texte, sans inventer de commune.
          const texte = saisie.trim();
          if (texte && texte !== complete) {
            onUpdate({ address: texte, citycode: null, latitude: null, longitude: null });
          }
        }}
      />

      {lead.citycode ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <MapPin className="h-3 w-3" />
            {lead.city} · commune {lead.citycode}
          </span>
          {itineraire && (
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
      ) : (
        complete && (
          <p className="text-xs text-muted-foreground">
            Adresse saisie à la main — choisissez une suggestion pour la localiser.
          </p>
        )
      )}
    </div>
  );
}

/** Champ enregistré à la sortie, et seulement si la valeur a changé. */
function ChampTexte({ id, label, valeur, onValider, desactive, majuscules }: ChampTexteProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        defaultValue={valeur ?? ''}
        placeholder="À renseigner"
        disabled={desactive}
        className={cn('rounded-lg', majuscules && 'uppercase tabular')}
        onBlur={(e) => {
          const suite = e.target.value.trim() || null;
          if (suite !== valeur) onValider(suite);
        }}
      />
    </div>
  );
}
