# Brief à coller dans ChatGPT

Ce fichier est un contexte autonome. Copiez tout ce qui suit la ligne de tirets.

---

## Contexte

Je développe un CRM pour mon entreprise de remplacement de pare-brise
(Relais Pare-Brise). Stack : React 18 + TypeScript + Vite en frontend,
Supabase en backend (PostgreSQL, RLS, Edge Functions en Deno, Vault,
pg_cron, pg_net).

Je veux recevoir automatiquement dans le CRM les leads générés par mes
formulaires **Meta Lead Ads** (Facebook/Instagram). J'avais déjà ce
fonctionnement sur mon ancien CRM Perfex et je l'ai reproduit.

## L'architecture mise en place

Meta n'envoie dans son webhook qu'un identifiant, `leadgen_id` — jamais les
données du prospect. Il faut ensuite les récupérer via l'API Graph. Meta
exige aussi une réponse en moins de 20 secondes, sinon il rejoue la
livraison en boucle. J'ai donc découpé en deux :

**1. Edge Function `meta-lead-webhook`** — publique (`verify_jwt = false`)

- `GET` : répond au défi de vérification de Meta (`hub.challenge`)
- `POST` : vérifie la signature `x-hub-signature-256` (HMAC-SHA256 du corps
  brut avec l'App Secret), insère le `leadgen_id` dans la table
  `webhook_events` avec `processing_status = 'pending'`, et répond `200`
  immédiatement. Aucun appel externe.

**2. Edge Function `meta-process-queue`** — protégée (`verify_jwt = true`)

- Dépile jusqu'à 25 événements `pending`
- Appelle l'API Graph pour chaque `leadgen_id`
- Mappe les champs vers ma table `leads`
- Backoff exponentiel (2, 4, 8, 16, 32, 64 minutes), 6 tentatives max
- Idempotence garantie par un index unique sur `(provider, external_event_id)`

**3. Déclencheur** — `pg_cron` toutes les minutes appelle
`meta-process-queue` via `pg_net`, avec un jeton lu dans le Vault :

```sql
select cron.schedule(
  'meta-process-queue',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://<projet>.supabase.co/functions/v1/meta-process-queue',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'service_role_key'
        limit 1
      )
    ),
    body    := '{}'::jsonb
  );
  $$
);
```

## Ce qui fonctionne, prouvé

- L'application Meta est en mode **Live**
- L'abonnement webhook porte bien sur l'objet **`page`** (pas `user`), champ
  `leadgen`, `active: true` — vérifié via l'endpoint `subscribed_apps`
- **Meta livre réellement** : `webhook_events` contient 28 lignes pour le
  provider `meta`, la dernière reçue hier soir. Donc la signature HMAC est
  validée et l'insertion en file fonctionne.
- Les deux Edge Functions répondent (`403` sur le GET sans challenge, `401`
  sur `meta-process-queue` sans jeton — les deux comportements attendus)

## Le problème exact

**Les 28 événements restent tous en `processing_status = 'pending'`.**
Aucun lead n'est créé.

La cause est identifiée. La table `net._http_response` montre que le cron
part bien toutes les minutes et se fait refuser à chaque fois :

```
status_code: 401
content: {"code":"UNAUTHORIZED_INVALID_JWT_FORMAT","message":"Invalid JWT"}
```

Le secret `service_role_key` stocké dans le Vault n'est donc pas un JWT
valide au format attendu par la passerelle Supabase.

## Ce que j'ai déjà tenté

**Tentative 1 — mettre à jour le secret du Vault :**

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'service_role_key'),
  '<la clé>',
  'service_role_key'
);
```

→ Échec : `ERROR: 42601: syntax error at or near "service_role_key"` sur le
3e argument. La signature de `vault.update_secret` diffère apparemment selon
la version de l'extension.

**Tentative 2 (en cours) — supprimer puis recréer :**

```sql
delete from vault.secrets where name = 'service_role_key';

select vault.create_secret('<la clé>', 'service_role_key', 'description');
```

`vault.create_secret` avec ces 3 arguments a déjà fonctionné chez moi par le
passé. Le cron lit le secret par son **nom**, pas par son identifiant, donc
le recréer ne devrait rien casser.

**Note importante** : mon projet Supabase est passé au nouveau système de
clés (`sb_publishable_...` / `sb_secret_...`). Ces nouvelles clés ne sont
**pas** des JWT, ce qui explique probablement le
`UNAUTHORIZED_INVALID_JWT_FORMAT`. Les anciennes clés au format JWT
(commençant par `eyJ`) existent encore sous un onglet « Legacy », mais
Supabase les déprécie.

## Mes questions

1. Quelle est la façon **la plus durable** d'authentifier un appel pg_cron →
   Edge Function chez Supabase aujourd'hui, sachant que les clés JWT
   héritées sont en voie de suppression ? Faut-il basculer
   `meta-process-queue` en `verify_jwt = false` et l'authentifier moi-même
   par un secret partagé dans un en-tête personnalisé ? Y a-t-il mieux ?

2. La nouvelle clé `sb_secret_...` est-elle acceptée par la passerelle des
   Edge Functions dans l'en-tête `Authorization: Bearer`, ou uniquement dans
   `apikey` ? Quel format exact attend la passerelle ?

3. `vault.update_secret` : quelle est la signature correcte selon les
   versions de `supabase_vault` ? Comment mettre à jour un secret de façon
   fiable sans dépendre de cette signature ?

4. Y a-t-il une meilleure approche générale que pg_cron + pg_net pour ce
   besoin — par exemple les Database Webhooks, ou un déclenchement direct
   depuis `meta-lead-webhook` en tâche de fond (`EdgeRuntime.waitUntil`) qui
   éviterait complètement le problème d'authentification ?

Réponds en français, avec le SQL et le code exacts.
