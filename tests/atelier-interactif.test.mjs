import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const {
  EMPRISE, ZONES, compterParZone, couleurCarrosserie, placerVehicules, zoneDe,
} = await import('../src/features/atelier/zones-atelier.ts');

const PAGE = 'src/features/atelier/atelier-page.tsx';
const SCENE = 'src/features/atelier/scene-atelier-realiste.tsx';
const PANNEAU = 'src/features/atelier/panneau-dossier.tsx';

const MIDI = new Date('2026-10-12T12:00:00');
const rdv = (statut, heureDebut) => ({
  id: `${statut}-${heureDebut}`,
  statut,
  debut: `2026-10-12T${String(heureDebut).padStart(2, '0')}:00:00`,
  fin: `2026-10-12T${String(heureDebut + 1).padStart(2, '0')}:00:00`,
});

// ----------------------------------------------------------------- les zones

test('un véhicule va au poste que dit son statut', () => {
  assert.equal(zoneDe(rdv('scheduled', 15), MIDI), 'a_venir');
  assert.equal(zoneDe(rdv('confirmed', 15), MIDI), 'a_venir');
  assert.equal(zoneDe(rdv('scheduled', 10), MIDI), 'en_cours');
  assert.equal(zoneDe(rdv('completed', 10), MIDI), 'termine');
  assert.equal(zoneDe(rdv('cancelled', 10), MIDI), 'annule');
  assert.equal(zoneDe(rdv('no_show', 10), MIDI), 'annule');
});

test('clôturer en avance sort le véhicule tout de suite', () => {
  // Un technicien qui termine à 11 h ne doit pas voir sa voiture rester
  // « en intervention » jusqu'à l'heure de fin théorique.
  assert.equal(zoneDe(rdv('completed', 15), MIDI), 'termine');
});

test('une heure de fin dépassée ne clôture pas toute seule', () => {
  // L'information utile est « pas encore clôturé », pas une supposition.
  const depasse = { id: 'x', statut: 'confirmed', debut: '2026-10-12T08:00:00', fin: '2026-10-12T09:00:00' };
  assert.equal(zoneDe(depasse, MIDI), 'en_cours');
});

test('les véhicules ne se superposent pas dans un poste', () => {
  const journee = [
    rdv('scheduled', 14), rdv('scheduled', 15), rdv('scheduled', 16),
    rdv('scheduled', 17), rdv('scheduled', 18),
  ];
  const places = placerVehicules(journee, MIDI);

  assert.equal(places.length, 5);
  assert.ok(places.every((p) => p.zone === 'a_venir'));
  const positions = new Set(places.map((p) => p.position.join(':')));
  assert.equal(positions.size, 5, 'deux véhicules au même endroit');
});

test('une place ne bouge pas sans raison', () => {
  // L'animation ne veut dire quelque chose que si un déplacement signale un
  // vrai changement. Une place qui saute à chaque rafraîchissement
  // l'annulerait.
  const journee = [rdv('scheduled', 14), rdv('completed', 9), rdv('scheduled', 16)];
  const a = placerVehicules(journee, MIDI);
  const b = placerVehicules(journee, MIDI);
  assert.deepEqual(a.map((p) => p.position), b.map((p) => p.position));
});

test('un véhicule annulé est rangé sur le côté', () => {
  const [place] = placerVehicules([rdv('cancelled', 9)], MIDI);
  assert.equal(place.zone, 'annule');
  assert.notEqual(place.rotation, 0);
});

test('les compteurs disent ce que montre l’atelier', () => {
  const journee = [
    rdv('scheduled', 15), rdv('scheduled', 16),
    rdv('confirmed', 10), rdv('completed', 9), rdv('cancelled', 8),
  ];
  const compte = compterParZone(placerVehicules(journee, MIDI));
  assert.deepEqual(compte, { a_venir: 2, en_cours: 1, termine: 1, annule: 1 });
});

test('un véhicule garde sa couleur d’un chargement à l’autre', () => {
  // On doit pouvoir retrouver la sienne après un rafraîchissement.
  assert.equal(couleurCarrosserie('abc-123'), couleurCarrosserie('abc-123'));
  // Et le vert reste au marquage au sol : il veut dire « en intervention ».
  const vert = ZONES.find((z) => z.cle === 'en_cours').couleur;
  for (const id of ['a', 'bb', 'ccc', 'dddd', 'eeeee', 'ffffff']) {
    assert.notEqual(couleurCarrosserie(id), vert);
  }
});

test('l’emprise se déduit des zones, elle n’est pas recopiée', () => {
  // Déplacer un poste doit recadrer la caméra sans qu'on y pense.
  assert.ok(EMPRISE.largeur > 0 && EMPRISE.profondeur > 0);
  const xs = ZONES.flatMap((z) => [z.centre[0] - z.taille[0] / 2, z.centre[0] + z.taille[0] / 2]);
  assert.equal(EMPRISE.largeur, Math.max(...xs) - Math.min(...xs));
});

// ---------------------------------------------------- le coût du décor réaliste

test('ouvrir l’atelier en vue liste ne télécharge pas le décor réaliste', async () => {
  const page = await read(PAGE);

  // Le décor haute définition ne sert que dans la vue Atelier.
  assert.match(page, /const SceneAtelier = lazy\(\(\) =>/);
  assert.match(page, /import\('\.\/scene-atelier-realiste'\)/);
  // La page elle-même ne doit rien importer de l'ancien moteur.
  assert.doesNotMatch(page, /from '@react-three\//);
  assert.doesNotMatch(page, /from 'three'/);
});

test('la vue liste démonte la scène plutôt que de la cacher', async () => {
  const page = await read(PAGE);

  // Un canvas caché garde son contexte WebGL, que le navigateur compte et
  // finit par reprendre.
  assert.match(page, /\{vue === 'atelier' \? \(/);
  assert.doesNotMatch(page, /hidden[^"]*<SceneAtelier/);
});

// -------------------------------------------------------- les interactions

test('toucher une voiture ouvre la fiche existante', async () => {
  const page = await read(PAGE);
  const panneau = await read(PANNEAU);

  // La fiche du CRM, pas une fiche parallèle dessinée dans la scène.
  assert.match(page, /navigate\(`\/interventions\/\$\{choisie\.lead_id\}`/);
  assert.match(page, /state: \{ background: fondDepuis\(location\) \}/);
  // Un rendez-vous sans fiche le dit, au lieu d'un bouton qui ne fait rien.
  assert.match(panneau, /disabled=\{!i\.lead_id\}/);
  assert.match(panneau, /Aucune fiche rattachée/);
});

test('un enregistrement réussi rafraîchit la scène', async () => {
  const page = await read(PAGE);

  // C'est ce qui fait glisser le véhicule vers son nouveau poste : la place
  // calculée change, et le composant la rejoint.
  assert.match(page, /onSuccess: \(\) => queryClient\.invalidateQueries\(\{ queryKey: \['atelier'\] \}\)/);
  assert.match(page, /onError: \(e: Error\) =>/);
});

test('on ne propose pas une action qui échouerait', async () => {
  const page = await read(PAGE);

  // La politique RLS ne laisse un technicien modifier que ses rendez-vous.
  assert.match(page, /function statutsPossibles/);
  assert.match(page, /const sien = Boolean\(monId && intervention\.assigned_user_id === monId\)/);
  assert.match(page, /if \(!gestionnaire && !sien\) return \[\];/);
});

test('la sélection remplace le véhicule représentatif du poste', async () => {
  const scene = await read(SCENE);

  // Chaque poste montre un dossier, mais une sélection faite depuis la liste
  // doit immédiatement prendre sa place dans le décor.
  assert.match(scene, /const candidates = places\.filter\(\(place\) => place\.zone === poste\.zone\)/);
  assert.match(scene, /candidate\.intervention\.id === selection/);
  assert.match(scene, /\?\? candidates\[0\]/);
});

test('la cible tactile couvre tout le poste, pas seulement la voiture', async () => {
  const scene = await read(SCENE);

  // Viser un pare-brise au doigt sur un écran de téléphone est illusoire :
  // chaque rectangle interactif couvre une part importante de la scène.
  assert.match(scene, /function PosteInteractif/);
  assert.match(scene, /h-\[39%\] w-\[25%\]/);
  assert.match(scene, /aria-label=\{intervention/);
});

// ------------------------------------------------------------- le tactile

test('le poste actif se centre automatiquement sur téléphone', async () => {
  const scene = await read(SCENE);

  assert.match(scene, /overflow-x-auto/);
  assert.match(scene, /scrollIntoView\(\{ behavior: 'smooth', block: 'nearest', inline: 'center' \}\)/);
  assert.match(scene, /min-w-\[720px\]/);
});

test('le décor garde un fond de secours pendant son chargement', async () => {
  const scene = await read(SCENE);

  assert.match(scene, /atelier-realiste-v1\.webp/);
  assert.match(scene, /bg-gradient-to-br from-slate-100 via-slate-200 to-emerald-100/);
  assert.match(scene, /loading="eager"/);
  assert.match(scene, /decoding="async"/);
});

// ------------------------------------------------ lisible et sans texte peint

test('rien de ce qui se lit n’est dessiné dans la scène', async () => {
  const scene = await read(SCENE);
  const panneau = await read(PANNEAU);

  // Le décor ne porte aucune donnée métier : les libellés restent des boutons
  // HTML lisibles et utilisables au clavier.
  assert.doesNotMatch(scene, /<Canvas|<Text|<Html|troika/);
  assert.match(scene, /<button/);
  assert.match(scene, /aria-pressed=\{selectionne\}/);
  // Le panneau, lui, est du HTML avec une liste de définitions.
  assert.match(panneau, /<dl/);
  assert.match(panneau, /aria-live="polite"/);
});

test('la même information existe sans le décor', async () => {
  const page = await read(PAGE);

  // Pas un repli dégradé : les mêmes cartes que l'écran des interventions,
  // groupées par poste, au clavier.
  assert.match(page, /export function ListeAtelier/);
  assert.match(page, /<InterventionCarteListe/);
  assert.match(page, /aria-pressed=\{vue === v\}/);
  // Et les compteurs de postes sont en HTML, hors du canvas.
  assert.match(page, /\{compte\[zone\.cle\]\}/);
});

test('chargement, panne et journée vide se distinguent', async () => {
  const page = await read(PAGE);

  // Une requête en échec qui tombe sur « atelier vide » ferait croire à une
  // journée sans intervention.
  assert.match(page, /requete\.isLoading \?/);
  assert.match(page, /requete\.isError \?/);
  assert.match(page, /<EtatErreur/);
  assert.match(page, /interventions\.length === 0 \?/);
  assert.match(page, /Aucune intervention aujourd’hui/);
});

test('l’atelier n’existe que dans l’espace de données fictives', async () => {
  const { CHEMINS_ZONE_TEST, cheminAutorise, estCheminZoneTest } =
    await import('../src/config/permissions.ts');

  // Une expérimentation ne doit pas apparaître dans le CRM du quotidien
  // tant qu'elle n'a pas été validée.
  assert.ok(CHEMINS_ZONE_TEST.includes('/atelier'));
  assert.equal(estCheminZoneTest('/atelier'), true);
  assert.equal(estCheminZoneTest('/atelier/poste-2'), true);
  assert.equal(estCheminZoneTest('/agenda'), false);

  // Hors de l'espace fictif, personne n'y entre — pas même un administrateur.
  for (const role of ['admin', 'manager', 'advisor', 'technician']) {
    assert.equal(cheminAutorise('/atelier', role), false, role);
    assert.equal(cheminAutorise('/atelier', role, false), false, role);
  }
  // Dedans, la matrice des rôles reprend la main.
  assert.equal(cheminAutorise('/atelier', 'admin', true), true);
  assert.equal(cheminAutorise('/atelier', 'accountant', true), false);

  // Le reste du CRM n'est pas affecté par le drapeau.
  assert.equal(cheminAutorise('/leads', 'admin'), true);
  assert.equal(cheminAutorise('/leads', 'admin', true), true);
});

test('oublier de transmettre le drapeau cache, et n’expose pas', async () => {
  const { cheminAutorise } = await import('../src/config/permissions.ts');

  // La valeur par défaut est le choix sûr : un appelant distrait masque
  // l'expérimentation au lieu de la publier.
  assert.equal(cheminAutorise('/atelier', 'admin'), false);
});

test('les trois filtres connaissent l’espace de travail', async () => {
  const garde = await read('src/features/auth/protected-route.tsx');
  const layout = await read('src/layouts/app-layout.tsx');
  const onglets = await read('src/components/BarreOnglets.tsx');
  const contexte = await read('src/features/auth/auth-context.tsx');

  // Garde de route, barre latérale et barre d'onglets : masquer l'entrée
  // sans refuser l'adresse laisserait l'atelier atteignable à la main.
  assert.match(garde, /cheminAutorise\(location\.pathname, profile\.role, profile\.dans_zone_test\)/);
  assert.match(layout, /cheminAutorise\(i\.path, profile\?\.role \?\? null, profile\?\.dans_zone_test\)/);
  assert.match(onglets, /cheminAutorise\(i!\.path, role, dansZoneTest\)/);

  // La nature de l'espace arrive avec le profil, pas par une requête
  // séparée dont la réponse suivrait la première décision.
  assert.match(contexte, /select\('\*, workspaces\(est_zone_test\)'\)/);
  assert.match(contexte, /dans_zone_test: Boolean\(workspaces\?\.est_zone_test\)/);
});

test('la route et la navigation existent toujours, pour le jour où', async () => {
  const routes = await read('src/app/app-routes.tsx');
  const navigation = await read('src/config/navigation.ts');
  const permissions = await read('src/config/permissions.ts');

  // Promouvoir l'atelier consistera à le retirer de `CHEMINS_ZONE_TEST`,
  // rien d'autre.
  assert.match(routes, /<Route path="\/atelier" element=\{charger\(<AtelierPage \/>\)\} \/>/);
  assert.match(navigation, /path: '\/atelier'/);
  assert.match(permissions, /'\/atelier': \['admin', 'manager', 'advisor', 'technician'\]/);
});
