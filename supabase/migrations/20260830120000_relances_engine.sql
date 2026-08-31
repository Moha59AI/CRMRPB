/*
# Moteur de relances côté base

## Problème résolu

La première version chargeait toutes les lignes de `leads`, `tasks` et
`appointments`, puis calculait l'urgence et triait en JavaScript. Tenable à
cinquante relances, inutilisable à mille : trois requêtes sans limite, un tri
côté client, et un DOM qui s'effondre.

Tout passe désormais en SQL : agrégation des sources, score de priorité,
filtrage, tri et pagination. Le client ne reçoit qu'une page de résultats.

## Sécurité

La vue est déclarée `security_invoker` : les politiques RLS des tables sources
s'appliquent à l'appelant. Sans cette option, la vue s'exécuterait avec les
droits de son propriétaire et exposerait les données de tous les workspaces.
*/

-- ============ INDEX ============
-- communications (lead_id, created_at desc) est le plus important : sans lui,
-- retrouver la dernière action de chaque lead déclenche un balayage par ligne.

create index if not exists leads_next_action_at_idx
  on leads (workspace_id, next_action_at);
create index if not exists leads_updated_at_idx
  on leads (workspace_id, updated_at);
create index if not exists communications_lead_created_idx
  on communications (lead_id, created_at desc);
create index if not exists tasks_due_at_idx
  on tasks (workspace_id, status, due_at);
create index if not exists appointments_start_idx
  on appointments (workspace_id, status, start_time);
create index if not exists windscreen_cases_status_idx
  on windscreen_cases (workspace_id, status, updated_at);
create index if not exists invoices_status_due_idx
  on invoices (workspace_id, status, due_date);


-- ============ COMPTEURS DÉNORMALISÉS ============
-- Déductibles de `communications`, mais les recalculer à chaque affichage
-- coûte un agrégat par ligne. On les maintient par trigger.

alter table leads add column if not exists attempt_count integer not null default 0;
alter table leads add column if not exists last_contacted_at timestamptz;

create or replace function public.maj_compteurs_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.lead_id is null then
    return new;
  end if;

  update leads
  set last_contacted_at = greatest(coalesce(last_contacted_at, new.created_at), new.created_at),
      attempt_count = attempt_count
        + case when new.direction = 'outbound' and new.type like 'call%' then 1 else 0 end
  where id = new.lead_id;

  return new;
end;
$$;

drop trigger if exists communications_maj_compteurs on communications;
create trigger communications_maj_compteurs
  after insert on communications
  for each row execute function public.maj_compteurs_lead();

-- Rattrapage sur l'existant
update leads l
set attempt_count = coalesce(c.tentatives, 0),
    last_contacted_at = c.dernier
from (
  select lead_id,
         count(*) filter (where direction = 'outbound' and type like 'call%') as tentatives,
         max(created_at) as dernier
  from communications
  where lead_id is not null
  group by lead_id
) c
where c.lead_id = l.id;


-- ============ SCORE DE PRIORITÉ ============
-- Calculé en base, jamais par appel externe. Les composantes sont exposées
-- pour pouvoir expliquer la priorité sans rien recalculer.

create or replace function public.calc_priorite_relance(
  p_jamais_appele boolean,
  p_jours_retard integer,
  p_rdv_proche boolean,
  p_docs_bloques boolean,
  p_assurance_bloquee boolean,
  p_valeur integer,
  p_tentatives integer,
  p_doublon boolean
)
returns integer
language sql
immutable
as $$
  select greatest(0,
      case when p_jamais_appele then 40 else 0 end
    + case when p_jours_retard > 0
           then least(25 + (p_jours_retard - 1) * 5, 40) else 0 end
    + case when p_rdv_proche then 20 else 0 end
    + case when p_docs_bloques then 15 else 0 end
    + case when p_assurance_bloquee then 15 else 0 end
    + case when coalesce(p_valeur, 0) >= 50 then 10 else 0 end
    + case when coalesce(p_tentatives, 0) >= 5 then -20 else 0 end
    + case when p_doublon then -30 else 0 end
  );
$$;

create or replace function public.niveau_priorite(p_score integer)
returns text
language sql
immutable
as $$
  select case
    when p_score >= 70 then 'urgent'
    when p_score >= 45 then 'haute'
    when p_score >= 20 then 'normale'
    else 'faible'
  end;
$$;


-- ============ VUE D'AGRÉGATION ============

drop view if exists public.v_relances;

create view public.v_relances
with (security_invoker = on)
as
-- Leads : délai par statut, sauf si next_action_at fixe une date explicite.
-- Une décision humaine prime toujours sur la règle.
with delais(statut, jours) as (
  values ('new', 0), ('to_call', 0), ('calling', 0), ('nrp', 1),
         ('interested', 1), ('documents_requested', 2), ('documents_received', 0)
),
derniere_action as (
  select distinct on (lead_id)
         lead_id, type, direction, created_at
  from communications
  where lead_id is not null
  order by lead_id, created_at desc
)
select
  'lead:' || l.id                                  as id,
  l.workspace_id,
  case when l.status = 'documents_requested' then 'documents' else 'rappel' end as kind,
  coalesce(l.next_action_at, l.updated_at + (d.jours || ' days')::interval) as due_at,
  trim(coalesce(l.first_name, '') || ' ' || coalesce(l.last_name, '')) as titre,
  case l.status
    when 'new' then 'Nouveau lead — jamais appelé'
    when 'to_call' then 'À appeler'
    when 'calling' then 'Appel en cours, à reprendre'
    when 'nrp' then 'N''a pas répondu'
    when 'interested' then 'Intéressé, à relancer'
    when 'documents_requested' then 'Documents demandés, sans réponse'
    when 'documents_received' then 'Documents reçus, à traiter'
    else 'À reprendre'
  end                                              as motif,
  l.phone, l.city, l.insurance,
  nullif(trim(coalesce(l.vehicle_make, '') || ' ' || coalesce(l.vehicle_model, '')), '') as vehicule,
  l.vehicle_registration                           as immatriculation,
  l.assigned_user_id,
  l.id                                             as lead_id,
  null::uuid                                       as task_id,
  null::uuid                                       as appointment_id,
  null::uuid                                       as case_id,
  null::uuid                                       as invoice_id,
  null::uuid                                       as sav_id,
  l.attempt_count,
  a.created_at                                     as last_action_at,
  a.type                                           as last_action_type,
  public.calc_priorite_relance(
    l.attempt_count = 0,
    greatest(0, (current_date - coalesce(l.next_action_at, l.updated_at + (d.jours || ' days')::interval)::date)),
    false,
    l.status = 'documents_requested' and l.updated_at < now() - interval '5 days',
    false,
    l.score,
    l.attempt_count,
    l.duplicate_flagged
  )                                                as score
from leads l
join delais d on d.statut = l.status
left join derniere_action a on a.lead_id = l.id

union all

-- Tâches
select
  'task:' || t.id, t.workspace_id, 'tache',
  t.due_at, t.title, coalesce(t.description, 'Tâche à traiter'),
  null, null, null, null, null,
  t.assigned_user_id, t.lead_id, t.id, null::uuid, t.case_id, null::uuid, null::uuid,
  0, null::timestamptz, null::text,
  public.calc_priorite_relance(
    false, greatest(0, current_date - t.due_at::date), false, false, false,
    case t.priority when 'urgent' then 60 when 'high' then 50 else 0 end, 0, false)
from tasks t
where t.status in ('pending', 'in_progress') and t.due_at is not null

union all

-- Rendez-vous : à confirmer la veille
select
  'rdv:' || ap.id, ap.workspace_id, 'rdv',
  ap.start_time - interval '1 day', ap.title, 'Rendez-vous à confirmer',
  null, null, null, null, null,
  ap.assigned_user_id, ap.lead_id, null::uuid, ap.id, ap.case_id, null::uuid, null::uuid,
  0, null::timestamptz, null::text,
  public.calc_priorite_relance(false, greatest(0, current_date - (ap.start_time - interval '1 day')::date),
                               true, false, false, 0, 0, false)
from appointments ap
where ap.status = 'scheduled'

union all

-- Dossiers en attente de documents
select
  'case-doc:' || wc.id, wc.workspace_id, 'documents',
  wc.updated_at + interval '2 days',
  coalesce(trim(co.first_name || ' ' || co.last_name), wc.case_number),
  'Documents manquants',
  co.phone, co.city, null, null, null,
  wc.assigned_user_id, wc.lead_id, null::uuid, null::uuid, wc.id, null::uuid, null::uuid,
  0, null::timestamptz, null::text,
  public.calc_priorite_relance(false, greatest(0, current_date - (wc.updated_at + interval '2 days')::date),
                               false, true, false, 0, 0, false)
from windscreen_cases wc
left join contacts co on co.id = wc.contact_id
where wc.status = 'documents_pending'

union all

-- Dossiers assurance sans mouvement depuis 7 jours
select
  'case-assur:' || wc.id, wc.workspace_id, 'assurance',
  wc.updated_at + interval '7 days',
  coalesce(trim(co.first_name || ' ' || co.last_name), wc.case_number),
  'Assurance sans réponse depuis plus de 7 jours',
  co.phone, co.city, null, null, null,
  wc.assigned_user_id, wc.lead_id, null::uuid, null::uuid, wc.id, null::uuid, null::uuid,
  0, null::timestamptz, null::text,
  public.calc_priorite_relance(false, greatest(0, current_date - (wc.updated_at + interval '7 days')::date),
                               false, false, true, 0, 0, false)
from windscreen_cases wc
left join contacts co on co.id = wc.contact_id
where wc.status = 'insurance_declaration'

union all

-- Factures non réglées
select
  'invoice:' || i.id, i.workspace_id, 'impaye',
  coalesce(i.due_date::timestamptz, i.updated_at),
  coalesce(trim(co.first_name || ' ' || co.last_name), i.invoice_number),
  'Règlement en attente',
  co.phone, co.city, null, null, null,
  null::uuid, null::uuid, null::uuid, null::uuid, i.case_id, i.id, null::uuid,
  0, null::timestamptz, null::text,
  -- due_date est un timestamptz : sans le cast en date, la soustraction rend
  -- un interval et greatest() ne peut plus le comparer a 0.
  public.calc_priorite_relance(false, greatest(0, current_date - coalesce(i.due_date::date, current_date)),
                               false, false, false,
                               least(60, coalesce(i.remaining_amount, 0)::integer / 20), 0, false)
from invoices i
left join contacts co on co.id = i.contact_id
where i.status in ('sent', 'partial', 'overdue')

union all

-- SAV ouverts
select
  'sav:' || s.id, s.workspace_id, 'sav',
  s.created_at + interval '3 days',
  coalesce(trim(co.first_name || ' ' || co.last_name), s.reason),
  'SAV ouvert',
  co.phone, co.city, null, null, null,
  null::uuid, null::uuid, null::uuid, null::uuid, s.case_id, null::uuid, s.id,
  0, null::timestamptz, null::text,
  public.calc_priorite_relance(false, greatest(0, current_date - (s.created_at + interval '3 days')::date),
                               false, false, false, 0, 0, false)
from after_sales_cases s
left join contacts co on co.id = s.contact_id
-- 'resolved' et 'closed' sont terminaux : seuls les SAV encore actifs
-- appellent une relance.
where s.status in ('open', 'in_progress');


-- ============ LECTURE PAGINÉE ============

create or replace function public.fetch_relances(
  p_search        text default null,
  p_kinds         text[] default null,
  p_urgencies     text[] default null,
  p_priorities    text[] default null,
  p_assigned      uuid default null,
  p_city          text default null,
  p_sort          text default 'priorite',
  p_horizon_days  integer default 7,
  p_limit         integer default 50,
  p_offset        integer default 0
)
returns table (
  id text, kind text, urgency text, due_at timestamptz, days_late integer,
  score integer, priority_level text, titre text, motif text,
  phone text, city text, insurance text, vehicule text, immatriculation text,
  assigned_user_id uuid, lead_id uuid, task_id uuid, appointment_id uuid,
  case_id uuid, invoice_id uuid, sav_id uuid,
  attempt_count integer, last_action_at timestamptz, last_action_type text,
  total_count bigint
)
language sql
stable
as $$
  with filtre as (
    select v.*,
           case
             when v.due_at::date < current_date then 'urgent'
             when v.due_at::date = current_date then 'due'
             else 'upcoming'
           end as urgency_calc,
           greatest(0, current_date - v.due_at::date) as days_late_calc,
           public.niveau_priorite(v.score) as niveau
    from public.v_relances v
    where v.due_at::date <= current_date + p_horizon_days
  ),
  applique as (
    select * from filtre f
    where (p_kinds is null or f.kind = any(p_kinds))
      and (p_urgencies is null or f.urgency_calc = any(p_urgencies))
      and (p_priorities is null or f.niveau = any(p_priorities))
      and (p_assigned is null or f.assigned_user_id = p_assigned)
      and (p_city is null or f.city ilike '%' || p_city || '%')
      and (
        p_search is null or p_search = '' or
        f.titre ilike '%' || p_search || '%' or
        f.phone ilike '%' || p_search || '%' or
        f.immatriculation ilike '%' || p_search || '%'
      )
  )
  select
    a.id, a.kind, a.urgency_calc, a.due_at, a.days_late_calc,
    a.score, a.niveau, a.titre, a.motif,
    a.phone, a.city, a.insurance, a.vehicule, a.immatriculation,
    a.assigned_user_id, a.lead_id, a.task_id, a.appointment_id,
    a.case_id, a.invoice_id, a.sav_id,
    a.attempt_count, a.last_action_at, a.last_action_type,
    count(*) over () as total_count
  from applique a
  order by
    case when p_sort = 'priorite'    then a.score end desc nulls last,
    case when p_sort = 'plus_ancien' then a.due_at end asc,
    case when p_sort = 'plus_recent' then a.due_at end desc,
    a.due_at asc
  limit p_limit offset p_offset;
$$;


-- ============ COMPTEURS D'EN-TÊTE ============
-- Ne ramène jamais les lignes : uniquement des agrégats.

create or replace function public.compter_relances(p_horizon_days integer default 7)
returns jsonb
language sql
stable
as $$
  with base as (
    select v.kind,
           case
             when v.due_at::date < current_date then 'urgent'
             when v.due_at::date = current_date then 'due'
             else 'upcoming'
           end as urgency
    from public.v_relances v
    where v.due_at::date <= current_date + p_horizon_days
  )
  select jsonb_build_object(
    'total',     (select count(*) from base),
    'urgent',    (select count(*) from base where urgency = 'urgent'),
    'due',       (select count(*) from base where urgency = 'due'),
    'upcoming',  (select count(*) from base where urgency = 'upcoming'),
    'rappel',    (select count(*) from base where kind = 'rappel'),
    'documents', (select count(*) from base where kind = 'documents'),
    'assurance', (select count(*) from base where kind = 'assurance'),
    'rdv',       (select count(*) from base where kind = 'rdv'),
    'impaye',    (select count(*) from base where kind = 'impaye'),
    'sav',       (select count(*) from base where kind = 'sav'),
    'tache',     (select count(*) from base where kind = 'tache')
  );
$$;

grant execute on function public.fetch_relances(text, text[], text[], text[], uuid, text, text, integer, integer, integer) to authenticated;
grant execute on function public.compter_relances(integer) to authenticated;
grant select on public.v_relances to authenticated;
