# Intégrations — Relais Pare-Brise CRM

## Meta Lead Ads

### Flux de données

1. Un utilisateur remplit un formulaire Lead Ads sur Facebook/Instagram
2. Meta envoie un webhook POST à l'Edge Function `meta-lead-webhook`
3. L'Edge Function vérifie la signature HMAC-SHA256 avec l'App Secret
4. Le payload est enregistré dans `webhook_events`
5. L'Edge Function récupère les détails du lead via la Graph API
6. Le mapping des champs est appliqué depuis `meta_forms.field_mapping`
7. Le lead est créé dans la table `leads` (avec déduplication par `meta_lead_id`)
8. L'événement est marqué comme traité

### Configuration

Page : `Réglages > Intégrations > Meta Ads`

1. Renseigner l'App ID, App Secret, Business Manager ID, Ad Account ID, Page ID
2. Générer un Verify Token (bouton)
3. Copier l'URL du webhook dans Meta Developer Console
4. Configurer le Page Access Token
5. Tester la connexion
6. Synchroniser les formulaires
7. Abonner la page aux leads
8. Configurer le mapping des champs pour chaque formulaire

### Champs de mapping disponibles

- Prénom (first_name)
- Nom (last_name)
- Nom complet (full_name)
- Téléphone (phone)
- E-mail (email)
- Ville (city)
- Immatriculation (vehicle_registration)
- Marque (vehicle_make)
- Modèle (vehicle_model)
- Assurance (insurance)
- Offre (offer)
- Champ personnalisé (custom)
- Ignorer (ignore)

### Normalisations

- Téléphones : `06`/`07`/`+33` → format `0XXXXXXXXX`, espaces supprimés
- Emails : minuscules, trim
- Immatriculations : majuscules, espaces supprimés
- Conservation de la valeur originale dans `raw_payload`

### Webhook Meta (GET)

L'Edge Function gère la vérification Meta :
- `hub.mode=subscribe` + `hub.verify_token` correspondant → retourne `hub.challenge` (200)
- Sinon → 403

### Sécurité

- **Secrets jamais dans le frontend** : stockés via Supabase Vault
- **Signature vérifiée** sur chaque webhook POST
- **Idempotence** : `meta_lead_id` unique, `external_event_id` unique
- **Aucun token dans les logs**

## Meta Conversions API

### Architecture

Edge Function : `meta-conversions`

Supporte :
- `action: 'test'` — Envoie un événement test
- `action: 'send'` — Envoie un événement unique
- `action: 'send_batch'` — Envoie un lot d'événements

### Événements supportés

| Event | Description |
|-------|-------------|
| Lead | Nouveau lead reçu |
| Contact | Premier contact avec le lead |
| Schedule | Rendez-vous planifié |
| CompleteRegistration | Intervention terminée |
| Purchase | Paiement reçu |

### Service TypeScript

`MetaConversionsService` dans `src/features/integrations/meta/meta-conversions-service.ts`

```typescript
import { MetaConversionsService } from '@/features/integrations/meta/meta-conversions-service';

MetaConversionsService.setEnabled(true);
await MetaConversionsService.send({
  event_name: 'Lead',
  event_time: Math.floor(Date.now() / 1000),
  action_source: 'website',
  event_source_url: 'https://relais-pare-brise.fr',
  user_data: { email: 'client@email.fr', phone: '0612345678' },
});
```

**Note** : Les événements ne sont PAS envoyés automatiquement. Claude Code doit définir les règles métier et appeler explicitement le service.

### Données utilisateur

- Hash SHA-256 côté serveur (email, téléphone, nom, ville)
- fbp et fbc transmis pour la déduplication Pixel/CAPI
- event_id pour la déduplication

## Webhooks génériques

### Webhooks entrants

Page : `Réglages > Webhooks`

Création d'un webhook entrant génère :
- Une URL unique : `{SUPABASE_URL}/functions/v1/inbound-webhook/{endpoint_key}`
- Un enregistrement dans `webhook_endpoints`

L'Edge Function `inbound-webhook` :
1. Reçoit le POST sur l'URL avec la clé
2. Vérifie que l'endpoint existe et est activé
3. Détecte les doublons via `external_event_id`
4. Enregistre le payload dans `webhook_events`
5. Tente de mapper les champs et créer un lead
6. Marque l'événement comme traité ou en erreur

### Webhooks sortants (fondations)

Infrastructure préparée pour les événements :
- `lead.created`
- `lead.updated`
- `lead.status_changed`
- `appointment.created`
- `appointment.updated`
- `payment.received`

Fonctionnalités prévues :
- Signature HMAC
- Tentatives automatiques avec retry
- Historique des réponses
- Désactivation après trop d'échecs

## Test sans identifiants Meta

1. Créer un compte sur l'app
2. Aller dans `Réglages > Intégrations > Meta Ads`
3. La page s'affiche avec tous les champs vides
4. Le statut est "Non configuré"
5. Le webhook est accessible mais sans traitement tant que les secrets ne sont pas configurés
6. Les webhooks génériques fonctionnent indépendamment de Meta

## OpenRouteService — itinéraires et coût des déplacements

Calcule la distance routière réelle, la durée et le tracé entre l'atelier et
le lieu d'une intervention, puis en déduit le coût du déplacement.

**OpenRouteService ne géocode rien.** Les adresses et leurs coordonnées
viennent de la Base Adresse Nationale, comme partout ailleurs dans le CRM
(`src/services/adresse-service.ts`, `src/components/ChampAdresse.tsx`). Il
n'intervient qu'une fois les deux points connus. Il n'y a pas deux systèmes
d'adresses, et il ne doit jamais y en avoir deux.

### Mise en service

1. Créer un compte sur <https://openrouteservice.org/dev/> et générer une clé.
   Le plan gratuit couvre 2 000 itinéraires par jour, très au-dessus du besoin.
2. Poser la clé comme secret de fonction — **jamais** préfixée `VITE_`, qui la
   publierait dans le bundle du navigateur :

   ```
   npx supabase secrets set OPENROUTESERVICE_API_KEY=<clé>
   ```

3. Dans le CRM, ouvrir **Réglages › Déplacements** et choisir l'adresse de
   départ dans les suggestions. C'est la sélection qui enregistre les
   coordonnées ; une adresse tapée sans être choisie reste du texte, et aucun
   trajet ne peut être calculé.
4. Ajuster le barème : prix du carburant, consommation, coût kilométrique du
   véhicule, coût horaire chargé.

Tant que la clé n'est pas posée, l'encart « Déplacement » affiche « Le service
d'itinéraire n'est pas encore configuré par un administrateur ». Rien d'autre
n'est affecté : la création d'un client, la modification d'une adresse et la
prise de rendez-vous n'en dépendent pas.

### Edge Function `openrouteservice-route`

`verify_jwt = true`. Prend les coordonnées d'arrivée, lit le départ dans
`travel_settings` côté serveur — le navigateur ne le choisit pas, sans quoi
n'importe quelle paire de coordonnées consommerait le quota. Consulte le cache
`travel_routes`, appelle OpenRouteService seulement en cas d'absence ou de
recalcul forcé, enregistre le résultat et les coûts.

Pannes rendues distinctement : clé absente ou refusée, quota dépassé, délai
dépassé, coordonnées manquantes, aucune route, réponse illisible. Le délai est
borné à 15 secondes.

### Appels évités

Dans l'ordre : coordonnées déjà en base, puis trajet déjà calculé pour ce
couple de points, puis OpenRouteService. Changer le barème ne rappelle pas le
service — la route n'a pas bougé, seule l'arithmétique est refaite, localement.
Déménager un client change la clé du cache, donc le trajet est recalculé sans
qu'aucune détection ne soit nécessaire.
