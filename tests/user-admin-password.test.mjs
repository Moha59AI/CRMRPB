import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('un administrateur peut creer un utilisateur avec son mot de passe initial', async () => {
  const [dialog, service, edge, usersPage] = await Promise.all([
    read('src/features/settings/components/dialogue-invitation.tsx'),
    read('src/services/invitations-service.ts'),
    read('supabase/functions/user-invite/index.ts'),
    read('src/features/settings/users-page.tsx'),
  ]);

  assert.match(dialog, /mode: 'password'/);
  assert.match(dialog, /creerAccesAvecMotDePasse\(v\.email, v\.role, v\.password\)/);
  assert.match(dialog, /Je crée le mot de passe/);
  assert.match(dialog, /Envoyer un lien par email/);
  assert.match(usersPage, /Nouvel utilisateur/);
  assert.match(service, /mode: 'password',[\s\S]*password/);
  assert.match(edge, /creationMode === 'password'/);
  assert.match(edge, /admin\.auth\.admin\.createUser\(\{[\s\S]*email,[\s\S]*password,[\s\S]*email_confirm: true/);
  assert.match(edge, /admin\.auth\.admin\.updateUserById\(userId, \{[\s\S]*password,[\s\S]*email_confirm: true/);
});

test('le mot de passe impose une politique forte cote interface et cote serveur', async () => {
  const [dialog, service, edge] = await Promise.all([
    read('src/features/settings/components/dialogue-invitation.tsx'),
    read('src/services/invitations-service.ts'),
    read('supabase/functions/user-invite/index.ts'),
  ]);

  assert.match(dialog, /valeurs\.password\.length < 12/);
  assert.match(dialog, /valeurs\.confirmation !== valeurs\.password/);
  assert.match(dialog, /genererMotDePasseInitial/);
  assert.match(dialog, /navigator\.clipboard\.writeText\(motDePasse\)/);
  assert.match(edge, /function motDePasseValide/);
  assert.match(edge, /value\.length >= 12/);
  assert.match(edge, /MOT_DE_PASSE_TROP_FAIBLE/);
  assert.match(service, /12 caractères avec une majuscule, une minuscule, un chiffre et un symbole/);
});

test('le mot de passe ne part ni dans le mail, ni dans les logs, ni dans la reponse', async () => {
  const [edge, dialog] = await Promise.all([
    read('supabase/functions/user-invite/index.ts'),
    read('src/features/settings/components/dialogue-invitation.tsx'),
  ]);

  assert.match(edge, /metadata: \{ email, role, activation: 'admin_password' \}/);
  assert.doesNotMatch(edge, /metadata:\s*\{[^}]*\bpassword\s*:/);
  const positionMessage = edge.indexOf('message_id: null');
  const debutReponse = edge.lastIndexOf('return json({', positionMessage);
  const finReponse = edge.indexOf('});', positionMessage);
  assert.ok(positionMessage > 0 && debutReponse > 0 && finReponse > positionMessage);
  const reponse = edge.slice(debutReponse, finReponse + 3);
  assert.match(reponse, /mode: 'password'/);
  assert.doesNotMatch(reponse, /\bpassword\s*:/);
  assert.match(edge, /const mailbox = creationMode === 'invitation'/);
  assert.match(dialog, /if \(!prochainEtat\) \{[\s\S]*reset\(\);[\s\S]*setPasswordVisible\(false\)/);
});

test('le parcours invitation existant reste disponible et retrocompatible', async () => {
  const [dialog, service, edge] = await Promise.all([
    read('src/features/settings/components/dialogue-invitation.tsx'),
    read('src/services/invitations-service.ts'),
    read('supabase/functions/user-invite/index.ts'),
  ]);

  assert.match(service, /mode: 'invitation'/);
  assert.match(edge, /body\.mode === 'string' && body\.mode \? body\.mode : 'invitation'/);
  assert.match(edge, /type: 'invite'/);
  assert.match(edge, /await transporter\.sendMail/);
  assert.match(dialog, /Invitation envoyée à/);
});
