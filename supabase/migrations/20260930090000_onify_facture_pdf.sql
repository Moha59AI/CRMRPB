/*
# Le PDF d'origine des factures Onify

## Ce que ça couvre

La fonction `onify-invoice-pdf` va chercher le PDF chez Onify et le conserve,
pour ne pas redemander le même document à chaque ouverture. Ces objets de
schéma existaient déjà en base sans migration : ce fichier les décrit, afin
qu'un environnement neuf parte du même état. Tout est conditionnel, donc sans
effet sur la base de production.

## Pourquoi le bucket est privé et sans politique

Personne n'y accède depuis le navigateur. La fonction lit et écrit avec la
clé de service, puis renvoie les octets ; le CRM ne voit jamais le stockage.
Une politique `authenticated` ouvrirait un chemin que rien n'utilise.
*/

alter table public.invoices
  add column if not exists onify_pdf_path       text,
  add column if not exists onify_pdf_synced_at  timestamptz,
  add column if not exists onify_pdf_checked_at timestamptz,
  add column if not exists onify_pdf_error      text;

comment on column public.invoices.onify_pdf_path is
  'Chemin du PDF dans le bucket onify-invoices : <workspace_id>/<invoice_id>/<numero>.pdf';
comment on column public.invoices.onify_pdf_error is
  'Diagnostic du dernier echec de recuperation, efface des que le PDF arrive';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('onify-invoices', 'onify-invoices', false, 26214400, array['application/pdf'])
on conflict (id) do nothing;
