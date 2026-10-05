import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const MIGRATION = 'supabase/migrations/20261005160000_parcours_relance.sql';

test('le parcours suit la regle du metier', async () => {
  const sql = await read(MIGRATION);

  // Arrivee : tout de suite. Puis 2 h, le lendemain, 4 h plus tard, J+3.
  assert.match(sql, /'new',\s+0, interval '0 minutes'/);
  assert.match(sql, /'nrp',\s+1, interval '2 hours'/);
  assert.match(sql, /'nrp',\s+2, interval '1 day'/);
  assert.match(sql, /'nrp',\s+3, interval '4 hours'/);
  assert.match(sql, /'nrp',\s+4, interval '2 days'/);
  // Cinquieme sans reponse : fin du parcours.
  assert.match(sql, /'nrp',\s+5, null/);
});

test('une tentative se compte au resultat d appel, pas a la trace', async () => {
  const sql = await read(MIGRATION);
  const service = await read('src/services/relances-service.ts');

  // Marquer « sans reponse » depuis la fiche n'ecrit aucune communication :
  // le compteur restait a zero et la cadence ne demarrait jamais.
  assert.match(sql, /create or replace function public\.enregistrer_resultat_appel/);
  assert.match(sql, /when p_statut = 'nrp' then coalesce\(attempt_count, 0\) \+ 1/);
  assert.match(service, /supabase\.rpc\('enregistrer_resultat_appel'/);
  assert.doesNotMatch(service, /\.from\('leads'\)\s*\.update\(\{\s*status: params\.statut/);
});

test('le meme appel ne se compte pas deux fois', async () => {
  const sql = await read(MIGRATION);

  // Le trigger sur communications garde la date de contact et cesse de
  // compter : sinon la file comptait l'appel et le resultat.
  const trigger = sql.slice(sql.indexOf('function public.maj_compteurs_lead'));
  assert.match(trigger, /set last_contacted_at = greatest/);
  assert.doesNotMatch(trigger.slice(0, trigger.indexOf('$$;')), /attempt_count\s*=/);
});

test('joindre quelqu un remet le compteur a zero', async () => {
  const sql = await read(MIGRATION);

  // Un lead rappele plus tard repart d'un parcours entier.
  assert.match(sql, /else 0\s*\n\s*end,/);
});

test('une cadence epuisee clot le lead, et dit pourquoi', async () => {
  const sql = await read(MIGRATION);

  assert.match(sql, /create or replace function public\.cloturer_relances_epuisees/);
  // La fin du parcours se lit dans la table, pas en dur dans la fonction.
  assert.match(sql, /where c\.delai is null/);
  assert.match(sql, /set status = 'lost'/);
  assert.match(sql, /insert into public\.notes/);
  assert.match(sql, /Passé en perdu automatiquement/);
  assert.match(sql, /cron\.schedule\(\s*'cloturer-relances'/);
});
