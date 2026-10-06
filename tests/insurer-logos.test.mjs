import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const composant = readFileSync('src/features/insurers/insurer-logo.tsx', 'utf8');

test('les sept logos assureurs fournis sont conserves dans le CRM', () => {
  for (const fichier of [
    'axa.svg',
    'maif.svg',
    'direct-assurance.jpg',
    'generali.jpg',
    'gmf.png',
    'maaf.png',
    'macif.png',
  ]) {
    assert.equal(existsSync(`public/insurers/${fichier}`), true, `${fichier} manque`);
    assert.match(composant, new RegExp(`/insurers/${fichier.replace('.', '\\.')}['\"]`));
  }
});

test('Direct Assurance retrouve aussi le nom canonique Avanssur', () => {
  assert.match(composant, /'direct assurance', 'avanssur'/);
});

test('un assureur sans logo conserve un repere visuel neutre', () => {
  assert.match(composant, /<ShieldCheck/);
});
