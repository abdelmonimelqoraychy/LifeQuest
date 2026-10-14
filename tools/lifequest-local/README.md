# Installation locale personnelle — LifeQuest

Cible explicitement sélectionnée : `lifequest-personal-local-20261014`, dossier
`C:\Users\hp\myproject\lifequest-personal-local-20261014`.

| Service | Adresse locale |
| --- | --- |
| PostgreSQL shadow | 64720 |
| API Supabase | 64721 |
| PostgreSQL | 64722 |
| Studio | 64723 |
| Mailpit | 64724 |
| Next.js | 31770 |

Les 27 migrations sont copiées avec SHA-256 et appliquées dans leur ordre. Le
schéma Data API exposé est `public`; les tables Hunter restent privées et sous
FORCE RLS. La configuration personnelle est isolée dans le dossier externe.
`frontend/.env.local` n’est pas remplacé. Le lanceur choisit explicitement le
profil personnel et remplace les variables concernées uniquement dans le
processus Next. Les fichiers d’environnement, preuves, sauvegardes et PID sont
ignorés par Git et restent dans la cible externe.

## Démarrer et arrêter

Depuis l’Explorateur, exécuter `Open LifeQuest.cmd` pour vérifier puis démarrer
uniquement cette stack si nécessaire, lancer Next sur `127.0.0.1:31770` et ouvrir
la page de connexion. La configuration Next utilise l’URL API locale et la clé
publique de la stack ; aucune clé `service_role` n’est enregistrée.

Le lanceur exige le moteur Docker Linux, vérifie l’identité du projet local,
réutilise un serveur Next déjà identifié par son PID et refuse tout port 31770
occupé par un processus inconnu. Le démarrage quotidien lance uniquement les
conteneurs de cette cible : il ne lance pas `supabase migration up`, ne consulte
aucune table de compte et n’exécute aucun reset. Les erreurs de disponibilité
Docker, des ports et de Next sont affichées clairement. Les journaux de Next
sont conservés dans `logs/next.log` dans le dossier local ignoré.

`Stop LifeQuest.cmd` arrête le processus Next identifié, puis exécute `supabase
stop` dans le dossier du projet personnel. La commande conserve les volumes.
Les équivalents en ligne de commande, lancés depuis la racine du dépôt, sont :

```powershell
node tools/lifequest-local/stack.cjs status
node tools/lifequest-local/daily.cjs open
node tools/lifequest-local/daily.cjs stop-next
node tools/lifequest-local/daily.cjs stop
```

`stop` arrête le processus Next vérifié puis appelle `supabase stop` sur le
projet personnel ; les volumes PostgreSQL sont conservés. Il ne nettoie aucun
conteneur ou volume d’une autre stack.

Les URL locales sont `http://127.0.0.1:31770`, Studio `http://127.0.0.1:64723`
et Mailpit `http://127.0.0.1:64724`. Mailpit ne délivre pas de courrier externe.
Les confirmations et liens de récupération restent locaux.

## Calendrier et crédits

Les crédits utilisent le fuseau Hunter confirmé et le temps PostgreSQL. Le
navigateur ne fournit aucune période autoritative. Sur cette cible, la matrice
stricte a passé avec PostgreSQL 17.11 et Node 24.19/ICU 2026e : 92 400 périodes,
23 100 offsets et neuf voisinages de transitions, sans divergence. Une empreinte
locale de 24 heures est activée pour UTC, Casablanca, Paris, New York et Auckland.
Les RPC refusent les crédits si l’activation est absente, périmée ou si le digest
du calendrier a dérivé. Les reçus historiques ne sont pas recalculés. Après
expiration, une nouvelle validation locale contrôlée est requise avant de
renouveler l’activation.

## Sauvegarde

La commande suivante crée une archive custom-format de **toute** la base
PostgreSQL sous `backups/`, hors dépôt, avec un manifeste SHA-256 :

```powershell
node tools/lifequest-local/backup.cjs backup
```

L’archive complète contient les comptes Auth et toutes leurs données RPG. Elle
doit être conservée comme donnée privée. Une restauration doit toujours viser une
nouvelle stack ou une base fictive indépendante ; ne jamais restaurer par-dessus
la base personnelle existante sans autorisation explicite. Le test de
restauration a été exécuté avec succès sur une stack indépendante contenant
uniquement une identité synthétique `example.test`; il n’a pas utilisé la base
personnelle. La base personnelle contient une identité dont la provenance n’est
pas établie : aucune archive complète de cette base n’a été créée. Ne lancez pas
`backup.cjs` tant que cette identité n’a pas été reconnue.

La preuve indépendante a utilisé le projet
`lifequest-backup-restore-test-20261014`, ports 64820–64824. Une archive
custom-format a été restaurée dans la nouvelle base `lifequest_restore_verify`;
les agrégats des 27 migrations, du compte fictif et du Hunter correspondent.
Cette stack d’essai est arrêtée avec ses volumes conservés. Elle est une preuve
de procédure, pas une sauvegarde des données personnelles.

## Validation actuelle

Typecheck, lint, 186 tests frontend et build passent. Les suites SQL/Auth/RPC et
Chrome ont passé sur les ports indiqués, avec des comptes `example.test`. Une
fixture ready d’interface est synthétique : son profil et son setup ont été
préparés par le harnais afin de tester les écrans RPG ; aucun champ de vidéo,
cinématique ou checkpoint n’a été écrit. L’introduction et l’onboarding réels
ont été vérifiés séparément par Chrome sur un autre compte fictif.

Le contrôle post-test a relevé un compte dont le domaine n’est pas
`example.test`. Son adresse n’a pas été affichée, et le compte n’a pas été
modifié. La provenance reste inconnue ; sauvegarde, restauration et redémarrage
avec comparaison d’état sont suspendus jusqu’à identification. Les preuves
agrégées et le rapport sont dans `validation/`, hors Git.
