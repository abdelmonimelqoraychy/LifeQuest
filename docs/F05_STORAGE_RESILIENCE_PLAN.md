# LifeQuest — F05 : défaillances multi-clés et plan de reprise

Date : 12 octobre 2026. Statut : analyse et tests ; reprise persistante proposée, non implémentée. Ce document complète l’audit historique sans le réécrire.

## 1. Décision et périmètre

Le risque d’import partiel est effectivement reproduit. Le rollback actuel est utile mais insuffisant si une écriture de restauration échoue ou si le processus s’arrête avant le catch. L’instantané précédent n’existe qu’en mémoire ; aucun journal durable ne permet de retrouver automatiquement le compte précédent au redémarrage.

Les reprises de récompenses testées sont déjà idempotentes grâce aux reçus. Total XP, reçus et achievements sont enregistrés ensemble dans le JSON principal. Ajouter une transaction générale à toutes les récompenses n’est pas justifié par ces résultats.

La proposition minimale cible l’import : conserver durablement les instantanés avant/après et gérer l’opération inachevée sous Web Locks. Elle introduirait un format technique de journal et un contrat de lecture/reprise au démarrage. Elle requiert donc la validation demandée à l’étape 4 : « Si la solution nécessite de changer le format de stockage, de migrer les données ou de modifier plusieurs contrats métier, arrête-toi au plan technique et demande une validation avant ces modifications. »

**Aucun module de production ni méthode de stockage modifié. F05 n’est pas déclaré corrigé.** Les modifications concernent uniquement les tests et ce plan. Aucune installation, migration, Supabase, modification du design, commit ou push.

## 2. Opérations multi-clés recensées

Chemins relatifs à LifeQuest.

| Opération | Écritures et dépendances | Protection / risque |
| --- | --- | --- |
| Import | frontend/src/lib/hunterCore.ts, importLifeQuest : validation v1/v2 et F04 ; instantané en mémoire ; progression, Lab, Operations, Core, timer, profil, miroir legacy, transition, cinématiques | Un verrou couvre l’import. Rollback tenté sur toutes les clés après exception. Arrêt : instantané perdu. Rollback refusé : mélange de modules/comptes. |
| Crédit quête / activité | frontend/src/lib/questActions.ts, completeQuestAction ; hunterCore.ts, awardActivityXP : éventuelle initialisation Core → JSON principal → miroir legacy via saveState | Verrou. Core ne fait pas foi pour les XP. Échec avant le JSON principal : pas de crédit. XP/reçu/achievements sont dans la même écriture principale. |
| Édition quêtes / Arcs / backfill achievements | frontend/src/lib/questSystem.ts, saveState ; questActions.ts, changeQuests ; hunterCore.ts, syncAchievements : JSON principal → miroir legacy | Miroir best effort. Son échec conserve la modification principale ; divergence du miroir possible. |
| Boss positif | frontend/src/lib/activityRewards.ts, progressBoss/claimBossReward : Operations fin + événement + pending → Core/progression/miroir → Operations credited | Plusieurs acquisitions du verrou. Déduplication par ID ; vérification du Boss avant crédit et du reçu avant credited. État pending récupérable. |
| Boss historique zéro XP | activityRewards.ts, branche F03 : vérification sous verrou → seule clé Operations | Aucun crédit XP. resolved_without_xp soumis à F03/F04. Pas de transaction multi-clés ici. |
| Focus | activityRewards.ts, finishFocusSession ; frontend/src/components/hunter/FocusDungeon.tsx : Lab pending → Core/progression/miroir → Lab credited → timer réarmé | Plusieurs verrous ; ID stable et reçu permettent la reprise. Échec après crédit ne doit pas redonner d’XP. |
| Transition rang / évolution | frontend/src/components/hunter/HunterTransition.tsx, complete : événement Operations → niveau acquitté dans transition | Un verrou ; événement à ID déterministe. Échec d’acquittement peut faire réapparaître la transition ; pas de récompense XP. Cas non injecté ici. |
| Onboarding / CRUD Lab / timer seul / cinématique vue | OnboardingExperience.tsx, hunterLab.ts, FocusDungeon.tsx, LevelCinematicGate.tsx | Écritures unitaires dans chacune de ces opérations. Elles peuvent néanmoins être observées pendant un import. |

Web Locks sérialise les mutations participantes, pas les lecteurs React, ni la durabilité disque. Les hooks useQuestSystem.ts et useStoredData.ts écoutent les événements storage. Leur observation d’un état intermédiaire reste un risque de lecture à traiter avec la reprise ; aucun défaut de lecture concurrente n’a été reproduit ici.

## 3. Tests et preuves

frontend/tests/storage-failures.test.cjs charge le vrai code TypeScript dans un environnement VM, stockage fictif et verrou simulé. Les comptes A/B sont synthétiques. Ces dix tests caractérisent le code actuel ; une assertion qui constate un état partiel ne signifie pas que le problème est corrigé.

| Scénario | Observation |
| --- | --- |
| Import normal | Toutes les valeurs entrantes conservées. |
| Exception avant première écriture | Rollback réussi ; valeurs initiales identiques. |
| Exception après première écriture | Rollback réussi ; restauration complète. |
| Exception au milieu, sur profil | Rollback réussi ; nouvelle tentative applique le fichier complet. |
| Exception Lab puis refus du rollback principal | Erreur restauration incomplète ; progression nouvelle avec ancien Boss credited sans reçu. État mixte retrouvé dans un nouveau contexte VM. |
| Arrêt du processus enfant après écriture Lab | Sortie volontaire 42, sans exception ; snapshot fictif sur fichier conservé. Reprise : progression/Lab B et profil/Boss A. Import manuel cohérent rétablit un compte complet. |
| Statut Boss refusé après crédit | Reçu/XP conservés, pending ; reprise dans un nouveau contexte : credited et un seul crédit. |
| Statut Focus refusé après crédit | Session pending et reçu conservés ; reprise : une session, un crédit. |
| Échec du crédit principal après initialisation Core | Aucun XP/reçu ; tentative suivante créditée une fois. |
| Échec du miroir legacy | Progression principale créditée, miroir ancien ; reprise sans double crédit. |

L’arrêt du processus enfant est une vraie terminaison volontaire du processus de test, **pas un crash du stockage Chrome**. Son fichier représente une persistance fictive ; ce n’est ni une base applicative ni un test de panne électrique. Répertoire temporaire créé pour ce test et nettoyé sans suppression récursive.

frontend/scripts/browser-check.cjs ajoute quatre observations F05 dans un profil Chrome jetable : exception avant écritures ; rollback après première écriture ; rollback impossible avec erreur explicite et état partiel ; restauration manuelle du snapshot connu puis rechargement. Il s’agit d’exceptions injectées, sans fermeture brutale de Chrome et sans profil personnel.

Résultats finaux : typecheck, lint et build réussis ; npm test : 98 tests réussis, dont les dix nouveaux F05 ; suite navigateur complète : 42 observations réussies, dont F01/F02/F03/F04 et les quatre F05. Aucun console.error ni erreur d’hydratation détecté par le runner.

Les scripts npm ont été lancés via npm.cmd car npm.ps1 était bloqué par la politique PowerShell ; cette politique reste inchangée. ESLint a initialement refusé un nom de variable du nouveau harnais, corrigé avant la réussite finale. Le premier essai navigateur F05 a échoué car la navigation retirait l’injection de panne ; le placement du hook a été corrigé et toute la suite réexécutée avec succès. Ces défauts du harnais ne sont pas des défauts applicatifs.

## 4. Proposition à valider : journal limité aux imports

### Format technique proposé

Nouvelle clé dédiée, par exemple lifequest-import-journal-v1, non ajoutée aux backups métier. Champs : version technique 1, identifiant d’opération, phase prepared ou committed, instantané brut before, instantané cible after, liste bornée de clés LifeQuest autorisées. Conserver exactement les chaînes JSON/null : aucun recalcul, reçu inventé, fusion ou normalisation.

La cible after est validée selon les formats v1/v2 et F04 avant toute journalisation. Une ancienne donnée locale invalide peut être conservée comme chaîne brute dans before ; cette conservation n’autorise pas à l’utiliser comme compte valide.

### Séquence envisagée

1. Sous le verrou actuel, refuser un nouvel import tant qu’un journal existant n’est pas traité.
2. Valider la cible, notamment F03/F04, puis capturer toutes les clés concernées.
3. Écrire prepared avant la première modification des modules. Quota/refus à cette étape : zéro modification du compte et erreur explicite.
4. Appliquer la cible et vérifier l’égalité des valeurs stockées. Marquer committed après application complète seulement.
5. Supprimer le journal après commit. Si le nettoyage échoue, garder la preuve pour terminer à la reprise, sans annoncer un rollback.
6. En cas d’exception avant commit, tenter le rollback depuis before. Supprimer le journal uniquement après vérification complète. Si rollback impossible : garder les preuves et bloquer les nouvelles mutations.

### Reprise contrôlée

Détecter le journal au démarrage et après événements storage **avant de lire les modules comme un compte utilisable**, y compris les caches des hooks. Reprise protégée par le même verrou. Ne pas initialiser un compte vide pendant cette détection.

- prepared : état provisoire non exploitable ; proposer explicitement une reprise restaurant l’instantané précédent. Une interruption après toutes les écritures mais avant commit reste non confirmée et suit cette règle.
- committed : vérifier que chaque valeur correspond à la cible et terminer le nettoyage ; aucun crédit XP supplémentaire.
- Journal illisible, version inconnue, clé interdite ou valeur actuelle différente de before et after : état ambigu. Aucun écrasement automatique ; préserver journal/modules, diagnostic et export de secours avant décision manuelle.
- Stockage toujours indisponible : pas de boucle infinie, pas de faux succès. Erreur et nouvelle tentative contrôlée ; bloquer les actions susceptibles d’écraser l’état partiel. Prévoir un export brut distinct du backup métier, contenant journal et valeurs observées.

Le journal ne rend pas localStorage atomique : il rend l’opération identifiable/récupérable et empêche de présenter un mélange de modules comme un compte finalisé. Un journal seul, sans garde des lectures/mutations, ne suffit pas.

## 5. Compatibilité et changements proposés après validation

Conserver les clés métier, formats backup v1/v2, IDs Boss/Focus et reçus historiques. Aucun recalcul des anciens XP. Le rollback restaure littéralement le compte précédent ; il ne soustrait pas des récompenses individuellement. Garder la reprise idempotente Boss/Focus, le statut F03 et la validation F04.

Ne pas exporter un journal incomplet dans un backup annoncé valide. Un export de secours doit être distinct et explicitement diagnostique. Les anciennes versions ignoreront le journal et pourront continuer à écrire : l’utilisation simultanée des versions doit être traitée avant publication de cette protection.

Fichiers envisagés : module de journal ; hunterCore.ts (import/export) ; storage.ts (garde mutations) ; snapshots useQuestSystem.ts et useStoredData.ts et lectures directes ; écran Core pour reprise/export de secours. Pas de changement des formules ou modèles des récompenses.

Complexité moyenne à élevée : la difficulté est le blocage fiable dans tous les onglets. Petites tâches proposées : validation du journal et tests ; protocole import ; garde/reprise des lectures ; interface de reprise ; tests processus/navigateur. Le nouveau contrat persistant justifie la validation préalable.

## 6. Alternatives et limites

Doubler le rollback mémoire ou changer l’ordre des clés ne résout pas un arrêt du processus. Un JSON unique ou IndexedDB nécessiterait une migration plus large ; non proposé ici. Supabase n’est pas nécessaire pour traiter ce risque local.

Non reproduits : crash natif Chrome entre écritures localStorage, arrêt électrique, corruption/quota du futur journal, lecture transitoire dans un autre onglet, arrêt au réarmement Focus ou à l’acquittement de transition. Ces cas ne sont pas annoncés testés.

Même avec un journal : aucune garantie contre effacement du stockage navigateur, changement d’origine, dysfonctionnement disque, modification externe ou corruption simultanée des données et du journal. Le journal augmente le volume temporaire et peut refuser un import faute de quota. Garder l’export avant import.

## 7. Modifications effectivement réalisées

- frontend/tests/storage-failures.test.cjs : dix tests permanents de défaillance/reprise.
- frontend/scripts/browser-check.cjs : quatre scénarios F05 ; F01/F02/F03/F04 conservés.
- docs/F05_STORAGE_RESILIENCE_PLAN.md : preuves, limites et plan à valider.

Le stockage applicatif reste inchangé. Les tests réussis ne certifient pas sa durabilité. Validation du plan nécessaire avant implémentation du journal.
