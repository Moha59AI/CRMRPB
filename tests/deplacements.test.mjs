import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const {
  BAREME_PAR_DEFAUT, arrondirCoordonnee, calculerCouts,
  formatDistance, formatDuree, formatEuros, memeBareme,
} = await import('../src/features/deplacements/cout-trajet.ts');

const { lieuInterventionDuLead } = await import('../src/features/deplacements/lieu-intervention.ts');

const MIGRATION = 'supabase/migrations/20261006180000_deplacements.sql';
const FONCTION = 'supabase/functions/openrouteservice-route/index.ts';
const SERVICE = 'src/services/trajet-service.ts';
const HOOK = 'src/features/deplacements/use-trajet.ts';
const SECTION = 'src/features/deplacements/section-deplacement.tsx';
const CARTE = 'src/features/deplacements/carte-trajet.tsx';
const REGLAGES = 'src/features/settings/deplacements-page.tsx';

// ---------------------------------------------------------------- arithmétique

test('le coût d’un déplacement suit le barème, au centime', () => {
  // 18,4 km et 24 min à l'aller, barème par défaut :
  // carburant (36,8 × 6,5 / 100) × 1,70 = 4,07 €
  // véhicule   36,8 × 0,20              = 7,36 €
  // temps      (48 / 60) × 20           = 16,00 €
  const couts = calculerCouts(18_400, 24 * 60, BAREME_PAR_DEFAUT);

  assert.equal(couts.distance_aller_km, 18.4);
  assert.equal(couts.distance_aller_retour_km, 36.8);
  assert.equal(couts.temps_aller_min, 24);
  assert.equal(couts.temps_aller_retour_min, 48);
  assert.equal(couts.cout_carburant, 4.07);
  assert.equal(couts.cout_vehicule, 7.36);
  assert.equal(couts.cout_temps, 16);
  assert.equal(couts.cout_total, 27.43);
});

test('le détail affiché s’additionne bien au total', () => {
  // Un total qui ne tombe pas sur la somme des lignes fait douter de tout le
  // reste : l'utilisateur refait le calcul de tête.
  for (const [metres, secondes] of [[7_333, 611], [41_027, 2_845], [1_050, 97]]) {
    const c = calculerCouts(metres, secondes, BAREME_PAR_DEFAUT);
    assert.equal(
      c.cout_total,
      Number((c.cout_carburant + c.cout_vehicule + c.cout_temps).toFixed(2)),
      `${metres} m / ${secondes} s`,
    );
  }
});

test('les arrondis sont ceux demandés : 1 décimale, minute entière, 2 décimales', () => {
  const c = calculerCouts(18_449, 1_471, BAREME_PAR_DEFAUT);

  assert.equal(c.distance_aller_km, 18.4);
  assert.equal(c.temps_aller_min, 25);
  assert.ok(Number.isInteger(c.temps_aller_retour_min));
  for (const montant of [c.cout_carburant, c.cout_vehicule, c.cout_temps, c.cout_total]) {
    assert.equal(montant, Number(montant.toFixed(2)));
  }
});

test('un barème modifié change le chiffrage, et lui seul', () => {
  const cher = { ...BAREME_PAR_DEFAUT, fuel_price_per_liter: 2.1 };
  const base = calculerCouts(18_400, 1_440, BAREME_PAR_DEFAUT);
  const apres = calculerCouts(18_400, 1_440, cher);

  assert.equal(apres.distance_aller_retour_km, base.distance_aller_retour_km);
  assert.equal(apres.temps_aller_retour_min, base.temps_aller_retour_min);
  assert.notEqual(apres.cout_carburant, base.cout_carburant);
  assert.equal(memeBareme(BAREME_PAR_DEFAUT, cher), false);
  assert.equal(memeBareme(BAREME_PAR_DEFAUT, { ...BAREME_PAR_DEFAUT }), true);
});

test('un trajet nul ne coûte rien et ne plante pas', () => {
  const c = calculerCouts(0, 0, BAREME_PAR_DEFAUT);
  assert.equal(c.cout_total, 0);
  assert.equal(c.distance_aller_retour_km, 0);
});

test('les formats sont lisibles en français', () => {
  assert.equal(formatDistance(36.8), '36,8 km');
  assert.equal(formatDistance(7), '7,0 km');
  assert.equal(formatDuree(24), '24 min');
  assert.equal(formatDuree(48), '48 min');
  // « 72 min » demande un calcul mental pour savoir si on rentre à temps.
  assert.equal(formatDuree(72), '1 h 12');
  assert.equal(formatDuree(120), '2 h');
  assert.match(formatEuros(27.43), /27,43/);
});

test('la clé de cache s’arrête au mètre', () => {
  // Cinq décimales valent environ un mètre : en deçà, la BAN ne distingue
  // plus rien et recalculer serait un appel réseau pour rien.
  assert.equal(arrondirCoordonnee(50.6292431), 50.62924);
  assert.equal(arrondirCoordonnee(3.0572561), 3.05726);
  assert.equal(arrondirCoordonnee(50.629243), arrondirCoordonnee(50.6292428));
});

// ------------------------------------------------------------ lieu de départ

test('une intervention ailleurs n’emprunte pas les coordonnées du domicile', () => {
  // Un point faux est plus dangereux qu'une absence de point : il ne se
  // signale pas, et tout le chiffrage du déplacement serait faux.
  const lead = {
    address: '12 Rue de Lens', postal_code: '59000', city: 'Lille',
    latitude: 50.62925, longitude: 3.05726,
    intervention_address: '5 Avenue de la Marne', intervention_postal_code: '59290',
    intervention_city: 'Wasquehal',
    intervention_latitude: null, intervention_longitude: null,
  };

  const lieu = lieuInterventionDuLead(lead);
  assert.equal(lieu.distinctDuDomicile, true);
  assert.equal(lieu.latitude, null);
  assert.equal(lieu.longitude, null);
  assert.match(lieu.label, /Wasquehal/);
});

test('sans adresse d’intervention, le domicile fait foi', () => {
  const lieu = lieuInterventionDuLead({
    address: '12 Rue de Lens', postal_code: '59000', city: 'Lille',
    latitude: 50.62925, longitude: 3.05726,
    intervention_address: null, intervention_postal_code: null, intervention_city: null,
    intervention_latitude: null, intervention_longitude: null,
  });

  assert.equal(lieu.distinctDuDomicile, false);
  assert.equal(lieu.latitude, 50.62925);
  assert.equal(lieu.label, '12 Rue de Lens 59000 Lille');
});

// ----------------------------------------------------- une seule cartographie

test('les adresses restent celles de l’État : aucune seconde autocomplétion', async () => {
  const reglages = await read(REGLAGES);
  const service = await read(SERVICE);
  const fonction = await read(FONCTION);

  // L'adresse de départ passe par le champ existant, branché sur la BAN.
  assert.match(reglages, /import \{ ChampAdresse \} from '@\/components\/ChampAdresse'/);
  assert.match(reglages, /<ChampAdresse/);
  // Et elle enregistre ce que la BAN a donné, coordonnées comprises.
  for (const champ of [
    'depart_address', 'depart_postal_code', 'depart_city',
    'depart_latitude', 'depart_longitude',
  ]) {
    assert.match(reglages, new RegExp(`setValue\\('${champ}'`), champ);
  }

  // OpenRouteService n'intervient qu'après les coordonnées : il ne géocode
  // rien, et personne n'appelle son service d'adresses.
  assert.doesNotMatch(fonction, /geocode|\/pelias|autocomplete/i);
  assert.doesNotMatch(service, /data\.geopf\.fr|rechercherAdresse/);
});

test('aucun service Google n’est ajouté', async () => {
  for (const chemin of [FONCTION, SERVICE, HOOK, SECTION, CARTE, REGLAGES]) {
    const source = await read(chemin);
    assert.doesNotMatch(source, /googleapis|maps\.google|places|routes\.google/i, chemin);
  }
});

test('la carte réutilise Leaflet et le fond IGN déjà en place', async () => {
  const carte = await read(CARTE);
  const existante = await read('src/features/calendar/carte-interventions.tsx');

  assert.match(carte, /from 'react-leaflet'/);
  // Le meme fond que la carte des interventions : rien de nouveau n'est
  // introduit, et les deux ecrans restent coherents.
  const couche = /GEOGRAPHICALGRIDSYSTEMS\.PLANIGNV2/;
  assert.match(carte, couche);
  assert.match(existante, couche);
  // Le trace suit la geometrie reelle, pas une ligne droite.
  assert.match(carte, /<Polyline positions=\{trace\}/);
  assert.match(carte, /\(geometrie \?\? \[\]\)\.map\(\(\[lon, lat\]\) => \[lat, lon\]\)/);
});

// --------------------------------------------------------------- la clé reste

test('la clé OpenRouteService ne quitte jamais le serveur', async () => {
  const fonction = await read(FONCTION);
  const service = await read(SERVICE);
  const hook = await read(HOOK);
  const section = await read(SECTION);
  const exemple = await read('.env.example');

  assert.match(fonction, /Deno\.env\.get\('OPENROUTESERVICE_API_KEY'\)/);
  // Rien dans le navigateur ne connaît la clé, ni l'adresse du service.
  for (const [chemin, source] of [[SERVICE, service], [HOOK, hook], [SECTION, section]]) {
    assert.doesNotMatch(source, /OPENROUTESERVICE_API_KEY/, chemin);
    assert.doesNotMatch(source, /api\.openrouteservice\.org/, chemin);
  }
  // Une variable VITE_ serait publiée dans le bundle.
  assert.doesNotMatch(exemple, /VITE_OPENROUTESERVICE/);
  assert.match(exemple, /OPENROUTESERVICE_API_KEY/);
});

test('le point de départ est lu côté serveur, jamais envoyé par le navigateur', async () => {
  const fonction = await read(FONCTION);
  const service = await read(SERVICE);

  // Sinon n'importe quelle paire de coordonnées consommerait notre quota.
  assert.match(fonction, /from\('travel_settings'\)/);
  assert.match(service, /body: \{\s*\n\s*arrivee: \{/);
  assert.doesNotMatch(service, /depart: \{ latitude: depart/);
});

// ------------------------------------------------------------------- le cache

test('le cache évite l’appel : lecture en base d’abord', async () => {
  const service = await read(SERVICE);
  const hook = await read(HOOK);
  const fonction = await read(FONCTION);

  // Ouvrir une fiche ne reveille pas une fonction serveur pour relire une
  // ligne que la RLS nous laisse voir.
  assert.match(service, /export async function fetchTrajetEnCache/);
  assert.match(hook, /const connu = await fetchTrajetEnCache\(depart, arrivee, profil\);/);
  assert.match(hook, /if \(connu\) \{[\s\S]{0,200}return reglages \? rechiffrerTrajet/);
  // Et la fonction verifie le cache a son tour, sauf recalcul force.
  assert.match(fonction, /if \(!force\) \{/);
  assert.match(fonction, /if \(connu\) return jsonResponse\(\{ trajet: connu, origine: 'cache' \}\);/);
});

test('changer le barème ne rappelle pas OpenRouteService', async () => {
  const service = await read(SERVICE);
  const reglages = await read(REGLAGES);

  // La route n'a pas bougé : seule l'arithmétique est à refaire, et elle est
  // gratuite.
  assert.match(service, /export async function rechiffrerTrajet/);
  assert.match(service, /if \(memeBareme\(trajet, bareme\)\) return trajet;/);
  assert.doesNotMatch(
    service.slice(service.indexOf('rechiffrerTrajet')),
    /functions\.invoke/,
  );
  // Enregistrer un barème invalide les trajets affichés, pas les routes.
  assert.match(reglages, /invalidateQueries\(\{ queryKey: \['trajet'\] \}\)/);
});

test('la clé de cache est le couple de coordonnées, pas la fiche', async () => {
  const migration = await read(MIGRATION);
  const hook = await read(HOOK);

  assert.match(migration, /create unique index if not exists travel_routes_cle_idx/);
  assert.match(migration, /workspace_id, profile,\s*\n\s*depart_latitude, depart_longitude,\s*\n\s*arrivee_latitude, arrivee_longitude/);
  // Demenager un client change la cle, donc invalide l'ancien calcul sans
  // qu'on ait a le detecter.
  assert.match(hook, /arrondirCoordonnee\(arriveeLat\), arrondirCoordonnee\(arriveeLon\)/);
  assert.doesNotMatch(hook, /queryKey: \['trajet', lead/);
});

test('le bouton de recalcul force vraiment un nouvel appel', async () => {
  const section = await read(SECTION);
  const hook = await read(HOOK);
  const fonction = await read(FONCTION);

  assert.match(section, /Recalculer le trajet/);
  assert.match(hook, /\{ force: true, profil \}/);
  assert.match(fonction, /const force = corps\.force === true;/);
});

// ------------------------------------------------------------------ les pannes

test('aucune panne du service d’itinéraire ne bloque le CRM', async () => {
  const service = await read(SERVICE);
  const fonction = await read(FONCTION);

  // Les six cas demandés, chacun distingué : « réessayez » et « prévenez un
  // administrateur » ne se disent pas de la même façon.
  for (const code of [
    'CLE_INVALIDE', 'QUOTA_DEPASSE', 'DELAI_DEPASSE',
    'COORDONNEES_MANQUANTES', 'REPONSE_INVALIDE', 'SERVICE_INDISPONIBLE',
  ]) {
    assert.match(fonction, new RegExp(code), `${code} côté serveur`);
    assert.match(service, new RegExp(`${code}:`), `${code} traduit`);
  }

  assert.match(service, /Impossible de calculer le trajet actuellement\./);
  // Le délai est borné : la fiche doit s'afficher même si ORS traîne.
  assert.match(fonction, /AbortSignal\.timeout\(DELAI_MS\)/);
});

test('une panne de recalcul ne fait pas disparaître le trajet connu', async () => {
  const section = await read(SECTION);

  // Un chiffre d'hier vaut mieux qu'un encart vide.
  assert.match(section, /erreur && !trajet \?/);
  assert.match(section, /Le trajet affiché est le dernier calculé\./);
});

test('une écriture ratée ne perd pas un calcul déjà payé', async () => {
  const fonction = await read(FONCTION);
  assert.match(fonction, /if \(erreurEcriture\) \{\s*\n\s*return jsonResponse\(\{ trajet: ligne/);
});

// --------------------------------------------------------------- base et accès

test('les deux tables ont RLS et leurs quatre politiques', async () => {
  const migration = await read(MIGRATION);

  for (const table of ['travel_settings', 'travel_routes']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`), table);
    for (const action of ['select', 'insert', 'update', 'delete']) {
      assert.match(migration, new RegExp(`create policy "${action}_${table}"`), `${action} ${table}`);
    }
  }

  // Le coût s'affiche sur la fiche : tout l'espace de travail doit pouvoir le
  // lire. Le barème, lui, ne se change pas par n'importe qui — un barème faux
  // se propage partout sans se signaler.
  assert.match(
    migration,
    /create policy "update_travel_settings"[\s\S]{0,400}a_role\(array\['admin', 'manager'\]\)/,
  );
});

test('le barème a des valeurs par défaut en base, et rien n’est codé en dur', async () => {
  const migration = await read(MIGRATION);
  const section = await read(SECTION);

  assert.match(migration, /fuel_price_per_liter numeric\(6, 3\) not null default 1\.700/);
  assert.match(migration, /consumption_l_per_100km numeric\(5, 2\) not null default 6\.50/);
  assert.match(migration, /vehicle_cost_per_km numeric\(6, 3\) not null default 0\.200/);
  assert.match(migration, /labour_cost_per_hour numeric\(7, 2\) not null default 20\.00/);

  // Le prix du carburant change tous les mois : l'encart lit le barème, il ne
  // porte aucun nombre.
  assert.doesNotMatch(section, /1\.7|6\.5|0\.2\b|= 20\b/);
  assert.equal(BAREME_PAR_DEFAUT.fuel_price_per_liter, 1.7);
  assert.equal(BAREME_PAR_DEFAUT.consumption_l_per_100km, 6.5);
  assert.equal(BAREME_PAR_DEFAUT.vehicle_cost_per_km, 0.2);
  assert.equal(BAREME_PAR_DEFAUT.labour_cost_per_hour, 20);
});

test('tout ce que le calcul produit est enregistré', async () => {
  const migration = await read(MIGRATION);

  for (const colonne of [
    'depart_label', 'depart_latitude', 'depart_longitude',
    'arrivee_label', 'arrivee_latitude', 'arrivee_longitude',
    'distance_m', 'duration_s', 'geometry',
    'fuel_cost', 'vehicle_cost', 'labour_cost', 'total_cost',
    'calculated_at',
  ]) {
    assert.match(migration, new RegExp(`\\b${colonne}\\b`), colonne);
  }
});

// -------------------------------------------------------------- l'écran mobile

test('sur téléphone, trois chiffres suffisent', async () => {
  const section = await read(SECTION);

  // Distance A/R, temps A/R et coût total sont toujours visibles ; le détail
  // s'ouvre. Un technicien dans la rue n'a pas besoin du prix du litre.
  assert.match(section, /libelle="Distance A\/R"/);
  assert.match(section, /libelle="Temps A\/R"/);
  assert.match(section, /Coût total\s*\n\s*<\/p>/);
  assert.match(section, /onClick=\{\(\) => setDetailOuvert/);
  assert.match(section, /\{detailOuvert && \(/);
  // Le total se voit avant tout le reste.
  assert.match(section, /text-2xl font-semibold tabular leading-none text-primary/);
});

test('la page de réglages est atteignable et réservée aux responsables', async () => {
  const routes = await read('src/app/app-routes.tsx');
  const navigation = await read('src/config/navigation.ts');
  const permissions = await read('src/config/permissions.ts');

  assert.match(routes, /<Route path="deplacements" element=\{charger\(<ReglagesDeplacementsPage \/>\)\} \/>/);
  assert.match(navigation, /path: '\/settings\/deplacements'/);
  assert.match(permissions, /'\/settings\/deplacements': \['admin', 'manager'\]/);
});

test('un rendez-vous d’intervention porte l’encart, pas un appel', async () => {
  const agenda = await read('src/features/calendar/calendar-page.tsx');
  const planning = await read('src/services/planning-service.ts');

  assert.match(agenda, /\{appointment\.type === 'intervention' && \(/);
  assert.match(agenda, /const lieu = lieuDuRendezVous\(appointment as AppointmentAvecClient\);/);
  // Le panneau est etroit : la carte reste sur la fiche.
  assert.match(agenda, /destination=\{lieu\}[\s\S]{0,120}sansCarte/);

  // Un rendez-vous qui porte sa propre adresse n'emprunte jamais les
  // coordonnees du lead : elles decrivent un autre lieu.
  assert.match(planning, /export function lieuDuRendezVous/);
  assert.match(
    planning,
    /if \(appt\.address\?\.trim\(\)\) \{[\s\S]{0,200}latitude: appt\.latitude/,
  );
  // Et les coordonnees sont bien ramenees par la requete.
  assert.match(planning, /const CHAMPS_CLIENT = '[^']*latitude, longitude';/);
  assert.match(planning, /intervention_latitude, intervention_longitude/);
});

test('la fiche d’intervention porte l’encart', async () => {
  const fiche = await read('src/features/dossier/dossier-contenu.tsx');

  assert.match(fiche, /<SectionDeplacement/);
  assert.match(fiche, /destination=\{lieuDeplacement\}/);
  assert.match(fiche, /const lieuDeplacement = lieuInterventionDuLead\(lead\);/);
});
