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
  new: 'Nouveau',
  to_call: 'À appeler',
  calling: 'Appel en cours',
  nrp: 'NRP',
  interested: 'Intéressé',
  documents_requested: 'Documents demandés',
  documents_received: 'Documents reçus',
  appointment_scheduled: 'RDV planifié',
  lost: 'Perdu',
  converted: 'Converti',
};

export const sourceLabels: Record<string, string> = {
  meta: 'Meta',
  google_ads: 'Google Ads',
  webhook: 'Webhook',
  manual: 'Manuel',
  import: 'Import',
};

export const statusStyles: Record<string, string> = {
  new: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  to_call: 'bg-amber-50 text-amber-700 border-amber-200',
  calling: 'bg-sky-50 text-sky-700 border-sky-200',
  nrp: 'bg-red-50 text-red-700 border-red-200',
  interested: 'bg-amber-50 text-amber-700 border-amber-200',
  documents_requested: 'bg-slate-100 text-slate-600 border-slate-200',
  documents_received: 'bg-slate-100 text-slate-600 border-slate-200',
  appointment_scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  lost: 'bg-red-50 text-red-700 border-red-200',
  converted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export const kanbanColumnOrder: LeadStatus[] = [
  'new', 'to_call', 'calling', 'nrp', 'interested',
  'documents_requested', 'documents_received', 'appointment_scheduled',
  'lost', 'converted',
];

export const statusSelectOptions: { value: LeadStatus; label: string }[] = kanbanColumnOrder.map((s) => ({
  value: s,
  label: statusLabels[s],
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
