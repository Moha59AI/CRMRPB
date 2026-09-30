import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('le score, jamais calcule, ne s affiche plus nulle part', async () => {
  const page = await read('src/features/leads/leads-page.tsx');
  const fiche = await read('src/features/dossier/dossier-contenu.tsx');

  // `leads.score` vaut 0 par defaut et rien ne l'ecrit : ni edge function,
  // ni service, ni trigger. Il occupait une colonne, un badge par carte et
  // une ligne par fiche.
  assert.doesNotMatch(page, /scoreColor/);
  assert.doesNotMatch(page, /lead\.score/);
  assert.doesNotMatch(fiche, /\['Score', String\(lead\.score\)\]/);
});

test("l'attente prend sa place, dans les trois vues et sur la fiche", async () => {
  const page = await read('src/features/leads/leads-page.tsx');
  const fiche = await read('src/features/dossier/dossier-contenu.tsx');

  assert.match(page, />Attente<\/TableHead>/);
  // Tableau, carte kanban, liste compacte.
  assert.equal((page.match(/<BadgeAttente lead=\{lead\}/g) ?? []).length, 3);
  assert.match(fiche, /\['En attente depuis', attenteDuLead\(lead\)\.libelle\]/);
});

test('un dossier pris en charge ne vire pas au rouge en vieillissant', async () => {
  const anciennete = await read('src/features/leads/anciennete.ts');

  // Un rendez-vous pris il y a cinq jours n'appelle aucune action : le
  // colorer noierait les leads qu'il faut vraiment rappeler.
  assert.match(anciennete, /const STATUTS_AU_REPOS/);
  assert.match(anciennete, /'appointment_scheduled', 'converted', 'lost', 'documents_received'/);
  assert.match(anciennete, /if \(STATUTS_AU_REPOS\.includes\(lead\.status\)\) return \{ heures, niveau: 'traite'/);
});

test("les seuils suivent l'echelle d'urgence deja en place", async () => {
  const anciennete = await read('src/features/leads/anciennete.ts');
  const css = await read('src/index.css');

  assert.match(anciennete, /if \(heures >= 48\) return \{ heures, niveau: 'urgent'/);
  assert.match(anciennete, /if \(heures >= 4\) return \{ heures, niveau: 'a_relancer'/);
  // Les teintes existent, en clair comme en sombre.
  for (const teinte of ['--urgent', '--due', '--upcoming']) {
    assert.ok((css.match(new RegExp(`${teinte}:`, 'g')) ?? []).length >= 2, teinte);
  }
});
