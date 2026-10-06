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
| campaign_name | text | Nom lisible de la campagne d'acquisition quand le fournisseur le transmet |
| meta_lead_id | text (UNIQUE) | ID Meta lead (idempotence) |
| meta_page_id | text | |
| meta_form_id | text | |
| meta_ad_id | text | |
| meta_adset_id | text | |
| meta_campaign_id | text | |
| fbclid | text | |
| fbc | text | Click ID cookie |
| fbp | text | Browser ID cookie |
| gclid | text | Identifiant de clic Google Ads |
| gbraid | text | Identifiant Google Ads pour certains parcours iOS applicatifs |
| wbraid | text | Identifiant Google Ads pour certains parcours iOS web |
| google_campaign_id | text | Campagne Google résolue depuis le clic ou le formulaire |
| google_ad_group_id | text | Groupe d'annonces Google |
| google_ad_id | text | Annonce Google |
| utm_source | text | |
| utm_medium | text | |
| utm_campaign | text | |
| utm_content | text | |
| utm_term | text | |
| raw_payload | jsonb | Payload brut reçu ; pour Meta, `meta_attribution` conserve les noms et ID de la campagne, de l'ensemble de publicités, de la publicité et du formulaire |
| raw_payload.onify_lead_id | text | Identifiant Onify des imports historiques, dédoublonné par espace |
| source | text | Origine principale : `meta`, `google_ads`, `webhook`, `manual` ou `import` |
| received_at | timestamptz | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Index** : workspace_id, status, source, phone, email, vehicle_registration, created_at
**Unique** : meta_lead_id (partial, WHERE NOT NULL)

### client_document_requests
Liens privés créés depuis une fiche lead pour collecter les pièces du client.
Le jeton complet n'est jamais stocké : seule son empreinte SHA-256 reste en base.
Un nouveau lien révoque la demande ouverte précédente.
Les nouveaux liens utilisent la route courte `/d/<code>` sur le domaine du CRM.
L'ancienne route `/documents?token=...` reste compatible afin de ne pas casser
les SMS déjà envoyés et `client.relaisparebrise.fr` reste chez Onify.
| Colonne | Type | Description |
|---------|------|-------------|
| id | uuid PK | |
| workspace_id | uuid → workspaces | |
| lead_id | uuid → leads | Dossier commercial concerné |
| case_id | uuid → windscreen_cases | Dossier vitrage s'il existe déjà |
| token_hash | text UNIQUE | Empreinte du lien secret |
| status | text | open, complete, revoked, expired |
| expires_at | timestamptz | Expiration à 30 jours |
| last_opened_at, submitted_at, revoked_at | timestamptz | Suivi du parcours client |

### client_document_items
Pièces demandées et fichiers privés déposés dans le bucket Storage
`client-documents`. Le chemin commence toujours par le workspace puis la
demande, afin que la politique Storage cloisonne les aperçus des collaborateurs.
| Colonne | Type | Description |
|---------|------|-------------|
| id | uuid PK | |
| workspace_id | uuid → workspaces | |
| request_id | uuid → client_document_requests | |
| document_type, label | text | Nature et libellé de la pièce |
| required | boolean | Conditionne la complétude de la demande |
| status | text | requested, uploaded, validated, rejected |
| storage_path | text | Chemin privé, jamais une URL publique |
| original_name, mime_type, size_bytes | text/text/bigint | Métadonnées contrôlées |
| uploaded_at, validated_at | timestamptz | Suivi du traitement |
| rejection_reason | text | Motif visible par le client |
| notification_email_sent_at, notification_email_error | timestamptz/text | Trace l'alerte email sans transmettre de donnée client au fournisseur |

Une nouvelle demande contient toujours quatre emplacements : carte grise et
attestation d'assurance obligatoires, puis contrôle technique et autre document
facultatifs. La complétude du dossier dépend uniquement des deux pièces
obligatoires. Cette liste ainsi que les principaux textes du portail sont
modifiables par les administrateurs et responsables dans Réglages > Documents
clients. Les changements de pièces sont répercutés sur les demandes ouvertes.

### client_document_portal_settings
Configuration du portail public, isolée par espace de travail. Les règles de
documents sont limitées aux quatre types pris en charge et validées en base.
| Colonne | Type | Description |
|---------|------|-------------|
| workspace_id | uuid PK → workspaces | Une configuration par espace |
| page_title, page_intro | text | Textes d'accueil du portail |
| completion_title, completion_message | text | Confirmation après réception |
| show_gift | boolean | Affiche le cadeau réel du lead |
| document_rules | jsonb | Libellé, visibilité et caractère obligatoire des quatre pièces |
| updated_by, created_at, updated_at | uuid/timestamptz | Traçabilité du réglage |

### postal_code_cities
Référentiel local des couples code postal/commune de France.
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
| provider | text | meta, google, onify, ionos, custom |
| name | text | Nom de la connexion |
| status | text | connected, error, not_configured |
| settings | jsonb | Configuration non-secrète |
| last_tested_at | timestamptz | |
| last_success_at | timestamptz | |
| last_error | text | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Note** : Les secrets (App Secret, tokens) ne sont JAMAIS stockés dans `settings`. Ils sont stockés via Supabase Vault avec une référence dans `settings`.

Pour `ionos`, `settings` contient uniquement l'adresse professionnelle, le nom
d'expéditeur et la signature. Le mot de passe de la boîte IONOS est chiffré
dans Supabase Vault et n'entre jamais dans le navigateur ni dans `settings`.
L'envoi passe directement par SMTP IONOS et la réception par IMAP IONOS.

### communications — champs email
Les emails réels utilisent le même historique que les appels et SMS.
| Colonne | Type | Description |
|---------|------|-------------|
| sender_email | text | Adresse d'expédition réelle |
| recipient_email | text | Adresse de destination réelle |
| email_message_id | text | Identifiant RFC du message reçu |
| email_in_reply_to | text | Identifiant du message auquel une réponse se rattache |
| email_attachments | jsonb | Métadonnées des pièces jointes ; aucune URL temporaire conservée |
| email_html | text | Corps HTML non fiable, affiché uniquement dans une iframe isolée |

Les emails sortants ont le provider `ionos-smtp`. Les emails entrants sont
importés depuis INBOX par la fonction `ionos-mail-sync`, puis associés par
adresse email à un client et, si possible, à son lead le plus récent. Quand
l'expéditeur n'est pas le client, le webhook recherche aussi une immatriculation
SIV dans l'objet ou le corps afin de rattacher les retours d'assureurs et
d'experts au bon lead. La boîte mail classe visuellement ces correspondants à
partir du référentiel `insurers` et d'une liste prudente de cabinets d'expertise ;
les correspondances seulement textuelles restent signalées comme probables.
Les domaines officiels de VSF et Pilkington sont classés comme fournisseurs.
Leurs pièces PDF, déjà conservées dans le bucket privé `email-attachments`, sont
sorties dans une section « Documents fournisseur » sans dupliquer le fichier.
La communication ne conserve que les métadonnées des pièces jointes ; leur
contenu reste dans le bucket privé. La fonction authentifiée `email-attachment`
vérifie le workspace et le rôle avant de servir le fichier au navigateur. Une
réponse envoyée depuis la boîte mail du
CRM reprend `email_message_id` dans l'en-tête `In-Reply-To` afin de rester dans
le fil de discussion du client. Un administrateur, responsable ou conseiller
peut corriger le rattachement d'un email par la fonction
`rattacher_email_au_lead` ; seul le lien métier change et l'opération est
inscrite dans `audit_logs`.

### lead_ai_insights
Historique immuable des analyses IA demandées depuis une fiche lead. Les
commentaires d'origine restent dans la table notes ; cette table ne conserve
que le résumé, les suggestions et les références aux notes ayant servi de
preuve.
| Colonne | Type | Description |
|---------|------|-------------|
| id | uuid PK | |
| workspace_id | uuid → workspaces | |
| lead_id | uuid → leads | Lead analysé |
| requested_by | uuid → auth.users | Utilisateur ayant lancé l'analyse |
| model | text | Modèle réellement appelé |
| summary | text | Résumé factuel |
| detected_information | jsonb | Faits détectés, confiance et note source |
| next_action | jsonb | Action et date suggérées, jamais appliquées automatiquement |
| warnings | jsonb | Informations manquantes ou contradictions |
| evidence | jsonb | Références vérifiées vers les notes sources |
| source_notes_count, source_latest_note_at | integer/timestamptz | Permettent de signaler une analyse obsolète |
| input_tokens, output_tokens, total_tokens | integer | Consommation réelle retournée par OpenAI |
| estimated_cost_usd | numeric | Estimation du coût de l'appel |
| created_at | timestamptz | |

`next_action` conserve aussi le niveau de priorité, le canal conseillé,
l'objectif, une checklist courte et, lorsqu'il est pertinent, un brouillon de
message. `warnings` contient des alertes structurées par gravité. Les anciennes
analyses au format texte restent compatibles avec l'interface.

Le radar global ne déclenche pas d'appel OpenAI : il calcule les urgences depuis
les échéances et les états déjà présents en base. Une analyse explicitement
lancée qui révèle une priorité haute ou critique crée en revanche une
notification générique, dédupliquée pendant six heures, afin d'utiliser la
cloche et le Web Push sans exposer de donnée client sur l'écran verrouillé.

### copilot_alert_states

État personnel du centre d'action du copilote. Les alertes continuent d'être
recalculées depuis les tables métier ; cette table retient uniquement qu'un
utilisateur a traité, reporté ou masqué une recommandation. Elle ne modifie
jamais le lead, le dossier, le rendez-vous ou la facture concernés.

| Colonne | Type | Description |
|---------|------|-------------|
| id | uuid PK | |
| workspace_id | uuid → workspaces | Cloisonnement de l'espace |
| user_id | uuid → auth.users | Préférence propre à l'utilisateur |
| alert_key | text | Identifiant stable de la règle et de l'objet concerné |
| status | text | done, snoozed ou dismissed |
| hidden_until | timestamptz | Réapparition automatique si la cause existe encore |
| created_at, updated_at | timestamptz | Traçabilité |

**Unique** : (workspace_id, user_id, alert_key). RLS active, quatre politiques ;
chaque utilisateur ne voit et ne modifie que ses propres décisions.

### google_ads_daily_metrics
Mesures Google Ads synchronisées toutes les 15 minutes, une ligne par campagne
et par jour. Les résultats métier ne sont pas copiés ici : la page Marketing
les recalcule depuis les leads, rendez-vous et interventions afin de garder une
seule source de vérité.
| Colonne | Type | Description |
|---------|------|-------------|
| id | uuid PK | |
| workspace_id | uuid → workspaces | |
| connection_id | uuid → integration_connections | Connexion Google utilisée |
| customer_id | text | Numéro client Google Ads |
| metric_date | date | Jour du rapport |
| campaign_id | text | Identifiant de campagne |
| campaign_name | text | Nom de campagne au dernier import |
| campaign_status | text | ENABLED, PAUSED… |
| impressions | bigint | |
| clicks | bigint | |
| cost_micros | bigint | Dépense en millionièmes de devise |
| conversions | numeric | Conversions déclarées dans Google Ads |
| conversion_value | numeric | Valeur déclarée dans Google Ads |
| synced_at | timestamptz | Dernière lecture de Google |

**Unique** : (connection_id, metric_date, campaign_id)

### google_ads_search_terms_daily
Mesures Google Ads quotidiennes au niveau de la requête réellement tapée.
Google masque certains termes à faible volume pour protéger la confidentialité :
la somme de cette table peut donc être inférieure aux statistiques campagne.
| Colonne | Type | Description |
|---------|------|-------------|
| id | uuid PK | |
| workspace_id | uuid → workspaces | |
| connection_id | uuid → integration_connections | Connexion Google utilisée |
| customer_id | text | Numéro client Google Ads |
| metric_date | date | Jour du rapport |
| campaign_id, campaign_name | text | Campagne Google |
| ad_group_id, ad_group_name | text | Groupe d'annonces |
| search_term | text | Requête saisie par l'internaute |
| keyword_text | text | Mot-clé déclencheur, vide si Google ne le fournit pas |
| keyword_match_type | text | Type de correspondance du mot-clé |
| search_term_match_type | text | Relation entre requête et mot-clé |
| targeting_status | text | Déjà ajouté, exclu ou non ciblé |
| device | text | Appareil attribué par Google |
| impressions, clicks | bigint | Volumes Google Ads |
| cost_micros | bigint | Dépense en millionièmes de devise |
| conversions, conversion_value | numeric | Conversions Google Ads |
| synced_at | timestamptz | Dernière lecture de Google |

**Unique** : (connexion, jour, campagne, groupe, requête, mot-clé, appareil)

### google_ads_oauth_states
États OAuth à usage unique, valides dix minutes. Seul leur condensat SHA-256 est
stocké. Aucune politique RLS n'autorise le navigateur à lire ou écrire cette
table ; seules les Edge Functions avec `service_role` y accèdent.

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
- SELECT : administrateur uniquement
- INSERT/UPDATE/DELETE : admin uniquement

### google_ads_daily_metrics
- SELECT : admin, responsable et conseiller du workspace
- INSERT/UPDATE/DELETE : administrateur uniquement (les imports ordinaires passent par la service role)

### google_ads_search_terms_daily
- SELECT : admin, responsable et conseiller du workspace
- INSERT/UPDATE/DELETE : administrateur uniquement (les imports ordinaires passent par la service role)

### google_ads_oauth_states
- SELECT/INSERT/UPDATE/DELETE : aucune opération directe depuis le navigateur

### lead_ai_insights
- SELECT/INSERT : administrateur, responsable et conseiller du workspace
- UPDATE : interdit ; une nouvelle analyse crée une nouvelle ligne
- DELETE : administrateur uniquement

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

### client_document_requests / client_document_items
- SELECT : administrateur, responsable, conseiller et comptable du workspace
- INSERT/UPDATE : administrateur, responsable et conseiller
- DELETE : administrateur et responsable
- Aucun accès anonyme direct ; le portail public passe par l'Edge Function et un jeton à forte entropie

## Fonctions SQL

### upsert_lead_from_webhook()
SECURITY DEFINER — insère ou met à jour un lead depuis un webhook. Vérifie `meta_lead_id` pour la déduplication et conserve GCLID, GBRAID, WBRAID, identifiants Google et UTM. Appelée par les edge functions avec la service role key.

### update_updated_at_column()
Trigger automatique pour `updated_at` sur toutes les tables avec timestamps.

### create_client_document_request()
SECURITY DEFINER — vérifie le rôle et le workspace, révoque l'ancien lien
incomplet, crée une demande avec les pièces par défaut et ne retourne le jeton
secret qu'une seule fois au collaborateur qui prépare le SMS.

### installer_workflows_alertes() / executer_workflows_alertes()
SECURITY DEFINER — installe puis contrôle six recettes opérationnelles : premier
contact d'un lead, tâche en retard, lien documents non consulté, rendez-vous à
confirmer, facture échue et cadeau ou virement en attente. Le contrôle est
planifié toutes les 15 minutes par `pg_cron` et peut aussi être lancé depuis la
page Scénarios par un administrateur ou un responsable.

Le moteur écrit uniquement dans `notifications` et `workflow_runs` : il ne
modifie jamais les données métier. `notifications.workflow_id` conserve
l'origine et `notifications.dedup_key`, protégée par un index unique, empêche
de notifier deux fois le même utilisateur pour la même anomalie le même jour.
