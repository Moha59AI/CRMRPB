import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function bytesBase64(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function egaux(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function verifierSignature(req: Request, payload: string): Promise<boolean> {
  const secret = Deno.env.get('RESEND_WEBHOOK_SECRET') ?? '';
  const id = req.headers.get('svix-id') ?? '';
  const timestamp = req.headers.get('svix-timestamp') ?? '';
  const signatures = req.headers.get('svix-signature') ?? '';
  if (!secret || !id || !timestamp || !signatures) return false;

  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber) || Math.abs(Date.now() / 1000 - timestampNumber) > 300) return false;

  const secretBytes = bytesBase64(secret.replace(/^whsec_/, ''));
  const key = await crypto.subtle.importKey(
    'raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signed = new TextEncoder().encode(`${id}.${timestamp}.${payload}`);
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, signed));

  return signatures.split(' ').some((entry) => {
    const [version, signature] = entry.split(',');
    if (version !== 'v1' || !signature) return false;
    try {
      return egaux(expected, bytesBase64(signature));
    } catch {
      return false;
    }
  });
}

function extraireAdresse(value: unknown): string {
  if (typeof value !== 'string') return '';
  const entreChevrons = value.match(/<([^<>\s]+@[^<>\s]+)>/);
  return (entreChevrons?.[1] ?? value).trim().toLowerCase();
}

function htmlVersTexte(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

type CorrespondantEmail = {
  type: 'assureur' | 'expert' | 'autre';
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

async function traiterStatut(event: Record<string, unknown>): Promise<void> {
  const type = typeof event.type === 'string' ? event.type : '';
  if (!['email.delivered', 'email.failed', 'email.bounced'].includes(type)) return;
  const data = (event.data ?? {}) as Record<string, unknown>;
  const externalId = typeof data.email_id === 'string' ? data.email_id : '';
  if (!externalId) return;

  await admin.from('communications').update({
    status: type === 'email.delivered' ? 'delivered' : 'failed',
    delivered_at: type === 'email.delivered' ? new Date().toISOString() : null,
  }).eq('provider', 'resend-ionos').eq('external_id', externalId);
}

async function traiterEmailRecu(event: Record<string, unknown>): Promise<void> {
  const data = (event.data ?? {}) as Record<string, unknown>;
  const emailId = typeof data.email_id === 'string' ? data.email_id : '';
  const apiKey = Deno.env.get('RESEND_API_KEY') ?? '';
  if (!emailId || !apiKey) throw new Error('CONFIGURATION_RESEND_INCOMPLETE');

  const response = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const email = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(`RESEND_RECEIVING_HTTP_${response.status}`);

  const destinations = [
    ...(Array.isArray(data.to) ? data.to : []),
    ...(Array.isArray(email.to) ? email.to : []),
  ].map(extraireAdresse).filter(Boolean);

  const { data: connections, error: connectionError } = await admin
    .from('integration_connections')
    .select('id, workspace_id, settings')
    .eq('provider', 'ionos');
  if (connectionError) throw new Error(connectionError.message);

  const connection = (connections ?? []).find((candidate) => {
    const settings = (candidate.settings ?? {}) as Record<string, unknown>;
    const inbound = extraireAdresse(settings.inbound_address);
    return inbound && destinations.includes(inbound);
  });
  if (!connection) {
    console.warn('Email Resend ignore : aucune adresse de transfert IONOS correspondante', destinations);
    return;
  }

  const workspaceId = connection.workspace_id as string;
  const settings = (connection.settings ?? {}) as Record<string, unknown>;
  const sender = extraireAdresse(email.from ?? data.from);
  if (!sender) {
    console.warn('Email Resend ignore : expéditeur absent', emailId);
    return;
  }
  const recipient = extraireAdresse(settings.email_address);
  const subject = typeof email.subject === 'string' ? email.subject.slice(0, 200) : '(Sans objet)';
  const textBody = typeof email.text === 'string' && email.text.trim()
    ? email.text.trim()
    : typeof email.html === 'string' ? htmlVersTexte(email.html) : '';
  const attachments = Array.isArray(email.attachments)
    ? email.attachments.slice(0, 30).map((item) => {
        const attachment = item as Record<string, unknown>;
        return {
          id: String(attachment.id ?? ''),
          filename: String(attachment.filename ?? 'piece-jointe').slice(0, 180),
          content_type: typeof attachment.content_type === 'string' ? attachment.content_type : null,
          size: typeof attachment.size === 'number' ? attachment.size : null,
        };
      })
    : [];

  const { data: insurers, error: insurersError } = await admin
    .from('insurers')
    .select('name, email, claims_email')
    .eq('workspace_id', workspaceId)
    .eq('actif', true);
  if (insurersError) console.warn('Classification email sans referentiel assureurs', insurersError.message);
  const correspondant = classifierCorrespondant(
    sender,
    subject,
    (insurers ?? []) as Array<{ name: string; email: string | null; claims_email: string | null }>,
  );

  const [{ data: contact, error: contactError }, { data: leadByEmail, error: leadError }] = await Promise.all([
    admin.from('contacts')
      .select('id')
      .eq('workspace_id', workspaceId)
      .ilike('email', sender)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from('leads')
      .select('id, contact_id')
      .eq('workspace_id', workspaceId)
      .ilike('email', sender)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (contactError) throw new Error(contactError.message);
  if (leadError) throw new Error(leadError.message);

  let linkedLead = leadByEmail;
  if (!linkedLead) {
    const immatriculations = new Set(extraireImmatriculations(`${subject}\n${textBody}`));
    if (immatriculations.size > 0) {
      const filtresImmatriculation = [...immatriculations].map((immatriculation) => (
        `vehicle_registration.ilike.${immatriculation.slice(0, 2)}%${immatriculation.slice(2, 5)}%${immatriculation.slice(5)}`
      ));
      const { data: candidates, error: candidatesError } = await admin
        .from('leads')
        .select('id, contact_id, vehicle_registration')
        .eq('workspace_id', workspaceId)
        .or(filtresImmatriculation.join(','))
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

  // Si un lead récent existe, son contact fait autorité. Cela évite de lier
  // le même email à un ancien doublon de contact trouvé indépendamment.
  const contactId = linkedLead?.contact_id ?? contact?.id ?? null;
  const leadId = linkedLead?.id ?? null;
  const { error: insertError } = await admin.from('communications').insert({
    workspace_id: workspaceId,
    contact_id: contactId,
    lead_id: leadId,
    type: 'email_inbound',
    direction: 'inbound',
    status: 'received',
    subject,
    content: textBody.slice(0, 50_000) || null,
    provider: 'resend-ionos',
    external_id: emailId,
    sender_email: sender || null,
    recipient_email: recipient || null,
    email_message_id: typeof email.message_id === 'string' ? email.message_id.slice(0, 500) : null,
    email_attachments: attachments,
    created_at: typeof email.created_at === 'string' ? email.created_at : new Date().toISOString(),
  });
  if (insertError?.code === '23505') {
    if (leadId || contactId) {
      const rattachement = {
        ...(leadId ? { lead_id: leadId } : {}),
        ...(contactId ? { contact_id: contactId } : {}),
      };
      const { error: linkError } = await admin.from('communications')
        .update(rattachement)
        .eq('workspace_id', workspaceId)
        .eq('provider', 'resend-ionos')
        .eq('external_id', emailId)
        .is('lead_id', null);
      if (linkError) throw new Error(linkError.message);
    }
    return;
  }
  if (insertError) throw new Error(insertError.message);

  const { data: recipients, error: recipientsError } = await admin
    .from('profiles')
    .select('id')
    .eq('workspace_id', workspaceId)
    .in('role', ['admin', 'manager', 'advisor']);
  if (recipientsError) throw new Error(recipientsError.message);

  const link = leadId ? `/interventions/${leadId}` : contactId ? `/clients/${contactId}` : '/communications';
  const notificationTitle = correspondant.type === 'assureur'
    ? `Email assureur${correspondant.nom ? ` · ${correspondant.nom}` : ''}`
    : correspondant.type === 'expert'
      ? `Email expert${correspondant.nom ? ` · ${correspondant.nom}` : ''}`
      : 'Nouvel email reçu';
  if ((recipients ?? []).length > 0) {
    const { error: notificationError } = await admin.from('notifications').insert(
      (recipients ?? []).map((profile) => ({
        workspace_id: workspaceId,
        user_id: profile.id,
        title: notificationTitle,
        body: `${sender} — ${subject}`,
        type: 'email_received',
        link,
        dedup_key: `email-recu-${emailId}`,
      })),
    );
    if (notificationError) throw new Error(notificationError.message);
  }

  await admin.from('integration_connections').update({
    status: 'connected',
    last_success_at: new Date().toISOString(),
    last_error: null,
  }).eq('id', connection.id);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
  const payload = await req.text();

  try {
    if (!await verifierSignature(req, payload)) return json({ error: 'Signature invalide' }, 401);
    const event = JSON.parse(payload) as Record<string, unknown>;
    if (event.type === 'email.received') await traiterEmailRecu(event);
    else await traiterStatut(event);
    return json({ received: true });
  } catch (error) {
    console.error('email-inbound-webhook', error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
