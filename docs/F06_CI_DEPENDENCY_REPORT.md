# F06 — Qualité, dépendances et CI

Date : 12 octobre 2026. Audit du workspace actuel selon AGENTS.md, l'audit final et la validation F05. Aucun changement des règles RPG, du stockage, des backups ou des données personnelles. Aucun commit ni push.

## 1. Résultat

Une installation propre du lockfile fonctionne avec Node **24.19.0** / npm **11.17.0**, après correction d'un défaut réel du script TypeScript. TypeScript, ESLint, les **170 tests**, le build et les **63 observations Chrome** réussissent dans la copie isolée. Aucun paquet extraneous n'y est retrouvé.

Le workflow `.github/workflows/ci.yml` est créé. Sa syntaxe YAML et ses étapes obligatoires ont été vérifiées localement ; **aucune exécution hébergée GitHub Actions n'a été déclenchée ni validée**. Le premier run Ubuntu devra être confirmé après publication autorisée. Les cinq alertes élevées de développement restent présentes ; aucune disparition de vulnérabilité n'est annoncée.

## 2. Dépendances réellement utilisées

Manifeste : `frontend/package.json`. Lockfile v3 : `frontend/package-lock.json`, cohérent avec les dépendances déclarées. Aucun changement de version ni de lockfile dans F06.

| Dépendance verrouillée | Utilisation vérifiée |
| --- | --- |
| Next 16.4.0 | App Router, scripts dev/build/start, configuration `frontend/next.config.ts` ; minimum Node déclaré par le paquet : 20.9.0. |
| React / React DOM 19.3.0 | Composants/hooks et runtime React de Next ; React DOM nécessaire même sans import direct dans les pages. Versions conformes aux peers React de Next. |
| Motion 14.0.0 | `frontend/src/components/onboarding/OnboardingExperience.tsx`, animations et reduced motion. |
| Lucide React 1.53.0 | Icônes du dashboard, Lab et composants, notamment `frontend/src/app/dashboard/page.tsx`. |
| Tailwind 4.3.3 / @tailwindcss/turbopack 4.3.3 | Import CSS dans `frontend/src/app/globals.css` et loader explicitement déclaré dans `next.config.ts`. Aucun PostCSS ajouté. |
| TypeScript 5.9.3 | Compilation stricte et transpilation des tests métier. |
| ESLint 9.39.5 / eslint-config-next 16.4.0 | `frontend/eslint.config.mjs` : règles Next/TypeScript, lint src/tests. |
| @types/node 20.19.43, @types/react 19.3.0, @types/react-dom 19.3.0 | Déclarations TypeScript de développement, pas des dépendances runtime à supprimer faute d'import direct. Les types Node 20 couvrent le code présent ; passage aux types Node 24 à tester séparément si besoin. |

Analyse des imports TS/TSX/CJS/MJS de src/tests/scripts via le parseur TypeScript : packages externes Next, React, Motion, Lucide et TypeScript. Les outils CSS/lint/types ont aussi été vérifiés dans la configuration. Aucun package direct inutile n'est identifié dans ce périmètre. Les composants historiques ne sont pas retirés.

`npm ls --depth=0 --json` du workspace relève **38 paquets extraneous** au premier niveau : Recharts, Redux, react-redux, D3, victory-vendor et leurs dépendances, entre autres. Ils existent dans l'ancien node_modules mais ne figurent pas parmi les dépendances déclarées nécessaires. La copie propre ne les contient pas et toutes les vérifications passent. Le node_modules du workspace n'a pas été nettoyé pour ne pas perturber le développement ; arrêter le serveur avant un éventuel futur `npm ci` local.

## 3. Sécurité et mises à jour

Audits exécutés dans le workspace, puis confirmés avec accès registre dans la copie propre :

| Audit | Résultat |
| --- | --- |
| `npm audit --json` | Code 1 : cinq alertes élevées, zéro critique. |
| `npm audit --omit=dev --json` | Code 0 : zéro alerte signalée. |
| `npm audit --omit=dev --audit-level=high` | Code 0 : contrôle production retenu pour la CI. |

Chaîne démontrée par `npm explain braces` : **eslint-config-next 16.4.0 → @next/eslint-plugin-next 16.4.0 → fast-glob 3.3.1 → micromatch 4.0.8 → braces 3.0.3**. Les cinq paquets alertés sont les cinq maillons, pas cinq vulnérabilités indépendantes exposées dans le navigateur.

L'[avis GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) décrit un épuisement de pile sur des motifs d'accolades profondément imbriqués, versions <=3.0.3, sans version corrigée publiée lors de la consultation. `npm view braces version` confirme 3.0.3. L'exposition identifiée concerne l'outillage de développement ; aucun chemin d'exploitation via les données des quêtes n'est démontré. Zéro alerte production ne vaut pas certification de sécurité complète.

npm propose eslint-config-next 14.2.35, un downgrade majeur : **non appliqué**, car il désalignerait l'outillage de Next 16 et ne constitue pas une validation de compatibilité. Aucun `audit fix --force`, override ou suppression de règles lint. Le workflow ne rend pas bloquant l'audit complet tant que cette alerte connue n'a pas de correctif compatible ; il bloque sur les alertes production élevées/critiques et sur une erreur de l'audit production, y compris une indisponibilité du registre.

Versions disponibles consultées via `npm outdated --json` et métadonnées npm (aucune installée) :

| Package | Installé → disponible | Décision / validation nécessaire |
| --- | --- | --- |
| lucide-react | 1.53.0 → 1.55.0, dans la plage déclarée | Candidat mineur pour une tâche séparée, avec contrôle visuel des icônes. Aucun lien démontré avec braces. |
| motion | 14.0.0 → 14.1.0, dans la plage déclarée | Candidat mineur ; tester onboarding, transitions et reduced motion avant adoption. Aucun correctif de cette alerte démontré. |
| eslint | 9.39.5 → 10.12.0, majeur | npm ci avertit que 9.39.5 n'est plus maintenu. eslint-config-next déclare `eslint >=9.0.0`, mais ce peer ne prouve pas l'absence de changements incompatibles ; tester v10/config/plugins en copie isolée avant décision. Ne remplace pas automatiquement braces. |
| @types/node | 20.19.43 → latest 26.6.5, majeur | latest ne correspond pas au runtime recommandé 24. Évaluer les types 24 séparément ; pas de mise à jour automatique vers 26. |
| typescript | 5.9.3 → 7.0.2, majeur | Reporter : migration de compilation à évaluer séparément, aucune nécessité pour cette CI. |

Next/React/React DOM et l'outillage Tailwind ne sont pas listés comme outdated par cette consultation. Cela ne remplace pas une surveillance future. Priorité : suivre le correctif upstream braces/chaîne Next ESLint, puis revalider installation, lint, tests, build et audit. Ne pas ajouter des dépendances inutiles pour masquer l'alerte.

## 4. Installation isolée et défaut corrigé

Copie : `C:/Users/hp/myproject/lifequest-f06-clean-20261012-v1/frontend`. Seuls src, public, tests, scripts et les manifestes/configurations nécessaires ont été copiés. Aucun node_modules, .next, fichier .env, dépôt .git, profil Chrome personnel ou backup utilisateur copié. `npm ci --no-fund` a créé une installation neuve : code 0, 362 paquets installés, sans paquets résiduels. Le cache npm préexistant peut servir ; il ne s'agit pas d'un essai hors cache ni d'une exécution Linux.

**Défaut reproduit avant le premier build :** `npm run typecheck` échoue avec TS2304 sur `LayoutProps` dans `frontend/src/app/layout.tsx`. L'ancien workspace avait des types Next générés ; la copie propre n'en avait pas. Correction minimale dans `frontend/package.json` : `next typegen && tsc --noEmit --incremental false`. Aucun type de composant ni règle métier modifié. La génération est recommandée dans la documentation livrée avec Next (`node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md`). La commande corrigée passe **avant** le premier build et est exécutée telle quelle par la CI.

Les fichiers package.json final et package-lock.json de la copie sont comparés octet pour octet au workspace : identiques. SHA-256 du lockfile : `b40408b07baa84e5f560aaa2aac704ab27f165152f86068848e68ad7fbf999c9`. Le lockfile conserve les modifications déjà présentes avant F06 ; aucune nouvelle résolution n'est appliquée.

Autres observations : npm ci signale une approbation de script en attente pour `unrs-resolver@1.12.2` dans cet environnement npm. Aucune approbation globale ajoutée ; lint/build réussissent dans cette installation. Vérifier les scripts de dépendances avant toute approbation future. La première consultation outdated/audit de la copie a échoué à joindre le registre dans le sandbox ; reprise avec accès réseau autorisé réussie. Ces erreurs d'environnement sont distinguées des vulnérabilités et du défaut TypeScript.

## 5. Workflow GitHub Actions

Fichier : `.github/workflows/ci.yml`, à la racine Git réelle de LifeQuest.

- Déclenchement : toutes les Pull Requests et push vers main. Pas de déploiement ni de `pull_request_target`.
- Runner Ubuntu, job **Frontend quality**, timeout 20 minutes ; annulation d'une exécution devenue obsolète sur la même ref.
- Token `contents: read` ; checkout sans conservation de credentials ; aucune variable secrète nécessaire.
- Actions checkout/setup-node v7 figées par SHA, références publiques vérifiées via git ls-remote. [Documentation checkout](https://github.com/actions/checkout), [setup-node](https://github.com/actions/setup-node).
- Node lu depuis `frontend/.nvmrc` (24.19.0). Cache npm indexé par `frontend/package-lock.json`, sans cache de node_modules ; installation `npm ci` obligatoire.
- Répertoire de toutes les commandes : frontend. Étapes obligatoires : typecheck, lint, npm test, syntaxe des deux harnais navigateur, build, audit production élevé/critique. Aucun continue-on-error. Une commande défaillante fait échouer le job.

Le YAML est parsé avec js-yaml déjà installé transitivement ; ses déclencheurs, son working-directory et la présence de chaque commande obligatoire sont vérifiés. Les scripts navigateur sont syntaxiquement vérifiés par Node. Cela **ne simule pas le service Actions**, son cache, sa résolution de Node, ni les binaires Linux. Aucun résultat hébergé n'est revendiqué.

La protection de branche n'est pas modifiée. Après publication autorisée, exiger le check Frontend quality pour la fusion, vérifier un run sur main et une PR, et contrôler qu'un échec empêche effectivement la fusion. Les permissions du dépôt et cette politique restent à configurer par son propriétaire.

## 6. Tests exécutés

| Vérification dans la copie propre | Résultat |
| --- | --- |
| npm ci --no-fund | Code 0, installation neuve |
| npm ls --depth=0 | Code 0, zéro extraneous au premier niveau |
| npm run typecheck initial | Code 1, LayoutProps absent — défaut corrigé du script |
| npm run typecheck corrigé avant build, puis confirmation | Code 0, types générés et tsc réussis |
| npm run lint | Code 0 |
| npm test | Code 0, 170 réussites, zéro échec |
| npm run build | Code 0, compilation et routes statiques réussies |
| node scripts/browser-check.cjs sur production port 3103 | Code 0, 63 observations réussies, aucune erreur console/runtime/hydratation détectée |
| Audits complet/production | Cinq alertes dev maintenues / zéro production |
| Syntaxe YAML et invariants CI | Vérifications locales réussies |

Les tests F01/F02/F03/F04 et F05 A/B/C/D sont préservés et exécutés. Chrome utilise un profil synthétique de la copie propre. Les interruptions forcées du harnais E ne sont **pas rejouées pendant F06** : aucune modification du stockage ou du moteur de récupération ; leurs limites/échecs restent dans `docs/F05_FINAL_VALIDATION.md`. La suite courante teste les régressions de récupération, pas la durabilité physique. Ni Firefox/WebKit, ni onboarding complet non couvert par le runner, ni CI Linux ne sont annoncés validés.

## 7. Tests navigateur en CI et limites F05

Cette première CI n'exécute pas les parcours Chrome : la disponibilité du navigateur et le serveur doivent être gérés explicitement. Le runner utilise CDP et un chemin Chrome Windows par défaut, mais `LIFEQUEST_CHROME` peut sélectionner un binaire Linux ; cette portabilité doit être validée avant ajout d'un job requis. Prévoir démarrage du serveur, attente HTTP, profil isolé, timeout et artefacts à accès contrôlé. Pas de profils personnels dans les artefacts.

`storage-crash-check.cjs` dépend de taskkill et Windows ; une éventuelle CI Windows dédiée doit séparer les tests de reprise des assertions de durabilité rapide connues pour échouer. Ne pas rendre ces dernières artificiellement vertes ni ajouter un délai à l'application. Leur qualification doit rester explicite avant d'en faire un check obligatoire.

F05 reste partiellement corrigé. Le journal conservé permet diagnostic, blocage et reprise contrôlée ; localStorage ne fournit aucune atomicité native multi-clés ni garantie de persistance immédiate sur disque. Conserver des exports métier hors du navigateur, rester sur la même origine et ne pas effacer un journal ambigu pour forcer l'accès. L'export diagnostic est privé, distinct d'une sauvegarde, et peut comporter des omissions. Une CI verte ne résout pas ces limites.

## 8. Fichiers modifiés et recommandations

- `.github/workflows/ci.yml` créé : pipeline de validation sans déploiement.
- `frontend/.nvmrc` créé : version Node recommandée commune à la documentation et la CI.
- `frontend/package.json` modifié : génération des types Next avant tsc uniquement.
- `frontend/README.md` modifié : installation npm ci, Node, commandes, CI, alertes et précautions F05.
- `docs/F06_CI_DEPENDENCY_REPORT.md` créé : ce rapport.

Versions de dépendances, package-lock, sources métier/UI, stockage et sauvegardes inchangés dans cette phase. La copie isolée et ses artefacts restent hors du dépôt LifeQuest ; aucun nettoyage destructif du workspace. Le serveur de test de cette session est arrêté à la fin.

Avant déploiement : publier les changements après revue et validation utilisateur, vérifier réellement le job Ubuntu, rendre le check obligatoire, suivre braces et la maintenance ESLint, puis ajouter les parcours Chrome dans une tâche distincte. Vérifier l'hébergement HTTPS et les ressources ; ne pas présenter cette première CI comme une certification de production ou un correctif de F05.
