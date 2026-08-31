# Prompt Bolt — Refonte de la page Relances

---

## Contexte

CRM Relais Pare-Brise. React 18 + TypeScript strict, Vite, Tailwind + shadcn/ui,
Supabase (PostgreSQL, RLS par `workspace_id`, Edge Functions), TanStack Query,
sonner pour les notifications.

La page Relances existe et fonctionne. **Elle ne tient pas la charge visée :
plusieurs centaines à plus de mille relances.** C'est le vrai sujet de cette
refonte, pas l'esthétique.

---

## 1. Code existant — à lire avant toute modification

| Fichier | Rôle |
|---|---|
| `src/services/relances-service.ts` | Règle métier et agrégation |
| `src/features/relances/relances-page.tsx` | Page, groupes, mutations |
| `src/features/relances/components/relance-row.tsx` | Ligne |
| `src/index.css` | Jetons de couleur, dont l'échelle d'urgence |
| `tailwind.config.js` | Couleurs `urgent`, `due`, `upcoming`, `done` |

### À conserver impérativement

**La règle métier de `DELAI_PAR_STATUT`.** Elle traduit le métier :

```
new / to_call / calling  → immédiat
nrp                      → J+1
interested               → J+1
documents_requested      → J+2
documents_received       → immédiat
rendez-vous              → confirmation la veille
```

**La précédence de `next_action_at`.** Quand ce champ est renseigné sur un lead,
il l'emporte sur la règle de statut. Une décision humaine explicite prime
toujours sur l'automatisme. Ne pas supprimer ce comportement.

**Les jetons de couleur** `--urgent`, `--due`, `--upcoming`, `--done` et leurs
variantes `-soft`, définis en clair **et** en sombre. Les réutiliser, ne pas
réintroduire de couleurs en dur.

**`reporterRelance`** et **`marquerRelanceTraitee`** : leur comportement est
correct, y compris le fait que reporter un lead écrit `next_action_at` à 9 h le
lendemain.

---

## 2. Le problème d'architecture à corriger

`fetchRelances()` charge **toutes** les lignes de `leads`, `tasks` et
`appointments`, puis calcule l'urgence et trie **en JavaScript**.

À 50 relances c'est indolore. À 1 000, c'est trois requêtes non paginées, un tri
côté client, et un DOM de mille lignes. La page devient inutilisable, et aucun
travail sur le CSS n'y changera quoi que ce soit.

**La refonte doit déplacer le calcul dans PostgreSQL :**

- une **fonction SQL** `fetch_relances(...)` qui retourne la liste déjà
  filtrée, triée, paginée, avec le score de priorité et la dernière action
- une seconde fonction `compter_relances(...)` pour les compteurs d'en-tête,
  qui ne doit **jamais** ramener les lignes elles-mêmes
- côté client, **liste virtualisée** (`@tanstack/react-virtual`) et pagination
  par curseur — jamais `select('*')` sans limite

Sans ce déplacement, tout le reste est cosmétique.

---

## 3. Modifications de base de données

### Index manquants

```sql
create index if not exists leads_next_action_at_idx
  on leads (workspace_id, next_action_at);
create index if not exists leads_updated_at_idx
  on leads (workspace_id, updated_at);
create index if not exists communications_lead_created_idx
  on communications (lead_id, created_at desc);
create index if not exists tasks_due_at_idx
  on tasks (workspace_id, status, due_at);
create index if not exists appointments_start_idx
  on appointments (workspace_id, status, start_time);
```

L'index sur `communications (lead_id, created_at desc)` est indispensable :
sans lui, la récupération de la dernière action fait un balayage par ligne.

### Champs à ajouter sur `leads`

```sql
alter table leads add column if not exists attempt_count integer not null default 0;
alter table leads add column if not exists last_contacted_at timestamptz;
```

`attempt_count` (nombre de tentatives d'appel) et `last_contacted_at` sont
demandés par la priorisation. Ils peuvent se déduire de `communications`, mais
le recalcul à chaque affichage coûte cher : les **dénormaliser** et les tenir à
jour par trigger sur insertion dans `communications`.

`leads.score` existe déjà (integer) — le réutiliser pour la valeur potentielle
du dossier plutôt que d'ajouter un champ.

### Ce qui existe déjà, à ne pas recréer

`insurance`, `offer`, `city`, `assigned_user_id`, `next_action_at`,
`duplicate_flagged`, `advisor_notes`, `received_at` sur `leads`.
`communications` porte `type`, `direction`, `content`, `created_at`.

### Score de priorité — en SQL, pas en IA

Fonction immuable, calculée dans la requête, jamais par appel externe :

```
+40  jamais appelé (attempt_count = 0)
+25  en retard, +5 par jour supplémentaire (plafonné à +40)
+20  RDV dans moins de 48 h
+15  documents manquants depuis plus de 5 jours
+15  dossier assurance sans relance depuis plus de 7 jours
+10  score de valeur élevé
-20  déjà 5 tentatives ou plus sans réponse
-30  doublon signalé
```

Seuils : `URGENT >= 70`, `HAUTE >= 45`, `NORMALE >= 20`, sinon `FAIBLE`.

Exposer le score **et** ses composantes, pour pouvoir afficher « pourquoi cette
priorité » dans une infobulle sans rappeler quoi que ce soit.

---

## 4. Périmètre fonctionnel à ajouter

Les trois sources actuelles (leads, tâches, rendez-vous) doivent être étendues à :

- **Documents** — `windscreen_cases` en `documents_requested` / `documents_pending`
- **Assurances** — dossiers en `insurance_declaration` sans mouvement depuis 7 jours
- **Impayés / règlements** — `invoices` en `sent`, `partial` ou `overdue`
- **SAV** — `after_sales_cases` ouverts depuis trop longtemps

Chaque source alimente le même type `Relance`, avec son `kind`.

---

## 5. Interface

### En-tête

Titre « Relances », sous-titre « Tout ce qui attend une action de votre part, au
même endroit. »

Puis une **barre de filtres compacte et cliquable**, pas des cartes :
Toutes · En retard · Aujourd'hui · À venir · Nouveaux leads · Documents ·
Assurances · RDV · Impayés · SAV — chacune avec son compteur réel.

Style Linear / Attio : hauteur réduite, séparateurs discrets, l'onglet actif se
distingue par le fond et non par une bordure épaisse.

### Barre d'outils

- Recherche : nom, téléphone, immatriculation — **côté serveur**, avec anti-rebond
- Filtres : type, ancienneté, priorité, commercial, statut, ville, assurance
- Tri : priorité recommandée (défaut), plus ancien, plus récent, date de relance
- Bouton **Sélection multiple**

### Ligne — dense et informative

Une seule ligne d'environ 56 px, sans carte, sans bordure individuelle
(séparateurs uniquement) :

```
● URGENT │ Pascal Guilluy · 06 59 13 04 62 │ Clio IV · AB-123-CD · Lille
         │ Nouveau lead — jamais appelé
         │ SMS envoyé hier 16:42        4 jours de retard    [actions]
```

Actions au survol seulement, mais atteignables au clavier. **On doit pouvoir
traiter une relance sans jamais ouvrir la fiche.**

### Actions contextuelles selon `kind`

| Type | Actions |
|---|---|
| Nouveau lead | Appeler · SMS NRP · RDV · Reporter |
| Documents | Demander documents · Appeler · Reporter |
| Assurance | Relancer · Ajouter note · Reporter |
| Impayé | Relancer · Appeler · Reporter |

Après action : mise à jour optimiste, la ligne sort en fondu, le compteur
décrémente. Ne pas recharger toute la liste.

### Session de relance

Bouton **« Démarrer ma session »**. Ouvre un mode concentré plein écran :

- un seul dossier à la fois, le plus prioritaire
- client, téléphone, véhicule, motif, historique récent
- actions principales en gros
- après l'action : enregistrement, planification de la suite, **passage
  automatique au suivant**
- progression « 12 / 47 », raccourcis clavier, sortie possible à tout moment

Objectif : 30 à 50 relances traitées d'affilée sans quitter le clavier.

### Actions groupées

Sélection multiple → demander documents, reporter, attribuer à un commercial,
changer la priorité. **Confirmation obligatoire avant tout envoi SMS groupé**,
avec le nombre exact de destinataires.

---

## 6. Bloc Assistant IA — contrainte de coût

Un bandeau compact en haut :

> 279 relances en retard. 34 nouveaux leads jamais appelés, 17 dossiers
> n'attendent que des documents, 8 dossiers assurance sans relance depuis plus
> de 7 jours.
> **Priorité recommandée : commencer par les nouveaux leads.**

**Tous les chiffres viennent de SQL.** L'IA ne compte rien, ne filtre rien, ne
trie rien.

L'IA sert uniquement à : formuler la recommandation quand plusieurs facteurs
s'opposent, résumer un dossier à la demande, proposer la prochaine action,
préparer un message personnalisé.

Appel **au plus une fois par session**, résultat mis en cache. Jamais d'appel
par ligne, jamais au rendu.

Bouton « Traiter les priorités » → ouvre la session de relance sur le sous-ensemble.

---

## 7. Exigences

- TypeScript strict, aucun `any`
- **Aucun `catch` silencieux** : toute erreur remonte via `toast.error`
- Skeleton loaders pendant le chargement, jamais d'écran vide sans explication
- Écrans vides utiles : « Rien à relancer » et ce que ça recouvre
- Raccourcis clavier en session : appeler, SMS, reporter, suivant
- Responsive réel : la liste doit rester utilisable sur téléphone
- Respect strict des jetons de `src/index.css`, thème clair **et** sombre
- RLS active sur toute nouvelle fonction SQL, filtrage par `workspace_id`

### Critères d'acceptation

1. La page reste fluide avec **1 000 relances** en base — mesurer, pas supposer
2. Le filtrage, le tri et la recherche s'exécutent **côté serveur**
3. Aucune requête ne ramène plus de 50 lignes à la fois
4. Le score de priorité est calculé en SQL, sans appel externe
5. Une relance peut être traitée sans ouvrir la fiche client
6. La règle `next_action_at` prime toujours sur le délai de statut
7. Le thème sombre reste correct sur tous les nouveaux composants
