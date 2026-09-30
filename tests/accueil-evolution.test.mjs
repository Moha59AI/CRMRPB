import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test("l'accueil montre douze mois, pas seulement un total", async () => {
  const indicateurs = await read('src/features/today/indicateurs-accueil.ts');
  const page = await read('src/features/today/today-page.tsx');

  assert.match(indicateurs, /function evolutionMensuelle/);
  assert.match(indicateurs, /evolution: evolutionMensuelle\(/);
  assert.match(page, /<CarteEvolution/);
  assert.match(page, /<AreaChart data=\{evolution\}/);
});

test('le mouvement se coupe quand le systeme le demande', async () => {
  const animation = await read('src/lib/animation.ts');
  const page = await read('src/features/today/today-page.tsx');

  assert.match(animation, /\(prefers-reduced-motion: reduce\)/);
  // Refuser l'animation ne doit jamais laisser un zero fige.
  assert.match(animation, /if \(reduit \|\| !Number\.isFinite\(cible\)\) \{\s*setValeur\(cible\);/);
  assert.match(page, /isAnimationActive=\{!reduit\}/);
});

test('les deux courbes ne peuvent pas etre de la meme couleur', async () => {
  const page = await read('src/features/today/today-page.tsx');
  const css = await read('src/index.css');

  // `--done` vaut exactement `--primary` dans le theme clair : les deux
  // series auraient ete vertes. La rampe graphique existe pour cela.
  assert.match(page, /stroke="hsl\(var\(--chart-1\)\)"/);
  assert.match(page, /stroke="hsl\(var\(--chart-2\)\)"/);
  assert.doesNotMatch(page, /stroke="hsl\(var\(--done\)\)"/);

  // Et elles sont definies dans les deux themes.
  assert.ok((css.match(/--chart-1:/g) ?? []).length >= 2);
  assert.ok((css.match(/--chart-2:/g) ?? []).length >= 2);
});

test('douze mois tiennent sur 375 px', async () => {
  const page = await read('src/features/today/today-page.tsx');

  // Sans cela, « avr. mai juin juil. » se chevauchaient sur telephone.
  assert.match(page, /interval="preserveStartEnd"/);
  assert.match(page, /minTickGap=\{22\}/);
});

test("l'apercu de developpement ne part pas en production", async () => {
  const routes = await read('src/app/app-routes.tsx');

  const garde = routes.indexOf('import.meta.env.DEV');
  const route = routes.indexOf('path="/apercu-accueil"');
  assert.ok(garde > 0 && garde < route, 'la route doit rester sous la garde DEV');
});
