/*
# Code postal dans les notifications mobiles de nouveaux leads

La notification interne conserve les informations utiles au traitement du
prospect, mais elle peut aussi apparaitre sur un ecran verrouille. Deux champs
dedies limitent donc le contenu du Web Push a la source d'acquisition et a un
code postal strictement valide. Le nom, le telephone, la ville et l'adresse ne
quittent jamais le CRM.

Ces colonnes appartiennent a la table notifications existante : ses quatre
politiques RLS continuent de s'appliquer sans ouvrir de nouvel acces.
*/

alter table public.notifications
  add column if not exists push_title text,
  add column if not exists push_body text;

comment on column public.notifications.push_title is
  'Titre volontairement limite pour un affichage Web Push sur ecran verrouille.';
comment on column public.notifications.push_body is
  'Corps volontairement limite pour un affichage Web Push sur ecran verrouille.';

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
  v_titre_push text;
  v_corps_push text;
  v_code_postal text;
begin
  -- Un lead saisi a la main n'a pas a etre annonce a celui qui le saisit.
  if new.source = 'manual' then
    return new;
  end if;

  v_nom := nullif(trim(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, '')), '');

  v_titre := case new.source
    when 'meta' then 'Nouveau lead Meta'
    when 'google_ads' then 'Nouveau lead Google Ads'
    when 'webhook' then 'Nouveau lead Google Ads'
    else 'Nouveau lead'
  end;

  v_corps := coalesce(v_nom, 'Sans nom')
    || coalesce(' — ' || nullif(new.city, ''), '')
    || coalesce(' — ' || nullif(new.phone, ''), '');

  v_code_postal := regexp_replace(coalesce(new.postal_code, ''), '[^0-9]', '', 'g');
  if length(v_code_postal) <> 5 then
    v_code_postal := null;
  end if;

  v_titre_push := case new.source
    when 'meta' then 'Nouveau lead Meta'
    when 'google_ads' then 'Nouveau lead Google Ads'
    when 'webhook' then 'Nouveau lead Google Ads'
    else 'Nouveau lead CRM'
  end;
  v_corps_push := 'Code postal ' || coalesce(v_code_postal, 'non renseigné');

  if new.assigned_user_id is not null then
    insert into notifications (
      workspace_id,
      user_id,
      title,
      body,
      type,
      link,
      push_title,
      push_body
    ) values (
      new.workspace_id,
      new.assigned_user_id,
      v_titre,
      v_corps,
      'lead',
      '/interventions/' || new.id,
      v_titre_push,
      v_corps_push
    );
  else
    insert into notifications (
      workspace_id,
      user_id,
      title,
      body,
      type,
      link,
      push_title,
      push_body
    )
    select
      new.workspace_id,
      p.id,
      v_titre,
      v_corps,
      'lead',
      '/interventions/' || new.id,
      v_titre_push,
      v_corps_push
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
