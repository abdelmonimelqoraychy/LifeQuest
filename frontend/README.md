# LifeQuest

Application personnelle RPG : quêtes, EXP, rangs Hunter, Boss et outils de productivité. Next.js 16.4, React 19.3 et TypeScript. Les interfaces conservent le thème Hunter existant. Le cache serveur et le préchargement partiel optionnels sont désactivés pour conserver le chemin standard d’hydratation de ces données locales.

## Démarrer et vérifier

Version recommandée : **Node.js 24.19.0**, définie dans `.nvmrc`, avec npm (11.17.0 vérifié localement). Avec nvm : `nvm install` puis `nvm use` depuis `frontend`. Avec nvm-windows : `nvm install 24.19.0` puis `nvm use 24.19.0`. Next.js exige au moins Node 20.9 ; la CI utilise la version recommandée, pas toutes les versions possibles.

Après clonage, depuis `frontend` :

```sh
npm ci
npm run dev
```

`npm ci` installe le manifeste et le lockfile sans les mettre à jour et remplace `node_modules`. Ne pas le lancer au milieu d'un serveur de développement ; utiliser une copie isolée pour les audits. Aucune variable secrète n'est nécessaire pour l'application locale actuelle.

Commandes disponibles :

- `npm run dev` : développement avec Turbopack, comme le build. localhost et 127.0.0.1 sont autorisés explicitement en développement.
- `npm test` : tests métier en mémoire ; aucune sauvegarde utilisateur touchée.
- `npm run typecheck` : génération des types de routes Next.js, puis TypeScript sans émission JavaScript. Fonctionne également avant le premier build.
- `npm run lint` : code actif et tests, archives exclues.
- `npm run build` puis `npm start` : production.

Le lockfile suffit à une installation propre ; ne pas dépendre de paquets résiduels présents dans un ancien `node_modules`. Recharts a été retiré car aucun composant actif ne l’utilise. Les polices réseau inutilisées ont été retirées ; Arial et Georgia restent les polices existantes.

## Validation automatique

Le workflow `../.github/workflows/ci.yml` s'exécute sur les Pull Requests et les push vers `main`. Il installe les dépendances avec `npm ci`, puis exécute TypeScript, ESLint, les tests métier, le build et l'audit production (`npm audit --omit=dev --audit-level=high`) depuis `frontend`. Un échec obligatoire fait échouer le job **Frontend quality**. Node est lu depuis `frontend/.nvmrc` ; le cache npm dépend du lockfile et ne remplace jamais l'installation.

Le workflow utilise des actions GitHub figées par SHA, un token en lecture seule et aucune clé de déploiement. Il ne déploie rien. Pour bloquer une fusion, configurer séparément la protection de branche afin d'exiger ce check. Son premier résultat hébergé devra être vérifié après publication autorisée du workflow.

Les tests F01 à F05 sont conservés dans `npm test`. Les scripts navigateur sont évalués séparément et ne sont pas exécutés par cette première CI : ils nécessitent Chrome, un serveur lancé et, pour les interruptions réelles, Windows/taskkill. Voir [le rapport F06](../docs/F06_CI_DEPENDENCY_REPORT.md). L'audit complet `npm audit` reste à surveiller : cinq alertes élevées de développement dans la chaîne ESLint/braces sont connues ; aucun correctif compatible n'a été appliqué. Ne pas utiliser `npm audit fix --force`.

## Organisation

- `src/app` : routes et interfaces.
- `src/components` : navigation, dialogues natifs, cinématiques et minuteur Focus isolé.
- `src/lib/questActions.ts` : création, édition et récompenses de quêtes.
- `src/lib/activityRewards.ts` : reprise des récompenses Focus et Boss.
- `src/lib/storage.ts` : verrou inter-onglets partagé.
- `src/lib/validation.ts` : validation du JSON et des liens.
- `src/lib/hunterCore.ts` : progression, bonus et sauvegardes.
- `src/lib/useStoredData.ts` : abonnements React au stockage.
- `src/lib/useLocalDay.ts` : mise à jour du jour local à minuit et au retour de l’onglet.

Les composants historiques restent disponibles. Les dossiers de sauvegarde ne sont ni compilés ni analysés par ESLint.

## Règles RPG

Tous les niveaux sont recalculés depuis les EXP totaux, selon le choix de l’utilisateur : coût du niveau n = 200 + 25 × (n − 1). Niveau maximal : 100. Les EXP gagnés et les anciennes validations ne sont jamais diminués par ce recalcul. Les anciens niveaux peuvent donc changer.

Quêtes : EASY 30, NORMAL 50, HARD 80 EXP. Un crédit par jour local, semaine commençant lundi, mois civil ou quête spéciale. Un changement de fréquence prend effet après les périodes en cours ; une quête spéciale déjà terminée ne devient pas récurrente. Les nouvelles validations conservent le titre et l’arc de leur réalisation ; les anciennes affichent les informations encore disponibles.

Bonus de régularité : ×1,10 dès 7 jours, ×1,25 dès 30 jours. Focus et Boss ne prolongent pas le streak de quêtes. Le bonus est évalué avant le crédit : la validation qui atteint un seuil active le bonus pour les activités suivantes. Les pénalités de stabilité sont désactivées ; aucun jour de repos ne réduit les EXP. Les anciens enregistrements de pénalité restent conservés à titre historique.

Focus : 25 minutes terminées, 20 EXP de base. Boss : 25 à 300 EXP de base. Si le crédit échoue, l’activité reste enregistrée et sa récompense peut être retentée sans double crédit. Un succès de discipline compte uniquement les validations de discipline.

## Stockage et récupération

Les données restent dans ce navigateur et pour cette adresse du site. Changer de port, de navigateur ou d’appareil ne transfère pas automatiquement les données. Aucun compte serveur, cloud ou assistant IA n’est ajouté.

Les mutations utilisent l’API Web Locks : navigateur récent, contexte sécurisé HTTPS ou localhost. Sans cette API, les lectures restent possibles mais les écritures sont refusées plutôt que risquer une perte entre onglets.

Hunter Core propose EXPORT JSON et IMPORT JSON. Export version 2 : sept modules, transitions et indicateurs de vidéos vues. Les exports complets version 1 restent acceptés. Les imports partiels et données invalides sont refusés avant les écritures. Les écritures de plusieurs clés ne forment pas une transaction de base de données : conserve ton export, notamment en cas de fermeture pendant un import. Une erreur d’écriture entraîne une tentative de retour aux valeurs précédentes ; cette tentative peut elle-même échouer si le navigateur refuse tout stockage.

F05 reste **partiellement corrigé** : les imports possèdent un journal et bloquent l'accès métier tant qu'une récupération est nécessaire. Un journal `prepared` admissible permet de restaurer l'état précédent après confirmation ; `committed` permet seulement de finaliser le nettoyage de la cible vérifiée. Les états ambigus, corrompus ou inconnus ne sont pas réparés automatiquement. L'export diagnostic local est distinct d'un backup métier et peut omettre des contenus pour préserver la confidentialité.

Une lecture de contrôle ne garantit pas la durabilité disque. Des arrêts rapides de Chrome ont perdu le journal récent tout en conservant exactement l'ancien compte ; aucune atomicité native de `localStorage` n'est annoncée. Le délai des tests n'est pas une protection à ajouter à l'application. Détails et échecs : [validation finale F05](../docs/F05_FINAL_VALIDATION.md).

Exporter régulièrement une sauvegarde métier et conserver le fichier hors du stockage du navigateur, notamment avant un import, un changement d'origine ou un nettoyage du navigateur. En cas d'erreur, conserver les données et utiliser les actions proposées par l'écran de récupération. Si un journal bloque l'application, l'export métier est aussi bloqué : seul l'export diagnostic disponible peut être utilisé. Ne pas effacer le stockage ni relancer l'onboarding pour réparer des EXP. Un diagnostic peut contenir des informations personnelles ; ne pas le publier.

## Tests navigateur

Le script `scripts/browser-check.cjs` utilise Chrome headless et un profil de test isolé dans `.browser-check`. Il ne lit pas le profil personnel Chrome.

Démarrer la production sur le port 3100, puis lancer `node scripts/browser-check.cjs`. Les variables LIFEQUEST_TEST_URL et LIFEQUEST_CHROME permettent de choisir l’URL locale et le chemin Chrome. Captures et compte rendu sont exclus de Git. Le scénario efface uniquement les données du profil de test.

Les vérifications à petite largeur et avec densité 2 ne remplacent pas un audit complet WCAG ou un essai sur téléphone physique.

## Vidéo pilote

`scripts/optimize-video.ps1` utilise le transcodeur Windows intégré. Une copie 720p du clip niveau 5 a été créée sans remplacer le MP4 original. Le lecteur conserve l’original comme solution de repli. Les autres vidéos restent inchangées.

## Sécurité des dépendances

L’audit npm du 11 octobre 2026 ne signale aucune vulnérabilité dans les dépendances de production. Cinq alertes élevées transitives concernent braces et la chaîne ESLint. La version publiée vérifiée de braces est 3.0.3, également signalée ; la proposition npm dégrade eslint-config-next vers 14.2.35. Aucun downgrade ni audit fix --force n’a été appliqué. Refaire l’audit et les contrôles lors de la publication d’un correctif compatible.

Les activités sont déclaratives et les données locales modifiables par leur propriétaire. Cette version n’offre pas une protection anti-triche pour un futur classement partagé.


## Achievements persistants

Les six titres existants de Hunter Operations sont désormais enregistrés une seule fois dans le champ optionnel `achievements` de la sauvegarde de progression. Catalogue et critères : `src/lib/achievements.ts`.

| Titre | Critère |
| --- | --- |
| FIRST CLEAR | 1 validation de quête |
| QUEST VETERAN | 100 validations de quêtes |
| DISCIPLINE MASTER | 30 validations de quêtes de discipline |
| RANK D HUNTER | Niveau 10 selon la courbe Hunter centrale |
| RANK S HUNTER | Niveau 50 selon la même courbe |
| 7 DAY STREAK | Au moins une quête validée sur 7 jours locaux consécutifs, à un moment de l'historique |

Les validations récurrentes comptent une fois par période créditée. Focus et Boss ne comptent ni comme quêtes, ni pour la discipline ou la série ; leurs XP contribuent au niveau. Une modification ou un archivage ne retire pas un titre. Le meilleur streak historique est utilisé, sans pénalité de repos. Les titres n'ajoutent aucun XP.

Chaque déblocage possède un identifiant stable et un horodatage de première détection. Lors d'une récompense, XP, historique et titres sont écrits ensemble dans la même clé, sous le verrou existant. Les sauvegardes anciennes sans ce champ restent valides : à l'ouverture d'une page utilisant le système de quêtes, les titres éligibles sont retrouvés depuis les données disponibles et datés au moment de cette détection. Les XP anciens sans historique ne permettent pas de reconstituer les validations manquantes.

Export/import incluent automatiquement les titres avec la progression, sans nouvelle clé. Un import remplace l'état de ce compte (il ne fusionne pas les titres de deux comptes) ; les critères éligibles sont réévalués ensuite. Identifiants inconnus, doublons et dates invalides sont refusés avant écriture. Une sauvegarde endommagée n'est pas écrasée. En cas d'échec de synchronisation, l'erreur est affichée ; une nouvelle ouverture permet de réessayer.


## Boss Battles pondérées (version minimale)

Les nouveaux Boss utilisent le modèle `BossMission` avec un champ optionnel `subObjectives` : identifiant, titre, poids et validation booléenne. Création et calcul : `src/lib/hunterMissions.ts`. Interface : `src/components/hunter/BossBattlePanel.tsx` dans Hunter Operations.

Chaque Boss contient 1 à 20 sous-objectifs ; les poids sont des entiers positifs, leur somme ne dépasse pas 1000. Progression = somme des poids validés / somme de tous les poids. Exemple : poids 3 et 1, premier validé = 75 %, les deux = 100 %. Le pourcentage est arrondi vers le bas. Les champs existants target/current correspondent au poids total/validé ; ils sont vérifiés lors du chargement et de l'import.

Un sous-objectif se valide une seule fois ; aucune récompense intermédiaire. Tous les sous-objectifs doivent être terminés pour marquer le Boss terminé et créditer ses EXP. La récompense de base garde la règle existante : poids total × 10, minimum 25 et maximum 300 EXP, avec le bonus Hunter habituel. Les sous-objectifs sont autonomes et ne valident pas les quêtes ordinaires.

Les validations partagent le verrou inter-onglets existant ; l'événement de fin et la progression sont sauvegardés ensemble. La récompense finale conserve l'identifiant de crédit unique du Boss. Si son crédit échoue, tous les sous-objectifs restent terminés et le bouton de récupération permet de réessayer sans double récompense. Le stockage de progression et celui des Boss restent deux clés distinctes avec reprise, pas une transaction multi-clés.

Les anciens Boss sans sous-objectifs conservent leur compteur +1, leur progression et leur récompense, sans migration destructive. Les sauvegardes exportées incluent les nouveaux sous-objectifs via le module Operations existant. Les poids, doublons et agrégats incohérents sont refusés avant écriture. Un import complet restaure le compte et son historique de crédits ; il ne fusionne pas plusieurs comptes.


### Compatibilité F03 : Boss historiques sans récompense

Un ancien Boss compteur (sans `subObjectives`) terminé avec `xp: 0` peut être finalisé explicitement. Son statut `resolved_without_xp` signifie : terminé, aucune récompense XP à verser. Il exige 0 XP, un compteur terminé et un horodatage de fin valide. L'interface affiche « RÉSOLU SANS XP », jamais « EXP CRÉDITÉS » pour cette résolution.

La finalisation est protégée par le verrou existant et ne crée aucun XP, reçu, événement ou achievement. Les opérations répétées ne réécrivent pas le statut déjà résolu. Si un reçu positif du même Boss existe déjà, il reste intact et prouve le statut `credited` sans nouveau crédit. Un statut historique `credited` sans reçu positif est signalé, sans réparation automatique. Le contrôle d’import F04 est décrit ci-dessous. Les anciens états pending/absents restent lisibles ; aucun traitement automatique à l'import ou au chargement. Les nouveaux Boss pondérés conservent leur minimum de 25 XP. Les clés et formats de stockage restent identiques ; export/import incluent le nouveau statut via le module Operations.

### Intégrité F04 des imports

Avant toute écriture, `importLifeQuest` valide les modules puis leurs relations Boss/Focus → reçus dans le fichier entrant. Un refus ne remplace, ne répare et ne supprime aucune donnée. Le diagnostic indique le module, l'identifiant et la contradiction ; le format de backup v1/v2 et les clés locales sont inchangés.

- `credited` exige un reçu positif identifié exactement par `lifequest:activity:boss:<id>` ou `lifequest:activity:focus:<id>`, avec période unique `once` (déjà validée par le module de progression). Un ancien solde XP sans reçus ne prouve pas un crédit explicitement déclaré.
- Un Boss avec une récompense pending/credited ou un reçu positif doit être terminé. `resolved_without_xp` garde la validation F03 (ancien compteur terminé à zéro) et refuse une contradiction avec un reçu positif. Un ancien reçu de zéro XP reste intact et ne prouve aucun crédit.
- Un statut Focus explicite relève du protocole de récompense de 25 minutes. Les anciennes sessions sans statut conservent leurs durées historiques.
- `pending` avec un reçu positif est accepté : le crédit peut avoir précédé une écriture de statut interrompue. L'import ne corrige pas ce statut ; la reprise existante reste idempotente. Un reçu nul bloquant une récompense positive est diagnostiqué et refusé.
- Les anciens XP sans historique, soldes supérieurs à la somme des reçus, statuts absents et reçus sans activité associée (activité supprimée ou ancienne) restent acceptés. Aucun montant, bonus, attribut ou date historique n'est recalculé à partir des règles actuelles ; le miroir legacy et les paramètres baseline ne sont pas exigés égaux au total courant.

Ce contrôle diagnostique des contradictions vérifiables, pas l'authenticité d'un backup éditable. Il protège l'import ; il n'est ni une réparation des données déjà présentes ni une transaction multi-clés en cas d'arrêt brutal (F05).
