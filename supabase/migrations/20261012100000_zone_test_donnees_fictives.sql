/*
# Un espace de travail fictif, pour essayer sans rien abîmer

## Où poser des données de test

Le CRM contient 682 leads, 800 contacts et 155 factures réels. Y ajouter des
dossiers fictifs les mélangerait à ceux du quotidien : les listes, les
compteurs, le chiffre d'affaires et les relances les compteraient tous.

Le schéma sait déjà séparer : chaque table porte `workspace_id`, et toutes les
politiques RLS filtrent dessus. Les données de test vont donc dans un second
espace de travail. Rien à inventer — c'est le cloisonnement que la base
applique déjà, sur les 46 tables à la fois.

## Ce que ça isole, et ce que ça n'isole pas

Isolé : les dossiers, les clients, les factures, les documents, les réglages
métier, les compteurs et les tableaux de bord. Une suppression dans l'espace
de test ne peut pas atteindre l'espace réel — la clause `workspace_id` des
politiques s'en charge.

Pas isolé : la base, le déploiement et le code sont les mêmes. Ce n'est pas
l'environnement d'exécution séparé d'une vraie préproduction ; un bug de code
reste un bug de code dans les deux espaces.

Les synchronisations automatiques, elles, ne verront pas cet espace : chacune
part de `integration_connections`, et l'espace de test n'en a aucune. Aucun
e-mail, aucun rendez-vous Google, aucune facture Onify n'y entre ni n'en sort.

## Accès

`acces_zone_test` liste les comptes autorisés, un seul pour l'instant. C'est
une donnée, pas une ligne de code : la liste se change sans redéployer. Le
rôle `admin` ne suffit pas — un second administrateur n'y entrerait pas.

La colonne `espace_principal` retient d'où l'on vient. Le retour ne se devine
donc pas, même si un jour plusieurs espaces réels coexistent.

## Réinitialisation

`vider_zone_test()` ne supprime qu'un espace marqué `est_zone_test`. L'espace
réel ne porte pas ce drapeau et ne peut pas être visé, quelle que soit la
façon dont la fonction est appelée.
*/

begin;

-- ── Marquage de l'espace ──────────────────────────────────────────────────

alter table public.workspaces
  add column if not exists est_zone_test boolean not null default false;

comment on column public.workspaces.est_zone_test is
  'Espace de données fictives. Seul un espace marqué peut être vidé par vider_zone_test().';

-- Filet de sécurité : un seul espace de test, jamais deux à purger.
create unique index if not exists workspaces_une_seule_zone_test
  on public.workspaces ((true)) where est_zone_test;


-- ── Qui y a droit ─────────────────────────────────────────────────────────

create table if not exists public.acces_zone_test (
  user_id uuid primary key references auth.users(id) on delete cascade,
  /* L'espace à rejoindre en sortant. Mémorisé plutôt que deviné. */
  espace_principal uuid not null references public.workspaces(id),
  accorde_le timestamptz not null default now()
);

comment on table public.acces_zone_test is
  'Comptes autorisés à basculer dans l''espace de données fictives. Le rôle admin ne suffit pas.';

alter table public.acces_zone_test enable row level security;

-- Chacun ne voit que sa propre autorisation : la liste des personnes
-- autorisées n'a pas à être lisible par les autres.
drop policy if exists "select_acces_zone_test" on public.acces_zone_test;
create policy "select_acces_zone_test"
on public.acces_zone_test for select to authenticated
using (user_id = auth.uid());

-- Aucune politique d'écriture : la liste se tient à la main, en SQL.

create or replace function public.autorise_zone_test()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.acces_zone_test where user_id = auth.uid());
$$;

grant execute on function public.autorise_zone_test() to authenticated;


-- ── L'espace de test et son contenu ───────────────────────────────────────

/*
  Tout est reconnaissable au premier regard : les noms commencent par
  « TEST », les adresses e-mail sont en `.test` (domaine réservé par la
  RFC 2606, donc non routable), les numéros sont dans la plage fictive
  06 39 98, et les plaques suivent `TS-0xx-TS`.

  Personne de réel ne peut être joint depuis cet espace, même si une action
  partait par erreur.
*/
/*
  Sortir les comptes de l'espace de test avant de le supprimer.

  `profiles.workspace_id` est en `on delete cascade`, comme les 43 autres
  tables. Supprimer l'espace pendant qu'un compte s'y trouve effacerait donc
  son profil, et avec lui son acces au CRM. Cette fonction est appelee avant
  chaque suppression, sans exception.
*/
create or replace function public.evacuer_zone_test()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles p
     set workspace_id = a.espace_principal
    from public.acces_zone_test a
   where p.id = a.user_id
     and p.workspace_id in (select id from public.workspaces where est_zone_test);
$$;

revoke all on function public.evacuer_zone_test() from public, anon;


create or replace function public.seed_zone_test()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  w uuid;
  c_dupont uuid; c_bernard uuid; c_leroy uuid; c_moreau uuid;
  c_garcia uuid; c_nguyen uuid; c_petit uuid; c_fabre uuid;
  l_nouveau uuid; l_nrp uuid; l_docs uuid; l_planifie uuid;
  l_converti uuid; l_perdu uuid; l_encours uuid; l_sav uuid;
  d_incomplet uuid; d_planifie uuid; d_encours uuid; d_termine uuid; d_sav uuid;
  f_payee uuid; f_partielle uuid;
begin
  if not public.autorise_zone_test() then
    raise exception 'Zone de test : accès refusé';
  end if;

  -- Repartir d'un espace propre. Le drapeau garantit qu'on ne vise que lui,
  -- et l'evacuation prealable evite d'emporter un profil dans la cascade.
  perform public.evacuer_zone_test();
  delete from public.workspaces where est_zone_test;

  insert into public.workspaces (name, slug, est_zone_test)
  values ('ZONE DE TEST — données fictives', 'zone-test', true)
  returning id into w;

  -- ---- Clients ----
  insert into public.contacts (workspace_id, first_name, last_name, phone, email,
                               address, postal_code, city, notes)
  values
    (w, 'TEST Camille', 'Dupont',  '0639987601', 'camille.dupont@example.test',
     '12 Rue de Lens', '59000', 'Lille', 'Données fictives'),
    (w, 'TEST Olivier', 'Bernard', '0639987602', 'olivier.bernard@example.test',
     '5 Avenue de la Marne', '59290', 'Wasquehal', 'Données fictives'),
    (w, 'TEST Sophie',  'Leroy',   '0639987603', 'sophie.leroy@example.test',
     '7 Rue Jean Jaurès', '59170', 'Croix', 'Données fictives'),
    (w, 'TEST Marc',    'Moreau',  '0639987604', 'marc.moreau@example.test',
     '45 Rue de Tournai', '59200', 'Tourcoing', 'Données fictives'),
    (w, 'TEST Inès',    'Garcia',  '0639987605', 'ines.garcia@example.test',
     '2 Place du Général de Gaulle', '59000', 'Lille', 'Données fictives'),
    (w, 'TEST Thomas',  'Nguyen',  '0639987606', 'thomas.nguyen@example.test',
     '18 Rue Esquermoise', '59000', 'Lille', 'Données fictives'),
    (w, 'TEST Julie',   'Petit',   '0639987607', 'julie.petit@example.test',
     '14 Rue de Paris', '59100', 'Roubaix', 'Données fictives'),
    (w, 'TEST Karim',   'Fabre',   '0639987608', 'karim.fabre@example.test',
     '22 Boulevard de la Liberté', '59000', 'Lille', 'Données fictives');

  select id into c_dupont  from public.contacts where workspace_id = w and last_name = 'Dupont';
  select id into c_bernard from public.contacts where workspace_id = w and last_name = 'Bernard';
  select id into c_leroy   from public.contacts where workspace_id = w and last_name = 'Leroy';
  select id into c_moreau  from public.contacts where workspace_id = w and last_name = 'Moreau';
  select id into c_garcia  from public.contacts where workspace_id = w and last_name = 'Garcia';
  select id into c_nguyen  from public.contacts where workspace_id = w and last_name = 'Nguyen';
  select id into c_petit   from public.contacts where workspace_id = w and last_name = 'Petit';
  select id into c_fabre   from public.contacts where workspace_id = w and last_name = 'Fabre';

  -- ---- Véhicules ----
  insert into public.vehicles (workspace_id, contact_id, registration, make, model, year)
  values
    (w, c_dupont,  'TS-001-TS', 'Renault',   'Clio',    2019),
    (w, c_bernard, 'TS-002-TS', 'Peugeot',   '208',     2021),
    (w, c_leroy,   'TS-003-TS', 'Renault',   'Scénic',  2017),
    (w, c_moreau,  'TS-004-TS', 'Citroën',   'C3',      2020),
    (w, c_garcia,  'TS-005-TS', 'Volkswagen','Golf',    2022),
    (w, c_nguyen,  'TS-006-TS', 'Dacia',     'Sandero', 2018),
    (w, c_petit,   'TS-007-TS', 'Renault',   'Kangoo',  2016),
    (w, c_fabre,   'TS-008-TS', 'Toyota',    'Yaris',   2023);

  -- ---- Interventions (leads), une par étape du parcours ----
  insert into public.leads (workspace_id, contact_id, first_name, last_name, phone, email,
                            address, postal_code, city, vehicle_registration, vehicle_make,
                            vehicle_model, glass_type, insurance, source, status, received_at, offer)
  values
    (w, c_dupont,  'TEST Camille', 'Dupont',  '0639987601', 'camille.dupont@example.test',
     '12 Rue de Lens', '59000', 'Lille', 'TS-001-TS', 'Renault', 'Clio',
     'impact', 'MAIF', 'meta', 'new', now() - interval '40 minutes', null),
    (w, c_bernard, 'TEST Olivier', 'Bernard', '0639987602', 'olivier.bernard@example.test',
     '5 Avenue de la Marne', '59290', 'Wasquehal', 'TS-002-TS', 'Peugeot', '208',
     'pare_brise', 'AXA', 'meta', 'nrp', now() - interval '3 days', null),
    (w, c_leroy,   'TEST Sophie',  'Leroy',   '0639987603', 'sophie.leroy@example.test',
     '7 Rue Jean Jaurès', '59170', 'Croix', 'TS-003-TS', 'Renault', 'Scénic',
     'lunette_arriere', 'Macif', 'google_ads', 'documents_requested', now() - interval '2 days', 'Plein de lave-glace'),
    (w, c_moreau,  'TEST Marc',    'Moreau',  '0639987604', 'marc.moreau@example.test',
     '45 Rue de Tournai', '59200', 'Tourcoing', 'TS-004-TS', 'Citroën', 'C3',
     'pare_brise', 'Groupama', 'manual', 'appointment_scheduled', now() - interval '5 days', 'Nettoyage intérieur'),
    (w, c_garcia,  'TEST Inès',    'Garcia',  '0639987605', 'ines.garcia@example.test',
     '2 Place du Général de Gaulle', '59000', 'Lille', 'TS-005-TS', 'Volkswagen', 'Golf',
     'pare_brise', 'Allianz', 'meta', 'converted', now() - interval '21 days', 'Balai d''essuie-glace'),
    (w, c_nguyen,  'TEST Thomas',  'Nguyen',  '0639987606', 'thomas.nguyen@example.test',
     '18 Rue Esquermoise', '59000', 'Lille', 'TS-006-TS', 'Dacia', 'Sandero',
     'glace_laterale', null, 'webhook', 'lost', now() - interval '14 days', null),
    (w, c_petit,   'TEST Julie',   'Petit',   '0639987607', 'julie.petit@example.test',
     '14 Rue de Paris', '59100', 'Roubaix', 'TS-007-TS', 'Renault', 'Kangoo',
     'pare_brise', 'MAIF', 'manual', 'documents_received', now() - interval '1 day', null),
    (w, c_fabre,   'TEST Karim',   'Fabre',   '0639987608', 'karim.fabre@example.test',
     '22 Boulevard de la Liberté', '59000', 'Lille', 'TS-008-TS', 'Toyota', 'Yaris',
     'pare_brise', 'Matmut', 'meta', 'converted', now() - interval '45 days', null);

  select id into l_nouveau  from public.leads where workspace_id = w and last_name = 'Dupont';
  select id into l_nrp      from public.leads where workspace_id = w and last_name = 'Bernard';
  select id into l_docs     from public.leads where workspace_id = w and last_name = 'Leroy';
  select id into l_planifie from public.leads where workspace_id = w and last_name = 'Moreau';
  select id into l_converti from public.leads where workspace_id = w and last_name = 'Garcia';
  select id into l_perdu    from public.leads where workspace_id = w and last_name = 'Nguyen';
  select id into l_encours  from public.leads where workspace_id = w and last_name = 'Petit';
  select id into l_sav      from public.leads where workspace_id = w and last_name = 'Fabre';

  -- ---- Dossiers vitrage ----
  insert into public.windscreen_cases (workspace_id, case_number, lead_id, contact_id, status,
                                       intervention_address, intervention_type, appointment_date,
                                       glass_type, has_sensors, has_adas_camera,
                                       insurance_contract_number, franchise_amount, offer, internal_notes)
  values
    (w, 'TEST-D001', l_docs, c_leroy, 'documents_pending',
     '7 Rue Jean Jaurès 59170 Croix', 'home', null,
     'lunette_arriere', false, false, 'CT-TEST-001', 0, 'Plein de lave-glace',
     'Dossier incomplet : carte grise manquante'),
    (w, 'TEST-D002', l_planifie, c_moreau, 'appointment_scheduled',
     '45 Rue de Tournai 59200 Tourcoing', 'home', now() + interval '2 days',
     'pare_brise', true, true, 'CT-TEST-002', 0, 'Nettoyage intérieur',
     'Recalibrage caméra à prévoir'),
    (w, 'TEST-D003', l_encours, c_petit, 'glass_ordered',
     '14 Rue de Paris 59100 Roubaix', 'workshop', now() + interval '5 days',
     'pare_brise', false, false, 'CT-TEST-003', 120, null,
     'Vitrage commandé chez le fournisseur'),
    (w, 'TEST-D004', l_converti, c_garcia, 'payment_received',
     '2 Place du Général de Gaulle 59000 Lille', 'home', now() - interval '14 days',
     'pare_brise', true, false, 'CT-TEST-004', 0, 'Balai d''essuie-glace',
     'Intervention terminée, réglée'),
    (w, 'TEST-D005', l_sav, c_fabre, 'sav',
     '22 Boulevard de la Liberté 59000 Lille', 'home', now() - interval '38 days',
     'pare_brise', false, false, 'CT-TEST-005', 0, null,
     'Infiltration signalée par le client');

  select id into d_incomplet from public.windscreen_cases where workspace_id = w and case_number = 'TEST-D001';
  select id into d_planifie  from public.windscreen_cases where workspace_id = w and case_number = 'TEST-D002';
  select id into d_encours   from public.windscreen_cases where workspace_id = w and case_number = 'TEST-D003';
  select id into d_termine   from public.windscreen_cases where workspace_id = w and case_number = 'TEST-D004';
  select id into d_sav       from public.windscreen_cases where workspace_id = w and case_number = 'TEST-D005';

  -- ---- Pièces du dossier : une checklist incomplète, une complète ----
  insert into public.case_documents (workspace_id, case_id, type, label, uploaded, uploaded_at)
  values
    (w, d_incomplet, 'registration',   'Carte grise',            false, null),
    (w, d_incomplet, 'insurance_cert', 'Attestation d''assurance', true, now() - interval '1 day'),
    (w, d_planifie,  'registration',   'Carte grise',            true,  now() - interval '4 days'),
    (w, d_planifie,  'insurance_cert', 'Attestation d''assurance', true, now() - interval '4 days'),
    (w, d_termine,   'registration',   'Carte grise',            true,  now() - interval '20 days'),
    (w, d_termine,   'insurance_cert', 'Attestation d''assurance', true, now() - interval '20 days'),
    (w, d_termine,   'photo_windscreen', 'Photo du vitrage posé', true, now() - interval '14 days');

  -- ---- Rendez-vous : passé, aujourd'hui, à venir, annulé ----
  insert into public.appointments (workspace_id, lead_id, contact_id, case_id, title, description,
                                   start_time, end_time, address, latitude, longitude, geo_precision,
                                   type, status)
  values
    (w, l_converti, c_garcia, d_termine,
     'Intervention - TEST Inès Garcia (TS-005-TS)', 'Remplacement pare-brise',
     now() - interval '14 days' + interval '9 hours', now() - interval '14 days' + interval '11 hours',
     '2 Place du Général de Gaulle 59000 Lille', 50.63694, 3.06333, 'exact',
     'intervention', 'completed'),
    (w, l_planifie, c_moreau, d_planifie,
     'Intervention - TEST Marc Moreau (TS-004-TS)', 'Pare-brise avec recalibrage caméra',
     date_trunc('day', now()) + interval '14 hours', date_trunc('day', now()) + interval '16 hours',
     '45 Rue de Tournai 59200 Tourcoing', 50.72391, 3.16120, 'exact',
     'intervention', 'confirmed'),
    (w, l_encours, c_petit, d_encours,
     'Intervention - TEST Julie Petit (TS-007-TS)', 'Pose en atelier',
     now() + interval '5 days' + interval '8 hours', now() + interval '5 days' + interval '10 hours',
     '14 Rue de Paris 59100 Roubaix', 50.69187, 3.17456, 'exact',
     'intervention', 'scheduled'),
    (w, l_nrp, c_bernard, null,
     'Intervention - TEST Olivier Bernard (TS-002-TS)', 'Annulé par le client',
     now() - interval '2 days' + interval '10 hours', now() - interval '2 days' + interval '11 hours',
     '5 Avenue de la Marne 59290 Wasquehal', 50.67420, 3.13120, 'exact',
     'intervention', 'cancelled'),
    (w, l_sav, c_fabre, d_sav,
     'SAV - TEST Karim Fabre (TS-008-TS)', 'Contrôle infiltration',
     now() + interval '1 day' + interval '15 hours', now() + interval '1 day' + interval '16 hours',
     '22 Boulevard de la Liberté 59000 Lille', 50.63250, 3.06580, 'exact',
     'intervention', 'scheduled');

  -- ---- Devis ----
  insert into public.quotes (workspace_id, quote_number, contact_id, case_id,
                             status, amount_ht, tva_rate, amount_ttc, franchise_amount)
  values
    (w, 'TEST-DV001', c_petit,  d_encours,  'sent',     450.00, 20, 540.00, 120),
    (w, 'TEST-DV002', c_moreau, d_planifie, 'accepted', 741.67, 20, 890.00, 0);

  -- ---- Factures et règlements ----
  /* Reglee, partiellement reglee, en retard : les trois etats qu'on veut
     pouvoir distinguer d'un coup d'oeil sur un tableau de bord. */
  insert into public.invoices (workspace_id, invoice_number, contact_id, case_id, status,
                               amount_ht, tva_rate, amount_ttc, amount_paid, remaining_amount,
                               franchise_amount, issue_date, due_date, payment_date)
  values
    (w, 'TEST-F001', c_garcia, d_termine,  'paid',
     741.67, 20, 890.00, 890.00,   0.00,   0, (now() - interval '14 days')::date,
     (now() - interval '1 day')::date,  (now() - interval '13 days')::date),
    (w, 'TEST-F002', c_fabre,  d_sav,      'partial',
     533.33, 20, 640.00, 300.00, 340.00,   0, (now() - interval '36 days')::date,
     (now() - interval '6 days')::date, null),
    (w, 'TEST-F003', c_moreau, d_planifie, 'overdue',
     350.00, 20, 420.00,   0.00, 420.00, 120, (now() - interval '50 days')::date,
     (now() - interval '20 days')::date, null);

  select id into f_payee     from public.invoices where workspace_id = w and invoice_number = 'TEST-F001';
  select id into f_partielle from public.invoices where workspace_id = w and invoice_number = 'TEST-F002';

  insert into public.payments (workspace_id, invoice_id, case_id, amount, payment_method,
                              payment_date, reference)
  values
    (w, f_payee,     d_termine, 890.00, 'card',     (now() - interval '13 days')::date, 'TEST-REG-001'),
    (w, f_partielle, d_sav,     300.00, 'transfer', (now() - interval '30 days')::date, 'TEST-REG-002');

  -- ---- Service après-vente ----
  insert into public.after_sales_cases (workspace_id, case_id, contact_id, status,
                                       reason, description, resolved_at)
  values
    (w, d_sav, c_fabre, 'in_progress', 'Infiltration',
     'Infiltration côté passager signalée trois semaines après la pose.', null),
    (w, d_termine, c_garcia, 'resolved', 'Bruit de vent',
     'Bruit de vent signalé puis résolu au premier passage.', now() - interval '8 days');

  -- ---- Suivi : tâches et notes ----
  insert into public.tasks (workspace_id, lead_id, contact_id, title, description,
                            type, priority, status, due_at)
  values
    (w, l_nouveau, c_dupont, 'Rappeler TEST Camille Dupont', 'Premier appel après réception du lead',
     'call', 'urgent', 'pending', now() + interval '1 hour'),
    (w, l_nrp, c_bernard, 'Relancer TEST Olivier Bernard', 'Troisième tentative, sans réponse',
     'call', 'high', 'pending', now() + interval '2 hours'),
    (w, l_docs, c_leroy, 'Relancer pour la carte grise', 'Document manquant au dossier',
     'document', 'normal', 'in_progress', now() + interval '1 day'),
    (w, l_converti, c_garcia, 'Envoyer le cadeau', 'Balai d''essuie-glace promis',
     'other', 'low', 'done', now() - interval '12 days');

  insert into public.notes (workspace_id, lead_id, contact_id, content)
  values
    (w, l_nrp, c_bernard, 'Messagerie à chaque appel. Essayer en fin de journée.'),
    (w, l_docs, c_leroy, 'Cliente d''accord sur le principe, attend sa carte grise.'),
    (w, l_sav, c_fabre, 'Infiltration constatée sur photo. Repasse jeudi.');

  return w;
end;
$$;

revoke all on function public.seed_zone_test() from public, anon;
grant execute on function public.seed_zone_test() to authenticated;


-- ── Entrer, sortir ────────────────────────────────────────────────────────

/*
  Bascule l'espace de travail du compte appelant. `vers_test = false` ramène à
  l'espace mémorisé à l'octroi du droit : on ne devine pas le retour, on le
  relit.
*/
create or replace function public.basculer_zone_test(vers_test boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cible uuid;
begin
  if not public.autorise_zone_test() then
    raise exception 'Zone de test : accès refusé';
  end if;

  if vers_test then
    select id into cible from public.workspaces where est_zone_test;
    if cible is null then
      cible := public.seed_zone_test();
    end if;
  else
    select espace_principal into cible from public.acces_zone_test where user_id = auth.uid();
  end if;

  if cible is null then
    raise exception 'Zone de test : espace introuvable';
  end if;

  update public.profiles set workspace_id = cible where id = auth.uid();
  return cible;
end;
$$;

revoke all on function public.basculer_zone_test(boolean) from public, anon;
grant execute on function public.basculer_zone_test(boolean) to authenticated;


/*
  Supprime l'espace de test et tout ce qu'il contient, par cascade.

  Les comptes sont d'abord ramenés dans leur espace principal : `profiles`
  est en cascade comme le reste, donc les y laisser effacerait leur profil.
*/
create or replace function public.vider_zone_test()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  supprimes integer;
begin
  if not public.autorise_zone_test() then
    raise exception 'Zone de test : accès refusé';
  end if;

  perform public.evacuer_zone_test();

  -- Le drapeau est la seule cible possible. L'espace réel ne le porte pas.
  delete from public.workspaces where est_zone_test;
  get diagnostics supprimes = row_count;

  return supprimes;
end;
$$;

revoke all on function public.vider_zone_test() from public, anon;
grant execute on function public.vider_zone_test() to authenticated;


-- ── Le seul compte autorisé, pour l'instant ───────────────────────────────

insert into public.acces_zone_test (user_id, espace_principal)
select u.id, p.workspace_id
  from auth.users u
  join public.profiles p on p.id = u.id
 where u.email = 'contact@relaisparebrise.fr'
   and p.role = 'admin'
on conflict (user_id) do nothing;

commit;
