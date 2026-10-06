import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const LIGNE = 'src/features/integrations/email/ligne-email.tsx';
const PAGE = 'src/features/integrations/email/email-inbox-page.tsx';

test('un message tient sur une ligne, alignée en colonnes', async () => {
  const ligne = await read(LIGNE);

  // C'est l'alignement, pas la densite seule, qui permet de balayer une
  // boite : l'oeil descend une colonne au lieu de relire chaque bloc.
  assert.match(ligne, /h-\[42px\]/);
  // L'expediteur garde une largeur constante dans une meme liste -- c'est
  // elle qui fait la colonne -- mais exprimee en part de la liste. Les
  // points de rupture qu'elle portait avant mesuraient la fenetre, et
  // confisquaient 190 px dans une liste de 440.
  assert.match(ligne, /etroite \? 'w-\[34%\]/);
  assert.match(ligne, /: 'w-\[30%\]/);
  assert.ok(ligne.includes("{email.subject || '(Sans objet)'}"));
  assert.ok(ligne.includes('— {extrait}'));
});

test('un objet long ne passe pas sous la date', async () => {
  const ligne = await read(LIGNE);

  // `shrink-0` sans plafond faisait chevaucher l'objet et la colonne de
  // date. L'objet s'arrete donc a la moitie quand un extrait l'accompagne ;
  // sur telephone, et dans une liste etroite, l'extrait n'est pas affiche et
  // le plafond serait une perte de place.
  assert.ok(ligne.includes("etroite ? '' : 'sm:max-w-[55%] sm:flex-none sm:shrink-0',"));
});

test('le non-lu se voit sans rien lire', async () => {
  const ligne = await read(LIGNE);
  const migration = await read('supabase/migrations/20261006120000_email_lu.sql');
  const types = await read('src/types/index.ts');

  assert.match(ligne, /export function estNonLu/);
  assert.match(ligne, /email\.direction === 'inbound' && !email\.read_at/);
  // Gras et fond : Gmail teinte le lu et laisse le non-lu en blanc.
  assert.ok(ligne.includes("nonLu ? 'bg-card hover:bg-surface' : 'bg-surface/60 hover:bg-surface'"));
  assert.match(migration, /add column if not exists read_at timestamptz/);
  assert.match(types, /read_at: string \| null/);
});

test('ouvrir un message le marque lu, une seule fois', async () => {
  const service = await read('src/features/integrations/email/email-service.ts');
  const page = await read(PAGE);

  // `read_at` garde la premiere ouverture : rouvrir dix fois ne deplace pas
  // le reperage.
  assert.match(service, /export async function marquerEmailLu/);
  assert.match(service, /\.is\('read_at', null\)/);
  assert.match(page, /void marquerEmailLu\(id\)/);
  // L'affichage ne doit pas attendre l'ecriture.
  assert.match(page, /setSelectedId\(id\);[\s\S]{0,400}marquerEmailLu/);
});

test('la liste occupe tout l’écran tant qu’aucun message n’est ouvert', async () => {
  const page = await read(PAGE);

  // C'est la vue par defaut de Gmail : le volet de lecture n'apparait qu'a
  // l'ouverture.
  assert.ok(page.includes("selectedEmail ? 'lg:grid-cols-[minmax(340px,440px)_minmax(0,1fr)]' : 'lg:grid-cols-1'"));
});

test('les repères métier survivent à la densification', async () => {
  const ligne = await read(LIGNE);
  const page = await read(PAGE);

  assert.match(ligne, /pdfFournisseur > 0 && \(/);
  assert.match(ligne, /À rattacher/);
  assert.match(page, /pdfFournisseur=\{supplierPdfCount\}/);
  assert.match(page, /badge=\{<EmailPartyBadge classification=\{classification\} \/>\}/);
});
