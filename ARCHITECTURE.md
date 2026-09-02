# Architecture — Relais Pare-Brise CRM

## Vue d'ensemble

Application SaaS modulaire construite autour d'une architecture par fonctionnalités (feature-based). Chaque module est autonome avec ses propres composants, services et types.

## Structure des dossiers

### `src/app/`
Providers au niveau racine : `QueryProvider` (TanStack Query).

### `src/components/`
Composants partagés entre modules :
- `ErrorBoundary` — Capture des erreurs React
- `FullPageLoader` — Loader plein écran
- `ModulePlaceholder` — Placeholder pour modules non développés
- `PageHeader` — En-tête de page standardisé
- `ui/` — Composants shadcn/ui (Button, Input, Dialog, etc.)

### `src/config/`
Configuration centralisée :
- `navigation.ts` — Items de navigation (label, path, icône)
- `roles.ts` — Définition des rôles et permissions
- `constants.ts` — Constantes applicatives

### `src/features/`
Modules fonctionnels, chacun contient ses pages, services et composants :
- `auth/` — Contexte d'auth, pages login/signup/forgot-password, protected route
- `leads/` — Page Leads (liste + détail)
- `integrations/` — Liste des intégrations
  - `meta/` — Configuration Meta Ads, service Meta, Conversions API service
  - `google/` — OAuth Google Ads, secrets Vault et synchronisation
- `marketing/` — Tableau de bord du clic à l'intervention
- `webhooks/` — Gestion des webhooks entrants
- `placeholders/` — Pages vides pour modules futurs

### `src/layouts/`
- `app-layout.tsx` — Layout principal avec sidebar verticale

### `src/lib/`
- `supabase.ts` — Client Supabase singleton
- `utils.ts` — Utilitaires (cn pour classes Tailwind)

### `src/services/`
Services API partagés :
- `leads-service.ts` — CRUD leads, webhooks endpoints, événements

### `src/types/`
Types TypeScript partagés pour toutes les entités.

## Routage

| Route | Module | Statut |
|-------|--------|--------|
| `/login` | Auth | Fonctionnel |
| `/signup` | Auth | Fonctionnel |
| `/forgot-password` | Auth | Fonctionnel |
| `/today` | Dashboard | Placeholder |
| `/leads` | Leads | Fonctionnel (liste + filtres) |
| `/cases` | Dossiers | Placeholder |
| `/contacts` | Contacts | Placeholder |
| `/calendar` | Agenda | Placeholder |
| `/follow-up` | Suivi | Placeholder |
| `/workflows` | Scénarios | Placeholder |
| `/campaigns` | Campagnes | Placeholder |
| `/marketing` | Marketing Google Ads | Fonctionnel |
| `/communications` | Communications | Placeholder |
| `/billing` | Facturation | Placeholder |
| `/settings` | Réglages | Placeholder |
| `/settings/integrations` | Intégrations | Fonctionnel |
| `/settings/integrations/meta` | Meta Ads | Fonctionnel |
| `/settings/integrations/google` | Google Ads | Fonctionnel |
| `/settings/webhooks` | Webhooks | Fonctionnel |
| `/settings/users` | Utilisateurs | Placeholder |

## Authentification

- Supabase Auth avec email/mot de passe
- Session persistante (localStorage)
- `AuthProvider` fournit session, profil, et méthodes
- `ProtectedRoute` redirige vers `/login` si non authentifié
- `onAuthStateChange` avec wrapper async pour éviter les deadlocks

### Rôles
1. **Administrateur** — Accès complet, gestion des intégrations
2. **Responsable** — Gestion des leads et équipe
3. **Conseiller** — Gestion des leads et contacts
4. **Technicien** — Dossiers et agenda
5. **Comptable** — Facturation

## Design System

Centralisé dans `src/index.css` via des variables CSS :
- Couleurs : primary (#16A34A vert), secondary (#202331 sombre), border (#E7E9EE)
- Typographie : Inter
- Rayons : 14-18px
- Ombres : très légères
- Pas de dégradés, pas de violet

## Edge Functions

13 fonctions déployées :
1. `meta-lead-webhook` — Réception et traitement des leads Meta (GET + POST)
2. `meta-conversions` — Envoi d'événements à la Conversions API
3. `meta-store-secrets` — Stockage chiffré des secrets Meta
4. `meta-test-connection` — Test de connexion Meta
5. `meta-sync-forms` — Synchronisation des formulaires Meta
6. `meta-subscribe-leads` — Abonnement de la page aux leads
7. `inbound-webhook` — Webhook générique entrant
8. `meta-process-queue` — Traitement différé et résilient des leads Meta
9. `google-ads-store-secrets` — Stockage des secrets Google dans Vault
10. `google-ads-oauth-start` — Démarrage de l'autorisation Google
11. `google-ads-oauth-callback` — Échange du code et stockage du refresh token
12. `google-ads-test-connection` — Vérification du compte publicitaire
13. `google-ads-sync` — Import des coûts, clics et campagnes, puis attribution GCLID

## Gestion des erreurs

- `ErrorBoundary` au niveau racine
- Toasts (Sonner) pour les erreurs utilisateur
- États d'erreur dans les pages (affichage des erreurs de chargement)
- Validation Zod côté formulaire
