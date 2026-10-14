# AUTH-4B — schéma et sécurité locaux

Résultats dans `docs/AUTH_4_IMPLEMENTATION_REPORT.md`, section 10 : **21 groupes SQL/Auth réussis**, reconstruction neuve des sources finales et conservation après stop/start. Aucun RPC RPG, reader applicatif ni raccordement frontend. Attendre la validation utilisateur avant AUTH-4C.

La cible de référence est **lifequest-auth4b-release-20261013**, hors dépôt dans `C:/Users/hp/myproject/lifequest-auth4b-release-20261013`. API 60321, PostgreSQL 60322, SMTP 60324, shadow 60320. Son profil Data API expose seulement public; lifequest et auth2_proof sont privés. Aucun lien distant. La cible originale lifequest-auth2 et sa configuration restent inchangées.

Outillage réutilisé : CLI et pg épinglés dans `tools/auth2`; aucune installation supplémentaire. `stack.cjs` capture les credentials CLI en mémoire, exige ces endpoints locaux et ne les affiche pas. Aucun fichier d'environnement créé. `check.cjs` utilise le login administratif local uniquement pour les fixtures/catalogues; ce login ne fait pas partie du runtime Next. Les rôles testés reçoivent temporairement des logins aléatoires en mémoire, puis NOLOGIN et password null en finally. Les comptes sont exclusivement fictifs et conservés pour la preuve de redémarrage; aucun nettoyage DELETE.

Depuis la racine du dépôt, avec Docker Linux actif :

```powershell
$env:LIFEQUEST_AUTH4B_STACK='release'
node tools/auth4b/stack.cjs start
node tools/auth4b/check.cjs
```

La base a dix versions enregistrées, et les dix sources finales correspondent exactement à la reconstruction vérifiée. **Ne pas appliquer ces migrations à la base originale.** Les autres modes initial/rebuild/final/verified désignent les anciennes bases de mise au point conservées et arrêtées sur 563xx/573xx/583xx/593xx. Le mode release reste exclusivement une preuve locale, sans déploiement. Pour une installation neuve, ajouter explicitement un identifiant/dossier/ports libres à la whitelist de stack.cjs, puis prepare/start. prepare refuse tout dossier existant; il copie config/templates/migrations sans données. Sur une autre machine, adapter les chemins locaux fixes. Ne pas recycler une base conservée avec reset.

Les inscriptions/confirmations SMTP sont réelles et les comptes exclusivement fictifs. Le harnais contient une injection de panne de provisioning par un CHECK temporaire NOT VALID retiré en finally, plus une réentrée du trigger via table temporaire. Les sessions ne sont verrouillées que sur les fixtures; logout/refresh utilisent les opérations Auth normales. L'expiration pendant attente utilise des claims SQL synthétiques; séparément un JWT local réellement signé mais expiré est refusé par PostgREST. Ces tests ne portent pas encore de calculs/RPC RPG.

Le rapport `.results/<project>-report.json` conserve les labels, IDs fictifs, versions et hash Hunter, aucun token/e-mail/mot de passe/ligne Auth. Vérifier la conservation des vingt tables de la dernière paire fictive, migrations et NOLOGIN :

```powershell
node tools/auth4b/stack.cjs stop
node tools/auth4b/stack.cjs start
node tools/auth4b/restart-check.cjs
node tools/auth4b/stack.cjs stop
```

Le contrôle `catalog-check.sql` est indépendant et en lecture seule. Il passe via psql dans le conteneur, mais ne remplace pas les connexions authentifiées ni les tests de concurrence :

```powershell
Get-Content -Raw -Encoding UTF8 tools/auth4b/catalog-check.sql |
  & 'C:/Users/hp/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe' exec -i supabase_db_lifequest-auth4b-release-20261013 psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -qAt
```

Diagnostic sans secret pour vérifier le problème de forwarding depuis Node :

```powershell
node -e "fetch('http://127.0.0.1:60321/auth/v1/health').then(r=>console.log(r.status)).catch(e=>console.log(e.cause?.code||e.name))"
```

Après essais, arrêter sans effacement : `node tools/auth4b/stack.cjs stop`. Les sauvegardes/volumes restent hors Git. Ne jamais utiliser `db reset`, `stop --no-backup`, `db push`, supprimer un volume, un projet distant ou une clé service_role pour contourner un résultat refusé. `.results` contient les preuves locales et reste ignoré. Les commandes/retries/parité, snapshots applicatifs et frontend cloud restent AUTH-4C/D/E; ces outils ne sont pas des APIs produit.
