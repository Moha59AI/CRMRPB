/*
  Autorise plusieurs fichiers pour une meme categorie documentaire.

  client_document_items reste la categorie metier (carte grise, attestation,
  etc.) et continue de piloter le caractere obligatoire ainsi que l'avancement.
  client_document_files conserve chaque fichier recu sans ecraser le precedent.
*/

begin;

alter table public.client_document_portal_settings
  alter column page_intro set default
  'Prenez des photos nettes ou choisissez vos PDF. Vous pouvez ajouter plusieurs fichiers dans chaque catégorie.';

update public.client_document_portal_settings
set page_intro = 'Prenez des photos nettes ou choisissez vos PDF. Vous pouvez ajouter plusieurs fichiers dans chaque catégorie.'
where page_intro = 'Prenez une photo nette ou choisissez un PDF. Vous pouvez remplacer un document tant que nécessaire.';

create unique index if not exists client_document_items_parent_key
  on public.client_document_items (id, request_id, workspace_id);

create table if not exists public.client_document_files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  request_id uuid not null references public.client_document_requests(id) on delete cascade,
  item_id uuid not null,
  storage_path text not null unique,
  original_name text not null,
  mime_type text,
  size_bytes bigint check (
    size_bytes is null or (size_bytes >= 0 and size_bytes <= 12582912)
  ),
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint client_document_files_item_parent_fk
    foreign key (item_id, request_id, workspace_id)
    references public.client_document_items(id, request_id, workspace_id)
    on delete cascade
);

create index if not exists client_document_files_request_idx
  on public.client_document_files (request_id, uploaded_at);

create index if not exists client_document_files_item_idx
  on public.client_document_files (item_id, uploaded_at);

alter table public.client_document_files enable row level security;

drop policy if exists "select_client_document_files" on public.client_document_files;
create policy "select_client_document_files" on public.client_document_files for select
  to authenticated using (
    workspace_id = (select profile.workspace_id from public.profiles profile where profile.id = auth.uid())
    and exists (
      select 1 from public.profiles profile
      where profile.id = auth.uid()
        and profile.role in ('admin', 'manager', 'advisor', 'accountant')
    )
  );

drop policy if exists "insert_client_document_files" on public.client_document_files;
create policy "insert_client_document_files" on public.client_document_files for insert
  to authenticated with check (
    workspace_id = (select profile.workspace_id from public.profiles profile where profile.id = auth.uid())
    and exists (
      select 1 from public.profiles profile
      where profile.id = auth.uid()
        and profile.role in ('admin', 'manager', 'advisor')
    )
  );

drop policy if exists "update_client_document_files" on public.client_document_files;
create policy "update_client_document_files" on public.client_document_files for update
  to authenticated using (
    workspace_id = (select profile.workspace_id from public.profiles profile where profile.id = auth.uid())
    and exists (
      select 1 from public.profiles profile
      where profile.id = auth.uid()
        and profile.role in ('admin', 'manager', 'advisor')
    )
  ) with check (
    workspace_id = (select profile.workspace_id from public.profiles profile where profile.id = auth.uid())
    and exists (
      select 1 from public.profiles profile
      where profile.id = auth.uid()
        and profile.role in ('admin', 'manager', 'advisor')
    )
  );

drop policy if exists "delete_client_document_files" on public.client_document_files;
create policy "delete_client_document_files" on public.client_document_files for delete
  to authenticated using (
    workspace_id = (select profile.workspace_id from public.profiles profile where profile.id = auth.uid())
    and exists (
      select 1 from public.profiles profile
      where profile.id = auth.uid()
        and profile.role in ('admin', 'manager')
    )
  );

insert into public.client_document_files (
  workspace_id,
  request_id,
  item_id,
  storage_path,
  original_name,
  mime_type,
  size_bytes,
  uploaded_at
)
select
  item.workspace_id,
  item.request_id,
  item.id,
  item.storage_path,
  coalesce(nullif(trim(item.original_name), ''), 'Document client'),
  item.mime_type,
  item.size_bytes,
  coalesce(item.uploaded_at, item.updated_at, item.created_at)
from public.client_document_items item
where item.storage_path is not null
  and item.status in ('uploaded', 'validated')
on conflict (storage_path) do nothing;

comment on table public.client_document_files is
  'Fichiers recus pour une categorie documentaire client, sans remplacement des depots precedents.';

commit;
