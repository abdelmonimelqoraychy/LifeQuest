# AUTH-4D — snapshot reader local

La phase ajoute le reader via les migrations ordonnées `20261013001100` à `20261013001300` : snapshot, sérialisation exacte et correction d'alias. Deux RPC de lecture privées par acteur et des façades Next sont exposées. Aucun composant RPG n'est raccordé. L'ancien `/api/auth/bootstrap` conserve `cloud_not_connected`.

## Stack indépendante et vérifications

Utiliser uniquement la stack fictive `lifequest-auth4d-reader-20261013` (API 64521, DB 64522, SMTP 64524, shadow 64520). Elle copie les vingt migrations AUTH-2/4B/4C inchangées puis les trois migrations AUTH-4D. `prepare` refuse un dossier existant. Les arrêts conservent le volume.

```powershell
$env:LIFEQUEST_AUTH4C_STACK='reader'
node tools/auth4d/stack.cjs prepare # une seule fois sur le poste
node tools/auth4d/stack.cjs start
node tools/auth4d/stack.cjs migrate
node tools/auth4d/catalog-check.cjs
node tools/auth4d/helper-check.cjs
node tools/auth4d/reader-check.cjs
node tools/auth4d/build.cjs
node tools/auth4d/app-check.cjs
node tools/auth4d/stack.cjs stop
```

La stack finale contient déjà les identités synthétiques créées par les suites, y compris les inscriptions laissées par des assertions interrompues. Les scripts vérifient que tous les comptes sont `example.test`; aucun résultat Auth, e-mail, token ou secret n'est imprimé. Les suites reader et HTTP peuvent ajouter d'autres fixtures synthétiques. Ne pas afficher la sortie brute de `supabase status`, ne pas relancer `prepare` si le dossier existe et ne pas supprimer de volumes.

Pour rejouer la parité pure et le calendrier sur cette pile peuplée uniquement de fixtures, fournir les données ICU 2026e déjà vérifiées dans `tools/auth4c/.results`, puis lancer :

```powershell
$env:LIFEQUEST_AUTH4C_STACK='reader'
node tools/auth4c/calendar-icu.cjs tools/auth4c/parity-check.cjs --with-reader-fixtures
node tools/auth4c/calendar-icu.cjs tools/auth4c/calendar-check.cjs --with-reader-fixtures
```

Ces deux vérifications calculent les helpers privés et lisent le calendrier; elles n'appellent aucune commande RPG. La pile AUTH-4D attend 23 migrations, dont les quatre AUTH-2 et les migrations AUTH-4B/C/D.

## Contrat du reader

`POST /rest/v1/rpc/lifequest_hunter_snapshot` agrège les tables dans une fonction PostgreSQL `STABLE`, avec le même snapshot MVCC pour tous les SELECT. Le JWT, l'acteur, l'état Auth, les modules et leurs compteurs sont vérifiés. Les seuls grants applicatifs nouveaux sont `EXECUTE` authentifié sur les deux RPC de lecture; aucune table privée n'est exposée.

Les soldes et valeurs XP restent des chaînes décimales exactes; toutes les revisions bigint deviennent des chaînes. Ordre, IDs et objets `historical` sont conservés. Une absence d'en-tête, un compte incohérent, un ledger qui ne se rapproche pas, un total non projetable ou un snapshot supérieur à 5 MiB échoue explicitement.

La route serveur `/api/hunter/bootstrap` est séparée du bootstrap Auth existant et n'est encore appelée par aucune page. La route `/api/hunter/receipts/[requestId]` ne lit que le reçu demandé pour l'acteur vérifié. `ready` n'est renvoyé que si le setup et toutes ses données réelles sont complets. Le profil, les cinématiques et la finalisation restent AUTH-5.
