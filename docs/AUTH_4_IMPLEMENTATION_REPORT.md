# AUTH-4 — Bilan de sous-phase

Date : 14 octobre 2026. **AUTH-4A/B validés. AUTH-4C/D/E et les régressions locales sont validés selon leurs bilans ; aucune validation Cloud n’a été possible faute de cible. AUTH-5 est vérifié sur une stack locale indépendante. L’installation personnelle locale est opérationnelle ; son identité hors `example.test` reste d’origine inconnue, donc aucune sauvegarde personnelle n’a été prise. Le cycle dump/restore a été validé uniquement sur une base fictive indépendante. AUTH-6 n’est pas commencé.** Les sections 1 à 19 conservent les bilans historiques ; §20 décrit AUTH-5, §21 l’installation personnelle et §22 la vérification synthétique de restauration.

## 1. État vérifié et livrable

Projet `C:/Users/hp/Desktop/python/LifeQuest`, branche `feature/lifequest-improvements`, HEAD `18425f5` (AUTH-3). Dépôt propre au début. Documents obligatoires lus : AGENTS.md, AUTH-1, AUTH-2, AUTH-3, F05_FINAL_VALIDATION.md et tools/auth2/README.md. Les constats historiques d'AUTH-1/2 ne remplacent pas le code actuel : RPC et Auth existent déjà, mais aucun module Hunter réel n'est raccordé.

Le contrat complet est dans [AUTH_4A_CLOUD_DATA_CONTRACT.md](AUTH_4A_CLOUD_DATA_CONTRACT.md). Il cartographie les huit clés historiques, les marqueurs cinéma et le journal F05, tous les champs des modèles actuels, les valeurs autoritatives/dérivées/historiques, les DTO, les commandes, les révisions/reçus, le provisioning, les lectures cohérentes, l'isolation et les validations successives.

## 2. Architecture réellement implémentée

**Aucune architecture applicative supplémentaire dans AUTH-4A.** L'application reste celle d'AUTH-3 : identité/session vérifiées, routes métier protégées, écran « Progression Hunter en préparation », bootstrap `cloud_not_connected`. Les composants locaux restent conservés et non montés pour un utilisateur connecté.

Conception proposée : tables métier privées `lifequest`, façade RPC avec JWT utilisateur, owners limités soumis à RLS, verrou Hunter pour les transactions inter-modules, reader agrégé cohérent, receipts idempotents et store mémoire par acteur/époque. Les détails et les différences avec les propositions générales AUTH-1 sont explicités dans le contrat ; ils ne sont pas encore déployés ou validés par SQL.

## 3. Fichiers de cette intervention

Créés uniquement :

- `docs/AUTH_4A_CLOUD_DATA_CONTRACT.md` : conception et critères de passage.
- `docs/AUTH_4_IMPLEMENTATION_REPORT.md` : ce bilan.

Aucun fichier applicatif, package, lockfile, environnement ou secret modifié. Aucune migration SQL créée/appliquée, commande RPG publiée, permission accordée, base démarrée/provisionnée, donnée personnelle lue/transférée ou sauvegarde locale modifiée. Aucun staging, commit, push, merge ou déploiement.

## 4. Constats et incompatibilités

- Les IDs métier sont textuels ; un ID de sous-objectif est unique dans son Boss, pas dans tout le compte. Les FK/PK doivent porter les bons scopes.
- L'ordre des tableaux, les propriétés absentes/nulles, les timestamps d'origine et les extras historiques doivent être conservés, sans devenir des permissions.
- Le validateur autorise des bases XP, crédits et durées historiques fractionnaires, des URL de ressources vides et des sessions sans statut.
- Les reçus de quêtes normales sans quête sont refusés localement ; les reçus d'activités préfixés peuvent être orphelins ou porter un type historique inconnu. Une FK globale ou un enum trop étroit détruirait cette compatibilité.
- Nouvelle quête : le serveur reprend le catalogue 30/50/80 ; même difficulté lors d'une édition conserve la base personnalisée. Bonus avant la nouvelle complétion, stabilité sans pénalité, Focus/Boss exclus des jours de série.
- La série courante servant aux crédits diffère de la meilleure série historique servant à l'achievement ; aucune XP supplémentaire pour les achievements, Lab, inscription ou présentation.
- Boss F03/F04 : résolution historique zéro XP et preuve de crédit positif restent distinctes. Focus pending sans reçu/run authentifié nécessite une politique de reprise historique, pas un crédit implicite.
- Les révisions JS hors plage sûre, les agrégats non finis et les textes/dates non représentables doivent être diagnostiqués, sans troncature ou remplacement silencieux.
- Les nouveaux timers nécessitent temps/durée contrôlés serveur ; le timer importé expiré ne prouve pas une session cloud terminée.
- Le helper de session actuel doit être réévalué pour confirmation actuelle, expiration pendant attente et révocation concurrente. Le verrou de session proposé reste une faisabilité à tester, pas une garantie acquise.

## 5. Contrôles réellement exécutés

| Contrôle AUTH-4A | Résultat / portée |
| --- | --- |
| Git status, branche et log | Propre au départ, branche et commit AUTH-3 confirmés. |
| Lecture du code, types, validateurs, actions/hooks/pages et tests existants | Cartographie des modèles et invariants ; aucune lecture de localStorage utilisateur. |
| Documentation officielle consultée | Transactions PostgREST, types numeric/double precision PostgreSQL 17, fonctions Supabase et RLS ; documentation, pas preuve d'exécution locale. |
| Sonde Node pure : base fractionnaire ×1.1 | `0.45454545454545453*1.1` produit 0.5 ; Math.round retourne 1. Une multiplication décimale exacte peut donner un autre arrondi. |
| Sonde Node pure : raccourci d'arrondi | Math.round(0.49999999999999994)=0 ; floor(x+0.5)=1. Le raccourci ne suffit pas à la parité. |
| Sonde du vrai validState, en VM sans accès au stockage | Deux reçus fictifs à 1e308 avec total1e308 sont admis alors que leur somme devient Infinity. Le futur contrôle cloud doit refuser ce cas ; aucune correction applicative faite ici. |
| Vérification documentaire et Git finale | Voir clôture ci-dessous ; uniquement les deux documents doivent être nouveaux. |

TypeScript/lint/181 tests/build, SQL/RLS/RPC, concurrence/rollback et navigateurs **non relancés pour cette conception documentaire**. Les succès AUTH-2/3 et du commit AUTH-3 sont des références historiques, pas de nouvelles preuves AUTH-4. Les sondes ci-dessus n'établissent aucune parité SQL. L'admission incorrecte d'un agrégat infini révélée par débordement est un critère bloquant de conception pour l'import/reader futur, pas un test de sécurité cloud passé.

## 6. Modules connectés et travail restant

Modules Hunter connectés au cloud : **aucun**. Auth seul est opérationnel selon AUTH-3. Profil, ledger/statistiques, quêtes/archives, Arcs, Operations/Boss, Focus/runs, achievements, events, Ideas/Mind Map/Library/Journal/Creativity et settings restent tous à raccorder selon 4B→4E. Lab ne constitue pas une table supplémentaire, mais son agrégat doit être complet avant ready.

Le contrat propose onze migrations futures ordonnées : six fondations en 4B, quatre helpers/commandes en 4C, un reader en 4D. Les fichiers n'existent pas ici. Chaque migration doit créer ses tables avec restrictions avant son commit, et chaque RPC doit révoquer les droits par défaut dans sa transaction de création.

AUTH-4B devra éprouver une installation indépendante neuve, sans reset de la base existante, les ACL effectives et les relations par acteur, ainsi que le provisioning zéro/pending. Une validation distincte est requise avant 4C. Les tests de parité et de transaction bloquent toute intégration frontend ; la validation du bootstrap A/B précède 4E.

## 7. Décisions et limites

Valider le contrat et le périmètre local 4B. Arbitrages détaillés : arithmétique des futurs soldes fractionnaires, delta historique, révisions lors des détachements, sémantique/verrou de révocation, limites de transport et définition server-ready sans contourner AUTH-5. Une preuve de sécurité échouée arrêtera la sous-phase concernée ; aucun assouplissement de RLS ou recours à service_role.

L'hébergement/région et les contrôles de staging demeurent à choisir pour la validation distante, sans bloquer la conception locale. Les migrations de données réelles et l'identification de leur propriétaire restent AUTH-6. La distinction nouveau/reprise, les cinématiques et les anciens checkpoints ne sont pas inventés pour débloquer un dashboard.

Le point d'arrêt demandé est atteint : **attendre la validation utilisateur avant AUTH-4B.**

## 8. Clôture documentaire

Contrôle final exécuté : inventaire des clés historiques couvert, absence d'espaces terminaux, blocs de code fermés et absence de motifs de clés privées/JWT dans les deux documents. `git diff --check` réussit ; aucun fichier suivi ou staged modifié. Git status montre uniquement les deux nouveaux documents listés en §3 ; HEAD reste `18425f5` et aucune commande SQL n'a été exécutée. Ces contrôles documentaires ne remplacent aucun des essais de sécurité ou de parité prévus pour 4B/C/D/E.

## 9. Historique AUTH-4B — première tentative et arrêt sur prérequis local

### 9.1 Périmètre et base utilisée

Autorisation utilisateur limitée à AUTH-4B reçue le 13 octobre 2026. Branche `feature/lifequest-improvements`, HEAD `18425f5` vérifié, deux documents AUTH-4A non suivis préservés. Aucun fichier applicatif suivi modifié, aucune nouvelle dépendance. Le contrat AUTH-4A n'est pas réécrit.

Projet indépendant `lifequest-auth4b-20261013`, dossier `C:/Users/hp/myproject/lifequest-auth4b-20261013`, API 56321, PostgreSQL 56322, SMTP 56324, shadow 56320. Nouvelle configuration copiée hors dépôt avec `schemas=["public"]`; lifequest et auth2_proof restent hors Data API. Les quatre migrations AUTH-2 ont été copiées sans modification, puis les six nouvelles migrations appliquées dans l'ordre. Aucun projet distant ni fichier de liaison CLI.

Docker Desktop était arrêté. Son lancement autorisé a aussi remis en route automatiquement les conteneurs existants lifequest-auth2. Aucune migration, reset, requête métier ou suppression n'a été exécutée sur cette base originale. Ses conteneurs ne sont pas arrêtés par cette intervention. La stack indépendante est arrêtée à la fin avec `supabase stop`, code 0, sans option d'effacement; sauvegarde et volumes conservés hors Git. Docker Desktop reste ouvert.

### 9.2 Migrations candidates créées

| Version | Contenu réellement appliqué sur la base indépendante |
| --- | --- |
| 20261013000100 | Quatre rôles NOLOGIN, schéma lifequest, domaines numeric fini/ID text/attribut/métadonnées, prédicat d'URL privé. |
| 20261013000200 | hunters, hunter_setup, hunter_modules, hunter_profiles, hunter_settings. |
| 20261013000300 | story_arcs, quests, xp_events, achievement_unlocks, command_receipts. |
| 20261013000400 | boss_missions, boss_subobjectives, system_events, focus_runs, focus_sessions. |
| 20261013000500 | ideas, mind_nodes, resources, journal_entries, creativity_challenges; focus_sessions complète les six collections Lab. |
| 20261013000600 | Politiques par acteur/session, helpers privés, contraintes structurelles différées, provisioning zéro/pending et retrait des accès au prototype. |

Les vingt tables sont privées, avec ENABLE/FORCE RLS et révocation anon/authenticated dans leur migration de création. Refus par défaut avant les politiques complètes de migration 6. PK/FK par acteur, scope Boss pour sous-objectifs, numeric sans scale, bigint pour revisions et ordre, métadonnées JSONB séparées. Ledger et receipts sans UPDATE/DELETE runtime, aucune FK destructive depuis les sources/snapshots de crédits. Aucun calcul de niveau/bonus/récompense, aucune commande RPG ou reader.

Owners : lifequest_schema_owner pour les tables, lifequest_command_owner pour les futurs mutateurs, lifequest_read_owner SELECT et lifequest_provision_owner INSERT initial limité. Aucun SUPERUSER/BYPASSRLS/LOGIN pour ces rôles, aucune affiliation runtime privilégiée. Les helpers current_actor/lock_session sont SECURITY DEFINER détenus par le rôle administratif de migration, search_path vide, sans UID de substitution ni ligne Auth retournée; EXECUTE limité aux rôles internes. Le rôle métier n'a aucun droit direct sur auth.sessions.

Le verrou KEY SHARE proposé et son timeout d'une seconde sont **implémentés mais non validés opérationnellement**. La revalidation vérifie claims, confirmation réelle, anonymat, ban et not_after; elle ne promet pas la validation d'une politique distante d'inactivité. Le helper ne vérifie pas cryptographiquement des claims SQL fabriqués : JWT/PostgREST demeure la frontière d'identité.

Les constraint triggers candidats vérifient ledger, reçus de quêtes normales, structure Boss, crédits positifs F03/F04 et cycles Mind Map, sans récompense. Ils conservent les privilèges de l'invocateur; le provisioning dédié et le rôle Auth géré sont exemptés du rapprochement différé, leur écriture initiale devant être protégée par les seules politiques zéro/pending. Cette interaction avec le rôle réel Auth est précisément **à éprouver**, pas une garantie acquise.

### 9.3 Tests réellement obtenus

| Contrôle | Résultat réel et limite |
| --- | --- |
| Démarrage indépendant et migrations | Réussite après corrections de contexte propriétaire; dix versions enregistrées, dans l'ordre. |
| Catalogue SQL via psql du conteneur | Code 0 : vingt tables privées FORCE RLS, bon propriétaire, rôles minimaux, pas de grants directs anon/authenticated, helpers privés et absence d'EXECUTE authenticated sur auth2_award. |
| Comptage de la base indépendante | 0 comptes auth.users après les tentatives; aucun signup du harnais atteint. Aucun Hunter personnel utilisé. |
| Connexion pg depuis Node | Échec avant la première assertion du harnais; connexions postgres et supabase_admin interrompues, avec et sans négociation TLS locale. Aucun mot de passe/URI affiché. |
| HTTP Node vers Auth et SMTP | Échec : ECONNRESET sur 56321, UND_ERR_SOCKET sur 56324. |
| Vérification réseau/containeurs | Port 56322 joignable par Test-NetConnection; forwarding Docker annoncé; conteneurs finalement healthy; psql interne lit les dix versions. Cela ne valide pas le chemin client externe. |
| A/B, FK inter-comptes et RLS comportementale | Non exécutés. Le contrôle de catalogue n'est pas une preuve d'isolation A/B réelle. |
| Provisioning/signup/idempotence/erreur | Non exécutés. Le trigger candidat ne constitue pas une preuve de signup réussi. |
| JWT expiré/révoqué, verrou concurrent/logout | Non exécutés, critère indispensable non franchi. |
| Redémarrage avec contrôle de conservation | Non exécuté. Arrêt sans effacement réussi, mais conservation après redémarrage non prouvée. |
| npm run typecheck | Code 0. |
| npm run lint | Code 0. |
| npm test | Code 0, 181 tests réussis, zéro échec. |
| npm run build | Code 0, routes protégées/Proxy AUTH-3 conservés. Aucun serveur Next lancé. |
| Syntaxe Node et git diff --check | Code 0. Audit complémentaire des treize fichiers non suivis : périmètre attendu, absence d'espaces terminaux et de motifs de valeurs privées/JWT. Aucun fichier suivi/staged modifié. |

Les tests frontend relancés ne prouvent pas ces nouveaux objets SQL. Aucun résultat Auth-2/3, aucun groupe A/B, aucune suite de concurrence ou navigateur n'est revendiqué comme nouvelle preuve AUTH-4B.

### 9.4 Échecs et corrections de mise au point

Les migrations ont d'abord échoué sur des permissions de schéma, REFERENCES et propriété. Les grants émis hors du contexte propriétaire n'étaient pas effectifs, comme lors d'AUTH-2. Correction : exécuter les grants sous le propriétaire réel, créer les tables dépendantes dans son contexte et garder ce contexte pour RLS/ACL. Les permissions de migration SET/CREATE temporaires sont retirées; le contrôle effectif de catalogue passe. Aucun recours à service_role ou assouplissement RLS.

La source de migration 1 a été corrigée après sa première application pendant cette mise au point. Migration 2/6 contient les grants effectifs, et le catalogue final est contrôlé; **une reconstruction neuve indépendante de toutes les sources finales reste obligatoire**. La réussite séquentielle sur la base de mise au point ne remplace pas cette preuve. Aucun reset de la base existante pour corriger cet écart.

Docker a temporairement signalé une indisponibilité puis redémarré les conteneurs. Après retour healthy, les connexions Node vers les trois services restent interrompues, alors que psql interne fonctionne. La cause précise (forwarding, moteur, réseau du processus) n'est pas établie; aucune modification firewall/WSL/configuration système n'est tentée pour masquer ce blocage.

### 9.5 Fichiers et reprise

Créés : les six fichiers `supabase/migrations/20261013000100_...` à `20261013000600_...`, plus `tools/auth4b/stack.cjs`, `check.cjs`, `catalog-check.sql`, `.gitignore`, `README.md`. Actualisé : ce rapport, toujours non suivi. Le contrat AUTH-4A demeure inchangé. Les quatre migrations AUTH-2, tous les fichiers RPG/Auth frontend, formules XP, vidéos, F01–F06 et désarchivage sont sans différence par rapport à HEAD.

Aucun environnement créé/modifié, aucune sauvegarde localStorage lue ou transférée, aucune donnée réelle introduite. Credentials CLI capturés en mémoire, aucun secret suivi. .env.local, .next, node_modules, .browser-check, .results, .temp et la stack extérieure restent hors Git. Aucun staging, commit, push, merge ou déploiement.

Clôture Git : treize fichiers non suivis (deux documents, six migrations, cinq fichiers d'outillage), HEAD `18425f5` inchangé. `git check-ignore` confirme explicitement l'exclusion de .env.local, .next, node_modules, .browser-check, des résultats AUTH-2/4B et de supabase/.temp. L'audit de motifs n'est pas un scanner universel de secrets; aucune valeur issue du statut CLI n'est écrite dans ces candidats.

Reprise exacte : réparer/vérifier le forwarding local de Docker Desktop sans supprimer les volumes, redémarrer uniquement la stack indépendante avec `node tools/auth4b/stack.cjs start`, puis vérifier la sonde HTTP sans secret du README. Une réponse HTTP 200 est attendue pour Auth health. Ensuite reprendre les tests réels `node tools/auth4b/check.cjs`, contrôler/corriger les candidats uniquement sur une base fictive et reconstruire les sources finales sur une deuxième base neuve distincte. Les injections de panne et les essais A/B du harnais n'ont pas encore été éprouvés; ils peuvent révéler d'autres écarts, qui doivent être documentés sans modifier l'oracle ni élargir les rôles.

**Verdict : AUTH-4B interrompu, non validé. Aucun passage à AUTH-4C autorisable sur ces résultats.** Avant son achèvement : preuve de provisioning Auth réel, tests SQL par rôle et A/B/FK/contraintes, JWT/session expirée-révoquée, faisabilité sûre du verrou et de la concurrence logout, redémarrage avec conservation, installation propre des sources finales. Puis bilan AUTH-4B et validation utilisateur distincte. Les arbitrages numériques AUTH-4C et les garanties distantes restent ouverts.

## 10. Reprise AUTH-4B — résultat local final

### 10.1 Cible réellement éprouvée et préservation

Reprise autorisée après rétablissement de Docker/WSL. Les connexions Node vers PostgreSQL/Auth/SMTP fonctionnent. La base de référence finale est **lifequest-auth4b-release-20261013**, PostgreSQL **17.11** réellement interrogé, ports **60321/60322/60324**, shadow 60320. Dossier hors dépôt : `C:/Users/hp/myproject/lifequest-auth4b-release-20261013`.

Toutes les sources finales ont été installées depuis zéro dans cette base neuve : quatre migrations AUTH-2 inchangées, puis les six migrations AUTH-4B listées en §9.2. L'historique contient exactement ces dix versions dans l'ordre. La comparaison binaire des dix fichiers du dépôt et de la copie réellement installée réussit. Aucun correctif SQL manuel n'a remplacé une migration enregistrée sur cette cible finale.

Les bases de mise au point initial, rebuild (57321/57322/57324), final (58321/58322/58324) et verified (59321/59322/59324) sont conservées et arrêtées, avec identifiants/dossiers distincts. Le dernier nom « release » désigne uniquement la reconstruction locale finale, sans publication. Aucun reset, drop de base ou effacement de volume. La cible release a été arrêtée, redémarrée pour vérifier la conservation, puis arrêtée de nouveau sans effacement.

**lifequest-auth2 reste intact du point de vue de nos opérations** : aucune connexion SQL/App de test, migration, modification de configuration, arrêt ou commande de nettoyage sur cette cible. Ses conteneurs sont observés sains et demeurent démarrés. Aucun projet distant ni données Hunter réelles. La configuration frontend .env.local n'est ni modifiée ni réorientée vers les bases de preuve.

### 10.2 Schéma, permissions et corrections retenues

Les vingt tables privées et les quatre rôles décrits en §9 sont conservés. Nouvelle précision des sources finales : les INSERT/UPDATE métier portent sur les colonnes autorisées; **historical, opening_xp et legacy_roundoff_delta sont interdits en écriture au rôle métier**. Aucun INSERT de Hunter par ce rôle. Le provisioning possède uniquement ses INSERT zéro/pending, sans SELECT/UPDATE/DELETE. Ledger/achievements/command_receipts sont INSERT seulement pour le rôle de commande. Tous les rôles internes sont NOLOGIN en dehors des seules fenêtres du harnais, sans SUPERUSER/BYPASSRLS, droits de migration ou affiliation runtime privilégiée.

Les helpers de forme des compteurs de module et de dates historiques rejettent clés manquantes/inconnues, nombres négatifs/fractionnaires et dates infinies. Les Focus running exigent réellement running_since et deadline_at. Les constraints différées reprennent les contradictions F03/F04 : crédit sans preuve positive, récompense de Boss inachevé, résolution sans XP contredite par crédit et pending bloqué par reçu zéro. Aucun calcul de récompense, arrondi ou delta automatique.

Deux écarts ont été corrigés avant la dernière reconstruction :

1. Signup 500 : la déclaration `h lifequest.hunters` du trigger différé exigeait un accès au schéma pour le rôle Auth géré, avant son retour prévu. Remplacement par `h record`; aucune permission supplémentaire au rôle Auth et aucune exemption nouvelle. Signup réel et panne de provisioning ensuite éprouvés.
2. Les validators privés purs conservaient EXECUTE PUBLIC : REVOKE par schéma sur les privilèges par défaut ne retire pas le défaut global des fonctions. Correction sous le propriétaire : REVOKE global du défaut EXECUTE et révocations explicites des trois fonctions; ACL effectives testées. Leur schéma était déjà inaccessible au client avant cette correction; cette observation ne doit pas être présentée comme une fuite de données. [Privilèges par défaut PostgreSQL](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html).

Une assertion de harnais visait aussi une colonne historical inexistante dans hunter_setup. Son périmètre est corrigé pour les seules tables qui possèdent cette colonne. Ces exécutions échouées sont conservées dans le diagnostic, sans compter comme réussites. Aucune des quatre migrations AUTH-2 n'est réécrite.

Dernière revue : la contrainte origin_choice/migration_id refusait les mauvaises valeurs explicites mais laissait passer NULL par la logique SQL CHECK. Elle exige désormais explicitement legacy si un migration_id existe; son refus est testé. Le REVOKE de schéma de migration 1 est placé dans le contexte propriétaire. Les sources ainsi finalisées sont reconstruites sur la cible release depuis zéro, puis la suite entière et le redémarrage réussissent.

### 10.3 Tests SQL/Auth réels

`tools/auth4b/check.cjs` réussit **21 groupes**, plusieurs assertions par groupe, sur la cible release avec confirmation e-mail réelle par SMTP local :

| Groupe | Résultat obtenu |
| --- | --- |
| Ordre/installation | Dix migrations présentes, six AUTH-4B; sources finales identiques à la reconstruction neuve. |
| Rôles | Privilèges minimaux et aucun SET/INHERIT résiduel de migration exploitable par postgres vers ces owners. Les affiliations administratives Supabase peuvent rester avec ces options false. |
| Tables/helpers | Vingt tables privées ENABLE/FORCE RLS, owner attendu, pas de droits directs anon/authenticated, search_path vide et EXECUTE privé sur les sept fonctions. auth2_award retiré des droits authenticated. |
| Métadonnées | Rôle métier incapable d'insérer/modifier historical, opening_xp ou legacy_roundoff_delta. |
| Signup A/B | Comptes fictifs réellement inscrits/confirmés. Enveloppe zéro, timezone non confirmée, setup pending, quatre modules initialisés, aucun profil/reçu/achievement artificiel au provisioning. |
| Verrou/logout | KEY SHARE acquis par le helper; logout Auth réel attend pendant le verrou, réussit après commit; ancien JWT refusé par le guard et ne lit plus le Hunter. |
| Refresh/attente/timeout | Refresh Auth réussit avec le guard détenu puis libéré; expiration recontrôlée après attente, refus 42501; contention sur session limitée par lock_timeout, refus 55P03 avant 2,5 s. |
| Isolation A/B/owner | Chaque reader voit exclusivement son acteur. UPDATE A vers B ne touche aucune ligne. Le propriétaire de table lui-même ne lit pas ces lignes avec FORCE RLS. |
| Sessions/JWT/API | Claims absents/expirés/anonymes/malformés, couple sub/session incompatible et session inconnue ne lisent rien; JWT falsifié refusé par Auth. JWT local réellement signé mais expiré : PostgREST 401 avec diagnostic d'expiration. Profils Data API lifequest/auth2_proof refusés. |
| Appels directs | SQL sous anon/authenticated refusé, helper de verrou inaccessible au client, RPC publique de preuve refusée et aucune écriture historique autorisée. |
| Idempotence provision | Réentrée contrôlée du trigger sur le seul ID fictif, via table temporaire : aucun doublon et revision 17 conservée; pas de reset. |
| Panne provision | CHECK temporaire NOT VALID injecté sur la seule base fictive; signup retourne 500 et le nombre d'identités reste inchangé. CHECK retiré en finally, aucun compte partiel. |
| Nombres/ledger | NaN/Infinity/-Infinity/négatif, revision négative, solde incohérent et reçu de quête normale orphelin refusés. |
| Formes/temps/profil | Compteurs de module invalides, date historique infinie, fuseau inconnu, migration_id sans choix d'origine legacy, Focus running incomplet et profil vide refusés. |
| Scope Boss/Arc | FK composite et même ID de sous-objectif dans deux Boss du même acteur admis. |
| FK au rôle réel | Références de A vers Arc/Boss/nœud/run présents uniquement chez B refusées; INSERT direct sous UID B refusé. Même ID métier chez A/B et sort_position préservés. |
| F03/F04 | Counter historique zéro résolu sans XP et Focus fractionnaire sans statut admis; credited sans reçu positif refusé. |
| XP fractionnaires | Reçu d'activité orphelin avec suffixe contenant des deux-points et XP 0.125 conservé exactement; deuxième reçu même source/période refusé; DELETE ledger interdit. Montant fixture, pas récompense calculée. |
| Reçus/cascades | Suppression d'Arc référencé refusée; pas de cascade effaçant le ledger. Clé de command_receipt unique et UPDATE interdit. Ce test ne prouve pas encore le retry d'une commande RPG, absent en 4B. |
| Lab | URL vide/métadonnées historiques et créations multiples même jour admises; protocoles/credentials/port invalides refusés; cycle Mind Map refusé. |
| Reconnexion | Nouvelle connexion Auth réelle conserve total fictif 0.125 et revision 17; compteurs des modules fictifs rapprochés avant le contrôle de redémarrage. |

Les tests de rôles internes utilisent de **vrais logins PostgreSQL temporaires distincts**, avec mots de passe aléatoires en mémoire, puis NOLOGIN/password null en finally. Ce n'est pas postgres déguisé par SET ROLE. Pour les refus anon/authenticated, SET ROLE explicite dans une fixture administrative teste leurs permissions effectives. Les injections de contexte SQL ne vérifient pas les signatures; elles éprouvent RLS au rôle réel. La preuve cryptographique JWT expiré/falsifié passe séparément par les services HTTP réels. L'expiration pendant l'attente est un contexte SQL synthétique précisément identifié.

Les écritures et lectures administratives sont limitées aux comptes/entités fictifs et aux assertions du catalogue. Les tests ne calculent ni récompense ni niveau. Aucune session personnelle modifiée/supprimée; seuls les SELECT de verrouillage sur sessions fictives et les opérations Auth normales de ces fixtures sont utilisés. Aucun service_role pour les lectures/commandes métier.

### 10.4 Conservation et contrôles frontend

`restart-check.cjs` compare un SHA-256 de toutes les lignes des **vingt tables Hunter** des deux fixtures de la dernière suite, avant/après stop/start, plus historique des migrations et retour NOLOGIN des rôles : **code 0, conservation identique**. Aucun contenu Auth sensible n'est sérialisé dans cette preuve. Lecture finale de la cible release : **deux comptes Auth fictifs et deux Hunters**, aucun utilisateur personnel. Les fixtures des essais précédents restent sur leurs bases distinctes conservées; aucun transfert entre ces bases. Le rapport final concerne la paire A/B de release, hors Git.

| Contrôle relancé pendant cette reprise | Résultat |
| --- | --- |
| npm run typecheck | Code 0. |
| npm run lint | Code 0. |
| npm test | Code 0, 181 tests réussis, zéro échec. |
| npm run build | Code 0, routes protégées et Proxy conservés. |
| Suite SQL/Auth complète | Code 0, 21 groupes. |
| Catalogue après redémarrage | Code 0, permissions/RLS/roles toujours conformes. |
| Conservation après stop/start | Code 0, hash des vingt tables inchangé. |
| Sources SQL versus copie installée | Dix fichiers identiques, aucune dérive. |
| Comparaison secrets en mémoire | Aucun candidat ne contient les valeurs privées longues du statut/de l'Auth de la stack testée; aucune valeur imprimée. |

Pas de nouvelle suite Chrome, Safari/Firefox, load-test, panne physique pendant commit, backup/restore complet ou hébergement distant. Le build ne raccorde pas le frontend aux tables; la réponse cloud_not_connected et les gardes AUTH-3 demeurent inchangées.

### 10.5 Fichiers finaux et limites avant AUTH-4C

Fichiers nouveaux : les deux documents AUTH-4 déjà non suivis, les six migrations autorisées, et sept fichiers sous tools/auth4b : **.gitignore, README.md, stack.cjs, check.cjs, catalog-check.sql, state.cjs, restart-check.cjs**. Ce rapport est actualisé; le contrat AUTH-4A est préservé. Aucun fichier applicatif, package, lockfile, configuration originale, environnement ou vidéo modifié; aucune formule XP ni code F01–F06/désarchivage changé. HEAD reste `18425f5`, branche feature/lifequest-improvements, rien n'est stagé. Aucun commit/push/merge/déploiement.

Les settings/profile/checkpoints ne sont pas rendus ready par ces fondations. Les compteurs sont contraints en forme; leur mise à jour transactionnelle avec chaque collection et le rapprochement exhaustif du snapshot appartiennent à 4C/4D. Les CHECK SQL ne remplacent pas la validation des futurs payloads/DTO, notamment parité JS des chaînes/URL, bornes de transport, types numériques et formats historiques; les imports restent AUTH-6.

Le verrou de session est faisable et testé dans ces transactions courtes, **sans nouveau grant d'écriture Auth aux rôles métier**. Il ne promet ni révocation rétroactive d'une commande déjà verrouillée, ni invalidation distante instantanée. Avant publication de commandes 4C : fixer/éprouver les limites globales de transaction et d'attente Hunter, prendre les verrous dans l'ordre session → Hunter → entités, recontrôler expiration avant succès. Les durées maximales/inactivité configurées de l'hébergement réel restent à vérifier; la présence d'une session n'en prouve pas seule la fraîcheur.

Conditions avant AUTH-4C : validation utilisateur de ce bilan; arbitrage des additions fractionnaires et de toute politique de reliquat historique (aucun delta automatique), granularité des revisions lors du détachement d'Arc, parité TS/SQL, intents fermées, idempotence/retries et contrôles temporels serveur. La concurrence réelle de récompenses et leur rollback ne sont pas livrés ici. Hébergement/TLS/Supavisor, SMTP/quotas et staging restent non validés. Ne pas appliquer ces migrations à lifequest-auth2 ou à une cible distante sans périmètre distinct autorisé.

**Verdict actuel : AUTH-4B terminé et testé pour la seule stack locale release, en attente de validation utilisateur. AUTH-4C/D/E ne sont pas commencés.**

Clôture exécutée : syntaxe des quatre scripts Node, git diff --check et audit des quinze fichiers non suivis réussis (périmètre, espaces terminaux, motifs privés). git check-ignore confirme l'exclusion de .env.local, .next, node_modules, .browser-check, .results et .temp. Aucun fichier suivi/stagé modifié, HEAD 18425f5 inchangé. Le dernier redémarrage vérifie aussi le catalogue RLS/ACL avant comparaison des données; arrêt final sans effacement réussi. Les limites de staging/parité/RPC décrites ci-dessus restent ouvertes.

## 11. AUTH-4C — Parité privée, décision numérique et arrêt calendaire

### 11.1 Autorisation, préservation et cible

L'utilisateur valide AUTH-4B et autorise seulement AUTH-4C. Branche vérifiée
`feature/lifequest-improvements`, HEAD `18425f5644b7465f7d206097bb0f78d6a8a86d25`.
Le départ comporte uniquement les quinze fichiers non suivis AUTH-4A/B ; aucun
fichier suivi/stagé modifié. Le contrat AUTH-4A et les dix migrations AUTH-2/B
sont protégés par comparaison SHA-256 avant/après. Les sources frontend suivies
et la configuration originale Supabase sont également comparées sans différence.

Nouvelle stack fictive indépendante : **lifequest-auth4c-parity-20261013**,
dossier `C:/Users/hp/myproject/lifequest-auth4c-parity-20261013`, API **61321**,
PostgreSQL **61322**, SMTP **61324**, shadow **61320**. Schémas exposés : public
uniquement. Aucun lien distant, reset ou suppression de volume. La cible est
initialisée neuve avec les dix migrations conservées puis la migration 7 ; deux
correctifs sont ajoutés ensuite par migrations ordonnées, sans réécrire une
migration appliquée. Les treize versions et les treize fichiers installés sont
comparés aux sources. Une reconstruction neuve des treize sources finales n'est
pas exécutée dans cette étape bloquée.

Aucune connexion SQL/HTTP de test à lifequest-auth2, aucun arrêt ou migration sur
cette base ; aucune configuration frontend .env.local modifiée. Aucun compte
Auth, Hunter, reçu ou profil créé dans la nouvelle stack. Le rôle de commande
est utilisé par un vrai login temporaire limité pour les fonctions pures, puis
remis NOLOGIN/password null en finally ; credential aléatoire seulement en mémoire.

### 11.2 Fichiers SQL et périmètre réellement implémenté

- `20261013000700_auth4_rules_and_command_helpers.sql` : huit calculs privés
  rules_reward, rules_progress, rules_rank, rules_period, rules_streak,
  rules_completion_days, rules_attributes et rules_achievements.
- `20261013000701_auth4_float_serialization.sql` : précision float de sortie
  fixée dans progress/attributes, sans changer le paramétrage global ou les données.
- `20261013000702_auth4_activity_prefix.sql` : exclusion par le préfixe complet
  d'activité pour jours de série et critères achievements.

Les helpers sont SECURITY INVOKER, search_path vide, propriétaire limité du
schéma. Aucun EXECUTE PUBLIC/anon/authenticated ; accès réservé au rôle interne
de commande. Aucun nouveau droit de table ou d'accès Auth, aucune fonction
SECURITY DEFINER supplémentaire. Les objets de preuve AUTH-2 restent retirés.

**Commandes RPC RPG réellement implémentées : aucune.** La garde transactionnelle,
canonisation/reçus de commandes et les migrations 8/9/10 de commandes sont
suspendues au critère de parité préalable. Aucun reader, bootstrap ou frontend
AUTH-4D/E. La réponse applicative reste cloud_not_connected et les gardes AUTH-3
restent présentes. Ni compte pending rendu ready, ni contournement local.

### 11.3 Oracle et preuves réellement obtenues

`tools/auth4c/oracle.cjs` extrait les déclarations pures du code TypeScript actuel
par AST, conserve leurs corps et les transpile en mémoire. Aucun navigateur,
stockage ou réseau disponible dans la VM. La formule de récompense provient de
l'expression de completeQuestAction ; seule la lecture locale de settings est
substituée par sa stabilité effective 100. L'instant/jour est fixé pour la
comparaison. Les sources, formules et assertions historiques ne sont pas modifiées.

Les golden fixtures sont synthétiques, versionnées dans `tools/auth4c/golden.json`.
La dernière exécution `parity-check.cjs --characterize` retourne **code 1** :
**sept groupes indépendants réussis, 4 002 contrôles/comparaisons comptabilisés, deux divergences
de périodes conservées comme échecs**. Ce mode poursuit uniquement les calculs
privés indépendants après le diagnostic calendaire ; il n'accepte pas l'écart.
Le mode normal s'arrête à la première divergence. Aucun succès global de parité
ni validation AUTH-4C n'est revendiqué.

| Contrôle | Résultat réel |
| --- | --- |
| Installation/ordre/empreintes | Treize versions ordonnées ; sources installées identiques ; AUTH-4A, dix migrations antérieures et sources frontend préservées. |
| ACL des helpers | Huit fonctions privées invoker/search_path vide, anon/authenticated sans EXECUTE ; aucune RPC RPG publique. |
| Récompenses | **2 781 comparaisons exactes réussies** : 30/50/80, bases personnalisées/zéro/fractionnaires, multiplicateurs 1/1.1/1.25, voisins binaires de demi-unités. |
| Niveaux/rangs | **406 cas représentables réussis**, seuils 1..100 avant/exact/après, fractions/plafond ; **100 rangs réussis**. Le sous-normal refusé est séparé, pas compté comme parité. |
| Périodes/calendrier | **200 comparaisons** daily/weekly/monthly/once, cinq zones UTC/Casablanca/Paris/New York/Auckland, DST, février bissextile, fin de mois/année ; **198 identiques, deux divergentes**. |
| Séries | Cas 0/1/6/7/29/30, hier/aujourd'hui, répétitions/trou, plafond 10 000 et meilleure série historique ; Focus/Boss/activité inconnue exclus. Comparaisons de dates des fixtures restantes réussies. |
| Attributs/achievements | Sommes séquentielles conformes à JS pour la fixture ; six critères conformes, backfill oracle idempotent et aucune XP d'achievement. Cela ne valide pas une RPC de backfill, absente. |
| Addition décimale | Décision utilisateur ci-dessous éprouvée par une requête numeric et une comparaison JS ; aucun montant stocké ou delta ajouté. |
| Valeurs invalides | NaN, Infinity, négatif, base hors borne refusés ; limite sous-normale décrite ci-dessous. |
| Comptage final | Zéro compte Auth ; aucune donnée Hunter réelle ou fictive de gameplay introduite. |

### 11.4 Décision acceptée et limites numériques

Réponse explicite de l'utilisateur reçue pendant cette intervention :
**« Addition décimale exacte pour les nouveaux soldes, en acceptant cet écart
explicite avec JS »**. Cette décision remplace l'arbitrage encore ouvert dans les
sections historiques sur les nouvelles additions, sans réécrire le contrat validé.

Fixture éprouvée : numeric conserve
`0.45454545454545453 + 1 = 1.45454545454545453` ; JS donne
`1.4545454545454546`. Cette différence est acceptée pour le nouveau total.
Reprendre le total binaire tout en conservant les montants détaillés exacts échoue
au rapprochement exact du ledger. La suite démontre cet écart, sans arrondir une
ancienne valeur ni produire de delta. Les futurs calculs de montant accordé
restent soumis à la formule binaire Math.round, distincte de l'addition de solde.

Autre limite réellement observée : `5e-324`, plus petit sous-normal JS positif,
est accepté par getHunterProgress mais refusé par l'entrée textuelle float8
PostgreSQL avec 22003/underflow. Il n'est ni converti en zéro ni compté parmi les
406 comparaisons conformes. Les futurs payloads/readers/imports doivent diagnostiquer
cette représentation non prise en charge ; aucune prétention de parité universelle
sur tous les JS number finis. [Types numériques PostgreSQL 17](https://www.postgresql.org/docs/17/datatype-numeric.html).

### 11.5 Échecs de mise au point et blocage final

1. La première comparaison de progression entière s'arrête sur le sous-normal
   5e-324. Le cas reste testé comme refus et explicitement non équivalent ; aucun
   changement de l'oracle pour lui donner zéro.
2. Une fraction ordinaire est sérialisée en JSON avec quinze chiffres : SQL
   renvoie 1.45454545454545 au lieu de 1.4545454545454546. Le diagnostic lit
   extra_float_digits=0. Correctif additionnel 00701 : précision 3 uniquement dans
   les fonctions pures concernées ; les 406 comparaisons passent ensuite.
3. Une requête de test utilise l'alias SQL réservé day et échoue 42601 ; alias
   local_day corrigé dans le harnais seulement.
4. La première exclusion d'activités comptait incorrectement la longueur du
   préfixe. Le test quest-only échoue ; correctif additionnel 00702 utilisant
   starts_with sur le préfixe complet. Focus/Boss/autres activités sont ensuite
   exclus et les critères achievements passent. Les anciennes sources appliquées
   00700 et 00701 demeurent intactes ; les correctifs ne passent pas par du SQL
   manuel non tracé.
5. Le diagnostic ponctuel initial comporte lui aussi un alias SQL réservé
   precision et échoue 42601. Le diagnostic versionné remplace cette sonde et
   réussit en lecture seule ; aucune donnée modifiée par ces erreurs.

**Blocage actuel : calendrier Casablanca incompatible entre PostgreSQL et Node.**
À `2026-12-31T23:30:00Z`, PostgreSQL retourne le 31 décembre (offset 0), Node le
1er janvier (offset +60 minutes). daily et monthly divergent ; weekly et once
restent identiques pour ce cas. La sonde native timezone PostgreSQL reproduit
exactement l'écart : il ne provient pas seulement du wrapper SQL ou du harnais.
Node annonce tzdata 2026b/ICU 78.3. Les fichiers Casablanca intégrés à PostgreSQL
et présents dans /usr/share/zoneinfo ont des tailles/empreintes différentes ;
la version précise du jeu tzdata PostgreSQL n'est pas établie. Leur footer est
<+00>0. Aucun choix arbitraire d'autorité ou de décalage fixe n'est appliqué.

Une divergence de jour peut modifier période, cooldown et bonus de série.
Conformément à la consigne d'arrêt en cas de blocage de précision/intégrité,
**les commandes dépendant de ces règles ne sont pas publiées et AUTH-4C est
interrompu pour résolution de l'environnement calendaire**. Aucun remplacement
de l'oracle, assouplissement RLS ou recours à service_role.

### 11.6 Contrôles frontend, fichiers et passage ultérieur

| Contrôle relancé pendant cette intervention | Résultat |
| --- | --- |
| npm run typecheck | Code 0. |
| npm run lint | Code 0. |
| npm test | Code 0, **181 tests**, zéro échec ; F01–F06 et restauration conservés. |
| npm run build | Code 0 ; routes protégées/Proxy et état d'attente AUTH-3 conservés. |

Fichiers ajoutés : trois migrations privées listées en 11.2 et
`tools/auth4c/.gitignore`, `README.md`, `stack.cjs`, `oracle.cjs`, `golden.json`,
`parity-check.cjs`, `diagnose.cjs`. Rapport actualisé uniquement. Aucun fichier
applicatif suivi, package/lockfile, vidéo, formule XP, moteur F05 ou configuration
originale modifié. Les résultats/empreintes .results et la stack externe restent
hors Git ; aucun secret ou credential écrit dans ces sources.

Non exécutés en AUTH-4C : RPC métier A/B, crédits concurrents Boss/Focus/quêtes,
rollback entre écriture et receipt, retry après réponse perdue, reconnexion
cloud et garde transactionnelle bornée. Ces fonctions n'existent pas encore ;
les 21 groupes AUTH-4B restent une preuve historique, pas de nouveaux tests RPC.
Aucune nouvelle suite navigateur, restauration complète ou validation distante.

Avant reprise : éprouver une image PostgreSQL/tzdata cohérente avec l'oracle sur
une nouvelle cible indépendante, sans modifier lifequest-auth2 ni supprimer des
volumes ; rejouer une installation neuve des sources finales et la matrice
stricte. Puis terminer garde de commande, catalogue RPC 8/9/10, fermeture des
payloads, idempotence/révisions/compteurs et preuves SQL/Auth/concurrence exigées.
Le passage AUTH-4D exige **AUTH-4C complet puis une validation utilisateur séparée**.

**Verdict : priorité de parité partiellement livrée, blocage calendaire documenté.
AUTH-4C non terminé/non validé ; aucune autorisation implicite AUTH-4D/E. Aucun
staging, commit, push, merge ou déploiement.**

Clôture réelle : catalogue AUTH-4B relu sur la seule nouvelle stack, code 0 ; zéro
compte Auth et zéro Hunter, rôle de commande NOLOGIN. Comparaison en mémoire des
valeurs privées longues de cette stack et de son secret JWT contre les **25
fichiers candidats** : aucune correspondance, aucune valeur imprimée. L'audit
initial de périmètre refusait les noms auth4 à cause d'une regex de lettres seules ;
regex corrigée pour le préfixe attendu, audit final réussi. Syntaxe des scripts,
espaces terminaux/motifs privés, git diff --check et huit chemins ignorés vérifiés.
Aucun fichier suivi/stagé modifié ; branche et HEAD inchangés. Les conteneurs
lifequest-auth2 sont uniquement observés, services Auth/DB/API sains, sans opération
sur leur base. La stack AUTH-4C est arrêtée, code 0, sauvegarde/volumes conservés.
Les résultats de parité demeurent en échec calendaire, sans publication de commande.

## 12. Résolution calendaire — diagnostic, correction démontrée et décision Cloud

### 12.1 Cible neuve et cause identifiée

Intervention du 13 octobre 2026 autorisée uniquement pour diagnostiquer/corriger
le calendrier puis relancer la parité. Nouvelle stack indépendante
**lifequest-auth4c-calendar-20261013**, dossier hors dépôt du même nom sous
`C:/Users/hp/myproject`, ports **62321/62322/62324**, shadow 62320. Les treize
migrations existantes sont installées depuis zéro, dans leur ordre, avec sources
identiques. Aucune nouvelle migration, réécriture SQL, RPC ou modification RLS.
Les stacks précédentes et lifequest-auth2 ne sont ni démarrées pour ces tests,
ni modifiées, ni arrêtées. Aucun reset, effacement de volume ou projet distant.

Les deux fixtures divergentes sont reproduites à l'identique avant correction :

| Instant / zone | Node avec tzdata 2026b | PostgreSQL natif | Node après mise à jour des données |
| --- | --- | --- | --- |
| 2026-12-31T23:30:00Z / Africa/Casablanca, daily | 2027-01-01 | 2026-12-31 | 2026-12-31 |
| Même instant/zone, monthly | 2027-01 | 2026-12 | 2026-12 |

**Cause : jeux tzdata de générations différentes, Node étant antérieur à la
modification du calendrier marocain.** Les notes IANA 2026c modélisent le retour
du Maroc à UTC le 20 septembre 2026 ; 2026b conserve l'ancienne règle. Le
diagnostic natif timezone PostgreSQL et les offsets Date Node reproduisent
l'écart indépendamment de la sérialisation et de rules_period. Ce n'est donc
pas un problème d'arrondi JSON, de période SQL ou de formule XP.
[Notes IANA versionnées](https://raw.githubusercontent.com/eggert/tz/2026e/NEWS).

### 12.2 Versions et sources effectivement distinguées

| Composant | Version / source vérifiée |
| --- | --- |
| Node installé | v24.19.0, ICU 78.3, tzdata embarquée **2026b** avant correction. |
| Node du processus de test corrigé | Même exécutable/ICU ; tzdata effective **2026e**, constatée dans process.versions.tz et les offsets natifs. |
| PostgreSQL | **17.11**, image public.ecr.aws/supabase/postgres:17.11.0.004, ID sha256:06ddc7962e11ab0f4f0334fd05671e97c30ea202f6e6a7113800bd3d6e416108. |
| Source tzdata amont PostgreSQL 17.11 | Le fichier source versionné tzdata.zi annonce **2026c**. Cela identifie l'amont, pas une certification bit à bit de toute l'image Supabase. |
| Calendrier natif du binaire PostgreSQL testé | Données intégrées sous /nix/var/nix/profiles/default/share/postgresql/timezone ; absence de --with-system-tzdata dans pg_config --configure. Pas de marqueur de version installé, ni compilateur zic disponible pour reconstruire une référence binaire. Empreinte Casablanca conservée et comportement conforme à 2026c+ prouvé pour la matrice. |
| Linux du conteneur neuf | Alpine **3.23.6** ; lecture du registre installé APK : **tzdata 2026d-r0**. La recherche apk info affichait aussi un paquet 2026e disponible ; ce résultat ne prouvait pas son installation. |
| ICU lié au build PostgreSQL | Chemin de compilation ICU **75.1** ; cet ICU de collation n'est pas la source des conversions natives timestamptz AT TIME ZONE. |

Le fichier Casablanca intégré à PostgreSQL a 793 octets et l'empreinte
`6b026cdcb00868a3dc1f24f7072a1ce3ac0c3ff83b3d847fee5f3cc01fa85f50` ; celui du
système Linux a 1 200 octets et une empreinte différente. Taille/format TZif
différents ne prouvent pas seuls des règles différentes. La version amont est
lisible dans [tzdata.zi de PostgreSQL 17.11](https://raw.githubusercontent.com/postgres/postgres/REL_17_11/src/timezone/data/tzdata.zi).
Le choix entre données intégrées et système est un choix de compilation,
documenté par [PostgreSQL](https://www.postgresql.org/docs/17/install-make.html).
Aucune mise à jour Linux ou du conteneur n'est effectuée pour ce diagnostic.

### 12.3 Correction reproductible limitée au processus de test

Les quatre ressources officielles ICU **2026e** little endian sont téléchargées
depuis unicode-org/icu-data à la révision immuable
`bae5ca647fa41703393dbf00240ec1b807a9c353` : zoneinfo64.res, windowsZones.res,
timezoneTypes.res et metaZones.res. Révision, identités Git et SHA-256 sont
épinglés ; toute différence de contenu entraîne un refus. Les binaires restent
sous .results ignoré, sans installation globale ni modification de .env.local.

Le lanceur fournit ICU_TIMEZONE_FILES_DIR uniquement à un **nouveau processus
Node de test**. Ce mécanisme officiel remplace les données de fuseaux, pour
tous les fuseaux, sans modifier le code de l'oracle ou de PostgreSQL. Aucune
addition UTC fixe, règle spéciale Casablanca ou modification des golden fixtures.
[Chargement ICU des ressources de fuseaux](https://unicode-org.github.io/icu/userguide/datetime/timezone/#icu4c-tz-update-with-drop-in-res-files-icu-54-and-newer).

L'exécutable Node, les treize migrations, AUTH-4A, l'oracle et golden.json restent
inchangés, contrôlés par empreintes. La correction n'interprète ni ne réécrit
des reçus historiques : leurs clés de période restent immuables. Le nouveau
calendrier légal est appliqué à l'environnement de calcul des fixtures, pas aux
sauvegardes. Aucun XP, profil ou compte Hunter n'est créé/modifié.

### 12.4 Tests exécutés et portée

| Exécution réelle sur la nouvelle stack | Résultat |
| --- | --- |
| Contrôle négatif avant ICU 2026e | Code 1, mêmes deux divergences daily/monthly que la section 11. |
| Golden/parité complète avec ICU 2026e | **Code 0, huit groupes, 4 002 contrôles**, aucune divergence calendaire : 2 781 récompenses, 406 progressions représentables, 100 rangs, séries/attributs/achievements conservés. |
| Matrice calendaire élargie | **Code 0, 92 400 comparaisons strictes** daily/weekly/monthly/once, **23 100 offsets natifs**, zéro divergence. |
| Couverture | 4 620 instants par zone : tous les jours de 2026 avec neuf points UTC, frontières de mois/leap/année 2024..2028 et golden fixtures originales. UTC, Casablanca, Paris, New York, Auckland. |
| Voisinages de transitions | Neuf transitions découvertes génériquement par changement d'offset ; comparaisons à -1 s/-1 ms/exact/+1 ms/+1 s. Trois Casablanca, deux Paris, deux New York, deux Auckland. |
| Écart exact initial | daily=2026-12-31 et monthly=2026-12 confirmés par valeurs attendues fixes IANA 2026c+, pas seulement par égalité de deux moteurs. |
| Catalogue/préservation | Catalogue AUTH-4B relu, ACL/RLS conformes, treize fichiers installés identiques, zéro compte Auth/Hunter ; aucun reader ou mutateur public supplémentaire. |

La transition Casablanca du 20 septembre 2026 à **01:00 UTC** est incluse, ainsi
que celles du 15 février et du 22 mars. Les périodes weekly sont comparées avec
l'oracle natif utilisant le lundi local ; aucun remplacement par une semaine UTC.
Deux relances finales indépendantes avec les ressources SHA-256 épinglées passent.

Un premier test d'offset UTC échouait uniquement parce qu'assert.strict distingue
0 de -0. Seul le signe de zéro de cette assertion est normalisé ; aucune date,
période ou formule de l'oracle n'est modifiée. Les périodes demeurent comparées
strictement. Les sondes de marqueur tzdata/zic absent ont échoué en lecture seule ;
elles expliquent la limite d'identification binaire, sans être comptées comme
une reconstruction du jeu de fuseaux PostgreSQL.

Les valeurs JS sous-normales comme 5e-324 restent explicitement non représentables
par l'entrée textuelle float8 PostgreSQL ; cette limite de la section 11 n'est pas
résolue ni masquée par la correction calendaire. Aucune garantie universelle sur
tous les fuseaux, siècles ou prochains changements légaux. Les 181 tests/build/
lint/typecheck frontend de la section 11 ne sont pas relancés dans cette opération
limitée aux outils de calendrier ; aucune source applicative n'est modifiée.

### 12.5 Supabase Cloud : stratégie proposée, aucune adoption implicite

**Une synchronisation stricte et permanente des versions tzdata de Node, de tous
les navigateurs et du PostgreSQL managé n'est pas garantie de manière portable.**
Supabase Cloud ne donne pas accès superuser à son rôle postgres ; l'application
ne doit pas supposer pouvoir remplacer les fichiers de fuseaux de cette instance.
[Limites du rôle Supabase](https://supabase.com/docs/guides/database/postgres/roles-superuser).
La correction actuelle ne nécessite justement aucun remplacement côté PostgreSQL.
Le bundle ICU peut être fourni sur un serveur Node contrôlé, mais sa présence,
son chargement et la version de la cible Cloud doivent être éprouvés sur
l'hébergement réel. Aucun projet distant n'est consulté/configuré ici.

| Alternative à décider | Garanties et limites |
| --- | --- |
| **A — Calendrier natif PostgreSQL autoritatif, recommandé** | Les futurs crédits calculent le jour/période à partir du temps serveur et du fuseau Hunter confirmé ; le navigateur ne fournit pas une période à croire. Un runtime Node/ICU contrôlé sert d'oracle et de contrôle de parité avant activation et après upgrades. Pas de dépendance à un accès disque Cloud ; parité à éprouver sur chaque cible. Une divergence nouvelle bloque les crédits concernés plutôt que créer deux calendriers autoritatifs. La version physique Cloud et ses mises à jour restent gérées par Supabase. |
| **B — Transitions IANA versionnées dans un schéma SQL privé** | Calculs reproductibles avec une version explicite, indépendants des fichiers Cloud. Exige nouvelles migrations/données mondiales, convertisseur générique, plage temporelle bornée avec refus hors plage, privilèges d'administration seuls et tests de parité exhaustifs. Politique de mise à jour des versions et de protection contre un deuxième crédit après changement à valider. Aucune table/helper de ce type implémenté ici. |
| **C — Faire épingler/mettre à jour le calendrier PostgreSQL par le fournisseur** | Parité possible si le fournisseur confirme la version et son maintien. Dépend d'un engagement/outil Supabase non établi ici ; aucune garantie de synchronisation de tous les navigateurs. Revenir à un ancien jeu pour imiter Node 2026b ne respecterait pas la modification IANA identifiée et n'est pas proposé. |

Pour A ou B, les reçus déjà engagés gardent montant, period_key, instant et
provenance ; aucune recomputation historique lors d'une mise à jour tzdata. Le
workflow futur doit définir l'activation d'une version calendaire et son contrôle
sur la cible réelle avant publication de commandes. Cette politique n'est pas
implémentée pendant le diagnostic et nécessite une décision utilisateur.

### 12.6 Fichiers, arrêt et conditions de reprise

Ajoutés : `tools/auth4c/calendar-icu.cjs`, `calendar-check.cjs`,
`calendar-resources.json`. Actualisés : stack.cjs (mode calendar à cible/ports
fermés), parity-check.cjs (métadonnées de runtime et état de blocage du résultat),
README.md et ce rapport. Les ressources téléchargées, manifest et preuves restent
ignorés sous .results. Aucune dépendance, migration ou règle XP supplémentaire.

**Résolution locale démontrée, aucune commande AUTH-4C reprise.** Arrêt demandé
après diagnostic/correction/parité. Choisir la stratégie Cloud et autoriser
séparément la reprise des commandes avant garde transactionnelle et migrations
8/9/10. AUTH-4D/E, AUTH-5/6 restent interdits ; aucun commit, push, merge ou
déploiement. Le succès du calendrier ne constitue pas une validation des crédits
transactionnels encore absents.

Clôture exécutée : syntaxe des scripts, audit de périmètre/espaces/motifs privés
des **28 fichiers candidats**, comparaison des empreintes préservées et
git diff --check réussis. Rien de suivi ou staged modifié ; branche
feature/lifequest-improvements et HEAD 18425f5 inchangés. Ressources .res,
manifest de téléchargement et preuves .results ignorés. La nouvelle stack
calendar est arrêtée, code 0, sauvegarde et volumes conservés. Aucune opération
sur lifequest-auth2. Les tests de calendrier sont verts uniquement avec le
runtime de test ICU 2026e vérifié ; le runtime applicatif habituel n'est pas
modifié et la stratégie de production reste à décider.


## 13. Reprise AUTH-4C apr?s d?cision de l?autorit? calendaire

### 13.1 D?cision et pr?requis Cloud

L?utilisateur choisit PostgreSQL comme autorit? pour les p?riodes et cr?dits futurs. Les RPC prennent l?instant serveur et le fuseau confirm? conserv? pour le Hunter ; le client ne fournit pas de p?riode autoritative. Les champs period, period_key ou montant de r?compense ajout?s ? un payload ferm? sont refus?s. Cette d?cision ne permet aucune recomputation des re?us historiques.

Le seul Supabase configur? dans le d?p?t pointe vers 127.0.0.1 et aucun projet distant n?est li?. L?utilisateur confirme qu?aucune cible Cloud n?est disponible. La parit? r?elle Cloud n?a donc pas ?t? test?e et aucune migration n?y a ?t? appliqu?e. Une cible sans activation ?choue en mode ferm? ; une divergence d?empreinte ou une activation expir?e refuse ?galement le cr?dit sans ?criture partielle. La validation sur une cible Cloud r?elle reste obligatoire avant d?y activer les cr?dits.

### 13.2 Installation locale et p?rim?tre

Une stack ind?pendante neuve, lifequest-auth4c-commands-gate-20261013, a ?t? cr??e hors d?p?t sous C:/Users/hp/myproject, sur API 64421, PostgreSQL 64422, SMTP 64424 et shadow 64420. Les vingt migrations AUTH-2/AUTH-4C sont appliqu?es depuis z?ro, dans l?ordre ; les vingt fichiers install?s sont identiques aux sources. Les autres stacks locales et volumes ont ?t? conserv?s. lifequest-auth2 n?a re?u aucune connexion, requ?te, migration ou commande d?arr?t.

Un premier port propos? d?passait la limite TCP et le d?marrage ?chouait avant la cr?ation de conteneur. Le port a ?t? corrig? avant que la stack d?marre. Le statut Supabase a ensuite r?v?l? que le sandbox bloquait le pipe Docker ; les op?rations CLI n?cessaires ont ?t? relanc?es dans le contexte local autoris?, avec t?l?m?trie CLI d?sactiv?e pour ce processus seulement. Les sorties contenant les URLs ou cl?s de statut restent captur?es en m?moire et ne sont pas imprim?es.

### 13.3 Garde calendaire et tests de parit?

Sur la stack fra?che, un compte Auth fictif est confirm? puis pr?par? par le harnais. Sans activation, la cr?ation de qu?te ?choue HTTP 503. XP, r?vision, qu?te et re?u restent identiques, et la table d?activation reste inaccessible via la Data API.

Apr?s activation locale fond?e sur une comparaison ind?pendante Node/ICU 2026e, la matrice stricte passe : **92 400** p?riodes daily/weekly/monthly/once sur UTC, Casablanca, Paris, New York et Auckland ; **23 100** offsets natifs et neuf voisinages de transition ; aucune divergence. Les m?mes r?sultats passent apr?s red?marrage.

La suite golden passe en **8 groupes et 4 010 assertions**. La suite RPC/Auth passe en **21 groupes**, notamment :

- Isolation A/B, refus des JWT forg?s, expir?s ou r?voqu?s, et contention born?e du verrou Hunter ;
- cr?ations concurrentes, re?us idempotents, retry apr?s perte de r?ponse HTTP et rollback apr?s ?criture ledger ;
- r?compenses concurrentes de qu?tes, Boss et Focus sans double cr?dit ; preuves F03/F04 pr?serv?es sans second cr?dit, et historiques non prouv?s sans XP ;
- refus des montants ou p?riodes forg?s, du DML client, des r?visions p?rim?es et du nombre 5e-324 non repr?sentable, sans conversion en z?ro ;
- empreinte calendaire alt?r?e et activation expir?e refus?es HTTP 503, sans ?criture partielle.

Apr?s stop/start sans effacement, le hash des vingt tables, l??tat d?activation, l?historique de migrations et les ACL correspondent ? l?empreinte prise avant l?arr?t. Cinq comptes et cinq Hunters fictifs demeurent dans cette stack locale arr?t?e. Les identit?s, mots de passe et donn?es de progression de ces fixtures ne sont pas publi?s dans les r?sultats.

### 13.4 Fichiers et limites

Les migrations AUTH-4C d?j? pr?sentes dans le workspace ont ?t? audit?es et ?prouv?es sur la reconstruction neuve ; aucune migration d?j? appliqu?e n?a ?t? r??crite pendant cette reprise. Les outils de test ajoutent un contr?le explicite du refus sans activation et un mode de stack ind?pendant. README et rapport refl?tent d?sormais la d?cision utilisateur. Aucun fichier frontend, formule TypeScript, vid?o, re?u historique, sauvegarde locale ou configuration du projet lifequest-auth2 n?a ?t? modifi?. Aucun test frontend n?a ?t? relanc?, car aucun fichier frontend n?a chang?.

Aucun staging, commit, push, merge ou d?ploiement n?a eu lieu. La stack commands-gate est arr?t?e sans effacement. Les vingt migrations sont pr?sentes localement, mais aucune fonction n?a ?t? d?ploy?e dans Supabase Cloud.

**AUTH-4C ne peut pas ?tre d?clar? pr?t pour les cr?dits Cloud.** Il manque une cible de staging r?elle, son identit? de projet et un acc?s de lecture SQL conserv? dans le gestionnaire local de secrets. Une fois la cible disponible, rejouer la matrice sur le binaire PostgreSQL g?r? et v?rifier l?activation prot?g?e sur ce serveur avant d?y appliquer ou d?activer des commandes. Jusqu?? cette validation, l?absence d?activation maintient les cr?dits bloqu?s. AUTH-4D/E, AUTH-5 et AUTH-6 ne sont pas commenc?s.

## 14. AUTH-4D — reader cohérent, bootstrap serveur et isolation locale

### 14.1 Autorisation, environnement et périmètre

Le 13 octobre 2026, AUTH-4C est validé pour l'environnement local, avec PostgreSQL autorité calendaire. L'utilisateur autorise uniquement AUTH-4D et indique qu'aucune cible Cloud n'est disponible. AUTH-4D est implémenté et éprouvé sur une stack locale indépendante ; AUTH-4E, AUTH-5 et AUTH-6 ne sont pas commencés.

Cible : `lifequest-auth4d-reader-20261013`, dossier hors dépôt `C:/Users/hp/myproject/lifequest-auth4d-reader-20261013`, API 64521, PostgreSQL 64522, SMTP 64524, shadow 64520. PostgreSQL 17.11, image `public.ecr.aws/supabase/postgres:17.11.0.004`. Les 23 migrations sont enregistrées dans l'ordre et les fichiers installés sont identiques aux sources. Les corrections apportées après échec ont été ajoutées en migrations 012/013 ; aucune migration déjà appliquée n'a été réécrite.

La stack ne contient que des identités `example.test` générées par les tests. Le dernier contrôle de catalogue en dénombre 58. Aucun profil Hunter réel, aucune sauvegarde ou clé navigateur n'est lu ou transféré. `lifequest-auth2` n'a reçu aucune connexion ou commande pendant cette phase ; aucune stack existante n'a été réinitialisée, aucun volume supprimé et aucun projet distant ciblé. Les credentials du statut et les clés du processus de test restent en mémoire et ne sont pas imprimés. `.env.local` reste inchangé ; le build ciblé reçoit les variables de cette stack dans son seul processus.

### 14.2 Lecteurs SQL privés et contrat de données

Trois migrations ajoutent le lecteur :

1. `20261013001100_auth4_snapshot_readers.sql` ajoute les helpers privés de conversion et de validation, `public.lifequest_hunter_snapshot(expected_actor uuid)` et `public.lifequest_command_receipt(expected_actor uuid, request_id uuid)`.
2. `20261013001200_auth4_snapshot_row_json.sql` corrige la collision du paramètre `value` avec la sortie de `jsonb_each`, en qualifiant les colonnes de fonction.
3. `20261013001300_auth4_snapshot_mind_node_alias.sql` corrige l'alias `x` de la requête `mind_nodes`, auparavant masqué par la colonne `x` de coordonnées.

Le snapshot est une fonction `STABLE SECURITY DEFINER` détenue par `lifequest_read_owner`, avec `search_path` vide et délai de cinq secondes. Elle vérifie le contexte JWT et l'acteur attendu, lit les lignes sous FORCE RLS et renvoie un objet cohérent avec un snapshot MVCC de la fonction. Elle exige l'enveloppe et le setup, valide les quatre modules et leurs compteurs, rapproche exactement le total XP du ledger, refuse nombres non représentables, données incohérentes et réponses supérieures à 5 MiB, puis renvoie collections ordonnées, objets historiques, revisions bigint sous forme de chaînes, soldes décimaux exacts, dérivés calculés côté SQL et état `auth5_pending`. Le setup pending renvoie uniquement son état sans profil ou collections inventés. Le lecteur de reçu est limité à l'acteur et à la clé demandée.

Les 21 tables privées du schéma `lifequest` gardent ENABLE/FORCE RLS. Le rôle `authenticated` a EXECUTE seulement sur les deux RPC publiques de lecture, aucun accès direct au schéma ni DML sur les tables. `anon` et `PUBLIC` n'ont pas EXECUTE. Les deux fonctions sont bien détenues par le rôle de lecture limité ; leurs helpers restent privés. Les rôles internes sont NOLOGIN sans SUPERUSER/BYPASSRLS. Les tests de catalogue passent après application des 23 migrations.

### 14.3 Façades Next et comportement vérifié

`GET /api/hunter/bootstrap` et `GET /api/hunter/receipts/[requestId]` appellent le lecteur via une session SSR revalidée par `verifiedSession`, puis envoient l'acteur vérifié comme `expected_actor`. Les réponses sont `private, no-store` avec `Vary: Cookie`. Les erreurs SQL connues sont traduites en codes stables ; une erreur inconnue ne renvoie pas le message PostgreSQL. L'identifiant de reçu doit être un UUID. Le bootstrap Auth existant continue de répondre `cloud_not_connected`, et aucune page RPG ne consomme les nouvelles routes.

`tools/auth4d/reader-check.cjs` passe **6 groupes** : identité A/B confirmée, isolation des mêmes IDs métier, snapshots ready et setup_pending, six collections Lab, ordre/historique et exactitude des valeurs, substitution d'acteur refusée, JWT signé expiré et JWT falsifié refusés, lecture de reçu A/B et not_found, compteurs incohérents et ledger désynchronisé refusés, lecture MVCC avant/après commit d'une modification fixture Arc+quête, logout/révocation puis reconnexion sans altération du ledger.

`tools/auth4d/app-check.cjs` passe **4 groupes HTTP Next** : anonyme refusé en no-store ; cookies SSR A/B/A renvoient l'acteur exact et setup_pending ; route reçu actor-scoped et UUID invalide refusé ; cookies forgés et session révoquée refusés tandis que B reste lisible. Deux inscriptions Auth réellement confirmées et plusieurs comptes synthétiques sont utilisées ; aucune valeur de cookie, aucun token, e-mail ou mot de passe n'est imprimé.

Le test MVCC prouve qu'un même appel `STABLE` ne mélange pas l'Arc et la quête avant commit, puis observe le nouvel état après commit. Ce test utilise une transaction de fixture, pas les futures commandes de récompense. Les tests de charge et de concurrence des mutateurs ne font pas partie d'AUTH-4D.

### 14.4 Régressions, contrôles et corrections

Les scripts de parité acceptent maintenant le jeu existant de comptes synthétiques AUTH-4D et comparent les nombres de comptes/Hunters avant/après sans supposer une base vide. La parité stricte retourne **8 groupes et 4 014 assertions** ; 2 781 récompenses, 406 progressions représentables, 100 rangs, séries, attributs, achievements et décision d'addition décimale restent conformes. Le contrôle calendaire compare **92 400 périodes**, **23 100 offsets** et neuf voisinages de transitions sur UTC, Casablanca, Paris, New York et Auckland : zéro divergence avec Node/ICU 2026e et PostgreSQL 17.11.

Contrôles frontend réellement exécutés : `npm run typecheck` code 0 ; `npm run lint` code 0 ; `npm test` code 0, 181/181 ; `npm run build` code 0, y compris un build ciblé pour l'URL de la stack isolée. Les routes Hunter figurent dynamiques dans la sortie de build. L'ancien `.env.local` n'a pas été changé.

Échecs corrigés pendant la vérification : la migration 013 a d'abord échoué faute de `CREATE` temporaire sur `public` pour le propriétaire de lecture ; le droit est accordé avant la définition et révoqué dans la même migration, puis l'installation 013 passe. Une fixture de reçu avait un paramètre `jsonb_build_object` non typé, puis une expression JSONB de restauration non typée ; les deux casts ont été corrigés dans le harnais. Le premier build HTTP utilisait l'URL publique intégrée depuis `.env.local` ; le build dédié injecte désormais l'URL locale de test seulement dans son environnement de processus. Aucun droit client n'a été élargi pour ces corrections.

Un test RPC/Auth AUTH-4C n'a pas été lancé après le refus automatique de la revue d'approbation, qui a identifié l'exécution des RPC de crédits comme hors périmètre AUTH-4D. Aucun détour ou autre runner n'a été utilisé. Les tests de calculs purs et de calendrier ont passé ; les régressions de commandes mutatrices AUTH-4C restent donc non relancées dans cette intervention.

### 14.5 Fichiers et limites restantes

Nouveaux fichiers AUTH-4D : les migrations 011–013 ; `frontend/src/lib/hunter/read.ts` ; les deux routes API Hunter ; `tools/auth4d/{.gitignore,README.md,stack.cjs,catalog-check.cjs,helper-check.cjs,reader-check.cjs,generate-reader-fix.cjs,build.cjs,app-check.cjs}`. Le README et ce rapport sont actualisés. Les scripts AUTH-4C de stack, parité et matrice sont ajustés pour reconnaître la pile reader ; aucune formule TypeScript, migration AUTH-2/4B, sauvegarde locale, règle F01–F06, vidéo, cinématique ou reçu historique n'est modifié.

Pas de cible Cloud : aucune parité sur le binaire géré n'est revendiquée. Aucun crédit ne doit être activé sur cette preuve locale ; selon la décision utilisateur, les crédits restent bloqués tant que la parité calendrier préalable n'est pas exécutée sur une cible Cloud autorisée. Aucun calcul de `period_key` ni reçu historique n'est réécrit. L'état `ready` n'active pas onboarding/cinématiques, et les routes ne raccordent pas le gameplay ; cela reste AUTH-4E/AUTH-5. Aucun staging, commit, push, merge ou déploiement n'a eu lieu. AUTH-4D local est terminé pour validation utilisateur ; aucune suite AUTH-4E/5/6 n'est commencée.

## 15. AUTH-4D-R — Régression des commandes sur la stack reader fictive

### 15.1 Cible et garde préalable

Le 13 octobre 2026, l'utilisateur autorise la seule campagne AUTH-4D-R sur la stack fictive indépendante déjà préparée. Le harnais `tools/auth4c/rpc-check.cjs` est inspecté avant exécution : il utilise les RPC PostgREST, Auth et SMTP locaux, plus une connexion SQL administrative limitée aux fixtures, vérifications de permissions et injections temporaires de pannes. Aucune commande reset/drop/truncate de base ou de volume n'est présente. Ses seules altérations hors RPC sont des comptes et données `example.test`, des contraintes/trigger de panne retirés en `finally`, et la corruption temporaire/restauration de la ligne d'activation Casablanca.

Le script est maintenant verrouillé sur l'unique projet `lifequest-auth4d-reader-20261013`. Préflight lecture seule : dossier exact `C:/Users/hp/myproject/lifequest-auth4d-reader-20261013`, API `127.0.0.1:64521`, PostgreSQL `127.0.0.1:64522`, SMTP `127.0.0.1:64524`, schéma exposé `public`, aucun `project-ref` distant, 23 migrations appliquées identiques octet pour octet aux sources. Avant les mutations, **58 comptes fictifs** avaient tous un e-mail `example.test`, et chacun possédait une enveloppe Hunter. Les cinq empreintes d'activation UTC, Casablanca, Paris, New York et Auckland correspondaient aux digests PostgreSQL, couvraient l'instant présent, portaient l'oracle ICU 2026e et n'étaient pas expirées. Aucune identité ni credential n'a été imprimé.

Le démarrage a d'abord échoué sous le sandbox faute d'accès Docker ; l'escalade prévue a été approuvée. La stack ciblée a démarré, puis les préflights en lecture seule ont réussi. L'exécution n'a utilisé ni `lifequest-auth2` ni Supabase Cloud. Aucun fichier `.env.local`, aucune migration et aucun réglage de sécurité SQL n'a été changé.

### 15.2 Résultat du harnais

L'exécution finale de `node tools/auth4c/rpc-check.cjs` réussit **21 groupes RPC/Auth** sur les vrais endpoints locaux. Les permissions SQL vérifient trois RPC `SECURITY DEFINER` détenues par le rôle limité, `search_path` vide, durée de requête bornée, `EXECUTE` réservé à `authenticated`, helpers non exécutables par les clients et 21 tables FORCE RLS sans accès direct client. Le propriétaire de commande est `NOLOGIN`, sans `SUPERUSER` ni `BYPASSRLS`, et ne peut modifier la table d'activation.

Les groupes couvrent :

- inscription SMTP A/B et compte pending refusé ; isolation A/B, substitution d'acteur, anonymat, DML direct, payloads XP/période/fuseau falsifiés refusés ;
- création concurrente, canonisation/hash, conflit de payload, complétion de quête sans double crédit, archivage/restauration et cooldown ; suppression d'Arc avec détachement et conservation du snapshot XP ;
- progression Boss avec deux complétions concurrentes, Focus durée serveur/pause/reprise/annulation/fin concurrente, F03/F04 historiques sans second crédit, six collections Lab et achievements sans XP ;
- rollback intégral après échec de reçu et après écriture XP/ledger ; réponse HTTP perdue après commit, receipt immuable et retry idempotent ; contention Hunter bornée, commandes B indépendantes ;
- expiration du JWT pendant une transaction, `statement_timeout` réel mesuré à environ 5 secondes, logout concurrent attendant une commande déjà autorisée, puis refus de l'ancien JWT ; JWT expiré/signé, falsifié ou révoqué refusé ;
- refus sans activation Casablanca, avec digest modifié et après expiration artificielle ; dans chaque cas, aucune écriture partielle, puis restauration exacte de la ligne d'origine ;
- contrôle d'un total fractionnaire, des périodes/streaks calculés côté PostgreSQL, sous-normal `5e-324` refusé sans crédit ni mutation de sa donnée, et révisions bigint hors plage sûre ;
- snapshot AUTH-4D `ready` après crédit, rapprochement de l'XP exact, reçu de complétion et révision ; après reconnexion Auth, snapshot encore cohérent, receipt récupérable et retry identique sans nouveau crédit.

Deux extensions du harnais rendent ces vérifications explicites : il contrôle le snapshot reader après crédit et reconnexion, et prouve le refus lorsque la ligne d'activation est absente en plus des cas altéré/expiré. Les fixtures du nombre `5e-324` sont placées sur B pour laisser le snapshot d'A vérifiable, car le reader refuse correctement un compte dont une valeur est non représentable. Le harnais refuse une autre stack, vérifie ses ports/23 empreintes et l'état calendaire avant sa première écriture.

### 15.3 Mise au point, postflight et limites

Trois lancements ont échoué sur les **nouvelles assertions de test**, avant le passage final : une assertion attendait une révision de quête `1` après complétion alors que la règle est `0` tant qu'il n'y a pas d'édition ; un autre essai mettait volontairement `5e-324` sur le même acteur dont il vérifiait ensuite le snapshot, lequel a refusé cette donnée comme prévu ; la dernière assertion de reconnexion avait la même attente de révision incorrecte. Les assertions ont été ajustées aux règles réelles et le cas sous-normal isolé sur B. Aucune migration ou règle métier n'a été modifiée pour obtenir le succès.

Postflight lecture seule réussi : **80 comptes/Auth fictifs, 80 enveloppes Hunter, 266 reçus fictifs**, cinq digests toujours valides ; aucune identité hors `example.test`, aucun objet temporaire de faute/trigger restant, rôle de commande toujours `NOLOGIN`. Le rapport de preuve `.results` contient 21 groupes et cible uniquement le projet reader. La stack reader a été arrêtée avec `supabase stop`, code 0, sans option d'effacement ; les volumes et données fictives sont conservés.

Fichiers modifiés/ajoutés par AUTH-4D-R : `tools/auth4c/rpc-check.cjs` (garde de cible et assertions de snapshot/activation/reconnexion), `tools/auth4d/rpc-preflight.cjs` (contrôles lecture seule avant/après), et ce rapport. Résultats `.results` ignorés par Git. Aucun fichier de gameplay, frontend, migration, formule XP, reçu historique ou stockage local n'a été modifié. Aucun commit, push, merge ou déploiement.

Non testé ou indisponible : cible Supabase Cloud inexistante, donc aucune preuve sur le binaire PostgreSQL managé ni activation de crédits Cloud ; suite frontend/navigateur et tests de charge non relancés, car hors du périmètre de cette régression RPC. Les crédits restent bloqués sur toute cible qui n'a pas son activation calendaire exacte et valide. AUTH-4E, AUTH-5 et AUTH-6 ne sont pas commencés.

**Verdict : AUTH-4D-R passe localement avec 21 groupes RPC/Auth sur la stack fictive reader ; arrêt ici pour validation utilisateur.**

## 16. AUTH-4E — Intégration frontend locale, preuves d’exécution bloquées

### 16.1 Périmètre livré dans le code

Autorisation AUTH-4E reçue après validation d’AUTH-4D-R. Les layouts protégés
chargent désormais le snapshot `lifequest_hunter_snapshot` côté serveur avec la
session vérifiée. Les enfants RPG ne sont montés que pour `state=ready` et
l’acteur attendu. Les états setup/migration/récupération/onboarding pending
restent explicites et ne montent aucun ancien formulaire local. Une erreur de
reader masque l’espace et indique qu’aucune donnée locale ne sera affichée.

Les pages Dashboard, Quest Log/archives, éditeur de quête, Story Arcs, Hunter
Core, Operations et Lab utilisent le snapshot AUTH-4D et les façades RPC
AUTH-4C. Le nouvel endpoint `POST /api/hunter/command` vérifie Origin, JSON et
taille du corps, accepte uniquement les intentions déclarées, injecte l’acteur
de `verifiedSession` et appelle les trois RPC existantes. Le navigateur ne
choisit ni XP accordé, ni période, ni instant de crédit. Les timeouts réconcilient
le même request ID avec le receipt acteur avant de proposer une nouvelle
tentative. Les valeurs XP/révisions restent des chaînes ; seules les projections
vérifiées sont converties pour l’affichage.

Les commandes disponibles raccordées comprennent création/modification,
complétion, archivage/restauration de quêtes, création/suppression d’Arcs,
progression/récupération Boss, démarrage/contrôle/fin Focus, Ideas, Mind Map,
Library, Journal, Creativity et synchronisation explicite des achievements.
Les erreurs de calendrier non activé/non vérifié sont rendues comme refus
explicites. Settings est en lecture seule : aucune commande Settings AUTH-4C
n’existe. Aucun import/export local, profil de remplacement, onboarding,
cinématique ou checkpoint n’est ajouté. La navigation onboarding/activation
reste fermée derrière AUTH-5.

### 16.2 Séparation et contrôles frontend réellement exécutés

Les sept pages cloud et `SystemShell` n’importent plus `useStoredData`,
`useQuestSystem`, readers localStorage ou import/export. Le gameplay historique,
les moteurs F01–F06, les formules XP, les médias, les sauvegardes navigateur et
les reçus locaux ne sont pas modifiés. Le store client est lié à l’acteur,
révalide au focus/visibilité et périodiquement, masque l’interface pendant une
revalidation, et traite les signaux de changement/logout sans transporter
d’identité ou de token. Le bootstrap Auth historique reste inchangé.

Contrôles réellement obtenus après les changements :

| Contrôle | Résultat |
| --- | --- |
| `npm run typecheck` | Code 0. |
| `npm run lint` | Code 0, aucun avertissement final. |
| `npm test` | Code 0, **185 tests**, dont quatre tests de frontière AUTH-4E ; zéro échec. |
| `npm run build` | Code 0 ; les routes Hunter et l’API commande apparaissent dynamiques. |
| Syntaxe des outils AUTH-4E | Code 0 pour les scripts de stack/calendrier et copie du harnais RPC. |
| Revue statique des cibles | Projet/URL localhost/ports fixés dans les outils dédiés ; aucune URL Cloud ni lien distant configuré. |

Les tests des règles RPG F01–F06 et de restauration restent les mêmes 181 tests
historiques auxquels s’ajoutent quatre assertions de frontière cloud. Ils ne
constituent pas une exécution SQL ou HTTP des nouvelles pages.

### 16.3 Stack indépendante préparée et blocage d’accès

Une nouvelle configuration de test a été préparée sous
`C:/Users/hp/myproject/lifequest-auth4e-frontend-20261013`, projet
`lifequest-auth4e-frontend-20261013`, API 64621, PostgreSQL 64622, SMTP 64624,
shadow 64620. Le dossier était absent et les quatre ports n’avaient aucun
listener. Les 23 fichiers de migration source ont été copiés sans modification ;
la configuration expose `public` seulement et aucun `project-ref` distant
n’est créé.

La préparation du dossier a réussi. Le contrôle `node tools/auth4e/stack.cjs
status` retourne `DOCKER_ACCESS` dans l’environnement d’exécution actuel ; le
statut API/DB ne peut donc pas être lu et aucun conteneur de cette stack n’a été
démarré. Je n’ai pas tenté d’escalader ni contourné la restriction. Aucun compte
Auth/Hunter, reçu ou crédit AUTH-4E n’a été créé. Aucune activation calendaire
n’a été écrite. Les stacks précédentes, `lifequest-auth2`, leurs volumes et
Supabase Cloud n’ont reçu aucune opération.

En conséquence, les contrôles suivants n’ont pas pu être exécutés sur la cible
AUTH-4E : migrations réellement appliquées, preuve d’absence de données
personnelles en base, activations et matrice calendaire cible, RPC/Auth/SQL,
snapshots A/B, scénarios UI prêts, navigateur, logout/changement de compte réel,
retry après perte réseau et conservation après redémarrage. Les pages ready ne
peuvent pas être déclarées validées par les tests statiques. L’environnement
préparé est conservé hors dépôt et son outil `prepare` refuse de l’écraser.

### 16.4 Fichiers, limites et arrêt

Ajoutés/modifiés : `frontend/src/app/api/hunter/command/route.ts`,
`frontend/src/lib/hunter/cloud.tsx`, `frontend/src/components/hunter/HunterWorkspace.tsx`,
`frontend/src/components/auth/ProtectedHunter.tsx`, les layouts protégés du
dashboard/quests/arcs/core/operations/lab, leurs pages, `SystemShell.tsx`,
`frontend/tests/hunter-cloud-boundary.test.cjs`, les outils indépendants
`tools/auth4e/` et ce rapport. Aucun package, lockfile, migration, configuration
`.env.local`, règle RPG ou fichier de sauvegarde locale n’est modifié.

Limite fonctionnelle restante avant validation AUTH-4E : exécuter les migrations
et suites réelles sur la stack dédiée dès qu’un environnement autorisé rend
Docker accessible ; obtenir des fixtures fictives ready par la voie contrôlée
de test ; tester les pages et les mutations via Next ; vérifier A/B, états pending,
calendar gate, idempotence et conservation. Les comptes neufs restent pending
et le parcours d’initialisation réel attend AUTH-5. Settings restent en lecture
seule. L’hébergement Cloud n’est pas disponible et aucune activation Cloud n’est
faite.

HEAD/branche n’ont pas été modifiés par commit ; aucun staging, commit, push,
merge ou déploiement. **AUTH-4E est partiellement implémenté, mais non validé
faute de tests réels sur la stack indépendante. Arrêt ici pour décision utilisateur ;
AUTH-5 et AUTH-6 ne sont pas commencés.**
## 17. AUTH-4E-R — Résultats de la campagne d’intégration

### 17.1 Diagnostic Docker et préflight de la cible

L’exécution sandboxée de Docker 29.8.2 lisait le binaire client, mais échouait
sur l’accès à `C:\Users\hp\.docker\config.json` et au pipe
`npipe:////./pipe/docker_engine` (`permission denied`). Par l’autorisation prévue
`require_escalated`, `docker version` a ensuite confirmé client **29.8.2** et
serveur **29.8.2 linux**. Le moteur Docker Desktop répondait ; le blocage venait
des permissions du terminal sandboxé sur le fichier de configuration et le pipe.
La revue a autorisé ces commandes de diagnostic et de stack. Aucune tentative de
contournement du sandbox n’a été faite.

La cible vérifiée avant toute écriture était exclusivement
`lifequest-auth4e-frontend-20261013` sous
`C:/Users/hp/myproject/lifequest-auth4e-frontend-20261013`, API 64621, PostgreSQL
64622, SMTP 64624 et shadow 64620. Le `project_id`, le schéma Data API `public`
seul, les ports libres et l’absence de `supabase/.temp/project-ref` ont été
contrôlés. Le dossier n’avait pas de conteneur ni de volume AUTH-4E ; le statut
Supabase échouait uniquement parce que sa DB n’était pas encore démarrée. Les
23 migrations sources copiées dans ce dossier correspondaient exactement aux
23 fichiers du dépôt par SHA-256. L’état de migration était vierge.

Après démarrage, l’unique volume base de données était
`supabase_db_lifequest-auth4e-frontend-20261013`, monté au chemin Docker
`/var/lib/docker/volumes/supabase_db_lifequest-auth4e-frontend-20261013/_data`.
Les 23 migrations ont été appliquées depuis cette base neuve. Après les essais,
`supabase stop` a arrêté la cible sans effacement ; le volume existe toujours,
aucun conteneur AUTH-4E ne reste et les ports 64621/64622/64624 sont libérés.

Aucune connexion DB/API de test, commande de stack ou lecture métier n’a visé
`lifequest-auth2`, une ancienne stack ou Supabase Cloud. L’audit final AUTH-4E
indique 18 comptes Auth tous `example.test`, 18 Hunters, zéro identité hors
fixture, 17 reçus XP, 63 reçus de commande et cinq activations calendaires locales.
Le fichier `frontend/.env.local` n’a pas été lu ni écrit ; sa taille et sa date
de modification sont restées identiques au préflight (284 octets,
2026-10-12 22:34:22 UTC). Aucun reset, drop ou suppression de volume n’a été
exécuté.

### 17.2 Migrations, RLS, RPC, calendrier et snapshots

Les 23 versions du catalogue correspondent aux fichiers du dépôt. Les contrôles
du harnais `tools/auth4e/rpc-check.cjs` ont réussi **21 groupes RPC/Auth** :
provisioning pending, isolation A/B et substitutions d’acteur, ACL/RLS/FORCE RLS,
refus DML direct et fonctions privées, reçus idempotents, création/édition/
complétion/archive/restauration de quêtes, Arcs, Boss, Focus, six collections Lab,
rollback, retry après réponse perdue, crédits concurrents, expiration/révocation
de sessions, contention/logout, snapshot cohérent après commande et relecture des
reçus après reconnexion. La même suite refuse les crédits si l’activation manque,
est altérée ou expirée, sans écriture partielle. Les XP et les périodes restent
calculés par PostgreSQL ; aucune ancienne période ni reçu historique n’a été
recalculé.

La matrice propre à cette cible a réussi **92 400 comparaisons strictes** sur
UTC, Casablanca, Paris, New York et Auckland, avec 23 100 offsets et neuf
voisinages de transition ; aucune divergence. L’activation locale temporaire a
porté sur ces cinq zones, TTL maximal 24 heures. Elle n’a jamais concerné Cloud.

La suite Auth/RPC a créé seulement des comptes et lignes synthétiques. Une
limitation de conformité doit être conservée avec ces résultats : pour obtenir
des états `ready`, le harnais a inséré trois profils fictifs avec
`onboarding_completed=true` (deux fixtures A/B et une fixture de concurrence),
ainsi que leur setup synthétique. Aucun média ni preuve de vidéo visionnée n’a
été ajouté, mais ce booléen représente un onboarding artificiellement terminé.
Cette graine ne constitue pas un parcours AUTH-5 ; je n’aurais pas dû l’exécuter
au regard de la consigne interdisant de fabriquer un checkpoint. Les résultats
de commande restent des preuves SQL sur fixtures locales seulement. Ces trois
profils et leurs reçus sont conservés ; aucune donnée n’a été effacée pour
masquer cette limite. Les tests visuels ready n’ont donc pas été revendiqués.

Le test séparé `tools/auth4d/reader-check.cjs` n’a pas été lancé : il est épinglé
à une autre stack et prépare lui-même des profils d’onboarding terminés. La
couverture reader réellement obtenue ici provient des snapshots A/B après
commandes et reconnexion dans les 21 groupes RPC, pas d’une nouvelle campagne
AUTH-4D dédiée.

### 17.3 Next.js et navigateur

`npm run typecheck`, `npm run lint`, `npm test` (**185 tests**) et
`npm run build` ont tous terminé avec le code 0 après la correction frontend.
Le build liste les pages protégées, l’API Hunter bootstrap et la route de commande
dynamiques. Ces vérifications ne remplacent pas les parcours utilisateur.

Le serveur Next de test a écouté uniquement sur `127.0.0.1:31646`, avec l’API
AUTH-4E et la clé publique transmises en mémoire ; `frontend/.env.local` n’a pas
été réorienté. Le secret de récupération de test était aléatoire, propre au
processus, et n’a pas été persisté. Chrome a réussi six contrôles : affichage
desktop/mobile et reduced motion ; inscription et confirmation par e-mail dans
un second profil ; login ; logout et verrouillage du second onglet ; retour
navigateur et route protégée directe ; passage A→B sans toucher les clés locales
fictives ; échec réseau de bootstrap laissant l’écran `setup_pending` masqué.

Le parcours recovery a obtenu l’e-mail, vérifié le lien, changé le mot de passe
et est revenu à `/login`, mais la reconnexion attendue n’a pas atteint l’écran
pending. Aucun message d’alerte exploitable n’était visible ; ce scénario reste
un échec, sa cause n’est pas déterminée. Une tentative précédente a d’abord
utilisé par erreur le helper SMTP AUTH-2 sur le port 54324 ; le helper AUTH-4E
correct a été fixé sur le port 64624 et les réussites ci-dessus utilisent ce
helper dédié. Une ancienne assertion attendait encore le texte AUTH-3
`cloud_not_connected` au lieu de `setup_pending` ; elle a été alignée sur l’état
AUTH-4E réel. Le test de récupération demeure bloqué après ces corrections.

Les six réussites Chrome n’incluent pas la fin de suite qui vérifie l’absence
d’exception JavaScript pour tous les parcours. Les interfaces ready, les actions
visuelles de commandes, la restauration/édition depuis l’interface, Focus/Boss/
Lab prêts et la lecture d’achievements/statistiques/events dans un navigateur
n’ont pas été éprouvés, car elles nécessiteraient de franchir la garde onboarding
et AUTH-5. Les tests SQL/RPC ne comptent pas comme validation de ces écrans.
Les paramètres n’ont pas de commande mutatrice ; aucune interface Settings
complète n’a été validée, les valeurs vues dans le snapshot restent en lecture
seule.

### 17.4 Corrections, fichiers et état final

Défaut frontend identifié et corrigé : le rendu server-side `setup_pending` sous
`/dashboard` utilisait un `AuthShell` sans bouton logout. `SessionLogout.tsx`
donne maintenant une déconnexion avec verrouillage immédiat et signal multi-onglet
sur les rendus pending, erreurs de snapshot et parcours réservés à AUTH-5. Les
parcours Chrome de logout, second onglet et routes protégées passent après cette
correction.

Les autres corrections concernent uniquement les tests : matrice calendaire qui
reconstruit ses instants depuis les golden fixtures et conserve la liste utile à
l’empreinte ; preuve versionnée non écrasée ; helper SMTP AUTH-4E ; attente CDP
résistante aux transitions de documents ; adaptation de l’assertion pending ;
audit agrégé en lecture seule et lanceur Next éphémère. Aucune migration, règle
RLS, formule XP, reçu, donnée `lifequest-auth2`, source de sauvegarde locale,
vidéo ou package n’a été modifié dans cette campagne.

Fichiers AUTH-4E-R ajoutés/modifiés :
`frontend/src/components/auth/SessionLogout.tsx`,
`frontend/src/components/auth/ProtectedHunter.tsx`,
`tools/auth4e/{README.md,audit.cjs,browser-check.cjs,calendar-check.cjs,
activate-calendar.cjs,mail-fixture.cjs,next-server.cjs,
prepare-browser-check.cjs}` et ce rapport. Les captures, profils Chrome et preuves
restent dans les chemins ignorés `.results`.

État Git final : branche `feature/lifequest-improvements`, HEAD
`18425f5644b7465f7d206097bb0f78d6a8a86d25`, aucun fichier staged ; aucun commit,
push, merge, déploiement ni changement Cloud. `git diff --check` et
`git diff --cached --check` sont les contrôles de clôture à exécuter après cette
mise à jour documentaire. Le volume AUTH-4E est conservé et la stack est arrêtée.

**Verdict : les preuves SQL/Auth/RPC et une partie des parcours pending sont
validées pour cette stack locale fictive. La reconnexion après recovery et les
écrans ready restent non validés ; la contrainte interdisant le checkpoint
artificiel a été violée dans les fixtures RPC et est signalée explicitement.
AUTH-4E-R reste partielle et attend validation utilisateur. AUTH-5 et AUTH-6 ne
sont pas commencés.**

## 18. AUTH-4E-R2 — récupération, écrans ready synthétiques et SessionLogout

### 18.1 Cible et préservation

Campagne limitée à AUTH-4E-R2, sur la stack locale indépendante
**lifequest-auth4e-r2-retry-20261013**, dossier
`C:/Users/hp/myproject/lifequest-auth4e-r2-retry-20261013`, API **56621**,
PostgreSQL **56622**, Mailpit **56624**, Next **31666**. Le projet/config local
est vérifié par le lanceur dédié ; les URLs utilisées sont `127.0.0.1`, aucun
fichier `project-ref` distant n’existe, seul `public` est exposé, et les 23
migrations locales attendues sont copiées dans l’ordre depuis les sources du
dépôt. La base a été créée dans un dossier neuf ; aucun `prepare` sur dossier
existant, reset ou effacement de volume n’a eu lieu. L’empreinte de volume est
`supabase_db_lifequest-auth4e-r2-retry-20261013`.

Le calendrier a été activé uniquement sur cette cible locale après les matrices
strictes documentées en §12 ; aucune activation Cloud. Les RPC restent fermées
si l’activation est absente, altérée ou expirée. Les crédits observés ici sont
des fixtures locales normales créées par les commandes, jamais des crédits
historiques réécrits. `lifequest-auth2`, Cloud, les anciennes stacks et leurs
volumes n’ont reçu aucune opération pendant R2. `frontend/.env.local` conserve
sa date/longueur constatée (`2026-10-12 22:34:22Z`, 284 octets) et n’a été ni lu
ni modifié. Le serveur Next et les deux seules stacks R2 démarrées pour cette
campagne ont été arrêtés ; les volumes et les lignes synthétiques sont conservés.

Toutes les identités créées par les harnais utilisent des domaines fictifs
`example.test`. La fixture ready est signalée comme **état synthétique d’essai** :
dans une transaction administrative limitée à l’UUID de l’inscription fictive,
le harnais confirme le fuseau, met `hunter_setup.configuration_status='ready'`
et insère un profil nommé `R2 Synthetic Ready Hunter`. Il ne touche à aucun
champ de cinématique, média, vidéo ou checkpoint. `onboarding_completed=true`
est posé uniquement comme précondition synthétique de la fixture ready ; ce n’est
pas une preuve d’onboarding réel et le rapport ne revendique aucun parcours
AUTH-5. Aucun compte personnel, Hunter ancien ou sauvegarde navigateur n’est
utilisé. Les tentatives navigateur interrompues ont pu laisser des comptes et
lignes fictifs dans les volumes conservés ; rien n’a été nettoyé pour embellir
les résultats.

### 18.2 Récupération de mot de passe

Le premier échec provenait du **synchronisme du harnais Chrome** : il attendait
seulement le changement d’URL vers `/login`, puis remplissait le formulaire
avant l’hydratation React. La vérification Auth réelle a ensuite démontré que le
nouveau mot de passe était déjà actif (ancien mot de passe refusé par Auth,
nouveau accepté). Le harnais dédié attend désormais les champs hydratés ; aucun
défaut de route AUTH-3 ou modification de protection n’a été nécessaire.

`recovery-check.cjs` passe dans Chrome avec le lien réel lu en mémoire depuis
Mailpit : type et hôte validés sans imprimer token ou URL complète, callback
`token_hash` traité, session SSR vérifiée, cookie d’autorisation de récupération
HttpOnly/SameSite=Strict constaté sans lire sa valeur, changement du mot de passe
et révocation globale confirmés. Une connexion UI avec le nouveau mot de passe
revient à `setup_pending`. L’ancien mot de passe est refusé par Auth ; un lien
consommé et un lien dont l’horodatage de l’unique compte fictif est rendu expiré
sont refusés. Confirmation e-mail, CSRF, Proxy et destination fixe restent actifs.
Aucun code Auth-3 n’a été modifié.

### 18.3 Écrans ready et réconciliation RPC

`ready-ui-check.cjs` réussit dans Chrome avec session authentifiée et deux comptes
fictifs. Le snapshot bootstrap réel annonce `ready` seulement pour la fixture
explicitement décrite ci-dessus ; un autre compte confirmé reste pending et ne
voit aucun écran Hunter.

Les assertions navigateur effectivement passées couvrent : dashboard et
statistiques ; création, édition, complétion avec reçu XP, archivage et
restauration de quête ; création/suppression d’Arc et détachement ; création et
progression de Boss ; synchronisation des achievements et affichage des
événements ; Focus démarrer/annuler ; Ideas, Mind Map, Library, Journal et
Creativity ; lecture du snapshot dans chaque domaine et affichage des mutations
confirmées par RPC. Settings expose son snapshot mais aucune commande/formulaire
de mutation ; il est explicitement en lecture seule.

Une coupure CDP sur une commande Idea produit l’état de résultat inconnu ; le
bouton affiché a rejoué la même intention, la commande a répondu 200 et le
snapshot ne contient qu’une ligne de cette fixture. Cela teste une perte de
réponse simulée au navigateur, pas une panne physique prolongée. Les migrations,
RPC et reçus historiques n’ont pas été modifiés.

### 18.4 Défauts AUTH-4E corrigés

1. `HunterWorkspace.revisionFor` traitait `entityRevisions.bosses[id]` comme une
   chaîne, alors que le reader fournit un objet imbriqué `{revision, subObjectives}`.
   L’UI envoyait donc `"[object Object]"` et Boss.progress recevait
   `VALIDATION_FAILED`. Le composant extrait maintenant la révision imbriquée ;
   le clic Chrome progresse le sous-objectif et le snapshot reflète le nouvel état.
   Aucune commande SQL/RPC ou migration n’a changé.
2. Une réponse réseau indéterminée masquait le formulaire et le bouton global
   « Réessayer » ne faisait qu’actualiser le snapshot ; il ne rejouait pas
   l’intention. Le provider conserve désormais en mémoire l’acteur, le kind, le
   payload et l’association au requestId déjà attribué ; le bouton reprend la
   même commande. Cet état est effacé sur succès, résultat certain, changement de
   session ou logout. Il n’est pas persisté dans le navigateur.
3. Deux clics immédiats sur `SessionLogout` émettaient deux requêtes, car le
   state React `busy` ne verrouillait pas le handler de façon synchrone. Un ref
   synchrone protège maintenant l’appel et est libéré seulement sur échec.

La suite Chrome finale passe : logout A avec commande en vol suspendue, disparition
immédiate des données A visibles dans le tab verrouillé, connexion de B en
`setup_pending` sans valeur A, double clic pending avec **un seul POST logout**,
et redirection de deux onglets du même profil Chrome vers `/login`. Une commande
suspendue est annulée et relâchée par le harnais ; aucun crédit de cette demande
n’a été créé. Les essais multi-onglets utilisent le même profil ; un premier
essai séparait les profils et ne pouvait donc pas éprouver BroadcastChannel.

### 18.5 Vérifications, limites et clôture

Après corrections, résultats réels : `npm.cmd run typecheck` code 0 ;
`npm.cmd run lint` code 0 ; `npm.cmd test` code 0 (**185 tests**, 0 échec) ;
`npm.cmd run build` code 0. Les deux suites Chrome dédiées
`recovery-check.cjs` et `ready-ui-check.cjs` terminent avec code 0 ; aucun test
browser n’est déclaré réussi sur la seule base d’une compilation. Le serveur
Next de test écoute uniquement `127.0.0.1:31666`; secret de récupération aléatoire
en mémoire, aucune sortie de clé/token.

La régression RPC complète n’a pas été relancée : son essai antérieur s’arrêtait
sur deux complétions concurrentes avec SQLSTATE `55P03` (lock unavailable),
blocage AUTH-4C qui demanderait un changement de commande/transaction hors de
cette intervention. Le reader standalone AUTH-4D n’a pas été relancé ; les
snapshots réels ont été vérifiés après les mutations UI. Expiration/révocation
globale de toutes les sessions, Firefox/Safari, lecteur d’écran humain et
onboarding réel ne sont pas revendiqués. Le comportement calendrier Cloud reste
non testé, car aucune cible Cloud n’existe.

Les fichiers AUTH-4E-R2 modifiés sont `frontend/src/components/auth/SessionLogout.tsx`,
`frontend/src/components/system/SystemShell.tsx`,
`frontend/src/components/hunter/HunterWorkspace.tsx`,
`frontend/src/lib/hunter/cloud.tsx`, les harnais sous
`tools/auth4e-r2/` et `tools/auth4e-r2-retry/`, et ce rapport. Captures, profils,
secrets de processus et résultats restent hors Git dans `.results` ignoré.
Branche `feature/lifequest-improvements`, HEAD
`18425f5644b7465f7d206097bb0f78d6a8a86d25`, aucun fichier staged ; aucun commit,
push, merge, déploiement ou changement Cloud. AUTH-5 et AUTH-6 ne sont pas
commencés. `git diff --check` réussit ; `git diff --cached --check` et le dernier
contrôle de statut sont exécutés après cette actualisation.

**Verdict : les deux blocages AUTH-4E-R2 sont traités ; récupération, écrans
ready synthétiques et SessionLogout passent sur la stack locale R2. La limite
concurrente RPC `55P03` et les validations Cloud/onboarding réel restent ouvertes.
AUTH-4E-R2 s’arrête ici en attente de validation utilisateur ; aucune phase
AUTH-5/6 ni publication n’a été engagée.**

## 19. AUTH-4E-R3 — Régression ciblée de concurrence

### 19.1 Diagnostic du `55P03`

La seule trace antérieure conservée est le bilan AUTH-4E-R2 ci-dessus et le
harnais `tools/auth4e-r2-retry/rpc-check.cjs`. Celui-ci lançait avec
`Promise.all` deux `quest.complete` sur la même quête et le même compte A. Chaque
appel obtenait implicitement un `requestId` aléatoire, non journalisé. Le helper
`ok()` exigeait HTTP 200 ; le bilan rapporte qu’un appel avait renvoyé SQLSTATE
`55P03`. Aucun log de cette exécution n’a gardé l’identifiant, le nombre de
reçus ni l’état de la base au moment exact ; ces valeurs historiques ne peuvent
pas être reconstituées honnêtement.

Le code explique le résultat : `command_begin` fixe `lock_timeout` à 1000 ms,
verrouille d’abord la session puis la ligne Hunter avec `FOR UPDATE`, avant de
lire ou insérer un reçu. Le verrou de session partagé est compatible entre les
deux RPC ; les deux `FOR UPDATE` Hunter du même acteur se sérialisent. Si le
premier appel garde ce verrou plus d’une seconde, PostgreSQL refuse le second
avec `55P03` avant la lecture du reçu et avant toute écriture métier. La
transaction PostgREST est alors entièrement annulée. L’ordre reste session →
Hunter → entité. Le refus borné est une propriété de sécurité/concurrence,
pas en soi une anomalie ; l’assertion historique « les deux appels doivent
réussir » était trop stricte. Aucun changement de RPC, migration ou permission
n’a été nécessaire.

### 19.2 Cible et installation vérifiées

Stack neuve `lifequest-auth4e-r3-20261013`, dossier
`C:/Users/hp/myproject/lifequest-auth4e-r3-20261013`, API `127.0.0.1:57621`,
PostgreSQL `127.0.0.1:57622`, Mailpit `57624`, shadow `57620`. Avant sa création,
le dossier, les ports, les conteneurs et les volumes portant cet identifiant
n’existaient pas. Aucun lien distant ; la Data API expose `public` seulement.
Le volume DB observé est
`/var/lib/docker/volumes/supabase_db_lifequest-auth4e-r3-20261013/_data`, monté
sur `/var/lib/postgresql/data`. Les 23 migrations ont été installées par le
démarrage initial et leurs fichiers copiés sont identiques aux sources par
SHA-256. La stack a ensuite été arrêtée/redémarrée sans reset ; l’empreinte des
20 tables métier, activation, versions de migration et ACL a été identique.
L’arrêt final conserve les volumes.

`lifequest-auth2`, les anciennes stacks, Supabase Cloud et les données
personnelles n’ont reçu aucune connexion de test ni opération. `frontend/.env.local`
n’a pas été lu ni modifié pendant R3 ; sa taille et son horodatage sont restés
284 octets et `2026-10-12 22:34:22Z`. La base R3 a fini avec cinq comptes et
cinq Hunters synthétiques, tous créés par les harnais en `example.test` ; aucun
compte personnel.

### 19.3 Résultats SQL/Auth/RPC

La parité complète a été vérifiée avant l’activation locale des crédits :
8 groupes/4013 assertions de calculs et golden, puis 92 400 comparaisons de
périodes, 23 100 offsets natifs, cinq fuseaux, neuf voisinages de transition et
zéro divergence. Node `24.19.0` utilise les ressources ICU/tzdata `2026e`
épinglées ; PostgreSQL `17.11`. L’activation fictive expire après 24 heures et
reste propre à cette base.

`tools/auth4e-r3/rpc-check.cjs` a réussi 21 groupes. Vérifications obtenues :
trois RPC autorisées seulement, helpers privés, FORCE RLS et privilèges effectifs,
provisioning Auth réel par SMTP, état pending protégé, isolation A/B, refus des
payloads de récompense/période, créations et mutations Quest/Arc/Boss/Focus/Lab,
réconciliation des compteurs, snapshots après commandes, achievements sans XP,
conservation de l’Arc dans le snapshot XP, et reprise après reconnexion.

Le harnais vérifie les refus calendaires sans activation, avec empreinte altérée
et après expiration : HTTP 503, aucun crédit partiel, puis restauration de la
seule activation de fixture. Il injecte aussi une contrainte de panne après les
écritures métier et après l’écriture ledger : les lignes, XP, reçus, révisions et
compteurs sont annulés ensemble. Une réponse HTTP est réellement supprimée après
commit ; le retry du même `requestId` retrouve le reçu immuable et ne crédite pas
une seconde fois. JWT expirés/falsifiés, logout/révocation, logout concurrent
attendant une RPC déjà autorisée et refus de l’ancien JWT sont exercés.
`statement_timeout` réel a répondu en environ 5,02 s avec rollback.

Le cas de verrou forcé tient la ligne Hunter de A, envoie la création pour A,
puis confirme qu’une commande de B avance indépendamment. La commande A reçoit
`55P03` en **1031 ms**. Son `requestId` n’a aucun reçu ; nombre de quêtes,
révision et XP de A sont inchangés. Après libération du verrou, le retry avec le
même `requestId` réussit et ne crée qu’une quête/reçu. Ce scénario confirme la
politique bornée et le rollback.

Une preuve complémentaire consigne les trois courses de crédit sur un autre
compte synthétique. Quest, Boss et Focus ont chacun retourné HTTP 200 pour les
deux appels concurrents : **1 crédit, 1 événement ledger, 2 reçus et un snapshot
AUTH-4D cohérent par intention**. Aucun `55P03` n’est arrivé dans ces trois
courses ; le test forcé ci-dessus valide séparément ce chemin de refus.

### 19.4 Contrôles et limites

Typecheck, lint, tests frontend (**185 réussis**) et build Next.js terminent avec
code 0. Le contrôle SQL/Auth/RPC complet est vert (21 groupes), la parité et le
test calendrier sont verts, et la conservation stop/start des fixtures est
identique. Aucun changement de code applicatif, formule XP, migration, ACL ou
contrat RPC n’a été fait pendant R3 ; le seul ajustement concerne le harnais de
concurrence, qui accepte `55P03` borné, vérifie l’absence de reçu/écriture puis
réessaie le même `requestId`.

La reproduction de l’échec R2 ne peut fournir rétroactivement ses UUID ni son
état de table, car le harnais d’origine ne les écrivait pas. Aucune cible Cloud,
charge prolongée, Firefox/Safari, coupure réseau physique ou engagement
calendaire hébergé n’a été testé. AUTH-5 et AUTH-6 restent non commencés.

Fichiers R3 ajoutés sous `tools/auth4e-r3/` : stack indépendante et contrôles de
parité/calendrier, copie du harnais RPC avec assertion corrigée,
`concurrency-check.cjs` et `state-check.cjs`; preuves et secrets restent sous
`.results` ignoré. Rapport actualisé. HEAD reste
`18425f5644b7465f7d206097bb0f78d6a8a86d25`; aucun fichier staged, commit, push,
merge, déploiement ou changement Cloud. Les autres modifications non suivies et
AUTH-4E précédentes du dépôt étaient déjà présentes avant R3 et sont préservées.

**Verdict : `55P03` est un timeout de verrou borné et attendu ; l’assertion
historique exigeant deux succès simultanés était erronée. Les retries, l’absence
de double XP, les rollbacks et les snapshots sont vérifiés localement. AUTH-4E-R3
est terminé sur la stack fictive R3, en attente de validation utilisateur ;
AUTH-5 et AUTH-6 ne sont pas commencés.**

## 20. AUTH-5 — Introduction, onboarding et création initiale du Hunter

### 20.1 Cible et préservation

AUTH-5 a été exécuté uniquement sur la nouvelle stack locale
`lifequest-auth5-intro-20261014`, dans
`C:/Users/hp/myproject/lifequest-auth5-intro-20261014` : API
`127.0.0.1:59721`, PostgreSQL `127.0.0.1:59722`, Mailpit `127.0.0.1:59724`
et shadow `59720`. Aucun projet Cloud ou lien distant n’a été utilisé. Le
démarrage a appliqué les 27 migrations ; les fichiers copiés correspondent aux
sources vérifiées par le manifeste SHA-256. La Data API n’expose que `public`.

Le premier contrôle Docker dans le sandbox échouait sur l’accès à la
configuration Docker et au pipe du moteur. L’escalade prévue a été autorisée ;
le moteur local a répondu et les commandes sont restées limitées à la stack
AUTH-5. Aucun contournement du sandbox. La stack a été arrêtée sans effacement :
aucun conteneur ni listener de ses ports ne reste actif et le volume
`supabase_db_lifequest-auth5-intro-20261014` est conservé.

L’audit final en lecture seule a constaté 45 utilisateurs Auth et 45 Hunters,
tous avec des identités `example.test`, 5 profils, 40 setups pending, 5 ready,
zéro événement XP et zéro activation calendaire. Les profils ready sont des
fixtures créées par les harnais, pas des onboardings réels. `lifequest-auth2`,
les autres stacks et leurs données historiques n’ont reçu aucune opération.
`frontend/.env.local` n’a été ni lu ni modifié. Aucun reset, commit, push, merge
ou déploiement.

### 20.2 Parcours et garanties serveur

Après confirmation e-mail, un nouvel acteur reste pending et ne voit jamais le
dashboard Hunter. Le checkpoint de l’introduction et son issue explicite sont
conservés côté serveur ; un skip n’invente pas d’horodatage de visionnage. Les
étapes d’identité, avatar, objectifs et revue sont sauvegardées côté serveur et
reprenables après rechargement/reconnexion. Le fuseau IANA est confirmé avant la
revue. La complétion crée le profil et passe le setup à ready dans la même
transaction protégée par session, sans crédit XP ni entrée ledger. L’état initial
vérifié est niveau 1, rang E, 0 XP, `opening_xp=0`, révision 1 et un reçu.

Les complétions concurrentes puis le retry du même `requestId` retournent le
reçu immuable : une seule création de profil et un seul reçu. Un acteur ready
reprend son Hunter sans nouvelle introduction obligatoire ; un acteur pending
reste bloqué hors dashboard. Les tests vérifient aussi l’isolation A/B, la
substitution d’acteur et le refus des sessions révoquées. Les RPC restent
protégées par FORCE RLS ; aucun accès direct aux tables ni permission client
supplémentaire n’a été ajouté.

Le calendrier est volontairement non activé dans cette preuve. Une commande RPG
est refusée et laisse quêtes, XP et révision inchangés. Aucun ancien reçu ou
`period_key` n’a été recalculé.

### 20.3 Résultats Chrome et corrections

`tools/auth5/browser-check.cjs` a terminé avec code 0 dans Chrome sur Next lié à
`127.0.0.1:31755` et l’API locale AUTH-5. Les assertions vérifient :

- inscription fictive confirmée par Mailpit, écran pending sans gameplay,
  checkpoint de brouillon sauvegardé, panne réseau contrôlée et reprise au dernier
  checkpoint confirmé après rechargement ;
- reprise de l’introduction, skip explicite, complétion et double clic sans
  doublon, accès dashboard, rechargement sans repasser l’introduction ;
- logout et verrouillage des onglets, connexion de B en pending sans données de
  A, puis reconnexion de A qui retrouve son Hunter ready ;
- absence de lecture/écriture d’une sauvegarde LifeQuest localStorage pour créer
  le compte cloud.

Deux défauts AUTH-5 ont été corrigés. `/onboarding` montait auparavant
`ProtectedHunter`, qui redirigeait l’acteur pending vers la même page ; le layout
laisse désormais la page vérifier la session et le RPC d’état, avec une
assertion frontend contre la régression. Le fuseau n’était pas demandé avant que
le serveur l’exigeait à la revue ; l’interface demande maintenant une zone IANA
avant d’autoriser la revue. Aucun contrôle de session n’a été neutralisé.

Trois migrations additives (015–017) corrigent des erreurs SQL découvertes lors
des tests, sans réécrire les migrations appliquées : dépendance à un helper privé
AUTH-4, ambiguïté de `request_id`, puis appel à une fonction JSON absente de la
version PostgreSQL ciblée.

### 20.4 Contrôles finaux et limites

| Contrôle | Résultat |
| --- | --- |
| Suite `tools/auth5/auth5-check.cjs` | Code 0, 8 groupes SQL/Auth : pending, checkpoint, rollback, atomicité/idempotence, état initial sans XP, calendrier fermé, isolation et révocation. |
| Suite `tools/auth5/browser-check.cjs` | Code 0 dans Chrome pour les parcours ci-dessus. |
| Typecheck / lint | Codes 0. |
| Tests frontend | Code 0, 186 réussis, zéro échec. |
| Build Next.js | Code 0 dans la copie frontend isolée. Webpack est utilisé car Turbopack refuse le junction externe `node_modules` ; le `package.json` du dépôt n’a pas changé. |
| Audit final en lecture seule | Code 0 : 27 migrations, 45 identités/Hunters fictifs, zéro XP et zéro activation calendrier. |
| Arrêt / conservation | Code 0 ; conteneurs/listeners AUTH-5 absents, volume conservé. |

Le harnais a exercé la reprise/skip d’introduction avec des fixtures ; il ne
revendique pas un onboarding humain réel ni toutes les variantes média. Aucune
cible Cloud n’était disponible. Firefox/Safari, tests de charge et restauration
complète ne sont pas revendiqués. L’absence d’activation calendaire garde les
crédits bloqués. AUTH-6 et les imports de données restent hors périmètre.

Les changements AUTH-5 comprennent la migration 014 et ses correctifs additifs
015–017, l’interface onboarding, les assertions frontend, les outils sous
`tools/auth5/` et ce rapport. La branche reste
`feature/lifequest-improvements`, HEAD
`18425f5644b7465f7d206097bb0f78d6a8a86d25`; aucun fichier n’est staged.

**Verdict : AUTH-5 est implémenté et vérifié localement sur des comptes fictifs,
avec création initiale atomique, idempotente, protégée par session et sans XP.
Arrêt pour validation utilisateur ; AUTH-6 n’est pas commencé. Aucun crédit
Cloud ni modification des reçus historiques.**

## 21. Installation Supabase locale personnelle — résultats et arrêt de sécurité

### 21.1 Projet dédié et migrations

Le 14 octobre 2026, l’utilisateur autorise la cible personnelle locale
`lifequest-personal-local-20261014`, dossier
`C:/Users/hp/myproject/lifequest-personal-local-20261014`, ports shadow/API/DB/
Studio/Mailpit `64720–64724`, Next `31770`. Avant la création, le moteur Docker
Linux 29.8.2 répondait ; le dossier, ressources Docker et ports de cette cible
étaient absents/libres. Le dossier a été préparé une seule fois, puis la stack
locale a démarré. Les 27 migrations validées ont été appliquées dans l’ordre et
leurs copies correspondent aux sources par SHA-256. Le schéma `public` seul est
exposé à la Data API. Les contrôles Auth/RPC ont vérifié 23 tables privées sous
ENABLE/FORCE RLS, ACL client, fonctions protégées et rôles internes limités.

Configuration Auth : confirmations e-mail actives, liens vers
`127.0.0.1:31770/auth/confirm` ou `localhost:31770/auth/confirm`, SMTP local
Mailpit `64724`, Studio `64723`. Le profil Next est explicite :
`frontend.personal.env` est généré hors dépôt avec l’URL API et la clé publique
locales ; `service_role` n’est pas stockée. `frontend/.env.local` n’a pas été
écrit et sa longueur/date sont restées 284 octets et 2026-10-12 22:34:22 UTC.
Next charge naturellement les fichiers d’environnement de son projet ; les
variables fournies au processus personnel remplacent les quatre valeurs
applicatives concernées. Aucun contenu de sauvegarde localStorage n’a été lu ou
importé.

Le lanceur `Open LifeQuest.cmd` démarre uniquement cette stack si nécessaire,
lance Next sur `127.0.0.1:31770` et ouvre la page locale. Son exécution réussit.
`Stop LifeQuest.cmd` et `daily.cjs stop` sont préparés pour arrêter seulement le
processus Next vérifié puis Supabase sans effacer les volumes ; l’arrêt complet
de la stack n’a pas été exécuté pendant cette campagne, afin de conserver la
cible active pour le diagnostic. Supabase est encore en cours d’exécution ; Next
a été arrêté après l’essai du lanceur.

### 21.2 Calendrier local et Auth/RPG

Sur cette base, avant la création de comptes, la matrice stricte passe :
**92 400 périodes**, **23 100 offsets natifs**, neuf voisinages de transitions,
zéro divergence sur UTC, Africa/Casablanca, Paris, New York et Auckland. Versions
mesurées : Node 24.19.0, ICU 78.3 avec ressources ICU/tzdata épinglées 2026e ;
PostgreSQL 17.11, image `public.ecr.aws/supabase/postgres:17.11.0.004`.
Une activation locale de 24 heures a été écrite pour ces cinq zones après le
succès de parité. Les tests RPC ont ensuite confirmé que l’absence, l’altération
et l’expiration de l’activation bloquent les commandes sans écriture partielle.
Les périodes et reçus historiques n’ont pas été recalculés.

`rpc-check.cjs` passe 21 groupes : isolation A/B, RLS/ACL, mutations des modules,
concurrence, timeout `55P03` borné, retry avec le même requestId, absence de
double XP, rollback, sessions révoquées, snapshot et reçu après reconnexion.
`auth5-check.cjs` passe 8 groupes : provisioning pending, intro/checkpoint,
onboarding complet atomique/idempotent, état initial exact niveau 1/rang E/0 XP,
rollback injecté, activation de cinématique persistée sans XP, et refus calendrier
pendant retrait temporaire de la seule activation Casablanca, restaurée à
l’identique dans `finally`.

### 21.3 Parcours Chrome et contrôles de code

Chrome réel passe les parcours d’inscription/confirmation, intro, lecture et
reprise du checkpoint après rechargement, pending sans dashboard, onboarding,
double-clic de création, Hunter à 0 XP, reconnexion, A/B et logout multi-onglet.
Un deuxième harnais Chrome passe les écrans dashboard/statistiques, quêtes et
archives, Arcs, Boss, Focus, achievements/événements, Ideas, Mind Map, Library,
Journal et Creativity ; les mutations sont confirmées par RPC et le snapshot est
rafraîchi. Settings est en lecture seule. La fixture ready de ce harnais est
explicitement synthétique : setup/profil préparés pour l’interface seulement,
`onboarding_completed` utilisé comme précondition UI, sans écriture de champs
cinématique, vidéo ou checkpoint. Le parcours AUTH-5 réel a été validé séparément
sur les comptes navigateur fictifs.

Typecheck, lint, **186/186 tests frontend** et build passent. Un premier essai
RPC avait créé un seul compte `example.test` pending, puis échoué avant la lecture
Mailpit car la copie du harnais utilisait l’ancien nom de port. Ce compte et son
Hunter zéro XP ont été conservés. Deux attentes de route du harnais UI ont aussi
été corrigées après avoir observé les redirections réelles ; aucun changement
applicatif n’a été requis. Les essais ont créé uniquement des comptes synthétiques
par leurs scripts, à l’exception de l’identité signalée ci-dessous dont la
provenance n’est pas déterminée.

### 21.4 Préservation, blocage et état Git

Le contrôle agrégé final trouve **21 comptes Auth**, **21 Hunters**, 27 événements
XP, 156 reçus et cinq activations calendaires. Vingt comptes portent un domaine
`example.test` ; **un compte a un domaine différent**. Je n’ai pas affiché son
adresse, son contenu de profil ou son identifiant, et je ne l’ai pas modifié. Son
origine n’est pas établie : il peut s’agir d’une activité externe pendant que la
stack était ouverte. Pour éviter d’exporter ou de relire des données possiblement
personnelles, la sauvegarde complète, le test de restauration et l’empreinte de
conservation après redémarrage sont suspendus. La stack reste démarrée, les
volumes conservés, et aucune restauration, suppression ou réinitialisation n’a
été exécutée.

Les fichiers ajoutés sont les outils ciblés sous `tools/lifequest-local/`, les
deux lanceurs dans le dossier externe, ce guide et ce rapport. Aucun fichier
applicatif frontend ou migration historique n’a été modifié. Aucune connexion,
commande ou migration n’a visé `lifequest-auth2`, une ancienne stack ou Cloud.
Pas de commit, staging, push, merge ou déploiement. Aucun reçu historique ni
sauvegarde localStorage n’a été touché.

**Verdict : installation locale créée, 27 migrations, parité calendaire, Auth,
RPC et parcours Chrome validés avec fixtures fictives. La clôture complète reste
bloquée par l’identité hors `example.test` : ne pas lancer `backup.cjs`, ne pas
restaurer, et ne pas redémarrer cette base tant que sa provenance n’est pas
confirmée. Une fois identifiée, reprendre uniquement la conservation et le test
de sauvegarde/restauration sur une nouvelle cible indépendante. AUTH-6 et tout
import personnel restent hors périmètre.**

## 22. Vérification indépendante de sauvegarde/restauration synthétique

Après que l’utilisateur a indiqué ne pas connaître la provenance du compte hors
`example.test`, la base personnelle est restée intacte : aucune adresse, ligne de
profil ou sauvegarde n’a été inspectée ; aucune sauvegarde n’a été prise depuis
cette base, qui n’a pas été redémarrée. La procédure de sauvegarde personnelle
demeure suspendue.

Pour éprouver la procédure sans inclure cette identité, un projet indépendant
`lifequest-backup-restore-test-20261014` a été contrôlé puis préparé sous
`C:/Users/hp/myproject`, ports **64820–64824**. Au préflight, Docker Linux 29.8.2
répondait, le chemin cible était absent, aucun conteneur/volume/réseau de même
nom n’existait et les cinq ports étaient libres. Les 27 migrations copiées ont
été installées dans l’ordre et vérifiées par version.

Le harnais a créé et confirmé par Mailpit une seule identité `example.test`.
Garde avant dump : 1 compte Auth, 1 Hunter, 0 événement XP, 0 reçu de commande,
27 migrations, zéro identité hors domaine de fixture. Le `pg_dump -Fc` de cette
base synthétique a été enregistré hors dépôt, SHA-256 vérifié, puis restauré
avec `pg_restore` dans la base neuve `lifequest_restore_verify`, après contrôle
qu’elle ne contenait pas les schémas Auth/Hunter/migrations. Les agrégats source
et cible concordent : 1 compte fictif, 1 Hunter, 0 événement XP, 0 reçu et 27
migrations. La restauration n’a ciblé aucune base existante.

Le premier transfert de l’archive traitait les octets binaires comme du texte
UTF-8 et `pg_restore` a refusé cette archive tronquée/corrompue avec EOF. Le
harnais a été corrigé pour capturer l’archive comme `Buffer`, valider l’en-tête
`PGDMP`, copier le fichier binaire vers le conteneur et vérifier son SHA-256.
La seconde restauration a réussi. La stack d’essai est arrêtée sans effacement ;
son volume et ses données synthétiques sont conservés.

Ce résultat démontre le cycle dump/restore sur une base indépendante fictive ;
il ne déverrouille pas une sauvegarde de la base personnelle. Pour celle-ci,
l’identité au domaine inconnu doit d’abord être reconnue par l’utilisateur. La
stack personnelle demeure active, et aucune opération de conservation après
redémarrage n’est revendiquée. Aucune opération n’a visé `lifequest-auth2`, les
anciennes stacks ou Supabase Cloud.

Le helper isolé `tools/lifequest-local/restore-test.cjs` et le guide
`tools/lifequest-local/README.md` documentent cette preuve et ses ports. Le dump
ne contient que la fixture synthétique ; ses fichiers sont hors dépôt. Pas de
modification de migration ou de frontend, staging, commit, push, merge ou
déploiement. AUTH-6 n’est pas commencé.

## 23. Finalisation non destructive du lanceur quotidien

L’audit a identifié que l’ancien chemin `daily.cjs open` appelait
`stack.start()`, lequel vérifiait l’historique et pouvait exécuter
`supabase migration up`. Comme aucune migration personnelle n’est autorisée
dans cette demande, le lanceur utilise maintenant `stack.startServices()` :
vérification du projet et du moteur Docker, démarrage des conteneurs de ce seul
projet puis contrôle des endpoints, sans requête aux tables applicatives et sans
commande de migration.

Le lanceur vérifie le PID et la ligne de commande de Next avant de réutiliser ou
d’arrêter le processus. Il refuse le port 31770 si un autre processus l’occupe,
et refuse de démarrer Supabase si l’un des ports fixes de la cible est déjà
utilisé alors que la stack n’est pas reconnue comme active. Les erreurs Docker,
ports, endpoint et délai Next ont des messages destinés à l’utilisateur ; les
journaux Next sont conservés hors dépôt sous `logs/next.log`. Le raccourci
`Open LifeQuest.cmd` ouvre `/login` après démarrage. Le raccourci d’arrêt arrête
Next puis le projet Supabase ciblé sans supprimer ses volumes.

Contrôles réellement effectués durant cette finalisation : `node --check` sur
`daily.cjs` et `stack.cjs` ; démarrage de Next avec l’ouverture navigateur
explicitement neutralisée pour ne pas risquer de restaurer une session existante ;
second appel réutilisant le même PID ; arrêt propre de Next et Supabase ; contrôle
final des ports 64720–64724 et 31770 tous libres, zéro conteneur personnel en
cours et un volume conservé. Le chemin navigateur du raccourci reste `/login` ;
il n’a pas été ouvert dans le navigateur pendant cette intervention afin
d’éviter toute lecture accidentelle de l’identité inconnue. Le contrôle antérieur
de l’installation avait déjà lancé le raccourci et vérifié la page locale.

Aucune sauvegarde, restauration, lecture de table, création/modification/
suppression de compte ni migration n’a visé la base personnelle pendant cette
intervention. L’identité hors `example.test` reste intacte et non inspectée.
Les fichiers applicatifs, migrations, historiques, `lifequest-auth2`, anciennes
stacks, Cloud et sauvegardes localStorage n’ont pas été touchés. Le guide et les
scripts du lanceur ont été actualisés. Les contrôles `git diff --check` passent ;
aucun fichier n’est staged, aucun commit/push/merge/déploiement n’a eu lieu.

## 20. Restauration visuelle AUTH-4E - inventaire et limites

L'utilisateur demande de retrouver l'apparence historique tout en gardant Auth, snapshots et RPC. Comparaison statique faite avec les sources de `origin/feature/lifequest-improvements` en lecture seule. Les CSS Modules historiques existent et restent inchanges : `CompactDashboard.module.css`, `RankLetter.module.css`, `SystemShell.module.css`, `QuestCommandCenter.module.css`, `QuestUI.module.css`, `HunterCore.module.css`, `HunterOperations.module.css` et `HunterLab.module.css`.

Correspondances identifiees entre interactions historiques et commandes cloud :

| Ecran/action | Source de donnees ou commande serveur |
| --- | --- |
| Dashboard, Core, statistiques, historique | Snapshot AUTH-4D ; terminer une quete appelle `quest.complete`. |
| Quetes : creer, editer, terminer, archiver, restaurer | `quest.create`, `quest.update`, `quest.complete`, `quest.archive`, `quest.restore`. PostgreSQL calcule periode et XP. |
| Story Arcs | `arc.create`, `arc.delete`; le snapshot fournit les arcs et l'historique associe. |
| Boss / Operations | `boss.create`, `boss.progress`, `boss.claim`, `achievement.sync`; evenements, arcs, recompenses et ledger viennent du snapshot. |
| Focus | `focus.start`, `focus.pause`, `focus.resume`, `focus.cancel`, `focus.finish`, `focus.claim`. |
| Hunter Lab | `idea.*`, `node.*`, `resource.*`, `journal.save`, `creativity.submit`; lectures depuis le snapshot. |
| Settings, import/export cloud | Lecture seule ou indisponible : aucune RPC de modification Settings ni import/export serveur n'existe. Aucun fallback localStorage pour un compte connecte. |

La couche `HunterWorkspace` rend maintenant Dashboard, Quetes, Arcs, Core, Operations et Lab avec les modules CSS historiques, et appelle les commandes via le client cloud. `QuestCommandCenter` conserve sa structure et ses classes historiques ; le mode serveur n'utilise pas le calendrier navigateur pour autoriser une completion. Les pages protegent leur rendu avec le snapshot `ready` et le shell conserve la navigation historique.

Cette restauration n'est **pas encore validee visuellement** et ne peut pas etre qualifiee d'identique : aucun parcours Chrome/Playwright ni capture desktop/mobile n'a ete execute dans cette campagne, et aucune stack Supabase n'a ete demarree. L'environnement de test actuellement visible est l'installation personnelle ; elle n'a pas ete utilisee afin de ne pas exposer ses donnees. Plusieurs vues sont des adaptations du JSX historique, pas une reutilisation byte-identique : le graphe Mind Map/SVG historique, certaines details d'interaction Lab, et le rendu complet de Boss doivent encore etre compares et ajustes. Les controles compile/lint ne remplacent pas cette validation.

Verifications executes pour cette intervention : `npm run typecheck` code 0 ; `npm run lint` code 0 ; `npm test` code 0, 186 tests ; `npm run build` code 0. Le test cloud de non-envoi de periode/XP a ete cible sur le payload de creation et l'intention `quest.complete` (le snapshot expose aussi `xpAwarded` en lecture). Le detecteur UI Impeccable ne signale aucun constat (`[]`). `git diff --check` et `git diff --cached --check` reussissent, avec avertissements habituels LF/CRLF.

Aucune migration, donnee Hunter, regle XP, receipt, configuration `.env.local`, compte, stack ou volume n'a ete change ou demarre ici. Aucun commit/push/merge/deploiement. Les modifications AUTH-4/5 et autres fichiers non suivis deja presents sont preserves ; le statut Git doit etre interprete avec cet historique preexistant.

**Etat : raccordement visuel partiel ; equivalence historique desktop/mobile et parcours navigateur restent a valider avant de declarer la demande terminee.**

## 24. AUTH-4E-V — tentative de comparaison visuelle historique

Le 14 octobre 2026, une comparaison source a été faite entre les composants de
`origin/feature/lifequest-improvements` et l’adaptateur cloud actuel, sans changer
de branche ni utiliser `.env.local` comme configuration de test. Les composants
historiques et leurs CSS Modules ont été lus depuis la référence Git locale ;
aucun ancien handler localStorage n’a été monté pour un compte connecté.

Écart concret confirmé par les sources : l’ancien Hunter Lab rendait une carte
SVG Mind Map, les relations parent/enfant et un sélecteur de parent. La vue cloud
n’affichait que des lignes. L’adaptateur réutilise maintenant `HunterLab.module.css`
pour restituer le graphe, ses liens, les racines/branches, le surlignage du parent
choisi et le sélecteur. Les créations et suppressions restent envoyées aux RPC ;
les nœuds du graphe viennent exclusivement du snapshot. Aucun SQL ni XP n’a été
modifié. C’est une correction statique fondée sur le JSX historique, pas une
différence observée sur capture.

Préflight navigateur/environnement : Chrome est installé ; le dépôt n’a pas de
Playwright/Puppeteer local. Les ports **64920–64924** (Supabase de test) et
**31780** (Next) étaient libres et le dossier
`C:/Users/hp/myproject/lifequest-ui-visual-20261014` était absent. L’accès Docker
sandboxé a échoué sur la permission au fichier de configuration et au pipe. La
revue automatique a ensuite refusé l’escalade demandant un inventaire global des
conteneurs, volumes et réseaux, au motif qu’elle exposerait les métadonnées de la
stack personnelle explicitement exclue. Aucun contournement ni appel Docker
alternatif n’a été tenté. Le contrôle filtré exact et le démarrage d’une cible
nouvelle attendent l’accord de l’utilisateur ; aucune stack Supabase n’a été
démarrée, aucune migration appliquée et aucun compte fixture créé pour cette
campagne.

Contrôles frontend exécutés après l’ajout du graphe : `npm run lint` code 0 ;
`npm test` code 0, **186 tests** ; `npm run typecheck` code 0 ;
`npm run build` code 0 avec URL/clé publique fictives fournies au processus.
Next.js annonce quand même le chargement du fichier `.env.local` selon son
comportement d’environnement ; ses valeurs n’ont pas été affichées et aucune
requête vers un service Supabase n’a été exécutée par ces contrôles. Aucun fichier
d’environnement n’a été modifié.

La campagne demandée n’est donc **pas validée visuellement** : aucune capture
Chrome desktop/mobile n’a été produite pour Dashboard, Quêtes, Arcs, Core,
Operations/Boss, Focus ou Lab ; animations, menus, interactions et persistance
PostgreSQL n’ont pas été éprouvés dans cette campagne. Les cartes Boss, les
différences d’animations et le comportement responsive restent ouverts. Le seul
écart visuel corrigé ci-dessus provient de la comparaison des composants, pas
d’une comparaison réelle de captures. `lifequest-auth2`, les volumes historiques,
la stack personnelle, les données utilisateur et localStorage n’ont reçu aucune
opération. Aucun staging, commit, push, merge ou déploiement.

**État : validation visuelle bloquée avant le préflight Docker indépendant ; le
graphe Mind Map historique est restauré dans le code, mais les résultats Chrome
et SQL/PostgreSQL demandés restent à exécuter après autorisation du contrôle
Docker strictement filtré sur la nouvelle cible.**

## 25. AUTH-4E-V2 — comparaison historique desktop/mobile et raccordement cloud

### 25.1 Cible et méthode

Après autorisation du contrôle filtré sur le nom exact, la comparaison a utilisé uniquement le projet fictif **lifequest-ui-visual-20261014** sous C:/Users/hp/myproject/lifequest-ui-visual-20261014 : API 127.0.0.1:64921, PostgreSQL 127.0.0.1:64922, Mailpit 127.0.0.1:64924, Next 127.0.0.1:31780. Les 27 migrations du dépôt étaient déjà installées et hash-matchées. Le frontend de test est une copie isolée sans .env.local ; la connexion fictive n’a été fournie qu’aux processus de build/test. La stack personnelle, lifequest-auth2, les autres piles et leurs sauvegardes localStorage n’ont reçu aucun appel ni changement.

La référence visuelle provient de origin/feature/lifequest-improvements, servie dans un profil Chrome jetable et alimentée uniquement par les fixtures synthétiques de capture. Le nouveau rendu vient du Next.js connecté à la base de test. Chrome a capturé 1440×1000 et 390×844 pour Dashboard, Quêtes, Story Arcs, Hunter Core, Operations/Boss, Focus et les sept vues Hunter Lab (Focus Dungeon, Ideas, Creativity, Mind Map, Library, Journal, Analytics), avec une vue basse pour les pages défilantes. Les images et profils Chrome restent dans tools/ui-visual/.results/, ignorés par Git.

### 25.2 Différences constatées et corrections

Les captures confirment le retour des cinq liens historiques du shell et des CSS Modules. Les routes remettent le panneau principal en haut de page. Mind Map restitue les liens SVG parent/enfant, racines/branches, la sélection et le choix du parent ; les nœuds et relations viennent du snapshot et leurs mutations passent par RPC.

Operations/Boss avait perdu des éléments de la vue historique. Le rendu reprend maintenant le style de liste pondérée, sa barre de progression, les marqueurs des titres ◆/◇ et la date de déblocage. Le bouton de récupération n’apparaît qu’après la fin du Boss ; les clics restent boss.progress et boss.claim. Le toast de confirmation est animé et flottant, sans décaler le contenu ; prefers-reduced-motion désactive son animation. Les vues conservent les snapshots Supabase et les commandes AUTH-4 existantes.

Les captures couvrent la navigation, menus de quêtes et archives, le responsive des cartes, changements d’onglet, Mind Map, Boss, animations visibles et commandes aux deux tailles. Les pages sont proches de la référence par leur structure, palette et modules CSS ; elles ne sont pas pixel-identiques car les données de référence et celles du compte courant diffèrent.

### 25.3 Parcours et persistance

ready-ui-check.cjs passe dans Chrome contre le build production après les corrections. Il couvre le cycle des quêtes (création, édition, complétion, archivage/restauration et reçu XP), Arcs, Boss, Focus, achievements/events, Ideas, Mind Map, Library, Journal et Creativity. Le snapshot relu après les mutations reflète les lignes PostgreSQL ; les reçus et retry ne doublent pas les crédits. La suite couvre aussi erreur réseau/retry, comptes A/B, logout pendant une commande, invalidation mémoire, état pending et logout multi-onglet. Settings reste en lecture seule.

auth5-check.cjs passe 8 groupes SQL/Auth : comptes pending, reprise du checkpoint, skip explicite, création atomique/idempotente du profil niveau 1/rang E/0 XP, absence de crédit, rollback, garde calendaire et isolation/révocation. Le fixture ready de la vérification visuelle sert uniquement à afficher les écrans ; il ne prouve pas un onboarding humain. Le parcours AUTH-5 réel a été exercé séparément sur des comptes fictifs, sans altérer les anciennes cinématiques ou checkpoints.

### 25.4 Contrôles et limites

Après les dernières modifications, npm run typecheck, npm run lint et npm test passent dans la copie frontend isolée ; les tests comptent **186 réussites**. npm run build -- --webpack passe et les routes protégées/API sont dynamiques. La suite Chrome production repasse avec code 0. Le serveur Next de test a ensuite été arrêté et le port 31780 libéré. Le contrôle SQL/Auth passe **8 groupes**. Les volumes de test sont conservés ; aucune migration ni règle XP n’a été modifiée dans cette intervention.

Les différences restantes sont intentionnelles ou nécessitent une commande serveur : les nombres Dashboard/Core et cartes Boss dépendent des fixtures ; import/export et mutation Settings restent indisponibles pour les comptes cloud ; aucune action Reset n’est présentée pour une session Focus inexistante, car il n’y a pas de session cloud à annuler. Les données personnelles, médias et checkpoints ne sont pas injectés dans le fixture visuel. La contention 55P03 reste un refus borné et n’a pas été modifiée. La commande CLI Impeccable n’est pas installée ; l’inspection des captures a été manuelle.

Aucun compte personnel, stockage local, configuration personnelle ou utilisateur hors fixtures n’a été consulté/modifié. Aucun reset, staging, commit, push, merge ou déploiement. HEAD et branche inchangés. AUTH-6, les sauvegardes personnelles et toute publication restent hors périmètre.

**Verdict : les sept pages demandées et les vues Hunter Lab ont été capturées sur desktop/mobile et comparées à la référence Git. Les différences principales Mind Map/Boss/toast ont été corrigées ; les commandes et snapshots PostgreSQL ont été vérifiés avec des fixtures fictives. Les limites ci-dessus sont conservées pour validation utilisateur.**
### 25.5 Dernier ajustement Quêtes/Story Arcs

La comparaison des captures a conduit à aligner le sous-titre Quêtes sur la référence (« QUEST DIRECTORY », « ACTIVE QUESTS » et le texte de fréquence), tout en gardant l’onglet Archives et l’indication de période vérifiée par le serveur. Story Arcs n’affiche plus un second message local après une mutation : la confirmation accessible unique du provider cloud reste visible en toast flottant. Les captures desktop/mobile et le parcours Chrome ont été refaits après ces ajustements ; lint, tests frontend (186/186) et build de production repassent.
Les différences visuelles restantes comprennent le petit bouton Auth de déconnexion ajouté au logo (absent de la référence), les messages explicatifs nécessaires au calendrier et au stockage serveur, et les valeurs/quelques intitulés des fixtures ou onglets Lab. Les contrôles de parité visuelle portent sur la structure et le style ; ils ne masquent pas ces écarts fonctionnels/copy.

## 26. Maquette Dashboard Solo Leveling Premium

Le 14 octobre 2026, la direction utilisateur est une immersion RPG axée sur la progression. La composition de référence a été établie avant le code. Cette proposition est limitée au Dashboard ; aucune généralisation aux autres modules n'est incluse.

L'interface présente le profil Hunter et son portrait, rang/niveau, progression XP, quêtes du jour, Boss actif et prochaine étape, session Focus, cinq attributs et quatre activités récentes. Les valeurs et actions viennent du snapshot AUTH-4D et des RPC déjà en place. Le Dashboard n'ajoute ni calcul XP côté client, ni mutation localStorage pour un compte connecté. Les tokens, panneaux, barres, cartes, espaces, focus clavier et états responsive sont groupés dans `DashboardPremium.module.css`; le tout reste local au Dashboard. Une transition courte anime la barre de progression, avec réduction des animations/transitions via `prefers-reduced-motion`.

Captures Chrome réelles du build production, fenêtres 1440×1000 et 390×844 :

- Première vue : `tools/ui-visual/.results/visual-current/dashboard-premium-desktop.png`, `dashboard-premium-mobile.png`.
- Après validation de la quête : `tools/ui-visual/.results/visual-current/dashboard-premium-complete-desktop.png`, `dashboard-premium-complete-mobile.png`.
- Des captures de bas de page correspondantes sont aussi conservées dans le même dossier avec le suffixe `-lower.png`.

Le parcours `UI_VISUAL_DASHBOARD_ONLY` a utilisé uniquement la stack fictive `lifequest-ui-visual-20261014` (API 64921, PostgreSQL 64922, Mailpit 64924). Il a préparé les cartes de démonstration au moyen des écrans/RPC existants, puis validé la quête depuis le Dashboard. PostgreSQL contient exactement un événement `xp_events` pour cette intention, d'un montant de 50 XP ; `hunters.total_xp` et le snapshot AUTH-4D indiquent aussi 50. Le rapport synthétique et non sensible est `tools/ui-visual/.results/ready-ui/dashboard-preview-report.json`. Les comptes/fixtures créés par les relances sont synthétiques et n'ont pas été supprimés.

Vérifications : typecheck, lint et **186 tests frontend** passent ; le build webpack de la copie isolée passe ; Chrome confirme navigation, cartes actives, vue responsive sans débordement horizontal, préférences reduced-motion, action RPC et persistance SQL ; le détecteur Impeccable retourne `[]`. Aucun fichier SQL/migration, règle XP, Auth, snapshot ou protection n'a été changé. Les seuls éléments de production modifiés pour la proposition sont le rendu Dashboard et son module CSS ; les autres changements de `tools/ui-visual/` concernent build/parcours de preuve. `PRODUCT.md` décrit des faits produit explicitement inférés et précise que cette maquette n'engage pas les autres modules.

Le port habituel 31780 était occupé par un listener dont le propriétaire ne pouvait pas être vérifié par l'environnement. Après refus automatique de l'arrêt forcé de son PID, l'aperçu a été exécuté sur 31781 ; le listener 31780 n'a pas été touché. Le serveur Next 31781 est arrêté après les captures, le port est libre, et la stack Supabase fictive reste conservée. La stack personnelle, `lifequest-auth2`, les anciennes piles, migrations et données réelles n'ont reçu aucune opération. Aucun reset, staging, commit, push, merge ou déploiement.

**État : proposition Dashboard originale capturée sur desktop et mobile, prête pour validation utilisateur avant toute généralisation.**
