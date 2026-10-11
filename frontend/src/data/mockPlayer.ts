import type { GameState, PlayerProfile } from "@/types";

export const player: PlayerProfile = {
  name: "New Hunter", title: "THE AWAKENED", avatarStyle: "default",
  hairStyle: "shadow", hairColor: "#101c37", outfit: "hunter-coat",
  auraColor: "#28ccff", rankTheme: "midnight",
};

export const initialGame: GameState = {
  totalXP: 0,
  quests: [
    { id: "python", title: "Maîtriser Python", description: "45 minutes de deep work", xp: 120, attribute: "knowledge", difficulty: "NORMAL", completed: false },
    { id: "saas", title: "Construire LifeQuest", description: "Terminer une fonctionnalité", xp: 150, attribute: "discipline", difficulty: "HARD", completed: false },
    { id: "workout", title: "Renforcer ton corps", description: "30 minutes d'entraînement", xp: 80, attribute: "energy", difficulty: "NORMAL", completed: false },
    { id: "reading", title: "Étendre tes connaissances", description: "Lire 10 pages", xp: 50, attribute: "focus", difficulty: "EASY", completed: false },
  ],
};
export const XP_PER_LEVEL = 300;
export function getLevel(totalXP: number) { return Math.floor(totalXP / XP_PER_LEVEL) + 1; }
