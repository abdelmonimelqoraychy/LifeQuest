# AUTH-2 — Fondations Supabase et validation locale de sécurité

Date : 12 octobre 2026. Reprise autorisée après installation de Docker. Références : AGENTS.md, AUTH-1 validé, F05_FINAL_VALIDATION.md et prompt de reprise joint. **Fondations locales implémentées et testées ; sécurité de l'hébergement distant et parcours produit complets non validés. AUTH-3 n'est pas commencé.**

## 1. Résultat et périmètre

Supabase local a réellement démarré avec le projet dédié `lifequest-auth2`. Les migrations du prototype et de la vérification de session sont appliquées à cette seule base locale. Deux identités fictives sont utilisées par les tests ; aucun profil Hunter réel, sauvegarde ou clé localStorage n'est transféré.

Les deux approches transactionnelles ont été exercées : commande RPC avec JWT utilisateur et connexion Node/pg avec rôle limité, transaction et pool réutilisé. **RPC est retenu pour les fondations Next locales**, sans credential PostgreSQL ni service_role dans le runtime applicatif. Les preuves de connexion directe concernent le harnais Node, pas une route Next PostgreSQL déployée. Les essais d'hébergement/Supavisor/TLS distant restent nécessaires avant production.

Un bootstrap authentifié minimal est disponible à `/api/auth/bootstrap` : identité vérifiée et session active, réponse privée sans cache. Il renvoie uniquement actor et `cloud_not_connected`, jamais une progression locale ou un Hunter initialisé à zéro. Les clients SSR/navigateur et le Proxy sont préparés ; aucune interface register/login, migration, modification de cinématiques ou conversion du gameplay local n'est effectuée.

## 2. Git, outils et environnement réel

Branche : `feature/lifequest-improvements`. Les commits `76c27ef` et `6f51d80` sont présents. Au début de cette reprise, seul le rapport AUTH-2 de la tentative précédente était non suivi ; les fichiers applicatifs étaient propres. Aucun commit, staging, push, merge ou déploiement pendant cette reprise.

| Outil | Version constatée |
| --- | --- |
| Node / npm | 24.19.0 / 11.17.0 |
| Next / React / React DOM / TypeScript | 16.4.0 / 19.3.0 / 19.3.0 / 5.9.3, inchangés |
| Docker Desktop | 4.95.0, build 242831 |
| Docker client et Engine | 29.8.2 ; contexte desktop-linux, serveur linux/amd64 |
| Supabase CLI | 2.120.0, dépendance locale épinglée dans tools/auth2 |
| Pilote du prototype | pg 8.23.1, uniquement dans tools/auth2 |
| SDK frontend | @supabase/supabase-js 2.117.3 ; @supabase/ssr 0.12.7, versions épinglées |
| PostgreSQL local | Version majeure 17 configurée ; aucune version patch revendiquée sans lecture dédiée |

Le client Docker par utilisateur est à `C:/Users/hp/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe`. Dans le sandbox initial, ce chemin, le PATH et les processus Docker n'étaient pas visibles. Une vérification hors sandbox autorisée a trouvé le binaire ; `docker version`, `docker info` et `docker run --rm hello-world` réussissent. Le constat antérieur « Docker indisponible » décrit l'accès de la tentative précédente, pas l'état Windows actuel.

Après les contrôles, le seul serveur Next de test a été arrêté après vérification de son PID/commande/port. La stack lifequest-auth2 a été arrêtée avec `supabase stop`, code 0, sans option d'effacement ; configuration, migrations et sauvegarde locale de développement sont conservées. Docker Desktop et les autres applications ne sont pas arrêtés. Redémarrage possible avec la procédure §10.

Aucun conteneur ni écoute sur les ports vérifiés n'était présent avant démarrage. Aucun processus d'une autre application n'est terminé. Les services locaux inutiles au prototype sont désactivés (Studio, Storage, Realtime, Edge, Analytics). API 54321, PostgreSQL 54322 et SMTP local 54324 ; aucune liaison CLI à un projet distant.

## 3. Installation, variables et confidentialité

La CLI est installée selon la méthode npm locale documentée, sans installation globale ; Node répond au minimum requis. `supabase init` crée seulement la configuration locale. Deux lockfiles distinguent les SDK applicatifs et les outils de preuve. [CLI Supabase](https://supabase.com/docs/guides/local-development/cli/getting-started).

L'installation SDK ajoute deux dépendances directes et supprime les 38 packages extraneous antérieurs par le comportement normal de npm install ; aucune dépendance déclarée RPG n'est retirée. Next/React/formules sont inchangés. Les scripts de dépendances non approuvés ne reçoivent aucune approbation générale. Le message npm relatif à unrs-resolver est conservé comme avertissement d'outillage.

`configure-local.cjs` capture le statut CLI en mémoire, refuse une cible distante, exige une clé publishable et refuse d'écraser un .env.local existant. Il crée `frontend/.env.local` contenant uniquement URL/API publique, clé publishable et APP_ORIGIN. Ce fichier est ignoré par Git. `.env.example` contient seulement des placeholders ; une exception locale .gitignore permet sa future publication.

Aucun JWT, mot de passe, secret Auth ou URI de credential n'est affiché dans les sorties du harnais ou ce rapport. Les valeurs de statut/inspection Docker nécessaires aux tests restent en mémoire. Le credential administratif PostgreSQL local sert aux migrations, aux fixtures et au nettoyage des seuls comptes générés ; jamais à la commande RPG ou au bootstrap. Le rôle de connexion limité reçoit un mot de passe aléatoire temporaire en mémoire puis repasse NOLOGIN à la fin des tests. Aucune clé service_role n'est utilisée pour une commande de progression.

## 4. Migrations et prototype

Les trois migrations initiales ont été appliquées pendant l'implémentation ; une quatrième corrige les droits effectifs après l'audit final (§11). Ensemble ordonné :

1. `supabase/migrations/20261012000100_auth2_security_proof.sql` : schéma auth2_proof, progress, receipts, rôles limités, grants/RLS, commande public.auth2_award.
2. `supabase/migrations/20261012000200_auth2_identity_helper.sql` : helper d'UID étroit et adaptation au schéma Auth géré par Supabase.
3. `supabase/migrations/20261012000300_session_foundation.sql` : prédicat de session en lecture seule public.lifequest_session_active.
4. `supabase/migrations/20261012000400_auth2_rpc_execution_grants.sql` : révocation effective de PUBLIC/anon dans le contexte du propriétaire limité, sans modification de données ou du corps de la fonction.

Le montant fixe **7** est fictif et ne reproduit aucune formule LifeQuest. Les tables de test sont séparées ; les RPC auth2_* ne sont pas des commandes de gameplay. Receipts : unicité (acteur, request_id) et (acteur, reward_id). Même intention rejouée = reçu existant ; même request_id avec autre reward_id = refus. Verrou de progression avant lecture/calcul/écriture, crédit et reçu dans la même transaction. Le drapeau d'exception après UPDATE appartient exclusivement au prototype et ne doit pas devenir une API de production.

Le rôle propriétaire de la commande RPC n'a ni SUPERUSER, ni BYPASSRLS, ni propriété des tables ; FORCE RLS et grants restreignent son périmètre. Les droits temporaires SET/INHERIT du rôle de migration sont retirés ; une affiliation administrative créée par Supabase peut rester sans SET/INHERIT (§11), sans bénéficier au runtime. Après la quatrième migration, PUBLIC/anon n'ont pas EXECUTE sur la commande ; avant cette correction, le refus anonyme fonctionnel ne démontrait pas cette propriété. L'utilisateur authenticated ne dispose d'aucun DML direct sur les tables, même sur ses propres XP.

Les helpers privilégiés sont détenus par postgres pour lire l'identité/session dans le schéma Auth géré, mais retournent seulement UUID courant ou booléen, sans argument de substitution d'acteur et sans ligne Auth. Objets qualifiés, search_path vide, EXECUTE restreint. La commande qui crédite les XP reste détenue par le rôle limité ; aucune confusion entre helper de lecture et mutation privilégiée. [Fonctions Supabase et permissions](https://supabase.com/docs/guides/database/functions).

## 5. Essais réels et résultats

`tools/auth2/security-check.cjs` exécute **11 groupes de contrôles réussis**, plusieurs assertions par groupe :

| Groupe | Preuve exécutée |
| --- | --- |
| Identités fictives A/B | Signup Auth local réel, sessions distinctes ; fixtures créées dans auth2_proof seulement |
| Anonyme | SELECT direct sans JWT refusé |
| Isolation SELECT | A ne voit que A, B ne voit que B ; filtre vers B avec JWT A retourne vide |
| DML direct | PATCH sur autre compte et sur propre compte refusé ; insertion d'un reçu fabriqué refusée |
| RPC directe | Appel anonyme et expected_actor de B avec JWT A refusés |
| JWT | Signature altérée rejetée ; JWT local réellement signé mais expiré refusé avec diagnostic d'expiration |
| Idempotence RPC | Deux appels concurrents même commande, retry puis autre request_id pour même récompense : un crédit ; conflit de payload refusé |
| Rollback RPC | Exception après UPDATE : XP et nombre de reçus inchangés |
| Connexion limitée/pool | A/B alternés sur pool max=1, commit puis rollback simulé, requête sans contexte : aucune identité ni ligne privée ; chaque acteur reste à 7 XP fictifs |
| Privilèges | SUPERUSER/BYPASSRLS faux et aucun ownership de table pour les deux rôles de mutation |
| Révocation | Logout Auth réel ; ancien access token encore non expiré ne permet plus RPC ni SELECT privé |

Le chemin direct vérifie l'identité auprès d'Auth avant d'injecter ses claims dans la transaction. Cette injection ne vérifie pas elle-même le JWT : un credential runtime compromis pourrait fabriquer un contexte. Le pool de test est applicatif Node, **pas Supavisor**. La requête HTTP directe RPC est testée sans protection UI Next pour vérifier que la sécurité existe aussi dans PostgreSQL.

Les tests nettoient exclusivement les identifiants fictifs générés pendant leur exécution, sans reset/drop de base. Les preuves synthétiques réussies sont écrites dans tools/auth2/.results/security-report.json ignoré. Aucun compte fictif créé par ces suites ne demeure volontairement comme profil réel.

`tools/auth2/app-check.cjs` valide cinq groupes HTTP réels sur le build Next de production local :

- Bootstrap anonyme → 401.
- Cookies SSR A → B → A : acteur exact, état cloud_not_connected, private/no-store et Vary Cookie, aucune donnée RPG locale.
- Cookie forgé → 401.
- JWT local expiré avec refresh token valide : rafraîchissement, identité conservée et Set-Cookie renvoyé.
- Session A révoquée : ancien cookie refusé ; B reste valide et isolé.

`bundle-check.cjs` vérifie **26 assets clients** contre les trois valeurs privées JWT_SECRET/SECRET_KEY/SERVICE_ROLE_KEY de cette stack : aucune correspondance, valeurs jamais imprimées. Cela concerne le build testé ; un futur secret ou changement de variable publique doit être contrôlé de nouveau.

## 6. Architecture retenue et fondations Next

RPC est choisi pour la suite locale : JWT utilisateur transmis à PostgREST, transaction SQL unique, aucun credential PostgreSQL dans Next, fonction de commande limitée soumise à RLS. La connexion directe a démontré isolation/rollback/idempotence dans Node, mais nécessite la construction de claims et davantage de gestion de connexions. Sur un hébergement serverless, ces coûts et frontières de confiance favorisent RPC ; **l'hébergement cible demeure non défini/non testé**.

Les futures règles métier RPC devront avoir des tests de parité explicites avec TypeScript ; aucun calcul RPG n'est porté en SQL ici. Il faut remplacer les RPC fictives par des intentions métier validées et ne jamais accepter un montant final client. Le prototype direct reste seulement un test comparatif, pas un deuxième runtime applicatif.

`frontend/src/proxy.ts` ne couvre pour cette phase que /api/auth/*. Le Proxy appelle getClaims et propage les cookies rafraîchis ; l'endpoint vérifie getUser, refus anonyme/non confirmé, puis prédicat SQL de session active. Config manquante = 503, absence d'identité = 401, erreur de prédicat = 503 ; diagnostics fixes sans payload privé. Une session React, getSession ou un cookie non vérifié ne suffit pas. [SSR Supabase](https://supabase.com/docs/guides/auth/server-side/creating-a-client).

Le client navigateur n'est monté par aucune page RPG ; pas de singleton contenant l'identité. Le client serveur est créé par requête et utilise no-store. Le bootstrap est une route API distincte, hors lecture localStorage/F05. La boundary F05 du gameplay est conservée intégralement. Le composant racine n'est pas remanié ; les futures pages Auth devront être correctement séparées de cette boundary en AUTH-3.

## 7. Contrôles frontend et non-régression

| Contrôle exécuté pendant cette reprise | Résultat |
| --- | --- |
| npm run typecheck | Code 0 |
| npm run lint | Code 0 |
| npm test | Code 0, **181 tests**, zéro échec : 178 existants + 3 configuration Auth |
| npm run build | Code 0 ; route bootstrap dynamique et Proxy présents |
| node scripts/browser-check.cjs, production locale port 3102 | Code 0, **67 observations**, aucune erreur console/runtime/hydratation remontée |
| Tests SQL/Auth tools/auth2 | Code 0, 11 groupes réels |
| Tests HTTP SSR tools/auth2 | Code 0, 5 groupes réels |
| Contrôle bundle | Code 0, 26 assets et 3 valeurs privées |
| npm audit --omit=dev --json | Code 0 ; aucune alerte production signalée |
| Installation SDK | npm maintient 5 alertes élevées de développement ; aucun audit fix/force ni disparition annoncée |
| Syntaxe Node des quatre harnais/configuration | Code 0 |
| git diff --check | Code 0 ; avertissements usuels LF/CRLF |

La suite Chrome reprend F01–F05 et désarchivage. Aucun Safari/Firefox, lecteur d'écran humain, cinématique complète ou nouveau test d'arrêt disque F05. Les contraintes F05 de durabilité restent celles du rapport existant ; aucune sauvegarde locale n'est modifiée par les tests Auth.

## 8. Échecs de mise au point et limites des preuves

1. Docker invisible dans le sandbox : résolution par vérification hors sandbox et chemin exact fourni/confirmé. Aucun échec du moteur Linux ; hello-world final réussit.
2. Première migration : changement de propriétaire refusé (42501). Ajout de droits temporaires de migration explicitement révoqués, pas de privilège runtime global.
3. Premier prototype : 6 groupes passent, RPC refuse schema auth. L'inspection montre que GRANT USAGE par le rôle postgres géré n'accorde pas effectivement ce droit aux rôles personnalisés. Ajout d'un helper étroit via deuxième migration ; tests finaux réussis. La première migration conserve cet essai de grant sans effet ; les trois migrations doivent être appliquées avant utilisation. Les droits effectifs, pas le seul succès syntaxique GRANT, sont la référence.
4. Premier harnais HTTP : refresh échoue à l'assertion. La fixture ciblait le cookie utilisateur séparé du SDK plutôt que le cookie de tokens et devait simuler un vrai token expiré. Le harnais est corrigé, les cinq groupes finaux réussissent ; aucun défaut final du Proxy n'est revendiqué sur cette base.

Pendant l'implémentation initiale, une seule installation locale avait été démarrée et migrée. L'audit préalable au commit a ensuite reconstruit une base indépendante depuis zéro (§11). Aucune coupure réelle du processus pendant COMMIT, quota cloud, panne réseau prolongée ou débit de charge n'est testé. Le retry RPC reconstitue une réponse ignorée/perdue côté appelant, sans coupure physique de réseau. Les confirmations e-mail sont désactivées **uniquement dans cette stack de fixtures locale** ; confirmation SMTP/PKCE/reset devront être exercés en AUTH-3. Aucun client Auth distant n'est autorisé implicitement par cette configuration.

Pas de TLS/Supavisor/connexion directe depuis un hébergement Next distant validés ; pas d'authenticité universelle de données historiques ; pas de provisioning Hunter réel ni schéma complet des modules. Les fonctions étroites utilisant auth.sessions doivent être testées à nouveau contre la version/configuration réelle du projet distant. L'accès client Auth actuel partage des cookies SDK ; aucune promesse HttpOnly globale.

## 9. Fichiers de cette reprise

Modifiés :

- frontend/package.json et frontend/package-lock.json : SDK Supabase épinglés seulement.
- frontend/.gitignore : exception pour le modèle .env.example, .env.local toujours ignoré.
- docs/AUTH_2_FOUNDATIONS_REPORT.md : remplace le bilan de blocage précédent par les résultats de cette reprise.

Créés :

- frontend/.env.example : placeholders publics.
- frontend/src/lib/supabase/config.ts, client.ts, server.ts, proxy.ts : configuration et clients/refresh.
- frontend/src/proxy.ts : matcher limité à l'API Auth.
- frontend/src/app/api/auth/bootstrap/route.ts : identité et état de fondation uniquement.
- frontend/tests/auth-config.test.cjs : absence de fallback, refus de clé privée, protocoles admis.
- supabase/config.toml, supabase/.gitignore et les quatre migrations listées en §4.
- tools/auth2/package.json, package-lock.json, .gitignore et README.md.
- tools/auth2/security-check.cjs, app-check.cjs, bundle-check.cjs, configure-local.cjs.

Créé mais **ignoré** : frontend/.env.local, uniquement configuration publique locale. Artefacts .next, .browser-check, supabase/.temp et tools/auth2/.results ignorés. Les sept fichiers de restauration des quêtes, règles RPG, onboarding, cinématiques et moteurs locaux F05 ne sont pas modifiés. Aucun nouveau commit ni publication.

## 10. Reproduction et suite AUTH-3

Procédure locale détaillée dans tools/auth2/README.md : npm ci de l'outillage, local:start, local:migrate, test ; configuration publique via configure:local, build/start Next sur port libre, test:app et test:bundle. Ne pas utiliser de projet distant ni exposer les sorties credentials de start/status. local:stop conserve les données ; aucun reset ou stop --no-backup requis.

Avant AUTH-3, faire valider ce périmètre et préciser l'hébergement/région envisagés. Pour le produit final : activer et tester confirmation e-mail, SMTP adapté, liens expirés/PKCE/reset, gardes de toutes les routes métier, isolation des caches/logout multi-onglets et checkpoints d'origine. Aucun accès invité final. Un utilisateur existant devra charger sa progression cloud en AUTH-4, jamais son ancien localStorage comme substitut de connexion.

AUTH-4 devra définir les vrais modèles/provisioning, transactions RPG, bornes/periods/revisions, parité TypeScript/SQL et commandes idempotentes. AUTH-5 devra reprendre onboarding/cinématiques sans reset ; AUTH-6 intégrera le choix explicite nouveau/reprise, archives/restaurations/reçus et F05, sans import automatique. Supprimer ou isoler les objets auth2_* de toute future publication métier après revue, sans supprimer des données utilisateur.

**Verdict : fondations Auth et prototype de sécurité validés pour la stack locale testée ; authentification obligatoire de l'ensemble du produit, sauvegarde cloud Hunter et sécurité de déploiement non encore livrées. AUTH-2 s'arrête ici pour validation ; AUTH-3 n'est pas lancé.**

## 11. Audit final et reconstruction avant commit local

Le 12 octobre 2026, une copie indépendante est créée hors dépôt dans `C:/Users/hp/myproject/lifequest-auth2-rebuild-a9169006`, avec project_id distinct et ports 55321/55322/55324. Les trois migrations initiales s'appliquent depuis une base neuve, dans leur ordre. Aucun reset/drop ni modification de la base lifequest-auth2 existante. Les sources du harnais sont adaptées seulement en mémoire pour viser cette copie ; leurs DELETE de nettoyage sont désactivés pour cette vérification, les données fictives restent conservées.

Le contrôle supplémentaire des permissions échoue avant correction : has_function_privilege(anon,auth2_award,EXECUTE) est vrai, même si la fonction refuse effectivement l'appel anonyme. Cause : la migration 1 retire l'appartenance au propriétaire avant REVOKE/GRANT sur la fonction ; le rôle postgres géré ne peut alors appliquer ces changements. Le rapport initial surestimait la restriction EXECUTE. L'affiliation postgres→rôle personnalisé restante provient de supabase_admin avec ADMIN=true, SET=false et INHERIT=false ; elle ne correspond pas au maintien des droits temporaires de SET ROLE, mais doit être distinguée d'une absence totale d'appartenance.

Correction minimale : migration 4, droits uniquement, dans le contexte explicite du propriétaire de la RPC. Aucun corps de fonction, formule, reçu, compte ou contenu RPG modifié. Un test permanent exige désormais l'absence d'EXECUTE pour anon sur les quatre fonctions, EXECUTE pour authenticated, search_path vide et absence d'appartenance SET/INHERIT résiduelle pour postgres→command_owner. La quatrième migration est appliquée à la copie reconstruite, pas à la base d'origine.

Résultats finaux de cette intervention : **12 groupes SQL/Auth réussis**, **181 tests métier réussis**, quatre migrations enregistrées dans l'ordre et git diff --check réussi. La première vérification complémentaire des droits échouée n'est pas présentée comme une réussite ; son processus de lecture a été interrompu et le contrôle remplacé par les assertions permanentes après correction. TypeScript/lint/build, cookies SSR et 67 observations Chrome ne sont pas relancés pendant cette finalisation : leurs réussites §7 proviennent de l'implémentation précédente ; aucune source TypeScript/RPG n'est modifiée ici.

La copie de reconstruction est arrêtée avec supabase stop, sans effacement. Ses comptes fictifs, volumes et preuves locales restent hors Git. La base d'origine reste conservée et arrêtée ; avant sa prochaine utilisation, appliquer local:migrate pour y ajouter la migration 4. Aucune migration distante ni suppression de données. Les quatre migrations sont éprouvées ensemble, mais cela ne signifie pas que leur exécution indépendante/désordonnée soit admissible.

Le périmètre du commit comprend les fichiers AUTH-2 audités, cette correction de droits, son test permanent et ce rapport. Les fichiers gameplay/vidéos/XP/désarchivage sont comparés à HEAD sans différence. .env.local, .next, .browser-check, .temp et .results restent exclus ; aucun staging de secret ou d'artefact. Sécurité distante, gardes globales et parcours AUTH-3 restent hors validation.
