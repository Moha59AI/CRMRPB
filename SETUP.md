# Installation — connecter le CRM à un nouveau projet Supabase

Le projet Supabase d'origine (créé via Bolt.new) n'est plus accessible. Ce guide
recrée une base identique à partir de zéro. Comptez une dizaine de minutes.

---

## 1. Créer le projet Supabase

Sur [supabase.com](https://supabase.com) → **New project**.

- **Name** : `relais-pare-brise-crm`
- **Database Password** : générez-en un et **conservez-le dans votre gestionnaire
  de mots de passe**. Il n'est pas récupérable ensuite.
- **Region** : `West EU (Ireland)` ou `Central EU (Frankfurt)` — au plus près de la France.

L'initialisation prend 2 à 3 minutes.

---

## 2. Créer les tables

Dans le projet → **SQL Editor** → **New query**.

Copiez l'intégralité de `setup-database.sql` (à la racine de ce dépôt, 1 983 lignes),
collez-la, puis **Run**.

Ce fichier est la concaténation des 5 migrations dans l'ordre. Il crée :

- 28 tables
- Row Level Security activée partout, avec 4 politiques par table
- les index, contraintes et triggers `updated_at`
- les fonctions `get_workspace_id()`, `upsert_lead_from_webhook()`, `seed_demo_leads()`

Il est idempotent : en cas de doute, on peut le relancer sans rien casser.

Vérification : **Table Editor** doit maintenant lister 28 tables.

---

## 3. ⚠️ Désactiver la confirmation d'e-mail

**Cette étape n'est pas optionnelle.** Sans elle, la création de compte échoue en
silence et le CRM s'ouvre entièrement vide, sans message d'erreur.

**Authentication** → **Sign In / Providers** → **Email** → décochez
**Confirm email** → **Save**.

### Pourquoi

À l'inscription, `src/features/auth/auth-context.tsx:94` enchaîne trois opérations :

1. `supabase.auth.signUp()` crée le compte
2. `getOrCreateWorkspace()` crée le workspace
3. un `upsert` crée le profil, qui relie l'utilisateur au workspace

Si « Confirm email » est actif, l'étape 1 renvoie un utilisateur **mais aucune
session**. Les étapes 2 et 3 s'exécutent alors en tant qu'`anon` et la RLS les
rejette. L'erreur part dans un `console.error` que personne ne lit
(`auth-context.tsx:116`).

Conséquence : le compte existe, mais sans profil. `get_workspace_id()` renvoie
`NULL`, donc **toutes** les politiques RLS échouent. L'application se charge
normalement et chaque écran est vide.

Vous pourrez réactiver la confirmation d'e-mail une fois votre compte admin créé.

---

## 4. Renseigner les clés

**Project Settings** → **API** :

| Champ Supabase | Variable dans `.env` |
|---|---|
| Project URL | `VITE_SUPABASE_URL` |
| Project API keys → `anon` `public` | `VITE_SUPABASE_ANON_KEY` |

Le fichier `.env` existe déjà à la racine, avec les deux lignes vides à compléter :

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

> **Ne collez jamais la clé `service_role` dans `.env`.** Elle contourne toute la
> RLS et ce fichier alimente le bundle envoyé au navigateur. La clé `anon` est
> conçue pour être publique — c'est bien celle-là qu'il faut.

`.env` est ignoré par git : il ne partira jamais dans un commit.

---

## 5. Lancer

```
npm run dev
```

Puis **Créer un compte** sur l'écran de connexion. Le premier inscrit devient
automatiquement `admin` et crée le workspace « Relais Pare-Brise ».

> L'ancien compte `admin@relaispb.fr` mentionné dans le README vivait dans le
> projet Supabase perdu. Il n'existe pas dans la nouvelle base — créez le vôtre.

---

## 6. Données de démonstration (optionnel)

Une fois connecté, la fonction `seed_demo_leads()` peuple la base de leads de test.
Elle est appelée par `seedDemoLeads()` dans `src/services/demo-service.ts`.

---

## Si vous créez un utilisateur à la main en SQL

À éviter si possible : préférez **Authentication → Users → Add user →
Create new user**, en cochant **Auto Confirm User?**. Supabase génère alors une
ligne complète et bien formée.

Si vous passez malgré tout par un `INSERT` dans `auth.users`, deux pièges :

1. **`auth.identities`** — sans une ligne correspondante, la connexion par mot
   de passe ne fonctionne pas.
2. **Les colonnes de jetons** (`confirmation_token`, `recovery_token`,
   `email_change`…) restent à `NULL`. GoTrue est écrit en Go et les lit dans des
   chaînes non-nullables : sur un `NULL` il ne renvoie pas une erreur
   d'authentification, il **crashe avec un HTTP 500**.

Correctif, tolérant aux différences de version de GoTrue :

```sql
do $$
declare
  col text;
  cols text[] := array[
    'confirmation_token', 'recovery_token', 'email_change',
    'email_change_token_new', 'email_change_token_current',
    'phone_change', 'phone_change_token', 'reauthentication_token'
  ];
begin
  foreach col in array cols loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'auth' and table_name = 'users' and column_name = col
    ) then
      execute format(
        'update auth.users set %I = coalesce(%I, '''') where %I is null',
        col, col, col
      );
    end if;
  end loop;
end $$;
```

## Limite d'envoi d'e-mails

Sur le plan gratuit, Supabase plafonne l'envoi à **2 e-mails par heure**. Chaque
inscription avec « Confirm email » actif consomme ce quota ; au-delà, l'API
répond **429** et aucun compte n'est créé.

C'est une raison de plus de désactiver la confirmation d'e-mail, ou de créer les
comptes depuis le dashboard avec **Auto Confirm User?**, qui n'envoie rien.

## Edge Functions

Les 8 fonctions de `supabase/functions/` ne sont **pas** déployées par
`setup-database.sql`. Elles servent aux intégrations Meta Lead Ads et aux
webhooks entrants — le CRM fonctionne sans, mais aucun lead n'arrive
automatiquement.

Déploiement :

```
npx supabase login
npx supabase link --project-ref <ref-du-projet>
npx supabase functions deploy
```

Secrets à configurer côté Supabase :
`INTEGRATION_ENCRYPTION_KEY` (32 octets hex) et `META_APP_SECRET`.

## Réception des leads Meta

Meta n'envoie **jamais** les données du formulaire : le webhook ne reçoit qu'un
`leadgen_id`. Les vraies données se récupèrent ensuite via l'API Graph. Et Meta
impose une réponse en moins de 20 secondes, sous peine de rejouer l'événement —
ce qui produit des doublons.

Le traitement est donc coupé en deux :

| Fonction | Rôle | Durée visée |
|---|---|---|
| `meta-lead-webhook` | Vérifie la signature, empile le `leadgen_id`, répond 200 | quelques ms |
| `meta-process-queue` | Dépile, appelle l'API Graph, crée le lead | hors chemin critique |

`webhook_events` sert de file d'attente. `processing_status` porte l'état,
`processing_attempts` le compteur, `next_attempt_at` le backoff exponentiel
(2, 4, 8, 16, 32, 64 minutes) déclenché sur quota dépassé ou token expiré.
Au-delà de 6 tentatives, l'événement sort de la file (`next_attempt_at` à null).

L'unicité `(workspace_id, provider, external_event_id)` est garantie par un
index : c'est la base qui écarte les doublons, pas un `SELECT` préalable qui
laisserait passer deux livraisons simultanées.

Après le déploiement, exécuter `setup-cron.sql` pour planifier le dépilement
toutes les minutes. Ce fichier contient aussi les requêtes de surveillance —
notamment celle qui affiche les noms de champs réellement envoyés par Meta,
à lire au premier lead pour régler le mapping sans deviner.
