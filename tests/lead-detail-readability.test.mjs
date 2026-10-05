import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const contenu = await readFile(
  new URL('../src/features/dossier/dossier-contenu.tsx', import.meta.url),
  'utf8',
);
const resume = await readFile(
  new URL('../src/features/dossier/lead-overview-summary.tsx', import.meta.url),
  'utf8',
);

test('la fiche ouvre sur un resume operationnel avant les formulaires', () => {
  assert.match(contenu, /<ProchaineAction lead=\{lead\} \/>[\s\S]*<LeadOverviewSummary[\s\S]*lead=\{lead\}[\s\S]*onUpdate=\{onUpdate\}/);
  assert.match(resume, /Résumé opérationnel/);
  assert.match(resume, /Fiche complétée/);
  assert.match(resume, /role="progressbar"/);
});

test('les informations essentielles sont organisees en quatre blocs lisibles', () => {
  assert.match(resume, /titre="Contact"/);
  assert.match(resume, /titre="Véhicule et vitrage"/);
  assert.match(resume, /Adresse d'intervention/);
  assert.match(resume, /titre="Assurance et offre"/);
  assert.match(resume, /Cadeau \/ offre/);
});

test('les informations essentielles sont modifiables directement dans le resume', () => {
  assert.doesNotMatch(resume, /Modifier ici|Terminer/);
  assert.match(resume, /<ContactEditor lead=\{lead\} onUpdate=\{onUpdate\}/);
  assert.match(resume, /<VehiculeEditor lead=\{lead\} onUpdate=\{onUpdate\}/);
  assert.match(resume, /<AdresseEditor lead=\{lead\} onUpdate=\{onUpdate\}/);
  assert.match(resume, /<AssuranceEditor lead=\{lead\} onUpdate=\{onUpdate\}/);
  assert.match(resume, /<LeadAddressFields/);
  assert.match(resume, /<ChampAssureur/);
  assert.match(resume, /Les champs sont toujours modifiables/);
  assert.match(resume, /xl:grid-cols-2/);
  assert.match(resume, /grid gap-3 sm:grid-cols-2/);
});

test('les modifications du resume restent dans le brouillon explicite', () => {
  assert.match(contenu, /onUpdate=\{onUpdate\}/);
  assert.match(resume, /Les changements restent en brouillon/);
  assert.doesNotMatch(resume, /updateLead|supabase/);
});

test('la fiche signale clairement les informations manquantes', () => {
  for (const libelle of [
    'Téléphone', "Adresse d'intervention", 'Immatriculation', 'Vitrage', 'Assurance', 'Cadeau / offre',
  ]) {
    assert.ok(resume.includes(libelle), `${libelle} doit participer au contrôle de complétude`);
  }
  assert.match(resume, /information\$\{manquants\.length > 1 \? 's' : ''\} à compléter/);
});

test('le formulaire inferieur en doublon est retire', () => {
  assert.doesNotMatch(contenu, /Modifier la fiche|EditionLead/);
  assert.doesNotMatch(contenu, /<LeadIdentity|<LeadQualification/);
  assert.doesNotMatch(contenu, /<Accordion/);
});

test('la note rapide et les derniers echanges restent directement accessibles', () => {
  assert.match(contenu, /<Bloc titre="Note rapide">/);
  assert.match(contenu, /<Bloc titre="Derniers échanges">/);
  assert.match(contenu, /Voir tout l’historique/);
});
