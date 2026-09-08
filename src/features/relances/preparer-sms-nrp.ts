import { fetchLeadById } from '@/services/leads-service';
import { journaliserAction, type Relance } from '@/services/relances-service';
import { messageNrp } from './message-nrp';

export interface SmsNrpPrepare {
  phone: string;
  message: string;
}

/**
 * Prepare et journalise le meme SMS NRP depuis la fiche et les relances.
 *
 * La relance ne contient pas le cadeau ni la franchise. Relire le lead evite
 * donc un message generique qui oublierait justement l'argument commercial.
 */
export async function preparerSmsNrp(
  relance: Relance,
  telephoneEntreprise?: string | null,
): Promise<SmsNrpPrepare> {
  if (!relance.leadId) throw new Error('Cette relance n’a pas de lead associé');

  const lead = await fetchLeadById(relance.leadId);
  if (!lead) throw new Error('La fiche du lead est introuvable');

  const phone = lead.phone?.trim() || relance.phone?.trim();
  if (!phone) throw new Error('Aucun téléphone sur cette fiche');

  const message = messageNrp(lead, { telephone: telephoneEntreprise });
  await journaliserAction(relance, 'sms_outbound', message);

  return { phone, message };
}
