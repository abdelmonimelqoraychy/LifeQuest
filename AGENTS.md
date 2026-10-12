# AGENTS.md — LifeQuest Development Guidelines

## Project Overview

LifeQuest est une application de développement personnel gamifiée inspirée des RPG et des systèmes de progression Hunter.

L'objectif est de permettre aux utilisateurs de progresser dans leur vie réelle grâce aux quêtes, XP, niveaux, statistiques et récompenses.

## Technology Stack

Technologies actuellement identifiées :
- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Motion
- Recharts
- Lucide React

Toujours examiner les fichiers de configuration et le code source pour confirmer l'architecture réelle.

## Development Rules

1. Toujours examiner le code existant avant une modification.
2. Ne jamais supprimer une fonctionnalité existante sans justification.
3. Préserver les données des utilisateurs.
4. Éviter les refactorisations massives.
5. Développer une seule fonctionnalité à la fois.
6. Respecter TypeScript et les conventions du projet.
7. Réutiliser les composants existants.
8. Séparer les règles métier des composants UI.
9. Éviter les dépendances inutiles.
10. Vérifier les bugs et risques de régression.
11. Préserver les interfaces responsive.
12. Ne pas modifier les fichiers d'environnement sensibles.
13. Ne jamais exposer de secrets.
14. Ne pas effectuer de commit ou de push sans demande explicite.
15. Expliquer clairement les changements en français.

## RPG Business Rules

- Centraliser les calculs XP.
- Empêcher les doubles récompenses.
- Préserver la cohérence des niveaux.
- Assurer la fiabilité du système de quêtes.
- Conserver un historique cohérent de progression.
- Tester les mécaniques importantes.
- Éviter de pénaliser excessivement les jours de repos.

## Recommended Workflow

Pour chaque demande de développement :

1. Analyser la fonctionnalité actuelle.
2. Identifier les fichiers concernés.
3. Proposer un plan simple.
4. Effectuer les changements autorisés.
5. Exécuter les tests adaptés.
6. Présenter les résultats.
7. Signaler les risques ou erreurs non résolus.

## Quality Checks

Utiliser les scripts réellement disponibles dans le package.json.

Vérifier selon les besoins :
- TypeScript
- ESLint
- Tests unitaires
- Build Next.js

Ne jamais prétendre qu'un test a réussi sans l'avoir exécuté.

## Project Priorities

Phase 1 : Architecture, bugs, tests, persistance.
Phase 2 : Quêtes, XP, niveaux et statistiques.
Phase 3 : Achievements, rewards et Boss Battles.
Phase 4 : Dashboard, animations et analytics.
Phase 5 : Base de données, authentification et synchronisation.
Phase 6 : Assistant IA et personnalisation intelligente.

## Expected Result

LifeQuest doit devenir une application RPG de développement personnel stable, performante, maintenable, immersive et réellement utile.

Toujours privilégier la stabilité et l'expérience utilisateur plutôt que l'ajout rapide de fonctionnalités.