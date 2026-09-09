/*
# Workflows d alertes operationnelles

L editeur de scenarios savait stocker un graphe, mais aucun moteur ne lisait
ces lignes. Les compteurs et la derniere execution restaient donc decoratifs.

Cette migration installe six alertes volontairement simples et actionnables :
premier contact, tache en retard, documents non consultes, rendez-vous non
confirme, facture echue et cadeau en attente. Elles ne modifient jamais une
fiche metier : leur seule action est une notification ciblee, relayee par le
push web deja en place.

Le dedoublonnage est journalier et protege par un index unique. Une anomalie
persistante peut ainsi etre rappelee le lendemain sans produire une alerte a
chaque passage du cron. Chaque scenario limite aussi son nombre d elements par
controle pour qu un ancien stock ne noie pas l equipe lors de l activation.
*/

create extension if not exists pg_cron with schema pg_catalog;

alter table public.notifications
  add column if not exists workflow_id uuid references public.workflows(id) on delete set null,
  add column if not exists dedup_key text;

create index if not exists notifications_workflow_id_idx
  on public.notifications (workflow_id, created_at desc);

create unique index if not exists notifications_workflow_dedup_unique
  on public.notifications (workspace_id, user_id, dedup_key)
  where dedup_key is not null;

create unique index if not exists workflows_system_key_unique
  on public.workflows (workspace_id, (flow_data ->> 'system_key'))
  where flow_data ? 'system_key';

comment on column public.notifications.workflow_id is
  'Scenario ayant genere l alerte. NULL pour les notifications metier historiques.';
comment on column public.notifications.dedup_key is
  'Cle journaliere idempotente. Empeche les controles repetes de notifier deux fois le meme utilisateur.';


-- ============ INSTALLATION DES RECETTES ============

create or replace function public.installer_workflows_alertes(
  p_workspace_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_user_workspace_id uuid;
  v_role text;
  v_count integer;
begin
  if auth.uid() is not null then
    select workspace_id, role
      into v_user_workspace_id, v_role
    from public.profiles
    where id = auth.uid();

    if v_user_workspace_id is null or v_role not in ('admin', 'manager') then
      raise exception 'Seuls un administrateur ou un responsable peuvent installer les alertes.';
    end if;

    if p_workspace_id is not null and p_workspace_id <> v_user_workspace_id then
      raise exception 'Espace de travail non autorise.';
    end if;

    v_workspace_id := v_user_workspace_id;
  else
    -- Appel interne pendant la migration ou par pg_cron.
    v_workspace_id := p_workspace_id;
  end if;

  if v_workspace_id is null then
    raise exception 'Espace de travail requis.';
  end if;

  insert into public.workflows (
    workspace_id, name, description, trigger_type, trigger_config,
    conditions, actions, flow_data, enabled
  )
  values
    (
      v_workspace_id,
      'Lead sans premier contact',
      'Alerte le conseiller 2 heures apres l arrivee si le lead est toujours au debut du parcours.',
      'no_activity',
      '{"delay_hours": 2, "max_alerts": 10, "repeat_hours": 24}'::jsonb,
      '[{"type":"status","values":["new","to_call","calling"]}]'::jsonb,
      '[{"type":"send_notification","label":"Alerter le conseiller affecte"}]'::jsonb,
      '{"system_key":"lead_first_contact","managed_alert":true,"version":1}'::jsonb,
      true
    ),
    (
      v_workspace_id,
      'Tache ou relance en retard',
      'Alerte le responsable de la tache des que son echeance est depassee.',
      'schedule',
      '{"max_alerts": 15, "repeat_hours": 24}'::jsonb,
      '[{"type":"status","values":["pending","in_progress"]}]'::jsonb,
      '[{"type":"send_notification","label":"Alerter le responsable de la tache"}]'::jsonb,
      '{"system_key":"task_overdue","managed_alert":true,"version":1}'::jsonb,
      true
    ),
    (
      v_workspace_id,
      'Lien documents non consulte',
      'Alerte apres 24 heures quand le client n a pas ouvert son espace documents.',
      'document_missing',
      '{"delay_hours": 24, "max_alerts": 10, "repeat_hours": 24}'::jsonb,
      '[{"type":"documents","status":"open","last_opened_at":null}]'::jsonb,
      '[{"type":"send_notification","label":"Relancer les documents"}]'::jsonb,
      '{"system_key":"documents_unopened","managed_alert":true,"version":1}'::jsonb,
      true
    ),
    (
      v_workspace_id,
      'Rendez-vous a confirmer',
      'Alerte l equipe lorsqu un rendez-vous commence dans moins de 24 heures et reste non confirme.',
      'appointment_24h',
      '{"delay_hours": 24, "max_alerts": 15, "repeat_hours": 24}'::jsonb,
      '[{"type":"status","value":"scheduled"}]'::jsonb,
      '[{"type":"send_notification","label":"Confirmer le rendez-vous"}]'::jsonb,
      '{"system_key":"appointment_confirmation","managed_alert":true,"version":1}'::jsonb,
      true
    ),
    (
      v_workspace_id,
      'Factures arrivees a echeance',
      'Alerte la direction et la comptabilite lorsqu un solde reste a encaisser apres la date d echeance.',
      'schedule',
      '{"max_alerts": 1, "repeat_hours": 24}'::jsonb,
      '[{"type":"status","values":["sent","partial","overdue"]}]'::jsonb,
      '[{"type":"send_notification","label":"Alerter finance"}]'::jsonb,
      '{"system_key":"invoice_overdue","managed_alert":true,"version":1}'::jsonb,
      true
    ),
    (
      v_workspace_id,
      'Cadeaux et virements en attente',
      'Alerte la direction lorsqu un cadeau ou un virement attend depuis plus de 7 jours.',
      'gift_to_give',
      '{"delay_days": 7, "max_alerts": 1, "repeat_hours": 24}'::jsonb,
      '[{"type":"status","values":["pending","ordered"]}]'::jsonb,
      '[{"type":"send_notification","label":"Alerter finance"}]'::jsonb,
      '{"system_key":"gift_pending","managed_alert":true,"version":1}'::jsonb,
      true
    )
  on conflict do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.installer_workflows_alertes(uuid) from public;
grant execute on function public.installer_workflows_alertes(uuid) to authenticated;


-- ============ INSERTION CIBLEE ET IDEMPOTENTE ============

create or replace function public.creer_alerte_workflow(
  p_workflow_id uuid,
  p_workspace_id uuid,
  p_assigned_user_id uuid,
  p_fallback_roles text[],
  p_title text,
  p_body text,
  p_link text,
  p_entity_type text,
  p_entity_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_dedup_key text;
begin
  v_dedup_key := concat_ws(
    ':',
    'workflow',
    p_workflow_id::text,
    p_entity_type,
    p_entity_id::text,
    to_char(timezone('Europe/Paris', now()), 'YYYY-MM-DD')
  );

  insert into public.notifications (
    workspace_id, user_id, title, body, type, link, workflow_id, dedup_key
  )
  select
    p_workspace_id,
    destinataire.id,
    p_title,
    p_body,
    'workflow',
    p_link,
    p_workflow_id,
    v_dedup_key
  from (
    select p_assigned_user_id as id
    where p_assigned_user_id is not null
    union
    select p.id
    from public.profiles p
    where p_assigned_user_id is null
      and p.workspace_id = p_workspace_id
      and p.role = any(p_fallback_roles)
  ) destinataire
  where destinataire.id is not null
  on conflict do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.creer_alerte_workflow(
  uuid, uuid, uuid, text[], text, text, text, text, uuid
) from public;


-- ============ MOTEUR ============

create or replace function public.executer_workflows_alertes(
  p_workspace_id uuid default null,
  p_force_log boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requested_workspace_id uuid := p_workspace_id;
  v_user_workspace_id uuid;
  v_role text;
  v_workflow record;
  v_entity record;
  v_sent integer;
  v_total_sent integer := 0;
  v_checked integer := 0;
  v_limit integer;
  v_key text;
  v_run_id uuid;
begin
  if auth.uid() is not null then
    select workspace_id, role
      into v_user_workspace_id, v_role
    from public.profiles
    where id = auth.uid();

    if v_user_workspace_id is null or v_role not in ('admin', 'manager') then
      raise exception 'Seuls un administrateur ou un responsable peuvent lancer ce controle.';
    end if;

    if v_requested_workspace_id is not null and v_requested_workspace_id <> v_user_workspace_id then
      raise exception 'Espace de travail non autorise.';
    end if;

    v_requested_workspace_id := v_user_workspace_id;
  end if;

  for v_workflow in
    select w.*
    from public.workflows w
    where w.enabled
      and coalesce((w.flow_data ->> 'managed_alert')::boolean, false)
      and (v_requested_workspace_id is null or w.workspace_id = v_requested_workspace_id)
    order by w.created_at
  loop
    v_checked := v_checked + 1;
    v_sent := 0;
    v_key := v_workflow.flow_data ->> 'system_key';
    v_limit := least(greatest(coalesce((v_workflow.trigger_config ->> 'max_alerts')::integer, 10), 1), 50);

    begin
      if v_key = 'lead_first_contact' then
        for v_entity in
          select
            l.id,
            l.assigned_user_id,
            nullif(trim(concat_ws(' ', l.first_name, l.last_name)), '') as lead_name,
            l.phone,
            l.city,
            l.arrive_le
          from public.leads l
          where l.workspace_id = v_workflow.workspace_id
            and l.archived_at is null
            and l.status in ('new', 'to_call', 'calling')
            and l.last_contacted_at is null
            and l.arrive_le <= now() - make_interval(hours => coalesce((v_workflow.trigger_config ->> 'delay_hours')::integer, 2))
          order by l.arrive_le
          limit v_limit
        loop
          v_sent := v_sent + public.creer_alerte_workflow(
            v_workflow.id,
            v_workflow.workspace_id,
            v_entity.assigned_user_id,
            array['admin', 'manager', 'advisor'],
            'Lead a rappeler maintenant',
            coalesce(v_entity.lead_name, 'Lead sans nom')
              || coalesce(' · ' || nullif(v_entity.city, ''), '')
              || coalesce(' · ' || nullif(v_entity.phone, ''), '')
              || ' · aucun premier contact depuis plus de 2 h.',
            '/interventions/' || v_entity.id,
            'lead',
            v_entity.id
          );
        end loop;

      elsif v_key = 'task_overdue' then
        for v_entity in
          select
            t.id,
            coalesce(t.assigned_user_id, l.assigned_user_id) as assigned_user_id,
            t.lead_id,
            t.title,
            t.priority,
            t.due_at
          from public.tasks t
          left join public.leads l on l.id = t.lead_id
          where t.workspace_id = v_workflow.workspace_id
            and t.status in ('pending', 'in_progress')
            and t.due_at is not null
            and t.due_at < now()
          order by
            case t.priority when 'urgent' then 0 when 'high' then 1 else 2 end,
            t.due_at
          limit v_limit
        loop
          v_sent := v_sent + public.creer_alerte_workflow(
            v_workflow.id,
            v_workflow.workspace_id,
            v_entity.assigned_user_id,
            array['admin', 'manager', 'advisor'],
            case when v_entity.priority in ('urgent', 'high') then 'Tache prioritaire en retard' else 'Tache en retard' end,
            v_entity.title || ' · echeance ' || to_char(v_entity.due_at at time zone 'Europe/Paris', 'DD/MM a HH24:MI'),
            case when v_entity.lead_id is not null then '/interventions/' || v_entity.lead_id else '/relances' end,
            'task',
            v_entity.id
          );
        end loop;

      elsif v_key = 'documents_unopened' then
        for v_entity in
          select
            r.id,
            r.lead_id,
            l.assigned_user_id,
            nullif(trim(concat_ws(' ', l.first_name, l.last_name)), '') as lead_name,
            r.created_at
          from public.client_document_requests r
          join public.leads l on l.id = r.lead_id
          where r.workspace_id = v_workflow.workspace_id
            and r.status = 'open'
            and r.last_opened_at is null
            and r.created_at <= now() - make_interval(hours => coalesce((v_workflow.trigger_config ->> 'delay_hours')::integer, 24))
          order by r.created_at
          limit v_limit
        loop
          v_sent := v_sent + public.creer_alerte_workflow(
            v_workflow.id,
            v_workflow.workspace_id,
            v_entity.assigned_user_id,
            array['admin', 'manager', 'advisor'],
            'Documents : lien non consulte',
            coalesce(v_entity.lead_name, 'Client sans nom') || ' n a pas encore ouvert son espace documents.',
            '/interventions/' || v_entity.lead_id,
            'document_request',
            v_entity.id
          );
        end loop;

      elsif v_key = 'appointment_confirmation' then
        for v_entity in
          select a.id, a.lead_id, a.assigned_user_id, a.title, a.start_time
          from public.appointments a
          where a.workspace_id = v_workflow.workspace_id
            and a.status = 'scheduled'
            and a.start_time > now()
            and a.start_time <= now() + make_interval(hours => coalesce((v_workflow.trigger_config ->> 'delay_hours')::integer, 24))
          order by a.start_time
          limit v_limit
        loop
          v_sent := v_sent + public.creer_alerte_workflow(
            v_workflow.id,
            v_workflow.workspace_id,
            v_entity.assigned_user_id,
            array['admin', 'manager', 'advisor', 'technician'],
            'Rendez-vous a confirmer',
            v_entity.title || ' · ' || to_char(v_entity.start_time at time zone 'Europe/Paris', 'DD/MM a HH24:MI'),
            case when v_entity.lead_id is not null then '/interventions/' || v_entity.lead_id else '/calendar' end,
            'appointment',
            v_entity.id
          );
        end loop;

      elsif v_key = 'invoice_overdue' then
        select
          count(*)::integer as item_count,
          coalesce(sum(i.remaining_amount), 0)::numeric as amount_due
        into v_entity
        from public.invoices i
        where i.workspace_id = v_workflow.workspace_id
          and i.status in ('sent', 'partial', 'overdue')
          and i.due_date is not null
          and i.due_date < now()
          and i.remaining_amount > 0;

        if v_entity.item_count > 0 then
          v_sent := v_sent + public.creer_alerte_workflow(
            v_workflow.id,
            v_workflow.workspace_id,
            null,
            array['admin', 'manager', 'accountant'],
            v_entity.item_count || case when v_entity.item_count > 1 then ' factures en retard' else ' facture en retard' end,
            trim(to_char(v_entity.amount_due, 'FM999G999G990D00')) || ' EUR restent a encaisser ou rapprocher.',
            '/finance',
            'workspace_finance',
            v_workflow.workspace_id
          );
        end if;

      elsif v_key = 'gift_pending' then
        select
          count(*)::integer as item_count,
          min(g.created_at) as oldest_at
        into v_entity
        from public.gifts g
        where g.workspace_id = v_workflow.workspace_id
          and g.status in ('pending', 'ordered')
          and g.created_at <= now() - make_interval(days => coalesce((v_workflow.trigger_config ->> 'delay_days')::integer, 7));

        if v_entity.item_count > 0 then
          v_sent := v_sent + public.creer_alerte_workflow(
            v_workflow.id,
            v_workflow.workspace_id,
            null,
            array['admin', 'manager', 'accountant'],
            v_entity.item_count || case when v_entity.item_count > 1 then ' cadeaux ou virements en attente' else ' cadeau ou virement en attente' end,
            'Le plus ancien attend depuis le ' || to_char(v_entity.oldest_at at time zone 'Europe/Paris', 'DD/MM/YYYY') || '.',
            '/finance',
            'workspace_gifts',
            v_workflow.workspace_id
          );
        end if;
      end if;

      update public.workflows
      set success_count = coalesce(success_count, 0) + v_sent,
          last_run_at = now(),
          updated_at = now()
      where id = v_workflow.id;

      if v_sent > 0 or p_force_log then
        insert into public.workflow_runs (
          workspace_id, workflow_id, entity_type, entity_id, status,
          execution_log, started_at, completed_at
        )
        values (
          v_workflow.workspace_id,
          v_workflow.id,
          'batch',
          null,
          'success',
          jsonb_build_array(jsonb_build_object(
            'message', case when v_sent > 0 then v_sent || ' notification(s) creee(s)' else 'Aucune alerte a creer' end,
            'notifications_created', v_sent,
            'source', case when p_force_log then 'manual' else 'cron' end
          )),
          now(),
          now()
        )
        returning id into v_run_id;
      end if;

      v_total_sent := v_total_sent + v_sent;
    exception
      when others then
        update public.workflows
        set failure_count = coalesce(failure_count, 0) + 1,
            last_run_at = now(),
            updated_at = now()
        where id = v_workflow.id;

        insert into public.workflow_runs (
          workspace_id, workflow_id, entity_type, status,
          error_message, execution_log, started_at, completed_at
        )
        values (
          v_workflow.workspace_id,
          v_workflow.id,
          'batch',
          'failed',
          sqlerrm,
          jsonb_build_array(jsonb_build_object('message', 'Controle interrompu', 'error', sqlerrm)),
          now(),
          now()
        );
    end;
  end loop;

  return jsonb_build_object(
    'workflows_checked', v_checked,
    'notifications_created', v_total_sent,
    'checked_at', now()
  );
end;
$$;

revoke all on function public.executer_workflows_alertes(uuid, boolean) from public;
grant execute on function public.executer_workflows_alertes(uuid, boolean) to authenticated;


-- Installe les recettes dans les espaces deja presents. Elles sont actives des
-- le prochain controle, mais les limites evitent une avalanche historique.
do $$
declare
  v_workspace record;
begin
  for v_workspace in select id from public.workspaces loop
    perform public.installer_workflows_alertes(v_workspace.id);
  end loop;
end;
$$;


-- ============ CONTROLE TOUTES LES 15 MINUTES ============

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'workflow-alerts'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$$;

select cron.schedule(
  'workflow-alerts',
  '*/15 * * * *',
  $cron$select public.executer_workflows_alertes(null, false);$cron$
);
