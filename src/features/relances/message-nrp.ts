// Message envoye au client apres un appel sans reponse
//
// Ton commercial assume : l'offre passe devant, le manque a gagner est
// explicite, et l'appel a l'action est unique et sans effort. Un
// « nous avons tente de vous joindre » poli ne fait rappeler personne.
//
// Une seule chose n'est jamais forcee : **les deux affirmations factuelles**.
// « 0 € a votre charge » n'est ecrit que si la franchise vaut zero dans la
// fiche, et la prise en charge assurance que si l'assureur est connu. Le reste
// du message est du ton ; ces deux phrases-la sont des engagements, et un
// engagement dementi au rappel suivant coute le dossier.

import { LIBELLE_VITRAGE } from '@/features/leads/lead-shared';
import type { Lead } from '@/types';

/** Au-dela, l'offre est tronquee : un SMS reste un SMS. */
const OFFRE_MAX = 55;

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
 * Compose le SMS « sans reponse », version commerciale.
 *
 * Structure : accroche sur l'offre → benefice chiffre → relance du contact
 * manque → action unique. Le prenom ouvre le message quand on le connait :
 * un SMS nominatif se lit, un SMS generique se supprime.
 */
export function messageNrp(
  lead: Pick<Lead, 'first_name' | 'glass_type' | 'offer' | 'franchise_amount' | 'insurance'>,
  options: OptionsMessageNrp = {},
): string {
  const { telephone, signature = 'Relais Pare-Brise' } = options;

  const prenom = lead.first_name?.trim();
  const vitrage = nomDuVitrage(lead);
  const offre = lead.offer?.trim();
  const phrases: string[] = [];

  // 1. L'accroche porte l'offre. C'est la seule raison de rappeler.
  if (offre) {
    const court = offre.length > OFFRE_MAX ? offre.slice(0, OFFRE_MAX - 1).trimEnd() + '…' : offre;
    phrases.push(`${prenom ? prenom + ', v' : 'V'}otre offre ${court} est réservée à votre nom.`);
  } else {
    phrases.push(`${prenom ? prenom + ', v' : 'V'}otre dossier ${vitrage} est prêt chez nous.`);
  }

  // 2. Le benefice chiffre — uniquement s'il est verifie dans la fiche.
  if (lead.franchise_amount === 0) {
    // Sans offre, l'accroche vient de nommer le vitrage : le repeter ici
    // donnerait « votre impact... Votre impact ne vous coute 0 EUR ».
    phrases.push(offre ? `Votre ${vitrage} ne vous coûte 0 €.` : '0 € à votre charge.');
  } else if (lead.insurance?.trim()) {
    phrases.push(`Pris en charge par votre assurance, sans avance de frais selon votre contrat.`);
  }

  // 3. On dit qu'on a appele : cela justifie le SMS et cree le rappel.
  phrases.push('Nous avons essayé de vous joindre sans succès.');

  // 4. Une seule action, la plus facile possible.
  phrases.push(
    telephone?.trim()
      ? `Rappelez-nous au ${telephone.trim()} ou répondez OUI, on vous rappelle.`
      : 'Répondez simplement OUI et on vous rappelle.',
  );

  phrases.push(signature);

  return phrases.join(' ');
}
