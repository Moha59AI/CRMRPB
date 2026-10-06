import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const RAIL = 'src/features/integrations/email/rail-mail.tsx';
const BARRE = 'src/features/integrations/email/barre-outils-mail.tsx';
const LIGNE = 'src/features/integrations/email/ligne-email.tsx';
const PAGE = 'src/features/integrations/email/email-inbox-page.tsx';

test('les vues passent dans un rail vertical, avec leurs non-lus', async () => {
  const rail = await read(RAIL);
  const page = await read(PAGE);

  // Sept pastilles alignees en haut poussaient la liste vers le bas et
  // debordaient. Le rail accepte autant d'entrees qu'on veut.
  assert.match(rail, /Nouveau message/);
  assert.match(rail, /Catégories/);
  // Le non-lu prime sur le total : c'est lui qui appelle une action.
  assert.match(rail, /\{nonLus > 0 \? \(/);
  assert.match(page, /const entreesRail = useMemo/);
  assert.match(page, /const categoriesRail = useMemo/);
  assert.doesNotMatch(page, /const mailboxViews/);
});

test('une sélection partielle se distingue d’une sélection vide', async () => {
  const barre = await read(BARRE);

  // Une case vide dirait « rien de selectionne », ce qui serait faux.
  assert.match(barre, /element\.indeterminate = selection > 0 && !toutSelectionne/);
  // Les actions groupees n'apparaissent que s'il y a sur quoi agir.
  assert.match(barre, /\{selection > 0 \? \(/);
});

test('l’étoile agit, et le suivi est partagé', async () => {
  const ligne = await read(LIGNE);
  const service = await read('src/features/integrations/email/email-service.ts');
  const migration = await read('supabase/migrations/20261006140000_email_suivi.sql');
  const types = await read('src/types/index.ts');

  assert.match(ligne, /const suivi = Boolean\(email\.starred_at\)/);
  assert.match(ligne, /aria-pressed=\{suivi\}/);
  assert.ok(ligne.includes("suivi ? 'fill-due text-due' : 'text-faint/50 hover:text-due'"));
  assert.match(service, /export async function basculerSuiviEmail/);
  assert.match(migration, /add column if not exists starred_at timestamptz/);
  assert.match(types, /starred_at: string \| null/);
});

test('les actions groupées marquent lu, non lu et suivi', async () => {
  const service = await read('src/features/integrations/email/email-service.ts');
  const page = await read(PAGE);

  assert.match(service, /export async function marquerEmailsLus/);
  // Remettre en non lu efface la date : le repere redevient « jamais ouvert ».
  assert.match(service, /read_at: lu \? new Date\(\)\.toISOString\(\) : null/);
  assert.match(page, /marquerEmailsLus\(\[\.\.\.selection\], lus\)/);
  // Une action qui echoue le dit, et ne vide pas la selection en silence.
  assert.match(page, /const agirSurSelection = async/);
  assert.match(page, /toast\.error\(erreur instanceof Error/);
});

test('un clic sur la case ou l’étoile n’ouvre pas le message', async () => {
  const ligne = await read(LIGNE);

  // Sans cela, cocher une ligne l'ouvrirait et la marquerait lue.
  assert.equal((ligne.match(/stopPropagation\(\)/g) ?? []).length, 2);
});
