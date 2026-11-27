import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.58.0';

const defaultRecipient = 'contact@relaisparebrise.fr';

function texteHtml(valeur: unknown): string {
  return String(valeur ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function recipientList(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((entry) => typeof entry === 'string' ? entry.split(/[;,]/) : [])
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry));
}

function uniqueRecipients(...groups: string[][]): string[] {
  return [...new Set(groups.flat())];
}

export async function notifyDocumentDeposit(
  admin: SupabaseClient,
  itemId: string,
  workspaceId: string,
  leadId: string | null,
): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const forcedRecipients = recipientList(Deno.env.get('DOCUMENT_NOTIFICATION_EMAIL'));
  const from = Deno.env.get('DOCUMENT_NOTIFICATION_FROM')?.trim()
    || 'Relais Pare-Brise <notifications@relaisparebrise.fr>';

  const { data: workspace } = await admin
    .from('workspaces')
    .select('settings')
    .eq('id', workspaceId)
    .single();
  const settings = (workspace?.settings ?? {}) as Record<string, unknown>;
  const workspaceRecipient = recipientList(settings.email);
  const additionalRecipients = recipientList(settings.document_notification_emails);
  const primaryRecipients = forcedRecipients.length > 0
    ? forcedRecipients
    : (workspaceRecipient.length > 0 ? workspaceRecipient : [defaultRecipient]);
  const recipients = uniqueRecipients(primaryRecipients, additionalRecipients);

  if (!apiKey) {
    await admin.from('client_document_items').update({
      notification_email_error: 'RESEND_API_KEY absent',
    }).eq('id', itemId);
    return;
  }

  const { data: piece } = await admin
    .from('client_document_items')
    .select('label, document_type, original_name')
    .eq('id', itemId)
    .maybeSingle();

  const { data: lead } = leadId
    ? await admin
      .from('leads')
      .select('first_name, last_name, vehicle_make, vehicle_model, vehicle_registration')
      .eq('id', leadId)
      .maybeSingle()
    : { data: null };

  const partie = (valeur: unknown): string =>
    (typeof valeur === 'string' ? valeur.trim() : '');

  const nomClient = [partie(lead?.first_name), partie(lead?.last_name)]
    .filter(Boolean).join(' ') || 'Client sans nom';
  const vehicule = [
    [partie(lead?.vehicle_make), partie(lead?.vehicle_model)].filter(Boolean).join(' '),
    partie(lead?.vehicle_registration),
  ].filter(Boolean).join(' · ');
  const nomPiece = partie(piece?.label) || partie(piece?.document_type) || 'Document';
  const lienDossier = leadId
    ? `https://crm.relaisparebrise.fr/interventions/${leadId}`
    : 'https://crm.relaisparebrise.fr/today';

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject: `Document reçu — ${nomClient}`,
      html: `<div style="font-family:Arial,sans-serif;color:#101318;line-height:1.5">
        <h2 style="margin:0 0 4px">${texteHtml(nomClient)}</h2>
        <p style="margin:0 0 16px;color:#646464">a déposé : <strong>${texteHtml(nomPiece)}</strong></p>
        ${vehicule ? `<p style="margin:0 0 16px;color:#646464">${texteHtml(vehicule)}</p>` : ''}
        <p style="margin-top:20px"><a href="${lienDossier}" style="color:#16a34a;font-weight:600">Ouvrir le dossier</a></p>
      </div>`,
    }),
  });

  if (!response.ok) {
    await admin.from('client_document_items').update({
      notification_email_error: `Resend HTTP ${response.status}`,
    }).eq('id', itemId);
    return;
  }

  await admin.from('client_document_items').update({
    notification_email_sent_at: new Date().toISOString(),
    notification_email_error: null,
  }).eq('id', itemId);
}
