import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const PAGE = 'src/features/interventions/interventions-page.tsx';
const CARTE = 'src/features/interventions/intervention-carte-liste.tsx';
const SERVICE = 'src/services/interventions-service.ts';

test('le technicien reste limite au planning partage', async () => {
  const permissions = await read('src/config/permissions.ts');
  const routes = await read('src/app/app-routes.tsx');
  const navigation = await read('src/config/navigation.ts');

  // Les ecrans d'intervention restent disponibles aux autres roles, mais un
  // technicien est redirige vers le planning commun et ne peut pas en sortir.
  assert.match(permissions, /case 'technician': return '\/calendar';/);
  assert.match(permissions, /role === 'technician'/);
  assert.match(permissions, /return chemin === '\/calendar' \|\| chemin\.startsWith\('\/calendar\/'\)/);
  assert.match(routes, /<Route path="\/interventions" element=\{charger\(<InterventionsPage \/>\)\} \/>/);
  assert.match(navigation, /path: '\/interventions'/);
});

test('la liste tient debout sans les fiches clients', async () => {
  const service = await read(SERVICE);

  // La politique RLS du technicien lui laisse voir tous les rendez-vous de
  // l'atelier, mais pas tous les leads. L'heure, le titre et l'adresse
  // viennent donc du rendez-vous lui-meme ; le client vient en plus.
  for (const champ of ['title', 'start_time', 'address', 'latitude', 'geo_precision']) {
    assert.match(service, new RegExp(`\\b${champ}\\b`), champ);
  }
  assert.match(service, /client: nomComplet\(r\.leads\) \?\? nomComplet\(r\.contacts\)/);
  assert.match(service, /telephone: r\.leads\?\.phone\?\.trim\(\) \|\| r\.contacts\?\.phone\?\.trim\(\) \|\| null/);
  assert.match(service, /\.eq\('type', 'intervention'\)/);
});

test('une période trop fournie le dit au lieu de rogner en silence', async () => {
  const service = await read(SERVICE);
  const page = await read(PAGE);

  assert.match(service, /PLAFOND_INTERVENTIONS \+ 1/);
  assert.match(service, /const tronque = lignes\.length > PLAFOND_INTERVENTIONS/);
  assert.match(page, /courante\.data\?\.tronque && \(/);
});

test('on ne propose pas une action qui échouerait', async () => {
  const carte = await read(CARTE);
  const page = await read(PAGE);

  // Un technicien ne modifie que les rendez-vous qui lui sont affectes :
  // ailleurs, « Terminée » echouerait en silence.
  assert.match(carte, /\{aMoi && onTerminer && !terminee && !annulee && \(/);
  assert.match(page, /aMoi=\{Boolean\(\s*\n?\s*profile\?\.id && intervention\.assigned_user_id === profile\.id,?\s*\n?\s*\)\}/);
});

test('un point approximatif n’ouvre pas d’itinéraire', async () => {
  const carte = await read(CARTE);

  // Le centre d'une commune menerait le technicien devant la mairie. On
  // retombe sur l'adresse en toutes lettres, que son application sait lire.
  assert.match(carte, /i\.geo_precision === 'exact' && i\.latitude != null && i\.longitude != null/);
  assert.match(carte, /Point au centre de la commune/);
});

test('une action absente dit pourquoi', async () => {
  const carte = await read(CARTE);

  // Un bouton grise sans explication laisse croire a une panne.
  assert.match(carte, /indisponible="Aucun numéro"/);
  assert.match(carte, /indisponible="Lieu inconnu"/);
  assert.match(carte, /Aucune adresse sur ce rendez-vous/);
});

test('tout se touche au doigt et rien ne déborde', async () => {
  const carte = await read(CARTE);
  const page = await read(PAGE);

  // 44 px, la cible tactile retenue dans tout le CRM.
  assert.match(carte, /h-11 flex-1/);
  assert.match(page, /min-h-11 items-center justify-center/);
  // Aucune largeur minimale : c'est ce qui forcait le defilement lateral
  // ailleurs dans le CRM.
  assert.doesNotMatch(carte, /min-w-\[\d/);
  assert.doesNotMatch(page, /min-w-\[\d/);
});

test('appeler n’ouvre pas la fiche par-dessus l’appel', async () => {
  const carte = await read(CARTE);

  // Les actions sont hors du bouton qui ouvre la fiche, pas imbriquees
  // dedans -- un bouton dans un bouton n'est pas du HTML valide, et le clic
  // y remonterait.
  const corps = carte.indexOf('onClick={onOuvrir}');
  const actions = carte.indexOf('Les gestes du terrain');
  assert.ok(corps > 0 && actions > corps, 'les actions doivent suivre le corps cliquable');
  assert.match(carte, /<\/button>\s*\n\s*\n?\s*\{\/\* Les gestes du terrain/);
});

test('les trois périodes se chargent ensemble, pour leurs compteurs', async () => {
  const page = await read(PAGE);

  // Ouvrir un onglet vide pour l'apprendre est exactement ce qu'on veut
  // eviter sur un telephone.
  assert.match(page, /aujourdhui: useRequete\('aujourdhui'\)/);
  assert.match(page, /avenir: useRequete\('avenir'\)/);
  assert.match(page, /passees: useRequete\('passees'\)/);
  assert.match(page, /const nombre = requetes\[cle\]\.data\?\.interventions\.length/);
});

test('le vocabulaire des statuts est partagé avec l’agenda', async () => {
  const carte = await read(CARTE);
  const agenda = await read('src/features/calendar/calendar-page.tsx');
  const partage = await read('src/features/calendar/statut-rendez-vous.ts');

  // Deux listes separees auraient derive : « Terminé » d'un cote,
  // « Réalisé » de l'autre, pour le meme etat.
  assert.match(carte, /from '@\/features\/calendar\/statut-rendez-vous'/);
  assert.match(agenda, /from '\.\/statut-rendez-vous'/);
  assert.match(partage, /completed: 'Terminé'/);
  // Et l'agenda ne garde pas sa propre copie a cote.
  assert.doesNotMatch(agenda, /const STATUS_LABELS/);
  assert.doesNotMatch(agenda, /const STATUS_PILL/);
});

test('ni panne ni liste vide ne passent pour l’autre', async () => {
  const page = await read(PAGE);

  // Une requete en echec qui tombe sur « aucune intervention » fait rentrer
  // un technicien chez lui en croyant n'avoir rien.
  assert.match(page, /courante\.isError \?/);
  assert.match(page, /<EtatErreur/);
  assert.match(page, /parJour\.length === 0 \?/);
});
