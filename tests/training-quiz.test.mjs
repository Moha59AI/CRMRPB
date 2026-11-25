import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('le quiz contient les 20 questions et les 5 themes de validation', async () => {
  const migration = await read('supabase/migrations/20261125100000_training_quiz.sql');
  const questionCodes = new Set(
    [...migration.matchAll(/\('q(\d{2})',/g)].map((match) => match[1]),
  );

  assert.equal(questionCodes.size, 20);
  assert.match(migration, /'validation-1'/);
  assert.match(migration, /'Rôle et offre'/);
  assert.match(migration, /'Le produit'/);
  assert.match(migration, /'SONCAS'/);
  assert.match(migration, /'L''appel'/);
  assert.match(migration, /'Répondre au client'/);
  assert.match(migration, /16,/);
});

test('les reponses restent privees et la correction est faite cote serveur', async () => {
  const migration = await read('supabase/migrations/20261125100000_training_quiz.sql');

  assert.match(migration, /correct_index integer not null/);
  assert.match(migration, /revoke all on table public\.training_quizzes from public, anon, authenticated/);
  assert.match(migration, /revoke all on table public\.training_quiz_questions from public, anon, authenticated/);
  assert.match(migration, /revoke all on table public\.training_quiz_answers from public, anon, authenticated/);
  assert.match(migration, /security definer/g);
  assert.match(migration, /v_correct := v_selected_original = v_answer\.correct_index_snapshot/);
  assert.match(migration, /score = v_score/);
  assert.match(migration, /passed = v_score >= quiz\.pass_score/);
  assert.match(migration, /from generate_series\(0, 3\).*order by random\(\)/s);
});

test('une tentative appartient au compte reel et jamais a une vue deleguee', async () => {
  const migration = await read('supabase/migrations/20261125100000_training_quiz.sql');

  assert.match(migration, /workspace_id, user_id, quiz_id, quiz_code, total/);
  assert.match(migration, /v_profile\.workspace_id, auth\.uid\(\), v_quiz\.id/);
  assert.match(migration, /public\.utilisateur_effectif\(\) is distinct from auth\.uid\(\)/);
  assert.match(migration, /v_profile\.role <> 'admin'/);
  assert.match(migration, /v_attempt\.user_id <> auth\.uid\(\)/);
});

test('le parcours affiche une question, la correction puis le bilan', async () => {
  const [quizPage, landing, results] = await Promise.all([
    read('src/features/training/training-quiz-page.tsx'),
    read('src/features/training/training-page.tsx'),
    read('src/features/training/training-results-page.tsx'),
  ]);

  assert.match(quizPage, /Question \{question\.position\} sur \{etat\.total\}/);
  assert.match(quizPage, /Valider ma réponse/);
  assert.match(quizPage, /Bonne réponse/);
  assert.match(quizPage, /Réponse incorrecte/);
  assert.match(quizPage, /Question suivante/);
  assert.match(quizPage, /Résultat par thème/);
  assert.match(quizPage, /Réponses à revoir/);
  assert.match(landing, /Validation à \{quiz\.pass_score\}/);
  assert.match(landing, /Résultats de l’équipe/);
  assert.match(results, /Toutes les tentatives/);
  assert.match(results, /Détail des réponses/);
});

test('formation est visible au conseiller et les resultats restent admin', async () => {
  const [routes, navigation, permissions] = await Promise.all([
    read('src/app/app-routes.tsx'),
    read('src/config/navigation.ts'),
    read('src/config/permissions.ts'),
  ]);

  assert.match(routes, /path="\/formation"/);
  assert.match(routes, /path="\/formation\/resultats"/);
  assert.match(routes, /path="\/formation\/:quizCode"/);
  assert.match(navigation, /label: 'Formation'/);
  assert.match(permissions, /'\/formation': \['admin', 'advisor'\]/);
  assert.match(permissions, /'\/formation\/resultats': \['admin'\]/);
  assert.match(permissions, /CHEMINS_CONSEILLER[\s\S]*'\/formation'/);
});
