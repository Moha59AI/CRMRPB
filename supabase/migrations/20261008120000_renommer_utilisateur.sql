-- Permet a un administrateur de renseigner le nom affiche d'un utilisateur
-- sans ouvrir l'ecriture sur les autres colonnes sensibles du profil.

create or replace function public.renommer_membre(
  p_membre uuid,
  p_prenom text,
  p_nom text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws uuid;
  v_prenom text := nullif(trim(coalesce(p_prenom, '')), '');
  v_nom text := nullif(trim(coalesce(p_nom, '')), '');
  v_avant jsonb;
begin
  select workspace_id into v_ws
  from profiles
  where id = auth.uid() and role = 'admin';

  if v_ws is null then
    raise exception 'Seul un administrateur peut renommer un utilisateur';
  end if;

  if v_prenom is null and v_nom is null then
    raise exception 'Renseignez au moins un prenom ou un nom';
  end if;

  if char_length(coalesce(v_prenom, '')) > 80
     or char_length(coalesce(v_nom, '')) > 80 then
    raise exception 'Le prenom et le nom sont limites a 80 caracteres';
  end if;

  select jsonb_build_object('prenom', first_name, 'nom', last_name)
    into v_avant
  from profiles
  where id = p_membre and workspace_id = v_ws;

  if v_avant is null then
    raise exception 'Ce membre ne fait pas partie de votre espace';
  end if;

  update profiles
  set first_name = v_prenom,
      last_name = v_nom,
      updated_at = now()
  where id = p_membre and workspace_id = v_ws;

  insert into audit_logs (workspace_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_ws,
    auth.uid(),
    'utilisateur_renomme',
    'profile',
    p_membre::text,
    jsonb_build_object(
      'avant', v_avant,
      'apres', jsonb_build_object('prenom', v_prenom, 'nom', v_nom)
    )
  );
end;
$$;

revoke all on function public.renommer_membre(uuid, text, text) from public, anon;
grant execute on function public.renommer_membre(uuid, text, text) to authenticated;
