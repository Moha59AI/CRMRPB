# CLAUDE.md — Guide pour Claude Code

Ce document explique précisément comment travailler sur le CRM Relais Pare-Brise.

## Architecture

Le projet utilise une architecture par fonctionnalités (feature-based). Chaque module est dans `src/features/<module>/` et contient ses pages, composants et services.

### Dossiers clés

- `src/features/` — Modules fonctionnels (auth, leads, integrations/meta, webhooks, placeholders)
- `src/components/` — Composants partagés + shadcn/ui
- `src/config/` — Navigation, rôles, constantes
- `src/services/` — Services API partagés
- `src/types/` — Types TypeScript
- `src/lib/` — Client Supabase, utils
- `src/layouts/` — Layouts
- `supabase/functions/` — Edge Functions

## Ce qui est déjà fonctionnel

1. **Authentification** — Login, signup, forgot password, session persistante, routes protégées
2. **Layout** — Sidebar verticale avec navigation, expand/collapse
3. **Page Leads** — Liste avec recherche, filtres par source/formulaire, détail avec payload brut, détection de doublons
4. **Intégrations** — Liste des intégrations disponibles
5. **Meta Ads** — Page de configuration complète (15+ champs), secrets chiffrés via Vault, boutons test/sync/subscribe
6. **Webhook Meta** — Edge Function GET (vérification) + POST (réception et traitement des leads)
7. **Conversions API** — Edge Function + service TypeScript (non déclenché automatiquement)
8. **Webhooks génériques** — Création d'endpoints, réception d'événements, retraitement
9. **Base de données** — 8 tables avec RLS, index, contraintes, triggers
10. **Design system** — Variables CSS centralisées, couleurs Relais Pare-Brise

## Modules restant à développer

Chaque module a sa route et son placeholder dans `src/features/placeholders/placeholder-pages.tsx`.

- `/today` — Tableau de bord du jour
- `/cases` — Dossiers vitrage complets
- `/contacts` — Carnet de contacts
- `/calendar` — Agenda complet
- `/follow-up` — Suivi des relances
- `/workflows` — Scénarios d'automatisation
- `/campaigns` — Campagnes publicitaires
- `/communications` — SMS, appels, emails
- `/billing` — Facturation complète
- `/settings` — Paramètres généraux
- `/settings/users` — Gestion des utilisateurs

## Règles pour ajouter un module

### 1. Structure

Créer un dossier `src/features/<module>/` avec :
- `<module>-page.tsx` — Page principale
- Composants spécifiques au module
- Service si besoin (dans `src/services/`)

### 2. Routing

Ajouter la route dans `src/App.tsx` dans le block `<ProtectedRoute>`.

### 3. Navigation

La navigation est déjà configurée dans `src/config/navigation.ts`. Ne pas modifier sauf ajout de nouvelle route.

### 4. Design

Utiliser EXCLUSIVEMENT :
- Les variables CSS définies dans `src/index.css` (hsl(var(--primary)), etc.)
- Les composants shadcn/ui dans `src/components/ui/`
- Les icônes Lucide React
- La police Inter
- `PageHeader` pour l'en-tête de page
- Pas de dégradés, pas de violet, pas de grosse carte colorée
- Boutons en pilule : `className="rounded-full"`
- Cards : `className="rounded-xl border border-border"`
- Coins arrondis : 14-18px

### 5. Service

Pour les appels API, utiliser le client Supabase existant :
```typescript
import { supabase } from '@/lib/supabase';
```

Pour les nouvelles tables, créer une migration avec `mcp__supabase__apply_migration`.

### 6. Types

Définir les types dans `src/types/index.ts` ou dans le module.

### 7. État serveur

Utiliser TanStack Query :
```typescript
const { data, isLoading } = useQuery({
  queryKey: ['entity', params],
  queryFn: () => fetchEntity(params),
});
```

### 8. Formulaires

Utiliser React Hook Form + Zod :
```typescript
const schema = z.object({ name: z.string().min(1) });
const { register, handleSubmit } = useForm({ resolver: zodResolver(schema) });
```

## Tables de base de données

Voir `DATABASE.md` pour le schéma complet.

Tables existantes : workspaces, profiles, leads, integration_connections, meta_forms, webhook_endpoints, webhook_events, audit_logs.

**Toutes les tables ont RLS activé.** Ne jamais créer de table sans RLS.

Pour les nouvelles tables :
1. Créer une migration avec `mcp__supabase__apply_migration`
2. Activer RLS
3. Créer 4 politiques (SELECT, INSERT, UPDATE, DELETE) par table
4. Pour les tables avec `workspace_id`, vérifier l'appartenance via :
   ```sql
   workspace_id = (SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid())
   ```
5. Pour les tables admin-only, utiliser :
   ```sql
   EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.workspace_id = <table>.workspace_id)
   ```

## Edge Functions

Voir `supabase/config.toml` pour la configuration.

Pour déployer : utiliser `mcp__supabase__deploy_edge_functions` (déploie toutes les fonctions modifiées).

Règles :
- CORS headers obligatoires sur chaque réponse
- `verify_jwt = false` pour les webhooks publics
- `verify_jwt = true` pour les fonctions authentifiées
- Importer avec `npm:` prefix (ex: `npm:@supabase/supabase-js@2.58.0`)
- Try/catch obligatoire
- Ne pas partager de code entre fonctions

## Secrets

- **JAMAIS** de secret dans le frontend
- **JAMAIS** de secret en clair dans la base
- Utiliser Supabase Vault pour stocker les secrets
- Les références sont stockées dans `integration_connections.settings`
- Les edge functions utilisent la service role key pour accéder aux secrets

## Services disponibles

### MetaConversionsService
```typescript
import { MetaConversionsService } from '@/features/integrations/meta/meta-conversions-service';
```
Ne pas déclencher automatiquement — attendre les règles métier.

### Leads service
```typescript
import { fetchLeads, fetchLeadById, checkDuplicateLead } from '@/services/leads-service';
```

## Conventions

- TypeScript strict
- Imports avec `@/` alias
- Noms de fichiers : kebab-case (`meta-service.ts`)
- Composants : PascalCase (`MetaSettingsPage`)
- Fonctions : camelCase (`fetchLeads`)
- Pas de `any` — typer explicitement
- Pas de commentaires explicatifs sauf si le "pourquoi" n'est pas évident
