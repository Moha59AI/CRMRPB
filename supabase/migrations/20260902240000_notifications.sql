/*
# Notifications

## Le manque

La table `notifications` existait depuis le début, avec ses politiques RLS et
deux fonctions de service dans le code. Personne ne l'écrivait, personne ne la
lisait : zéro ligne, aucun écran.

Or c'est précisément ce qui manquait le soir. Un lead Meta arrive à 22 h,
personne ne le voit avant le lendemain matin — et un prospect vitrage rappelé
le lendemain a souvent déjà appelé ailleurs.

## Qui est prévenu

Le lead assigné à quelqu'un ne prévient que cette personne : la notifier tous
diluerait la responsabilité, et chacun supposerait que l'autre s'en occupe.

Un lead sans affectation prévient tous ceux qui peuvent le traiter —
administrateurs, responsables, conseillers. Ni le technicien ni le comptable,
qui n'ont rien à en faire.

## Ce qui ne déclenche pas de notification

Un lead créé à la main. La personne qui le saisit est devant son écran : la
prévenir de ce qu'elle vient de faire est du bruit, et le bruit apprend à
ignorer les notifications suivantes.

## Le temps réel

La table entre dans la publication `supabase_realtime`. Sans cela, la cloche
n'apparaîtrait qu'au prochain rechargement — ce qui n'est pas une
notification, c'est une liste.
*/

-- Le trigger ecrit pour d'autres utilisateurs que l'appelant : les politiques
-- RLS l'en empecheraient sans SECURITY DEFINER.
create or replace function public.notifier_nouveau_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nom text;
  v_titre text;
  v_corps text;
begin
  -- Un lead saisi a la main n'a pas a etre annonce a celui qui le saisit.
  if new.source = 'manual' then
    return new;
  end if;

  v_nom := nullif(trim(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, '')), '');

  v_titre := case new.source
    when 'meta' then 'Nouveau lead Meta'
    when 'webhook' then 'Nouveau lead du site'
    else 'Nouveau lead'
  end;

  v_corps := coalesce(v_nom, 'Sans nom')
    || coalesce(' — ' || nullif(new.city, ''), '')
    || coalesce(' — ' || nullif(new.phone, ''), '');

  if new.assigned_user_id is not null then
    -- Assigne : une seule personne prevenue, donc une seule responsable.
    insert into notifications (workspace_id, user_id, title, body, type, link)
    values (new.workspace_id, new.assigned_user_id, v_titre, v_corps,
            'lead', '/interventions/' || new.id);
  else
    -- Sans affectation : tous ceux qui peuvent le traiter. Ni le technicien
    -- ni le comptable, qui n'ont rien a en faire.
    insert into notifications (workspace_id, user_id, title, body, type, link)
    select new.workspace_id, p.id, v_titre, v_corps, 'lead', '/interventions/' || new.id
    from profiles p
    where p.workspace_id = new.workspace_id
      and p.role in ('admin', 'manager', 'advisor');
  end if;

  return new;
exception
  when others then
    -- Une notification qui echoue ne doit jamais faire perdre un lead.
    raise warning 'notifier_nouveau_lead a echoue pour %: %', new.id, sqlerrm;
    return new;
end;
$$;

drop trigger if exists leads_notifier_nouveau on public.leads;
create trigger leads_notifier_nouveau
  after insert on public.leads
  for each row execute function public.notifier_nouveau_lead();


-- ============ LECTURE ET MARQUAGE ============

create or replace function public.compter_notifications_non_lues()
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::integer from notifications
  where user_id = auth.uid() and not read;
$$;

grant execute on function public.compter_notifications_non_lues() to authenticated;

create or replace function public.marquer_notifications_lues()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_nb integer;
begin
  update notifications set read = true
  where user_id = auth.uid() and not read;
  get diagnostics v_nb = row_count;
  return v_nb;
end;
$$;

grant execute on function public.marquer_notifications_lues() to authenticated;


-- ============ TEMPS RÉEL ============
-- Sans publication, la cloche n'apparaitrait qu'au prochain rechargement :
-- ce n'est plus une notification, c'est une liste.

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;   -- deja publiee
  when undefined_object then
    raise notice 'Publication supabase_realtime absente : le temps reel ne sera pas actif.';
end $$;


-- ============ RATTRAPAGE ============
-- Les leads deja recus ne declenchent rien : notifier a posteriori de
-- trois cents leads noierait l'utilisateur des sa premiere ouverture, et
-- aucune de ces alertes ne serait actionnable.
