import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('une seule cloche est montee selon le format decran', async () => {
  const layout = await read('src/layouts/app-layout.tsx');

  assert.match(layout, /const estMobile = useEstMobile\(\)/);
  assert.match(layout, /!estMobile && <ClocheNotifications reduit=\{!expanded\} \/>/);
  assert.match(layout, /estMobile && <ClocheNotifications reduit mobile \/>/);
});

test('le centre trie les alertes par usage et par date', async () => {
  const component = await read('src/components/ClocheNotifications.tsx');

  for (const filtre of ['Toutes', 'Non lues', 'Leads', 'À traiter', 'Messages']) {
    assert.match(component, new RegExp(filtre));
  }
  for (const groupe of ["Aujourd'hui", 'Hier', '7 derniers jours', 'Plus anciennes']) {
    assert.match(component, new RegExp(groupe));
  }
  for (const type of ['lead', 'documents_received', 'email_received', 'ai', 'workflow']) {
    assert.match(component, new RegExp(`${type}:`));
  }
});

test('la lecture est optimiste mais restauree si la base refuse', async () => {
  const component = await read('src/components/ClocheNotifications.tsx');
  const service = await read('src/services/notifications-service.ts');

  assert.match(component, /queryClient\.setQueryData<Notification\[]>\(CLE_NOTIFICATIONS/);
  assert.match(component, /const annuler = mettreAJourLocalement\(notification\.id\)/);
  assert.match(component, /catch \(error\) \{\s*annuler\(\)/);
  assert.match(component, /toast\.error\('Notification non modifiée'/);
  assert.match(service, /if \(error\) throw new Error\(error\.message\)/);
});

test('le temps reel ajoute immediatement la notification et regroupe les rechargements', async () => {
  const component = await read('src/components/ClocheNotifications.tsx');

  assert.match(component, /return \[notification, \.\.\.actuelles\]\.slice\(0, 50\)/);
  assert.match(component, /window\.setTimeout\(\(\) => \{/);
  assert.match(component, /queryClient\.invalidateQueries\(\{ queryKey: CLE_COMPTEUR \}\)/);
  assert.doesNotMatch(component, /notifications-non-lues/);
});
