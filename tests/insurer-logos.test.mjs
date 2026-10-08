import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';

const dossierLogos = 'public/insurers';
const composant = readFileSync('src/features/insurers/insurer-logo.tsx', 'utf8');

test('les 235 logos assureurs normalises sont integres au CRM', () => {
  const fichiers = readdirSync(dossierLogos)
    .filter((fichier) => fichier.endsWith('.png'));

  assert.equal(fichiers.length, 235);
  for (const fichier of fichiers) {
    assert.match(fichier, /^[a-z0-9-]+\.png$/);
    assert.ok(statSync(`${dossierLogos}/${fichier}`).size > 0, `${fichier} est vide`);
  }
});

test('les principales compagnies automobiles ont bien leur logo', () => {
  for (const fichier of [
    'allianz.png',
    'axa.png',
    'direct-assurance.png',
    'generali.png',
    'gmf.png',
    'groupama.png',
    'maaf.png',
    'macif.png',
    'maif.png',
    'matmut.png',
    'mma.png',
  ]) {
    assert.equal(existsSync(`${dossierLogos}/${fichier}`), true, `${fichier} manque`);
  }
});

test('les noms metier composés retrouvent la bonne marque', () => {
  assert.match(composant, /'avanssur', 'direct assurance', 'directassurance'.*'direct-assurance'/);
  assert.match(composant, /'constatel', 'acm', 'credit mutuel'.*'assurances-du-credit-mutuel'/);
  assert.match(composant, /'bpce'.*'bpce-assurances'/);
  assert.match(composant, /'pacifica'.*'credit-agricole-assurances'/);
  assert.match(composant, /'sma btp'.*'smabtp'/);
});

test('un fichier absent conserve un repere visuel neutre', () => {
  assert.match(composant, /onError=\{\(\) => setSrcInvalide\(src\)\}/);
  assert.match(composant, /<ShieldCheck/);
});

test('les images sont chargees a la demande', () => {
  assert.match(composant, /loading="lazy"/);
  assert.match(composant, /decoding="async"/);
});
