import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('les actions tactiles partagees atteignent 44 px sur telephone', async () => {
  const buttons = await read('src/components/ui/button.tsx');
  const dialog = await read('src/components/ui/dialog.tsx');
  const sheet = await read('src/components/ui/sheet.tsx');

  assert.match(buttons, /sm: 'h-11/);
  assert.match(buttons, /icon: 'h-11 w-11/);
  assert.match(dialog, /h-11 w-11/);
  assert.match(sheet, /h-11 w-11/);
});

test('les dossiers utilisent une vraie liste mobile sans doubler le rendu', async () => {
  const page = await read('src/features/cases/cases-page.tsx');

  assert.match(page, /const estMobile = useEstMobile\(\)/);
  assert.match(page, /visibleCases\.length === 0[\s\S]*: estMobile \?/);
  assert.match(page, /<CaseMobileRow/);
  assert.match(page, /overflow-x-auto[\s\S]*<Table/);
});

test('agenda et relances restent exploitables sur un ecran etroit', async () => {
  const agenda = await read('src/features/calendar/calendar-page.tsx');
  const relances = await read('src/features/relances/relances-page.tsx');

  assert.match(agenda, /matchMedia\('\(max-width: 767px\)'\)\.matches[\s\S]*\? 'day'/);
  assert.match(agenda, /grid w-full grid-cols-2/);
  // La semaine se faisait defiler lateralement sur 700 px : elle est
  // desormais une liste sur telephone, verifiee dans agenda-telephone.test.mjs.
  assert.doesNotMatch(agenda, /min-w-\[700px\]/);
  assert.match(relances, /flex-nowrap[\s\S]*overflow-x-auto/);
  assert.match(relances, /grid grid-cols-2 items-center/);
});

test('les campagnes passent en cartes et les tableaux gardent une largeur lisible', async () => {
  const [campaigns, table, css] = await Promise.all([
    read('src/features/campaigns/campaigns-page.tsx'),
    read('src/components/ui/table.tsx'),
    read('src/index.css'),
  ]);

  assert.match(campaigns, /<ResponsiveDataView/);
  assert.match(campaigns, /<CampaignMobileCard/);
  assert.match(campaigns, /grid-cols-4 gap-1/);
  assert.match(table, /crm-table-scroll/);
  assert.match(table, /min-w-max[\s\S]*md:min-w-0/);
  assert.match(css, /--gutter-x: 0\.75rem/);
  assert.match(css, /\.crm-module-actions/);
});

test('la coque mobile garde le titre visible sur les petits iPhone', async () => {
  const layout = await read('src/layouts/app-layout.tsx');

  assert.match(layout, /h-14 min-w-0/);
  assert.match(layout, /min-\[360px\]:flex/);
  assert.match(layout, /min-\[390px\]:flex/);
  assert.match(layout, /w-\[min\(20rem,calc\(100vw-0\.75rem\)\)\]/);
});
