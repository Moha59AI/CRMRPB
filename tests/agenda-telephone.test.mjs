import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const AGENDA = 'src/features/calendar/calendar-page.tsx';

test('la semaine ne se fait plus défiler latéralement', async () => {
  const agenda = await read(AGENDA);

  // Sept colonnes demandaient 700 px : sur un téléphone de 375 px on voyait
  // lundi et un morceau de mardi, et il fallait pousser l'écran de côté pour
  // atteindre jeudi. Un planning qu'on ne voit pas d'un coup ne sert à rien.
  assert.doesNotMatch(agenda, /min-w-\[700px\]/);
  assert.doesNotMatch(agenda, /min-w-\[640px\]/);

  assert.match(agenda, /function SemaineEnListe/);
  assert.match(agenda, /if \(estMobile\) \{\s*\n\s*return \(\s*\n\s*<SemaineEnListe/);
});

test('la liste de la semaine garde les jours vides et les heures', async () => {
  const agenda = await read(AGENDA);

  // Savoir que mercredi est libre fait partie de ce qu'on vient chercher.
  assert.match(agenda, /\{duJour\.length === 0 \? 'libre' : duJour\.length\}/);
  assert.match(agenda, /formatTime\(appt\.start_time\)/);
  assert.match(agenda, /jusqu’à \{formatTime\(appt\.end_time\)\}/);
});

test('une ligne de la liste se touche au doigt', async () => {
  const agenda = await read(AGENDA);

  // 44 px est la cible tactile minimale retenue dans tout le CRM.
  assert.match(agenda, /function RendezVousEnLigne[\s\S]{0,900}min-h-\[44px\]/);
});

test('le mois reste un mois, en points', async () => {
  const agenda = await read(AGENDA);

  // À 48 px de large, « 09:30 I… » n'apprend rien ; la densité d'une journée
  // se lit d'un coup d'œil.
  assert.match(agenda, /const STATUS_POINT: Record<AppointmentStatus, string>/);
  assert.match(agenda, /estMobile \? 'min-h-\[58px\]' : 'min-h-\[112px\]'/);
  assert.match(agenda, /STATUS_POINT\[appt\.status\]/);
  // Les points ne disent rien à un lecteur d'écran : le compte est annoncé.
  assert.match(agenda, /<span className="sr-only">\s*\n\s*\{dayAppts\.length\} rendez-vous/);
});

test('les filtres ne poussent plus le planning hors de l’écran', async () => {
  const agenda = await read(AGENDA);

  // Trois listes déroulantes repoussaient le premier rendez-vous sous la
  // ligne de flottaison. Elles se replient derrière un bouton.
  assert.match(agenda, /const \[filtresOuverts, setFiltresOuverts\] = useState\(false\)/);
  assert.match(agenda, /className="col-span-2 rounded-full sm:hidden"/);
  // Une vue restreinte doit se signaler, sinon on croit à un planning vide.
  assert.match(agenda, /const filtresActifs = \[advisorFilter, techFilter, statusFilter\]/);
  assert.match(agenda, /\{filtresActifs > 0 && \(/);
  // Au-dessus de `sm`, le conteneur s'efface et les listes reprennent leur place.
  assert.match(agenda, /'col-span-2 grid grid-cols-1 gap-2 sm:contents'/);
});

test('la date tient sur une ligne entre les deux flèches', async () => {
  const agenda = await read(AGENDA);

  // « Mardi 6 octobre 2026 » passait à la ligne et poussait toute la barre.
  assert.match(agenda, /estMobile \? 'EEE d MMM' : 'EEEE d MMMM yyyy'/);
  assert.match(agenda, /estMobile \? 'MMM yyyy' : 'MMMM yyyy'/);
  assert.match(agenda, /\[view, currentDate, estMobile\]/);
});

test('la carte suit la hauteur réelle de l’écran', async () => {
  const agenda = await read(AGENDA);

  // Sur téléphone la barre d'adresse se rétracte : `100vh` laissait la carte
  // dépasser sous l'écran, `100dvh` suit.
  assert.match(agenda, /h-\[calc\(100dvh-20rem\)\]/);
  assert.doesNotMatch(agenda, /h-\[calc\(100vh/);
});

test('la vue par défaut sur téléphone reste la journée', async () => {
  const agenda = await read(AGENDA);

  // La semaine en liste est lisible, mais ce qu'on ouvre le matin c'est la
  // journée en cours.
  assert.match(agenda, /matchMedia\('\(max-width: 767px\)'\)\.matches[\s\S]{0,80}\? 'day'/);
});
