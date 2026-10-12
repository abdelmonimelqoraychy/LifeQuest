# Suivi de la roadmap LifeQuest

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
