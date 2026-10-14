# AUTH-2 — preuve locale de sécurité

Stack dédiée `lifequest-auth2`, données fictives uniquement. Ce prototype ne crédite aucune activité LifeQuest : son montant fixe de 7 sert exclusivement aux tests transactionnels. Ne pas publier ses RPC comme gameplay et ne pas l'appliquer à un projet distant.

Pré requis : Node 24.19.0 et Docker Linux actif. Depuis ce dossier :

```powershell
npm.cmd ci
npm.cmd run local:start
npm.cmd run local:migrate
npm.cmd test
npm.cmd run configure:local
```

CLI Supabase et pilote pg sont épinglés dans package.json/lockfile. Le CLI n'est pas installé globalement. Si docker n'est pas dans le PATH, ajouter son dossier pour ce processus uniquement. Les commandes start/status affichent normalement des credentials : conserver leur sortie dans le terminal privé, ne pas la copier dans le chat/rapport/logs. Le helper écrit la configuration publique locale dans frontend/.env.local et génère depuis AUTH-3 une clé de signature exclusivement serveur. Il refuse une cible distante et préserve tout fichier préexistant.

Lancer ensuite le build et le serveur Next depuis frontend (port 3102 libre), puis revenir ici :

```powershell
$env:LIFEQUEST_TEST_URL='http://127.0.0.1:3102'
npm.cmd run test:app
npm.cmd run test:bundle
```

Les contrôles utilisent de vrais comptes Auth temporaires, JWT, appels REST/RPC et un pool PostgreSQL à un client. Le credential administratif local ne sert qu'à la fixture et à son nettoyage, jamais au gameplay ou à la commande testée. Seuls les comptes générés pendant le test sont nettoyés ; aucune réinitialisation de base. Les rôles de mutation ne possèdent pas les tables et ne contournent pas RLS. Les helpers privilégiés retournent seulement l'identité courante ou un booléen de session, jamais les lignes Auth.

`test:app` vérifie les cookies SSR, A/B/A, cookie falsifié, refresh et révocation via `/api/auth/bootstrap`. Ce bootstrap retourne `cloud_not_connected`, aucune donnée Hunter. Pendant AUTH-2, les gardes globales et pages login/register restaient différées. AUTH-3 ci-dessous les ajoute avec un écran d'attente ; le chargement RPG cloud reste réservé à AUTH-4. Aucun accès invité du produit final ni publication complète ne résulte de cette preuve locale.

`test:bundle` compare les assets clients aux credentials privés locaux sans imprimer leurs valeurs. Ce contrôle est limité au build testé. `.results` et `.env.local` ne doivent pas être versionnés. Pour arrêter sans effacer les données locales : `npm.cmd run local:stop`. Aucun `db reset`, `stop --no-backup` ou `db push` dans cette procédure.

## AUTH-3 : confirmations et récupération réelles

La configuration locale exige désormais la confirmation et utilise la boîte SMTP locale sur 54324. Les modèles `supabase/templates` transmettent un `token_hash` à `/auth/confirm` ; le serveur vérifie ce lien avec Supabase. Les tests AUTH-2 confirment leurs fixtures par cette même boîte, sans confirmation artificielle. La boîte contient des liens sensibles : ne pas exposer son API ni copier ses messages dans les rapports.

Après `local:start`, pour un `.env.local` AUTH-2 existant, exécuter `npm.cmd run configure:recovery`. Cela ajoute exclusivement une clé de signature aléatoire manquante, sans remplacer les variables existantes. Pour une nouvelle configuration, `configure:local` génère aussi cette clé. `AUTH_RECOVERY_SECRET` est exclusivement serveur, ignorée par Git, jamais préfixée `NEXT_PUBLIC`. Sa rotation invalide les autorisations de récupération en cours, sans effacer une sauvegarde Hunter. En production, la stocker dans le gestionnaire de secrets et la partager entre les instances autorisées.

Construire depuis frontend, puis lancer le serveur de test avec son origine exacte :

```powershell
$env:APP_ORIGIN='http://127.0.0.1:3102'
npm.cmd run build
npm.cmd start -- --port 3102 --hostname 127.0.0.1
```

Depuis tools/auth2, dans un autre terminal avec Docker dans le PATH :

```powershell
npm.cmd test
npm.cmd run test:app
npm.cmd run test:auth3
npm.cmd run test:auth3-browser
npm.cmd run test:bundle
```

Les harnais n'acceptent que localhost/127.0.0.1, créent des adresses fictives uniques et nettoient uniquement leurs propres comptes. L'expiration de liens est simulée par modification des timestamps de ces seules fixtures ; les liens et sessions sont véritablement vérifiés par Auth. Chrome de test est isolé dans `.results`. Les traces et captures ignorées ne contiennent pas de valeurs privées dans les sorties console.

`frontend/scripts/browser-check.cjs` est préservé : son ancien parcours gameplay local anonyme ne correspond plus aux gardes AUTH-3. Ne pas ajouter de bypass pour le faire passer. Les tests métier locaux continuent de vérifier F01–F06 et le désarchivage ; les interfaces métier seront testées avec de vrais readers cloud en AUTH-4.
