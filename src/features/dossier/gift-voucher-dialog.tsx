import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fetchCaseByLeadId } from '@/services/cases-service';
import type { Lead, WindscreenCase } from '@/types';
import {
  genererBonRemiseCadeau, type BonRemiseCadeauData,
} from './gift-voucher-service';

interface BonRemiseCadeauDialogProps {
  lead: Lead;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUTS_AUTORISES = new Set([
  'glass_ordered', 'appointment_scheduled', 'intervention_done', 'invoice_sent',
  'payment_pending', 'payment_received', 'gift_given', 'completed',
]);

function valeurOuVide(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

function adresseDuLead(lead: Lead): string {
  const rue = valeurOuVide(lead.address);
  const localite = [lead.postal_code, lead.city].map(valeurOuVide).filter(Boolean).join(' ');
  if (!rue) return localite;
  if (!localite || rue.toLocaleLowerCase('fr').includes(localite.toLocaleLowerCase('fr'))) return rue;
  return `${rue} - ${localite}`;
}

function referenceProvisoire(lead: Lead): string {
  const date = new Date(lead.received_at || lead.created_at);
  const jour = Number.isNaN(date.getTime())
    ? 'SANS-DATE'
    : date.toISOString().slice(0, 10).replace(/-/g, '');
  return `LEAD-${jour}-${lead.id.slice(0, 8).toUpperCase()}`;
}

function donneesInitiales(lead: Lead, dossier: WindscreenCase | null): BonRemiseCadeauData {
  return {
    cadeau: valeurOuVide(lead.offer),
    referenceDossier: dossier?.case_number || referenceProvisoire(lead),
    dateSinistre: '',
    statut: dossier && STATUTS_AUTORISES.has(dossier.status) ? 'Travaux autorisés' : 'À compléter',
    beneficiaire: [lead.first_name, lead.last_name].map(valeurOuVide).filter(Boolean).join(' ') || 'Client à renseigner',
    adresse: adresseDuLead(lead),
    telephone: valeurOuVide(lead.phone),
    vehicule: [lead.vehicle_make, lead.vehicle_model].map(valeurOuVide).filter(Boolean).join(' '),
    immatriculation: valeurOuVide(lead.vehicle_registration),
    assureur: valeurOuVide(lead.insurance),
    numeroAssure: valeurOuVide(dossier?.insurance_contract_number),
    // Une franchise n'est pas une TVA. Aucune valeur n'est donc inventee ici.
    tvaRestante: '',
  };
}

const CHAMPS: Array<{
  key: keyof BonRemiseCadeauData;
  label: string;
  placeholder?: string;
  type?: string;
  large?: boolean;
}> = [
  { key: 'cadeau', label: 'Cadeau sélectionné', placeholder: 'Ex. Téléviseur 55 pouces', large: true },
  { key: 'referenceDossier', label: 'Référence dossier' },
  { key: 'dateSinistre', label: 'Date du sinistre', type: 'date' },
  { key: 'statut', label: 'Statut affiché' },
  { key: 'beneficiaire', label: 'Bénéficiaire' },
  { key: 'adresse', label: 'Adresse', large: true },
  { key: 'telephone', label: 'Téléphone' },
  { key: 'vehicule', label: 'Véhicule' },
  { key: 'immatriculation', label: 'Immatriculation' },
  { key: 'assureur', label: 'Assureur' },
  { key: 'numeroAssure', label: 'N° assuré / contrat' },
  { key: 'tvaRestante', label: 'TVA restant à régler (€)', placeholder: 'À compléter' },
];

export function BonRemiseCadeauDialog({ lead, open, onOpenChange }: BonRemiseCadeauDialogProps) {
  const [donnees, setDonnees] = useState<BonRemiseCadeauData>(() => donneesInitiales(lead, null));
  const [generation, setGeneration] = useState(false);

  const dossierQuery = useQuery({
    queryKey: ['case-for-gift-voucher', lead.id],
    queryFn: () => fetchCaseByLeadId(lead.id),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setDonnees(donneesInitiales(lead, dossierQuery.data ?? null));
  }, [dossierQuery.data, lead, open]);

  const changer = (key: keyof BonRemiseCadeauData, value: string) => {
    setDonnees((courantes) => ({ ...courantes, [key]: value }));
  };

  const ouvrirEtImprimer = async () => {
    if (!donnees.cadeau.trim()) {
      toast.error('Sélectionnez le cadeau avant d’imprimer.');
      return;
    }
    const apercu = window.open('', '_blank');
    setGeneration(true);
    try {
      const resultat = await genererBonRemiseCadeau(donnees);
      const url = URL.createObjectURL(resultat.blob);
      if (apercu) {
        apercu.document.title = 'Préparation du bon de remise…';
        apercu.location.href = url;
      } else {
        const lien = document.createElement('a');
        lien.href = url;
        lien.download = resultat.filename;
        lien.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 10 * 60_000);
      toast.success('Bon de remise de cadeau prêt à imprimer');
    } catch (error) {
      apercu?.close();
      toast.error((error as Error).message);
    } finally {
      setGeneration(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle>Bon de remise de cadeau</DialogTitle>
          <DialogDescription>
            Le cadeau choisi dans la fiche lead est sélectionné automatiquement. Vérifiez les informations avant impression.
          </DialogDescription>
        </DialogHeader>

        {dossierQuery.isError && (
          <p className="rounded-lg border border-due/30 bg-due-soft px-3 py-2 text-sm text-due">
            Le dossier vitrage n’a pas pu être chargé. Les informations du lead restent disponibles.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {CHAMPS.map((champ) => (
            <div key={champ.key} className={champ.large ? 'space-y-1.5 sm:col-span-2' : 'space-y-1.5'}>
              <Label htmlFor={`bon-cadeau-${champ.key}`}>{champ.label}</Label>
              <Input
                id={`bon-cadeau-${champ.key}`}
                type={champ.type ?? 'text'}
                value={donnees[champ.key]}
                placeholder={champ.placeholder}
                onChange={(event) => changer(champ.key, event.target.value)}
                className="rounded-lg"
              />
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          L’état, la valeur, la référence ou le numéro de série et les accessoires restent à compléter lors de la remise.
        </p>

        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button className="rounded-full" onClick={ouvrirEtImprimer} disabled={generation || !donnees.cadeau.trim()}>
            {generation
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <Printer className="mr-2 h-4 w-4" />}
            Ouvrir et imprimer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
