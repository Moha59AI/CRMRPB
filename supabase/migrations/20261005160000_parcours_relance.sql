/*
# Un vrai parcours de relance

## Ce qui n'allait pas

La cadence existait -- une table, une vue qui la lit -- mais rien ne la
faisait avancer de façon fiable.

`attempt_count` n'etait incremente que par un trigger sur `communications`,
quand une ligne d'appel sortant etait ecrite. Or marquer « sans reponse »
depuis la fiche n'ecrit aucune communication : le compteur restait a zero,
la cadence restait a sa premiere marche, et le lead revenait indefiniment
au meme delai. Onze leads en NRP sont a zero tentative pour cette raison.

Et au bout de la cadence, rien ne se passait : le lead sortait simplement
de la file, en NRP pour toujours, invisible et jamais clos.

## Le parcours retenu

| Moment | Delai |
|---|---|
| Le lead arrive | tout de suite |
| 1re tentative sans reponse | +2 h |
| 2e | le lendemain |
| 3e | le lendemain, 4 h plus tard |
| 4e | J+3 |
| 5e | perdu |

## Les trois corrections

1. Le compteur suit le **resultat d'appel**, pas la trace de communication.
   C'est le statut qui fait foi -- le code le disait deja en commentaire sans
   que la base le fasse.
2. Le trigger de communications garde `last_contacted_at` et cesse de
   compter : deux sources pour un meme compteur, c'etait un double comptage
   depuis la file de relances.
3. Une cadence epuisee clot le lead, avec une note qui dit pourquoi.
*/

-- ── 1. Le parcours ────────────────────────────────────────────────────────

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
    -- Deux rappels le lendemain : le matin, puis l'apres-midi. Un seul essai
    -- par jour laisse passer celui qui ne decroche jamais avant midi.
    (p_workspace, 'nrp',                 3, interval '4 hours'),
    (p_workspace, 'nrp',                 4, interval '2 days'),
    -- Cinquieme tentative sans reponse : le lead est clos. Rappeler
    -- indefiniment un numero muet encombre la file et fait perdre du temps.
    (p_workspace, 'nrp',                 5, null)
  on conflict (workspace_id, statut, tentative_min) do nothing;
$$;

update public.relance_cadences set delai = interval '4 hours'
 where statut = 'nrp' and tentative_min = 3;
update public.relance_cadences set delai = interval '2 days'
 where statut = 'nrp' and tentative_min = 4;

-- ── 2. Un compteur, une source ────────────────────────────────────────────

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

  -- `attempt_count` ne se compte plus ici : il suit le resultat d'appel, qui
  -- est la decision, alors qu'une communication n'en est que la trace. Les
  -- deux ensemble comptaient deux fois le meme appel depuis la file.
  update leads
  set last_contacted_at = greatest(coalesce(last_contacted_at, new.created_at), new.created_at)
  where id = new.lead_id;

  return new;
end;
$$;

/**
 * Enregistre le resultat d'un appel, et fait avancer le parcours.
 *
 * Une tentative se compte quand on n'a pas joint la personne. Joindre,
 * qualifier ou convertir termine le parcours : le compteur n'a plus de sens
 * et repart de zero si le lead revient en NRP plus tard.
 */
create or replace function public.enregistrer_resultat_appel(
  p_lead_id uuid,
  p_statut text,
  p_prochaine_action timestamptz
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.leads
     set status = p_statut,
         next_action_at = p_prochaine_action,
         attempt_count = case
           when p_statut = 'nrp' then coalesce(attempt_count, 0) + 1
           else 0
         end,
         last_contacted_at = now(),
         updated_at = now()
   where id = p_lead_id;

  if not found then
    raise exception 'Lead introuvable ou non modifiable';
  end if;
end
$$;

grant execute on function public.enregistrer_resultat_appel(uuid, text, timestamptz) to authenticated;

-- ── 3. La fin du parcours ─────────────────────────────────────────────────

/**
 * Clot les leads dont la cadence est arrivee a son terme.
 *
 * Un lead en NRP qui a epuise ses tentatives restait en NRP pour toujours :
 * hors de la file, donc invisible, mais jamais clos -- il faussait les
 * compteurs et personne ne savait qu'il fallait l'oublier.
 *
 * La regle vient de la table : la derniere marche d'un statut est celle dont
 * le delai est nul. Changer la cadence change donc la cloture, sans toucher
 * a cette fonction.
 */
create or replace function public.cloturer_relances_epuisees()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer := 0;
begin
  with termes as (
    select c.workspace_id, c.statut, min(c.tentative_min) as tentatives_max
      from public.relance_cadences c
     where c.delai is null
     group by 1, 2
  ),
  epuises as (
    select l.id, l.workspace_id, l.attempt_count
      from public.leads l
      join termes t
        on t.workspace_id = l.workspace_id
       and t.statut = l.status
     where l.archived_at is null
       and coalesce(l.attempt_count, 0) >= t.tentatives_max
  ),
  clos as (
    update public.leads l
       set status = 'lost', next_action_at = null, updated_at = now()
      from epuises e
     where l.id = e.id
    returning l.id, l.workspace_id, e.attempt_count
  )
  -- Une fiche ne doit pas changer d'etat sans qu'on puisse savoir pourquoi.
  insert into public.notes (workspace_id, lead_id, content)
  select c.workspace_id, c.id,
         'Passé en perdu automatiquement : ' || c.attempt_count
           || ' tentatives sans réponse, cadence de relance épuisée.'
    from clos c;

  get diagnostics n = row_count;
  return n;
end
$$;

revoke all on function public.cloturer_relances_epuisees() from public, anon;
grant execute on function public.cloturer_relances_epuisees() to authenticated;

-- Toutes les heures : assez tot pour que la file reste propre, assez rare
-- pour qu'un lead clos par erreur se rattrape avant de surprendre.
select cron.unschedule('cloturer-relances')
 where exists (select 1 from cron.job where jobname = 'cloturer-relances');

select cron.schedule(
  'cloturer-relances',
  '7 * * * *',
  $cron$ select public.cloturer_relances_epuisees(); $cron$
);
