/*
# Joindre soi-meme le PDF d'une facture

## Pourquoi

Onify a ferme l'acces qui permettait de recuperer les PDF : la clef API
recoit 404 sur le lien qu'elle fournit elle-meme, et 401 sur les routes de
rendu. 145 factures ont ete archivees avant la fermeture ; aucune depuis.

Leur navigateur, lui, y a toujours acces -- c'est ainsi qu'on consulte une
facture dans Onify. Le CRM ne peut pas s'en servir : leur politique CORS
n'autorise que `https://app.onify.fr`. Un depot manuel reste donc le seul
chemin qui ne depende de personne : on telecharge depuis Onify, on depose
dans le CRM, et le document est conserve comme les 145 autres.

## Ce que ca ouvre

Le bucket `onify-invoices` n'avait aucune politique : seule la fonction
d'archivage y ecrivait, avec la clef de service. Deposer depuis le
navigateur demande d'ouvrir l'ecriture aux roles qui gerent la facturation,
dans leur propre espace et nulle part ailleurs.

La lecture reste fermee : les octets passent par `onify-invoice-pdf`, qui
verifie l'espace et le role avant de servir. Rien ne change de ce cote.
*/

-- Le chemin est <workspace_id>/<invoice_id>/<numero>.pdf : le premier
-- segment decide a qui appartient le fichier.
drop policy if exists deposer_facture_onify on storage.objects;
create policy deposer_facture_onify
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'onify-invoices'
    and (storage.foldername(name))[1] = public.get_workspace_id()::text
    and public.a_role(array['admin', 'accountant'])
  );

-- Remplacer un document depose par erreur, sans passer par un support.
drop policy if exists remplacer_facture_onify on storage.objects;
create policy remplacer_facture_onify
  on storage.objects for update to authenticated
  using (
    bucket_id = 'onify-invoices'
    and (storage.foldername(name))[1] = public.get_workspace_id()::text
    and public.a_role(array['admin', 'accountant'])
  );

comment on column public.invoices.onify_pdf_path is
  'Chemin du PDF dans le bucket onify-invoices : <workspace_id>/<invoice_id>/<numero>.pdf. '
  'Rempli par la synchronisation, ou a la main quand Onify refuse le document.';
