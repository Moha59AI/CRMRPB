import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('le parcours commercial expose exactement les sept etapes metier', async () => {
  const shared = await read('src/features/leads/lead-shared.ts');

  const labels = [
    'Nouveau lead',
    'NRP',
    'Qualifié',
    'Attente documents',
    'RDV pris',
    'Perdu',
    'Clôturé',
  ];
  for (const label of labels) assert.match(shared, new RegExp(`label: '${label}'`));
  assert.equal((shared.match(/key: '(nouveau|nrp|qualifie|documents|rdv|perdu|cloture)'/g) ?? []).length, 7);
});

test('les statuts techniques restent regroupes sans casser les cadences', async () => {
  const shared = await read('src/features/leads/lead-shared.ts');
  const service = await read('src/services/leads-service.ts');

  assert.match(shared, /statuses: \['new', 'to_call', 'calling'\]/);
  assert.match(shared, /statuses: \['documents_requested', 'documents_received'\]/);
  assert.match(service, /query\.in\('status', \[\.\.\.params\.statuses\]\)/);
});

test('perdu et cloture demandent confirmation et le succes attend la base', async () => {
  const pipeline = await read('src/features/leads/lead-pipeline.tsx');
  const page = await read('src/features/leads/leads-page.tsx');

  assert.match(pipeline, /if \(etape\.terminal\)/);
  assert.match(pipeline, /Marquer ce lead comme perdu \?/);
  assert.match(pipeline, /Clôturer ce dossier \?/);
  assert.match(page, /onSuccess: \(_, variables\) =>/);
  assert.match(page, /toast\.success\(`Étape changée/);
  assert.doesNotMatch(page, /updateStatusMutation\.mutate\([^;]+;\s*toast\.success/s);
});

test('la fiche ouvre un vrai rendez-vous pre-rempli et termine le parcours', async () => {
  const dossier = await read('src/features/dossier/dossier-modal.tsx');
  const agenda = await read('src/features/calendar/calendar-page.tsx');

  assert.match(dossier, /createForLeadId: lead\.id/);
  assert.match(agenda, /initialLeadId/);
  assert.match(agenda, /form\.setValue\('leadId', initialLeadId\)/);
  assert.match(agenda, /status: 'appointment_scheduled'/);
  assert.match(agenda, /selectedAppt\.type === 'intervention'/);
  assert.match(agenda, /status: 'converted'/);
});

test('les resultats d appel utilisent le meme vocabulaire', async () => {
  const resultats = await read('src/features/relances/resultat-appel.ts');
  const dialogue = await read('src/features/relances/components/dialogue-resultat-appel.tsx');
  const sms = await read('src/features/relances/preparer-sms-nrp.ts');

  assert.match(resultats, /label: 'Qualifié'/);
  assert.match(resultats, /label: 'Attente documents'/);
  assert.match(resultats, /label: 'RDV pris'/);
  assert.match(resultats, /label: 'Clôturé'/);
  assert.doesNotMatch(resultats, /label: 'Intéressé'/);
  assert.doesNotMatch(resultats, /label: 'Documents demandés'/);
  assert.match(dialogue, /Enregistrer sans SMS/);
  assert.match(dialogue, /Enregistrer \+ SMS/);
  assert.match(dialogue, /envoyerSmsNrp: choisi\.cle === 'sans_reponse'/);
  assert.match(sms, /fetchLeadById/);
  assert.match(sms, /messageNrp\(lead/);
  assert.match(sms, /journaliserAction\(relance, 'sms_outbound', message\)/);
});

test('le journal SMS des relances renseigne le workspace requis par RLS', async () => {
  const relancesService = await read('src/services/relances-service.ts');

  assert.match(relancesService, /import \{ createCommunication, createNote \} from '@\/services\/activity-service'/);
  assert.match(relancesService, /const \{ error \} = await createCommunication\(\{/);
  assert.doesNotMatch(
    relancesService,
    /supabase\.from\('communications'\)\.insert\(\{/,
    'la journalisation ne doit pas contourner le service qui ajoute workspace_id',
  );
});
