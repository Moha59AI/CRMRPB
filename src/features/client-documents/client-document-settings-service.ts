import { supabase } from '@/lib/supabase';

export const CLIENT_DOCUMENT_TYPES = [
  'registration',
  'insurance_cert',
  'technical_inspection',
  'other',
] as const;

export type ClientDocumentPortalType = typeof CLIENT_DOCUMENT_TYPES[number];

export interface ClientDocumentPortalRule {
  document_type: ClientDocumentPortalType;
  label: string;
  enabled: boolean;
  required: boolean;
}

export interface ClientDocumentPortalSettings {
  page_title: string;
  page_intro: string;
  completion_title: string;
  completion_message: string;
  show_gift: boolean;
  document_rules: ClientDocumentPortalRule[];
}

export const DEFAULT_CLIENT_DOCUMENT_PORTAL_SETTINGS: ClientDocumentPortalSettings = {
  page_title: 'Ajoutez les pièces de votre dossier',
  page_intro: 'Prenez une photo nette ou choisissez un PDF. Vous pouvez remplacer un document tant que nécessaire.',
  completion_title: 'Toutes les pièces nécessaires sont bien reçues',
  completion_message: 'Votre dossier est transmis à l’équipe Relais Pare-Brise. Vous n’avez rien d’autre à faire pour le moment : nous vérifions les documents et nous vous contactons pour la suite ou si une pièce doit être remplacée.',
  show_gift: true,
  document_rules: [
    { document_type: 'registration', label: 'Carte grise', enabled: true, required: true },
    { document_type: 'insurance_cert', label: 'Attestation d’assurance', enabled: true, required: true },
    { document_type: 'technical_inspection', label: 'Contrôle technique', enabled: true, required: false },
    { document_type: 'other', label: 'Autre document', enabled: true, required: false },
  ],
};

function defaults(): ClientDocumentPortalSettings {
  return {
    ...DEFAULT_CLIENT_DOCUMENT_PORTAL_SETTINGS,
    document_rules: DEFAULT_CLIENT_DOCUMENT_PORTAL_SETTINGS.document_rules.map((rule) => ({ ...rule })),
  };
}

export async function fetchClientDocumentPortalSettings(): Promise<ClientDocumentPortalSettings> {
  const { data, error } = await supabase
    .from('client_document_portal_settings')
    .select('page_title, page_intro, completion_title, completion_message, show_gift, document_rules')
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return defaults();
  return data as ClientDocumentPortalSettings;
}

export async function saveClientDocumentPortalSettings(
  settings: ClientDocumentPortalSettings,
): Promise<void> {
  const { error } = await supabase.rpc('save_client_document_portal_settings', {
    p_page_title: settings.page_title,
    p_page_intro: settings.page_intro,
    p_completion_title: settings.completion_title,
    p_completion_message: settings.completion_message,
    p_show_gift: settings.show_gift,
    p_document_rules: settings.document_rules,
  });

  if (error) throw new Error(error.message);
}
