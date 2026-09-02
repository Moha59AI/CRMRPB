/*
# Archivage des leads

## Le besoin

355 leads dans la liste, dont 345 jamais contactés. La file de relances et
la liste des leads deviennent illisibles : ce qui arrive aujourd'hui se noie
dans ce qui traîne depuis des semaines.

## Archiver, pas supprimer

`archived_at` est une date, pas une suppression. Un lead archivé sort des
listes et de la file de relances, mais reste rattaché à son client, garde son
historique et se retrouve. Supprimer ferait perdre l'information — y compris
la trace qu'on a bien reçu ce prospect, ce qui compte face à Meta.

Désarchiver est un simple passage à NULL.

## Ce que l'archivage n'est pas

Ce n'est pas un jugement sur le lead. Un lead archivé peut être excellent : il
est seulement sorti du champ de travail immédiat. C'est pourquoi la fonction
distingue les leads jamais contactés — les enterrer sans les avoir appelés une
seule fois est une décision, pas un rangement, et elle doit être explicite.
*/

alter table public.leads
  add column if not exists archived_at timestamptz;

comment on column public.leads.archived_at is
  'Date de sortie du champ de travail. NULL = actif. Ce n''est pas une suppression : le lead reste rattache a son client et se retrouve.';

/*
 * Date d'arrivee reelle.
 *
 * Trier sur `created_at` est faux pour les leads Meta : c'est la date
 * d'ecriture en base, pas celle ou le prospect a rempli le formulaire. Un
 * import massif les daterait tous du meme jour. `received_at` porte la
 * verite quand elle existe.
 *
 * Colonne calculee et stockee plutot que `coalesce` dans chaque requete :
 * PostgREST ne sait pas trier sur une expression, et un index sur une
 * colonne reelle est plus simple a raisonner.
 */
alter table public.leads
  add column if not exists arrive_le timestamptz
    generated always as (coalesce(received_at, created_at)) stored;

comment on column public.leads.arrive_le is
  'Date d''arrivee du prospect : received_at quand elle existe, created_at sinon. Sert au tri du plus recent au plus ancien.';

create index if not exists leads_arrive_le_idx
  on public.leads (workspace_id, arrive_le desc);

-- Toutes les listes filtrent sur cette colonne : sans index, chaque ouverture
-- de la page Leads balaie la table entiere.
create index if not exists leads_actifs_idx
  on public.leads (workspace_id, arrive_le desc)
  where archived_at is null;

create index if not exists leads_archives_idx
  on public.leads (workspace_id, archived_at desc)
  where archived_at is not null;


-- ============ COMBIEN SERAIENT ARCHIVÉS ============
-- Le chiffre se voit avant d'agir. Archiver 340 leads d'un clic sans savoir
-- combien on en enterre serait une mauvaise surprise irrattrapable a la main.

create or replace function public.compter_leads_archivables(p_jours integer default 2)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'total',            count(*),
    'jamais_contactes', count(*) filter (where last_contacted_at is null),
    'deja_contactes',   count(*) filter (where last_contacted_at is not null),
    'plus_ancien',      min(coalesce(received_at, created_at)),
    'plus_recent',      max(coalesce(received_at, created_at))
  )
  from leads
  where workspace_id = public.get_workspace_id()
    and archived_at is null
    and coalesce(received_at, created_at) < now() - make_interval(days => p_jours);
$$;

grant execute on function public.compter_leads_archivables(integer) to authenticated;


-- ============ ARCHIVER ============

/*
 * `p_inclure_jamais_contactes` est a false par defaut, et c'est deliberé.
 *
 * Enterrer un lead qu'on n'a jamais appele n'est pas du rangement : c'est
 * renoncer a une affaire. Le defaut protege donc le pipeline, et il faut
 * demander explicitement pour l'outrepasser.
 */
create or replace function public.archiver_leads_anciens(
  p_jours integer default 2,
  p_inclure_jamais_contactes boolean default false
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ws uuid := public.get_workspace_id();
  v_nb integer;
begin
  if v_ws is null then
    raise exception 'Aucun espace de travail';
  end if;

  if p_jours < 0 then
    raise exception 'Le nombre de jours ne peut pas etre negatif';
  end if;

  -- Les politiques RLS decident si l'ecriture aboutit : un conseiller qui
  -- appellerait cette fonction n'archiverait rien.
  update leads
  set archived_at = now()
  where workspace_id = v_ws
    and archived_at is null
    and coalesce(received_at, created_at) < now() - make_interval(days => p_jours)
    and (p_inclure_jamais_contactes or last_contacted_at is not null);

  get diagnostics v_nb = row_count;

  insert into audit_logs (workspace_id, user_id, action, entity_type, metadata)
  values (v_ws, auth.uid(), 'leads_archives', 'lead',
          jsonb_build_object('nombre', v_nb, 'jours', p_jours,
                             'jamais_contactes_inclus', p_inclure_jamais_contactes));

  return v_nb;
end;
$$;

grant execute on function public.archiver_leads_anciens(integer, boolean) to authenticated;


create or replace function public.desarchiver_lead(p_lead uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  update leads set archived_at = null
  where id = p_lead and workspace_id = public.get_workspace_id();
$$;

grant execute on function public.desarchiver_lead(uuid) to authenticated;


-- ============ LA FILE DE RELANCES IGNORE LES ARCHIVÉS ============
-- Sans ce filtre, archiver n'allegerait pas la file : les leads
-- disparaitraient de la liste mais continueraient a reclamer une relance.

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
