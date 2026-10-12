# F05 — Phase A : moteur de journal autonome

Date : 12 octobre 2026. Le plan F05 est validé ; seule la Phase A est implémentée. Aucun raccordement à importLifeQuest, aux hooks, aux mutations métier ou à une interface de récupération.

## Format

Module : frontend/src/lib/importJournal.ts. Clé technique réservée : lifequest-import-journal-v1. Champs : format, version 1, operationId, createdAt, phase (prepared/committed), keys, before, after.

Les instantanés contiennent les chaînes brutes ou null pour une clé absente. Le module ne modifie pas les XP, reçus, IDs ou statuts Boss/Focus et conserve même un ancien JSON illisible dans before. Il ne normalise pas les données métier.

Le journal exige les huit clés fixes recensées par l’import actuel, y compris une valeur null pour une clé optionnelle absente. Il accepte aussi les marqueurs de cinématiques aux niveaux 5/10/20. La liste est bornée à 256 clés : ce plafond concerne uniquement le moteur autonome ; aucun backup actuel n’est refusé par cette Phase A. Avant/après doivent posséder exactement le même ensemble de clés, sans doublon ni clé étrangère. La clé du journal lui-même est interdite dans les instantanés.

## Fonctions

| Fonction | Rôle |
| --- | --- |
| createImportJournal / validImportJournal | Création pure avec copie des instantanés ; validation stricte du format, des phases, des métadonnées et des valeurs. |
| captureJournalSnapshot | Lecture explicite des clés autorisées ; aucune écriture. |
| readImportJournal | Distingue absent, valide, corrompu, inconnu ou stockage indisponible. Conserve le texte brut d’un journal corrompu/inconnu. |
| inspectJournalValues | Compare les valeurs brutes actuelles aux deux instantanés : unchanged, before, after, mixed, ambiguous ou unavailable ; indique les clés en conflit. |
| prepareImportJournal | Refuse un journal préexistant et un instantané initial périmé ; écrit uniquement la clé technique, puis vérifie sa valeur. |
| markImportJournalCommitted | Vérifie le journal attendu et la cible complète avant commit. Répéter un commit confirmé ne provoque pas de nouvelle écriture. |
| clearImportJournal | Nettoyage explicite après cible committed vérifiée, ou retour prepared entièrement vérifié à before. Refuse les états partiels/ambigus et vérifie la suppression. |

Une troisième valeur, différente de before et after, est ambiguë. Un journal committed dont la cible n’est plus entièrement présente est aussi ambigu. Aucun de ces diagnostics n’effectue de réparation.

Une écriture suivie d’une lecture de contrôle impossible n’est jamais annoncée comme confirmée. Les preuves éventuellement écrites restent présentes. Le même principe s’applique au commit et au nettoyage ; après une suppression effective mais une vérification indisponible, le résultat reste explicitement incertain et doit être relu.

## Contrat d’utilisation pour les phases suivantes

Les fonctions reçoivent explicitement un objet de stockage ; aucun accès localStorage ni écriture n’est déclenché au chargement du module. Les seuls appels d’écriture concernent la clé du journal. Les tests passent exclusivement un stockage fictif.

Les primitives sont synchrones et doivent être appelées sous le verrou lifequest-storage couvrant l’opération entière. Elles ne prennent pas elles-mêmes un verrou : éviter un verrou imbriqué dans importLifeQuest en Phase B. La comparaison du journal attendu bloque un identifiant, des instantanés ou une phase modifiés, mais ne remplace pas un verrou inter-onglets. Une sérialisation différente du journal attendu peut produire un refus conservateur, jamais un écrasement automatique.

La validation est structurelle, pas une validation de sauvegarde métier. La Phase B devra valider la cible v1/v2 et F03/F04 avant toute préparation. La liste de clés devra être maintenue commune/cohérente avec l’import lors du raccordement.

## Tests permanents

frontend/tests/import-journal.test.cjs couvre : copies brutes et historique préservé ; clés autorisées/interdites et limite ; métadonnées/instantanés invalides ; lectures sans effet ; versions inconnues ; indisponibilité ; états avant/après/mixtes/ambigus ; absence et chaîne vide ; préparation vérifiée ; instantané périmé ; refus d’écrasement ; quota ; écriture silencieusement ignorée ; lecture de contrôle impossible ; commit incomplet ou répété ; changement externe ; nettoyage vérifié/refusé/réessayé ; réouverture sans récupération automatique.

Les tests existants de F05 restent des tests de caractérisation du stockage actuel : ils continuent à reproduire ses limites. Leur réussite ne signifie pas que les imports sont désormais protégés par le journal.

Résultats de cette phase : npm.cmd run typecheck, npm.cmd run lint et npm.cmd run build réussis ; npm.cmd test : 122 tests réussis (24 nouveaux et 98 existants) ; suite navigateur complète : 42 observations réussies dans un profil Chrome isolé, sans erreur console/hydratation détectée par le runner. Les nouveaux tests du journal utilisent uniquement un stockage en mémoire. Les artefacts habituels du build/navigateur sont générés dans les dossiers ignorés. Aucun test de crash natif du navigateur n’est ajouté dans cette phase.

## Limites et Phase B proposée

F05 n’est pas encore corrigé dans les imports réels. Aucun blocage des lectures/mutations, reprise au démarrage, notification inter-onglets ou interface n’est ajouté. Pas de garantie de durabilité disque, contre un crash Chrome, une panne électrique, un effacement ou un journal falsifié. Aucun nouveau format de backup métier ni migration.

Phase B, sur demande séparée : connecter les primitives à l’import validé sous son verrou ; capturer l’ensemble complet des clés ; préparer/vérifier le journal ; appliquer et vérifier la cible ; confirmer le commit ; gérer rollback et nettoyage sans perdre le journal ni annoncer un succès trompeur. Ajouter les interruptions et quotas à chaque étape. La protection générale des lectures et l’interface restent réservées aux Phases C/D.
