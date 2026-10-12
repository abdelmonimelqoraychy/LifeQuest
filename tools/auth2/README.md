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

CLI Supabase et pilote pg sont épinglés dans package.json/lockfile. Le CLI n'est pas installé globalement. Si docker n'est pas dans le PATH, ajouter son dossier pour ce processus uniquement. Les commandes start/status affichent normalement des credentials : conserver leur sortie dans le terminal privé, ne pas la copier dans le chat/rapport/logs. La configuration helper ne transmet que l'URL locale et la clé publishable à frontend/.env.local, refuse une cible distante et préserve tout fichier préexistant.

Lancer ensuite le build et le serveur Next depuis frontend (port 3102 libre), puis revenir ici :

```powershell
$env:LIFEQUEST_TEST_URL='http://127.0.0.1:3102'
npm.cmd run test:app
npm.cmd run test:bundle
```

Les contrôles utilisent de vrais comptes Auth temporaires, JWT, appels REST/RPC et un pool PostgreSQL à un client. Le credential administratif local ne sert qu'à la fixture et à son nettoyage, jamais au gameplay ou à la commande testée. Seuls les comptes générés pendant le test sont nettoyés ; aucune réinitialisation de base. Les rôles de mutation ne possèdent pas les tables et ne contournent pas RLS. Les helpers privilégiés retournent seulement l'identité courante ou un booléen de session, jamais les lignes Auth.

`test:app` vérifie les cookies SSR, A/B/A, cookie falsifié, refresh et révocation via `/api/auth/bootstrap`. Ce bootstrap retourne `cloud_not_connected`, aucune donnée Hunter. La garde globale, les pages login/register et le chargement RPG cloud restent des phases suivantes. Les routes locales historiques n'ont pas été converties en accès invité du produit final : aucune publication Auth complète n'est autorisée à ce stade.

`test:bundle` compare les assets clients aux credentials privés locaux sans imprimer leurs valeurs. Ce contrôle est limité au build testé. `.results` et `.env.local` ne doivent pas être versionnés. Pour arrêter sans effacer les données locales : `npm.cmd run local:stop`. Aucun `db reset`, `stop --no-backup` ou `db push` dans cette procédure.
