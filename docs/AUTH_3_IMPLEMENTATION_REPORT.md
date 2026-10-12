# AUTH-3 — Inscription, connexion et sessions Hunter

Finalisation : 13 octobre 2026. Travail commencé le 12 octobre. Références : AGENTS.md, AUTH-1 validé, AUTH-2 et demande AUTH-3 jointe. **Flux Auth et protection applicative implémentés et testés localement. La progression cloud reste indisponible ; AUTH-4 et AUTH-5 ne sont pas commencés. Aucun commit ni publication.**

## 1. Architecture et périmètre

Branche `feature/lifequest-improvements`, HEAD initial et final `8f036dc`. Le dépôt était propre au démarrage. Next 16.4.0, React 19.3.0, TypeScript 5.9.3 et les SDK épinglés d'AUTH-2 sont conservés ; aucune nouvelle dépendance installée. Les quatre migrations AUTH-2 restent inchangées.

Supabase local `lifequest-auth2` est utilisé exclusivement avec des comptes fictifs. API 54321, PostgreSQL 54322, boîte SMTP 54324. Aucun projet distant, reset, drop ou suppression de volume. La copie de reconstruction AUTH-2 n'est pas utilisée.

Les opérations Auth passent par des Route Handlers Next et des clients SSR créés par requête. Supabase reste l'autorité des identités, mots de passe et sessions. L'architecture RPC d'AUTH-2 est conservée ; aucune formule XP n'est portée en SQL ni appelée par ces formulaires.

Après connexion ou confirmation, `/auth/loading` charge le bootstrap réel. Sa seule réponse métier est `cloud_not_connected` : **« Progression Hunter en préparation »**. Aucun niveau, profil, avatar, XP ou checkpoint Hunter fictif n'est créé ou affiché.

## 2. Pages et parcours

| Route | Comportement livré |
| --- | --- |
| `/` | Accueil public, liens connexion/inscription ; aucune lecture de profil ou de clés historiques. |
| `/register` | E-mail, mot de passe de 12 à 128 caractères, confirmation, validation et soumission protégée ; réponse générique invitant à consulter les e-mails. |
| `/login` | E-mail/mot de passe, erreurs génériques, liens inscription/récupération ; session confirmée et active requise avant redirection. |
| `/forgot-password` | Demande de lien de récupération ; réponse identique pour une adresse inconnue. |
| `/auth/confirm` | Vérification serveur de `token_hash`, types `email` ou `recovery` uniquement ; destination fixe et URL nettoyée par redirection. |
| `/update-password` | Session active et autorisation de récupération liée à cette session ; nouveau mot de passe puis révocation globale et nouvelle connexion. |
| `/auth/loading` | Vérification serveur, bootstrap client revalidé et écran d'attente authentifié. |

La confirmation est obligatoire dans la configuration locale. Un signup sans session ne donne aucun accès métier. Aucun démarrage d'introduction, onboarding ou activation n'est effectué. Les liens expirés ou consommés conduisent à un message explicite et à une nouvelle demande possible.

Le flux choisi utilise `token_hash`, pas un échange PKCE nécessitant un verifier dans le navigateur d'origine. La vérification par Supabase est réelle et a réussi dans un second profil Chrome indépendant. Les modèles et le handler suivent le mécanisme décrit dans les [modèles Supabase](https://supabase.com/docs/guides/local-development/customizing-email-templates) et la [documentation SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client).

## 3. Sessions, récupération et déconnexion

Le Proxy rafraîchit les cookies sur les routes applicatives. Les gardes utilisent `getUser`, refusent les utilisateurs anonymes/non confirmés et interrogent `lifequest_session_active`. Aucun cookie brut, `getSession` ou état React n'est accepté comme autorisation. Les Server Components utilisent un adaptateur sans écriture de cookies ; le Proxy et les handlers assurent leurs écritures.

Les réponses Auth sont privées, sans cache partagé. Les cookies SDK utilisent SameSite=Lax et Secure quand l'origine canonique est HTTPS. Ils ne sont pas présentés comme globalement HttpOnly. L'autorisation de récupération, distincte, est un cookie HttpOnly/SameSite=Strict signé HMAC, valable dix minutes, lié à l'acteur et au `session_id` vérifiés. Une session ordinaire, une signature altérée ou une autorisation copiée vers une autre session sont refusées par l'API de récupération LifeQuest.

`AUTH_RECOVERY_SECRET` est une nouvelle variable exclusivement serveur : 48 octets aléatoires générés localement, jamais affichés ni préfixés `NEXT_PUBLIC`. Elle est ajoutée au fichier ignoré existant sans remplacer ses autres variables. Les helpers de configuration sont reproductibles ; une clé existante est conservée. En déploiement multi-instance, cette clé devra être fournie par un gestionnaire de secrets et partagée entre les instances autorisées.

La déconnexion masque l'espace avant l'appel réseau et invalide l'époque des requêtes. Une réponse tardive n'est appliquée qu'à l'époque et à l'acteur attendus. BroadcastChannel transmet seulement des signaux, sans token, e-mail, progression ou identifiant. Les onglets revalident au focus, au retour visible, à pageshow et périodiquement toutes les trente secondes.

Un marqueur de verrouillage négatif en cookie maintient l'espace masqué après un échec de déconnexion, y compris après recharge. Ce marqueur ne prouve jamais une identité et ne donne aucune permission. Une déconnexion réussie ou une nouvelle authentification vérifiée l'efface. Une erreur réseau ne réaffiche pas l'espace privé ; la reprise de déconnexion est proposée. Les sauvegardes localStorage historiques ne sont pas effacées.

## 4. Gardes serveur et frontière F05

Des layouts serveur protègent dashboard, quests/create, quests, arcs, hunter-core, hunter-operations, hunter-lab, onboarding et activation. Sans session, la navigation mène à `/login`. Avec une session vérifiée, leurs anciens enfants RPG ne sont **jamais montés** : ils sont remplacés par l'écran d'attente. Un verrou ou une panne de vérification produit uniquement un état neutre masqué.

Les fichiers des pages et composants RPG restent présents et inchangés. Leur réactivation avec des readers cloud appartient à AUTH-4. Aucun bypass de développement ou mode invité n'est ajouté.

La boundary F05 est retirée du layout racine public pour que son journal ne bloque plus l'identité. Son composant, ses moteurs, validateurs et protections locales restent inchangés. Aucune interface historique de récupération/migration n'est exposée dans AUTH-3 ; cette frontière devra être remontée explicitement autour de la récupération autorisée en AUTH-6. Les readers/writers locaux ne sont pas utilisés par les pages Auth.

L'unique API antérieure était le bootstrap. Les nouveaux handlers Auth valident Origin contre `APP_ORIGIN`, exigent JSON et limitent le corps à 4096 octets. Les destinations sont fixes : `next`, `returnTo`, schémas externes et URLs fournies par le lien ne pilotent aucune redirection. Les limites Auth de Supabase restent actives ; les contrôles de débit distribués de l'hébergement restent à définir.

## 5. E-mails locaux

`supabase/config.toml` active les confirmations et référence deux modèles versionnés : confirmation et récupération. Les redirect URLs sont exactes pour le développement sur 3000 et les tests sur 3102, sans wildcard. Le serveur de test reçoit `APP_ORIGIN=http://127.0.0.1:3102` dans son processus ; l'origine habituelle du fichier local est conservée.

Le service de courrier local est accessible par son API de messages. Les fixtures lisent leurs seuls messages en mémoire pour vérifier les liens ; aucun corps, e-mail généré, mot de passe ou token n'est imprimé. Avant développement, une inscription réelle, l'absence de session avant confirmation, la réception SMTP et la vérification du lien ont été exercées.

Les fixtures AUTH-2 ont été adaptées pour confirmer leurs comptes par cette boîte. Elles ne désactivent pas la confirmation et ne fabriquent pas de session. Les fixtures d'expiration modifient uniquement le timestamp du compte fictif généré dans le test, puis font vérifier le vrai lien par Auth.

## 6. Résultats exécutés

| Contrôle pendant AUTH-3 | Résultat réel |
| --- | --- |
| `npm run typecheck` | Code 0. |
| `npm run lint` | Code 0, zéro avertissement après correction du cleanup de l'effet. |
| `npm test` | Code 0, **181 tests réussis**, zéro échec ; tests existants conservés. |
| `npm run build` | Code 0 ; build final comprenant la correction des accents de l'accueil. |
| `tools/auth2/security-check.cjs` | Code 0, **12 groupes SQL/Auth**, confirmation SMTP activée. |
| `tools/auth2/app-check.cjs` | Code 0, **5 groupes SSR**, isolation A/B/A, cookie forgé, refresh d'un JWT réellement expiré et révocation. |
| `tools/auth2/auth3-check.cjs` | Code 0, **9 groupes HTTP Auth**, nombreuses assertions. |
| `tools/auth2/auth3-browser.cjs` | Code 0, **9 groupes Chrome**, zéro exception JavaScript dans la suite finale. |
| `tools/auth2/bundle-check.cjs` | Code 0, **29 assets clients** comparés aux quatre valeurs privées locales, sans affichage. |
| Syntaxe Node des nouveaux harnais/configuration | Code 0. |
| `git diff --check` | Code 0 ; avertissements habituels LF/CRLF seulement. |

Les douze groupes SQL/Auth couvrent anon, isolation A/B, refus de DML direct, substitution d'acteur par RPC, JWT falsifié/expiré, idempotence et concurrence, rollback, pool direct A/B, privilèges et EXECUTE effectifs, puis révocation. Aucune nouvelle preuve de Supavisor ou de rôle distant n'est revendiquée.

Les neuf groupes HTTP AUTH-3 couvrent mot de passe faible et CSRF, inscription non confirmée, confirmation dans une autre jar de cookies, réutilisation et redirection externe ignorée, doublon masqué et connexion valide/refusée, les neuf chemins métier, récupération avec signature/session vérifiées, mot de passe changé et révocation globale, logout, confirmation expirée et récupération expirée/adresse inconnue.

Les neuf groupes Chrome couvrent desktop/mobile et reduced motion, formulaire d'inscription malgré un journal F05 fictif, confirmation dans un autre profil, login/logout dans deux onglets, retour navigateur et accès direct, A→B, erreurs réseau ciblées puis reprise, formulaires forgot/update-password et connexion avec le nouveau mot de passe, verrou après logout échoué/recharge/retry, focus clavier et absence d'exception JavaScript.

Les sentinelles historiques sont fictives et placées uniquement dans les profils Chrome de test. Une instrumentation enregistre toute lecture/écriture/suppression `lifequest*` par l'application : aucune n'a été observée. Leurs valeurs restent identiques après connexion, changement de compte, récupération et déconnexion. Il ne s'agit pas d'un test sur les sauvegardes personnelles du navigateur de l'utilisateur.

Les anciennes **67 observations** du script gameplay anonyme ne sont pas relancées sous AUTH-3 : ce parcours est désormais protégé. Le script est conservé sans bypass ; ses succès AUTH-2 restent historiques. Les règles F01–F06 et le désarchivage continuent d'être exercés par les 181 tests.

## 7. Mise au point et limites des essais

La première sonde SMTP pouvant imprimer des corps a été rejetée automatiquement ; les diagnostics ont ensuite été limités aux métadonnées et les messages traités en mémoire. Un PATH Docker absent a aussi fait échouer la première sonde de fixture avant création de compte ; le prérequis a ensuite réussi avec le chemin explicite.

Une première assertion reduced motion attendait strictement zéro seconde alors que le thème existant impose une durée quasi nulle ; elle a été adaptée à ce comportement. Plusieurs nouvelles assertions françaises ont été altérées par l'encodage du pipeline PowerShell : les chaînes, ainsi que le texte de l'accueil concerné, sont corrigées en UTF-8. Ces exécutions échouées ne sont pas comptées comme suites réussies.

La sonde de coupure complète Chrome et la dernière capture ont produit des résultats non exploitables/timeouts. Le harnais final attend explicitement les nouveaux documents, met l'onglet capturé au premier plan et simule `InternetDisconnected` sur les seuls appels Auth par interception CDP. La suite finale entière réussit. Cela valide les erreurs de fetch et la reprise, **pas une panne physique prolongée du réseau**. Une relance avait aussi été empêchée par une limite d'usage du contrôle d'approbation ; après la demande de continuation, l'exécution autorisée a pu reprendre.

Le dernier build suit une correction textuelle de l'accueil public ; les tests HTTP et Chrome portent sur la même logique Auth que ce build, sans modification fonctionnelle postérieure. Les captures d'inscription mobile, connexion desktop et attente mobile ont été inspectées. Aucun Firefox/Safari, lecteur d'écran humain, délivrabilité SMTP distant ou scanner de liens d'entreprise n'est testé.

## 8. Fichiers modifiés et créés

Modifiés :

- `frontend/.env.example` : nom/placeholder de la clé serveur de récupération.
- `frontend/src/app/layout.tsx`, `page.tsx` : séparation de la boundary historique et accueil public.
- `frontend/src/app/api/auth/bootstrap/route.ts` : refus d'un espace verrouillé.
- `frontend/src/lib/supabase/server.ts`, `proxy.ts`, `frontend/src/proxy.ts` : cookies serveur/Proxy et couverture des routes.
- `supabase/config.toml` : confirmations, redirect URLs et modèles locaux.
- `tools/auth2/README.md`, `package.json`, `configure-local.cjs` : reproduction AUTH-3 et configuration sécurisée.
- `tools/auth2/security-check.cjs`, `app-check.cjs`, `bundle-check.cjs` : confirmation réelle des fixtures et vérification du nouveau secret serveur.

Créés :

- `frontend/src/app/register/page.tsx`, `login/page.tsx`, `forgot-password/page.tsx`, `update-password/page.tsx`.
- `frontend/src/app/auth/confirm/route.ts`, `auth/loading/page.tsx`.
- `frontend/src/app/api/auth/[action]/route.ts`.
- Layouts sous `activation`, `arcs`, `dashboard`, `hunter-core`, `hunter-lab`, `hunter-operations`, `onboarding`, `quests`.
- `frontend/src/components/auth/AuthShell.tsx`, `AuthForm.tsx`, `HunterPending.tsx`, `ProtectedHunter.tsx`, `auth.module.css`.
- `frontend/src/lib/auth/session.ts`, `requests.ts`, `recovery.ts`.
- `supabase/templates/confirmation.html`, `recovery.html`.
- `tools/auth2/mail-fixture.cjs`, `auth3-check.cjs`, `auth3-browser.cjs`, `configure-recovery.cjs`.
- Ce rapport.

Le fichier `.env.local`, `.next`, `.browser-check`, les profils/captures/résultats `.results`, `node_modules` et `.temp` restent ignorés. Avant ajout du rapport, les 43 fichiers candidats Git ont été comparés en mémoire aux quatre secrets privés : aucune correspondance. Rien n'est stagé. Les fichiers des sept changements d'Évolution 01, les calculs XP, les vidéos/cinématiques et les quatre migrations sont comparés à HEAD sans différence.

Les fixtures ont nettoyé exclusivement leurs propres identifiants. La lecture finale de la base originale retourne **0 comptes Auth, 0 progressions de preuve, 0 reçus de preuve**. Aucun Hunter réel n'est créé ou migré. Les messages SMTP fictifs peuvent subsister dans l'environnement local privé ; ils ne sont pas publiés.

Le serveur Next de test a été arrêté après vérification de son PID, chemin et port. Après contrôle du bundle final, `supabase stop` a réussi avec code 0, sans option d'effacement. La stack originale est conservée et arrêtée ; Docker Desktop et les autres applications ne sont pas arrêtés. Le rapport porte le périmètre final à 44 fichiers Git modifiés/nouveaux, sans fichier stagé.

## 9. Risques restants et prérequis AUTH-4

La sécurité de l'hébergement distant, TLS/Supavisor, le SMTP de production, les redirect URLs de staging, les limites de débit distribuées, CSP/monitoring et les cookies derrière un proxy réel restent à configurer et tester. Un compte confirmé n'a encore aucune progression cloud : le produit gameplay complet n'est pas livré.

Les autorisations de récupération dépendent d'une clé serveur correctement gérée. Une rotation demande un nouveau lien. La consommation du lien par un scanner d'e-mail, la perte de réponse pendant changement de mot de passe ou entre celui-ci et le logout global, les pannes prolongées et la charge ne sont pas validées ici ; le changement de mot de passe et la révocation sont deux opérations Auth, pas une transaction SQL atomique. Le contrôle de session au focus/périodique ne constitue pas une notification distante instantanée de toute révocation.

Avant AUTH-4 : valider ce périmètre, définir l'hébergement/région et une cible de staging autorisée ; tester le parcours Auth réel sur cette cible ; isoler les objets de preuve `auth2_*` avant toute publication ; définir les vrais modèles et le provisioning Hunter, le bootstrap cohérent, les commandes RPG/RLS et leurs tests de parité TypeScript/SQL. La distinction nouveau/reprise et les checkpoints futurs ne doivent jamais réinitialiser une progression existante.

La remise en service des pages RPG exigera leurs readers cloud isolés par acteur. F05 devra rester autour des données historiques et de leur récupération, sans contaminer les pages Auth. AUTH-5/6 conserveront les cinématiques, archives/reçus et le choix explicite de transfert. Aucun import automatique ou gameplay local de substitution n'est permis.

**Verdict : AUTH-3 implémenté et vérifié pour la stack locale testée, en attente de validation utilisateur. Aucun commit, push, merge ou déploiement ; AUTH-4 n'est pas commencé.**
