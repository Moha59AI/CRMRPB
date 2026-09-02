# Base de données — Relais Pare-Brise CRM

## Vue d'ensemble

Base PostgreSQL gérée par Supabase. Toutes les tables ont RLS (Row Level Security) activé.

## Tables

### workspaces
Table racine pour le multi-tenant.
| Colonne | Type | Description |
|---------|------|-------------|
| id | uuid PK | Identifiant unique |
| name | text | Nom du workspace |
| slug | text | Slug unique |
| created_at | timestamptz | Date de création |
| updated_at | timestamptz | Date de modification |

### profiles
Profils utilisateurs liés à `auth.users`.
| Colonne | Type | Description |
|---------|------|-------------|
| id | uuid PK → auth.users | Utilisateur Supabase Auth |
| workspace_id | uuid → workspaces | Workspace d'appartenance |
| first_name | text | Prénom |
| last_name | text | Nom |
| phone | text | Téléphone |
| avatar_url | text | URL avatar |
| role | text | admin, manager, advisor, technician, accountant |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### leads
Prospects reçus depuis Meta et autres sources.
| Colonne | Type | Description |
|---------|------|-------------|
| id | uuid PK | |
| workspace_id | uuid → workspaces | |
| first_name | text | |
| last_name | text | |
| phone | text | |
| email | text | |
| address | text | Adresse principale (voie uniquement) |
| city | text | |
| postal_code | text | Code postal de l'adresse principale |
| citycode | text | Code INSEE de la commune principale |
| latitude | double precision | Coordonnée BAN de l'adresse principale |
| longitude | double precision | Coordonnée BAN de l'adresse principale |
| geo_precision | text | exact, approximatif ou NULL |
| intervention_address | text | Adresse différente ; NULL = adresse principale |
| intervention_postal_code | text | Code postal différent |
| intervention_city | text | Ville différente |
| intervention_citycode | text | Code INSEE différent |
| intervention_latitude | double precision | Latitude différente |
| intervention_longitude | double precision | Longitude différente |
| intervention_geo_precision | text | Précision de l'adresse différente |
| vehicle_registration | text | Immatriculation |
| vehicle_make | text | Marque |
| vehicle_model | text | Modèle |
| source | text | meta, webhook, manual, import |
| status | text | new, to_call, calling, nrp, interested, documents_requested, documents_received, appointment_scheduled, lost, converted |
| assigned_user_id | uuid → auth.users | |
| meta_lead_id | text (UNIQUE) | ID Meta lead (idempotence) |
| meta_page_id | text | |
| meta_form_id | text | |
| meta_ad_id | text | |
| meta_adset_id | text | |
| meta_campaign_id | text | |
| fbclid | text | |
| fbc | text | Click ID cookie |
| fbp | text | Browser ID cookie |
| utm_source | text | |
| utm_medium | text | |
| utm_campaign | text | |
| utm_content | text | |
| utm_term | text | |
| raw_payload | jsonb | Payload brut reçu |
| received_at | timestamptz | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Index** : workspace_id, status, source, phone, email, vehicle_registration, created_at
**Unique** : meta_lead_id (partial, WHERE NOT NULL)

### postal_code_cities
Référentiel local des couples code postal/commune des départements 59 et 62.
Il sert à compléter la ville lorsqu'un formulaire ne transmet que le code
postal, sans envoyer la donnée du client à un service tiers.
| Colonne | Type | Description |
|---------|------|-------------|
| postal_code | text PK partielle | Code postal |
| city | text | Nom officiel de la commune |
| citycode | text PK partielle | Code INSEE |
| population | integer | Sert à choisir la commune principale en cas d'ambiguïté |

### integration_connections
Connexions aux services externes.
| Colonne | Type | Description |
|---------|------|-------------|
| id | uuid PK | |
| workspace_id | uuid → workspaces | |
| provider | text | meta, google, custom |
| name | text | Nom de la connexion |
| status | text | connected, error, not_configured |
| settings | jsonb | Configuration non-secrète |
| last_tested_at | timestamptz | |
| last_success_at | timestamptz | |
| last_error | text | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Note** : Les secrets (App Secret, tokens) ne sont JAMAIS stockés dans `settings`. Ils sont stockés via Supabase Vault avec une référence dans `settings`.

### meta_forms
Formulaires Meta Lead Ads synchronisés.
| Colonne | Type | Description |
|---------|------|-------------|
| id | uuid PK | |
| workspace_id | uuid → workspaces | |
| connection_id | uuid → integration_connections | |
| meta_page_id | text | |
| meta_form_id | text | ID Meta du formulaire |
| form_name | text | |
| enabled | boolean | |
| field_mapping | jsonb | Mapping des champs Meta → champs CRM |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### webhook_endpoints
Endpoints de webhooks entrants/sortants.
| Colonne | Type | Description |
|---------|------|-------------|
| id | uuid PK | |
| workspace_id | uuid → workspaces | |
| name | text | |
| provider | text | |
| endpoint_key | text | Clé unique dans l'URL |
| direction | text | inbound, outbound |
| enabled | boolean | |
| signing_secret_reference | text | Référence au secret Vault |
| configuration | jsonb | Mapping, etc. |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### webhook_events
Événements reçus via webhooks.
| Colonne | Type | Description |
|---------|------|-------------|
| id | uuid PK | |
| workspace_id | uuid → workspaces | |
| endpoint_id | uuid → webhook_endpoints | |
| provider | text | |
| external_event_id | text | ID externe (idempotence) |
| event_type | text | |
| headers | jsonb | |
| payload | jsonb | |
| processing_status | text | pending, processing, processed, error, skipped |
| processing_attempts | integer | |
| error_message | text | |
| received_at | timestamptz | |
| processed_at | timestamptz | |

**Unique** : (endpoint_id, external_event_id) — idempotence

### audit_logs
Journal d'audit des actions administratives.
| Colonne | Type | Description |
|---------|------|-------------|
| id | uuid PK | |
| workspace_id | uuid → workspaces | |
| user_id | uuid → auth.users | |
| action | text | |
| entity_type | text | |
| entity_id | text | |
| metadata | jsonb | |
| created_at | timestamptz | |

## Politiques RLS

### workspaces
- SELECT/INSERT/UPDATE : `authenticated` (tous)

### profiles
- SELECT : utilisateurs du même workspace
- INSERT : soi-même uniquement
- UPDATE : soi-même OU admin du workspace

### leads
- SELECT/INSERT/UPDATE/DELETE : membres du workspace

### integration_connections
- SELECT : membres du workspace
- INSERT/UPDATE/DELETE : admin uniquement

### meta_forms
- SELECT : membres du workspace
- INSERT/UPDATE/DELETE : admin uniquement

### webhook_endpoints
- SELECT : membres du workspace
- INSERT/UPDATE/DELETE : admin uniquement

### webhook_events
- SELECT : membres du workspace
- UPDATE : admin uniquement

### audit_logs
- SELECT : admin (tous) + soi-même
- INSERT : membres du workspace

### postal_code_cities
- SELECT : tous les utilisateurs authentifiés
- INSERT/UPDATE/DELETE : administrateur uniquement

## Fonctions SQL

### upsert_lead_from_webhook()
SECURITY DEFINER — insère ou met à jour un lead depuis un webhook. Vérifie `meta_lead_id` pour la déduplication. Appelée par les edge functions avec la service role key.

### update_updated_at_column()
Trigger automatique pour `updated_at` sur toutes les tables avec timestamps.
