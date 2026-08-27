/*
# Création automatique du profil et du workspace à l'inscription

## Problème résolu

`auth-context.tsx` crée le workspace puis le profil côté client, juste après
`supabase.auth.signUp()`. Ces deux écritures n'aboutissent que si signUp a
renvoyé une session.

Quand la confirmation d'e-mail est activée (réglage par défaut de Supabase),
signUp renvoie un utilisateur mais aucune session. Les deux écritures partent
alors en tant qu'`anon` et la RLS les rejette. L'erreur est avalée par un
console.error.

Le compte existe donc sans profil. `get_workspace_id()` renvoie NULL, toutes
les politiques RLS échouent, et le CRM s'affiche entièrement vide sans le
moindre message d'erreur.

## Solution

Un trigger SECURITY DEFINER sur auth.users, qui s'exécute hors RLS au moment
même de la création du compte. L'inscription fonctionne alors que la
confirmation d'e-mail soit activée ou non.

Le code client reste en place : son upsert devient simplement redondant.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ws_id uuid;
  is_first boolean;
BEGIN
  SELECT id INTO ws_id FROM public.workspaces ORDER BY created_at LIMIT 1;

  IF ws_id IS NULL THEN
    INSERT INTO public.workspaces (name, slug)
    VALUES ('Relais Pare-Brise', 'relais-pare-brise')
    RETURNING id INTO ws_id;
  END IF;

  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO is_first;

  INSERT INTO public.profiles (id, workspace_id, first_name, last_name, role)
  VALUES (
    NEW.id,
    ws_id,
    COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
    CASE WHEN is_first THEN 'admin' ELSE 'advisor' END
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Ne jamais faire echouer la creation du compte si le profil pose probleme
    RAISE WARNING 'handle_new_user a echoue pour %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
