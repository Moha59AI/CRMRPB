/*
# Les relances les plus récentes d'abord

## Ce qui n'allait pas

Le tri par défaut était « priorité recommandée », et le score de priorité
**augmente avec le retard** : `calc_priorite_relance` ajoute des points par
jour d'échéance dépassée. Les leads les plus vieux remontaient donc
mécaniquement en tête de file, et un lead arrivé il y a une heure se
retrouvait derrière trois semaines d'arriéré.

C'était défendable sur le papier — le plus en retard est le plus urgent — et
faux en pratique : un prospect vitrage qu'on rappelle trois semaines après a
déjà fait poser son pare-brise ailleurs. La fraîcheur prime sur le retard.

## Ce qui change

Le tri par défaut devient l'arrivée, du plus récent au plus ancien.

`arrive_le` entre dans la vue pour que le tri porte sur la date d'arrivée
réelle et non sur `due_at`. La distinction compte : un NRP replanifié à sept
jours a une échéance proche alors qu'il est arrivé il y a trois semaines.
Trier sur l'échéance l'aurait fait passer pour récent.

Les autres lignes de la file — tâches, rendez-vous, dossiers en attente de
documents — n'ont pas de date d'arrivée : elles utilisent leur propre date de
référence pour rester intercalées au bon endroit.

Le tri par priorité reste disponible dans le menu, pour qui veut rattraper
l'arriéré.
*/

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
  -- Un lead archive quitte la file : sans ce filtre, l'archivage
  -- n'allegerait rien.
  where l.archived_at is null
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
  lr.arrive_le,
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
  t.due_at,
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
  ap.start_time,
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
  wc.updated_at,
  0, null::timestamptz, null::text, null::integer,
  public.calc_priorite_relance(false, greatest(0, current_date - (wc.updated_at + interval '2 days')::date),
                               false, true, false, 0, 0, false)
from windscreen_cases wc
left join contacts co on co.id = wc.contact_id
where wc.status = 'documents_pending';


grant select on public.v_relances to authenticated;


-- ============ LECTURE ============
-- `arrive_le` s'ajoute au contrat de retour : PostgreSQL refuse un
-- CREATE OR REPLACE qui change le type de retour, il faut donc supprimer
-- la fonction d'abord.

drop function if exists public.fetch_relances(text, text[], text[], text[], uuid, text, text, integer, integer, integer);

create function public.fetch_relances(
  p_search text default null,
  p_kinds text[] default null,
  p_urgencies text[] default null,
  p_priorities text[] default null,
  p_assigned uuid default null,
  p_city text default null,
  -- Le defaut change : l'arrivee la plus recente d'abord.
  p_sort text default 'plus_recent',
  p_horizon_days integer default 7,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id text, kind text, urgency text, due_at timestamptz, days_late integer,
  waiting_minutes integer, score integer, priority_level text, titre text, motif text,
  phone text, city text, insurance text, vehicule text, immatriculation text,
  assigned_user_id uuid, lead_id uuid, task_id uuid, appointment_id uuid,
  case_id uuid, invoice_id uuid, sav_id uuid,
  arrive_le timestamptz,
  attempt_count integer, last_action_at timestamptz, last_action_type text,
  total_count bigint
)
language sql
stable
as $$
  with filtre as (
    select v.*,
           case
             when v.due_at <= now() and v.due_at::date < current_date then 'urgent'
             when v.due_at <= now() then 'due'
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
      and (p_search is null or p_search = '' or
           f.titre ilike '%' || p_search || '%' or
           f.phone ilike '%' || p_search || '%' or
           f.immatriculation ilike '%' || p_search || '%')
  )
  select
    a.id, a.kind, a.urgency_calc, a.due_at, a.days_late_calc, a.waiting_minutes,
    a.score, a.niveau, a.titre, a.motif,
    a.phone, a.city, a.insurance, a.vehicule, a.immatriculation,
    a.assigned_user_id, a.lead_id, a.task_id, a.appointment_id,
    a.case_id, a.invoice_id, a.sav_id,
    a.arrive_le,
    a.attempt_count, a.last_action_at, a.last_action_type,
    count(*) over () as total_count
  from applique a
  order by
    -- Le tri porte sur l'arrivee, pas sur l'echeance : un NRP replanifie a
    -- sept jours a une echeance proche alors qu'il est arrive il y a trois
    -- semaines.
    case when p_sort = 'plus_recent'  then a.arrive_le end desc nulls last,
    case when p_sort = 'plus_ancien'  then a.arrive_le end asc  nulls last,
    case when p_sort = 'priorite'     then a.score end desc nulls last,
    a.arrive_le desc nulls last;
$$;

grant execute on function public.fetch_relances(text, text[], text[], text[], uuid, text, text, integer, integer, integer) to authenticated;
