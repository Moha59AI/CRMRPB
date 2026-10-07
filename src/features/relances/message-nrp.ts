// Message envoye au client apres un appel sans reponse.
//
// Il doit etre compris en quelques secondes sur un telephone : pourquoi nous
// appelons, ce qui est deja enregistre dans le dossier et comment etre rappele.
// Les informations commerciales restent conditionnees aux donnees de la fiche.
// La franchise et l'assurance ne sont volontairement jamais mentionnees :
// elles doivent etre confirmees avant toute annonce au client.

import { LIBELLE_VITRAGE } from '@/features/leads/lead-shared';
import type { Lead } from '@/types';

/** Au-dela, l'offre est tronquee pour conserver un SMS facile a lire. */
const OFFRE_MAX = 48;

function nomDuVitrage(lead: Pick<Lead, 'glass_type'>): string {
  if (!lead.glass_type || lead.glass_type === 'pare_brise') return 'pare-brise';
  if (lead.glass_type === 'autre') return 'vitrage';
  return LIBELLE_VITRAGE[lead.glass_type].toLowerCase();
}

export interface OptionsMessageNrp {
  /** Numero de rappel. Vient des reglages entreprise ; omis s'il est vide. */
  telephone?: string | null;
  signature?: string;
}

/**
 * Compose le SMS « sans reponse ».
 *
 * Structure : contexte de l'appel → elements utiles du dossier → action
 * unique. Les sauts de ligne rendent le message nettement plus lisible dans
 * l'application SMS, sans changer son contenu ni sa journalisation.
 */
export function messageNrp(
  lead: Pick<Lead, 'first_name' | 'glass_type' | 'offer'>,
  options: OptionsMessageNrp = {},
): string {
  const { telephone, signature = 'Relais Pare-Brise' } = options;

  const prenom = lead.first_name?.trim();
  const vitrage = nomDuVitrage(lead);
  const offre = lead.offer?.trim();
  const paragraphes: string[] = [
    `Bonjour${prenom ? ` ${prenom}` : ''}, nous avons tenté de vous joindre pour votre demande de ${vitrage}.`,
  ];
  const dossier: string[] = [];

  // L'offre est rappelee sans creer artificiellement de reservation ou
  // d'urgence. Elle peut contenir un cadeau, un virement ou un texte libre.
  if (offre) {
    const court = offre.length > OFFRE_MAX ? `${offre.slice(0, OFFRE_MAX - 1).trimEnd()}…` : offre;
    dossier.push(`Offre « ${court} » bien enregistrée.`);
  }

  if (dossier.length > 0) paragraphes.push(dossier.join(' '));

  // Une seule action principale : repondre OUI. Le numero reste disponible
  // pour le client qui prefere rappeler lui-meme.
  paragraphes.push(
    telephone?.trim()
      ? `Pour être rappelé, répondez OUI ou appelez le ${telephone.trim()}.`
      : 'Pour être rappelé, répondez simplement OUI à ce SMS.',
  );

  paragraphes.push(signature.trim() || 'Relais Pare-Brise');

  return paragraphes.join('\n\n');
}
