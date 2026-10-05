import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.58.0';

export type StoredInboundAttachment = {
  id: string;
  filename: string;
  content_type: string | null;
  size: number | null;
  storage_path: string;
};

export type InboundEmail = {
  id: string;
  workspaceId: string;
  connectionId: string;
  provider: string;
  externalId: string;
  sender: string;
  recipient: string;
  subject: string;
  content: string;
  messageId: string | null;
  attachments: StoredInboundAttachment[];
  createdAt: string;
  notify: boolean;
};

type CorrespondantEmail = {
  type: 'assureur' | 'expert' | 'fournisseur' | 'autre';
  nom: string | null;
};

const domainesGeneriques = new Set([
  'gmail.com', 'hotmail.com', 'icloud.com', 'laposte.net', 'live.fr', 'orange.fr',
  'outlook.com', 'outlook.fr', 'sfr.fr', 'wanadoo.fr', 'yahoo.com', 'yahoo.fr',
]);

const domainesExperts: Array<{ domaine: string; nom: string }> = [
  { domaine: 'solutions-expertises.com', nom: 'Solutions Expertises' },
  { domaine: 'bca-expertise.com', nom: 'BCA Expertise' },
  { domaine: 'bca-expertise.fr', nom: 'BCA Expertise' },
  { domaine: 'eurexo.fr', nom: 'Eurexo' },
  { domaine: 'polyexpert.fr', nom: 'Polyexpert' },
  { domaine: 'saretec.fr', nom: 'Saretec' },
  { domaine: 'texa.fr', nom: 'Groupe Texa' },
  { domaine: 'adenes.eu', nom: 'Adenes' },
  { domaine: 'cabinet-roux.com', nom: 'Cabinet Roux' },
];

const domainesFournisseurs: Array<{ domaine: string; nom: string }> = [
  { domaine: 'vsf41.com', nom: 'VSF' },
  { domaine: 'parebrisevsf.com', nom: 'VSF' },
  { domaine: 'nsg.com', nom: 'Pilkington' },
  { domaine: 'pilkington.com', nom: 'Pilkington' },
];

function extraireAdresses(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return (value.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? [])
    .map((adresse) => adresse.toLowerCase());
}

function domaineDe(adresse: string): string {
  return adresse.split('@')[1] ?? '';
}

function correspondAuDomaine(domaine: string, attendu: string): boolean {
  return domaine === attendu || domaine.endsWith(`.${attendu}`);
}

function classifierCorrespondant(
  sender: string,
  subject: string,
  assureurs: Array<{ name: string; email: string | null; claims_email: string | null }>,
): CorrespondantEmail {
  const domaine = domaineDe(sender);
  const fournisseurConnu = domainesFournisseurs.find((fournisseur) => (
    correspondAuDomaine(domaine, fournisseur.domaine)
  ));
  if (fournisseurConnu) return { type: 'fournisseur', nom: fournisseurConnu.nom };

  for (const assureur of assureurs) {
    const adresses = [
      ...extraireAdresses(assureur.email),
      ...extraireAdresses(assureur.claims_email),
    ];
    if (adresses.includes(sender)) return { type: 'assureur', nom: assureur.name };
  }

  if (domaine && !domainesGeneriques.has(domaine)) {
    for (const assureur of assureurs) {
      const domaines = [
        ...extraireAdresses(assureur.email),
        ...extraireAdresses(assureur.claims_email),
      ].map(domaineDe);
      if (domaines.some((connu) => correspondAuDomaine(domaine, connu))) {
        return { type: 'assureur', nom: assureur.name };
      }
    }
  }

  const expertConnu = domainesExperts.find((expert) => correspondAuDomaine(domaine, expert.domaine));
  if (expertConnu) return { type: 'expert', nom: expertConnu.nom };

  const texte = `${sender} ${subject}`.toLowerCase();
  const expressionsExpert = [
    'ordre de mission', 'mission d’expertise', "mission d'expertise",
    'rapport d’expertise', "rapport d'expertise", 'rapport expert',
    'mandat expert', 'expert automobile',
  ];
  if (
    domaine.includes('expert')
    || sender.split('@')[0]?.includes('expert')
    || expressionsExpert.some((expression) => texte.includes(expression))
  ) {
    return { type: 'expert', nom: null };
  }

  return { type: 'autre', nom: null };
}

function normaliserImmatriculation(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function extraireImmatriculations(value: string): string[] {
  const trouvees = value.toUpperCase().match(/\b[A-Z]{2}[\s-]?\d{3}[\s-]?[A-Z]{2}\b/g) ?? [];
  return [...new Set(trouvees.map(normaliserImmatriculation))];
}

export async function emailAlreadyImported(
  admin: SupabaseClient,
  workspaceId: string,
  provider: string,
  externalId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from('communications')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('provider', provider)
    .eq('external_id', externalId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function storeInboundEmail(
  admin: SupabaseClient,
  email: InboundEmail,
): Promise<'inserted' | 'duplicate'> {
  const { data: insurers, error: insurersError } = await admin
    .from('insurers')
    .select('name, email, claims_email')
    .eq('workspace_id', email.workspaceId)
    .eq('actif', true);
  if (insurersError) console.warn('Classification email sans referentiel assureurs', insurersError.message);
  const correspondant = classifierCorrespondant(
    email.sender,
    email.subject,
    (insurers ?? []) as Array<{ name: string; email: string | null; claims_email: string | null }>,
  );

  const [{ data: contact, error: contactError }, { data: leadByEmail, error: leadError }] = await Promise.all([
    admin.from('contacts')
      .select('id')
      .eq('workspace_id', email.workspaceId)
      .ilike('email', email.sender)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from('leads')
      .select('id, contact_id')
      .eq('workspace_id', email.workspaceId)
      .ilike('email', email.sender)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (contactError) throw new Error(contactError.message);
  if (leadError) throw new Error(leadError.message);

  let linkedLead = leadByEmail;
  if (!linkedLead) {
    const immatriculations = new Set(extraireImmatriculations(`${email.subject}\n${email.content}`));
    if (immatriculations.size > 0) {
      const filtres = [...immatriculations].map((immatriculation) => (
        `vehicle_registration.ilike.${immatriculation.slice(0, 2)}%${immatriculation.slice(2, 5)}%${immatriculation.slice(5)}`
      ));
      const { data: candidates, error: candidatesError } = await admin
        .from('leads')
        .select('id, contact_id, vehicle_registration')
        .eq('workspace_id', email.workspaceId)
        .or(filtres.join(','))
        .order('created_at', { ascending: false })
        .limit(20);
      if (candidatesError) {
        console.warn('Rattachement email par immatriculation impossible', candidatesError.message);
      } else {
        linkedLead = (candidates ?? []).find((candidate) => (
          typeof candidate.vehicle_registration === 'string'
          && immatriculations.has(normaliserImmatriculation(candidate.vehicle_registration))
        )) ?? null;
      }
    }
  }

  const contactId = linkedLead?.contact_id ?? contact?.id ?? null;
  const leadId = linkedLead?.id ?? null;
  const { error: insertError } = await admin.from('communications').insert({
    id: email.id,
    workspace_id: email.workspaceId,
    contact_id: contactId,
    lead_id: leadId,
    type: 'email_inbound',
    direction: 'inbound',
    status: 'received',
    subject: email.subject,
    content: email.content.slice(0, 50_000) || null,
    provider: email.provider,
    external_id: email.externalId,
    sender_email: email.sender,
    recipient_email: email.recipient,
    email_message_id: email.messageId,
    email_attachments: email.attachments,
    created_at: email.createdAt,
  });
  if (insertError?.code === '23505') return 'duplicate';
  if (insertError) throw new Error(insertError.message);

  const { data: recipients, error: recipientsError } = await admin
    .from('profiles')
    .select('id')
    .eq('workspace_id', email.workspaceId)
    .in('role', ['admin', 'manager', 'advisor']);
  if (recipientsError) throw new Error(recipientsError.message);

  const link = leadId ? `/interventions/${leadId}` : contactId ? `/clients/${contactId}` : '/emails';
  const notificationTitle = correspondant.type === 'assureur'
    ? `Email assureur${correspondant.nom ? ` · ${correspondant.nom}` : ''}`
    : correspondant.type === 'expert'
      ? `Email expert${correspondant.nom ? ` · ${correspondant.nom}` : ''}`
      : correspondant.type === 'fournisseur'
        ? `Email fournisseur${correspondant.nom ? ` · ${correspondant.nom}` : ''}`
        : 'Nouvel email reçu';
  if (email.notify && (recipients ?? []).length > 0) {
    const { error: notificationError } = await admin.from('notifications').insert(
      (recipients ?? []).map((profile) => ({
        workspace_id: email.workspaceId,
        user_id: profile.id,
        title: notificationTitle,
        body: `${email.sender} — ${email.subject}`,
        type: 'email_received',
        link,
        dedup_key: `email-recu-${email.provider}-${email.externalId}`,
      })),
    );
    if (notificationError) throw new Error(notificationError.message);
  }

  const { error: connectionError } = await admin.from('integration_connections').update({
    status: 'connected',
    last_success_at: new Date().toISOString(),
    last_error: null,
  }).eq('id', email.connectionId);
  if (connectionError) throw new Error(connectionError.message);

  return 'inserted';
}
