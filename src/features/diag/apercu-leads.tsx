// Aperçu des vues leads, en développement seulement
//
// La page leads ne s'atteint qu'une fois connecté, ce qui empêche de
// regarder une carte pendant qu'on la dessine. Celle-ci monte les mêmes
// composants sur des leads fabriqués, dans les cas qui font mal : un nom
// très long, des champs vides, un lead tout frais et un lead oublié.
//
// La route n'existe pas en production.

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { CompactList, KanbanCard, ListeMobile } from '@/features/leads/leads-page';
import { LeadPipeline } from '@/features/leads/lead-pipeline';
import type { Lead, LeadSource, LeadStatus } from '@/types';
import { VisionneusePdf } from '@/features/billing/bouton-pdf-facture';
import { pdfExemple } from './pdf-exemple';

const HEURE = 3_600_000;

function lead(partiel: Partial<Lead> & { id: string; heures: number }): Lead {
  const arrive = new Date(Date.now() - partiel.heures * HEURE).toISOString();
  return {
    status: 'new' as LeadStatus,
    source: 'meta' as LeadSource,
    first_name: null,
    last_name: null,
    phone: null,
    city: null,
    vehicle_make: null,
    vehicle_model: null,
    glass_type: null,
    arrive_le: arrive,
    received_at: arrive,
    created_at: arrive,
    ...partiel,
  } as Lead;
}

const CAS: { titre: string; lead: Lead }[] = [
  {
    titre: 'Complet, arrivé il y a 1 h',
    lead: lead({
      id: '1', heures: 1, first_name: 'Dorothée', last_name: 'Vandeven',
      phone: '06 12 34 56 78', city: 'Harnes', vehicle_make: 'Volkswagen',
      vehicle_model: 'Golf VIII', glass_type: 'pare_brise', source: 'meta',
    }),
  },
  {
    titre: 'Sans réponse depuis 3 jours',
    lead: lead({
      id: '2', heures: 74, status: 'nrp', first_name: 'Ahmed', last_name: 'Kacet',
      phone: '07 88 99 00 11', city: 'Lens', vehicle_make: 'Renault',
      vehicle_model: 'Clio V', glass_type: 'glace_laterale', source: 'google_ads',
    }),
  },
  {
    titre: 'Nom très long, pas de véhicule',
    lead: lead({
      id: '3', heures: 9, first_name: 'Jean-Christophe',
      last_name: 'de La Rochefoucauld-Montbazon',
      phone: '06 01 02 03 04', city: 'Villeneuve-d’Ascq', source: 'manual',
    }),
  },
  {
    titre: 'Presque vide — ce que Meta envoie parfois',
    lead: lead({ id: '4', heures: 30, phone: '06 55 44 33 22', source: 'meta' }),
  },
  {
    titre: 'Rendez-vous pris il y a 5 jours',
    lead: lead({
      id: '5', heures: 120, status: 'appointment_scheduled',
      first_name: 'Marie-Jeanne', last_name: 'Gadenne', city: 'Douai',
      vehicle_make: 'Peugeot', vehicle_model: '308', glass_type: 'lunette_arriere',
      source: 'import',
    }),
  },
];

export function ApercuLeads() {
  const rien = () => {};
  const [pdfOuvert, setPdfOuvert] = useState<string | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());

  const basculerSelection = (leadId: string, actif: boolean) => {
    setSelection((selectionActuelle) => {
      const suivante = new Set(selectionActuelle);
      if (actif) suivante.add(leadId);
      else suivante.delete(leadId);
      return suivante;
    });
  };

  return (
    <div className="min-h-full bg-background">
      <p className="gutter-x bg-warning/10 py-2 text-xs text-foreground">
        Aperçu de développement — leads fabriqués, aucune requête.
      </p>

      <PageHeader
        title="Leads"
        description="Prospects reçus depuis Meta et autres sources"
        compactMobile
        action={(
          <Button className="rounded-full px-3">
            <Plus className="mr-1.5 h-4 w-4" />
            Nouveau
          </Button>
        )}
      />

      <div className="gutter-x py-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Liste téléphone dense
        </h2>
        <div className="h-[340px] max-w-[390px] overflow-hidden rounded-xl border border-border bg-card">
          <ListeMobile
            leads={CAS.map((c) => c.lead)}
            selection={selection}
            onSelectionChange={basculerSelection}
            onOuvrir={rien}
          />
        </div>

        <h2 className="mb-3 mt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Carte du pipeline
        </h2>

        {/* Largeur d'une colonne de kanban, pour juger la carte telle qu'elle
            sera vue et pas etiree sur l'ecran. */}
        <div className="flex flex-wrap items-start gap-4">
          {CAS.map(({ titre, lead: exemple }) => (
            <div key={exemple.id} className="w-[280px]">
              <p className="mb-1.5 text-[11px] text-faint">{titre}</p>
              <KanbanCard
                lead={exemple}
                isDragging={false}
                onDragStart={rien}
                onDragEnd={rien}
                onClick={rien}
              />
            </div>
          ))}

          <div className="w-[280px]">
            <p className="mb-1.5 text-[11px] text-faint">En cours de déplacement</p>
            <KanbanCard
              lead={CAS[0].lead}
              isDragging
              onDragStart={rien}
              onDragEnd={rien}
              onClick={rien}
            />
          </div>
        </div>

        <h2 className="mb-3 mt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Visionneuse de facture
        </h2>
        <Button
          variant="outline"
          className="rounded-full"
          onClick={() => setPdfOuvert(URL.createObjectURL(pdfExemple()))}
        >
          Ouvrir un PDF d’exemple
        </Button>
        {pdfOuvert && (
          <VisionneusePdf
            facture={{ id: 'demo', invoice_number: 'F-DEMO-001', onify_invoice_id: '1' }}
            url={pdfOuvert}
            onFermer={() => setPdfOuvert(null)}
          />
        )}

        <h2 className="mb-3 mt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Fil d’étapes de la fiche
        </h2>
        <div className="space-y-3">
          {(['new', 'documents_requested', 'appointment_scheduled', 'lost'] as LeadStatus[]).map((statut) => (
            <LeadPipeline key={statut} statut={statut} onChangerStatut={rien} />
          ))}
        </div>

        <h2 className="mb-3 mt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Liste compacte
        </h2>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <CompactList leads={CAS.map((c) => c.lead)} onRowClick={rien} />
        </div>
      </div>
    </div>
  );
}
