import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function chargerMessageNrp() {
  let source = await readFile(
    new URL('../src/features/relances/message-nrp.ts', import.meta.url),
    'utf8',
  );

  source = source
    .replace(
      "import { LIBELLE_VITRAGE } from '@/features/leads/lead-shared';",
      "const LIBELLE_VITRAGE = { lunette_arriere: 'Lunette arrière', vitre_laterale: 'Vitre latérale', toit_panoramique: 'Toit panoramique' };",
    )
    .replace("import type { Lead } from '@/types';", '');

  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
  return (await import(moduleUrl)).messageNrp;
}

test('le SMS NRP explique le motif et l’offre sans parler de franchise ni assurance', async () => {
  const messageNrp = await chargerMessageNrp();
  const message = messageNrp(
    {
      first_name: 'Nadia',
      glass_type: 'pare_brise',
      offer: 'iPhone 14',
      franchise_amount: 0,
      insurance: 'AXA',
    },
    { telephone: '03 20 00 00 00' },
  );

  assert.match(message, /^Bonjour Nadia, nous avons tenté de vous joindre/);
  assert.match(message, /Offre « iPhone 14 » bien enregistrée\./);
  assert.match(message, /répondez OUI ou appelez le 03 20 00 00 00/);
  assert.match(message, /\n\nRelais Pare-Brise$/);
  assert.doesNotMatch(message, /franchise|assurance|AXA|0 €|réservée à votre nom|sans avance de frais/i);
  assert.ok(message.length <= 250, `Le SMS est trop long (${message.length} caracteres)`);
});

test('le SMS reste honnete quand aucune offre ni franchise ne sont connues', async () => {
  const messageNrp = await chargerMessageNrp();
  const message = messageNrp({
    first_name: null,
    glass_type: 'vitre_laterale',
    offer: null,
    franchise_amount: null,
    insurance: null,
  });

  assert.match(message, /^Bonjour, nous avons tenté de vous joindre pour votre demande de vitre latérale\./);
  assert.match(message, /répondez simplement OUI à ce SMS/);
  assert.doesNotMatch(message, /offre|franchise|assurance|garanties/);
});

test('l’assureur n’est jamais mentionne dans le SMS', async () => {
  const messageNrp = await chargerMessageNrp();
  const message = messageNrp({
    first_name: 'Samir',
    glass_type: 'lunette_arriere',
    offer: null,
    franchise_amount: 120,
    insurance: 'MAIF',
  });

  assert.doesNotMatch(message, /MAIF|assurance|garantie|prise en charge|franchise|0 €/i);
});
