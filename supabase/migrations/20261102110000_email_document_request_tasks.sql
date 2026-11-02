-- Relie une tâche créée automatiquement à l'email qui l'a déclenchée.
-- L'index unique rend l'ingestion IONOS idempotente : un même message ne peut
-- jamais créer deux demandes de pièces.

alter table public.tasks
  add column if not exists source_communication_id uuid
    references public.communications(id) on delete set null;

alter table public.tasks
  add column if not exists origin text not null default 'manual';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_origin_check'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_origin_check
      check (origin in ('manual', 'email_auto', 'ai', 'import'));
  end if;
end
$$;

create index if not exists tasks_source_communication_id_idx
  on public.tasks (source_communication_id)
  where source_communication_id is not null;

create unique index if not exists tasks_workspace_source_communication_unique
  on public.tasks (workspace_id, source_communication_id);

comment on column public.tasks.source_communication_id is
  'Email entrant à l''origine de la tâche automatique.';

comment on column public.tasks.origin is
  'Origine de la tâche : saisie manuelle, email automatique, IA ou import.';
