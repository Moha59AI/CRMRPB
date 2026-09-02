/*
# Procédures assureurs

## D'où vient cette base

Le module vitrage de l'ancien Perfex portait 51 compagnies documentées depuis
le Book Assurance 2022 : franchise, ligne sinistre, et surtout la marche à
suivre avant, pendant et après le rendez-vous. C'est le savoir métier de
l'atelier, et il vivait dans un fichier PHP que le nouveau CRM ignorait.

## Ce que cette base corrige dans mon modèle

**La franchise n'est pas un nombre.** J'avais prévu `default_franchise
numeric`. Or les valeurs réelles sont « 0 € ou 90 € », « 25% du montant des
travaux », « BG = 0 € / BGA ou BGF = 38 € / BGB = 50 € ». Réduire ça à un
nombre, c'est annoncer au client un montant faux. `franchise_texte` porte la
règle telle qu'elle est écrite sur la carte verte ; `default_franchise` reste
pour les rares cas où un seul montant s'applique.

**`expertise_obligatoire` et `client_present` sont des contraintes de
planification, pas de la documentation.** Chez Avanssur, Constatel et
Pacifica, l'expertise immobilise le véhicule à la journée avec un rendez-vous
à 8h30. Le conseiller doit le savoir avant de proposer un créneau de deux
heures, pas après.

**`client_present`** dit s'il faut le client en ligne pour obtenir le numéro
de sinistre. Le découvrir le jour du rendez-vous fait reporter l'intervention.

## Les trois moments

`avant_rdv`, `jour_rdv` et `apres_rdv` suivent le déroulé réel d'un dossier.
Les fondre en un seul champ obligerait à relire tout le texte pour retrouver
l'action du moment.

## L'appariement

`tags` permet de retrouver la compagnie depuis `leads.insurance`, qui est du
texte libre : « credit mutuel » doit mener à Constatel, « direct assurance » à
Avanssur.
*/

alter table public.insurers
  add column if not exists franchise_texte text,
  add column if not exists avant_rdv text,
  add column if not exists jour_rdv text,
  add column if not exists apres_rdv text,
  add column if not exists client_present boolean not null default false,
  add column if not exists expertise_obligatoire boolean not null default false,
  add column if not exists tags text[] not null default '{}';

comment on column public.insurers.franchise_texte is
  'Regle de franchise telle qu''ecrite sur la carte verte. Un nombre seul serait faux : « 25% du montant » ou « BG = 0 / BGB = 50 » ne s''y reduisent pas.';
comment on column public.insurers.expertise_obligatoire is
  'true immobilise le vehicule a la journee, rendez-vous a 8h30. Contrainte de planification, pas simple information.';
comment on column public.insurers.client_present is
  'true si le client doit etre en ligne pour obtenir le numero de sinistre.';
comment on column public.insurers.tags is
  'Variantes de nom, pour retrouver la compagnie depuis le texte libre de leads.insurance.';

create index if not exists insurers_tags_idx on public.insurers using gin (tags);


-- ============ RECHERCHE PAR NOM LIBRE ============
-- `leads.insurance` est saisi a la main : « credit mutuel » doit mener a
-- Constatel, « direct assurance » a Avanssur.

create or replace function public.trouver_assureur(p_recherche text)
returns setof public.insurers
language sql
stable
security invoker
set search_path = public
as $$
  with q as (select lower(btrim(coalesce(p_recherche, ''))) as terme)
  select i.* from insurers i, q
  where q.terme <> ''
    and i.workspace_id = public.get_workspace_id()
    and i.actif
    and (
      -- Correspondance exacte sur un tag d'abord, comme le faisait l'ancien
      -- module : « ald » ne doit pas ramener « allianz ».
      lower(i.name) = q.terme
      or exists (select 1 from unnest(i.tags) t where lower(t) = q.terme)
      or exists (select 1 from unnest(i.tags) t
                 where q.terme like '%' || lower(t) || '%'
                    or lower(t) like '%' || q.terme || '%')
    )
  order by
    (lower(i.name) = q.terme) desc,
    (exists (select 1 from unnest(i.tags) t where lower(t) = q.terme)) desc,
    i.name
  limit 5;
$$;

grant execute on function public.trouver_assureur(text) to authenticated;


-- ============ SEMIS DES 51 COMPAGNIES ============
-- Reference metier issue du Book Assurance 2022. `on conflict do nothing`
-- protege les modifications faites par l'atelier : une compagnie deja
-- presente n'est jamais ecrasee par le semis.

create or replace function public.semer_assureurs_defaut(p_workspace uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_avant integer;
  v_apres integer;
begin
  select count(*) into v_avant from insurers where workspace_id = p_workspace;

  insert into insurers (
    workspace_id, name, franchise_texte, phone, email,
    avant_rdv, jour_rdv, apres_rdv, client_present, expertise_obligatoire, tags
  )
  select p_workspace, d.* from (values
    ('AGPM', '0 € ou 90 €', '02.41.88.61.24', 'sinistre.auto.pro@agpm.fr', 'Photos carte verte & carte grise via mail centre', 'Expert — déclaration avant RDV', 'Facture par courrier ou mail : sinistre.auto.pro@agpm.fr', false, true, array['agpm']::text[]),
    ('ALD Automotive / Sogessur', 'G = 20% facture (max 80 €) / O = 0 €', '09.69.32.73.26 (ALD) / 08.25.85.85.85 (Sogessur)', 'gestion.sinistres@aldautomotive.com', 'Photos carte verte & carte grise. Si ALD → dossier G1 au nom ALD. Si Sogessur → dossier G1 au nom du client', 'ALD : accord verbal. Sogessur : déclaration + n° sinistre avec client (10 min avant RDV)', 'ALD : gestion.sinistres@aldautomotive.com — Sogessur : sogessur.brisdeglace@socgen.com', true, false, array['ald', 'sogessur', 'temsys', 'loueur']::text[]),
    ('Allianz', '0 / 49 / 59 / 69 / 79 / 89 / 99 € ou + (selon carte verte)', '09.78.97.80.90 ou 09.78.97.80.99', 'monsinistre@allianz.fr', 'Photos carte verte & carte grise. Devis à envoyer 72h avant à l''agent Allianz + siège', 'Déclaration + n° sinistre avec le client (10 min avant, sauf 8h30 ou 14h)', 'Facture : monsinistre@allianz.fr', true, false, array['allianz']::text[]),
    ('AON (Loueur)', 'Aléatoire selon carte verte', '01.73.10.10.19 (particulier) / 01.73.10.20.26 (flotte)', 'sinistreparticulier3@aon.com', 'Photos carte verte & carte grise', 'Déclaration + n° accord avec le client', 'sinistreparticulier3@aon.com ou sinistreparticulier2@aon.com', true, false, array['aon', 'loueur']::text[]),
    ('April', '0 / 80 / 90 / 100 / 110 / 150 / 240 € (selon carte verte)', 'Via agent April', 'dt-service-sinistre@april.com / indemnisation@april-partenaires.fr', 'Suivre le process de "délivrée par". Accord par mail sans client auprès de l''agent April', 'Accord par mail agent April sans le client', 'April Mon Assu : dt-service-sinistre@april.com — April Partenaires : indemnisation@april-partenaires.fr', false, false, array['april']::text[]),
    ('Areas', 'BG(51) = 51 € / BGS(55) = 55 €', '05.49.18.64.78', 'Via agent', 'Photos carte verte & carte grise', 'Déclaration + n° sinistre avec le client (10 min avant, sauf 8h30 ou 14h)', 'Facture à envoyer à l''agent', true, false, array['areas']::text[]),
    ('Arval (Loueur)', null, '01.57.69.61.94', 'sinistre@arval.fr', '⚠️ NE PAS INTERVENIR sans n° de sinistre ou confirmation mail. Photos carte verte & carte grise', 'Déclaration + n° sinistre avec le client (10 min avant, sauf 8h30 ou 14h)', 'sinistre@arval.fr', true, false, array['arval', 'loueur']::text[]),
    ('Assu 2000', '0 €', '01.48.10.15.00', 'assu2000@assu2000.com (objet : immatriculation)', 'Photos carte verte & carte grise', 'Accord verbal SANS le client', 'assu2000@assu2000.com', false, false, array['assu2000', 'assu 2000']::text[]),
    ('Avanssur / Direct Assurance / BNP', '25% du montant des travaux ou sans franchise', null, 'contact.sinistre@avanssur.fr / contact.sinistre@directassurance.fr', '⚠️ EXPERTISE OBLIGATOIRE. Déclaration → photo vitrage + devis par mail → attendre retour expert avant travaux', 'Immobilisation véhicule à la journée — RDV à 8h30', 'contact.sinistre@avanssur.fr', true, true, array['avanssur', 'direct assurance', 'directassurance', 'bnp']::text[]),
    ('Aviva', '0 € ou 15% du montant ou pas de BDG', 'Via agent Aviva', 'Via courtier (mail sur carte verte)', 'Photos carte verte & carte grise', 'Accord verbal avec agent Aviva', 'Envoi déclaration BDG + facture au courtier', false, false, array['aviva']::text[]),
    ('AXA', '0 € / 25% montant (max 120 €) / 55 € + 10% dommages (plafond 210 €)', '09.70.82.00.18', 'service.expertisebdg@axa.fr / service.autocse@axa.fr', 'Photos carte verte & carte grise. Devis à envoyer à l''agent AXA + siège', '⚠️ Déclaration manuscrite OBLIGATOIRE + n° sinistre avec le client (10 min avant). Si sinistre J-5 : travaux OK sans attendre retour. Si sinistre J+5 : client déclare d''abord.', 'Contrat en "04" → service.expertisebdg@axa.fr — Autres → service.autocse@axa.fr', true, false, array['axa']::text[]),
    ('Axeria', 'Aléatoire selon carte verte', '04.27.46.14.00', 'indemnisationauto@axeria-iard.fr', 'Photos carte verte & carte grise', 'Accord verbal avec le client', 'indemnisationauto@axeria-iard.fr — Courrier : 27 rue Maurice Flandin CS 53713 69444 Lyon Cedex 3', true, false, array['axeria']::text[]),
    ('BPCE / Banque Populaire / Caisse d''Épargne', '0 / 50 / 60 / 70 / 80 € (selon carte verte)', '09.69.36.45.45 (BPCE Assu)', 'sinistres@natixis.com (Assu) / service-client.auto@aismail.fr (IARD)', 'Photos carte verte & carte grise', 'BPCE Assu : déclaration + n° sinistre avec client. BPCE IARD : pas de numéro ni déclaration', 'BPCE Assu : sinistres@natixis.com — BPCE IARD : service-client.auto@aismail.fr', true, false, array['bpce', 'banque populaire', 'caisse epargne', 'caisse d''epargne']::text[]),
    ('Calypso / Allsecur', '0 à 150 € (selon carte verte)', '09.78.97.80.00', 'votre_sinistre@calypso-assurance.fr / votresinistre@allsecur.fr', 'Photos carte verte & carte grise. Devis à envoyer si Calypso Allsecur', 'Accord verbal SANS le client', 'Calypso : votre_sinistre@calypso-assurance.fr — Allsecur : votresinistre@allsecur.fr', false, false, array['calypso', 'allsecur']::text[]),
    ('Carma / Carrefour Assurance', '0 / 60 € ou +', '09.74.75.74.74', 'autosolutions@ais.assurance.carrefour.fr', 'Photos carte verte & carte grise', 'Déclaration + n° sinistre SANS le client', 'autosolutions@ais.assurance.carrefour.fr', false, false, array['carma', 'carrefour']::text[]),
    ('Constatel / ACM (Crédit Mutuel / CIC)', '0 / 50 / 100 €', '03.88.14.00.44', 'constatelauto@acm.fr (objet : n° sinistre)', '⚠️ EXPERTISE OBLIGATOIRE. Photos carte verte, carte grise et CT. Déclaration + n° sinistre + mandat expert avec le client', 'Immobilisation véhicule à la journée — RDV à 8h30', 'constatelauto@acm.fr', true, true, array['constatel', 'acm', 'credit mutuel', 'cic', 'crédit mutuel']::text[]),
    ('Euro Assurance', '80 / 100 / 150 € ou +', '01.49.15.74.00', 'info@eamail.fr', 'Photos carte verte & carte grise', 'Déclaration + n° sinistre avec le client (10 min avant, sauf 8h30 ou 14h)', 'Facture + déclaration BDG papier par courrier ou : info@eamail.fr — 6 rue Gracchus Baboeuf 93130 Noisy Le Sec', true, false, array['euro assurance', 'euroassurance']::text[]),
    ('Eurofil', '0 / 60 / 65 / 70 / 80 / 85 / 90 / 95 / 100 / 110 / 130 €', '01.71.25.06.25', 'sinistre.bal@aviva.fr', 'Photos carte verte & carte grise', 'Déclaration + n° sinistre avec le client (10 min avant, sauf 8h30 ou 14h)', 'sinistre.bal@aviva.fr — Courrier : Eurofil 76823 Mont Saint Aignan Cedex', true, false, array['eurofil']::text[]),
    ('Fatec (Loueur)', '0 €', '08.26.10.40.60', 'envoifacture@fatec.pro', 'Photos carte verte & carte grise', 'Déclaration + n° sinistre avec le client (10 min avant, sauf 8h30 ou 14h)', 'envoifacture@fatec.pro', true, false, array['fatec', 'loueur']::text[]),
    ('GAN', '0 / 80 / 100 €', 'Via agent GAN', 'materiel.lille@gan.fr (Nord) / materiel.marseille@gan.fr (Sud)', 'Photos carte verte & carte grise. Si pas de mention BDG → contacter agent', 'Pas de déclaration', 'Nord : materiel.lille@gan.fr — Sud : materiel.marseille@gan.fr', false, false, array['gan']::text[]),
    ('Generali', '0 à 104 € max (selon carte verte)', 'Via agent', 'indemnisation.auto.cnr@generali.fr', 'Photos carte verte & carte grise', 'Pas de déclaration', 'indemnisation.auto.cnr@generali.fr', false, false, array['generali']::text[]),
    ('GMF', '0 / 45 / 53 / 60 / 68 €', '09.70.80.98.09', 'indemnisation.auto@gmf.fr', 'Photos carte verte & carte grise. Expertise possible sur le centre de Mulhouse', 'Déclaration + n° sinistre avec le client (10 min avant, sauf 8h30 ou 14h)', 'indemnisation.auto@gmf.fr', true, false, array['gmf']::text[]),
    ('Gras Savoye (Courtier)', 'Aléatoire', 'N° sur la carte verte', 'sinistres.gsae@grassavoye.com', 'Photos carte verte & carte grise', 'Déclaration + n° sinistre avec le client (10 min avant, sauf 8h30 ou 14h)', 'sinistres.gsae@grassavoye.com — Courrier : Immeuble quai 33.33 quai de Dion-Bouton 92814 Puteaux Cedex', true, false, array['gras savoye', 'grassavoye']::text[]),
    ('Groupama', '0 / 45 / 80 €', 'N° dans le contrat ou espace client (selon région)', 'Selon région (voir détail)', 'Photos carte verte & carte grise. ⚠️ N° de sinistre OBLIGATOIRE', 'Déclaration au n° dans le contrat. N° sinistre obligatoire', 'Nord-Est : auto@groupama-ne.fr — Rhône-Alpes : auto@groupama-ra.com — Centre-Manche : bdgauto@groupama-cm.fr — Méditerranée : sam@groupama-med.com — Paris VdL : sinistresautomobiles@groupama-pvl.fr — Grand Est : autocourtage@groupama-ge.fr', true, false, array['groupama']::text[]),
    ('JP Labalette (Courtier)', 'Aléatoire', '01.40.73.74.80', 'sinistre@labalette.fr', 'Photos carte verte & carte grise. Devis à envoyer 48h avant au siège', 'Déclaration + n° sinistre avec le client (10 min avant, sauf 8h30 ou 14h)', 'sinistre@labalette.fr — 39/41 rue Washington 75008 Paris', true, false, array['labalette', 'jp labalette']::text[]),
    ('La Banque Postale', '0 / 58 / 74 / 78 / 82 / 90 €', '02.28.09.43.83', 'service.sinistres@labanquepostale-assurances-iard.fr (objet : n° sinistre)', 'Photos carte verte & carte grise', 'Déclaration + n° sinistre avec le client (10 min avant, sauf 8h30 ou 14h)', 'service.sinistres@labanquepostale-assurances-iard.fr', true, false, array['banque postale', 'la banque postale']::text[]),
    ('LeasePlan (Loueur)', null, '01.56.84.10.10', 'information@leaseplan.fr', 'Photos carte verte & carte grise', 'Déclaration + n° sinistre avec le client (10 min avant, sauf 8h30 ou 14h)', 'information@leaseplan.fr', true, false, array['leaseplan', 'lease plan', 'loueur']::text[]),
    ('Leocare', null, '09.73.45.40.38', 'sinistres@leocare.fr', 'Photos carte verte & carte grise. CT souvent demandé. Photo vitrage + bon de livraison obligatoire', 'Déclaration + n° sinistre obligatoire — application mobile ou tél. ⚠️ CT souvent requis', 'sinistres@leocare.fr', true, false, array['leocare']::text[]),
    ('MAAF', 'BDG 2011 avec franchise : 20% (min 15€ / max 75€) — sans franchise : 0 € — Pas de mention = pas de BDG', '09.69.39.00.91', 'service-client.auto@maaf.fr (objet : "bris de glace")', 'Photos carte verte & carte grise', 'Pas de déclaration', 'service-client.auto@maaf.fr', false, false, array['maaf']::text[]),
    ('MACIF', '0 / 60 / 80 / 100 €', '09.69.39.49.39', 'relationgestion@macif.fr', 'Photos carte verte & carte grise', 'Accord verbal SANS le client', 'relationgestion@macif.fr', false, false, array['macif']::text[]),
    ('MACSF', 'BG = 0 € / BGA ou BGF = 38 € / BGB = 50 € / BGC = 75 €', null, 'sinauto@macsf.fr', 'Photos carte verte & carte grise', 'Pas de déclaration', 'sinauto@macsf.fr — Courrier : 10 cour du triangle de l''arche 92919 La Défense Cedex', false, false, array['macsf']::text[]),
    ('MAIF', 'L = 0 € / S et D = 50 € / I = Pas de BDG', null, 'gestionsinistre@maif.fr', 'Photos carte verte & carte grise', 'Pas de déclaration', 'gestionsinistre@maif.fr', false, false, array['maif']::text[]),
    ('Marsh (Courtier)', null, '01.41.34.50.00', 'declaration.sinauto@marsh.com / facture.auto@marsh.com', 'Photos carte verte & carte grise', 'Accord verbal SANS le client', 'declaration.sinauto@marsh.com — Courrier : 5 place de la Pyramide 92800 Puteaux', false, false, array['marsh']::text[]),
    ('Matmut', 'H = 15% facture / HPB = 25% facture (BDG uniquement sur PB) / HSF = à vérifier', null, 'Courrier uniquement', 'Photos carte verte & carte grise', 'Pas de déclaration', 'Courrier : Groupe Matmut 66 rue de la Sotteville 76100 Rouen — Règlement + rapide si client dépose en agence ou espace perso', false, false, array['matmut']::text[]),
    ('MMA / Novelia', '0 / 50 / 80 / 100 €', null, 'autosolutions@groupe-mma.fr', 'Photos carte verte & carte grise', 'Pas de déclaration', 'autosolutions@groupe-mma.fr', false, false, array['mma', 'novelia']::text[]),
    ('Monceau', '0 €', 'N° inscrit sur la carte verte', 'Via agent', 'Photos carte verte & carte grise', 'Déclaration + n° sinistre avec le client (10 min avant, sauf 8h30 ou 14h)', 'Facture + déclaration BDG à l''agent', true, false, array['monceau']::text[]),
    ('Pacifica / LCL', '0 € (si mention "Bris de glace")', '08.00.81.08.12', 'gestion@pacifica.fr', '⚠️ EXPERTISE OBLIGATOIRE. Photos carte verte & carte grise + CT. Déclaration + n° sinistre + mandat expert avec le client', 'Immobilisation véhicule à la journée — RDV à 8h30', 'gestion@pacifica.fr — Courrier : Pacifica TSA 60444 92883 Nanterre Cedex 9', true, true, array['pacifica', 'lcl']::text[]),
    ('Protec BTP', null, '0 810 081 1 097', 'sinistres_auto@protecbtp.fr', 'Photos carte verte & carte grise', 'Déclaration + n° sinistre avec le client', 'sinistres_auto@protecbtp.fr — 11 Allée du bâtiment 35042 Rennes Cedex', true, false, array['protec btp', 'protecbtp']::text[]),
    ('PSA / Peugeot Assurance', null, '01.76.29.75.55', 'sinistres-peugeot@psa-assurance.fr', 'Photos carte verte & carte grise', 'Déclaration + n° sinistre avec le client (10 min avant, sauf 8h30 ou 14h)', 'sinistres-peugeot@psa-assurance.fr', true, false, array['psa', 'peugeot']::text[]),
    ('Renault Assurance', null, '02.40.13.40.70', 'indemnisation@renault-assurances.fr', 'Photos carte verte & carte grise', 'Déclaration + n° sinistre avec le client (10 min avant, sauf 8h30 ou 14h)', 'indemnisation@renault-assurances.fr', true, false, array['renault']::text[]),
    ('Serenis (Courtier — Crédit Mutuel/CIC)', 'Selon "délivrée par"', '03.88.14.91.58', 'sinistreauto@serenis.cic.fr', 'Suivre le process assurance de "délivrée par". Photos carte verte & carte grise', 'Déclaration + n° sinistre avec le client (10 min avant, sauf 8h30 ou 14h)', 'sinistreauto@serenis.cic.fr', true, false, array['serenis']::text[]),
    ('SMA BTP', '0 € ou 75 €', null, 'gestion_sinistres_auto@groupa-sma.fr', 'Photos carte verte & carte grise', 'Pas de déclaration', 'gestion_sinistres_auto@groupa-sma.fr', false, false, array['sma btp', 'smabtp']::text[]),
    ('Suravenir', 'Indiqué sur la carte verte (BDG X)', '09.69.36.29.36', 'indemnisation@suravenir-assurances.fr (objet : n° sinistre)', 'Photos carte verte & carte grise', 'Accord verbal SANS le client', 'indemnisation@suravenir-assurances.fr', false, false, array['suravenir']::text[]),
    ('SwissLife', 'R-BG0 = 0 € / Non-agréé = 110 €', 'Via agent', 'Via agent', 'Photos carte verte & carte grise', 'Accord verbal SANS le client', 'Facture par courrier chez l''agent ou par mail', false, false, array['swisslife', 'swiss life']::text[]),
    ('Thelem Assurances', null, null, 'sous-traitants@thelemassurances.fr', 'Photos carte verte & carte grise. Expertise possible sur le centre de Dreux', 'Déclaration + n° sinistre SANS le client par mail : sous-traitants@thelemassurances.fr', 'Adresse sur carte verte', false, false, array['thelem']::text[]),
    ('Toyota Assurance', null, '01.41.12.20.74', 'sinistres@toyota-assurances.fr', 'Photos carte verte & carte grise', 'Déclaration + n° sinistre SANS le client par tél', 'sinistres@toyota-assurances.fr', false, false, array['toyota']::text[]),
    ('Verlingue (Courtier)', null, '08.20.26.02.59', 'bdg@verlingue.fr', 'Photos carte verte & carte grise', 'Déclaration + n° sinistre SANS le client', 'bdg@verlingue.fr', false, false, array['verlingue']::text[]),
    ('Verspieren (Courtier)', null, '03.20.45.71.00 (particulier) / 03.20.66.86.13 (flotte)', 'tdefrance@verspieren.com / sinistreautoparticulier@verspieren.com', 'Photos carte verte & carte grise', 'Déclaration + n° sinistre SANS le client', 'tdefrance@verspieren.com', false, false, array['verspieren']::text[]),
    ('Zephir (Courtier)', '0 / 80 / 90 / 100 / 130 / 140 / 160 / 240 €', '02.40.55.70.65', 'sinistre@groupe-zephir.fr', 'Suivre le process de "délivrée par". Photos carte verte & carte grise', 'Accord verbal SANS le client', 'sinistre@groupe-zephir.fr — rue du Président Wilson CS10137 44144 Chateaubriant', false, false, array['zephir']::text[]),
    ('L''Equite', 'Selon "délivrée par"', null, 'Mail sur la carte verte', 'Suivre le process assurance de "délivrée par"', 'Pas de déclaration', 'Adresse mail sur la carte verte', false, false, array['equite', 'l''equite']::text[]),
    ('L''Olivier', '0 / 60 / 70 / 75 / 80 / 85 / 90 / 95 / 100 €', '01.84.02.20.22', 'sinistre@lolivier.fr (objet : n° sinistre)', 'Photos carte verte & carte grise', 'Déclaration + n° sinistre avec le client (10 min avant, sauf 8h30 ou 14h)', '⚠️ Bon de livraison SANS prix et SANS immatriculation — sinistre@lolivier.fr', true, false, array['olivier', 'l''olivier']::text[])
  ) as d(name, franchise_texte, phone, email, avant_rdv, jour_rdv, apres_rdv,
         client_present, expertise_obligatoire, tags)
  on conflict do nothing;

  select count(*) into v_apres from insurers where workspace_id = p_workspace;
  return v_apres - v_avant;
end;
$$;

revoke all on function public.semer_assureurs_defaut(uuid) from public, anon;
grant execute on function public.semer_assureurs_defaut(uuid) to authenticated;

create or replace function public.semer_assureurs_nouveau_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.semer_assureurs_defaut(new.id);
  return new;
end;
$$;

drop trigger if exists workspaces_semer_assureurs on public.workspaces;
create trigger workspaces_semer_assureurs
  after insert on public.workspaces
  for each row execute function public.semer_assureurs_nouveau_workspace();

do $$
declare
  w record;
begin
  for w in select id from workspaces loop
    perform public.semer_assureurs_defaut(w.id);
  end loop;
end $$;
