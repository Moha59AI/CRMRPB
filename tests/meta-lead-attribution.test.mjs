import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('le worker Meta recupere et conserve toute la provenance publicitaire', async () => {
  const worker = await read('supabase/functions/meta-process-queue/index.ts');

  for (const field of [
    'campaign_id', 'campaign_name',
    'adset_id', 'adset_name',
    'ad_id', 'ad_name',
    'form_id', 'form_name',
  ]) {
    assert.match(worker, new RegExp(`\\b${field}\\b`));
  }

  assert.match(worker, /meta_attribution: metaAttribution/);
  assert.match(worker, /attributionUpdates\.campaign_name = campaignName/);
  assert.match(worker, /throw new Error\(`Attribution Meta du lead:/);
});

test('la fiche affiche les noms et identifiants Meta dans le bloc dossier', async () => {
  const dossier = await read('src/features/dossier/dossier-contenu.tsx');
  const attribution = await read('src/features/leads/meta-attribution.ts');

  assert.match(dossier, /\['Campagne Meta', attributionMeta\.campagne\]/);
  assert.match(dossier, /\['Ensemble de publicités', attributionMeta\.ensemble\]/);
  assert.match(dossier, /\['Publicité', attributionMeta\.publicite\]/);
  assert.match(dossier, /\['Formulaire', attributionMeta\.formulaire\]/);
  assert.match(dossier, /\['Lead Meta', attributionMeta\.lead\]/);
  assert.match(attribution, /`\$\{nom\} · ID \$\{id\}`/);
  assert.match(attribution, /raw\.campaign_name/);
  assert.match(attribution, /lead\.meta_ad_id/);
});
