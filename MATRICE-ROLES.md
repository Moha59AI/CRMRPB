# Matrice des rôles

Document de référence. Toute politique RLS, toute route React et toute Edge
Function doit s'y conformer.

**L = lire · C = créer · M = modifier · S = supprimer · — = aucun accès**

---

## Les cinq rôles

| Rôle | Périmètre |
|---|---|
| **Administrateur** | Tout, y compris secrets, intégrations et comptes |
| **Responsable** | Commercial et opérationnel, sans secrets ni administration des comptes |
| **Conseiller** | Leads, clients, relances, rendez-vous, notes, communications |
| **Technicien** | Ses interventions et ses rendez-vous, avec les coordonnées du client |
| **Comptable** | Facturation et clients concernés, rien d'autre |

---

## Données commerciales

| Table | Admin | Responsable | Conseiller | Technicien | Comptable |
|---|---|---|---|---|---|
| `leads` | LCMS | LCMS | LCM | **L** (les siens) | — |
| `contacts` | LCMS | LCMS | LCM | **L** (les siens) | **L** |
| `vehicles` | LCMS | LCMS | LCM | L (les siens) | — |
| `insurers` | LCMS | LCMS | L | — | L |
| `windscreen_cases` | LCMS | LCMS | LCM | **LM** (les siens) | L |
| `case_documents` | LCMS | LCMS | LCM | LC (les siens) | L |

Le technicien voit les coordonnées du client de ses interventions : sans le
téléphone, il ne peut ni prévenir d'un retard ni se faire ouvrir un portail.

## Organisation

| Table | Admin | Responsable | Conseiller | Technicien | Comptable |
|---|---|---|---|---|---|
| `appointments` | LCMS | LCMS | LCM | **LM** (les siens) | — |
| `tasks` | LCMS | LCMS | LCM | LM (les siennes) | — |
| `notes` | LCMS | LCMS | LC | LC (les siennes) | — |
| `activities` | L | L | LC | LC | — |
| `communications` | LCMS | LCMS | LC | LC (les siennes) | — |
| `notifications` | LCM | LCM | LM (les siennes) | LM (les siennes) | LM (les siennes) |

Notes et communications ne se modifient ni ne s'effacent : un échange consigné
est une trace, pas un brouillon.

## Acquisition

| Table | Admin | Responsable | Conseiller | Technicien | Comptable |
|---|---|---|---|---|---|
| `campaigns` | LCMS | LCMS | L | — | — |
| `sms_templates` | LCMS | LCMS | L | — | — |
| `workflows` | LCMS | LCM | L | — | — |
| `workflow_runs` | L | L | L | — | — |
| `google_ads_daily_metrics` | LCMS | L | L | — | — |

Un scénario peut envoyer des SMS en masse et appeler des API externes : sa
suppression reste à l'administrateur.

## Financier

| Table | Admin | Responsable | Conseiller | Technicien | Comptable |
|---|---|---|---|---|---|
| `quotes` | LCMS | LCM | — | — | LCMS |
| `invoices` | LCMS | L | — | — | LCMS |
| `payments` | LCMS | L | — | — | LCM |
| `gifts` | LCMS | LCM | — | — | LCM |
| `after_sales_cases` | LCMS | LCMS | LCM | L (les siens) | L |

Le responsable établit des devis mais ne touche pas aux factures émises ni aux
paiements : la modification d'un montant encaissé relève du comptable.
Un paiement ne se supprime pas — on passe un avoir.

## Système et secrets

| Table | Admin | Responsable | Conseiller | Technicien | Comptable |
|---|---|---|---|---|---|
| `integration_connections` | LCMS | — | — | — | — |
| `meta_forms` | LCMS | L | — | — | — |
| `webhook_endpoints` | LCMS | — | — | — | — |
| `webhook_events` | LCM | L | — | — | — |
| `invitations` | LCMS | — | — | — | — |
| `profiles` | LCMS | L | L | L | L |
| `workspaces` | LM | L | L | L | L |
| `audit_logs` | L | — | — | — | — |
| `postal_code_cities` | LCMS | L | L | L | L |
| `google_ads_oauth_states` | — | — | — | — | — |

`integration_connections` porte les références aux secrets du Vault : y donner
accès en lecture revient à donner les clés Meta. Réservé à l'administrateur,
sans exception.

`google_ads_oauth_states` ne contient pas de token mais protège le retour de
l'autorisation Google contre la réutilisation. Seules les Edge Functions en
`service_role` y accèdent.

Tout le monde lit `profiles` : c'est ce qui permet d'afficher « assigné à
Karim » sans requête privilégiée. Seul l'administrateur y écrit.

---

## Fonctions et Edge Functions

| Fonction | Autorisée à |
|---|---|
| `creer_invitation` | Administrateur |
| `initialiser_premier_admin` | Personne — SQL Editor uniquement |
| `seed_demo_leads` | Administrateur |
| `vault_read_secret` / `vault_create_secret` / `vault_update_secret` | `service_role` uniquement |
| `fetch_relances` / `compter_relances` | Tout rôle, filtré par RLS |
| `analyser_doublon` | Tout rôle, filtré par RLS |
| `trouver_ou_creer_contact` | Tout rôle, filtré par RLS |
| `meta-store-secrets`, `meta-subscribe-leads`, `meta-sync-forms`, `meta-test-connection` | Administrateur — vérifié dans la fonction |
| `meta-lead-webhook`, `inbound-webhook` | Public, protégées par signature ou clé d'endpoint |
| `meta-process-queue` | `service_role` uniquement (cron) |

---

## Deux points qui ne se règlent pas en RLS

**La restriction par colonne.** La RLS filtre des lignes, pas des colonnes. Un
technicien autorisé à modifier « les informations opérationnelles » de son
intervention pourrait donc aussi en changer le montant. Un trigger de
validation refuse les colonnes hors de son périmètre — c'est le seul moyen
propre en PostgreSQL, les `GRANT` par colonne portant sur les rôles Postgres et
non sur les rôles applicatifs.

**Le masquage d'interface n'est pas une sécurité.** Cacher un bouton évite une
erreur, pas une intrusion : chaque table et chaque fonction applique la règle
en base, indépendamment de ce que l'interface affiche.
