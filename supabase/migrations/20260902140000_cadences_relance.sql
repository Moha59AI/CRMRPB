/*
# Cadences de relance réglables

## Ce qui était figé

Les délais vivaient dans un `CASE` au cœur de la vue `v_relances` : un lead
intéressé se rappelait à un jour, un NRP à 2 h puis 1 j, 3 j, 7 j, et sortait
de la file à la cinquième tentative. Changer un seul de ces nombres imposait
une migration.

C'est pourtant le réglage qui agit le plus directement sur les conversions, et
celui qu'on veut essayer plusieurs fois avant de trancher. Le figer dans du SQL
revenait à interdire l'expérimentation.

## Le modèle

Une ligne par situation : `(statut, tentative_min) → délai`.

Pour les statuts sans notion de tentative, une seule ligne à `tentative_min = 0`.
Pour un NRP, une ligne par tentative — la recherche prend la ligne dont le
`tentative_min` est le plus élevé sans dépasser le nombre d'essais déjà faits.

**Un délai `NULL` signifie « sort de la file ».** C'est ce qui remplace le
`else null` du CASE : la fin de cadence devient une donnée, réglable comme le
reste, au lieu d'une règle enfouie dans le code.

## Le filet

Un espace sans cadence produirait une file de relances vide — panne
silencieuse, la pire espèce. Un trigger sème donc les valeurs par défaut à la
création de tout espace, et la migration les sème pour ceux qui existent déjà.
*/

create table if not exists public.relance_cadences (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  statut text not null,
  /* Nombre de tentatives a partir duquel cette ligne s'applique. 0 pour les
     statuts qui ne comptent pas les essais. */
  tentative_min integer not null default 0,
  /* NULL = le lead sort de la file de relances. */
  delai interval,
  primary key (workspace_id, statut, tentative_min)
);

comment on column public.relance_cadences.delai is
  'Delai avant rappel. NULL signifie que le lead sort de la file : la fin de cadence est une donnee, pas une regle codee.';

alter table public.relance_cadences enable row level security;

-- Tout le monde lit : la vue des relances s'appuie dessus, et elle est
-- consultee par chaque conseiller. Seuls l'administrateur et le responsable
-- ecrivent -- changer une cadence deplace la file de toute l'equipe.
drop policy if exists "select_relance_cadences" on public.relance_cadences;
create policy "select_relance_cadences" on public.relance_cadences for select
  to authenticated using (workspace_id = public.get_workspace_id());

drop policy if exists "insert_relance_cadences" on public.relance_cadences;
create policy "insert_relance_cadences" on public.relance_cadences for insert
  to authenticated with check (
    workspace_id = public.get_workspace_id() and public.a_role(array['admin', 'manager'])
  );

drop policy if exists "update_relance_cadences" on public.relance_cadences;
create policy "update_relance_cadences" on public.relance_cadences for update
  to authenticated using (
    workspace_id = public.get_workspace_id() and public.a_role(array['admin', 'manager'])
  ) with check (
    workspace_id = public.get_workspace_id() and public.a_role(array['admin', 'manager'])
  );

drop policy if exists "delete_relance_cadences" on public.relance_cadences;
create policy "delete_relance_cadences" on public.relance_cadences for delete
  to authenticated using (
    workspace_id = public.get_workspace_id() and public.a_role(array['admin', 'manager'])
  );


-- ============ VALEURS PAR DÉFAUT ============
-- Celles qui etaient codees en dur jusqu'ici. Les reprendre a l'identique
-- garantit qu'aucune file ne bouge le jour de la migration.

create or replace function public.semer_cadences_defaut(p_workspace uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into relance_cadences (workspace_id, statut, tentative_min, delai)
  values
    (p_workspace, 'new',                 0, interval '0 minutes'),
    (p_workspace, 'to_call',             0, interval '0 minutes'),
    (p_workspace, 'calling',             0, interval '0 minutes'),
    (p_workspace, 'documents_received',  0, interval '0 minutes'),
    (p_workspace, 'interested',          0, interval '1 day'),
    (p_workspace, 'documents_requested', 0, interval '2 days'),
    (p_workspace, 'nrp',                 1, interval '2 hours'),
    (p_workspace, 'nrp',                 2, interval '1 day'),
    (p_workspace, 'nrp',                 3, interval '3 days'),
    (p_workspace, 'nrp',                 4, interval '7 days'),
    -- Cinquieme tentative : rappeler indefiniment un numero qui ne repond pas
    -- encombre la file et fait perdre du temps.
    (p_workspace, 'nrp',                 5, null)
  on conflict (workspace_id, statut, tentative_min) do nothing;
$$;

revoke all on function public.semer_cadences_defaut(uuid) from public, anon;
grant execute on function public.semer_cadences_defaut(uuid) to authenticated;

-- Un espace sans cadence aurait une file de relances vide, sans rien pour
-- l'expliquer. Le filet doit poser avant qu'on puisse tomber.
create or replace function public.semer_cadences_nouveau_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.semer_cadences_defaut(new.id);
  return new;
end;
$$;

drop trigger if exists workspaces_semer_cadences on public.workspaces;
create trigger workspaces_semer_cadences
  after insert on public.workspaces
  for each row execute function public.semer_cadences_nouveau_workspace();

do $$
declare
  w record;
begin
  for w in select id from workspaces loop
    perform public.semer_cadences_defaut(w.id);
  end loop;
end $$;


-- ============ LA VUE LIT LA TABLE ============
-- Seul le calcul de `delai` change. La liste des colonnes reste identique :
-- fetch_relances en depend, et PostgreSQL refuserait un remplacement qui la
-- modifierait.

drop view if exists public.v_relances;

create view public.v_relances
with (security_invoker = on)
as
with derniere_action as (
  select distinct on (lead_id) lead_id, type, direction, created_at
  from communications
  where lead_id is not null
  order by lead_id, created_at desc
),
leads_relances as (
  select
    l.*,
    coalesce(l.last_contacted_at, l.received_at, l.created_at) as depart,
    -- La ligne retenue est celle dont `tentative_min` est le plus eleve sans
    -- depasser les essais deja faits. Un statut absent de la table sort de la
    -- file, comme le faisait le `else null` du CASE.
    (
      select c.delai
      from relance_cadences c
      where c.workspace_id = l.workspace_id
        and c.statut = l.status
        and c.tentative_min <= greatest(l.attempt_count, 0)
      order by c.tentative_min desc
      limit 1
    ) as delai,
    -- Distingue « aucune cadence definie » de « cadence arrivee a son terme ».
    exists (
      select 1 from relance_cadences c
      where c.workspace_id = l.workspace_id and c.statut = l.status
    ) as cadence_definie
  from leads l
)
select
  'lead:' || lr.id as id,
  lr.workspace_id,
  case
    when lr.status = 'documents_requested' then 'documents'
    when lr.attempt_count = 0 then 'nouveau'
    else 'rappel'
  end as kind,
  coalesce(lr.next_action_at, lr.depart + lr.delai) as due_at,
  trim(coalesce(lr.first_name, '') || ' ' || coalesce(lr.last_name, '')) as titre,
  case lr.status
    when 'new' then 'Nouveau lead — jamais appelé'
    when 'to_call' then 'À appeler'
    when 'calling' then 'Appel en cours, à reprendre'
    when 'nrp' then 'Sans réponse — tentative ' || (lr.attempt_count + 1)
    when 'interested' then 'Intéressé, à relancer'
    when 'documents_requested' then 'Documents demandés, sans réponse'
    when 'documents_received' then 'Documents reçus, à traiter'
    else 'À reprendre'
  end as motif,
  lr.phone, lr.city, lr.insurance,
  nullif(trim(coalesce(lr.vehicle_make, '') || ' ' || coalesce(lr.vehicle_model, '')), '') as vehicule,
  lr.vehicle_registration as immatriculation,
  lr.assigned_user_id,
  lr.id as lead_id,
  null::uuid as task_id, null::uuid as appointment_id, null::uuid as case_id,
  null::uuid as invoice_id, null::uuid as sav_id,
  lr.attempt_count,
  a.created_at as last_action_at,
  a.type as last_action_type,
  case when lr.attempt_count = 0
       then greatest(0, extract(epoch from (now() - lr.depart)) / 60)::integer
       else null end as waiting_minutes,
  public.calc_priorite_relance(
    lr.attempt_count = 0,
    greatest(0, current_date - coalesce(lr.next_action_at, lr.depart + lr.delai)::date),
    false,
    lr.status = 'documents_requested' and lr.updated_at < now() - interval '5 days',
    false, lr.score, lr.attempt_count, lr.duplicate_flagged
  )
  + case
      when lr.attempt_count > 0 then 0
      when now() - lr.depart > interval '2 hours'    then 30
      when now() - lr.depart > interval '30 minutes' then 20
      when now() - lr.depart > interval '5 minutes'  then 10
      else 0
    end as score
from leads_relances lr
left join derniere_action a on a.lead_id = lr.id
where lr.delai is not null

union all

select
  'task:' || t.id, t.workspace_id, 'tache', t.due_at, t.title,
  coalesce(t.description, 'Tâche à traiter'),
  null, null, null, null, null,
  t.assigned_user_id, t.lead_id, t.id, null::uuid, t.case_id, null::uuid, null::uuid,
  0, null::timestamptz, null::text, null::integer,
  public.calc_priorite_relance(
    false, greatest(0, current_date - t.due_at::date), false, false, false,
    case t.priority when 'urgent' then 60 when 'high' then 50 else 0 end, 0, false)
from tasks t
where t.status in ('pending', 'in_progress') and t.due_at is not null

union all

select
  'rdv:' || ap.id, ap.workspace_id, 'rdv',
  ap.start_time - interval '1 day', ap.title, 'Rendez-vous à confirmer',
  null, null, null, null, null,
  ap.assigned_user_id, ap.lead_id, null::uuid, ap.id, ap.case_id, null::uuid, null::uuid,
  0, null::timestamptz, null::text, null::integer,
  public.calc_priorite_relance(false, greatest(0, current_date - (ap.start_time - interval '1 day')::date),
                               true, false, false, 0, 0, false)
from appointments ap
where ap.status = 'scheduled'

union all

select
  'case-doc:' || wc.id, wc.workspace_id, 'documents',
  wc.updated_at + interval '2 days',
  coalesce(trim(co.first_name || ' ' || co.last_name), wc.case_number),
  'Documents manquants',
  co.phone, co.city, null, null, null,
  wc.assigned_user_id, wc.lead_id, null::uuid, null::uuid, wc.id, null::uuid, null::uuid,
  0, null::timestamptz, null::text, null::integer,
  public.calc_priorite_relance(false, greatest(0, current_date - (wc.updated_at + interval '2 days')::date),
                               false, true, false, 0, 0, false)
from windscreen_cases wc
left join contacts co on co.id = wc.contact_id
where wc.status = 'documents_pending';

grant select on public.v_relances to authenticated;


-- ============ LECTURE ET ÉCRITURE EN MINUTES ============
-- PostgREST rend un `interval` tantôt « 1 day », tantôt « 02:00:00 » : le
-- parser côté navigateur serait fragile pour rien. Ces fonctions font la
-- conversion en base, une fois.

create or replace function public.lire_cadences()
returns table (
  statut text,
  tentative_min integer,
  delai_minutes integer,
  sort_de_file boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    c.statut,
    c.tentative_min,
    case when c.delai is null then null
         else (extract(epoch from c.delai) / 60)::integer end,
    c.delai is null
  from relance_cadences c
  where c.workspace_id = public.get_workspace_id()
  order by c.statut, c.tentative_min;
$$;

grant execute on function public.lire_cadences() to authenticated;

/*
 * `p_minutes` à NULL signifie « sort de la file » : c'est ainsi qu'on règle
 * la fin de cadence, sans ligne spéciale ni drapeau supplémentaire.
 */
create or replace function public.definir_cadence(
  p_statut text,
  p_tentative_min integer,
  p_minutes integer
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ws uuid := public.get_workspace_id();
begin
  if v_ws is null then
    raise exception 'Aucun espace de travail';
  end if;

  if p_minutes is not null and p_minutes < 0 then
    raise exception 'Un delai ne peut pas etre negatif';
  end if;

  insert into relance_cadences (workspace_id, statut, tentative_min, delai)
  values (
    v_ws, p_statut, p_tentative_min,
    case when p_minutes is null then null
         else make_interval(mins => p_minutes) end
  )
  on conflict (workspace_id, statut, tentative_min)
  -- Les politiques RLS decident si l'ecriture aboutit : l'appelant n'a pas a
  -- reverifier son role, et ne peut pas le contourner.
  do update set delai = excluded.delai;
end;
$$;

grant execute on function public.definir_cadence(text, integer, integer) to authenticated;

create or replace function public.reinitialiser_cadences()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ws uuid := public.get_workspace_id();
begin
  if v_ws is null then
    raise exception 'Aucun espace de travail';
  end if;

  -- La suppression passe par les politiques RLS : un conseiller qui
  -- appellerait cette fonction n'effacerait rien.
  delete from relance_cadences where workspace_id = v_ws;
  perform public.semer_cadences_defaut(v_ws);
end;
$$;

grant execute on function public.reinitialiser_cadences() to authenticated;
