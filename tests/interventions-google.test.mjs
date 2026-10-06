import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const SYNC = 'supabase/functions/google-calendar-sync/index.ts';
const MIGRATION = 'supabase/migrations/20261006190000_interventions_importees_de_google.sql';

/**
 * La règle de la fonction, rejouée telle quelle.
 *
 * Le fichier est du TypeScript Deno et importe `../_shared` : il ne s'importe
 * pas ici. On en extrait la règle pour la vérifier sur de vrais titres, plutôt
 * que de se contenter de constater qu'elle est écrite quelque part.
 */
async function reglerDepuisLaSource() {
  const source = await read(SYNC);
  const motif = source.match(/const PLAQUE_ENTRE_PARENTHESES = (\/.+\/);/);
  assert.ok(motif, 'motif de plaque introuvable dans la fonction');

  const corps = source.match(
    /function typeDepuisTitre[\s\S]*?return PLAQUE_ENTRE_PARENTHESES\.test\(t\) \|\| (\/.+?\/i)\.test\(t\)/,
  );
  assert.ok(corps, 'règle de type introuvable dans la fonction');

  const plaque = new RegExp(motif[1].slice(1, -1));
  const intervention = new RegExp(corps[1].slice(1, -2), 'i');

  return (titre) => {
    const t = titre.trim();
    return plaque.test(t) || intervention.test(t) ? 'intervention' : 'other';
  };
}

test('un rendez-vous repris de Google n’est plus « autre » par défaut', async () => {
  const sync = await read(SYNC);

  // L'import écrivait `type: 'other'` en dur : c'était dire qu'aucun
  // rendez-vous posé dans Google n'était une intervention. La carte, qui ne
  // charge que celles-là, restait vide une semaine entière.
  assert.match(sync, /type: typeDepuisTitre\(importe\.title\)/);
  assert.doesNotMatch(sync, /type: 'other',\n\s+status: 'scheduled'/);
});

test('la plaque entre parenthèses désigne une intervention', async () => {
  const typeDe = await reglerDepuisLaSource();

  // La convention de l'atelier, déjà celle dont `rattacher_rendez_vous_clients`
  // se sert pour retrouver le client.
  assert.equal(typeDe('Intervention - ABC TRAVAUX (AB-123-CD)'), 'intervention');
  assert.equal(typeDe('Pare-brise Clio (EF 456 GH)'), 'intervention');
  assert.equal(typeDe('Intervention'), 'intervention');
  assert.equal(typeDe('  intervention à domicile'), 'intervention');
});

test('un rappel n’est pas une intervention', async () => {
  const typeDe = await reglerDepuisLaSource();

  // Il n'a pas de lieu où se rendre : le placer sur la carte serait faux.
  assert.equal(typeDe('Rappel - Aurore Bastin'), 'other');
  assert.equal(typeDe('Réunion équipe'), 'other');
  assert.equal(typeDe('Congés'), 'other');
  // Deux caractères entre parenthèses ne sont pas une plaque.
  assert.equal(typeDe('Point hebdo (RH)'), 'other');
});

test('la reprise en base applique la même règle que l’import', async () => {
  const migration = await read(MIGRATION);
  const sync = await read(SYNC);

  // Deux règles divergentes feraient réapparaître le problème au premier
  // rendez-vous posé après la reprise.
  assert.match(migration, /\[A-Za-z0-9 -\]\{5,12\}/);
  assert.match(sync, /\[A-Za-z0-9 -\]\{5,12\}/);
  assert.match(migration, /intervention\\M/);
  // Elle ne touche que ce qui était mal typé.
  assert.match(migration, /where type = 'other'/);
});

test('la reprise ne pose aucune coordonnée', async () => {
  const migration = await read(MIGRATION);

  // Géocoder depuis une migration demanderait un appel réseau par ligne. Ce
  // travail a son écran : le bouton « Localiser » de la carte.
  assert.doesNotMatch(migration, /set .*latitude/i);
  assert.match(migration, /Localiser/);
});

test('carte et reprise des coordonnées filtrent sur le même type', async () => {
  const carte = await read('src/services/interventions-carte-service.ts');
  const lot = await read('src/services/geocodage-lot.ts');

  // C'est ce double filtre qui rendait le symptôme total : les rendez-vous
  // n'apparaissaient pas, et rien ne pouvait leur donner un point non plus.
  assert.match(carte, /\.eq\('type', 'intervention'\)/);
  assert.match(lot, /\.eq\('type', 'intervention'\)/);
});
