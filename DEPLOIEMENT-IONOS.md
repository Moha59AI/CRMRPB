# Déploiement automatique sur IONOS

Le déploiement est déclenché à chaque `push` sur la branche `master`. GitHub
vérifie le CRM, construit le dossier `dist`, puis synchronise uniquement les
fichiers modifiés vers IONOS.

## Configuration unique

1. Créer un dépôt GitHub **privé** et y pousser ce projet.
2. Dans GitHub, ouvrir **Settings > Secrets and variables > Actions**.
3. Créer les cinq secrets suivants :
   - `IONOS_SFTP_SERVER` : serveur SFTP affiché par IONOS ;
   - `IONOS_SFTP_USERNAME` : utilisateur SFTP IONOS ;
   - `IONOS_SFTP_PASSWORD` : mot de passe SFTP IONOS ;
   - `VITE_SUPABASE_URL` : URL publique du projet Supabase ;
   - `VITE_SUPABASE_ANON_KEY` : clé publique `anon` de Supabase.
4. L'accès SFTP de déploiement doit être limité à :
   `/clickandbuilds/CRMRPB`.
5. Le workflow publie uniquement dans le sous-dossier `CRMRPB-main/dist` de
   cet accès.
6. Dans IONOS, laisser `crm.relaisparebrise.fr` connecté à :
   `/clickandbuilds/CRMRPB/CRMRPB-main/dist`.

Les mots de passe et clés ne doivent jamais être ajoutés à un fichier du dépôt.

## Utilisation quotidienne

À la fin de la journée, un commit puis un push sur `master` suffisent. Le suivi
du déploiement est visible dans l'onglet **Actions** du dépôt GitHub.

Le déploiement peut aussi être relancé sans nouveau commit depuis
**Actions > Déployer le CRM sur IONOS > Run workflow**.
