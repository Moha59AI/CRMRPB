import type { Communication, Insurer } from '@/types';

export type EmailPartyCategory = 'insurer' | 'expert' | 'supplier' | 'other';

export interface EmailPartyClassification {
  category: EmailPartyCategory;
  organization: string | null;
  confidence: 'confirmed' | 'probable';
}

const EMAIL_PATTERN = /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const GENERIC_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'hotmail.com',
  'icloud.com',
  'laposte.net',
  'live.fr',
  'orange.fr',
  'outlook.com',
  'outlook.fr',
  'sfr.fr',
  'wanadoo.fr',
  'yahoo.com',
  'yahoo.fr',
]);

const EXPERT_DOMAINS: Array<{ domain: string; name: string }> = [
  { domain: 'solutions-expertises.com', name: 'Solutions Expertises' },
  { domain: 'bca-expertise.com', name: 'BCA Expertise' },
  { domain: 'bca-expertise.fr', name: 'BCA Expertise' },
  { domain: 'eurexo.fr', name: 'Eurexo' },
  { domain: 'polyexpert.fr', name: 'Polyexpert' },
  { domain: 'saretec.fr', name: 'Saretec' },
  { domain: 'texa.fr', name: 'Groupe Texa' },
  { domain: 'adenes.eu', name: 'Adenes' },
  { domain: 'cabinet-roux.com', name: 'Cabinet Roux' },
];

const SUPPLIER_DOMAINS: Array<{ domain: string; name: string }> = [
  { domain: 'vsf41.com', name: 'VSF' },
  { domain: 'parebrisevsf.com', name: 'VSF' },
  { domain: 'nsg.com', name: 'Pilkington' },
  { domain: 'pilkington.com', name: 'Pilkington' },
];

const EXPERT_WORDS = [
  'ordre de mission',
  'mission d’expertise',
  "mission d'expertise",
  'rapport d’expertise',
  "rapport d'expertise",
  'rapport expert',
  'mandat expert',
  'expert automobile',
];

function extractAddresses(value: string | null): string[] {
  return (value?.match(EMAIL_PATTERN) ?? []).map((address) => address.toLowerCase());
}

function domainOf(address: string): string {
  return address.split('@')[1] ?? '';
}

function interlocutorAddress(email: Communication): string {
  return (email.direction === 'inbound' ? email.sender_email : email.recipient_email)?.toLowerCase() ?? '';
}

function matchesDomain(domain: string, expected: string): boolean {
  return domain === expected || domain.endsWith(`.${expected}`);
}

export function classifyEmailParty(
  email: Communication,
  insurers: Insurer[],
): EmailPartyClassification {
  const address = interlocutorAddress(email);
  const domain = domainOf(address);

  const knownSupplier = SUPPLIER_DOMAINS.find((candidate) => matchesDomain(domain, candidate.domain));
  if (knownSupplier) {
    return { category: 'supplier', organization: knownSupplier.name, confidence: 'confirmed' };
  }

  for (const insurer of insurers) {
    const knownAddresses = [
      ...extractAddresses(insurer.email),
      ...extractAddresses(insurer.claims_email),
    ];
    if (knownAddresses.includes(address)) {
      return { category: 'insurer', organization: insurer.name, confidence: 'confirmed' };
    }
  }

  if (domain && !GENERIC_EMAIL_DOMAINS.has(domain)) {
    for (const insurer of insurers) {
      const insurerDomains = [
        ...extractAddresses(insurer.email),
        ...extractAddresses(insurer.claims_email),
      ].map(domainOf);
      if (insurerDomains.some((knownDomain) => matchesDomain(domain, knownDomain))) {
        return { category: 'insurer', organization: insurer.name, confidence: 'probable' };
      }
    }
  }

  const knownExpert = EXPERT_DOMAINS.find((candidate) => matchesDomain(domain, candidate.domain));
  if (knownExpert) {
    return { category: 'expert', organization: knownExpert.name, confidence: 'confirmed' };
  }

  const searchable = `${address} ${email.subject ?? ''}`.toLocaleLowerCase('fr-FR');
  if (
    domain.includes('expert')
    || address.split('@')[0]?.includes('expert')
    || EXPERT_WORDS.some((word) => searchable.includes(word))
  ) {
    return { category: 'expert', organization: null, confidence: 'probable' };
  }

  return { category: 'other', organization: null, confidence: 'confirmed' };
}
