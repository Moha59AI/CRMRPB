import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const FUNCTION = 'supabase/functions/intervention-weather/index.ts';
const SERVICE = 'src/services/intervention-weather-service.ts';
const CARD = 'src/features/interventions/intervention-carte-liste.tsx';

test('la météo utilise une API publique autorisée pour un usage commercial', async () => {
  const source = await read(FUNCTION);

  assert.match(source, /api\.met\.no\/weatherapi\/locationforecast\/2\.0\/compact/);
  assert.match(source, /User-Agent.*RelaisPareBriseCRM/);
  assert.match(source, /MET Norway/);
  assert.doesNotMatch(source, /api\.openweathermap|Deno\.env\.get\([^)]*weather/i);
});

test('la ville est résolue sans envoyer le nom ni l’adresse du client', async () => {
  const source = await read(FUNCTION);
  const service = await read(SERVICE);

  assert.match(source, /geo\.api\.gouv\.fr\/communes/);
  assert.match(source, /citycode/);
  assert.match(source, /codePostal/);
  assert.match(source, /ville/);
  assert.doesNotMatch(service, /\b(?:client|adresse|telephone|phone|name)\s*:/i);
  assert.match(service, /Math\.round\(value \* 100\) \/ 100/);
});

test('les appels sont mis en cache et limités à la fenêtre des prévisions', async () => {
  const component = await read('src/features/interventions/intervention-weather.tsx');

  assert.match(component, /NEUF_JOURS/);
  assert.match(component, /staleTime: 30 \* 60 \* 1000/);
  assert.match(component, /gcTime: 12 \* 60 \* 60 \* 1000/);
  assert.match(component, /enabled: aUneLocalisation && !estPassee && !estTropLointaine/);
});

test('la météo apparaît sur les interventions terrain et dans le détail agenda', async () => {
  const card = await read(CARD);
  const agenda = await read('src/features/calendar/calendar-page.tsx');

  assert.match(card, /<InterventionWeather/);
  assert.match(card, /startTime=\{i\.debut\}/);
  assert.match(card, /citycode=\{i\.citycode\}/);
  assert.match(agenda, /appointment\.type === 'intervention'/);
  assert.match(agenda, /<InterventionWeather/);
  assert.match(agenda, /Données météo|intervention-weather/);
});

test('la fonction météo reste réservée aux utilisateurs connectés', async () => {
  const config = await read('supabase/config.toml');
  assert.match(config, /\[functions\.intervention-weather\]\s*verify_jwt = true/);
});
