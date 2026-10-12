# LifeQuest — audit final avant déploiement

Date : 12 octobre 2026. Périmètre : application active dans frontend, état actuel du workspace, en respectant AGENTS.md. **Aucune fonctionnalité corrigée, aucun changement de persistance, aucune installation, aucun Supabase ajouté. Seul ce rapport est créé.** Le build et les tests génèrent leurs artefacts habituels dans .next et .browser-check, exclus de Git ; les données de test proviennent de profils Chrome isolés et de stockage en mémoire.

## 1. Conclusion et maturité

**LifeQuest est un MVP local fonctionnel, avec un cœur RPG bien protégé et testé. Ce n'est pas encore une application dont la mise en production publique peut être validée sans réserves.** Le build, TypeScript, ESLint et les 65 tests métier existants réussissent. Les 18 scénarios navigateur existants réussissent sans erreur de console ni erreur d'hydratation détectée. Des vérifications complémentaires ont reproduit quatre défauts réels décrits plus bas.

Aucun défaut critique du calcul des XP ni double crédit d'une même quête/Boss n'a été reproduit sur les parcours normaux testés. Deux problèmes UI restent à corriger : double création par soumission simultanée et parent supprimé encore sélectionné dans la Mind Map. Les imports ont également des limites de cohérence entre modules. Les paquets de développement présentent cinq alertes élevées, contre zéro dans l'audit des dépendances de production.

Verdict : **adapté à une bêta personnelle contrôlée**, avec sauvegardes exportées et HTTPS. Avant une ouverture publique, traiter les défauts prioritaires, valider un environnement propre, compléter les tests multi-navigateurs et la préparation opérationnelle. Classes RPG, paramètres de profil et synchronisation distante ne doivent pas être annoncés comme disponibles.

## 2. Fonctionnalités réellement présentes

Légende de preuve : **M** = tests métier exécutés ; **N** = tests navigateur existants exécutés ; **A** = scénario complémentaire exécuté en mémoire ; **C** = lecture du code seulement. Les chemins sont relatifs à la racine du dépôt.

| Fonctionnalité | Statut | Preuves et limites |
| --- | --- | --- |
| Onboarding et création du Hunter | Implémentée et fonctionnelle | A : intro passée, nom/âge, avatar masculin par défaut, choix Lecture, activation passée et arrivée dashboard ; profil sauvegardé. N : garde d'accès nouveau joueur. frontend/src/components/onboarding/OnboardingExperience.tsx, src/app/activation/page.tsx, src/lib/profile.ts sous frontend. Variantes de genre, erreurs d'âge et interruptions non testées dans le navigateur. |
| Avatars/évolution visuelle | Partiellement implémentée | C : évolution par paliers de cinq niveaux et vingt portraits ; présence des fichiers vérifiée. Le dashboard utilise une silhouette HUNTRESS pour l'avatar féminin ; onboarding annonce des aperçus temporaires. frontend/src/lib/characterEvolution.ts et frontend/src/app/dashboard/page.tsx. Toutes les transitions n'ont pas été parcourues. |
| Dashboard | Implémentée et fonctionnelle | N : données vides/réelles, compteurs, rechargement, échelle et valeurs des attributs, desktop/mobile. frontend/src/app/dashboard/page.tsx et CompactDashboard.module.css. Affiche les seules quêtes quotidiennes dues, volontairement. |
| Création de quêtes | Implémentée mais présentant un problème | M/N : création normale ; A : deux soumissions du formulaire créent deux objets distincts. frontend/src/app/quests/create/page.tsx, frontend/src/lib/questActions.ts. Voir F01. |
| Modification des quêtes | Implémentée et fonctionnelle | M : révision concurrente, conservation des XP personnalisés, changement de fréquence et historique. A : édition réelle du titre, XP total et ancien titre du reçu conservés. frontend/src/lib/questActions.ts et frontend/src/app/quests/create/page.tsx. |
| Complétion des quêtes | Implémentée et fonctionnelle | M/N : appels répétés/concurrents et récompense unique par période. frontend/src/lib/questActions.ts, questSystem.ts. |
| Archivage des quêtes | Implémentée et fonctionnelle | A : disparition de la liste active, maintien de la quête archivée, des XP et des validations. frontend/src/lib/useQuestSystem.ts et frontend/src/components/system/QuestRows.tsx. |
| Suppression définitive/restauration des quêtes | Absente | C : aucune action deleteQuest ni écran de restauration ; archiveQuest conserve les objets. Ne pas confondre archivage et suppression définitive. |
| XP et niveaux | Implémentée et fonctionnelle | M : seuils 0/199/200/425, recalcul global et crédits ; N : persistance. Coût 200 + 25 × (niveau − 1), maximum 100. frontend/src/lib/hunterCore.ts. Affichage au plafond à améliorer : F08. |
| Statistiques Hunter | Implémentée et fonctionnelle | M/N : somme des XP réellement crédités par attribut, Focus/Boss inclus selon leur attribut. frontend/src/lib/hunterCore.ts et dashboard/page.tsx. Les XP anciens sans validations détaillées ne sont pas artificiellement répartis entre attributs. |
| Rangs Hunter | Implémentée et fonctionnelle | M : seuils de rankForLevel ; C : E/D/C/B/A/S aux niveaux 1/10/20/30/40/50. frontend/src/lib/hunterMissions.ts. Parcours visuel de tous les rangs non testé. |
| Classes RPG avec règles spécifiques | Absente | C : SHADOW/ASTRAL HUNTER sont des choix/labels d'avatar, les titres d'évolution sont visuels ; aucun modèle de classe, compétences ou modificateurs associés. |
| Achievements et rewards | Implémentée et fonctionnelle | M : six critères, seuils, unicité, rétroactivité, meilleur streak, dates et imports ; N : titre visible et conservé après rechargement/import. frontend/src/lib/achievements.ts, hunterCore.ts et hunter-operations/page.tsx. Les titres ne donnent pas d'XP supplémentaire. |
| Boss Battles | Implémentée et fonctionnelle | M/N : poids 3/1, progression 75 % sans crédit puis 100 %, récompense unique, concurrence et reprise après échec. frontend/src/lib/hunterMissions.ts, activityRewards.ts, components/hunter/BossBattlePanel.tsx. Limites des anciennes sauvegardes : F03/F04. |
| Focus Sessions | Implémentée et fonctionnelle | M/N : session de 25 minutes, 20 XP de base, reprise après quota et crédit unique. frontend/src/components/hunter/FocusDungeon.tsx et frontend/src/lib/activityRewards.ts. N simule un minuteur arrivé à échéance ; aucun test réel de 25 minutes ou de veille de l'appareil. |
| Story Arcs | Implémentée et fonctionnelle | A : création, association à une quête et suppression sans supprimer celle-ci. C : date limitée à deux ans, progression par période. frontend/src/app/arcs/page.tsx, lib/useQuestSystem.ts et app/hunter-operations/page.tsx. Pas d'édition d'un arc existant. |
| Idea Vault | Implémentée et fonctionnelle | N : ajout et persistance ; C : archivage/restauration et suppression. frontend/src/app/hunter-lab/page.tsx. Ces deux dernières actions n'ont pas été testées dans le navigateur. |
| Creativity | Implémentée et fonctionnelle | A : réponse enregistrée sans XP imprévus ; C : liste de prompts et historique. L'étiquette DAILY ne correspond pas à une limite journalière : F07. |
| Mind Map | Implémentée mais présentant un problème | M : cycles rejetés ; A : création puis suppression du parent sélectionné bloque le prochain ajout. Voir F02. frontend/src/app/hunter-lab/page.tsx et lib/hunterLab.ts. |
| Knowledge Library | Implémentée et fonctionnelle | A : ressource HTTP(S) enregistrée, passage MASTERED ; M : schémas URL dangereux refusés. Suppression et ouverture externe non exercées. frontend/src/app/hunter-lab/page.tsx et lib/validation.ts. |
| Journal | Implémentée et fonctionnelle | A : enregistrement et second enregistrement gardent une entrée ; C : édition par date et suppression. Conflits entre deux brouillons simultanés non protégés par révision. frontend/src/app/hunter-lab/page.tsx. |
| Analytics/graphiques | Implémentée et fonctionnelle | N : cinq jauges d'attributs accessibles ; A : écran Lab avec sessions vides ; C : minutes totales, jours actifs et histogramme sept jours calculés depuis les sessions. Aucun Recharts actif. Les graphiques Lab avec plusieurs jours non nuls restent à tester. |
| Paramètres utilisateurs | Partiellement implémentée | C : profil créé à l'onboarding, export/import dans Hunter Core, navigation repliable. Aucun écran Settings ni édition du nom/âge/avatar, réglage du fuseau ou personnalisation complète. frontend/src/lib/profile.ts, app/hunter-core/page.tsx et components/system/SystemShell.tsx. |
| Sauvegarde locale | Implémentée mais présentant un problème | M/N : validation, refus du JSON corrompu, exports/imports, rollback tenté, compatibilité et reprise. Les modules ne constituent pas une transaction multi-clés et les statuts importés peuvent contredire les crédits : F04/F05. frontend/src/lib/storage.ts, questSystem.ts et hunterCore.ts. |
| Authentification/cloud/synchronisation | Absente | Aucun serveur de compte ni client Supabase dans les dépendances actives. Le plan docs/PERSISTENCE_MIGRATION_PLAN.md reste une proposition, pas une implémentation. |

## 3. Vérifications techniques exécutées

Toutes les commandes applicatives ont été lancées depuis frontend.

| Vérification | Résultat de cette session |
| --- | --- |
| npm run typecheck | Réussite, code 0 ; tsc sans émission, mode strict configuré |
| npm run lint | Réussite, code 0 ; périmètre src et tests, pas les scripts navigateur |
| npm run build | Réussite, code 0 ; compilation Turbopack, TypeScript et génération statique des routes réussies |
| npm test | 65 tests, 65 réussites, zéro échec |
| npm ls --depth=0 | Code 0 ; dépendances principales présentes, nombreux paquets extraneous dont Recharts/Redux/D3 |
| npm audit --json | Code 1 : cinq alertes élevées, zéro critique, chaîne ESLint |
| npm audit --omit=dev --json | Code 0 : aucune vulnérabilité signalée dans les dépendances de production |
| Imports locaux | Parcours de 43 fichiers TS/TSX, 146 imports locaux/alias, aucune cible manquante ; confirmé par typecheck/build |
| Assets portraits | Portrait initial et vingt portraits d'évolution présents ; affichage complet de chaque portrait non testé |
| Tests fonctionnels existants | node scripts/browser-check.cjs sur production http://127.0.0.1:3102 : 18 scénarios réussis |
| Audit navigateur complémentaire | Même runner étendu uniquement en mémoire : 28 observations au total, soit les 18 précédentes + 8 parcours complémentaires fonctionnels + 2 reproductions de défauts UI |
| Reproductions métier complémentaires | Runner métier étendu uniquement en mémoire : 67 assertions réussies, dont les 65 existantes et 2 assertions démontrant les défauts legacy/import ; ce n'est pas une preuve que ces défauts sont corrigés |
| Console/hydratation | Aucun console.error ni exception runtime détecté dans les deux suites finales ; aucune erreur d'hydratation signalée sur les routes visitées |

Une tentative initiale de scénario complémentaire a échoué sur la saisie automatisée d'un champ date natif. Le helper a été adapté uniquement en mémoire, puis le scénario complet a réussi. Cela ne constitue pas un défaut de l'application. Les fichiers de tests et scripts restent inchangés ; les nouveaux scénarios doivent être pérennisés dans une future tâche autorisée.

Les artefacts .browser-check/report.json, dashboard-accessibility.json et captures desktop/mobile proviennent des essais isolés ; le second passage remplace le rapport généré du premier. Les confirmations natives sont acceptées automatiquement : leur annulation n'est pas couverte.

Limites : installation propre via npm ci non exécutée pour ne pas changer les dépendances ; environnement de développement Next.js non relancé ; aucun Safari/Firefox, téléphone physique, lecteur d'écran humain, Lighthouse ou test de charge. Les tests métier utilisent transpileModule et un stockage simulé ; le verrou inter-onglets est aussi vérifié dans Chrome pour une quête, pas pour tous les modules.

## 4. Vérification des règles RPG

| Règle | Conclusion précise |
| --- | --- |
| Une quête ne donne ses XP qu'une fois | M/N : un seul crédit pour la paire questId/période ; protection aussi lors d'appels concurrents. F01 crée deux identifiants distincts, ce qui est un défaut de création, pas un double crédit d'un même identifiant. |
| Niveaux cohérents | M : progression calculée depuis le total conservé, seuils continus testés. Aucun ancien baseline n'altère la courbe. Niveau 100 plafonné dans le code ; son rendu spécifique n'a pas été testé dans le navigateur. |
| Statistiques cohérentes | M/N : les attributs utilisent xpAwarded des reçus. Les couleurs/barres comparent des XP ; aucun score scientifique ni XP fictif. |
| Achievements uniques | M/N : identifiants stables, validation des doublons, première date conservée et pas de nouveau crédit XP. |
| Boss reward unique | M/N : reçu synthétique once par Boss, dernière validation déclenche le crédit, retries et concurrence ne le dupliquent pas. |
| Streak et repos | M : activités Focus/Boss exclues du streak de quêtes ; multiplicateurs 1,10/1,25 ; aucune pénalité de stabilité. Bonus évalué avant crédit, conforme aux règles documentées. Les changements de fuseau/DST restent insuffisamment testés. |
| Progression après actualisation | N/A : quêtes, XP, achievements et Boss pondéré conservés ; import de fichier remet le compte de test dans l'état attendu. |
| Anciennes données compatibles | M : anciens XP conservés, Boss sans sous-objectifs compatibles, achievements absents rétroactivement détectés, exports v1/v2 acceptés. Les anciennes quêtes de démonstration ne sont volontairement pas importées par loadState : compatibilité des XP, pas conservation universelle de tous les anciens formats de quêtes. |

## 5. Problèmes réellement constatés

### Problèmes critiques

Aucun défaut de gravité critique n’a été reproduit sur les scénarios exécutés. Cette conclusion ne vaut pas certification exhaustive : les risques d’intégrité des imports et d’interruption multi-clés sont élevés, et les cas non testés restent explicitement listés. Les quatre défauts reproduits sont F01 à F04 ; F05 et les constats suivants reposent sur le code ou les contrôles techniques indiqués.

### F01 — Double création par double soumission — moyenne

Fichier : frontend/src/app/quests/create/page.tsx, fonction submit ; frontend/src/lib/questActions.ts, createQuestAction. **Reproduit dans Chrome** : remplir une nouvelle quête, appeler deux fois requestSubmit avant le retour de la première sauvegarde. Deux quêtes au même titre et deux IDs sont enregistrées. Aucun état pending/verrou de soumission n'empêche ce doublon.

Recommandation : empêcher les soumissions concurrentes dans l'éditeur et garder le brouillon jusqu'au résultat. Complexité faible ; risque faible pour le gameplay, tester création/édition et reprise sur erreur. Ne pas dédupliquer globalement par titre, car deux quêtes du même nom peuvent être intentionnelles.

### F02 — Parent Mind Map supprimé mais toujours sélectionné — moyenne

Fichier : frontend/src/app/hunter-lab/page.tsx, état parent, addNode et suppression de nœud. **Reproduit dans Chrome** : créer/sélectionner Racine audit, la supprimer, puis ajouter une branche. Le parentId reste l'ID supprimé ; validLab refuse l'ajout et affiche une erreur. Les données existantes sont préservées, mais l'action est bloquée jusqu'au retour à Racine/changement de sélection.

Recommandation : réconcilier la sélection lorsque le parent disparaît, aussi après changement dans un autre onglet. Complexité faible à moyenne ; vérifier rattachement des enfants et conservation du texte du brouillon.

### F03 — Ancien Boss avec récompense 0 XP impossible à solder — moyenne

Fichiers : frontend/src/lib/hunterMissions.ts, validExtra ; frontend/src/lib/hunterCore.ts, awardActivityXP ; frontend/src/lib/activityRewards.ts, claimBossReward. **Reproduit en mémoire** : un Boss ancien complet à xp:0 et rewardStatus:pending est accepté, mais le crédit est refusé, puis l'absence de reçu provoque une erreur. Le statut reste pending. Les nouveaux Boss pondérés imposent au moins 25 XP et ne sont pas concernés.

Recommandation : décider explicitement du traitement des Boss historiques à zéro, sans créer artificiellement d'XP ni invalider silencieusement les anciennes sauvegardes. Complexité moyenne, risque de compatibilité à tester.

### F04 — Validation d'import sans cohérence globale des récompenses — élevée

Fichiers : frontend/src/lib/hunterCore.ts, importLifeQuest ; frontend/src/lib/hunterMissions.ts, validExtra ; frontend/src/lib/hunterLab.ts, validLab ; frontend/src/components/hunter/BossBattlePanel.tsx. **Reproduit en mémoire** : les modules sont valides individuellement alors qu'un Boss est marqué credited sans aucun reçu de crédit dans la progression. L'import vérifie séparément ces modules et l'interface traite ce statut comme EXP CRÉDITÉS, sans bouton de récupération. Les mêmes relations inter-modules doivent être contrôlées pour Focus.

Impact : une sauvegarde incohérente peut donner un affichage trompeur et bloquer la reprise ; aucun double crédit normal n'a été observé. Recommandation : diagnostic inter-modules et décision explicite avant restauration, en prenant les reçus XP comme référence, sans recalcul destructif. Complexité moyenne à élevée ; risque élevé pour la compatibilité des imports, tester les reçus historiques sans activité associée.

### F05 — Persistance multi-clés sans transaction complète — élevée comme risque

Fichiers : frontend/src/lib/hunterCore.ts, importLifeQuest ; frontend/src/lib/activityRewards.ts. **Lecture du code, fermeture brutale non simulée** : import/restauration et activités écrivent plusieurs clés. Web Locks protège la concurrence, pas un arrêt de processus au milieu des écritures. Le rollback est tenté après erreur mais peut lui-même échouer si le stockage refuse les écritures. Les reprises de récompenses sont correctement testées ; une restauration interrompue reste un risque distinct.

Recommandation : maintenir l'export avant import et tester fermeture/échec du rollback dans un profil jetable ; étudier ensuite une restauration récupérable. Aucun changement de stockage proposé comme action immédiate de cet audit.

### F06 — Alertes de sécurité de développement et installation non propre — élevée pour l'outillage

Fichier : frontend/package-lock.json ; résultat npm audit. Chaîne braces → micromatch → fast-glob → @next/eslint-plugin-next → eslint-config-next. L'avis GHSA-vfj7-8cjw-p6xm concerne l'épuisement de pile sur motifs profondément imbriqués et ne liste pas de version corrigée lors de la consultation. [Avis GitHub](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

npm propose eslint-config-next 14.2.35, un downgrade majeur ; il n'a pas été appliqué. Les cinq alertes correspondent à une chaîne transitive, pas à cinq failles indépendantes exposées dans le navigateur. Audit production : zéro alerte à cette date, sans garantie de sécurité absolue. Paquets extraneous présents, dont Recharts retiré du manifeste. Recommandation : installation propre en CI isolée, suivi d'un correctif compatible et documentation de l'exposition de l'outillage. Ne pas lancer audit fix --force automatiquement.

### F07 — Labels et présentation inachevés — faible

Fichiers : frontend/src/app/hunter-lab/page.tsx et frontend/src/components/onboarding/OnboardingExperience.tsx. Lecture : DAILY CREATIVE CHALLENGE peut être renouvelé/soumis plusieurs fois et n'a pas de limitation journalière ; SHADOW/ASTRAL HUNTER ne définissent pas de classes métier ; l'activation annonce toujours INITIAL LEVEL 01/RANK E, même si un utilisateur ayant des XP revisite l'onboarding. Aucun XP n'est remis à zéro, mais le résumé peut être trompeur. Recommandation : aligner les intitulés et états sur les capacités réelles, sans ajouter une règle journalière non validée.

### F08 — Niveau maximal affiché comme progression vers un suivant — faible

Fichiers : frontend/src/lib/hunterCore.ts et frontend/src/app/hunter-core/page.tsx. Lecture : au niveau 100, getHunterProgress renvoie current:0 et required:0 ; l'écran construit néanmoins 0 / 0 EXP vers le suivant et Prochain niveau : 0 EXP. Calcul et XP sauvegardés non affectés. Recommandation : état visuel NIVEAU MAXIMAL et test de rendu au plafond. Non reproduit dans Chrome pendant cet audit.

### F09 — Couverture et documentation incomplètes — moyenne

Fichiers : frontend/tests/lifequest012.test.cjs, frontend/scripts/browser-check.cjs, frontend/README.md et AGENTS.md. Pas de workflow .github/workflows trouvé. Les tests temporaires ayant révélé F01/F02 ne sont pas enregistrés dans la suite permanente. Le test nommé Mind map cycles and duplicate journal dates ne vérifie en réalité que le cycle. README décrit le report de fréquence sans préciser l'exception avant la première récompense ; AGENTS mentionne encore Recharts dans les technologies identifiées alors que le manifeste ne le déclare plus. Recommandation : tests reproductibles et documentation synchronisée, dans une tâche séparée.

## 6. Expérience utilisateur et performances

- **Responsive** : captures inspectées du dashboard desktop, attributs mobile et Boss desktop ; suite contrôle aussi mobile et largeur 640 avec densité 2. Aucun débordement horizontal global détecté dans ces scénarios. Il ne s'agit pas d'un test complet du zoom texte natif 200 %, ni d'un téléphone physique ; onboarding/formulaires Lab à tester sur petit écran.
- **Navigation** : parcours onboarding → activation → dashboard, routes quêtes/arcs/Lab/Core/Operations effectués. La navigation latérale expose les principales routes ; Operations/Core passent par des liens contextuels. Repli du menu et historique retour navigateur non testés exhaustivement.
- **Lisibilité/cohérence** : style Hunter sombre/cyan cohérent sur les captures. XP et échelle commune sont lisibles. Mélange français/anglais, nombreux petits labels et indicateurs DAILY CLEARED/COMPLETION redondants restent une dette UX, pas une erreur de calcul.
- **Accessibilité** : dialogue de récompense testé au clavier avec confinement du focus et Escape ; cinq meters d'attributs présents dans l'arbre d'accessibilité ; Boss doté d'une progressbar avec valeur ; labels des formulaires présents dans le code. Les contrastes complets, lecteurs d'écran, niveaux de titres multiples et graphique Lab ne sont pas certifiés WCAG. L'histogramme Lab présente des textes visibles, mais pas un tableau alternatif ou une description complète des valeurs de la série.
- **Animations** : Motion à l'onboarding et styles reduced-motion présents ; contrôles pause/son/passage des cinématiques. Activation/intro ont été passées, le clip optimisé niveau 5 a été décodé par Chrome. Pas de visionnage complet des vidéos, de vérification des dialogues audio/sous-titres ni de test dynamique reduced-motion.
- **Chargement local mesuré** : un échantillon du dashboard sur serveur local chaud donne responseStart ≈ 8,6 ms, DOMContentLoaded ≈ 29 ms et FCP ≈ 52 ms. Valeurs de test local, sans throttling, inutilisables comme garantie en production. Aucune mesure LCP/INP/CLS de terrain.
- **Poids des médias** : six MP4 présents, total 158 052 608 octets (≈ 158 Mo décimaux). Le plus lourd est level-20.mp4, ≈ 44,7 Mo. preload=metadata et portrait Next/Image présents, mais réseau mobile, CDN et coûts de téléchargement non évalués. Pas de promesse de chargement rapide public.
- **États vides/erreurs** : compte vide, attributs à zéro, absence de sessions analytics, quota simulé Focus et sauvegarde Lab corrompue vérifiés. Les erreurs conservent les données et plusieurs reprises existent. Navigation interrompue, stockage totalement indisponible, absence de Web Locks et fichier vidéo manquant restent à tester.

## 7. Tests et améliorations prioritaires

| Priorité | Petite tâche future | Sortie attendue |
| --- | --- | --- |
| P1 | Verrou de soumission de l'éditeur et test F01 | Une intention utilisateur ne crée pas deux quêtes ; erreurs récupérables |
| P1 | Réconciliation du parent Mind Map et test F02 | Suppression locale/inter-onglets n'empêche pas l'ajout suivant |
| P1 | Audit inter-modules des backups, cas F03/F04 | Reçus et statuts cohérents, aucune perte ni invention d'XP |
| P1 | Pipeline reproductible en installation propre | typecheck/lint/build/test/browser sur dépendances du lock, sans paquets résiduels |
| P1 | Évaluer/suivre l'alerte braces et isoler l'outillage | Décision documentée, sans downgrade incompatible |
| P2 | Formaliser les scénarios temporaires exécutés ici | Onboarding complet, edit/archive, Arcs et CRUD Lab réexécutables |
| P2 | Tester Focus start/pause/resume/reset/reload/veille | Temps et identifiant de session préservés, zéro double récompense |
| P2 | Tester périodes, fuseaux, mois/semaines/DST et niveau 100 | Calculs et affichages stables aux frontières |
| P2 | Tester défauts de stockage/import et interruption | Aucune réinitialisation silencieuse, procédure de récupération claire |
| P2 | Accessibilité et multi-navigateurs | Safari/Firefox, lecteur d'écran, clavier et zoom texte réel validés |
| P2 | Analytics avec plusieurs jours non nuls et journaux concurrents | Agrégats justes, risque d'écrasement des brouillons explicitement traité |
| P3 | Clarifier labels, documentation et formats d'affichage | F07/F08/F09 résolus sans nouvelle mécanique |
| P3 | Profilage réaliste et médias | Mesures réseau/mobile et budget de poids avant optimisation |

## 8. Dette technique et risques avant déploiement

Architecture Next.js App Router avec composants clients et stockage navigateur, sans API de compte. Les règles importantes sont séparées dans lib, mais accès stockage et domaine restent mêlés dans certains modules. Les hooks offrent une couche de lecture réactive, pas un cache distant. Les blocs JSON sont revalidés/réécrits et les historiques non bornés : profilage volumétrique absent.

Composants anciens toujours présents : PlayerStats utilise une formule de statistiques différente, QuestCommandCenter conserve un ancien éditeur, mockPlayer expose XP_PER_LEVEL=300. Ils ne sont pas utilisés par le dashboard actif ; ce sont des risques de réutilisation future, pas des bugs observés du dashboard. CSS contient plusieurs couches d'overrides historiques. Aucun nettoyage/refactoring n'a été engagé.

Risques opérationnels : pas de synchronisation ni récupération distante, dépendance à l'origine du navigateur, suppression des données du navigateur irréversible sans export, besoin d'HTTPS pour les mutations Web Locks hors localhost. Éviter de changer de domaine/port sans procédure de transfert. L'application ne fournit ni comptes authentifiés, ni anti-triche, ni isolation de plusieurs utilisateurs partageant le même stockage local. Aucun classement public ne doit se baser sur ces XP comme preuve vérifiée.

Avant publication : figer une version revue du workspace, reproduire les contrôles dans une installation propre, choisir l'hébergement HTTPS, vérifier les routes/ressources sur cet hébergement, tester export/restauration et expliquer clairement le stockage local. Hébergement, en-têtes de sécurité, quotas réels, surveillance et sauvegardes de production n'ont pas été vérifiés ici. La migration PostgreSQL/Supabase reste soumise à validation et ne constitue pas un prérequis imposé à la bêta locale.

**Maturité évaluée : cœur métier solide pour le périmètre testé ; couverture UI partielle ; intégrité des imports à renforcer ; exploitation de production non démontrée.** L'absence d'erreur dans les tests ne masque pas les défauts reproduits. L'application peut servir de bêta personnelle, mais une stabilité générale en production publique ne peut pas être affirmée à ce stade.

## 9. Traçabilité et respect du périmètre

Rapport fondé sur le code et les résultats de cette session, pas sur les seules réponses précédentes. Empreinte SHA-256 de référence de 74 fichiers frontend (src/tests/scripts, manifestes/configurations, README et AGENTS frontend), après les premiers contrôles : b70c0ddd05c672b1aad7607ce28791375f83a7633f4430748137a0a38862b22f. Comparaison finale exécutée : empreinte identique pour les 74 fichiers, aucun changement détecté dans ce périmètre. Le dépôt avait déjà des modifications issues des sessions précédentes ; elles n'ont pas été annulées.

Aucun test navigateur supplémentaire n'a été enregistré dans les sources. Les sauvegardes personnelles, méthodes de stockage, dépendances et variables d'environnement du projet n'ont pas été modifiées ; seule une variable de processus choisit l'URL locale de test. Les suites utilisent des données synthétiques de test, pas un profil Chrome personnel. Aucune correction décrite dans ce rapport n'a été implémentée.
