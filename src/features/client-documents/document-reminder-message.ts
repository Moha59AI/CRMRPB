import type { ClientDocumentItem } from '@/services/client-documents-service';

const DOCUMENT_RECEIVED_STATUSES = new Set(['uploaded', 'validated']);

function lowerFirst(value: string): string {
  if (!value) return value;
  return value.charAt(0).toLocaleLowerCase('fr-FR') + value.slice(1);
}

function missingDocumentsLabel(items: ClientDocumentItem[]): string {
  const missing = items
    .filter((item) => item.required && !DOCUMENT_RECEIVED_STATUSES.has(item.status))
    .map((item) => lowerFirst(item.label.trim()))
    .filter(Boolean);

  if (missing.length === 0) return 'les documents obligatoires';
  if (missing.length === 1) return missing[0];
  if (missing.length === 2) return `${missing[0]} et ${missing[1]}`;
  return `${missing[0]}, ${missing[1]} et ${missing.length - 2} autre${missing.length > 3 ? 's' : ''} pièce${missing.length > 3 ? 's' : ''}`;
}

export function documentReminderMessage(
  lead: { first_name?: string | null },
  url: string,
  items: ClientDocumentItem[],
): string {
  const firstName = lead.first_name?.trim();
  const missing = missingDocumentsLabel(items);

  return `Bonjour${firstName ? ` ${firstName}` : ''}, pour avancer sur votre dossier pare-brise, il nous manque encore ${missing}. Merci de les déposer ici : ${url} — Relais Pare-Brise`;
}
