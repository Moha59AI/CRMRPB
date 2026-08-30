# Prompt à copier dans Bolt

---

## Contexte

CRM Relais Pare-Brise — React 18 + TypeScript strict, Vite, Tailwind + shadcn/ui,
Supabase (Auth, PostgreSQL, RLS, Edge Functions), TanStack Query.

L'intégration Meta Lead Ads **fonctionne déjà** : les leads Facebook arrivent
jusque dans la table `webhook_events`. Une longue session de débogage a corrigé
six bugs qui échouaient tous en silence. Ne pas les réintroduire — la liste
exacte est en fin de prompt.

Deux choses à faire : **une correction** (bloquante, 5 minutes) puis **une
fonctionnalité** (le vrai sujet).

---

## 1. Correction bloquante

Le worker `meta-process-queue` est déclenché chaque minute par pg_cron via
`net.http_post`. Les appels reviennent en :

```
401 {"code":"UNAUTHORIZED_INVALID_JWT_FORMAT","message":"Invalid JWT"}
```

Cause : la fonction est déclarée `verify_jwt = true` dans `supabase/config.toml`,
et le cron l'appelle avec une clé stockée dans le Vault sous le nom
`service_role_key` qui n'est pas un JWT (nouvelle clé `sb_secret_…` au lieu de
l'ancienne clé `service_role` commençant par `eyJ`).

Résultat : les leads Meta s'empilent en `pending` et ne sont jamais traités.

**Deux solutions possibles, choisir la plus robuste et l'expliquer :**

- **A.** Remplacer la valeur dans le Vault par le JWT `service_role`. Simple,
  mais casse à nouveau si Supabase retire les clés JWT héritées.
- **B.** Passer `meta-process-queue` en `verify_jwt = false` et l'authentifier
  par un secret partagé propre : un en-tête `x-queue-secret` vérifié dans la
  fonction contre une variable d'environnement, et envoyé par le cron depuis le
  Vault. Indépendant du format des clés Supabase.

La solution B est préférable. Si elle est retenue, mettre à jour `setup-cron.sql`
en conséquence.

**Critère de réussite :** `select status_code, content from net._http_response
order by created desc limit 3;` renvoie `200` et `{"processed":N,"failed":0}`,
et les lignes `webhook_events` passent de `pending` à `processed`.

---

## 2. Fonctionnalité : connexion Facebook en un clic, multi-comptes

### Le problème à résoudre

Aujourd'hui, connecter une page Facebook impose de passer par
`developers.facebook.com` et l'Explorateur d'API Graph pour, à la main :
créer un token de page, le copier, récupérer l'App ID et l'App Secret, trouver
le bon Page ID, configurer l'URL de rappel du webhook sur l'objet `page`,
choisir un verify token, abonner la page au champ `leadgen`.

C'est hors de portée d'un utilisateur non technique, et une seule erreur —
un token utilisateur au lieu d'un token de page, l'objet `user` au lieu de
`page` — fait échouer l'ensemble sans aucun message.

### Ce qu'il faut construire

Un bouton **« Connecter une page Facebook »** dans
`src/features/integrations/meta/meta-settings-page.tsx`, qui enchaîne tout seul :

1. **Facebook Login for Business** (flux OAuth côté client), avec les
   permissions `pages_show_list`, `pages_read_engagement`,
   `pages_manage_metadata`, `leads_retrieval`
2. Échange du code contre un **token utilisateur longue durée**
3. Appel de `GET /me/accounts` pour lister les pages, et **affichage d'un
   sélecteur** si l'utilisateur en administre plusieurs
4. Récupération du **token de page** correspondant (dérivé d'un token
   utilisateur longue durée, il n'expire pas)
5. Abonnement automatique via `POST /{page-id}/subscribed_apps`
   (`subscribed_fields=leadgen`)
6. Stockage des secrets dans le Vault et de la connexion en base

L'utilisateur ne doit **jamais** voir un token, un App Secret ou un verify token.

### Multi-comptes

`integration_connections` ne permet aujourd'hui qu'une seule connexion Meta par
workspace : `getMetaConnection()` dans `meta-service.ts` fait un
`.eq('provider','meta').maybeSingle()`.

Il faut pouvoir connecter **plusieurs pages Facebook** au même workspace :

- une ligne `integration_connections` par page, avec `facebook_page_id` distinct
- migration avec contrainte d'unicité sur `(workspace_id, provider, facebook_page_id)`
- l'interface liste les pages connectées, avec ajout et retrait individuels
- `meta-lead-webhook` identifie déjà le workspace par la signature ; il devra
  aussi router sur le bon `facebook_page_id` (présent dans `entry[].id`)

### Ce qui reste manuel, et c'est normal

La création de l'app Meta et la validation `leads_retrieval` par App Review
restent à faire une fois sur `developers.facebook.com`. L'App ID et l'App Secret
sont une configuration d'installation du CRM, pas quelque chose que l'utilisateur
final saisit. Les mettre dans les secrets des Edge Functions, pas dans un
formulaire.

L'URL de rappel du webhook se configure aussi une fois par app, sur l'objet
**`page`** — pas `user`. C'est une erreur qui a coûté une demi-journée.

---

## 3. À NE PAS CASSER

Six bugs corrigés récemment. Chacun échouait **sans message d'erreur visible**.
Ne pas régénérer ces fichiers sans reporter les correctifs.

| Fichier | Correctif |
|---|---|
| `supabase/functions/meta-lead-webhook/index.ts` | La clé HMAC est l'app secret **tel quel** en octets UTF-8. Ne **pas** le décoder depuis l'hexadécimal — la signature Meta ne correspondrait jamais. |
| `supabase/functions/meta-store-secrets/index.ts` | Le nom du secret retire le préfixe `meta_` du nom de champ avant de construire `meta_<clé>_<workspace>`. Sans ça : `meta_meta_app_secret_…`, introuvable à la lecture. |
| `src/features/integrations/meta/meta-service.ts` | Les Edge Functions appellent `supabase.auth.getUser(token)` : envoyer le **jeton de session** (`supabase.auth.getSession()`), jamais la clé anon. Et `storeMetaSecrets` doit **remonter** son erreur, sinon la page affiche une confirmation alors que rien n'est enregistré. |
| `src/App.tsx` | `<Toaster />` de sonner doit rester monté. Sans lui, les 122 appels `toast.*` du CRM sont muets. |
| `supabase/migrations/…_fix_webhook_events_unique_index.sql` | L'index d'unicité sur `(workspace_id, provider, external_event_id)` doit rester **non partiel** : PostgreSQL ne peut pas inférer un index partiel pour un `ON CONFLICT`. |
| `supabase/migrations/…_add_vault_helpers.sql` | `vault_create_secret`, `vault_update_secret`, `vault_read_secret` doivent exister, en `SECURITY DEFINER`, exécutables par `service_role` uniquement. |

**Architecture de la file d'attente — à conserver.** Meta n'envoie qu'un
`leadgen_id` et exige une réponse en moins de 20 secondes. `meta-lead-webhook`
vérifie la signature, empile, répond 200. `meta-process-queue` appelle l'API
Graph hors du chemin critique, avec backoff exponentiel sur quota et token
expiré. Ne pas refusionner les deux.

---

## 4. Exigences générales

- TypeScript strict, pas de `any`
- Aucun `catch` silencieux : toute erreur doit remonter à l'utilisateur via
  `toast.error`. C'est la cause de tout ce qui précède.
- Aucun secret dans le frontend ni en clair en base — Vault uniquement
- RLS activée sur toute nouvelle table, 4 politiques par table
- Respecter le design system de `CLAUDE.md` : shadcn/ui, variables CSS de
  `src/index.css`, boutons `rounded-full`, cards `rounded-xl border border-border`
