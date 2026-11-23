import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('un rendez-vous se modifie directement depuis son detail dans agenda', async () => {
  const agenda = await read('src/features/calendar/calendar-page.tsx');

  assert.match(agenda, /onEdit=\{handleEditAppointment\}/);
  assert.match(agenda, /<Pencil className="h-4 w-4" \/>\s*Modifier/);
  assert.match(agenda, /peutEditer=\{!estTechnicien\}/);
  assert.match(agenda, /setAppointmentEnEdition\(selectedAppt\)/);
  assert.match(agenda, /open=\{createOpen \|\| appointmentEnEdition !== null\}/);
  assert.match(agenda, /Modifier le rendez-vous/);
  assert.match(agenda, /Enregistrer les modifications/);
});

test('le formulaire reprend les informations existantes sans changer le statut', async () => {
  const agenda = await read('src/features/calendar/calendar-page.tsx');
  const debut = agenda.indexOf('function handleSubmit(values: AppointmentFormValues)');
  const fin = agenda.indexOf('function handleOpenChange', debut);
  const soumission = agenda.slice(debut, fin);

  assert.match(agenda, /date: format\(new Date\(appointment\.start_time\), 'yyyy-MM-dd'\)/);
  assert.match(agenda, /startTime: format\(new Date\(appointment\.start_time\), 'HH:mm'\)/);
  assert.match(agenda, /endTime: format\(new Date\(appointment\.end_time\), 'HH:mm'\)/);
  assert.match(soumission, /if \(!appointment\) donnees\.status = 'scheduled'/);
  assert.equal((soumission.match(/status = 'scheduled'/g) ?? []).length, 1);
  assert.match(soumission, /associationInchangee/);
  assert.match(soumission, /appointment\?\.case_id/);
  assert.match(soumission, /appointment\?\.lead_id/);
});

test('la modification exclut le rendez-vous courant des conflits et rafraichit la carte', async () => {
  const agenda = await read('src/features/calendar/calendar-page.tsx');

  assert.match(agenda, /ignorerId: appointment\?\.id/);
  assert.match(agenda, /r\.id !== appointment\?\.id/);
  assert.match(agenda, /updateMutation\.mutate\(\s*\{ id: appointmentEnEdition\.id, updates: data \}/);
  assert.match(agenda, /queryKey: \['interventions-carte'\]/);
  assert.match(agenda, /queryKey: \['interventions-non-localisees'\]/);
});
