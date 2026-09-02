# Prompt à donner à ChatGPT

**Prérequis :** le dépôt doit exister sur GitHub, en **privé**, et le connecteur
GitHub de ChatGPT doit y avoir accès. Remplacez `VOTRE-COMPTE/CRMRPB` par
l'adresse réelle avant d'envoyer.

Copiez tout ce qui suit la ligne de tirets.

---

Tu travailles sur le CRM de Relais Pare-Brise, une entreprise de remplacement
de pare-brise. Le dépôt est `VOTRE-COMPTE/CRMRPB`, branche `master`.

Une autre IA — Claude Code — travaille sur le même dépôt, en alternance avec
toi. Nous ne communiquons pas directement : **l'historique git est notre seul
canal**. Ce qui suit sert à ce que nous ne nous contredisions pas.

## Avant toute chose

1. Lis `CLAUDE.md` à la racine. C'est la convention du projet : architecture par
   fonctionnalité, design system, règles RLS, conventions de nommage. Elle
   s'applique à toi aussi.
2. Lis `DATABASE.md` pour le schéma, et `MATRICE-ROLES.md` pour les droits.
3. Lis les **20 derniers messages de commit en entier**, pas seulement les
   diffs.

Ce dernier point est le plus important. Les messages de commit de Claude Code
sont longs volontairement : ils expliquent *pourquoi* une décision a été prise,
quels pièges ont été rencontrés, et quels arbitrages ont été tranchés. Un diff
dit ce qui a changé ; le message dit ce qu'il ne faut pas défaire. Plusieurs
bugs de ce projet ont été réintroduits faute de lire ça.

## Ce que tu dois savoir sur ce projet

Il a été généré par Bolt.new puis repris à la main. Il en reste des défauts
récurrents, dont un qui a coûté très cher et se répète :

**Les erreurs sont avalées.** Plusieurs fonctions de service renvoient
`{ error }` au lieu de lever. Branchées telles quelles sur une mutation
TanStack Query, `onSuccess` se déclenche même quand la base refuse : l'écran
affiche « enregistré » et rien n'est écrit. Vérifie toujours l'erreur, et
lève-la.

Autres points déjà payés :
- Les migrations ne s'appliquent pas seules. Elles s'exécutent à la main dans
  le SQL Editor de Supabase, dans un **nouvel onglet** à chaque fois.
- Toute table a RLS activé, sans exception. Quatre politiques par table.
- Aucun secret dans le frontend ni en clair en base : Supabase Vault.
- Le vocabulaire des statuts de lead est celui de `src/types/index.ts`
  (`LeadStatus`), pas celui de la première migration, qui est obsolète.
- Les adresses passent par la Base Adresse Nationale
  (`https://data.geopf.fr/geocodage`) via `src/services/adresse-service.ts`.
  N'introduis pas un autre service de géocodage.

## Règles de collaboration

**Un seul de nous deux travaille à la fois.** Si tu trouves des fichiers
modifiés non commités que tu n'as pas écrits, ne les touche pas : signale-le à
l'utilisateur et demande quoi faire. Nous avons déjà failli nous écraser
mutuellement.

**Commite ce que tu termines.** Ne laisse pas ton travail en fichiers modifiés :
je vois alors des diffs sans raisonnement, et je risque de les défaire.

**Écris pourquoi, pas quoi.** Le diff dit déjà quoi. Le message doit dire quel
problème est résolu, quels arbitrages ont été faits, et ce qu'il ne faut pas
défaire. En français, sans accents dans les messages de commit.

**Vérifie avant de commiter :** `npm run typecheck`, `npm run lint`,
`npm run test`, `npm run build`. Les quatre doivent passer.

**Signale les migrations.** Si ton travail en ajoute une, dis-le clairement à
l'utilisateur : elle doit être appliquée à la main, sinon l'application casse
avec une colonne manquante.

## Ce sur quoi nous en sommes

Regarde l'historique récent. En résumé : l'intégration Meta Lead Ads fonctionne,
les fiches lead et client s'enregistrent par un bouton explicite (brouillon
local, pas d'écriture au fil de la frappe), les adresses sont autocomplétées par
la BAN, et une carte des interventions vit dans l'Agenda.

Le prochain chantier proposé est la partie Réglages : gestion des assureurs
(la table existe, aucun écran ne la remplit) puis les cadences de relance
(aujourd'hui écrites en dur dans le SQL).

Ne commence rien sans demander à l'utilisateur ce qu'il veut.
