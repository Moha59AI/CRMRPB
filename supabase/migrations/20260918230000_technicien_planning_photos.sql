/*
# Le technicien sur le terrain : planning complet, photos d'intervention

## Ce qui manquait

Le rôle `technician` existe et la matrice le décrit bien : ses rendez-vous,
avec les coordonnées du client. Mais deux choses l'empêchaient de travailler.

**Il ne voyait pas le client d'un rendez-vous.** `technicien_voit_contact`
ne passait que par les dossiers (`windscreen_cases`). Or la plupart des
rendez-vous sont rattachés à un contact directement — ceux repris de Google
Agenda, notamment. Le technicien avait le rendez-vous et ni l'adresse ni le
téléphone.

**Il n'avait nulle part où mettre ses photos.** `case_documents` exige un
dossier, que la plupart des rendez-vous n'ont pas, et n'accorde au
technicien que la lecture.

## Ce que fait cette migration

1. `technicien_voit_contact` passe aussi par les rendez-vous assignés, et par
   les leads visibles — un lead visible implique son contact.
2. Une table `intervention_photos`, rattachée au rendez-vous. Le technicien
   ajoute et retire les siennes sur ses rendez-vous ; le reste de l'équipe
   voit et gère tout dans l'espace.
3. Un bucket privé `intervention-photos`, chemin
   `<workspace_id>/<appointment_id>/<fichier>`, lu par URL signée. Les
   politiques de stockage suivent celles de la table : on ne dépose que là
   où l'on peut écrire une ligne.
*/

-- ── 1. Visibilité du contact ─────────────────────────────────────────────

create or replace function public.technicien_voit_contact(p_contact_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.windscreen_cases wc
     where wc.contact_id = p_contact_id
       and (wc.technician_id = auth.uid() or wc.assigned_user_id = auth.uid())
  )
  or exists (
    select 1 from public.appointments a
     where a.contact_id = p_contact_id
       and a.assigned_user_id = auth.uid()
  )
  or exists (
    select 1 from public.leads l
      join public.appointments a on a.lead_id = l.id
     where l.contact_id = p_contact_id
       and a.assigned_user_id = auth.uid()
  );
$$;
-- ── 2. Photos d'intervention ─────────────────────────────────────────────

create table if not exists public.intervention_photos (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  /** Chemin dans le bucket : <workspace_id>/<appointment_id>/<fichier>. */
  storage_path   text not null unique,
  kind           text not null default 'autre' check (kind in ('avant', 'apres', 'autre')),
  caption        text,
  content_type   text,
  size_bytes     integer,
  taken_by       uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists intervention_photos_appointment_idx
  on public.intervention_photos (appointment_id, created_at);
alter table public.intervention_photos enable row level security;
-- L'équipe : tout, dans l'espace.
drop policy if exists select_intervention_photos on public.intervention_photos;
create policy select_intervention_photos
  on public.intervention_photos for select to authenticated
  using (
    workspace_id = public.get_workspace_id()
    and (
      public.a_role(array['admin', 'manager', 'advisor', 'accountant'])
      or exists (
        select 1 from public.appointments a
         where a.id = intervention_photos.appointment_id
           and a.assigned_user_id = auth.uid()
      )
    )
  );
drop policy if exists insert_intervention_photos on public.intervention_photos;
create policy insert_intervention_photos
  on public.intervention_photos for insert to authenticated
  with check (
    workspace_id = public.get_workspace_id()
    and taken_by = auth.uid()
    and (
      public.a_role(array['admin', 'manager', 'advisor'])
      or exists (
        select 1 from public.appointments a
         where a.id = intervention_photos.appointment_id
           and a.assigned_user_id = auth.uid()
      )
    )
  );
-- Une photo se retire ; elle ne se réécrit pas. Le technicien ne retire que
-- les siennes : celles d'un collègue passé avant lui sont une trace.
drop policy if exists delete_intervention_photos on public.intervention_photos;
create policy delete_intervention_photos
  on public.intervention_photos for delete to authenticated
  using (
    workspace_id = public.get_workspace_id()
    and (
      public.a_role(array['admin', 'manager'])
      or taken_by = auth.uid()
    )
  );
grant select, insert, delete on public.intervention_photos to authenticated;
-- ── 3. Stockage ──────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'intervention-photos', 'intervention-photos', false,
  15728640, -- 15 Mo : une photo de téléphone récent
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
-- Un objet est accessible si une ligne de photos y correspond et qu'on peut
-- la lire : la table fait foi, le stockage suit.
drop policy if exists lire_intervention_photos on storage.objects;
create policy lire_intervention_photos
  on storage.objects for select to authenticated
  using (
    bucket_id = 'intervention-photos'
    and exists (
      select 1 from public.intervention_photos p
       where p.storage_path = storage.objects.name
    )
  );
-- Le dépôt précède la ligne : on vérifie ici le même périmètre que
-- l'insertion dans la table, à partir du chemin.
drop policy if exists deposer_intervention_photos on storage.objects;
create policy deposer_intervention_photos
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'intervention-photos'
    and (storage.foldername(name))[1] = public.get_workspace_id()::text
    and (
      public.a_role(array['admin', 'manager', 'advisor'])
      or exists (
        select 1 from public.appointments a
         where a.id::text = (storage.foldername(name))[2]
           and a.assigned_user_id = auth.uid()
      )
    )
  );
drop policy if exists retirer_intervention_photos on storage.objects;
create policy retirer_intervention_photos
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'intervention-photos'
    and exists (
      select 1 from public.intervention_photos p
       where p.storage_path = storage.objects.name
         and (public.a_role(array['admin', 'manager']) or p.taken_by = auth.uid())
    )
  );
