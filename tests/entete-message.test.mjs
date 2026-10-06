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

test('le corps du message coule sur la page', async () => {
  const viewer = await read('src/features/integrations/email/email-html-viewer.tsx');

  // Le texte brut etait encadre et padde de 48 px. La vue mise en forme
  // garde sa bordure : l'iframe est un contenu etranger, et sa bordure dit
  // ou il commence.
  assert.match(viewer, /<div className="mt-4 min-h-32">/);
  assert.doesNotMatch(viewer, /mt-4 min-h-48 rounded-xl border border-border bg-card p-5/);
  assert.match(viewer, /mt-4 overflow-hidden rounded-xl border border-border bg-card/);
});

test('on ne repond pas a tout : l editeur attend le clic', async () => {
  const page = await read(PAGE);

  // Six lignes de saisie vides sous chaque message recu, qu'on y reponde ou
  // non.
  assert.match(page, /const \[reponseOuverte, setReponseOuverte\] = useState\(false\)/);
  assert.match(page, /\{inbound && !reponseOuverte && \(/);
  assert.match(page, /\{inbound && reponseOuverte && \(/);
  // Une reponse envoyee referme l'editeur.
  assert.match(page, /setReponseOuverte\(false\);/);
});

test('la carte des documents fournisseur tient sur une ligne de titre', async () => {
  const page = await read(PAGE);

  // Le titre, l'icone et le compte tiennent sur une seule ligne.
  assert.match(page, /<h3 className="flex items-center gap-2 text-xs font-semibold text-foreground">/);
  assert.ok(page.includes('<span className="font-normal text-muted-foreground">'));
  assert.doesNotMatch(page, /h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background text-due/);
});
