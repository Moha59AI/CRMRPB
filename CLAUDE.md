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

Tous les modules sont développés et routés dans `src/App.tsx`.

1. **Authentification** — Login, signup, forgot password, session persistante, routes protégées
2. **Layout** — Sidebar verticale avec navigation, expand/collapse
3. **Aujourd'hui** (`/today`) — Tableau de bord opérationnel
4. **Leads** (`/leads`) — Tableau, pipeline Kanban, liste compacte, fiche détail, détection de doublons
5. **Dossiers** (`/cases`) — Dossiers vitrage, checklist documents, suivi financier
6. **Contacts** (`/contacts`) — Carnet avec consentements SMS/email
7. **Agenda** (`/calendar`) — Vues jour/semaine/mois
8. **Suivi** (`/follow-up`) — Tâches et relances par priorité et échéance
9. **Scénarios** (`/workflows`) — Constructeur visuel React Flow
10. **Campagnes** (`/campaigns`) — Campagnes SMS, modèles, conversions
11. **Communications** (`/communications`) — SMS/appels/emails en mode démonstration
12. **Facturation** (`/billing`) — Devis, factures, paiements, cadeaux
13. **Réglages** (`/settings`, `/settings/users`) — Configuration et utilisateurs
14. **Meta Ads** — Configuration complète (15+ champs), secrets chiffrés via Vault, test/sync/subscribe
15. **Webhook Meta** — Edge Function GET (vérification) + POST (réception et traitement des leads)
16. **Conversions API** — Edge Function + service TypeScript (non déclenché automatiquement)
17. **Webhooks génériques** — Création d'endpoints, réception d'événements, retraitement
18. **Base de données** — 28 tables avec RLS, index, contraintes, triggers
19. **Design system** — Variables CSS centralisées, couleurs Relais Pare-Brise

## Code mort

`src/features/placeholders/placeholder-pages.tsx` et `src/components/ModulePlaceholder.tsx`
ne sont plus importés nulle part depuis que tous les modules sont développés.
Supprimables.

## Prérequis avant de lancer

Le projet a besoin d'un fichier `.env` à la racine (voir `.env.example`) :

```
VITE_SUPABASE_URL=https://<projet>.supabase.co
VITE_SUPABASE_ANON_KEY=<cle anon>
```

Sans ce fichier, `src/lib/supabase.ts` lève une erreur au chargement et
l'application ne démarre pas du tout.

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

Les 28 tables : activities, after_sales_cases, appointments, audit_logs, campaigns,
case_documents, communications, contacts, gifts, insurers, integration_connections,
invoices, leads, meta_forms, notes, notifications, payments, profiles, quotes,
sms_templates, tasks, vehicles, webhook_endpoints, webhook_events, windscreen_cases,
workflow_runs, workflows, workspaces.

**Toutes les tables ont RLS activé.** Ne jamais créer de table sans RLS.

**Attention aux contraintes CHECK redéfinies.** La migration
`20260827104653_create_crm_core_tables.sql` remplace `leads_status_check` défini
dans la migration initiale. Les statuts réellement acceptés sont :

```
new, to_call, calling, nrp, interested,
documents_requested, documents_received, appointment_scheduled,
lost, converted
```

Ne pas se fier à la définition de `CREATE TABLE leads` dans la première
migration, qui liste un vocabulaire obsolète (`contacted`, `qualified`,
`scheduled`). La source de vérité est `src/types/index.ts` (`LeadStatus`), aligné
sur la contrainte réelle.


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
