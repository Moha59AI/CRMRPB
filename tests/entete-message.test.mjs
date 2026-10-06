import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const ENTETE = 'src/features/integrations/email/entete-message.tsx';
const PAGE = 'src/features/integrations/email/email-inbox-page.tsx';

test("l'en-tête d'un message tient en deux lignes", async () => {
  const entete = await read(ENTETE);

  // C'etait un tableau encadre de cinq lignes -- De, A, Date, Correspondant,
  // Rattachement -- avant la premiere phrase du message.
  assert.match(entete, /function dateComplete/);
  assert.match(entete, /\{initiales\(affiche\)\}/);
  assert.ok(entete.includes('à {email.recipient_email ?? \'destinataire inconnu\'}'));
});

test('le détail se déplie, il ne s’impose pas', async () => {
  const entete = await read(ENTETE);

  assert.match(entete, /const \[deplie, setDeplie\] = useState\(false\)/);
  assert.match(entete, /aria-expanded=\{deplie\}/);
  assert.match(entete, /\{deplie && \(/);
  // Le chevron doit dire dans quel sens on va.
  assert.ok(entete.includes("deplie && 'rotate-180'"));
});

test('ce qui appelle une action reste visible', async () => {
  const entete = await read(ENTETE);

  // Un message non rattache demande un geste : il ne se cache pas derriere
  // le chevron.
  const apresDeplie = entete.slice(entete.indexOf('{deplie && ('));
  assert.match(apresDeplie, /\{aRattacher && \(/);
  assert.match(apresDeplie, /Aucun client ou lead correspondant/);
});

test('la page utilise l’en-tête et plus le tableau', async () => {
  const page = await read(PAGE);

  assert.match(page, /<EnteteMessage/);
  assert.doesNotMatch(page, /grid-cols-\[64px_minmax\(0,1fr\)\]/);
  assert.doesNotMatch(page, /<span className="text-muted-foreground">Rattachement<\/span>/);
});
