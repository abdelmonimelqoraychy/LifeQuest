# F05 — Phase B : imports journalisés

Date : 12 octobre 2026. Seule la Phase B est intégrée. La Phase A reste le moteur ; Phases C/D non implémentées. Le plan et les rapports antérieurs décrivent leurs états historiques, pas une protection complète actuelle.

## Déroulement sous Web Locks

Dans frontend/src/lib/hunterCore.ts, importLifeQuest conserve le verrou lifequest-storage sur toute l'opération.

1. Lire le journal et refuser tout journal présent, valide, corrompu ou inconnu ; refuser également si sa lecture est indisponible. Aucun nouvel import ne l'écrase.
2. Valider le format backup v1/v2, les sept modules obligatoires, toutes les valeurs des modules, F03 et les relations F04 avant toute écriture, y compris du journal.
3. Capturer l'ensemble des huit clés métier fixes et l'union des marqueurs de cinématiques locaux/entrants. Les marqueurs absents du backup et la transition optionnelle absente ont une cible null. La clé technique du journal n'entre pas dans le backup ni dans ces instantanés.
4. Créer before/after à partir des chaînes brutes, avec un nouvel ID d'opération distinct des IDs métier. Préparer et relire le journal. Une préparation non confirmée interrompt l'import sans écriture métier ; elle peut laisser un journal présent, qui devra être vérifié.
5. Appliquer les chaînes/null puis vérifier toute la cible. Une valeur tierce, différente de before et after, ne doit pas être écrasée.
6. Confirmer committed uniquement après cible complète vérifiée. Si l'écriture du commit a pris effet mais son acquittement échoue, la lecture du journal décide : committed appartenant à cette opération signifie aucun rollback. Si la lecture est impossible ou le journal modifié, conserver l'état sans restauration aveugle.
7. Nettoyer seulement après commit confirmé. Échec ou résultat incertain du nettoyage : erreur explicite, aucun retour à l'ancien compte.

La liste des clés fixes provient désormais du moteur importJournal.ts pour éviter la divergence des deux listes. Les clés métier, valeurs importées et formats backup v1/v2 ne sont pas modifiés. Le plafond du moteur est 256 clés : dépassement refusé avant écritures ; aucun tronquage silencieux. Le volume supplémentaire du journal peut provoquer un refus de quota.

## Rollback contrôlé avant commit

Le rollback requiert le même journal prepared, un stockage lisible et des valeurs reconnues before/after. Si l'état est ambigu, le journal a changé ou les lectures sont impossibles, aucun rollback aveugle.

Pour chaque clé : vérifier à nouveau le journal, reconnaître la valeur actuelle, restaurer seulement si nécessaire, relire et comparer à before. Puis vérifier l'instantané complet avant nettoyage. Tout échec laisse une erreur et les preuves encore présentes ; les imports suivants restent bloqués. Aucun reçu n'est reconstruit, aucun XP recalculé, aucun compte fusionné.

Une suppression effective suivie d'une lecture impossible peut laisser le journal absent sans confirmation. L'erreur indique cette incertitude ; elle ne prétend pas que le journal est encore présent ni que l'opération a réussi. Si le commit était confirmé, le compte cible n'est pas restauré à before.

L'écran Core efface seulement un message de succès précédent à la sélection d'un nouveau fichier. Aucune interface de reprise ni modification visuelle ajoutée.

## Tests permanents

frontend/tests/storage-failures.test.cjs conserve les cas XP/Boss/Focus et adapte les anciens tests F05 : le journal retenu bloque maintenant la réimportation, au lieu de permettre un remplacement manuel immédiat. Les fichiers de tests F01/F02/F03/F04 et le moteur Phase A sont conservés.

Scénarios ajoutés : imports v1/v2 exacts ; instantané inaccessible ; quota et écriture silencieusement ignorée du journal ; lecture de contrôle échouée ; prepared/committed/corrompu/inconnu préexistants ; rejet F04 avant toute écriture ; écriture métier ignorée ; vérification cible indisponible ; commit refusé/ignoré ; commit réellement écrit avec exception ou lecture indisponible ; nettoyage refusé/ignoré ou suppression non confirmée ; nettoyage après rollback impossible ; valeur tierce ambiguë ; suppression cinématiques et transition absente ; reçus Boss/Focus importés sans double crédit ; arrêt de processus immédiatement après préparation ; rollback ignoré ; preuve de la garde métier encore manquante.

Deux tests interrompent réellement un processus enfant (sortie volontaire 42) en conservant un stockage fictif sur fichier : après préparation et après Lab. Ils ne simulent pas un crash natif Chrome ni une panne électrique. Les autres défaillances sont des exceptions, des opérations ignorées ou des lectures refusées.

La suite navigateur utilise exclusivement son profil Chrome jetable. Les nouveaux parcours vérifient le journal prepared persistant et le refus d'un second import, le quota avant écritures, le nettoyage committed refusé sans rollback, le rechargement et le refus d'écrasement. Entre scénarios indépendants, le harnais sauvegarde les preuves puis rétablit explicitement sa fixture fictive sous verrou. Cette remise en place n'est ni une fonctionnalité de récupération utilisateur ni une suppression dans un profil personnel.

Résultats finaux : typecheck, ESLint et build Next.js réussis ; npm.cmd test : 143 tests réussis, dont 21 nouveaux scénarios Phase B ; suite navigateur complète : 45 observations réussies, avec F01/F02/F03/F04 conservés et aucune erreur console/hydratation détectée par le runner. Les scripts npm ont été exécutés via npm.cmd, sans changer la politique PowerShell. Tous les échecs de stockage sont injectés dans des données fictives ; les arrêts de processus concernent uniquement les workers et leur fichier temporaire. Le build et le navigateur génèrent leurs artefacts habituels ignorés.

## Exigences précises pour la Phase C

**F05 n'est pas entièrement corrigé.** Un journal inachevé bloque les imports uniquement. Les lecteurs et autres mutations ignorent encore le journal : createQuestAction, changements d'Arcs, complétions, awardActivityXP, syncAchievements, mutateLab, mutateExtra, onboarding, timer et acquittements visuels restent possibles après libération du verrou. Les événements storage peuvent aussi exposer des valeurs intermédiaires. Le test « documented Phase C gap » reproduit une création de quête avec journal prepared ; il ne valide pas ce comportement comme sûr.

Phase C devra :

- Vérifier le journal sous le verrou avant chaque mutation sensible, avec accès distinct réservé au protocole d'import/reprise pour éviter un verrou imbriqué ou le blocage de sa propre transaction.
- Geler les lectures avant utilisation des modules au démarrage et lorsque le journal apparaît/disparaît via storage ; inclure le journal dans les stamps/caches des hooks et invalider les snapshots après restauration.
- Bloquer l'initialisation et le backfill automatique pendant un journal non résolu ; ne jamais convertir l'état partiel en compte vide utilisable.
- Protéger aussi l'export métier : actuellement exportLifeQuest exclut le journal et peut exporter un compte partiel. Un export diagnostic brut distinct relève du travail ultérieur prévu, sans annoncer un backup valide.
- Préserver prepared/committed/corrompu/inconnu et gérer les lectures indisponibles sans boucle de mutations. Toute donnée devenue tierce doit empêcher une restauration automatique.
- Tester l'onglet d'origine et les autres onglets, les minuteries actives, les effets de backfill, l'absence de Web Locks et le retour du stockage après indisponibilité.

En attendant, ne pas supprimer manuellement le journal pour contourner un refus dans un compte réel. Aucun mécanisme de reprise au démarrage ni interface de récupération n'est ajouté ici. Pas de garantie contre effacement navigateur, changement d'origine, corruption simultanée, modification hostile ou panne disque.

## Fichiers de cette phase

- frontend/src/lib/hunterCore.ts : intégration sous verrou, vérifications et erreurs.
- frontend/src/app/hunter-core/page.tsx : effacement du succès périmé uniquement.
- frontend/tests/storage-failures.test.cjs : scénarios permanents et attentes F05 mises à jour.
- frontend/scripts/browser-check.cjs : parcours navigateur Phase B.
- docs/F05_PHASE_B.md : protocole, limites et exigences Phase C.

Aucune installation, migration, modification des formules RPG, commit ou push.
