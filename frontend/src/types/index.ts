export type Attribute = "focus" | "discipline" | "knowledge" | "energy" | "consistency";
export type Quest = { id: string; title: string; description: string; xp: number; attribute: Attribute; difficulty: "EASY" | "NORMAL" | "HARD"; completed: boolean };
export type PlayerProfile = { name: string; title: string; avatarStyle: "default"; hairStyle: string; hairColor: string; outfit: string; auraColor: string; rankTheme: string };
export type GameState = { quests: Quest[]; totalXP: number };

export type HunterProfile = { name:string; age:number; gender:"male"|"female"|"other"|"prefer_not_to_say"; avatar:"male"|"female"; goals:string[]; onboardingCompleted:true; createdAt:string };
