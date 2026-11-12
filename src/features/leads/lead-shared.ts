// Constantes et utilitaires partages du module Leads.
//
// Extraits de leads-page pour que la fiche de detail puisse etre ouverte
// depuis d'autres ecrans -- les relances notamment -- sans dupliquer les
// libelles de statut ni le formatage.

import type {
  Lead, Profile,
  LeadStatus, LeadSource, GlassType,
} from '@/types';

// ============ CONSTANTS ============

export const statusLabels: Record<string, string> = {
  new: 'Nouveau lead',
  to_call: 'Nouveau lead',
  calling: 'Nouveau lead',
  nrp: 'NRP',
  interested: 'Qualifié',
  documents_requested: 'Attente documents',
  documents_received: 'Prêt Onify',
  onify_processing: 'Suivi Onify',
  appointment_scheduled: 'RDV pris',
  intervention_done: 'Intervention réalisée',
  payment_pending: 'Facturation',
  sav: 'SAV',
  lost: 'Perdu',
  converted: 'Clôturé',
};

export const sourceLabels: Record<string, string> = {
  meta: 'Meta',
  google_ads: 'Google Ads',
  webhook: 'Webhook',
  manual: 'Manuel',
  import: 'Import',
};

export type LeadJourneyStageKey =
  | 'nouveau'
  | 'nrp'
  | 'qualifie'
  | 'documents'
  | 'onify_ready'
  | 'onify'
  | 'rdv'
  | 'intervention'
  | 'finance'
  | 'sav'
  | 'perdu'
  | 'cloture';

export interface LeadJourneyStage {
  key: LeadJourneyStageKey;
  label: string;
  description: string;
  statuses: readonly LeadStatus[];
  /** Statut interne applique quand l'utilisateur choisit cette etape. */
  targetStatus: LeadStatus;
  /** Etape constatee par les donnees, jamais forcee manuellement. */
  automated?: boolean;
  terminal?: boolean;
}

/**
 * Une seule fiche suit l intervention de son arrivee jusqu au reglement.
 * Onify enrichit le lead avec ses statuts, le vehicule, l assurance et la
 * franchise ; il ne provoque plus un transfert vers un autre module.
 */
export const leadJourneyStages: readonly LeadJourneyStage[] = [
  {
    key: 'nouveau',
    label: 'Nouveau lead',
    description: 'À contacter rapidement',
    statuses: ['new', 'to_call', 'calling'],
    targetStatus: 'to_call',
  },
  {
    key: 'nrp',
    label: 'NRP',
    description: 'Rappel automatique selon la cadence',
    statuses: ['nrp'],
    targetStatus: 'nrp',
  },
  {
    key: 'qualifie',
    label: 'Qualifié',
    description: 'Besoin confirmé, pièces à obtenir',
    statuses: ['interested'],
    targetStatus: 'interested',
  },
  {
    key: 'documents',
    label: 'Attente documents',
    description: 'Lien envoyé, dossier à compléter',
    statuses: ['documents_requested'],
    targetStatus: 'documents_requested',
  },
  {
    key: 'onify_ready',
    label: 'Prêt Onify',
    description: 'Pièces obligatoires reçues, dossier à créer dans Onify',
    statuses: ['documents_received'],
    targetStatus: 'documents_received',
    automated: true,
  },
  {
    key: 'onify',
    label: 'Suivi Onify',
    description: 'Dossier créé, accord et vitrage suivis depuis la même fiche',
    statuses: ['onify_processing'],
    targetStatus: 'onify_processing',
    automated: true,
  },
  {
    key: 'rdv',
    label: 'RDV pris',
    description: 'Créneau planifié dans l’agenda',
    statuses: ['appointment_scheduled'],
    targetStatus: 'appointment_scheduled',
  },
  {
    key: 'intervention',
    label: 'Intervention réalisée',
    description: 'Travaux terminés, dossier à finaliser',
    statuses: ['intervention_done'],
    targetStatus: 'intervention_done',
    automated: true,
  },
  {
    key: 'finance',
    label: 'Facturation',
    description: 'Facture ou règlement en attente',
    statuses: ['payment_pending'],
    targetStatus: 'payment_pending',
    automated: true,
  },
  {
    key: 'sav',
    label: 'SAV',
    description: 'Dossier à reprendre après intervention',
    statuses: ['sav'],
    targetStatus: 'sav',
  },
  {
    key: 'perdu',
    label: 'Perdu',
    description: 'Sorti des relances',
    statuses: ['lost'],
    targetStatus: 'lost',
    terminal: true,
  },
  {
    key: 'cloture',
    label: 'Clôturé',
    description: 'Intervention terminée',
    statuses: ['converted'],
    targetStatus: 'converted',
    terminal: true,
  },
] as const;

export function leadStageForStatus(status: LeadStatus): LeadJourneyStage {
  return leadJourneyStages.find((stage) => stage.statuses.includes(status))
    ?? leadJourneyStages[0];
}

export function leadStageForKey(key: string): LeadJourneyStage | undefined {
  return leadJourneyStages.find((stage) => stage.key === key);
}

/**
 * Chaque filtre correspond a une etape exacte de la meme fiche, avant comme
 * apres la creation du dossier Onify.
 */
export interface LeadStatusFilterOption {
  value: string;
  label: string;
  statuses: readonly LeadStatus[];
}

export const leadStatusFilterOptions: readonly LeadStatusFilterOption[] =
  leadJourneyStages.map((stage) => ({
    value: stage.key,
    label: stage.label,
    statuses: stage.statuses,
  }));

export function leadStatusesForFilter(key: string): readonly LeadStatus[] | undefined {
  return leadStatusFilterOptions.find((option) => option.value === key)?.statuses;
}

export function leadStageDescription(status: LeadStatus): string {
  if (status === 'calling') return 'Appel en cours — enregistrez son résultat';
  if (status === 'documents_received') return 'Pièces reçues — créez le dossier dans Onify';
  if (status === 'onify_processing') return 'Dossier Onify synchronisé — suivez son avancement ici';
  return leadStageForStatus(status).description;
}

/** Choix courts : jamais de doublon « nouveau / à appeler / appel en cours ». */
export const statusSelectOptions: { value: LeadStatus; label: string }[] =
  leadJourneyStages.filter((stage) => !stage.automated).map((stage) => ({
    value: stage.targetStatus,
    label: stage.label,
  }));

export const sourceSelectOptions: { value: LeadSource; label: string }[] = [
  { value: 'meta', label: 'Meta' },
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'webhook', label: 'Webhook' },
  { value: 'manual', label: 'Manuel' },
  { value: 'import', label: 'Import' },
];

// ============ HELPERS ============

export function profileName(p?: Profile | null): string {
  if (!p) return 'Non assigné';
  return [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Conseiller';
}

export function scoreColor(score: number): string {
  if (score >= 70) return 'text-emerald-600';
  if (score >= 40) return 'text-amber-600';
  return 'text-slate-400';
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function leadName(lead: Lead): string {
  return [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Sans nom';
}

export function vehicleLabel(lead: Lead): string {
  const parts = [lead.vehicle_make, lead.vehicle_model].filter(Boolean);
  return parts.join(' ') || '—';
}

// ============ STATUS BADGE ============

/** Libelles des types de vitrage, utilises dans la fiche et la qualification. */
export const LIBELLE_VITRAGE: Record<GlassType, string> = {
  pare_brise: 'Pare-brise',
  lunette_arriere: 'Lunette arrière',
  glace_laterale: 'Glace latérale',
  impact: 'Impact / réparation',
  autre: 'Autre',
};

/** Libelle court et explicite pour les listes, y compris avant qualification. */
export function vitrageLabel(lead: Pick<Lead, 'glass_type'>): string {
  return lead.glass_type ? LIBELLE_VITRAGE[lead.glass_type] : 'À qualifier';
}

/**
 * Libelles des champs modifiables, pour dire a l'utilisateur ce qu'il s'apprete
 * a enregistrer. Les colonnes techniques (citycode, coordonnees) n'y figurent
 * pas : elles suivent l'adresse et ne se modifient jamais seules.
 */
export const LIBELLE_CHAMP_LEAD: Partial<Record<keyof Lead, string>> = {
  first_name: 'Prénom',
  last_name: 'Nom',
  phone: 'Téléphone',
  email: 'Email',
  address: 'Adresse principale',
  city: 'Ville',
  postal_code: 'Code postal',
  intervention_address: "Adresse d'intervention",
  intervention_city: "Ville d'intervention",
  intervention_postal_code: "Code postal d'intervention",
  vehicle_make: 'Marque',
  vehicle_model: 'Modèle',
  vehicle_registration: 'Immatriculation',
  glass_type: 'Vitrage',
  has_adas_camera: 'Caméra ADAS',
  franchise_amount: 'Reste à charge',
  insurance: 'Assureur',
  offer: 'Offre',
  status: 'Statut',
  assigned_user_id: 'Conseiller',
  advisor_notes: 'Notes',
};
