/** Character evolution metadata. Pure functions: safe in Next.js prerendering. */
export const MAX_LEVEL = 100;

const NAMES = [
  "FIRST AWAKENING", "RISING HUNTER", "BLADE INITIATE", "SHADOW DISCIPLE",
  "NIGHT WALKER", "SOUL FORGED", "DARK SENTINEL", "PHANTOM KNIGHT",
  "ASTRAL HUNTER", "ABYSS SEEKER", "ECLIPSE WARDEN", "VOID BLADE",
  "CELESTIAL HUNTER", "STORM REVENANT", "DUSK COMMANDER", "SPECTRAL ASCENDANT",
  "ETERNAL VANGUARD", "NIGHT EMPEROR", "SHADOW SOVEREIGN", "FINAL ASCENSION",
] as const;

const COLORS = [
  '#24adff','#2cbcff','#2ad2e8','#4a9fff','#4a7bff',
  '#7665ff','#965bfa','#aa51f2','#be44db','#9f56f5',
  '#7368fd','#5299ff','#36cbff','#39e8d8','#53e1af',
  '#7eddaD','#afc5fc','#cba4ff','#e897f6','#ffc97a',
] as const;

export type CharacterEvolution = {
  level: number;
  stage: number;
  title: string;
  image: string;
  aura: string;
  nextEvolutionLevel: number | null;
};

export function getCharacterEvolution(level: number): CharacterEvolution {
  const safeLevel = Number.isFinite(level) ? Math.max(1, Math.min(MAX_LEVEL, Math.floor(level))) : 1;
  // 0: initial portrait, 1..20: transitions at every five levels including 100.
  const stage = Math.floor(safeLevel / 5);
  if (stage === 0) {
    return {
      level: safeLevel, stage: 0, title: 'NEW HUNTER',
      image: '/dashboard/hunter-concept.webp', aura: '#44d6ff', nextEvolutionLevel: 5,
    };
  }
  return {
    level: safeLevel, stage, title: NAMES[stage - 1] ?? "FINAL ASCENSION",
    image: `/characters/user-selected-008b3/evolution-${String(stage * 5).padStart(3,'0')}.jpg`,
    aura: COLORS[stage - 1] ?? "#ffc97a",
    nextEvolutionLevel: stage === 20 ? null : (stage + 1) * 5,
  };
}
