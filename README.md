# Relais Pare-Brise — CRM

CRM SaaS moderne et complet pour la gestion des leads, dossiers vitrage, communications, automatisations et facturation.

## Stack technique

- React 18 + TypeScript strict
- Vite
- Tailwind CSS + shadcn/ui
- Lucide Icons
- Supabase (Auth, PostgreSQL, Edge Functions, RLS)
- React Router DOM
- TanStack Query + TanStack Table
- React Flow (@xyflow/react) — constructeur visuel d'automatisations
- React Hook Form + Zod
- Sonner (notifications toast)
- Recharts (graphiques)

## Démarrage

Le serveur de développement démarre automatiquement. Les variables d'environnement Supabase sont pré-configurées dans `.env`.

## Compte administrateur de démonstration

> Le compte `admin@relaispb.fr` mentionné dans les versions précédentes de ce
> README vivait dans le projet Supabase d'origine (Bolt.new), qui n'est plus
> accessible. **Il n'existe pas dans la base actuelle.**

Voir `SETUP.md` pour créer un compte administrateur sur une base neuve.

La base ne contient aucune donnée de démonstration au départ. La fonction SQL
`seed_demo_leads()` peuple la table des leads, via `seedDemoLeads()` dans
`src/services/demo-service.ts`.

## Modules

| Module | Description |
|--------|-------------|
| Aujourd'hui | Tableau de bord opérationnel (leads du jour, tâches, RDV, retards) |
| Leads | Gestion des prospects avec vues tableau, pipeline Kanban et liste compacte |
| Dossiers | Dossiers vitrage complets avec checklist documents et suivi financier |
| Contacts | Carnet de contacts avec consentements SMS/email |
| Agenda | Calendrier jour/semaine/mois avec rendez-vous |
| Suivi | Tâches et relances classées par priorité et échéance |
| Scénarios | Constructeur visuel d'automatisations avec React Flow |
| Campagnes | Campagnes SMS avec modèles et suivi des conversions |
| Communications | Centre SMS/appels/emails en mode démonstration |
| Facturation | Devis, factures, paiements, cadeaux, retards |
| Réglages | Configuration et gestion des utilisateurs |

## Structure du projet

```
src/
├── app/              # Providers (QueryClient, etc.)
├── components/       # Composants partagés (ErrorBoundary, PageHeader, etc.)
│   └── ui/           # Composants shadcn/ui
├── config/           # Configuration (navigation, rôles, constantes)
├── features/         # Modules fonctionnels
│   ├── auth/         # Authentification
│   ├── today/        # Tableau de bord
│   ├── leads/        # Gestion des leads
│   ├── cases/        # Dossiers vitrage
│   ├── contacts/     # Carnet de contacts
│   ├── calendar/     # Agenda
│   ├── follow-up/    # Suivi des relances
│   ├── workflows/    # Scénarios d'automatisation
│   ├── campaigns/    # Campagnes
│   ├── communications/ # SMS, appels, emails
│   ├── billing/      # Facturation
│   ├── settings/     # Réglages et utilisateurs
│   ├── integrations/ # Intégrations externes
│   │   └── meta/     # Meta Lead Ads + Conversions API
│   └── webhooks/     # Webhooks entrants
├── hooks/            # Hooks personnalisés
├── layouts/          # Layouts (sidebar, etc.)
├── lib/              # Utilitaires (supabase client, utils)
├── services/         # Services API (crm-service, leads-service, demo-service)
├── types/            # Types TypeScript
└── App.tsx           # Routeur principal

supabase/
├── config.toml       # Configuration des Edge Functions
├── functions/        # Edge Functions
│   ├── meta-lead-webhook/
│   ├── meta-conversions/
│   ├── meta-store-secrets/
│   ├── meta-test-connection/
│   ├── meta-sync-forms/
│   ├── meta-subscribe-leads/
│   └── inbound-webhook/
└── migrations/       # Migrations SQL
```

## Base de données

28 tables avec RLS (Row Level Security) activée :

workspaces, profiles, leads, contacts, vehicles, insurers, windscreen_cases, case_documents, appointments, tasks, notes, activities, communications, sms_templates, notifications, workflows, workflow_runs, campaigns, quotes, invoices, payments, gifts, after_sales_cases, integration_connections, meta_forms, webhook_endpoints, webhook_events, audit_logs.

Toutes les tables sont isolées par `workspace_id` avec des politiques RLS strictes.

## Intégrations

### Meta Lead Ads (configuré)
- Réception des leads via webhook
- Conversions API
- Synchronisation des formulaires
- Chiffrement des secrets via Supabase Vault

### Communications (mode démonstration)
- SMS, appels et emails fonctionnels en mode simulé
- Architecture `CommunicationProvider` interchangeable
- Pour activer un vrai fournisseur : configurer les clés API dans Supabase Vault
  - Twilio (SMS + appels)
  - Ringover, 3CX, Octopush (ajout futur)

### Variables d'environnement requises

Voir `.env.example` pour la liste complète.

## Documentation

- `ARCHITECTURE.md` — Architecture détaillée
- `DATABASE.md` — Schéma de base de données
- `INTEGRATIONS.md` — Guide des intégrations
- `CLAUDE.md` — Guide pour Claude Code
