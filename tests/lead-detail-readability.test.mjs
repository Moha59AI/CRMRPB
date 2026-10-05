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

test('les informations essentielles sont lisibles sans ouvrir le mode edition', () => {
  assert.match(resume, /titre="Contact"/);
  assert.match(resume, /titre="Véhicule et vitrage"/);
  assert.match(resume, /Adresse d'intervention/);
  assert.match(resume, /titre="Assurance et offre"/);
  assert.match(resume, /Cadeau \/ offre/);
});

test('les informations essentielles sont modifiables directement dans le resume', () => {
  assert.match(resume, /Modifier ici/);
  assert.match(resume, /<ContactEditor lead=\{lead\} onUpdate=\{onUpdate\}/);
  assert.match(resume, /<VehiculeEditor lead=\{lead\} onUpdate=\{onUpdate\}/);
  assert.match(resume, /<AdresseEditor lead=\{lead\} onUpdate=\{onUpdate\}/);
  assert.match(resume, /<AssuranceEditor lead=\{lead\} onUpdate=\{onUpdate\}/);
  assert.match(resume, /<LeadAddressFields/);
  assert.match(resume, /<ChampAssureur/);
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

test('les formulaires restent disponibles dans deux sections explicites', () => {
  assert.match(contenu, /<Accordion type="multiple"/);
  assert.match(contenu, /value="client"[\s\S]*<LeadIdentity/);
  assert.match(contenu, /value="intervention"[\s\S]*<LeadQualification/);
  assert.match(contenu, /Les changements restent en brouillon jusqu’à l’enregistrement/);
});

test('la note rapide et les derniers echanges restent directement accessibles', () => {
  assert.match(contenu, /<Bloc titre="Note rapide">/);
  assert.match(contenu, /<Bloc titre="Derniers échanges">/);
  assert.match(contenu, /Voir tout l’historique/);
});
