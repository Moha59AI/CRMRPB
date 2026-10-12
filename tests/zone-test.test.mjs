import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const MIGRATION = 'supabase/migrations/20261012100000_zone_test_donnees_fictives.sql';
const SERVICE = 'src/services/zone-test-service.ts';
const BANDEAU = 'src/features/zone-test/bandeau-zone-test.tsx';
const HOOK = 'src/features/zone-test/etat-zone.ts';

test('les données fictives vivent dans leur propre espace de travail', async () => {
  const migration = await read(MIGRATION);

  // Les mêler aux 682 leads réels les ferait compter dans les listes, les
  // compteurs, le chiffre d'affaires et les relances.
  assert.match(migration, /insert into public\.workspaces \(name, slug, est_zone_test\)/);
  assert.match(migration, /'zone-test', true/);
  // Toutes les insertions portent le workspace fictif, jamais un autre.
  const inserts = migration.match(/insert into public\.(contacts|vehicles|leads|windscreen_cases|appointments|quotes|invoices|payments|after_sales_cases|case_documents|tasks|notes)\b/g) ?? [];
  assert.ok(inserts.length >= 12, `attendu au moins 12 tables peuplées, vu ${inserts.length}`);
});

test('la suppression ne peut viser que l’espace fictif', async () => {
  const migration = await read(MIGRATION);

  // Le drapeau est la seule cible possible : l'espace réel ne le porte pas,
  // quelle que soit la façon dont la fonction est appelée.
  const suppressions = migration.match(/delete from public\.workspaces[^;]*/g) ?? [];
  assert.ok(suppressions.length >= 1);
  for (const suppression of suppressions) {
    assert.match(suppression, /where est_zone_test/, suppression);
  }
  // Et jamais plus d'un espace fictif à purger.
  assert.match(migration, /create unique index if not exists workspaces_une_seule_zone_test/);
});

test('vider la zone n’emporte pas le profil dans la cascade', async () => {
  const migration = await read(MIGRATION);

  // `profiles.workspace_id` est en `on delete cascade`, comme les 43 autres
  // tables : supprimer l'espace pendant qu'on s'y trouve effacerait le profil
  // et l'accès au CRM avec lui.
  assert.match(migration, /create or replace function public\.evacuer_zone_test/);
  // Les deux chemins de suppression l'appellent avant.
  const avantSuppression = migration.split('delete from public.workspaces where est_zone_test');
  assert.equal(avantSuppression.length, 3, 'deux suppressions attendues');
  for (const bloc of avantSuppression.slice(0, 2)) {
    assert.match(bloc.slice(-400), /perform public\.evacuer_zone_test\(\);/);
  }
});

test('le rôle administrateur ne suffit pas', async () => {
  const migration = await read(MIGRATION);

  // Un second administrateur n'entrerait pas : l'autorisation est nominative
  // et vit en base, pas dans le code.
  assert.match(migration, /create table if not exists public\.acces_zone_test/);
  assert.match(migration, /select exists \(select 1 from public\.acces_zone_test where user_id = auth\.uid\(\)\)/);
  assert.doesNotMatch(migration, /role = 'admin'\s*then/);

  // Les trois fonctions vérifient, chacune de leur côté.
  for (const fonction of ['seed_zone_test', 'basculer_zone_test', 'vider_zone_test']) {
    const corps = migration.slice(migration.indexOf(`function public.${fonction}`));
    assert.match(
      corps.slice(0, 1200),
      /if not public\.autorise_zone_test\(\) then\s*\n\s*raise exception/,
      fonction,
    );
  }
});

test('les fonctions ne sont pas atteignables avec la clé anonyme', async () => {
  const migration = await read(MIGRATION);

  // Le masquage du bouton ne protège rien : l'appel RPC est joignable
  // directement. C'est la révocation qui compte.
  for (const fonction of [
    'seed_zone_test\\(\\)', 'basculer_zone_test\\(boolean\\)',
    'vider_zone_test\\(\\)', 'evacuer_zone_test\\(\\)',
  ]) {
    assert.match(
      migration,
      new RegExp(`revoke all on function public\\.${fonction} from public, anon`),
      fonction,
    );
  }
  // `evacuer_zone_test` n'est appelée que par les deux autres : personne ne
  // doit pouvoir la déclencher seule.
  assert.doesNotMatch(migration, /grant execute on function public\.evacuer_zone_test/);
});

test('la liste des autorisés ne se lit pas par les autres', async () => {
  const migration = await read(MIGRATION);

  assert.match(migration, /alter table public\.acces_zone_test enable row level security/);
  assert.match(migration, /using \(user_id = auth\.uid\(\)\)/);
  // Aucune politique d'écriture : la liste se tient à la main.
  assert.doesNotMatch(migration, /create policy "(insert|update|delete)_acces_zone_test"/);
});

test('personne de réel ne peut être joint depuis les données fictives', async () => {
  const migration = await read(MIGRATION);

  // Seul le corps du seed est concerné : l'octroi du droit, lui, désigne
  // bien une vraie adresse — c'est son rôle.
  const seed = migration.slice(
    migration.indexOf('function public.seed_zone_test'),
    migration.indexOf('revoke all on function public.seed_zone_test'),
  );

  // Domaine réservé par la RFC 2606, donc non routable, et plage de numéros
  // fictifs. Même une action partie par erreur n'atteint personne.
  const emails = seed.match(/'[a-z.]+@[a-z.]+'/g) ?? [];
  for (const email of emails) {
    assert.match(email, /@example\.test'$/, `adresse non fictive : ${email}`);
  }
  const telephones = seed.match(/'0\d{9}'/g) ?? [];
  for (const tel of telephones) {
    assert.match(tel, /^'063998\d{4}'$/, `numéro non fictif : ${tel}`);
  }
  // Et tout se reconnaît à l'œil.
  assert.ok((seed.match(/TEST /g) ?? []).length >= 8);
  assert.ok(emails.length >= 8, 'le seed doit porter des adresses fictives');
});

test('le jeu de données couvre les situations du métier', async () => {
  const migration = await read(MIGRATION);

  // Dossier incomplet, planifié, en cours, terminé, SAV.
  for (const statut of [
    'documents_pending', 'appointment_scheduled', 'glass_ordered',
    'payment_received', 'sav',
  ]) {
    assert.match(migration, new RegExp(`'${statut}'`), `dossier ${statut}`);
  }
  // Rendez-vous réalisé, confirmé, à venir, annulé.
  for (const statut of ['completed', 'confirmed', 'scheduled', 'cancelled']) {
    assert.match(migration, new RegExp(`'${statut}'`), `rendez-vous ${statut}`);
  }
  // Facture réglée, partielle, en retard.
  for (const statut of ['paid', 'partial', 'overdue']) {
    assert.match(migration, new RegExp(`'${statut}'`), `facture ${statut}`);
  }
  // Une pièce manquante, pour voir une checklist incomplète.
  assert.match(migration, /'Carte grise',\s+false, null/);
});

test('l’interface dit en permanence où l’on travaille', async () => {
  const bandeau = await read(BANDEAU);
  const layout = await read('src/layouts/app-layout.tsx');

  // Le danger n'est pas de se tromper de clic, c'est de croire qu'on est
  // ailleurs. Le bandeau ne se referme pas.
  assert.match(bandeau, /Zone de test/);
  assert.match(bandeau, /Retour au CRM principal/);
  assert.doesNotMatch(bandeau, /onClose|setOuvert|dismiss/i);
  // Placé avant l'en-tête et avant tout contenu.
  assert.match(layout, /<main[^>]*>\s*\n\s*\{\/\*[\s\S]{0,200}\*\/\}\s*\n\s*<BandeauZoneTest \/>/);
});

test('changer d’espace vide le cache plutôt que de l’invalider', async () => {
  const hook = await read(HOOK);

  // Laisser une liste de l'autre espace à l'écran, même une seconde, est
  // exactement la confusion qu'on veut éviter.
  assert.match(hook, /queryClient\.clear\(\)/);
  assert.match(hook, /await refreshProfile\(\)/);
});

test('le service ne décide rien, il affiche', async () => {
  const service = await read(SERVICE);

  // L'autorisation vit en base. Le service lit son propre droit, rien de plus.
  assert.match(service, /from\('acces_zone_test'\)/);
  assert.match(service, /supabase\.rpc\('basculer_zone_test'/);
  assert.match(service, /supabase\.rpc\('seed_zone_test'\)/);
  assert.doesNotMatch(service, /role === 'admin'/);
});
