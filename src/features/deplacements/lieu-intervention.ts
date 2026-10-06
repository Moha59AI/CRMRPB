// Où va le technicien
//
// Un lead porte deux adresses : son domicile, et éventuellement un lieu
// d'intervention distinct — son travail, un concessionnaire. Celle du
// déplacement est la seconde quand elle existe.
//
// Les coordonnées suivent l'adresse qui les porte, jamais celles de l'autre.
// Un point emprunté au domicile pour une intervention qui a lieu ailleurs est
// pire qu'une absence de point : il ne se signale pas, et c'est tout le
// chiffrage du déplacement qui serait faux. Même règle que la carte des
// interventions.
//
// Rien n'est géocodé ici : les coordonnées viennent de la Base Adresse
// Nationale, posées à la saisie de l'adresse.

import type { Lead } from '@/types';

export interface LieuIntervention {
  /** Adresse en toutes lettres, pour l'affichage. */
  label: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Vrai quand le déplacement ne va pas au domicile du client. */
  distinctDuDomicile: boolean;
}

function joindre(...parties: (string | null | undefined)[]): string | null {
  return parties.map((p) => p?.trim()).filter(Boolean).join(' ') || null;
}

export function lieuInterventionDuLead(lead: Lead): LieuIntervention {
  const distinctDuDomicile = Boolean(
    lead.intervention_address || lead.intervention_postal_code || lead.intervention_city,
  );

  if (distinctDuDomicile) {
    return {
      label: joindre(
        lead.intervention_address, lead.intervention_postal_code, lead.intervention_city,
      ),
      latitude: lead.intervention_latitude,
      longitude: lead.intervention_longitude,
      distinctDuDomicile: true,
    };
  }

  return {
    label: joindre(lead.address, lead.postal_code, lead.city),
    latitude: lead.latitude,
    longitude: lead.longitude,
    distinctDuDomicile: false,
  };
}
