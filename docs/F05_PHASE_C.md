# F05 — Phase C : garde globale des données métier

Date : 12 octobre 2026. Phase C seule implémentée après validation de A/B. **F05 n'est pas annoncé corrigé intégralement** : récupération utilisateur et tests finaux restent à réaliser. Aucun changement des formules XP, des clés métier ou des backups v1/v2 ; aucune migration, dépendance, récupération automatique, commit ou push.

## 1. Mécanisme central

frontend/src/lib/storageAccess.ts expose des états stables checking, ready, recovery-required et unavailable. L'état serveur reste checking sans accès navigateur. Toute valeur présente dans lifequest-import-journal-v1 bloque : prepared, committed, ambigu, corrompu, version inconnue ou chaîne vide. Il n'est pas nécessaire d'interpréter un JSON éventuellement corrompu pour décider du blocage. Un accès refusé au journal produit unavailable, jamais ready.

assertBusinessStorageAccess lève une erreur explicite. withStorageLock acquiert le verrou lifequest-storage puis effectue cette vérification avant d'appeler le travail métier. Une opération déjà mise en attente est donc revérifiée lorsqu'elle obtient le verrou. Aucun drapeau global de contournement ni verrou imbriqué ajouté.

withImportStorageLock conserve le même verrou sans la garde métier : accès réservé au protocole import/reprise. importLifeQuest utilise cet accès, refuse toujours un journal précédent avant écritures et émet une notification dans finally, même après une préparation incertaine. Les primitives de journal A et le rollback B continuent à accéder aux chaînes brutes ; aucune action utilisateur de récupération ne les appelle dans cette phase.

## 2. Inventaire des points d'entrée protégés

| Données / opérations | Protection |
| --- | --- |
| Quêtes : création, modification, archivage, changement de fréquence | createQuestAction/updateQuestAction/changeQuests via withStorageLock ; lecture loadState et écriture saveState gardées. |
| Quêtes : complétion, XP/reçu/achievement | completeQuestAction sous verrou gardé ; primitives de progression gardées. |
| Arcs : ajout, suppression et retrait des associations | Les actions useQuestSystem passent par changeQuests gardé ; pas de nouvel écran ni règle. |
| XP d'activité | awardActivityXP sous verrou gardé ; ensureCoreSettings gardé ; saveState gardé. |
| Achievements : backfill automatique | syncAchievements sous verrou gardé ; pas d'effet normal monté lorsque la boundary bloque. |
| Stabilité / initialisation Core | getCoreSettings et ensureCoreSettings gardés ; applyDailyStability passe désormais sous verrou et retourne une Promise, test existant adapté avec await. Formule/stabilité inchangées. |
| Boss : création, progression, récupération, fin zéro XP F03 | createBossBattle/mutateExtra/progressBoss/claimBossReward et branche F03 couverts par le verrou ; loadExtra/saveExtra gardés. |
| Lab : Idea Vault, Creativity, Mind Map, Knowledge Library, Journal | mutateLab sous verrou gardé ; readLab/saveLab gardés. Aucun changement des modèles ou CRUD. |
| Focus : enregistrement et crédit | finishFocusSession utilise les mutations Lab/Core gardées à chaque étape ; reprise existante inchangée. |
| Focus : start/pause/resume/reset, label et réarmement | Fonctions write/action du FocusDungeon sous withStorageLock ; lecteur timer gardé. Le composant et son intervalle sont démontés pendant le blocage. |
| Profil / onboarding | readProfile gardé ; nouveau saveProfile centralise validation et mutation sous verrou. finish l'utilise ; l'onboarding n'est pas monté au démarrage bloqué. |
| Transition : initialisation du niveau et acquittement d'événement | HunterTransition utilise le verrou gardé ; lecteur de marqueur gardé. |
| Cinématiques vues | Acquittement sous verrou gardé ; clé et sessionSeen mis à jour uniquement dans le callback admis. Lecture gardée, abonnements communs. |
| Export métier | exportLifeQuest vérifie l'accès avant et après copie ; écran Core garde son verrou pendant l'export. Aucun journal inclus et aucune suppression pour contourner un refus. |
| Import | Accès de protocole distinct, règles et journal B conservés. Un journal existant n'est jamais écrasé. |

Les primitives synchrones saveState/saveLab/saveExtra/ensureCoreSettings vérifient elles-mêmes l'accès, même lors d'un appel direct. Elles ne prennent pas un deuxième verrou ; leurs appelants métier actifs recensés tiennent le verrou. Tout futur appelant devra respecter ce contrat. Les fixtures unitaires peuvent les utiliser directement avant les injections de défaillance.

Les préférences d'affichage du menu sont des états React en mémoire, pas des mutations métier locales. Les calculs purs (courbe XP, rangs, validation de backup) n'écrivent pas et restent utilisables dans les tests/protocoles. Ils ne doivent pas être alimentés par des lectures métier bloquées.

## 3. Lectures, hooks et démarrage

loadState, readLab, loadExtra, readProfile et getCoreSettings refusent les données pendant le blocage. Des revérifications après les lectures/validations évitent de rendre un résultat dont l'accès a changé pendant son chargement. Les erreurs ne sont pas assimilées à un nouveau compte.

useQuestSystem et useStoredData vérifient l'accès avant toute réutilisation du cache. Leurs stamps incluent une révision partagée, incrémentée lors des notifications et changements de journal. Le blocage invalide le stamp, retire les anciennes données du snapshot et rend ready false avec erreur. Le fallback vide est un état interne non prêt, jamais un compte utilisable. Une reprise de lecture autorisée recalcule les données, même si les chaînes métier sont identiques aux anciennes.

StorageAccessBoundary est placée dans le layout racine. SSR : message de vérification sans pages métier. Client : les pages ne sont montées qu'après ready. Lors d'une détection, elles sont démontées au profit d'un écran simple avec titre, role=alert et explication non sensible ; aucun bouton de réparation fictif. XP/quête/Boss partiels, vidéos et formulaires ne sont pas affichés comme compte valide.

Entry, ActivationPage et SystemShell revérifient l'état avant leurs redirections d'onboarding, en complément de la boundary et des erreurs des hooks. Profil absent pendant une récupération ne déclenche pas un nouvel onboarding. Les effets de backfill/initialisation ne sont pas montés et leurs points d'entrée restent gardés.

Le démontage suspend les effets mais ne persiste pas les brouillons React non sauvegardés ; leur conservation éventuelle devra être étudiée pour la future expérience de récupération. Les données et journaux déjà stockés restent intacts.

## 4. Onglets et synchronisation

Un abonnement partagé écoute l'événement existant lifequest-core-updated, storage, focus et visibilitychange lorsque le document redevient visible. La révision est invalidée avant notification des lecteurs. Les événements du protocole d'import notifient aussi son onglet d'origine.

Les événements mettent à jour l'interface et les caches, mais la sécurité des écritures repose sur la vérification sous verrou, pas sur leur délai de livraison. Une lecture déjà commencée ne peut pas être interrompue arbitrairement. LocalStorage ne devient pas une transaction de lecture multi-clés atomique : les revérifications et événements réduisent la fenêtre, sans garantie de panne physique ou d'atomicité de copies déjà commencées. Aucune stabilité exhaustive multi-navigateur n'est affirmée.

## 5. Tests et résultats

Huit nouveaux tests permanents dans storage-failures.test.cjs : variantes de journal et toutes familles de mutation/export ; lecture inaccessible ; mutation en attente revérifiée ; import/mutations sans deadlock ; abonnements storage/focus/visibility ; invalidation du store générique ; invalidation du store quêtes ; stabilité des snapshots et état serveur. Le test de la faille B est remplacé par son assertion de blocage C, sans retirer le scénario.

Les tests des hooks utilisent un substitut React pour examiner leurs getters/caches, pas un rendu React complet. Les anciens tests A/B qui analysent un état interrompu utilisent explicitement leurs snapshots bruts fictifs ; les lecteurs métier ne permettent plus cette observation. Le test de stabilité attend désormais la Promise.

Neuf parcours navigateur C : prepared, committed, JSON corrompu, version inconnue et chaîne vide dans deux vrais onglets ; démarrage avec XP/quête partiels et profil absent ; remontage des vues après remise en place de la fixture ; événement focus synthétique ; SecurityError de lecture injectée. Les storage events entre deux onglets sont natifs. Le focus/retour et les refus d'accès sont injectés, pas un test de veille réelle ou de changement de fenêtre OS. Les parcours B sont adaptés à l'écran bloquant ; les preuves de journal et le stockage sont encore vérifiés par le harnais isolé.

Résultats : npm.cmd run typecheck, npm.cmd run lint, npm.cmd test et npm.cmd run build réussis. **151 tests réussis ; 54 observations navigateur réussies**, dont F01/F02/F03/F04 et A/B. Aucun console.error ni erreur d'hydratation détecté par le runner. Une première exécution métier a révélé une ancienne assertion B utilisant encore readLab sur un journal présent ; elle a été remplacée par une lecture brute de la fixture et toute la suite a été réexécutée. Aucun défaut applicatif attribué à cette assertion.

Build et navigateur produisent leurs artefacts habituels ignorés. Aucun profil personnel utilisé. Les journaux fictifs sont retirés uniquement par le harnais entre scénarios indépendants ; ce n'est pas une récupération proposée dans l'application.

## 6. Fichiers de cette phase

Nouveaux :
- frontend/src/lib/storageAccess.ts
- frontend/src/components/system/StorageAccessBoundary.tsx
- docs/F05_PHASE_C.md

Modifiés :
- frontend/src/lib/storage.ts
- frontend/src/lib/questSystem.ts
- frontend/src/lib/hunterCore.ts
- frontend/src/lib/hunterMissions.ts
- frontend/src/lib/hunterLab.ts
- frontend/src/lib/profile.ts
- frontend/src/lib/useQuestSystem.ts
- frontend/src/lib/useStoredData.ts
- frontend/src/app/layout.tsx
- frontend/src/app/page.tsx
- frontend/src/app/activation/page.tsx
- frontend/src/components/system/SystemShell.tsx
- frontend/src/components/onboarding/OnboardingExperience.tsx
- frontend/src/components/hunter/FocusDungeon.tsx
- frontend/src/components/hunter/HunterTransition.tsx
- frontend/src/components/cinematics/LevelCinematicGate.tsx
- frontend/tests/lifequest012.test.cjs
- frontend/tests/storage-failures.test.cjs
- frontend/scripts/browser-check.cjs

## 7. Points non protégés et exigences D

Aucun point métier actif recensé n'est laissé sans garde de journal. L'accès brut au journal, à ses instantanés et le verrou de protocole sont volontairement exemptés : nécessaires à import/reprise, jamais des autorisations générales d'écriture pour de futurs composants. Le navigateur, DevTools, des scripts externes ou une ancienne version de l'application peuvent contourner ce code ; absence d'anti-triche ou de garantie cryptographique.

Phase D devra fournir des diagnostics précis sans divulgation involontaire, export brut séparé, actions de récupération vérifiées sous le verrou avec confirmation, maintien des preuves en cas de journal ambigu/corrompu/stockage inaccessible et actualisation de tous les lecteurs après restauration. La boundary devra intégrer ces actions sans réactiver les pages métier avant résolution confirmée.

Aucune réparation automatique, aucune suppression de journal pour débloquer un compte, aucun export diagnostic applicatif dans cette phase. Stockage toujours inaccessible : état bloqué maintenu, réévaluation au focus/visibilité ; pas de boucle d'écritures. Effacement du navigateur, panne électrique, corruption disque, anciennes versions simultanées, lecteurs d'écran humains et vrais appareils non certifiés par cette session.
