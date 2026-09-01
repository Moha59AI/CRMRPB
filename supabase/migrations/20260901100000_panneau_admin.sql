/*
# Panneau de contrôle administrateur

## Ce qui manquait

Trois choses, chacune obligeant à ouvrir le SQL Editor pour une tâche
d'administration courante :

1. **Les réglages de l'entreprise n'étaient nulle part.** La page les tenait
   dans un `useState` : le nom, l'adresse, les horaires et les zones
   disparaissaient au rechargement. `workspaces` n'a que `name` et `slug`.

2. **L'état du système n'était pas consultable.** Savoir si les leads Meta
   arrivaient demandait quatre requêtes SQL à la main. Un exploitant ne doit
   pas avoir à interroger `webhook_events` pour découvrir que sa file est
   bloquée depuis la veille.

3. **Le rôle d'un membre ne pouvait pas changer depuis l'application**, et
   retirer un accès non plus.

## Le garde-fou qui compte

`changer_role_membre` et `retirer_membre` refusent de supprimer le dernier
administrateur. Sans cela, un administrateur unique peut se rétrograder d'un
clic et verrouiller définitivement l'espace : plus personne ne peut inviter,
ni gérer les intégrations, et `initialiser_premier_admin` refuse de
s'exécuter puisque des profils existent. La seule issue serait le SQL Editor.

## Retirer un accès

`retirer_membre` supprime le profil, pas le compte `auth.users`. C'est
exactement la révocation voulue : le compte peut toujours s'authentifier mais
`get_workspace_id()` renvoie NULL, donc toutes les politiques RLS échouent et
la personne ne voit rien. Échec fermé, cohérent avec l'accès sur invitation.
*/

-- ============ RÉGLAGES DE L'ENTREPRISE ============
-- Un jsonb plutôt que dix colonnes : ces réglages sont de l'affichage et de
-- la préférence, pas des données jointes ou filtrées. Les figer en colonnes
-- imposerait une migration à chaque champ ajouté.

alter table workspaces
  add column if not exists settings jsonb not null default '{}'::jsonb;

comment on column workspaces.settings is
  'Coordonnées, zones d''intervention, horaires et préférences. Lu par le panneau de réglages.';


-- ============ ÉTAT DU SYSTÈME ============
-- Une seule fonction plutôt que six requêtes depuis le navigateur : les
-- comptages traversent cinq tables, et l'agrégat n'a d'intérêt que complet.

create or replace function public.etat_du_systeme()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws uuid;
  v_meta jsonb;
  v_equipe jsonb;
  v_leads jsonb;
  v_cron jsonb;
begin
  select workspace_id into v_ws from profiles
  where id = auth.uid() and role = 'admin';

  if v_ws is null then
    raise exception 'Reserve aux administrateurs';
  end if;

  -- File Meta : c'est le point qui casse en silence, donc le premier affiché.
  select jsonb_build_object(
    'en_attente',   count(*) filter (where processing_status = 'pending'),
    'en_erreur',    count(*) filter (where processing_status = 'error'),
    'traites',      count(*) filter (where processing_status = 'processed'),
    'traites_24h',  count(*) filter (
                      where processing_status = 'processed'
                        and processed_at > now() - interval '24 hours'),
    'dernier_recu', max(received_at),
    'dernier_traite', max(processed_at)
  ) into v_meta
  from webhook_events
  where workspace_id = v_ws and provider = 'meta';

  select jsonb_build_object(
    'membres', (select count(*) from profiles where workspace_id = v_ws),
    'par_role', (
      select coalesce(jsonb_object_agg(role, n), '{}'::jsonb)
      from (select role, count(*) as n from profiles
            where workspace_id = v_ws group by role) r
    ),
    'invitations_en_attente', (
      select count(*) from invitations
      where workspace_id = v_ws and accepted_at is null and expires_at > now()
    ),
    'invitations_expirees', (
      select count(*) from invitations
      where workspace_id = v_ws and accepted_at is null and expires_at <= now()
    )
  ) into v_equipe;

  select jsonb_build_object(
    'total',        count(*),
    'recus_24h',    count(*) filter (where created_at > now() - interval '24 hours'),
    'jamais_contactes', count(*) filter (where last_contacted_at is null
                                           and status not in ('lost', 'converted')),
    'convertis',    count(*) filter (where status = 'converted')
  ) into v_leads
  from leads where workspace_id = v_ws;

  -- pg_cron peut ne pas être installé, et `cron` n'est pas dans le
  -- search_path : référence qualifiée, et on avale l'échec plutôt que de
  -- faire tomber tout le panneau pour une brique optionnelle.
  begin
    select jsonb_build_object(
      'planifie',    true,
      'derniere_execution', max(d.start_time),
      'dernier_statut',     (array_agg(d.status order by d.start_time desc))[1],
      'dernier_message',    (array_agg(d.return_message order by d.start_time desc))[1],
      'echecs_recents', count(*) filter (
                          where d.status <> 'succeeded'
                            and d.start_time > now() - interval '1 hour')
    ) into v_cron
    from cron.job j
    join cron.job_run_details d on d.jobid = j.jobid
    where j.jobname = 'meta-process-queue'
      and d.start_time > now() - interval '24 hours';
  exception when others then
    v_cron := jsonb_build_object('planifie', null, 'erreur', sqlerrm);
  end;

  return jsonb_build_object(
    'meta',   coalesce(v_meta, '{}'::jsonb),
    'equipe', coalesce(v_equipe, '{}'::jsonb),
    'leads',  coalesce(v_leads, '{}'::jsonb),
    'cron',   coalesce(v_cron, jsonb_build_object('planifie', null)),
    'integrations', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'provider', provider, 'nom', name, 'statut', status,
        'derniere_reussite', last_success_at, 'derniere_erreur', last_error
      ) order by provider), '[]'::jsonb)
      from integration_connections where workspace_id = v_ws
    ),
    'genere_a', now()
  );
end;
$$;

revoke all on function public.etat_du_systeme() from public, anon;
grant execute on function public.etat_du_systeme() to authenticated;


-- ============ CHANGER LE RÔLE D'UN MEMBRE ============

create or replace function public.changer_role_membre(
  p_membre uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws uuid;
  v_role_actuel text;
  v_nb_admins integer;
begin
  select workspace_id into v_ws from profiles
  where id = auth.uid() and role = 'admin';

  if v_ws is null then
    raise exception 'Seul un administrateur peut changer un role';
  end if;

  if p_role not in ('admin', 'manager', 'advisor', 'technician', 'accountant') then
    raise exception 'Role inconnu : %', p_role;
  end if;

  select role into v_role_actuel from profiles
  where id = p_membre and workspace_id = v_ws;

  if v_role_actuel is null then
    raise exception 'Ce membre ne fait pas partie de votre espace';
  end if;

  if v_role_actuel = p_role then
    return;
  end if;

  -- Retirer le dernier administrateur verrouille l'espace : plus personne ne
  -- peut inviter ni administrer, et initialiser_premier_admin refuse de
  -- s'executer des qu'un profil existe.
  if v_role_actuel = 'admin' and p_role <> 'admin' then
    select count(*) into v_nb_admins from profiles
    where workspace_id = v_ws and role = 'admin';

    if v_nb_admins <= 1 then
      raise exception 'Impossible : cet espace n''aurait plus aucun administrateur';
    end if;
  end if;

  update profiles set role = p_role, updated_at = now()
  where id = p_membre and workspace_id = v_ws;

  insert into audit_logs (workspace_id, user_id, action, entity_type, entity_id, metadata)
  values (v_ws, auth.uid(), 'role_modifie', 'profile', p_membre::text,
          jsonb_build_object('avant', v_role_actuel, 'apres', p_role));
end;
$$;

revoke all on function public.changer_role_membre(uuid, text) from public, anon;
grant execute on function public.changer_role_membre(uuid, text) to authenticated;


-- ============ RETIRER UN ACCÈS ============

create or replace function public.retirer_membre(p_membre uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws uuid;
  v_role text;
  v_nb_admins integer;
begin
  select workspace_id into v_ws from profiles
  where id = auth.uid() and role = 'admin';

  if v_ws is null then
    raise exception 'Seul un administrateur peut retirer un acces';
  end if;

  if p_membre = auth.uid() then
    raise exception 'Vous ne pouvez pas retirer votre propre acces';
  end if;

  select role into v_role from profiles
  where id = p_membre and workspace_id = v_ws;

  if v_role is null then
    raise exception 'Ce membre ne fait pas partie de votre espace';
  end if;

  if v_role = 'admin' then
    select count(*) into v_nb_admins from profiles
    where workspace_id = v_ws and role = 'admin';

    if v_nb_admins <= 1 then
      raise exception 'Impossible : cet espace n''aurait plus aucun administrateur';
    end if;
  end if;

  -- On supprime le profil, pas le compte auth.users : sans profil,
  -- get_workspace_id() renvoie NULL et toutes les politiques RLS echouent.
  delete from profiles where id = p_membre and workspace_id = v_ws;

  insert into audit_logs (workspace_id, user_id, action, entity_type, entity_id, metadata)
  values (v_ws, auth.uid(), 'acces_retire', 'profile', p_membre::text,
          jsonb_build_object('role', v_role));
end;
$$;

revoke all on function public.retirer_membre(uuid) from public, anon;
grant execute on function public.retirer_membre(uuid) to authenticated;
