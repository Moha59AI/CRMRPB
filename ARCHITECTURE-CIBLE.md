# Analyse de l'existant et architecture cible

Document de pilotage. Rédigé avant toute modification, sur mesure du code réel.

---

## 1. État réel, chiffré

| Mesure | Valeur | Lecture |
|---|---|---|
| Lignes applicatives | 13 691 | Volume conséquent, déjà fonctionnel |
| Fichiers > 1 000 lignes | **5** | leads 1613, cases 1581, calendar 1464, communications 1263, workflows 1075 |
| Composants partagés hors shadcn | **4** | dont 1 mort (`ModulePlaceholder`) |
| Occurrences `<Table` | **221** | aucune abstraction de tableau |
| Occurrences `<Dialog` | **91** | aucune abstraction de formulaire modal |
| Fonctions dans `crm-service.ts` | **59** | un seul fichier pour tout le métier |
| Breakpoints responsive | 41 `sm:`, 6 `md:`, 4 `lg:`, 0 `xl:` | **quasi inexistant** |
| Variables CSS | 53 en clair, 19 redéfinies en sombre | mode sombre à moitié déclaré |
| Command palette | `cmdk` installé, `command.tsx` présent, **jamais utilisé** | |
| Raccourcis clavier | aucun | |

### Ce que ces chiffres disent

**Le problème n'est pas le manque de fonctionnalités, c'est l'absence de couche
réutilisable.** 221 tableaux écrits à la main, 91 dialogues, zéro composant
commun. Chaque écran a été généré isolément. Ajouter Tournées, Documents Expert
et Assistant IA dans cet état produira trois nouveaux fichiers de 1 500 lignes
et portera la dette à un point où plus rien n'est modifiable.

**Le responsive est à construire, pas à ajuster.** 51 breakpoints sur 13 691
lignes, c'est du décoratif. L'exigence « responsive parfait » et l'usage
technicien sur téléphone supposent de reprendre les mises en page, pas d'ajouter
des classes.

**Le mode sombre est un chantier ouvert.** `darkMode: ['class']` est configuré,
19 variables sur 53 sont redéfinies, et aucun `ThemeProvider` n'est monté —
`next-themes` est installé mais inutilisé. Rien ne peut basculer aujourd'hui.

---

## 2. À conserver

Solide, testé, à ne pas toucher :

- **La base de données.** 28 tables, RLS stricte, index, triggers. Le vocabulaire
  métier des statuts de dossier correspond déjà au pipeline demandé.
- **Le socle Supabase.** Auth, RLS par `workspace_id`, Edge Functions, Vault.
- **L'intégration Meta Lead Ads**, réparée et fonctionnelle : file d'attente,
  backoff, idempotence. Six correctifs y sont commités, listés dans
  `PROMPT-BOLT.md`. **Ne pas régénérer ces fichiers.**
- **La logique métier** des modules existants. Le code est verbeux mais le
  fonctionnement est juste — c'est la présentation et l'organisation qui pèchent.
- **Le choix des dépendances** : shadcn/ui, TanStack Query et Table, React Hook
  Form + Zod, sonner. Rien à remplacer.

---

## 3. À modifier

- **Découper les 5 fichiers > 1 000 lignes** en composants par onglet et par
  section. C'est le préalable à tout le reste.
- **Compléter le design system** : les 53 variables en clair et en sombre, un
  `ThemeProvider`, un sélecteur de thème, une échelle typographique et
  d'espacement explicite.
- **Reprendre la mise en page pour le mobile**, écran par écran.
- **Rendre les statuts de dossier configurables** — aujourd'hui figés dans une
  contrainte `CHECK` et dans `src/types/index.ts`. Passage en table de
  référence, avec ordre et couleur.

---

## 4. À supprimer ou refactoriser

**Supprimer :**

- `src/features/placeholders/placeholder-pages.tsx` (224 lignes, mort)
- `src/components/ModulePlaceholder.tsx` (mort)

**Refactoriser :**

- `crm-service.ts` — 59 fonctions dans un fichier. Éclater par domaine :
  `cases-service`, `appointments-service`, `billing-service`, `contacts-service`.
- **Créer un `<DataTable>`** générique : colonnes, tri, filtres rapides,
  recherche, pagination, sélection, état vide, skeleton. Il remplace les 221
  tableaux manuels et donne d'un coup les « tableaux modernes » et « filtres
  rapides » demandés.
- **Créer un `<FormDialog>`** : remplace les 91 dialogues manuels.
- **Créer un `<EntityHeader>`** et un `<Timeline>`, réutilisés par la fiche
  dossier, la fiche client et la fiche lead.

---

## 5. Architecture cible

```
src/
├── design-system/        # tokens, thème, primitives, ThemeProvider
├── components/
│   ├── ui/               # shadcn (inchangé)
│   ├── data/             # DataTable, filtres, états vides, skeletons
│   ├── forms/            # FormDialog, champs métier
│   └── layout/           # AppShell, Sidebar, CommandPalette, GlobalSearch
├── features/<module>/
│   ├── <module>-page.tsx # orchestration seule, < 200 lignes
│   ├── components/       # sections de l'écran
│   └── hooks/
├── services/             # un service par domaine
│   ├── sms/              # SMSService + adaptateurs Octopush/Twilio/Brevo
│   ├── ai/               # AIService + registre d'outils + garde-fous
│   ├── routing/          # RoutingService + adaptateur cartographique
│   ├── documents/        # DocumentService, rédaction PDF
│   └── notifications/
└── types/
```

**Règle structurante :** chaque service externe est derrière une interface et un
adaptateur. Changer d'opérateur SMS ou de moteur de routage ne doit toucher
qu'un fichier d'adaptateur.

### Tables à créer

| Table | Rôle |
|---|---|
| `routes` | une tournée : date, technicien, départ, retour, totaux |
| `route_stops` | arrêts ordonnés, créneau, durée, distance au précédent |
| `case_statuses` | statuts configurables : libellé, ordre, couleur |
| `document_redactions` | original, version expert, zones masquées, auteur, date |
| `ai_conversations` / `ai_messages` | historique de l'assistant |
| `ai_action_log` | **traçabilité de toute action IA** — exigence de sécurité |

### Assistant IA — trois niveaux

L'IA n'accède **jamais** à la base. Elle appelle des fonctions déclarées, chacune
portant son niveau :

- **LECTURE** — `rechercherClient`, `lireDossier`, `listerDocuments`,
  `analyserPlanning`. Exécution directe.
- **PRÉPARATION** — `preparerSMS`, `creerDevis`. Produit un brouillon, affiché
  pour validation.
- **ACTION** — `envoyerSMS`, `creerTache`. Confirmation explicite obligatoire,
  et journalisation dans `ai_action_log`.

Les outils s'exécutent côté serveur, en Edge Function, avec la clé API jamais
exposée au navigateur.

### Rédaction PDF — point non négociable

Un rectangle noir superposé laisse le texte extractible. La génération doit
**supprimer les objets texte** de la zone, pas les recouvrir. Traitement
côté serveur, sur une copie ; l'original reste intact et versionné.

---

## 6. Ordre des travaux

Chaque étape est livrable et vérifiable. On ne passe à la suivante qu'après
contrôle visuel et fonctionnel.

| # | Étape | Pourquoi à ce moment |
|---|---|---|
| **0** | Nettoyage : code mort, découpage de `crm-service` | Base saine, sans risque |
| **1** | Design system complet + thème clair/sombre | Tout le reste en dépend |
| **2** | `DataTable`, `FormDialog`, `EntityHeader`, `Timeline` | Supprime la duplication **avant** de l'étendre |
| **3** | AppShell : sidebar réductible, recherche globale, command palette, raccourcis | Ossature de navigation |
| **4** | Dashboard cockpit + « À traiter aujourd'hui » | Premier écran à bénéficier des étapes 1-3 |
| **5** | **Fiche dossier** — header, actions rapides, pipeline, 8 onglets, timeline | L'écran le plus important, sur des briques éprouvées |
| **6** | Statuts configurables | Prérequis du pipeline de l'étape 5 |
| **7** | `SMSService` + adaptateurs + templates à variables | Autonome, alimente les actions rapides |
| **8** | Planning : jour/semaine/mois/technicien, drag & drop | S'appuie sur DataTable et le design system |
| **9** | Tournées : carte, `RoutingService`, optimisation | Le plus lourd ; dépend du planning |
| **10** | Documents Expert : détection, validation humaine, rédaction PDF | Indépendant, techniquement exigeant |
| **11** | Assistant IA : registre d'outils, 3 niveaux, journalisation | En dernier — il s'appuie sur tous les services précédents |
| **12** | Passe mobile + préparation Capacitor | Vérification transversale finale |

**Les étapes 0 à 3 ne produisent aucune fonctionnalité neuve.** C'est
volontaire : sans elles, chaque écran suivant recrée ses propres tableaux, ses
propres dialogues et ses propres styles, et l'objectif « SaaS premium cohérent »
devient inatteignable.

---

## 7. Points durs

| Sujet | Difficulté réelle |
|---|---|
| Distances routières | Nécessite un fournisseur (geocoding + matrice). Coût et quotas à arbitrer. |
| Optimisation de tournée | Problème d'ordonnancement avec fenêtres de temps. Heuristique correcte plutôt qu'optimum exact. |
| Rédaction PDF | Vraie suppression d'objets texte. Bibliothèque serveur, pas navigateur. |
| IA contextuelle | Le registre d'outils et les garde-fous sont l'essentiel du travail, pas le dialogue. |
| Responsive | Reprise de mise en page de 13 691 lignes, pas un ajout de classes. |

---

## 8. Décisions attendues avant de lancer l'étape 0

1. **Navigation** — la liste demandée fait disparaître *Contacts*, *Campagnes* et
   *Scénarios*, qui existent et fonctionnent. Supprimés, fusionnés, ou conservés
   hors menu principal ?
2. **Téléphonie** et **Statistiques** apparaissent au menu sans être spécifiés.
   Périmètre attendu ?
3. **Fournisseur cartographique** — le choix conditionne l'étape 9.
4. **Répartition du travail** — quelles étapes confiées à Bolt, lesquelles
   traitées directement ici.
