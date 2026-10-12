# F05 — Phase D : récupération contrôlée des imports

Date : 12 octobre 2026. Phase D uniquement. Phases A/B/C conservées. Aucun changement des formules RPG, des clés métier, du journal v1 ou des backups v1/v2 ; aucune dépendance ajoutée, migration, réinitialisation, commit ou push.

## 1. Actions proposées

| État observé | Action disponible après confirmation |
| --- | --- |
| `prepared`, journal valide, chaque valeur correspond à `before` ou `after`, cible valide | Restaurer exactement `before`, y compris les clés initialement absentes. Même lorsque tout `after` est présent, cet import n'est pas considéré comme confirmé. |
| `committed`, toutes les valeurs correspondent exactement à `after`, cible valide | Finaliser : conserver les données importées et retirer seulement le journal. |
| Valeur étrangère aux instantanés, clé LifeQuest supplémentaire non couverte, cible incohérente | Aucune restauration/finalisation. Réévaluation et export diagnostic si les lectures sont possibles. |
| Journal corrompu, incomplet, clé interdite ou version inconnue | Aucune suppression ni réparation du journal. Diagnostic et export filtré seulement. |
| Stockage illisible ou verrou indisponible | Aucune écriture ; message explicite et nouvelle évaluation possible. Aucun export non vérifiable. |

Les messages exposent des codes fixes (`D_PREPARED`, `D_COMMITTED`, `D_AMBIGUOUS`, etc.), jamais les contenus bruts, titres privés ou identifiants de Boss/Focus. Le détail historique F03/F04 reste dans les données, sans être rendu dans cet écran.

## 2. Moteur et protection des données

`frontend/src/lib/importRecovery.ts` sépare diagnostic, récupération et export de l'interface. Les trois opérations prennent le verrou existant `lifequest-storage` via `withImportStorageLock`. Le diagnostic partagé F03/F04 est réutilisé grâce à `validateBackupRecords`, extrait sans changement de règles de `importLifeQuest` dans `hunterCore.ts`.

La proposition affichée n'autorise pas à ignorer les contrôles suivants. Après confirmation explicite, le moteur relit et compare le journal sous verrou. Une modification du journal ou des données invalide l'action. Il refuse aussi toute clé métier autorisée présente mais non couverte par le journal. Pour `prepared`, il revérifie le journal et la valeur admissible avant chaque écriture, puis vérifie la valeur restaurée. Les valeurs déjà égales à `before` ne sont pas réécrites. Pour `committed`, aucune valeur métier n'est écrite. Une inspection finale et la vérification de l'instantané cible précèdent le nettoyage vérifié par le moteur A.

Le contenu de `before` est volontairement restauré comme instantané brut : il peut contenir une ancienne donnée déjà invalide avant l'import. Le normaliser ou le supprimer serait une perte silencieuse. En revanche, `after` doit respecter la validation actuelle de l'import, incluant F03/F04. Les anciens soldes XP sans historique détaillé et `resolved_without_xp` restent soumis aux mêmes règles de compatibilité. Une récupération ne fabrique aucun reçu, ne crédite aucun XP et ne fusionne aucun compte.

Une nouvelle confirmation après résolution (ou deux onglets en attente) est sans effet si l'instantané final est toujours exactement celui attendu et qu'aucune clé supplémentaire n'existe. Sinon, elle est refusée. Le journal n'est jamais remplacé par la récupération.

## 3. Interface et échecs

`RecoveryPanel` remplace l'écran bloquant minimal de la Phase C. Il reprend le style sombre/cyan existant, un titre clair, l'état, le diagnostic, la réévaluation, l'export et les seules actions sûres. Le composant `Modal` existant fournit la confirmation avec annulation, confinement du focus et fermeture par Escape. Les boutons sont désactivés pendant le traitement ; un verrou synchrone en mémoire empêche deux actions locales quasi simultanées.

La boundary garde les pages métier démontées pendant l'action, même si la suppression du journal déclenche une notification avant le retour de la Promise. La garde C continue de refuser les mutations métier lorsque le journal existe. Les notifications existantes invalident les hooks/caches ; le retour aux pages affiche des données relues. Les événements `storage` entre onglets provoquent une nouvelle inspection.

Un refus d'écriture conserve le journal et les instantanés : les valeurs déjà restaurées restent admissibles pour une tentative ultérieure. Aucune boucle de réparation automatique n'est lancée. Un nettoyage refusé conserve les données vérifiées sans revenir au compte précédent. Si la suppression a eu lieu mais que sa lecture de contrôle échoue, l'opération signale une incertitude, jamais un succès. La boundary affiche un message d'erreur même si un accès ultérieur confirme l'absence du journal.

## 4. Export diagnostic local distinct

Le fichier `lifequest-recovery-diagnostic.json` utilise le format `lifequest-recovery-diagnostic` version 1, distinct de `lifequest-backup`. Il n'est pas destiné à être importé comme une sauvegarde. L'écran avertit qu'il peut contenir des données personnelles. Blob et téléchargement navigateur uniquement : aucun envoi automatique au serveur.

La capture sous verrou lit seulement les clés autorisées LifeQuest et le journal, jamais les autres clés du stockage. Elle compare deux captures complètes (clés, valeurs et journal) et refuse un export instable. Elle inclut le code de diagnostic, la phase reconnue, la date, les chaînes brutes admises et les omissions explicites.

Un journal brut n'est inclus que si sa structure limite ses instantanés aux clés autorisées. Une version numérique inconnue de structure autrement reconnue peut être conservée à titre de preuve, sans autoriser une récupération. Un journal corrompu ou de structure étrangère est omis du fichier, mais conservé dans le navigateur. Un filtrage conservateur détecte les champs de credentials et certains motifs de tokens dans les objets ou chaînes JSON imbriquées. Les valeurs illisibles ou contenant ces éléments sont entièrement omises ; `journalRawOmitted` et `recordKeysOmitted` le signalent. Les originaux ne sont jamais modifiés par l'export.

Ce choix privilégie la confidentialité à un diagnostic intégral : un contenu non analysable n'est pas exporté aveuglément. Le filtrage ne peut pas identifier universellement un secret arbitraire saisi dans un texte libre. Ne pas diffuser publiquement le fichier ; il demeure un document personnel et ne remplace pas une sauvegarde.

## 5. Tests permanents et résultats

19 tests D ajoutés à `frontend/tests/storage-failures.test.cjs` : restauration exacte avec XP/reçus ; `prepared` entièrement appliqué ; confirmation obligatoire ; valeurs/clé supplémentaire ambiguës ; finalisation sans écriture métier ; cible F04 incohérente ; journaux corrompus/interdits/inconnus ; lecture impossible ; restauration interrompue par exception et reprise ; nettoyage refusé ; répétition et appels en attente ; journal modifié ; export limité aux clés autorisées ; journal étranger omis ; version inconnue exportable seulement ; capture instable ; anciens XP et F03 ; messages sans identifiants privés ; credentials imbriqués omis sans modification des originaux.

Ces nouveaux tests utilisent un stockage fictif en mémoire et des exceptions/écritures simulées. Ils ne démontrent pas une coupure électrique. Les tests A/B de redémarrage de processus avec stockage fictif durable sont conservés et exécutés, mais aucun nouvel arrêt brutal de Chrome n'a été réalisé pendant D.

8 parcours D ajoutés à `frontend/scripts/browser-check.cjs`, exécutés dans Chrome réel avec profils isolés : annulation sans écriture ; confirmation clavier/double clic et rafraîchissement ; refus d'écriture injecté puis reprise ; finalisation `committed` ; deux vrais onglets dont les confirmations sont mises en attente sous verrou ; diagnostic ambigu sans fuite de contenu ; téléchargement réel et filtré ; version inconnue sans action destructive. Le refus de quota est injecté, pas un disque effectivement rempli. Les événements inter-onglets sont natifs. Les fixtures sont synthétiques, aucun profil personnel n'est utilisé.

| Commande exécutée depuis `frontend` | Résultat final |
| --- | --- |
| `npm.cmd run typecheck` | Réussite, code 0 |
| `npm.cmd run lint` | Réussite, code 0 |
| `npm.cmd test` | 170 tests réussis, zéro échec (151 précédents + 19 D) |
| `npm.cmd run build` | Réussite, code 0 ; routes générées |
| `LIFEQUEST_TEST_URL=http://127.0.0.1:3102 node scripts/browser-check.cjs` | 62 observations réussies (54 précédentes + 8 D), aucune erreur remontée de console/runtime/hydratation |

Les régressions F01/F02/F03/F04 et A/B/C sont conservées. Captures de récupération desktop 1280 px, mobile 375 px et confirmation mobile inspectées ; aucun débordement global détecté par le runner. Focus clavier de la confirmation vérifié. Pas de certification WCAG ni de test avec lecteur d'écran humain.

Pendant la mise au point, une erreur de syntaxe dans la fixture métier et une URL masquée par une variable dans le nouveau test deux onglets ont été corrigées. Une invocation a aussi utilisé le mauvais nom de variable d'environnement du runner ; elle a été relancée avec `LIFEQUEST_TEST_URL`. Ce sont des défauts du harnais/invocation, pas des défauts applicatifs attribués à LifeQuest. Les résultats ci-dessus sont ceux des suites finales complètes. Les artefacts `.next` et `.browser-check` sont ignorés par Git.

## 6. Fichiers de cette phase

Créés :

- `frontend/src/lib/importRecovery.ts` : moteur et diagnostic/export filtré.
- `frontend/src/components/system/RecoveryPanel.tsx` : interface et confirmations.
- `frontend/src/components/system/RecoveryPanel.module.css` : styles locaux responsive.
- `docs/F05_PHASE_D.md` : ce rapport.

Modifiés :

- `frontend/src/lib/hunterCore.ts` : extraction du validateur pur partagé, règles inchangées.
- `frontend/src/components/system/StorageAccessBoundary.tsx` : intégration et maintien du blocage pendant le traitement.
- `frontend/tests/storage-failures.test.cjs` : 19 tests permanents D.
- `frontend/scripts/browser-check.cjs` : 8 parcours permanents D.

Les autres modifications préexistantes du workspace sont conservées. Aucun changement de stockage personnel, fichier d'environnement, dépendance ou règle métier.

## 7. Limites et préparation de la Phase E

F05 n'est pas déclaré entièrement résolu. La sûreté dépend du protocole coopératif Web Locks et de la conservation du journal/localStorage. DevTools, une ancienne version ou un script extérieur peuvent contourner ces protections ; aucune authenticité cryptographique des instantanés. Les deux captures ne garantissent pas une absence de modification externe entre ou après les contrôles. Effacement du navigateur, corruption disque, quota permanent ou absence de Web Locks ne sont pas réparables par cette interface.

Les journaux inconnus/corrompus et les états ambigus restent volontairement bloqués, sans bouton pour effacer les preuves. Si `before` était déjà invalide, son erreur métier initiale peut subsister après restauration exacte. Un export avec omissions peut être insuffisant pour une analyse externe complète. Aucun stockage distant n'est ajouté.

Pour E, après validation séparée : consolider la matrice de défaillance de bout en bout, tester les véritables interruptions navigateur aux frontières préparé/écritures/commit/nettoyage dans un profil jetable, vérifier redémarrage et notifications en présence de plusieurs onglets, tester Safari/Firefox et accessibilité assistée, étudier les quotas réels et documenter la prise en charge d'un journal non récupérable. D s'arrête ici ; E n'est pas lancée automatiquement.
