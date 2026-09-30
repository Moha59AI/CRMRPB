import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('une panne ne se confond plus avec une journee vide', async () => {
  const agenda = await read('src/features/calendar/calendar-page.tsx');

  // Sans branche d'erreur, `isLoading` faux et zero rendez-vous menaient a
  // « Aucun rendez-vous » : un technicien rentrait chez lui en croyant
  // n'avoir rien.
  const erreur = agenda.indexOf('appointmentsQuery.isError');
  const vide = agenda.indexOf('Aucun rendez-vous');
  assert.ok(erreur > 0, "l'agenda doit traiter l'echec de chargement");
  assert.ok(erreur < vide, "l'erreur doit etre testee avant l'etat vide");
});

test('la file de relances distingue « rien a faire » de « rien charge »', async () => {
  const relances = await read('src/features/relances/relances-page.tsx');

  const erreur = relances.indexOf('isError ? (');
  const vide = relances.indexOf('<EtatVide filtre={filtre}');
  assert.ok(erreur > 0 && erreur < vide);
  assert.match(relances, /onReessayer=\{\(\) => void refetch\(\)\}/);
});

test("l'etat d'erreur est partage, et annonce comme tel", async () => {
  const composant = await read('src/components/EtatErreur.tsx');

  assert.match(composant, /role="alert"/);
  assert.match(composant, /function messageLisible/);
  // Un bouton absent vaut mieux qu'un bouton qui ne reessaie rien.
  assert.match(composant, /\{onReessayer && \(/);
});

test('le contenu des pages est aligne sur leur titre', async () => {
  // `PageHeader` pose la gouttiere fluide ; un contenu en padding fixe
  // decalait le titre et le tableau de quelques pixels, differemment selon
  // la page et la largeur de l'ecran.
  const entete = await read('src/components/PageHeader.tsx');
  assert.match(entete, /className="gutter-x/);

  for (const page of [
    'src/features/billing/billing-page.tsx',
    'src/features/finance/financial-dashboard-page.tsx',
    'src/features/marketing/marketing-page.tsx',
    'src/features/cases/cases-page.tsx',
  ]) {
    const source = await read(page);
    assert.match(source, /className="gutter-x/, page);
    assert.doesNotMatch(source, /className="[^"]*\bp-4 sm:p-6"/, page);
  }
});

test('les boutons a icone seule portent un nom', async () => {
  for (const page of [
    'src/features/calendar/calendar-page.tsx',
    'src/features/webhooks/webhooks-page.tsx',
    'src/features/workflows/workflows-page.tsx',
  ]) {
    const source = await read(page);
    const lignes = source.split('\n');
    lignes.forEach((ligne, index) => {
      if (!ligne.includes('size="icon"')) return;
      const bloc = lignes.slice(Math.max(0, index - 3), index + 5).join('\n');
      assert.ok(
        /aria-label|sr-only|title=/.test(bloc),
        `${page}:${index + 1} bouton sans nom accessible`,
      );
    });
  }
});
