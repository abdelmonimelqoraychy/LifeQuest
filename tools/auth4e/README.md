# AUTH-4E-R — Tests locaux d’intégration

Stack dédiée : `lifequest-auth4e-frontend-20261013`, dossier
`C:/Users/hp/myproject/lifequest-auth4e-frontend-20261013`, API 64621, PostgreSQL
64622, SMTP 64624 et shadow DB 64620. Elle contient 23 migrations appliquées et
des comptes exclusivement fictifs `example.test`. Son volume persistant est
`supabase_db_lifequest-auth4e-frontend-20261013`.

La dernière campagne a arrêté les conteneurs sans supprimer le volume. Le
répertoire est déjà préparé et peuplé ; **ne pas relancer `prepare`, `migrate`,
`rpc-check`, ni un reset**. La suite RPC exige une base vierge. Aucun outil de ce
dossier ne cible Supabase Cloud, `lifequest-auth2` ou une ancienne stack.

Résultats réels de la campagne : 21 groupes RPC/Auth réussis, matrice calendaire
stricte de 92 400 comparaisons sans divergence, `typecheck`, `lint`, 185 tests et
build réussis. Chrome a validé six groupes jusqu’au parcours pending ; le flux de
récupération n’a pas validé la reconnexion après changement de mot de passe. Les
pages Hunter prêtes ne sont pas validées visuellement ; elles attendent AUTH-5 et
les contraintes sur les checkpoints.

`audit.cjs` est une vérification agrégée en lecture seule, épinglée au projet
AUTH-4E. Elle n’imprime ni identités, ni reçus, ni credentials. Pour inspecter
l’état conservé après avoir redémarré la stack autorisée :

```powershell
node tools/auth4e/stack.cjs start
node tools/auth4e/stack.cjs status
node tools/auth4e/audit.cjs
```

Elle a été laissée arrêtée après l’audit final. Pour la stopper à nouveau, utiliser
`node tools/auth4e/stack.cjs stop` sans option d’effacement. Le volume contient
18 comptes synthétiques, 17 reçus XP et 63 reçus de commandes ; ses trois profils
avec `onboarding_completed=true` sont des fixtures artificielles créées par le
harnais RPC et ne représentent pas un parcours AUTH-5. Ne pas les interpréter
comme des utilisateurs ou une progression produit réelle.

Le serveur Next d’essai écoute uniquement 127.0.0.1:31646 et a été arrêté. Les
valeurs publiques de Supabase et le secret temporaire de récupération restaient
dans la mémoire du processus ; `frontend/.env.local` n’a pas été modifié.
