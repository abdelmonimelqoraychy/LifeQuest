# LifeQuest — proposition de migration de la persistance

Statut : **proposition à valider, aucune migration exécutée**. Analyse du code au 12 octobre 2026. Seul ce document est ajouté ; stockage, dépendances, authentification et configuration restent inchangés.

## 1. Décision recommandée

Conserver le stockage local tant que LifeQuest sert à une personne sur un navigateur et que l'export manuel convient. Le code ne démontre ni un besoin multi-appareils confirmé, ni un volume exigeant PostgreSQL. Aucune mesure des sauvegardes personnelles n'a été effectuée.

Justifier la migration par au moins un besoin explicite : récupération après perte du navigateur, accès depuis plusieurs appareils, comptes utilisateurs ou historique durable centralisé. Distinguer sauvegarde distante et synchronisation : un dépôt d'exports ne résout pas les conflits entre appareils.

Si ce besoin est validé, préférence proposée pour **PostgreSQL hébergé par Supabase avec Supabase Auth**, derrière les services métier de LifeQuest. PostgreSQL et Supabase ne sont pas deux formats de données concurrents : l'architecture relationnelle proposée reste utilisable avec PostgreSQL chez un autre hébergeur. Ce choix est une recommandation de conception pour limiter l'administration du projet personnel, pas une dépendance déjà présente.

| Option | Intérêt pour LifeQuest | Travail supplémentaire |
| --- | --- | --- |
| Local actuel | Simple, fonctionne sans compte et sans réseau pour le gameplay | Exports manuels, aucune synchronisation |
| PostgreSQL avec API Next.js | Contrôle de la base et de l'hébergement | Authentification, exploitation, sauvegardes et surveillance à organiser |
| Supabase : PostgreSQL + Auth | Identité et base dans une plateforme commune | Politiques d'accès, contrats serveur, migrations, coûts et restauration à vérifier |

Avant de choisir une offre, vérifier région d'hébergement, budgets, limites, sauvegardes, rétention et possibilités de restauration. Aucun abonnement ou provisionnement n'est autorisé par ce document.

## 2. Persistance réellement présente

Chemins ci-dessous relatifs au dépôt.

| Clé locale | Contenu | Code source |
| --- | --- | --- |
| lifequest-quest-system-v1 | XP total, quêtes, arcs, validations, achievements optionnels | frontend/src/lib/questSystem.ts |
| lifequest-v2-demo | Ancien total XP et miroir de compatibilité | frontend/src/lib/questSystem.ts |
| lifequest-hunter-lab-v1 | Idées, carte mentale, ressources, journal, sessions Focus, défis | frontend/src/lib/hunterLab.ts |
| lifequest-hunter-operations-v1 | Boss historiques ou pondérés et événements système | frontend/src/lib/hunterMissions.ts |
| lifequest-core-v011 | Paramètres Hunter et anciens enregistrements de stabilité | frontend/src/lib/hunterCore.ts |
| lifequest-profile-v1 | Profil d'onboarding ; aucune identité authentifiée | frontend/src/lib/profile.ts |
| lifequest-hunter-timer-v1 | État du minuteur en cours | frontend/src/components/hunter/FocusDungeon.tsx |
| lifequest-hunter-transition-v1 | Niveau de transition déjà présenté | frontend/src/components/hunter/HunterTransition.tsx |
| lifequest-cinematic-seen-v1:… | Indicateurs de cinématiques vues, seuils 5/10/20 | frontend/src/components/cinematics/LevelCinematicGate.tsx |

Les mutations métier utilisent le verrou Web Locks de frontend/src/lib/storage.ts. Les primitives saveState/saveLab/saveExtra ne prennent pas elles-mêmes ce verrou : les chemins d'écriture appelants doivent le prendre. Les hooks useQuestSystem/useStoredData écoutent les événements locaux et inter-onglets.

Frontend/src/lib/hunterCore.ts exporte les valeurs brutes dans un format version 2 et accepte les sauvegardes complètes versions 1 et 2. Les sept premières clés de son catalogue doivent être présentes, même si leur valeur est null. L'import valide les modules avant écriture, remplace l'état et tente de restaurer les valeurs précédentes si une écriture échoue. Il n'est pas atomique entre plusieurs clés et une fermeture du navigateur peut interrompre l'opération. L'écran Hunter Core impose actuellement une limite de fichier de 10 Mo ; cette limite UI n'est pas une garantie serveur.

Atouts : validation des structures, refus des sauvegardes corrompues, historique de récompenses, protection contre les doublons, reprise des crédits Focus/Boss. Limites : stockage lié à l'adresse du site et au navigateur, accès synchrone et réécriture des blocs JSON, absence d'identité/serveur/base active, absence de transaction entre modules. Le contenu local peut être modifié par son propriétaire et n'est pas une preuve anti-triche.

## 3. Architecture cible, après validation

~~~mermaid
flowchart LR
  UI[Pages et composants existants] --> Hooks[Hooks : état et erreurs]
  Hooks --> Port[Contrat de stockage asynchrone]
  Port --> Local[Adaptateur local : mode invité]
  Port --> API[API Next.js : compte authentifié]
  API --> Domain[Services métier et transaction]
  Domain --> DB[PostgreSQL : Supabase ou autre hébergeur]
~~~

Le contrat doit porter des opérations métier : charger le compte, créer/modifier une quête avec sa révision, valider une période, valider un sous-objectif Boss, terminer Focus, exporter, préparer/confirmer un import. Éviter de transposer saveState comme un remplacement arbitraire de tout le compte à chaque clic.

Extraire progressivement les calculs purs des accès localStorage dans questActions.ts, hunterCore.ts et activityRewards.ts. Conserver leurs règles et leurs tests. L'adaptateur local garde les clés actuelles. L'adaptateur distant conserve des snapshots compatibles pour les composants ; useSyncExternalStore ne doit pas retourner une Promise. Un chargement distant alimente un cache mémoire et annonce les mises à jour au hook.

En mode invité, le local reste la source de vérité. Après bascule explicite d'un compte, le serveur devient la source de vérité ; le local contient un cache identifié par le compte et un export de secours. Une panne réseau ne déclenche pas un retour silencieux aux écritures locales. Première version distante : lectures en cache et mutations suspendues hors ligne ; le mode invité conserve son fonctionnement local. Une file de commandes hors ligne, ses conflits et son interface constituent une phase ultérieure distincte.

## 4. Entités proposées

Pour une première migration, conserver les identifiants locaux comme texte et utiliser des clés composées (user_id, id). Certains identifiants Lab, minuteurs et historiques ne sont pas des UUID. user_id vient de l'authentification ; le profil d'onboarding ne le remplace pas. Toutes les relations entre entités privées comprennent user_id pour empêcher un rattachement à un autre compte.

| Entité cible | Champs essentiels et règles |
| --- | --- |
| profiles | user_id, name, age, gender, avatar, goals (liste de libellés), onboarding_completed, created_at |
| player_state | user_id, opening_xp, timezone, rules_version, revision ; total XP éventuellement mis en cache transactionnellement |
| story_arcs | id, title, description, target_date, created_at ; objectifs à long terme existants |
| quests | id, arc_id optionnel, title, description, frequency, attribute, difficulty, base_xp, archived, target_date, available_after, revision, created_at |
| xp_events | id, source_kind, source_id, period_key, occurred_at, awarded_xp, attribute, title_snapshot, arc_id_snapshot ; journal des crédits existants et futurs |
| achievement_unlocks | user_id, achievement_id, unlocked_at ; identifiant issu du catalogue existant |
| boss_missions | id, title, objective, mode (counter/weighted), target/current historiques, base_xp, completed_at, revision |
| boss_subobjectives | id, boss_id, title, weight, completed ; progression pondérée dérivée des poids |
| system_events | id, kind boss/rank/evolution, title, detail, occurred_at ; distinct des crédits XP |
| focus_sessions | id, occurred_at, minutes, label ; statut de récompense déterminé par son crédit XP |
| ideas | id, title, content, tag, archived, created_at |
| mind_nodes | id, parent_id, title, x, y ; parents du même utilisateur, sans cycle |
| resources | id, title, notes, url, topic, mastered, created_at |
| journal_entries | id, local_date, wins, challenges, gratitude, tomorrow ; une entrée par utilisateur et jour |
| creativity_challenges | id, prompt, response, occurred_at, completed |
| hunter_settings | anciens baselineXP/baselineLevel et pénalités conservés comme historique ; aucune réactivation de pénalités |
| presentation_state | état des transitions/cinématiques si leur synchronisation est choisie ; sinon sauvegarde locale conservée |
| migration_batches | user_id, migration_id, empreinte du snapshot, version, statut, résumé du contrôle ; reprise d'import |
| command_receipts | user_id, request_id, type, résultat minimal ; reprise des commandes après timeout |

Le profil.goals contient aujourd'hui des textes, pas des objectifs structurés supplémentaires : ne pas inventer une nouvelle entité d'objectif avec progression. Le minuteur en cours reste propre à chaque appareil ; migrer les sessions terminées, conserver les données du minuteur dans les exports, ne pas déclencher une récompense simplement parce qu'un minuteur importé a expiré.

Les titres/niveaux/statistiques restent dérivés du journal et de la courbe centrale. Les achievements persistent sans XP supplémentaires. Les snapshots historiques doivent survivre à l'édition et à la suppression d'un arc. Conserver les quêtes archivées ; ne pas supprimer leurs crédits en cascade. Une référence d'arc historique peut rester un identifiant documentaire après suppression de l'arc actif.

## 5. Cohérence et unicité des récompenses

Contraintes proposées : unicité des crédits par (user_id, source_kind, source_id, period_key), avec period_key = once pour Focus/Boss ; unicité (user_id, achievement_id), (user_id, local_date) pour le journal, et (user_id, request_id) pour les commandes. Une contrainte métier de période reste nécessaire même si chaque requête possède son propre identifiant. PostgreSQL fournit contraintes uniques et clés étrangères pour ces invariants. [Documentation PostgreSQL](https://www.postgresql.org/docs/current/ddl-constraints.html).

Une validation serveur verrouille l'état de progression de l'utilisateur, lit la quête et l'historique, vérifie échéance/révision/période, calcule le bonus avant le crédit, insère le crédit et les achievements, puis confirme l'ensemble. Pour un Boss, la dernière validation et son crédit final sont inclus dans la même transaction. Le client ne fournit pas le montant XP final. Les calculs doivent s'exécuter après acquisition du verrou, afin que deux validations distinctes concurrentes n'utilisent pas un streak périmé. Les transactions PostgreSQL permettent de confirmer ou annuler les écritures ensemble. [Documentation des transactions](https://www.postgresql.org/docs/current/tutorial-transactions.html).

Pour réutiliser les règles TypeScript, le service Next.js peut piloter une transaction PostgreSQL avec une connexion réservée pour sa durée ; l'accès Supabase via Auth n'impose pas d'utiliser une succession d'appels REST pour cette transaction. Le pilote et le pool seront choisis après validation. Une RPC transactionnelle serait une alternative, mais dupliquer les formules en SQL demanderait des tests de parité explicites.

Conserver les règles actuelles : courbe de niveaux globale, pénalités désactivées, anciens XP personnalisés, changement de fréquence sans nouveau délai avant la première récompense, protection des quêtes déjà récompensées, Boss anciens et pondérés. Échec réseau après commit : renvoyer le résultat existant lors d'une reprise ; ne pas recréditer.

## 6. Transfert sûr des données locales

1. Créer un export local brut sous le verrou existant, proposer son téléchargement et noter son empreinte. Il contient des données privées : éviter les logs et rétentions inutiles. Les anciennes valeurs restent en place.
2. Authentifier explicitement la personne et afficher le compte destinataire. Aucun rapprochement automatique par nom, âge ou date du profil.
3. Valider côté serveur le format, les versions et chaque module, avec les mêmes invariants que les validateurs locaux, des limites de taille et un contrôle des relations entre modules. Produire un aperçu sans écritures définitives.
4. Préserver identifiants, timestamps, périodes déjà stockées, quêtes archivées, XP effectivement accordés, titres acquis, sous-objectifs et événements. Ne pas rejouer les anciennes actions et ne pas recalculer leurs récompenses.
5. Préserver les XP sans historique : opening_xp = totalXP local − somme(xpAwarded des crédits importés). Exemple : total 450 et historique 105 donnent un solde initial de 345 ; reconstruire uniquement l'historique ferait perdre ces XP. Le miroir lifequest-v2-demo n'est pas un deuxième solde à additionner. Si la clé principale manque, appliquer la règle legacyXP actuelle ; ne pas importer les anciennes quêtes de démonstration.
6. Les validateurs actuels autorisent des nombres finis non négatifs, pas seulement des entiers. Ne pas arrondir silencieusement les anciens XP : utiliser un type numérique préservant les valeurs et comparer avec une tolérance documentée pour les écarts flottants négligeables. Toute différence réelle bloque l'import.
7. Certaines sauvegardes valides peuvent avoir des crédits d'activités sans session/Boss correspondant. Conserver ces reçus historiques avec leur source originale, sans inventer une activité ni imposer une clé étrangère non satisfaite. Les préfixes artificiels inconnus doivent être signalés et conservés en staging pour décision, jamais assimilés silencieusement à une quête.
8. Confronter statuts pending/credited et reçus Focus/Boss : le reçu de crédit fait foi sur les XP déjà gagnés. Une contradiction sans reçu exige une décision documentée ; ne pas créer des XP sur la seule foi du statut. Une éventuelle normalisation est montrée dans l'aperçu et enregistrée dans le rapport.
9. Demander le fuseau IANA du compte. Conserver les périodes anciennes telles quelles ; le fuseau historique exact n'est pas stocké aujourd'hui. Présenter cette limite pour les streaks reconstruits depuis les timestamps. Pour les nouvelles actions, enregistrer instant UTC, jour métier et période calculés dans le fuseau choisi. Un changement de fuseau ne doit pas ouvrir une seconde récompense d'une même période : prévoir une transition contrôlée avant de proposer cette option.
10. Faire confirmer l'aperçu, importer dans une transaction et enregistrer le résultat sous migration_id + user_id. Une reprise du même snapshot retrouve ce résultat ; une nouvelle sauvegarde modifiée ne remplace pas automatiquement un compte déjà rempli. Première version : import vers compte vide, refus d'une fusion automatique.
11. Comparer avant bascule : XP total, niveau, XP par attribut, nombre de crédits, IDs/périodes, achievements et dates, Boss/poids, contenu Lab. Les nouvelles données locales depuis le snapshot doivent être détectées sous verrou ; si elles diffèrent, préparer un nouveau snapshot. Les autres appareils déjà liés ne doivent pas écrire pendant cette première bascule.
12. Basculer uniquement après confirmation du commit et des contrôles. Conserver un export antérieur et un export serveur validé. Si la réponse réseau est perdue, interroger le statut de migration avant de réessayer.

Un import de sauvegarde en mode distant devient une opération dédiée avec aperçu et autorisation ; le remplacement direct de l'état local ne doit pas écraser un compte serveur depuis un onglet ancien.

## 7. Sécurité

Avec Supabase, combiner privilèges SQL minimaux et RLS sur toutes les tables exposées. Les politiques de lecture et de modification vérifient l'utilisateur authentifié ; WITH CHECK protège aussi les nouvelles valeurs. Tester les relations entre comptes et les vues de statistiques. RLS ne protège pas les règles XP d'une personne autorisée à modifier ses propres lignes : retirer les écritures directes sur crédits, soldes et achievements et passer par les commandes métier. [Documentation Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

Une clé publishable n'identifie pas à elle seule la personne. Les clés secret/service_role contournent RLS et restent exclusivement côté serveur, jamais dans les variables NEXT_PUBLIC, le bundle, les exports ou les logs. Les utiliser seulement pour les opérations administratives nécessaires, avec contrôle explicite du compte. [Documentation Supabase des clés](https://supabase.com/docs/guides/getting-started/api-keys).

Avec PostgreSQL direct, aucun auth.uid() automatique n'est supposé : l'API vérifie la session et transmet l'identité au périmètre d'accès choisi. Éviter un rôle applicatif superutilisateur/propriétaire qui contourne les protections. Les paramètres d'identité associés à une connexion du pool doivent être limités à la transaction et testés contre toute fuite entre comptes.

Vérifier la session côté serveur, traiter les requêtes par cookies avec protection d'origine/CSRF adaptée, limiter fréquence et taille des imports, utiliser des requêtes paramétrées et valider les payloads. Séparer développement, test et production. Ne pas enregistrer le contenu des journaux, profils ou réponses créatives dans les logs techniques. Protéger également backups et journaux d'erreurs ; prévoir export, suppression de compte et politique de rétention avant ouverture à d'autres personnes.

Un import personnel reprend des XP déclaratifs. Il ne devient pas une preuve pour un éventuel classement public : distinguer ultérieurement provenance importée et crédits validés par le serveur.

## 8. Risques et mesures

| Risque | Gravité | Mesure et coût relatif |
| --- | --- | --- |
| Perte des XP sans historique | Critique | Solde initial et comparaison avant/après ; moyenne |
| Double récompense multi-appareils ou après timeout | Critique | Unicités métier, reçus de commande, transactions et verrou utilisateur ; élevée |
| Accès aux données d'un autre compte | Critique | Identité vérifiée, RLS/privilèges, relations composées, tests à deux comptes ; élevée |
| Deux sources de vérité et fusion silencieuse | Élevée | Bascule explicite, un seul écrivain logique, aucun fallback d'écriture ; élevée |
| Import interrompu/relancé | Élevée | Staging, migration_id, transaction, vérification du statut ; moyenne |
| Changement de jour, streak ou fréquence | Élevée | Fuseau confirmé, périodes préservées, tests de limites et DST ; moyenne |
| IDs non UUID et reçus orphelins | Élevée | IDs texte, références documentaires et aperçu d'anomalies ; moyenne |
| Conflit d'édition et perte de brouillon | Élevée | Révisions par entité et retour explicite de conflit ; moyenne |
| Régression hors ligne ou déconnexion | Moyenne | Mode invité maintenu, compte distant clairement identifié, mutations suspendues si réseau absent ; moyenne |
| Fournisseur/coût/restauration indisponible | Moyenne | SQL versionné, budgets à vérifier, exports indépendants, exercices de restauration ; moyenne |
| Fuite de journal/profil via sauvegarde ou logs | Élevée | Accès privé, rétention courte, logs sans contenu personnel ; moyenne |

Ne pas annoncer une possibilité de restauration tant qu'elle n'a pas été exercée. Après des écritures distantes, revenir au vieux snapshot local perdrait les nouveaux crédits : un rollback utilise un export serveur récent ou suspend les écritures jusqu'à réconciliation.

## 9. Roadmap soumise à validation

| Étape | Petit livrable | Critère de sortie |
| --- | --- | --- |
| 0 | Valider le besoin et les décisions ci-dessous | Accord sur périmètre et source de vérité |
| 1 | Inventaire automatisable des exports et tests de parité | Anciennes sauvegardes lues sans modification |
| 2 | Contrat asynchrone et adaptateur local, domaine pur | Même gameplay et mêmes exports locaux |
| 3 | Base de développement et authentification séparées | Deux comptes isolés, aucune bascule réelle |
| 4 | Tables cœur : profil, progression, arcs, quêtes, crédits, titres | Transactions et unicités testées |
| 5 | Import à blanc et aperçu des anomalies | Comparaison XP/historique/identifiants sans perte |
| 6 | Boss, sous-objectifs et sessions Focus | Une récompense malgré concurrence et retries |
| 7 | Lab et état de présentation choisi | Journal, parents et ressources conservés |
| 8 | Pilote opt-in d'un compte vide | Import complet confirmé et retour maîtrisé |
| 9 | Synchronisation multi-appareils en ligne | Conflits et interruptions explicitement gérés |
| 10 | Hors ligne avancé, uniquement si demandé | File de commandes et règles de résolution validées |

On peut copier certains modules en staging pour comparer, mais ne pas répartir les écritures actives d'un même compte entre local et serveur. La première bascule porte sur un snapshot complet ; les adaptations et tests peuvent avancer module par module.

Tests à exiger : imports versions 1/2, clé principale absente/legacy seule, compte sans historique XP, XP fractionnaires, IDs texte, Boss legacy/pondérés, achievements rétroactifs, archives et arc supprimé, reçus orphelins, import répété, rollback de transaction, réponse perdue après commit, quêtes concurrentes identiques/distinctes, dernier sous-objectif concurrent, révisions périmées, changement de semaine/mois/DST, accès inter-comptes interdit, invalidation de session et restauration des backups. Les tests métier et navigateur existants restent une base ; aucun test PostgreSQL/RLS n'existe encore dans l'application.

## 10. Décisions à valider avant toute implémentation

- Besoin : simple sauvegarde distante, synchronisation ou comptes multiples ?
- Cible : Supabase proposé ou PostgreSQL avec authentification séparée ? Région et budget ?
- Mode invité conservé et première version distante limitée aux mutations en ligne ?
- Import initial uniquement vers compte vide, sans fusion automatique ?
- Fuseau initial et traitement des ambiguïtés historiques ?
- Synchronisation des cinématiques/transitions ou préférence propre à l'appareil ?
- Conservation distante des journaux, âge et genre, et durée des sauvegardes brutes ?

Aucune méthode de stockage ne doit changer avant validation de ce plan. Ce document n'autorise ni création de service, ni installation de dépendance, ni transfert de données personnelles.
