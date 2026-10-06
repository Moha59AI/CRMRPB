import { createClient, type User } from 'npm:@supabase/supabase-js@2.58.0';
import nodemailer from 'npm:nodemailer@10.0.10';
import {
  IONOS_SMTP_HOST,
  IONOS_SMTP_PORT,
  readIonosPassword,
} from '../_shared/ionos-email.ts';

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const roles = new Set(['admin', 'manager', 'advisor', 'technician', 'accountant']);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function emailValide(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function echapperHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function urlRetour(req: Request): string {
  const origin = req.headers.get('Origin')?.trim() ?? '';
  if (/^https:\/\/crm\.relaisparebrise\.fr$/i.test(origin)) {
    return `${origin}/update-password`;
  }
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
    return `${origin}/update-password`;
  }
  return 'https://crm.relaisparebrise.fr/update-password';
}

async function administrateur(req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error('UNAUTHORIZED');

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('workspace_id, role, first_name, last_name')
    .eq('id', data.user.id)
    .maybeSingle();
  if (profileError || !profile || profile.role !== 'admin') throw new Error('FORBIDDEN');

  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim();
  return { userId: data.user.id, workspaceId: profile.workspace_id as string, name };
}

async function boiteIonos(workspaceId: string) {
  const { data, error } = await admin
    .from('integration_connections')
    .select('id, settings')
    .eq('workspace_id', workspaceId)
    .eq('provider', 'ionos')
    .maybeSingle();
  if (error) throw new Error(error.message);

  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  const email = typeof settings.email_address === 'string'
    ? settings.email_address.trim().toLowerCase()
    : '';
  const senderName = typeof settings.sender_name === 'string' && settings.sender_name.trim()
    ? settings.sender_name.trim().slice(0, 100)
    : 'Relais Pare-Brise';
  const password = data ? await readIonosPassword(admin, workspaceId) : null;
  if (!data || !emailValide(email)) throw new Error('BOITE_IONOS_NON_CONFIGUREE');
  if (!password) throw new Error('MOT_DE_PASSE_IONOS_ABSENT');
  return { connectionId: data.id as string, email, senderName, password };
}

async function utilisateurParEmail(email: string): Promise<User | null> {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new Error(error.message);
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
    if (user) return user;
    if (data.users.length < 100) return null;
  }
  throw new Error('RECHERCHE_UTILISATEUR_INCOMPLETE');
}

async function creerOuProlongerInvitation(
  workspaceId: string,
  email: string,
  role: string,
  invitedBy: string,
) {
  const { data: existing, error: findError } = await admin
    .from('invitations')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('email', email)
    .is('accepted_at', null)
    .maybeSingle();
  if (findError) throw new Error(findError.message);

  if (existing) {
    const { data, error } = await admin.from('invitations').update({
      role,
      expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      invited_by: invitedBy,
    }).eq('id', existing.id).select('*').single();
    if (error) throw new Error(error.message);
    return { record: data, created: false };
  }

  const { data, error } = await admin.from('invitations').insert({
    workspace_id: workspaceId,
    email,
    role,
    invited_by: invitedBy,
    expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  }).select('*').single();
  if (error) throw new Error(error.message);
  return { record: data, created: true };
}

function emailInvitation(options: {
  actionLink: string;
  adminName: string;
  recipientEmail: string;
}) {
  const inviter = options.adminName || 'un administrateur Relais Pare-Brise';
  const safeLink = echapperHtml(options.actionLink);
  const safeInviter = echapperHtml(inviter);
  return {
    subject: 'Votre accès au CRM Relais Pare-Brise',
    text: [
      'Bonjour,',
      '',
      `${inviter} vous invite à rejoindre le CRM Relais Pare-Brise.`,
      'Choisissez votre mot de passe en ouvrant ce lien sécurisé :',
      options.actionLink,
      '',
      "Ce lien est personnel. Si vous n'êtes pas concerné, ignorez ce message.",
      '',
      'Relais Pare-Brise',
    ].join('\n'),
    html: `
      <div style="margin:0;padding:28px 16px;background:#f4f7f5;font-family:Arial,sans-serif;color:#111827">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:620px;margin:0 auto;border-collapse:collapse;background:#ffffff;border:1px solid #e5e7eb;border-radius:20px;overflow:hidden">
          <tr><td style="padding:28px 32px;background:#16a34a;color:#ffffff">
            <div style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;opacity:.9">Relais Pare-Brise</div>
            <div style="margin-top:7px;font-size:24px;font-weight:800">Votre accès au CRM</div>
          </td></tr>
          <tr><td style="padding:30px 32px">
            <p style="margin:0 0 16px;font-size:15px;line-height:1.65">Bonjour,</p>
            <p style="margin:0 0 22px;font-size:15px;line-height:1.65"><strong>${safeInviter}</strong> vous invite à rejoindre l’espace de travail Relais Pare-Brise.</p>
            <div style="margin:0 0 24px;text-align:center">
              <a href="${safeLink}" style="display:inline-block;padding:13px 22px;border-radius:999px;background:#16a34a;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none">Choisir mon mot de passe</a>
            </div>
            <p style="margin:0;font-size:12px;line-height:1.6;color:#6b7280">Ce lien est personnel et valable une seule fois. Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :</p>
            <p style="margin:8px 0 0;font-size:11px;line-height:1.5;word-break:break-all;color:#15803d">${safeLink}</p>
          </td></tr>
        </table>
        <p style="margin:14px auto 0;max-width:620px;text-align:center;font-size:11px;color:#9ca3af">Message envoyé à ${echapperHtml(options.recipientEmail)} par Relais Pare-Brise.</p>
      </div>`,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ success: false, error: 'Method Not Allowed' }, 405);

  let invitationId: string | null = null;
  let invitationCreated = false;
  let userIdToDelete: string | null = null;
  let profileIdToDelete: string | null = null;

  try {
    const caller = await administrateur(req);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const role = typeof body.role === 'string' ? body.role : '';
    if (!emailValide(email)) throw new Error('EMAIL_INVALIDE');
    if (!roles.has(role)) throw new Error('ROLE_INVALIDE');

    const mailbox = await boiteIonos(caller.workspaceId);
    const existingUser = await utilisateurParEmail(email);
    if (existingUser) {
      const { data: existingProfile, error: profileError } = await admin
        .from('profiles')
        .select('id, workspace_id')
        .eq('id', existingUser.id)
        .maybeSingle();
      if (profileError) throw new Error(profileError.message);
      if (existingProfile?.workspace_id === caller.workspaceId) {
        throw new Error('UTILISATEUR_DEJA_MEMBRE');
      }
      if (existingProfile) throw new Error('UTILISATEUR_DEJA_RATTACHE');
    }

    const invitation = await creerOuProlongerInvitation(
      caller.workspaceId,
      email,
      role,
      caller.userId,
    );
    invitationId = invitation.record.id as string;
    invitationCreated = invitation.created;

    let actionLink = '';
    if (existingUser) {
      const { error: profileInsertError } = await admin.from('profiles').insert({
        id: existingUser.id,
        workspace_id: caller.workspaceId,
        first_name: '',
        last_name: '',
        role,
      });
      if (profileInsertError) throw new Error(profileInsertError.message);
      profileIdToDelete = existingUser.id;
      const { error: invitationError } = await admin.from('invitations').update({
        accepted_at: new Date().toISOString(),
      }).eq('id', invitationId);
      if (invitationError) throw new Error(invitationError.message);

      const { data, error } = await admin.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo: urlRetour(req) },
      });
      if (error) throw new Error(error.message);
      actionLink = data.properties.action_link;
    } else {
      const { data, error } = await admin.auth.admin.generateLink({
        type: 'invite',
        email,
        options: { redirectTo: urlRetour(req) },
      });
      if (error) throw new Error(error.message);
      userIdToDelete = data.user.id;
      actionLink = data.properties.action_link;

      const { data: generatedProfile, error: generatedProfileError } = await admin
        .from('profiles')
        .select('id')
        .eq('id', data.user.id)
        .maybeSingle();
      if (generatedProfileError) throw new Error(generatedProfileError.message);
      if (!generatedProfile) {
        const { error: profileInsertError } = await admin.from('profiles').insert({
          id: data.user.id,
          workspace_id: caller.workspaceId,
          first_name: '',
          last_name: '',
          role,
        });
        if (profileInsertError) throw new Error(profileInsertError.message);
        const { error: invitationError } = await admin.from('invitations').update({
          accepted_at: new Date().toISOString(),
        }).eq('id', invitationId);
        if (invitationError) throw new Error(invitationError.message);
      }
    }
    if (!actionLink) throw new Error('LIEN_INVITATION_ABSENT');

    const message = emailInvitation({
      actionLink,
      adminName: caller.name,
      recipientEmail: email,
    });
    const transporter = nodemailer.createTransport({
      host: IONOS_SMTP_HOST,
      port: IONOS_SMTP_PORT,
      secure: true,
      auth: { user: mailbox.email, pass: mailbox.password },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
      tls: { minVersion: 'TLSv1.2', servername: IONOS_SMTP_HOST },
    });
    const result = await transporter.sendMail({
      from: { name: mailbox.senderName, address: mailbox.email },
      to: email,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    const accepted = result.accepted.map((recipient) => String(recipient).toLowerCase());
    if (!accepted.includes(email)) throw new Error('IONOS_A_REFUSE_LE_DESTINATAIRE');

    await admin.from('audit_logs').insert({
      workspace_id: caller.workspaceId,
      user_id: caller.userId,
      action: 'user_invitation_email_sent',
      entity_type: 'invitation',
      entity_id: invitationId,
      metadata: { email, role, provider: 'ionos-smtp', message_id: result.messageId },
    });

    return json({
      success: true,
      invitation_id: invitationId,
      email,
      message_id: result.messageId,
    });
  } catch (error) {
    if (userIdToDelete) await admin.auth.admin.deleteUser(userIdToDelete).catch(() => undefined);
    if (profileIdToDelete) await admin.from('profiles').delete().eq('id', profileIdToDelete);
    if (invitationId && invitationCreated) {
      await admin.from('invitations').delete().eq('id', invitationId);
    } else if (invitationId) {
      await admin.from('invitations').update({ accepted_at: null }).eq('id', invitationId);
    }

    const message = error instanceof Error ? error.message : String(error);
    const exposedErrors = new Set([
      'UNAUTHORIZED', 'FORBIDDEN', 'EMAIL_INVALIDE', 'ROLE_INVALIDE',
      'BOITE_IONOS_NON_CONFIGUREE', 'MOT_DE_PASSE_IONOS_ABSENT',
      'UTILISATEUR_DEJA_MEMBRE', 'UTILISATEUR_DEJA_RATTACHE',
      'IONOS_A_REFUSE_LE_DESTINATAIRE',
    ]);
    if (!exposedErrors.has(message)) console.error('Invitation utilisateur:', message);
    const publicMessage = exposedErrors.has(message) ? message : 'ENVOI_INVITATION_IMPOSSIBLE';
    const status = message === 'UNAUTHORIZED' ? 401
      : message === 'FORBIDDEN' ? 403
        : message === 'UTILISATEUR_DEJA_MEMBRE' || message === 'UTILISATEUR_DEJA_RATTACHE' ? 409
          : 400;
    return json({ success: false, error: publicMessage }, status);
  }
});
