/*
# Suppression de leads

## Pourquoi c'est encadré

Archiver est réversible, supprimer ne l'est pas. Et une suppression coûte plus
que la ligne qu'on voit disparaître :

- **Détruits avec le lead** (`ON DELETE CASCADE`) : les notes prises pendant
  les appels et les tâches rattachées. C'est le travail du conseiller qui part.
- **Conservés mais orphelins** (`ON DELETE SET NULL`) : les communications
  (appels, SMS), les rendez-vous, les véhicules, les dossiers vitrage et le
  lien du contact. On garde la trace, on perd à quoi elle se rapporte.

Ces chiffres s'affichent avant de confirmer. Supprimer trois cents leads sans
savoir qu'on emporte cent notes d'appel serait une perte silencieuse.

## Le passage par les archives

La suppression en lot ne porte que sur les leads **déjà archivés**. C'est un
garde-fou volontaire : archiver d'abord oblige à regarder ce qu'on range, et
laisse le temps de se raviser. Supprimer directement depuis la liste de
travail rendrait l'erreur immédiate et définitive.

La suppression d'un lead isolé reste possible, pour le spam et les doublons
évidents qu'on n'a pas envie d'archiver d'abord.
*/

/*
 * Ce qu'une suppression detruirait.
 *
 * Les deux categories sont separees parce qu'elles ne se valent pas : une
 * note perdue ne se retrouve nulle part, une communication orpheline reste
 * consultable dans l'historique general.
 */
create or replace function public.impact_suppression_archives()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with cibles as (
    select id from leads
    where workspace_id = public.get_workspace_id()
      and archived_at is not null
  )
  select jsonb_build_object(
    'leads',          (select count(*) from cibles),
    -- Detruits avec le lead.
    'notes',          (select count(*) from notes where lead_id in (select id from cibles)),
    'taches',         (select count(*) from tasks where lead_id in (select id from cibles)),
    -- Conserves, mais sans lien.
    'communications', (select count(*) from communications where lead_id in (select id from cibles)),
    'rendez_vous',    (select count(*) from appointments where lead_id in (select id from cibles)),
    'dossiers',       (select count(*) from windscreen_cases where lead_id in (select id from cibles))
  );
$$;

grant execute on function public.impact_suppression_archives() to authenticated;


/*
 * Supprime les leads archives.
 *
 * Restreinte aux archives a dessein : archiver d'abord oblige a regarder ce
 * qu'on range, et laisse le temps de se raviser. Les politiques RLS decident
 * ensuite si l'ecriture aboutit -- un conseiller n'effacera rien.
 */
create or replace function public.supprimer_leads_archives()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ws uuid := public.get_workspace_id();
  v_nb integer;
  v_impact jsonb;
begin
  if v_ws is null then
    raise exception 'Aucun espace de travail';
  end if;

  -- L'impact est releve avant la suppression : apres, il n'y a plus rien a
  -- compter, et le journal doit garder trace de ce qui a disparu.
  v_impact := public.impact_suppression_archives();

  delete from leads
  where workspace_id = v_ws and archived_at is not null;

  get diagnostics v_nb = row_count;

  insert into audit_logs (workspace_id, user_id, action, entity_type, metadata)
  values (v_ws, auth.uid(), 'leads_supprimes', 'lead', v_impact);

  return v_nb;
end;
$$;

grant execute on function public.supprimer_leads_archives() to authenticated;


/*
 * Suppression d'un lead isole, pour le spam et les doublons evidents.
 *
 * Journalisee comme la suppression en lot : c'est irreversible, la trace de
 * qui l'a fait est le seul recours quand on cherche un dossier disparu.
 */
create or replace function public.supprimer_lead(p_lead uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ws uuid := public.get_workspace_id();
  v_nom text;
begin
  select nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
  into v_nom
  from leads where id = p_lead and workspace_id = v_ws;

  if not found then
    raise exception 'Ce lead ne fait pas partie de votre espace';
  end if;

  delete from leads where id = p_lead and workspace_id = v_ws;

  insert into audit_logs (workspace_id, user_id, action, entity_type, entity_id, metadata)
  values (v_ws, auth.uid(), 'lead_supprime', 'lead', p_lead::text,
          jsonb_build_object('nom', coalesce(v_nom, 'Sans nom')));
end;
$$;

grant execute on function public.supprimer_lead(uuid) to authenticated;
