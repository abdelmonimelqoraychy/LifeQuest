import type { QuestSystemState } from '@/lib/questSystem';
import { isRecord, timestamp } from '@/lib/validation';

export const ACHIEVEMENTS = [
    { id: 'first-clear', title: 'FIRST CLEAR', target: 1, source: 'quests', criterion: 'Terminer une quête.' },
    { id: 'quest-veteran', title: 'QUEST VETERAN', target: 100, source: 'quests', criterion: 'Atteindre 100 validations de quêtes.' },
    { id: 'discipline-master', title: 'DISCIPLINE MASTER', target: 30, source: 'discipline', criterion: 'Valider 30 quêtes de discipline.' },
    { id: 'rank-d-hunter', title: 'RANK D HUNTER', target: 10, source: 'level', criterion: 'Atteindre le niveau 10.' },
    { id: 'rank-s-hunter', title: 'RANK S HUNTER', target: 50, source: 'level', criterion: 'Atteindre le niveau 50.' },
    { id: 'seven-day-streak', title: '7 DAY STREAK', target: 7, source: 'streak', criterion: 'Valider au moins une quête sur 7 jours locaux consécutifs.' },
] as const;
export type AchievementId = typeof ACHIEVEMENTS[number]['id'];
export type AchievementUnlock = { id: AchievementId; unlockedAt: string };

export function validAchievementUnlocks(value: unknown): value is AchievementUnlock[] {
    return Array.isArray(value) && value.every(a => isRecord(a)
        && ACHIEVEMENTS.some(definition => definition.id === a.id) && timestamp(a.unlockedAt))
        && new Set(value.map(a => a.id)).size === value.length;
}

// Calendar arithmetic preserves local days across daylight saving time changes.
function dayKey(date: Date) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}
export function achievementProgress(state: QuestSystemState, level: number) {
    const quests = state.completions.filter(c => !c.questId.startsWith('lifequest:activity:'));
    const days = [...new Set(quests.map(c => dayKey(new Date(c.completedAt))))].sort();
    let best = 0, run = 0, previous = '';
    for (const day of days) {
        const preceding = new Date(day + 'T12:00:00');
        preceding.setDate(preceding.getDate() - 1);
        run = dayKey(preceding) === previous ? run + 1 : 1;
        best = Math.max(best, run);
        previous = day;
    }
    const metrics = { quests: quests.length, discipline: quests.filter(c => c.attribute === 'discipline').length, level, streak: best };
    return ACHIEVEMENTS.map(definition => {
        const unlock = state.achievements?.find(a => a.id === definition.id);
        return { ...definition, progress: metrics[definition.source], done: !!unlock, unlockedAt: unlock?.unlockedAt };
    });
}

/** Pure update: titles grant no XP and share the progression save transaction. */
export function unlockAchievements(state: QuestSystemState, level: number, unlockedAt: string): QuestSystemState {
    const newlyUnlocked = achievementProgress(state, level).filter(a => !a.done && a.progress >= a.target);
    if (!newlyUnlocked.length) return state;
    return { ...state, achievements: [...(state.achievements ?? []), ...newlyUnlocked.map(a => ({ id: a.id, unlockedAt }))] };
}
