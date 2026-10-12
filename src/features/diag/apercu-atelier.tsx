// Aperçu de l'atelier réaliste, en développement seulement
//
// L'atelier ne s'atteint qu'une fois connecté, et il faut des interventions
// du jour pour qu'il contienne quelque chose. Cette page monte la scène sur
// une journée fabriquée, avec un véhicule dans chaque poste.
//
// La route n'existe pas en production.

import { useState } from 'react';
import { SceneAtelierRealiste } from '@/features/atelier/scene-atelier-realiste';
import { ListeAtelier } from '@/features/atelier/atelier-page';
import { PanneauDossier } from '@/features/atelier/panneau-dossier';
import { placerVehicules, compterParZone, ZONES } from '@/features/atelier/zones-atelier';
import type { Intervention } from '@/services/interventions-service';
import type { AppointmentStatus } from '@/types';

function heure(h: number, m = 0): string {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function intervention(p: Partial<Intervention> & { id: string }): Intervention {
  return {
    lead_id: 'lead-' + p.id,
    contact_id: null,
    assigned_user_id: null,
    titre: 'Intervention',
    debut: heure(9),
    fin: heure(10),
    statut: 'scheduled',
    adresse: null,
    ville: null,
    codePostal: null,
    citycode: null,
    latitude: null,
    longitude: null,
    geo_precision: null,
    client: null,
    telephone: null,
    immatriculation: null,
    vehicule: null,
    ...p,
  };
}

/* Une journée qui remplit les quatre postes. L'heure est figée à midi pour
   que « À venir » et « En intervention » soient tous deux peuplés. */
const MIDI = (() => { const d = new Date(); d.setHours(12, 0, 0, 0); return d; })();

const JOURNEE: Intervention[] = [
  intervention({
    id: '1', debut: heure(8, 30), fin: heure(10), statut: 'completed',
    titre: 'Pare-brise Clio (TS-001-TS)', client: 'TEST Camille Dupont',
    vehicule: 'Renault Clio', immatriculation: 'TS-001-TS',
    telephone: '0639987601', adresse: '12 Rue de Lens 59000 Lille',
  }),
  intervention({
    id: '2', debut: heure(10, 30), fin: heure(12), statut: 'completed',
    titre: 'Lunette arrière Scénic (TS-003-TS)', client: 'TEST Sophie Leroy',
    vehicule: 'Renault Scénic', immatriculation: 'TS-003-TS',
  }),
  intervention({
    id: '3', debut: heure(11, 30), fin: heure(13, 30), statut: 'confirmed',
    titre: 'Pare-brise 208 avec caméra (TS-002-TS)', client: 'TEST Olivier Bernard',
    vehicule: 'Peugeot 208', immatriculation: 'TS-002-TS',
    telephone: '0639987602', adresse: '5 Avenue de la Marne 59290 Wasquehal',
  }),
  intervention({
    id: '4', debut: heure(11, 45), fin: heure(13), statut: 'confirmed',
    titre: 'Impact C3 (TS-004-TS)', client: 'TEST Marc Moreau',
    vehicule: 'Citroën C3', immatriculation: 'TS-004-TS',
  }),
  intervention({
    id: '5', debut: heure(14), fin: heure(16), statut: 'scheduled',
    titre: 'Pare-brise Golf (TS-005-TS)', client: 'TEST Inès Garcia',
    vehicule: 'Volkswagen Golf', immatriculation: 'TS-005-TS',
    telephone: '0639987605',
  }),
  intervention({
    id: '6', debut: heure(15), fin: heure(16), statut: 'scheduled',
    titre: 'Glace latérale Sandero (TS-006-TS)', client: 'TEST Thomas Nguyen',
    vehicule: 'Dacia Sandero', immatriculation: 'TS-006-TS',
  }),
  intervention({
    id: '7', debut: heure(16, 30), fin: heure(17, 30), statut: 'scheduled',
    titre: 'Pare-brise Kangoo (TS-007-TS)', client: 'TEST Julie Petit',
    vehicule: 'Renault Kangoo', immatriculation: 'TS-007-TS',
  }),
  intervention({
    id: '8', debut: heure(9), fin: heure(10), statut: 'cancelled',
    titre: 'Pare-brise Yaris (TS-008-TS)', client: 'TEST Karim Fabre',
    vehicule: 'Toyota Yaris', immatriculation: 'TS-008-TS',
  }),
];

export function ApercuAtelier() {
  const [selection, setSelection] = useState<string | null>('3');
  const [vue, setVue] = useState<'atelier' | 'liste'>('atelier');
  const [statuts, setStatuts] = useState<Record<string, AppointmentStatus>>({});

  // Le changement de statut est simulé côté page : il suffit à vérifier que
  // la voiture glisse bien vers son nouveau poste.
  const journee = JOURNEE.map((i) => ({ ...i, statut: statuts[i.id] ?? i.statut }));
  const places = placerVehicules(journee, MIDI);
  const compte = compterParZone(places);
  const choisie = journee.find((i) => i.id === selection) ?? null;
  const zone = places.find((p) => p.intervention.id === selection)?.zone ?? null;

  return (
    <div className="min-h-full bg-background">
      <p className="gutter-x bg-warning/10 py-2 text-xs text-foreground">
        Aperçu de développement — journée fabriquée, aucune requête. Les
        changements de statut sont simulés : ils servent à vérifier que le
        véhicule rejoint son poste en glissant.
      </p>

      <div className="gutter-x space-y-4 py-5">
        <div className="flex flex-wrap gap-1">
          {ZONES.map((z) => (
            <span key={z.cle} className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: z.couleur }} aria-hidden />
              {z.label}
              <span className="font-semibold tabular text-foreground">{compte[z.cle]}</span>
            </span>
          ))}
        </div>

        <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-0.5 w-fit">
          {(['atelier', 'liste'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVue(v)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                vue === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              {v === 'atelier' ? 'Atelier' : 'Liste'}
            </button>
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="h-[520px] overflow-hidden rounded-xl border border-border bg-surface">
            {vue === 'atelier' ? (
              <SceneAtelierRealiste
                interventions={journee}
                selection={selection}
                onSelectionner={setSelection}
                maintenant={MIDI}
              />
            ) : (
              <ListeAtelier
                places={places}
                selection={selection}
                onSelectionner={setSelection}
                monId={null}
              />
            )}
          </div>
          <div className="h-[520px]">
            <PanneauDossier
              intervention={choisie}
              zone={zone}
              onOuvrirFiche={() => {}}
              statutsPossibles={
                choisie?.statut === 'scheduled' ? ['confirmed', 'cancelled']
                  : choisie?.statut === 'confirmed' ? ['completed', 'cancelled']
                    : ['scheduled']
              }
              onChangerStatut={(statut) => {
                if (choisie) setStatuts((s) => ({ ...s, [choisie.id]: statut }));
              }}
              enregistrement={false}
              erreur={null}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
