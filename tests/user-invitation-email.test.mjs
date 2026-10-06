import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('une invitation utilisateur passe par une fonction serveur authentifiee', async () => {
  const [service, edge, config] = await Promise.all([
    read('src/services/invitations-service.ts'),
    read('supabase/functions/user-invite/index.ts'),
    read('supabase/config.toml'),
  ]);

  assert.match(service, /functions\.invoke<[^>]+>[\s\S]*\('user-invite'/);
  assert.doesNotMatch(service, /rpc\('creer_invitation'/);
  assert.match(edge, /profile\.role !== 'admin'/);
  assert.match(edge, /type: 'invite'/);
  assert.match(edge, /return 'https:\/\/crm\.relaisparebrise\.fr\/update-password'/);
  assert.match(edge, /redirectTo: urlRetour\(\)/);
  assert.doesNotMatch(edge, /localhost|127\.0\.0\.1/);
  assert.match(config, /\[functions\.user-invite\][\s\S]*verify_jwt = true/);
});

test('une invitation locale renvoie vers la production et peut etre reemise avant la premiere connexion', async () => {
  const edge = await read('supabase/functions/user-invite/index.ts');

  assert.match(edge, /existingProfile\?\.workspace_id === caller\.workspaceId && existingUser\.last_sign_in_at/);
  assert.match(edge, /if \(!existingProfile\)/);
  assert.match(edge, /type: 'recovery'/);
});

test('le mail d invitation est envoye par IONOS et confirme seulement apres acceptation SMTP', async () => {
  const [edge, dialog] = await Promise.all([
    read('supabase/functions/user-invite/index.ts'),
    read('src/features/settings/components/dialogue-invitation.tsx'),
  ]);

  assert.match(edge, /IONOS_SMTP_HOST/);
  assert.match(edge, /readIonosPassword/);
  assert.match(edge, /await transporter\.sendMail/);
  assert.match(edge, /IONOS_A_REFUSE_LE_DESTINATAIRE/);
  assert.match(edge, /user_invitation_email_sent/);
  assert.match(dialog, /Invitation envoyée à/);
  assert.match(dialog, /IONOS a accepté le message/);
});

test('un echec SMTP annule le compte et ne laisse pas de fausse invitation', async () => {
  const edge = await read('supabase/functions/user-invite/index.ts');

  assert.match(edge, /deleteUser\(userIdToDelete\)/);
  assert.match(edge, /delete\(\)\.eq\('id', profileIdToDelete\)/);
  assert.match(edge, /invitationId && invitationCreated/);
  assert.match(edge, /from\('invitations'\)\.delete\(\)/);
  assert.match(edge, /update\(\{ accepted_at: null \}\)/);
  assert.match(edge, /ENVOI_INVITATION_IMPOSSIBLE/);
});
