# LifeQuest — Idées d’évolution

> Document de cadrage pour validation utilisateur. Il décrit l’état constaté dans le dépôt et propose les prochaines étapes produit ; il ne signifie pas que ces étapes sont déjà implémentées.

**Audit de référence : 15 octobre 2026.** Branche `feature/lifequest-improvements`, HEAD `cd5ffad5ca261406093d9e981fd9e57b6a46dcda`, identique à `origin/feature/lifequest-improvements` au début de l’audit. Le dépôt était propre. La vérification a été limitée aux fichiers Git, à la documentation et au code source ; aucune stack Supabase n’a été démarrée, aucune base ou donnée utilisateur n’a été interrogée.

## État produit constaté

LifeQuest possède une expérience Hunter authentifiée qui a été intégrée et validée sur Supabase **local** avec des comptes de test synthétiques. Le parcours couvre la création et la confirmation du compte, la connexion, la récupération du mot de passe, l’introduction avec points de reprise et la création initiale du profil Hunter à niveau 1, rang E et 0 XP.

Le gameplay connecté utilise un snapshot serveur et des commandes RPG protégées. Le code actuellement raccordé comprend :

- **Progression et quêtes** : quêtes quotidiennes, hebdomadaires, mensuelles et ponctuelles ; difficultés EASY/NORMAL/HARD ; récompenses vérifiées par le serveur ; création, édition, complétion, archivage et restauration ; Story Arcs avec rattachement des quêtes ; niveau, rang, attributs, série et activité récente dérivés de l’état serveur.
- **Operations** : Boss découpés en sous-objectifs pondérés, progression et réclamation idempotente de la récompense ; achievements et événements associés.
- **Focus** : sessions Pomodoro avec démarrage, pause/reprise, fin, annulation et récupération d’un reçu de récompense.
- **Hunter Lab** : idées, carte mentale avec relations parent/enfant, bibliothèque de ressources, journal quotidien, défis créatifs et statistiques de concentration.
- **Dashboard premium** : profil/portrait Hunter, rang et niveau, barre d’XP, quêtes du jour, Boss actif, Focus, attributs et activité récente, avec mise en page responsive et prise en compte de `prefers-reduced-motion`.
- **Sécurité de session** : routes protégées, séparation des comptes, état pending explicite, invalidation de l’affichage au changement de session et refus des commandes non autorisées.

Les récompenses et périodes du parcours cloud sont calculées et vérifiées côté PostgreSQL. Le navigateur envoie une intention de commande, pas un montant d’XP ni une période à faire croire au serveur. Le journal XP et les reçus idempotents sont persistés dans la base. Les règles existantes ne doivent pas être changées implicitement par les prochaines idées de produit.

## Architecture locale réellement présente

Les 27 migrations présentes dans `supabase/migrations/` décrivent l’authentification, le schéma privé `lifequest`, les tables Hunter, les reçus et le ledger, les lecteurs/commandes, ainsi que l’introduction et les checkpoints cinématiques. Dans l’installation locale vérifiée, la Data API n’expose que `public` ; les tables métier restent privées sous `ENABLE/FORCE ROW LEVEL SECURITY`. Les clients passent par des fonctions RPC publiques limitées, qui vérifient l’acteur et la session puis lisent ou mutent l’état de manière transactionnelle.

Le chemin applicatif est, à grands traits :

```text
Navigateur authentifié
  → session SSR vérifiée par Next.js
  → /api/hunter/bootstrap ou /api/hunter/command
  → RPC Supabase publique autorisée
  → schéma privé lifequest, RLS, reçus et ledger PostgreSQL
  → snapshot serveur renvoyé au client
```

Les principales RPC de l’expérience actuelle sont :

| RPC | Rôle constaté |
|---|---|
| `lifequest_hunter_snapshot` | Lecture cohérente du profil prêt ou de l’état pending et des collections Hunter. |
| `lifequest_command_receipt` | Réconciliation d’un résultat de commande par acteur et `requestId`. |
| `lifequest_quest_command` | Quêtes et Story Arcs. |
| `lifequest_operations_command` | Boss, Focus et synchronisation explicite des achievements. |
| `lifequest_lab_command` | Ideas, Mind Map, Library, journal et créativité. |
| `lifequest_auth5_state` / `lifequest_auth5_command` | État et étapes de l’introduction, checkpoints et création initiale du Hunter. |

Les commandes utilisent des reçus/revisions pour l’idempotence et les éditions concurrentes. Les tables métier ne sont pas directement accessibles au navigateur. Les fonctions de commande restent soumises à la garde de session et à l’activation calendaire locale ; les receipts historiques ne sont pas recalculés lorsqu’une règle de calendrier change.

### Supabase local et Supabase Cloud : deux états distincts

- **Supabase local : opérationnel et validé dans l’environnement de développement.** L’installation locale dédiée a reçu les migrations, les suites Auth/RPC et les contrôles calendrier ; les scripts d’ouverture/arrêt ont été vérifiés sans effacement des volumes. Cette mise à jour documentaire n’a pas démarré la stack et ne certifie pas qu’un conteneur tourne à cet instant.
- **Supabase Cloud : non déployé.** Aucun projet Cloud n’est configuré comme cible de cette branche ; aucune migration, activation calendaire, commande de crédits ou donnée de test n’a été publiée sur Cloud. Les validations locales ne constituent pas une validation du PostgreSQL managé.

Toute mise en production Cloud devra être une étape séparée : choisir une cible autorisée, confirmer sa configuration et son calendrier, rejouer les contrôles nécessaires sur cette cible, puis obtenir une autorisation de déploiement distincte. Aucune étape de la présente roadmap ne vaut approbation implicite d’un déploiement.

## Fonctionnalités partielles ou absentes

| Sujet | État réel dans le code |
|---|---|
| Bilan hebdomadaire global | Absent. Le panneau Analytics affiche notamment les minutes de Focus des sept derniers jours ; il ne produit pas un bilan global des quêtes, de l’XP, des Boss et des objectifs. |
| Quêtes hebdomadaires | Présentes comme fréquence de quête, avec période contrôlée côté serveur. Cela ne constitue pas un système de défi hebdomadaire distinct. |
| Donjon de progression | Absent. `Focus Dungeon` désigne le minuteur Pomodoro ; `Creativity Dungeon` présente un défi créatif quotidien. Ces libellés ne décrivent pas un donjon à salles, progression ou reset hebdomadaire. |
| Classes Hunter | Absentes comme modèle métier, choix persistant et commande serveur. Les choix d’avatar et les attributs existants ne sont pas des classes. |
| Settings connecté | Snapshot en lecture seule ; aucune RPC de mutation des paramètres n’est présente. |
| Import/export cloud et migration des sauvegardes locales | Absents. L’ancien moteur et les outils liés au stockage local demeurent dans le dépôt ; le parcours de migration des données existantes (AUTH-6) n’est pas commencé. Les écrans Hunter connectés n’utilisent pas ce stockage comme fallback de mutation. |
| Design premium | La direction premium a été mise en œuvre sur le Dashboard et vérifiée sur des fixtures synthétiques desktop/mobile. Elle n’est pas une refonte premium validée de toutes les pages, et les captures de test ne sont pas des images de documentation versionnées. |
| Déploiement Cloud | Absent et non validé. |

Le document `frontend/README.md` décrit encore l’ancienne expérience comme une application locale sans backend métier et sans configuration nécessaire. Cette description contredit maintenant l’architecture authentifiée intégrée. Il n’existe pas de README à la racine du dépôt. Les rapports d’architecture et de sous-phase dans `docs/` apportent des détails techniques, mais ils ne remplacent pas un guide d’entrée à jour.

## Limites techniques et UX constatées

- Les tests Auth, SQL/RPC, calendrier et Chrome disponibles dans les rapports portent sur des stacks locales et des comptes synthétiques. Aucune preuve n’est revendiquée ici pour Supabase Cloud, Firefox/Safari, les téléphones physiques ou une certification WCAG.
- Le design premium du Dashboard a été capturé sur desktop et mobile avec des fixtures. Les valeurs d’exemple sont propres aux fixtures ; elles ne démontrent ni la disponibilité de données identiques chez chaque compte ni une parité pixel à pixel entre appareils.
- L’illustration de personnage féminin du Dashboard est encore une silhouette provisoire. Les règles de réduction des animations existent, mais une revue accessibilité complète et une campagne multi-navigateurs restent à faire.
- Le calendrier et les crédits sont verrouillés par des contrôles d’activation locale. Cela ne prouve pas la compatibilité des règles avec une cible Supabase Cloud, qui n’existe pas encore dans ce dépôt.
- Settings ne permet pas de modifier les paramètres du compte connecté. Il n’existe pas de flux produit de transfert des sauvegardes localStorage vers Hunter cloud.
- Le code et les outils de validation contiennent encore des parcours historiques locaux. Aucun script ou outil n’est supprimé ou archivé par ce document ; leurs dépendances doivent être inventoriées avant tout nettoyage.
- L’audit de ce document n’a relancé ni `npm` ni les navigateurs : le livrable est documentaire. Les rapports liés indiquent les résultats des campagnes antérieures, pas une nouvelle preuve exécutée le 15 octobre.

## Roadmap proposée, par priorité

Cette séquence vise d’abord une documentation qui ne trompe pas l’utilisateur, puis les fonctionnalités demandées. Les validations de chaque étape se font en premier sur des fixtures synthétiques locales. Une éventuelle cible Cloud reste un chantier de validation séparé.

### 1. README professionnel, architecture documentée et captures

**Objectif :** rendre le dépôt compréhensible et démarrable sans confondre le mode historique local, Supabase local et Supabase Cloud.

- Ajouter un `README.md` à la racine avec le pitch produit, l’état réel des fonctionnalités, prérequis, démarrage guidé, commandes de validation, dépannage et liens vers les documents techniques.
- Réconcilier `frontend/README.md` avec le parcours actuel : Auth, Supabase local, variables attendues sans publier de secret, commandes locales, fonctionnalités en lecture seule et statut Cloud.
- Ajouter une page d’architecture compacte avec un diagramme de flux SSR → API Next → RPC → schéma privé, les responsabilités PostgreSQL, la liste des RPC et les invariants d’isolation/idempotence. Référencer les contrats et bilans AUTH existants plutôt que les remplacer.
- Préparer des captures desktop/mobile à partir d’un compte synthétique prêt, avec données et identité fictives. Les intégrer dans un emplacement versionné et optimisé ; ne pas inclure de captures brutes de `.results`, profils Chrome, tokens, données personnelles ou paramètres de connexion.
- Garder tous les rapports historiques et scripts de validation. Avant d’archiver un outil, vérifier ses appels depuis `package.json`, CI, scripts de stack et harnais, puis exécuter le contrôle de non-régression concerné.

**Critères d’acceptation :** un nouveau lecteur comprend les deux modes locaux et l’absence de déploiement Cloud ; les commandes documentées sont vérifiées ; les captures se chargent depuis un clone propre et ne contiennent que des fixtures synthétiques.

### 2. Finaliser le design premium inspiré de Solo Leveling

**Objectif :** terminer et stabiliser la proposition premium du Dashboard, qui est déjà la seule zone couverte par cette direction visuelle.

- Consolider la hiérarchie visuelle, les cartes de progression, les états vides/erreur/chargement et les libellés autour des données déjà présentes dans le snapshot.
- Remplacer ou finaliser les silhouettes provisoires avec des illustrations originales cohérentes, y compris les variantes et textes alternatifs.
- Vérifier les tailles desktop/tablette/mobile, les dialogues, le focus clavier, le contraste, les animations et `prefers-reduced-motion` sur les états réels et vides.
- Rafraîchir les captures de la priorité 1 après la revue ; ne pas étendre automatiquement la nouvelle direction à tous les modules avant validation visuelle de cette étape.

**Garde de périmètre :** aucune modification des règles XP, RPC, Auth, migrations ou stockage n’est nécessaire pour le polissage visuel. Toute évolution de données doit être traitée séparément.

### 3. Ajouter un bilan hebdomadaire en lecture seule

**MVP proposé :** une vue claire de la semaine passée, basée sur le fuseau confirmé et les événements réellement enregistrés : quêtes terminées, XP déjà attribuée, progression Boss, temps/sessions Focus et faits marquants. Le bilan ne crédite aucune XP et ne crée pas de nouvelle source d’autorité.

- Définir sans ambiguïté les bornes de semaine, leur fuseau et le traitement des semaines incomplètes ou d’un historique lacunaire.
- Réutiliser les événements, receipts et snapshots existants lorsque leurs champs suffisent ; si une agrégation SQL est nécessaire, l’ajouter comme lecture seule avec un contrat de sortie borné.
- Distinguer les données mesurées des suggestions. Une suggestion pour la semaine à venir ne crée pas automatiquement une quête.
- Tester isolation A/B, déduplication, semaine de changement d’année, transitions de fuseau/DST et absence de double comptage des XP.

**Critères d’acceptation :** même compte et mêmes événements produisent le même bilan ; aucune écriture ledger/RPC de récompense n’est émise par l’affichage ; les semaines sans données sont présentées honnêtement.

### 4. Concevoir puis livrer les donjons et défis hebdomadaires

**MVP recommandé :** un défi personnel hebdomadaire, découpé en étapes visibles et inspiré de la mécanique Boss existante. Commencer sans classement, coopération, matchmaking ni dépendance à une récompense nouvelle. Le calendrier et l’état d’avancement sont autoritatifs côté serveur.

- Écrire d’abord les règles produit : durée de la semaine, conditions de progression, fermeture/reprise, répétition, cas d’absence et articulation avec les quêtes hebdomadaires et les Boss.
- Séparer clairement ce futur donjon du `Focus Dungeon` (Pomodoro), du défi créatif quotidien et du Boss actuel.
- Si le design prévoit une récompense, fixer son interaction avec le ledger et les achievements avant le code ; empêcher tout doublon entre quête, Boss, défi et retry.
- Étendre ensuite snapshot, migrations et RPC seulement après le contrat, puis prouver rollback, idempotence, concurrence et calendrier sur une stack locale neuve.

**Critères d’acceptation :** progression persistée par acteur, affichage cohérent après reconnexion, échéance décidée par PostgreSQL, retry sans double crédit et comportement documenté lors d’un changement de semaine. Les valeurs XP actuelles restent inchangées à moins qu’une décision produit explicite séparée ne les modifie.

### 5. Introduire les classes Hunter sans toucher aux récompenses XP

**Premier modèle proposé — identité et orientation, sans bonus :** le joueur choisit librement une classe narrative parmi quelques archétypes originaux (par exemple Éclaireur, Arcaniste, Sentinelle ou Stratège). Au premier stade, la classe sert à personnaliser l’identité et à suggérer des quêtes ou thèmes ; elle ne modifie ni les montants d’XP, ni les seuils de niveau/rang, ni les attributs calculés, ni l’accès aux commandes. Le choix est réversible sans pénalité.

- Commencer par une fiche de règles et une maquette ; vérifier qu’une classe n’est pas confondue avec l’avatar ou l’attribut de quête.
- Pour un compte connecté, concevoir une persistance explicitement autorisée et une lecture cohérente dans le snapshot ; Settings étant actuellement en lecture seule, ne pas inventer un chemin de mutation côté navigateur.
- Garder les récompenses, périodes, formules, ledger et reçus identiques avant/après le choix ou le changement de classe.
- N’envisager des passifs, classes avancées ou effets mécaniques que dans une proposition séparée, avec décision d’équilibrage et migration/test spécifiques.

**Critère non négociable de la première version :** les mêmes intentions RPG accordent exactement les mêmes récompenses avant et après la sélection/changement de classe. Aucun multiplicateur de classe, récompense exclusive, pénalité, seuil XP ou bonus caché.

## Conditions de validation et hors périmètre

- Chaque étape est présentée pour validation avant un éventuel changement applicatif ou SQL. Ce document est la proposition à valider ; aucune étape de la roadmap n’est mise en œuvre par son ajout.
- Le premier terrain d’intégration reste une stack Supabase **locale indépendante** avec fixtures synthétiques, sans toucher aux données utilisateur ni à l’installation personnelle.
- Supabase **Cloud reste non déployé**. Il faut un projet explicitement choisi et autorisé, puis une preuve sur sa version PostgreSQL et sa configuration avant tout déploiement ou crédit réel.
- AUTH-6, l’import de sauvegardes personnelles, les réglages Cloud, le classement social et le multijoueur ne sont pas inclus dans ces cinq priorités.
- Aucun rapport historique n’est effacé et aucun outil n’est archivé dans cette révision.

## Sources vérifiées dans le dépôt

- [Produit et principes actuels](../PRODUCT.md)
- [Plan d’architecture Cloud](../docs/AUTH_CLOUD_IMPLEMENTATION_PLAN.md)
- [Contrat de données AUTH-4A](../docs/AUTH_4A_CLOUD_DATA_CONTRACT.md)
- [Bilan AUTH-4 — commandes, reader, AUTH-5 et installation locale](../docs/AUTH_4_IMPLEMENTATION_REPORT.md)
- [Installation et opérations Supabase locales](../tools/lifequest-local/README.md)
- [README frontend antérieur à réconcilier](README.md)
- `supabase/migrations/` et `frontend/src/components/hunter/` : implémentation examinée pour cet audit.

---

<details>
<summary>Historique conservé : roadmap de stabilisation du 12 octobre 2026</summary>

### Roadmap de stabilisation — état du 12 octobre 2026 (historique)

Choix validés : recalcul global des niveaux à partir des EXP totaux ; désactivation de toutes les pénalités de stabilité. Aucun EXP acquis ni événement historique n’est supprimé. Aucun commit ou push effectué.

| Tâche | État | Réalisation |
|---|---|---|
| 1 | Fait | Lecture Lab invalide bloquante, aucune sauvegarde automatique vide |
| 2 | Fait | Anciennes EXP invalides refusées |
| 3 | Fait | Écriture principale indépendante du miroir historique |
| 4 | Fait | Validation des quêtes, événements, champs et relations |
| 5 | Fait | Validation des objets Lab, URLs, cycles et dates du journal |
| 6 | Fait | Types et validateurs communs du profil, Core, Boss et événements |
| 7 | Fait | Imports complets validés, retour aux données précédentes en cas d’erreur |
| 8 | Fait | Export v2 des transitions et cinématiques, lecture des exports v1 complets |
| 9 | Fait | Archives exclues du périmètre TypeScript/ESLint |
| 10 | Fait | Erreurs JSX et éléments inutilisés corrigés |
| 11 | Fait | Lectures React externes, abonnements au stockage, suppression des effets d’initialisation de formulaire |
| 12 | Fait | Scripts test/typecheck et documentation des commandes |
| 13 | Fait selon choix | Courbe globale recalculée depuis les EXP, seuils continus, historique inchangé |
| 14 | Fait | Rang, difficultés et progression centralisés |
| 15 | Fait | Streak fondé sur les dates locales, déplacement par jours calendaires |
| 16 | Fait selon choix | Stabilité effective 100 %, aucune réduction de récompense |
| 17 | Fait | Nouvelle fréquence différée après les périodes actuelles |
| 18 | Remplacé par choix | Les anciennes pénalités sont conservées, mais aucun calcul rétroactif n’est exécuté ; pas de nouveau calendrier de pénalités à maintenir |
| 19 | Fait selon choix | Tous les jours de repos sans pénalité, sans restriction de jours actifs |
| 20 | Fait | Boss terminé avec récompense récupérable et crédit idempotent |
| 21 | Fait | Session Focus identifiée, dédupliquée et récupérable après erreur |
| 22 | Fait | Succès discipline limité aux validations de discipline |
| 23 | Fait | Titre et arc conservés dans les nouvelles validations |
| 24 | Fait | Web Locks commun aux mutations ; révision pour refuser une édition de quête périmée |
| 25 | Fait | Jour local réactualisé à minuit ; date explicite du brouillon de journal |
| 26 | Fait | Vidéos prioritaires, notifications différées et portrait/rang du palier concerné |
| 27 | Fait | Dialogues natifs, confinement Tab, fermeture Escape, restitution du focus |
| 28 | Fait | Bouton d’import utilisable au clavier |
| 29 | Fait | Champs nommés, boutons icônes et états sélectionnés explicités |
| 30 | Fait | Langue française, suppression des main imbriqués |
| 31 | Fait dans Chrome | Captures desktop/mobile/viewport équivalent à 200 %, sans débordement horizontal |
| 32 | Fait | Textes de capacités actuelles et redirection des nouveaux profils sans bloquer la récupération |
| 33 | Fait | Turbopack commun, hydratation standard et origine locale autorisée ; Tailwind limité à globals.css |
| 34 | Fait | Attributs calculés une fois par historique |
| 35 | Fait | Index des validations et des parents SVG de carte mentale |
| 36 | Fait | Minuteur isolé, rendu par seconde, libellé persisté au blur |
| 37 | Fait | Copie niveau 5 720p, 21 181 813 → 18 537 369 octets, original conservé en repli |
| 38 | Fait, périmètre ciblé | Règles simples du menu consolidées et styles footer globaux isolés ; autres styles historiques conservés |
| 39 | Fait | Recharts retiré du manifeste/lock ; polices réseau inutilisées retirées |
| 40 | Fait | Scénarios Chrome isolés et README de fonctionnement/récupération |

## Vérifications

- Tests métier en mémoire : 31 scénarios, dont pannes de stockage, import, récupération et concurrence.
- Lint, TypeScript et build Next.js : commandes présentes dans package.json.
- Chrome : création/validation/rechargement, Boss, deux onglets, restauration JSON, reprise Focus, vidéo optimisée et sauvegarde Lab corrompue.
- Captures et compte rendu local : .browser-check/ ; ce dossier est exclu de Git.

## Limites conservées explicitement

- Aucun cloud, backend métier, classement partagé ou anti-triche ajouté.
- Les historiques anciens ne sont pas enrichis avec des titres/arcs inconnus.
- L’API Web Locks et un contexte sécurisé HTTPS ou localhost sont nécessaires aux écritures.
- La validation des données refuse les formats malformés en conservant leur valeur brute.
- Le rollback d’import est une tentative ; un navigateur refusant tout stockage peut empêcher sa fin.
- Les vérifications Chrome ne constituent pas une certification WCAG, ni un test sur téléphone physique. Le format 200 % teste une largeur CSS réduite avec densité 2, pas toutes les préférences de taille de texte.
- Les autres clips et les styles historiques ne font pas l’objet d’une refonte globale.
- Audit npm : aucune alerte de production signalée ; cinq alertes élevées restent dans la chaîne ESLint/braces. Aucun correctif compatible publié vérifié ; pas de downgrade forcé.

## Validation finale — 12 octobre 2026

- 31 tests métier réussis.
- ESLint : aucune erreur et aucun avertissement.
- TypeScript : aucune erreur.
- Build de production : réussi, 13 pages générées.
- 12 scénarios Chrome de production réussis, aucune erreur de console ni exception JavaScript capturée.
- Captures desktop, mobile et format équivalent à 200 % : aucun débordement horizontal.
- Développement : hydratation et CSS Modules vérifiés sur localhost:3000 et 127.0.0.1:3000.
- Serveur de développement conservé sur http://localhost:3000 ; serveur temporaire de production arrêté.
- Aucun commit ni push. Le fichier AGENTS.md utilisateur à la racine est resté inchangé.

</details>
