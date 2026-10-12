# F05 — Validation finale de la résilience du stockage

Date : 12 octobre 2026. Phase E uniquement, sur le workspace actuel, selon AGENTS.md et les plans A à D. Aucun profil personnel, donnée personnelle, installation, migration, changement RPG, commit ou push. Le code applicatif n'a pas été modifié dans cette phase.

## 1. Conclusion

**F05 est partiellement corrigé au sens global du risque de stockage. La détection, le blocage et la reprise d'un journal conservé sont validés dans Chrome pour les scénarios ci-dessous. LifeQuest convient à une bêta personnelle contrôlée avec export externe régulier ; aucune garantie d'atomicité native ou de durabilité disque immédiate n'est démontrée.**

Les contrôles TypeScript, ESLint, build et 170 tests passent. La suite navigateur complète passe avec 63 observations. Le nouveau harnais vérifie neuf frontières par terminaison forcée du processus Chrome et une fermeture du seul onglet d'import. Avec une pause de sept secondes à la frontière, les neuf terminaisons complètes passent et les résultats finaux correspondent exactement aux instantanés attendus. La fermeture d'onglet est évaluée séparément : elle peut laisser l'import se terminer avant fermeture et ne prouve pas un arrêt au point prévu.

**Trois essais supplémentaires avec pause de deux secondes échouent à l'assertion exigeant la présence du journal après redémarrage.** Dans ces essais, l'ancien compte, ses 450 XP et son reçu sont tous conservés exactement ; le nouveau journal et les écritures récentes de l'import ne sont pas retrouvés. Aucun état métier partiel sans journal n'a été reproduit. Ce résultat interdit néanmoins d'affirmer que l'enregistrement suivi d'une lecture de contrôle assure une écriture durable du journal avant les autres clés.

Une interruption électrique, une corruption disque ou une suppression du stockage ne sont pas équivalentes à ces tests et restent hors garantie. Le délai de sept secondes appartient au harnais, **pas à l'application** ; l'ajouter aux imports ne constituerait pas une solution de durabilité.

## 2. Audit du protocole actif

| Invariant | Code et constat |
| --- | --- |
| Cible vérifiée avant écriture | `frontend/src/lib/hunterCore.ts`, `validateBackupRecords` et `importLifeQuest` : formats v1/v2, modules, règles F03/F04 avant préparation. Aucun reçu inventé, aucune fusion des comptes. |
| Journal préalable vérifié | `frontend/src/lib/importJournal.ts` : instantanés bruts copiés, liste de clés limitée, version/champs validés, préparation avec lecture de contrôle. Tout journal préexistant bloque l'import, même vide ou corrompu. La vérification porte sur le stockage observable, pas un fsync. |
| Application/commit | `hunterCore.ts` : contrôles des valeurs admissibles, vérification de la cible complète avant `committed`. Un commit confirmé n'est pas annulé en cas d'échec de nettoyage. |
| Rollback incertain | `hunterCore.ts` : contrôle du journal et des valeurs avant restauration ; conservation des preuves si résultat ambigu, lecture impossible, rollback ou nettoyage non confirmé. |
| Reprise explicite | `frontend/src/lib/importRecovery.ts` : nouveau diagnostic sous verrou, confirmation, comparaison du journal attendu, restauration `before` pour `prepared`, suppression seule pour `committed` si tout `after` est confirmé. Répétition vérifiée sans écriture supplémentaire. |
| Blocage de tout journal présent | `frontend/src/lib/storageAccess.ts` et `frontend/src/lib/storage.ts` : garde relue sous le verrou des mutations, états absent/présent/inaccessible, absence de repli sans Web Locks. |
| Aucun affichage métier partiel | `frontend/src/components/system/StorageAccessBoundary.tsx` : vérification initiale puis démontage des pages métier, maintien du blocage pendant l'action locale, retour après résolution. |
| Caches et notifications | `frontend/src/lib/useStoredData.ts`, `useQuestSystem.ts` : garde de lecture, révision partagée et invalidation sur notifications/storage/focus/visibilité. Les erreurs de stockage ne créent pas automatiquement un compte vide. |
| UI et confidentialité | `frontend/src/components/system/RecoveryPanel.tsx` : actions selon diagnostic, confirmation Modal, protection locale contre doubles actions, codes/messages fixes et export distinct filtré. Aucun contenu brut affiché. |

Recherche des accès `localStorage` et appels de mutation dans `frontend/src` : les chemins actifs de quêtes, XP, Boss, Focus, Lab, profil, transition et cinématiques passent par les gardes et/ou le verrou métier. Les fonctions synchrones `saveState`, `saveLab`, `saveExtra` et `ensureCoreSettings` disposent de la garde, mais ne prennent pas elles-mêmes un verrou ; leurs appelants actifs utilisent le verrou. De futurs appelants doivent respecter ce contrat.

Les accès bruts dans l'import, le journal et la récupération sont intentionnels : ils ne peuvent pas utiliser les lecteurs métier bloqués. Les accès de navigation/identification de compte sont gardés. Aucun contournement involontaire actif n'a été identifié dans ce parcours de code ; ce n'est pas une preuve contre un script extérieur ou une ancienne version de l'application.

Les opérations Boss/Focus restent des séquences rejouables grâce aux reçus stables, pas des transactions journalisées d'import. Un statut `pending` peut rester après crédit ; sa reprise utilise le reçu existant. Le miroir legacy n'est pas la référence XP. Les tests dédiés aux échecs de statut et de miroir passent. Les métadonnées d'évolution/cinématique ne bénéficient pas d'une transaction native multi-clés.

## 3. Méthode des interruptions réelles

Nouveau harnais permanent : `frontend/scripts/storage-crash-check.cjs`. Il crée un profil UUID dans `.browser-check`, prépare exclusivement une fixture synthétique, ferme normalement Chrome et le relance pour confirmer que la fixture initiale est bien conservée. Elle contient un solde historique de 450 XP et un reçu Boss historique orphelin légitime de 30 XP. La cible d'import contient 900 XP, le même reçu et un marqueur de niveau cohérent. Il ne s'agit pas d'une récompense attribuée par le test.

Les formulaires réels de l'application de production déclenchent import/récupération. Un wrapper de test de `Storage.prototype` appelle les méthodes natives, puis `debugger` aux frontières choisies. Aucun throw n'est injecté pour ces scénarios. Le second onglet reste actif et confirme le blocage de l'UI avant l'arrêt. Node exécute `taskkill /PID <PID créé par ce harnais> /T /F`, attend la sortie du processus propriétaire, puis relance Chrome avec le même profil. Aucun arrêt par nom générique, aucun PID de navigateur personnel ciblé. Le scénario `tab-loss` ferme seulement la cible CDP de l'onglet A.

Les pauses valent sept secondes pour la matrice principale, deux secondes pour les trois essais rapides. Ce sont des délais expérimentaux de stabilisation, sans garantie. Les lectures brutes du harnais ne sont pas des lecteurs métier accessibles à l'utilisateur.

Les fichiers `pre-termination.json` et `post-restart.json` des profils conservent les preuves fictives. Rapports générés : `.browser-check/e-crash-report-7000.json`, `e-crash-report-7000-tab-loss.json`, `e-crash-report-2000.json`, `e-fast-assessment.json`. Ils sont des artefacts ignorés, pas des données utilisateur ni des backups de production.

## 4. Matrice des frontières — pause de sept secondes

| Frontière réelle | Après redémarrage / fermeture de A | Action et résultat vérifiés |
| --- | --- | --- |
| Avant création du journal | Journal absent, ancien compte présent | Aucune récupération requise ; toutes les clés exactement `before`. |
| Après écriture `prepared` | Journal valide `prepared` | Écran bloquant, confirmation puis restauration exacte de `before`. |
| Après première écriture métier | Journal `prepared`, valeurs admissibles | Pages métier masquées, restauration exacte de `before`. |
| Au milieu de l'import (troisième `setItem` métier) | Journal `prepared`, valeurs admissibles | Restauration exacte de `before`. Les modules inchangés restent aussi vérifiés. |
| Toutes les écritures effectuées, avant commit | Journal `prepared`, cible appliquée | Restauration de `before`, aucune assimilation à un commit réussi. |
| Après écriture `committed`, avant nettoyage | Journal valide `committed`, cible complète | Confirmation de finalisation ; suppression seule du journal ; exactement `after`. |
| Pendant restauration, après première valeur restaurée | Journal `prepared`, restauration partielle admissible | Nouvelle confirmation après relance ; exactement `before`. |
| Pendant finalisation, juste avant suppression | Journal `committed`, `after` conservé | Nouvelle confirmation ; suppression seule ; exactement `after`. |
| Pendant nettoyage, juste après suppression native | Journal absent, cible présente | Retour métier ; exactement `after`. Pas de retour à l'ancien compte. |
| Onglet A fermé après première écriture, B reste ouvert | Le journal peut subsister, ou l'import finir pendant la fermeture | Si journal présent : récupération vers `before`. Si journal absent : exigence de tout `after`, aucune restauration. La fermeture CDP ne garantit pas l'interruption de l'import. |

Les neuf premières lignes terminent réellement l'arbre du processus navigateur de test. La dixième est une fermeture d'onglet, pas une terminaison du navigateur. Pour les journaux persistants, phase/structure, instantanés, valeurs admissibles, absence de formulaires métier, action autorisée et résultat final sont contrôlés. Les huit clés sont comparées au caractère près, XP et liste de reçus inclus ; aucune duplication ni attribution de récompense par la récupération. Après résolution, l'interface métier est remontée et les valeurs sont encore comparées.

Une méthode native `setItem`/`removeItem` est synchrone : interruption exactement *dans* son implémentation interne non reproductible ici. Les tests se placent immédiatement avant ou après l'appel natif. Une coupure OS, une panne électrique ou un crash matériel n'ont pas été effectués.

## 5. Matrice rapide — pause de deux secondes et fixture initiale durable

| Frontière | Résultat de l'assertion journal | Contrôle complémentaire des données |
| --- | --- | --- |
| Après `prepared` | Échec : journal absent après relance | Huit clés exactement `before`, 450 XP et un reçu conservés. |
| Après première écriture métier | Échec : journal absent après relance | Huit clés exactement `before`, 450 XP et un reçu conservés. |
| Au milieu des écritures | Échec : journal absent après relance | Huit clés exactement `before`, 450 XP et un reçu conservés. |

Commande terminée avec code 1 ; ces échecs ne sont pas présentés comme réussites. Le contrôle complémentaire compare chaque valeur brute de `post-restart` à `journal.before` capturé avant terminaison et est enregistré dans `e-fast-assessment.json`. Aucune restauration n'a été forcée sans journal. Aucun état partiel sans journal ni perte d'un reçu préexistant n'a été observé dans ces trois cas.

Interprétation : les écritures visibles avant terminaison ne sont pas nécessairement retrouvées sur disque après la terminaison forcée. Ces observations ne démontrent ni un ordre de persistance garanti ni toutes les combinaisons possibles. Le risque d'une persistance partielle sans journal demeure non reproduit et non exclu. Un changement de stockage ou de garantie durable nécessiterait un plan et une validation séparés ; aucun délai artificiel ou nouvelle migration n'est ajouté dans E.

## 6. Matrice complémentaire et multi-onglets

| Scénario | Preuve exécutée et résultat |
| --- | --- |
| Import normal v1/v2 ; anciens soldes et F03/F04 | Tests métier permanents et suite Chrome : réussite, XP/reçus préservés, incohérences explicites refusées avant écriture. |
| Échec avant préparation, quota journal, écriture silencieusement ignorée | Stockage fictif/exception JS ; contrôle d'absence d'écriture métier et maintien des données : réussite. Quota journal aussi injecté dans Chrome. |
| Échec première/milieu écriture, rollback réussi/impossible | Tests fictifs et exceptions Chrome : réussite des assertions de rollback ou conservation du journal et blocage. Pas une vraie saturation du disque. |
| Commit incertain, nettoyage refusé/lecture de contrôle impossible | Tests fictifs ; nettoyage refusé également Chrome : réussite, aucune fausse réussite ni retour silencieux au compte précédent. |
| Journaux `prepared`/`committed`/corrompu/vide/inconnu | Tests A/C/D et Chrome : blocage, données conservées, seules actions admissibles proposées. |
| Modifications externes/clé supplémentaire/valeur ambiguë | Tests fictifs et modification brute de fixture dans Chrome : refus sans écrasement. Aucune réparation automatique. |
| Lecture refusée | SecurityError simulée en mémoire et Chrome : état bloqué, messages non sensibles, aucune initialisation de compte. |
| Reprise répétée, journal changé après diagnostic | Tests D : résultat sans modification supplémentaire ou refus conservateur. |
| Deux confirmations concurrentes | Deux onglets Chrome réels, confirmations mises en attente sur le même verrou : une résolution, valeurs conservées, rafraîchissement de l'autre onglet. |
| Import A en cours, B tente de poursuivre | Nouveau harnais : événement storage natif, écran de récupération dans B et absence de formulaires/actions métier disponibles. Appels de mutation en attente refusés sous verrou : test unitaire C conservé. Aucun clic métier réellement exécuté après disparition du formulaire. |
| Interruption de A, B survivant | Fermeture CDP de A testée ; un essai a terminé l'import pendant fermeture, donc l'assertion de présence du journal a échoué. Cas distinct d'un arrêt forcé du renderer : celui-ci n'est pas testé ici. La terminaison de tout Chrome coupe les deux onglets dans les autres scénarios. |
| Retour au premier plan | Événement focus synthétique dans Chrome et événements focus/visibility dans le harnais unitaire : réussite. Pas de manipulation physique d'une fenêtre OS ni de veille réelle. |
| Export diagnostic sensible | Téléchargement Chrome réel avec token fictif dans une clé étrangère et journal inconnu ; tests unitaires credentials imbriqués : exclusion/omissions annoncées, aucun changement des originaux, aucun contenu privé visible. |
| Cohérence Boss/Focus/reçus et pas de double crédit | 170 tests et parcours navigateur Boss/Focus/F03/F04 : réussite. Les vrais arrêts Chrome ajoutés portent sur l'import/reprise ; aucun nouvel arrêt forcé au milieu d'une récompense Focus/Boss. |

## 7. Non-régression et environnement

Commandes exécutées depuis `frontend` avec `npm.cmd` sous PowerShell :

| Contrôle | Résultat |
| --- | --- |
| `npm.cmd run typecheck` | Code 0 |
| `npm.cmd run lint` | Code 0 ; périmètre src/tests |
| `npm.cmd test` | 170 tests, 170 réussites, zéro échec |
| `npm.cmd run build` | Code 0, compilation et génération des routes réussies |
| `LIFEQUEST_TEST_URL=http://127.0.0.1:3102 node scripts/browser-check.cjs` | Code 0, 63 observations, zéro erreur console/runtime/hydratation détectée |
| `node scripts/storage-crash-check.cjs`, URL locale 3102, délai 7000 ms | 9 terminaisons complètes réussies ; assertion initiale du scénario de fermeture d'onglet échouée, code 1 |
| Même harnais corrigé, `LIFEQUEST_CRASH_STAGES=tab-loss`, délai 7000 ms | Rejeu code 0 ; import terminé pendant fermeture, tout `after` exactement conservé, aucun journal, B rafraîchi. Ce n'est pas une preuve d'arrêt du renderer au milieu de l'import. |
| Même harnais, `LIFEQUEST_CRASH_SETTLE_MS=2000`, `LIFEQUEST_CRASH_STAGES=prepared,first-write,middle-write` | 3 assertions de durabilité du journal échouées, code 1 ; anciens comptes vérifiés intacts |
| `node --check` des deux scripts navigateur | Réussite |

La suite complète conserve F01/F02/F03/F04 et A/B/C/D : création volontaire de titres identiques, soumissions concurrentes, erreur/reprise, édition, parent Mind Map supprimé inter-onglets, Boss historiques zéro XP, imports incohérents refusés, quêtes/XP/niveaux/achievements et Focus. Elle parcourt dashboard, Lab, export/import et garde d'onboarding. Elle amorce le profil par fixture ; **le parcours complet de création du Hunter à l'onboarding n'a pas été rejoué pendant E**, contrairement à l'audit historique. Aucun nouveau test Arcs, lecteur d'écran ou durée Focus réelle de 25 minutes n'est revendiqué.

Chrome installé : 154.0.8037.98 sous Windows ; Node v24.19.0 ; serveur Next de production localhost. Firefox/Safari non trouvés dans PATH/emplacements standard ; cache de navigateurs Playwright absent. Aucune installation entreprise. Firefox et Safari/WebKit **non testés**, pas déclarés validés.

## 8. Accessibilité et confidentialité

Nouveau contrôle permanent Chrome dans `browser-check.cjs` : préférence `prefers-reduced-motion: reduce` émulée, durées CSS des boutons vérifiées, titre et action exposés dans l'arbre d'accessibilité. Confirmation au clavier, confinement de Tab et double clic couverts par D ; Escape du composant Modal couvert par la suite existante. Captures mobile 375 px de l'écran et de la confirmation inspectées ; aucun débordement horizontal détecté par les contrôles de la suite.

Messages d'erreur/récupération et absence de contenus privés contrôlés par les tests D/C. Ce n'est ni un audit complet de contrastes ni une certification WCAG. Aucun lecteur d'écran humain, smartphone physique ou navigateur alternatif utilisé. Les styles réduisent les animations ; toute l'expérience animée RPG n'a pas été retestée sous cette préférence.

Web Locks est obligatoire pour les mutations/imports/récupérations du protocole. En son absence, ces opérations refusent de continuer ; aucun fallback non protégé. Un contexte HTTPS/localhost et un navigateur compatible restent nécessaires. La présence de localStorage lisible sans Web Locks ne rend pas les opérations mutables sûres.

L'export filtre les clés étrangères et les credentials reconnus. Il peut omettre du brut corrompu et ne peut reconnaître universellement un secret arbitraire dans un texte libre. Les messages visibles ne dévoilent pas les données brutes ; le diagnostic reste un fichier privé, distinct des backups métier.

## 9. Échecs de mise au point et traçabilité

Les premières exécutions du nouveau harnais ont échoué : fixture de marqueur de niveau incohérente (mise à jour normale par l'application) ; accès trop tôt à `about:blank` (Web Locks/localStorage indisponibles) ; nettoyage interprétant comme échec les PID enfants déjà terminés par taskkill. Corrections uniquement dans le script : marqueurs cohérents, attente explicite de l'origine/document et vérification de sortie du processus propriétaire. Une fixture fraîche a aussi disparu entièrement après arrêt rapide ; une fermeture/reprise normale est désormais obligatoire avant l'essai pour distinguer la persistance du compte initial des nouvelles écritures d'import.

Ces essais initiaux ne servent pas de preuves de bug applicatif. La fermeture CDP d'un onglet a aussi laissé l'import se terminer avant fermeture (900 XP et aucun journal), ce qui a invalidé une assertion trop stricte exigeant toujours un journal. Le script distingue désormais ces deux issues sans écrasement : `before` après récupération, ou tout `after` après import effectivement terminé. Son nettoyage utilise un onglet encore connecté et vérifie la sortie du Chrome créé ; un processus fictif laissé ouvert par l'ancien nettoyage a été terminé après vérification de son PID et de son profil exact.

Les trois échecs rapides finaux, en revanche, surviennent avec origine vérifiée et compte initial déjà relu après fermeture normale : ils sont conservés dans le bilan, pas effacés par les neuf réussites du test à sept secondes.

Fichiers de E uniquement :

- `frontend/scripts/storage-crash-check.cjs` créé : matrice d'arrêts/reprises reproductible et preuves locales.
- `frontend/scripts/browser-check.cjs` modifié : contrôle permanent reduced motion/arbre d'accessibilité, suite précédente conservée.
- `docs/F05_FINAL_VALIDATION.md` créé : ce rapport.

Aucune correction du code applicatif n'était justifiée comme anomalie mineure locale. Le dépôt contenait déjà de nombreuses modifications des phases précédentes ; elles ne sont ni annulées ni attribuées à E. Les profils/rapports/captures de test restent sous `.browser-check`, ignoré, sans suppression récursive du stockage personnel. Le serveur local lancé pour cette session est arrêté à la fin.

## 10. Risques restants et suite proposée

La lecture de contrôle localStorage ne remplace pas une transaction disque ; le journal et les comptes partagent le même domaine de défaillance. Journal supprimé par l'utilisateur, données effacées, corruption de profil ou ancien client non coopératif : détection/reprise non garanties. Les reçus assurent l'idempotence dans les états conservés, pas la récupération de fichiers perdus sur disque. Comparaisons JSON exactes conservatrices, pas d'authenticité cryptographique. Deux captures du diagnostic n'excluent pas un acteur externe non coopératif.

Pour la bêta : conserver des exports métier externes, rester sur la même origine HTTPS/localhost, utiliser le Chrome testé, expliquer que la récupération n'est proposée que lorsque les preuves sont intactes. Les erreurs ambiguës restent bloquées ; aucune suppression de journal pour forcer l'accès. Cette recommandation ne vaut pas approbation de production publique.

Plan séparé si une durabilité plus forte devient nécessaire : reproduire la matrice à délai nul et sous contraintes disque dans une machine/profil jetable ; définir précisément la garantie exigée ; comparer une transaction native IndexedDB à la persistance locale actuelle et à une restauration serveur validée. Changement de stockage/contrat, migration ou politique de résolution d'ambiguïtés nécessitent validation avant implémentation. Aucun de ces changements n'est engagé ici.

**Verdict final : F05 partiellement corrigé ; protocole applicatif de reprise validé lorsque le journal subsiste, durabilité immédiate du stockage non validée et assertions rapides échouées. Phase E terminée ; aucune phase supplémentaire lancée.**
