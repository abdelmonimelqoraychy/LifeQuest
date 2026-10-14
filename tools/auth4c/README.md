# AUTH-4C — Parité privée et état après décision calendaire

État du 13 octobre 2026 : l’utilisateur valide PostgreSQL comme autorité
calendaire. Les commandes RPG passent les tests sur une stack locale fictive et
se ferment sans activation, en cas de dérive, ou après expiration de l’empreinte.
Aucune cible Supabase Cloud n’est disponible ; sa validation réelle reste
obligatoire avant d’activer les crédits sur cet environnement.

## État de reprise locale AUTH-4C

Les commandes des migrations 8/9/10 et la garde transactionnelle ont été
éprouvées sur une stack indépendante neuve. Pour reproduire la vérification
locale, fournir `LIFEQUEST_AUTH4C_STACK=commands_gate`, créer la cible une seule
fois avec `stack.cjs prepare`, puis suivre cet ordre :

```powershell
$env:LIFEQUEST_AUTH4C_STACK='commands_gate'
node tools/auth4c/stack.cjs start
node tools/auth4c/calendar-gate-check.cjs
node tools/auth4c/calendar-icu.cjs tools/auth4c/parity-check.cjs --with-gate-fixture
node tools/auth4c/calendar-icu.cjs tools/auth4c/calendar-check.cjs --with-fixtures
node tools/auth4c/calendar-icu.cjs tools/auth4c/activate-calendar.cjs
node tools/auth4c/rpc-check.cjs
node tools/auth4c/state-check.cjs capture
node tools/auth4c/stack.cjs stop
node tools/auth4c/stack.cjs start
node tools/auth4c/state-check.cjs verify
node tools/auth4c/stack.cjs stop
```

La pile actuelle contient cinq comptes/Hunters fictifs créés par les tests.
`prepare` refuse le dossier existant ; ne pas le relancer ni réinitialiser la
base. Le fichier d’empreinte de conservation refuse aussi l’écrasement. Les
arrêts conservent les volumes.

Cette procédure ne valide pas Supabase Cloud. Le seul fichier `.env.local`
actuel pointe vers localhost et le dépôt n’est lié à aucun projet distant. Toute
activation Cloud future doit viser une cible de staging autorisée, vérifier le
binaire PostgreSQL et la parité complète avant d’insérer une empreinte. Tant que
cette activation n’existe pas ou qu’elle ne correspond plus aux sondes, les RPC
refusent les crédits.

## Résolution calendaire démontrée

Nouvelle cible indépendante : `lifequest-auth4c-calendar-20261013`, ports
62321/62322/62324, shadow 62320. Les treize migrations existantes y sont
reconstruites depuis zéro, sans réécriture ni nouveau SQL. Node 24.19.0/ICU 78.3
embarque 2026b ; IANA 2026c modifie le calendrier marocain. La correction charge
les quatre ressources officielles ICU 2026e, épinglées par commit et SHA-256,
dans le **seul processus enfant de test**, sans modifier l'oracle ou PostgreSQL.

```powershell
$env:LIFEQUEST_AUTH4C_STACK='calendar'
node tools/auth4c/stack.cjs prepare # première création seulement, refuse l'existant
node tools/auth4c/stack.cjs start
node tools/auth4c/calendar-icu.cjs download
node tools/auth4c/calendar-icu.cjs tools/auth4c/diagnose.cjs
node tools/auth4c/calendar-icu.cjs tools/auth4c/parity-check.cjs
node tools/auth4c/calendar-icu.cjs tools/auth4c/calendar-check.cjs
node tools/auth4c/stack.cjs stop
```

Le harnais de parité conserve l'empreinte initiale existante .results de la
première étape ; pour un nouvel environnement de travail sans cette empreinte,
exécuter `node tools/auth4c/parity-check.cjs baseline` avant les modifications.
Ne pas écraser une baseline existante. Le downloader refuse un contenu ne
correspondant pas à calendar-resources.json. Les fichiers .res sont des données
officielles, pas des scripts exécutés ; aucun téléchargement à chaque requête
applicative, aucune installation globale ou modification de .env.local.

Résultat réel : matrice golden stricte code 0 (8 groupes/4 002 contrôles) ;
92 400 comparaisons de périodes et 23 100 offsets sur cinq zones, zéro divergence,
neuf voisinages de transitions testés. Les ressources sont little endian : un
autre runtime/architecture impose une validation et un paquet adapté.

La stratégie Cloud n'est pas adoptée implicitement : recommandé, calendrier
PostgreSQL serveur autoritatif avec contrôle de parité/versions sur chaque cible.
Alternative : table privée de transitions IANA versionnées, à concevoir après
décision. Impossible de promettre une version identique permanente entre tous
les navigateurs, Node et PostgreSQL managé. Attendre la décision utilisateur et
l'autorisation de reprendre les commandes ; aucun mutateur/reader créé ici.

## Historique de la première étape

Cette étape livre uniquement un oracle pur extrait des déclarations TypeScript actuelles,
huit fonctions SQL privées et les preuves de parité. **AUTH-4C est interrompu, non validé.**
Aucune commande RPG publique, garde de commande, reader ou intégration frontend.

Cible fixe indépendante : `lifequest-auth4c-parity-20261013`, dossier hors dépôt
`C:/Users/hp/myproject/lifequest-auth4c-parity-20261013`, ports API 61321, DB 61322,
SMTP 61324, shadow 61320. Aucun lien distant ; `lifequest`/`auth2_proof` exclus de
la Data API. Aucun compte n'est créé par ces tests. CLI/pg/TypeScript déjà installés
dans AUTH-2/frontend ; aucune dépendance supplémentaire.

Depuis la racine du dépôt, pour une première installation uniquement :

```powershell
node tools/auth4c/parity-check.cjs baseline
node tools/auth4c/stack.cjs prepare
node tools/auth4c/stack.cjs start
node tools/auth4c/parity-check.cjs
```

`prepare` refuse un dossier existant ; `baseline` refuse d'écraser une empreinte
initiale. La copie contient les dix sources AUTH-2/B inchangées, migration 7 et deux
correctifs additionnels 00701/00702. Les migrations déjà appliquées ne sont jamais
réécrites. La cible de cette intervention a reçu les deux corrections par montée
ordonnée après sa création à onze migrations ; aucune seconde reconstruction des
treize sources finales n'est revendiquée.

La commande normale s'arrête à la première divergence. Pour terminer uniquement
la caractérisation des calculs indépendants, en conservant l'échec calendaire :

```powershell
node tools/auth4c/parity-check.cjs --characterize
node tools/auth4c/diagnose.cjs
node tools/auth4c/stack.cjs stop
```

`--characterize` retourne **code 1** si des périodes divergent ; il ne transforme
pas ces comparaisons en succès. `.results` reste ignoré. Les credentials CLI et
le mot de passe temporaire du rôle limité restent en mémoire ; celui-ci retourne
NOLOGIN/password null en finally. Aucun reset, suppression de compte ou volume.
`stop` conserve les données. Ne pas afficher la sortie brute de `supabase status`.

Résultats exécutés : 2 781 comparaisons de récompenses, 406 progressions
représentables, 100 rangs, séries/attributs/six achievements. Les 200 comparaisons
de périodes couvrent cinq fuseaux ; deux échouent pour Casablanca au
`2026-12-31T23:30:00Z` (daily et monthly). PostgreSQL donne UTC+0, Node UTC+1.
Cette divergence bloque les commandes dépendant des jours et séries.

Le plus petit sous-normal JS `5e-324` est également refusé par l'entrée textuelle
float8 PostgreSQL (22003) : ce cas demeure explicitement non équivalent, sans
conversion en zéro. Les 406 succès l'excluent et ne prétendent pas couvrir tous
les nombres JS finis. Les futurs payloads/readers devront diagnostiquer les
valeurs non représentables avant toute écriture.

Décision utilisateur reçue pendant cette intervention : addition **décimale
exacte** pour les nouveaux soldes, divergence avec JS acceptée ; aucune ancienne
valeur arrondie et aucun delta automatique. Cette décision est testée sur une
fixture numérique, mais aucune commande de crédit n'est encore publiée.

Avant reprise : éprouver une source PostgreSQL/tzdata cohérente avec l'oracle sur
une nouvelle cible indépendante, sans modifier les données de référence. Ne pas
compenser Casablanca par un décalage fixe, ni adapter l'oracle pour masquer
l'échec. Rejouer ensuite les migrations finales depuis zéro et la matrice stricte,
puis seulement construire les commandes transactionnelles/leurs tests réels.
