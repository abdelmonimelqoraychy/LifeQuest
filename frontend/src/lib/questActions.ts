import type { Attribute } from '@/types';
import { unlockAchievements } from '@/lib/achievements';
import { calendarDate } from '@/lib/validation';
import { QUEST_REWARDS, getHunterProgress, rewardMultiplier, streakDays, completionDays, getCoreSettings, ensureCoreSettings } from '@/lib/hunterCore';
import { emptySystem, hasCompleted, isDue, loadState, localDate, newId, periodId, saveState, type Frequency, type QuestSystemState, type SystemQuest } from '@/lib/questSystem';
import { withStorageLock, notifyStorage } from '@/lib/storage';
export type QuestInput = {
    expectedRevision?: number;
    title: string;
    description: string;
    frequency: Frequency;
    attribute: Attribute;
    difficulty: 'EASY' | 'NORMAL' | 'HARD';
    xp: number;
    arcId: string;
    targetDate: string;
};
export type QuestReward = {
    title: string;
    xp: number;
    levelBefore: number;
    levelAfter: number;
};
export async function changeQuests(update: (state: QuestSystemState) => QuestSystemState) { return withStorageLock(() => { const next = update(loadState()); saveState(next); notifyStorage(); return next; }); }
function draftQuest(draft: QuestInput, prev: QuestSystemState): Omit<SystemQuest, 'id' | 'createdAt'> {
    if (!draft.title.trim() || draft.title.length > 100 || draft.description.length > 250)
        throw Error('Titre ou description invalide');
    if (draft.arcId && !prev.arcs.some(a => a.id === draft.arcId))
        throw Error('Arc introuvable');
    if (draft.targetDate && !calendarDate(draft.targetDate))
        throw Error('Date invalide');
    return { title: draft.title.trim(), description: draft.description.trim(), frequency: draft.frequency, attribute: draft.attribute, difficulty: draft.difficulty, xp: QUEST_REWARDS[draft.difficulty], arcId: draft.arcId || undefined, targetDate: draft.frequency === 'once' ? draft.targetDate || undefined : undefined };
}
function nextPeriod(f: Frequency, now: Date) { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate()); if (f === 'weekly')
    d.setDate(d.getDate() + 7 - ((d.getDay() + 6) % 7));
else if (f === 'monthly')
    d.setMonth(d.getMonth() + 1, 1);
else
    d.setDate(d.getDate() + 1); return localDate(d); }
export function createQuestAction(draft: QuestInput) { return changeQuests(prev => ({ ...prev, quests: [...prev.quests, { ...draftQuest(draft, prev), id: newId(), createdAt: new Date().toISOString() }] })); }
function setQuestArchived(id: string, archived: boolean) {
    return withStorageLock(() => {
        const prev = loadState(), quest = prev.quests.find(q => q.id === id);
        if (!quest) throw Error('Quête introuvable.');
        if (!!quest.archived === archived) return prev;
        const next = { ...prev, quests: prev.quests.map(q => q.id === id
            ? { ...q, archived, revision: (q.revision ?? 0) + 1 } : q) };
        saveState(next);
        notifyStorage();
        return next;
    });
}
export const archiveQuestAction = (id: string) => setQuestArchived(id, true);
export const restoreQuestAction = (id: string) => setQuestArchived(id, false);
export function updateQuestAction(id: string, draft: QuestInput) {
    return changeQuests(prev => {
        const old = prev.quests.find(q => q.id === id && !q.archived);
        if (!old)
            throw Error('Quête introuvable');
    if(draft.expectedRevision!==undefined&&draft.expectedRevision!==(old.revision??0))throw Error('Cette quête a changé dans un autre onglet. Conserve ton brouillon et recharge pour comparer.');
        if (old.frequency === 'once' && old.frequency !== draft.frequency && hasCompleted(old, prev.completions))
            throw Error('Une quête spéciale terminée ne peut pas devenir récurrente.');
        const now = new Date();
        // Before the first reward, changing frequency cannot duplicate earned XP.
        // Preserve existing availability limits and the cooldown for rewarded quests.
        const hasRewardHistory = prev.completions.some(c => c.questId === id);
        const needsCooldown = old.frequency !== draft.frequency && hasRewardHistory;
        const availableAfter = needsCooldown ? [nextPeriod(old.frequency, now), nextPeriod(draft.frequency, now), old.availableAfter || ''].sort().at(-1) : old.availableAfter;
        return { ...prev, quests: prev.quests.map(q => q.id === id ? { ...q, ...draftQuest(draft, prev), revision:(old.revision??0)+1, xp:old.difficulty===draft.difficulty?old.xp:QUEST_REWARDS[draft.difficulty], availableAfter } : q) };
    });
}
export async function completeQuestAction(id: string): Promise<QuestReward | null> {
    return withStorageLock(() => {
        const prev = loadState(), now = new Date(), q = prev.quests.find(x => x.id === id);
        if (!q || !isDue(q, now) || hasCompleted(q, prev.completions, now))
            return null;
        ensureCoreSettings(prev.totalXP);
        const xp = Math.round(q.xp * rewardMultiplier(streakDays(completionDays(prev.completions)), getCoreSettings(prev.totalXP).stability));
        const reward = { title: q.title, xp, levelBefore: getHunterProgress(prev.totalXP).level, levelAfter: getHunterProgress(prev.totalXP + xp).level };
        const next = { ...prev, totalXP: prev.totalXP + xp, completions: [...prev.completions, { id: newId(), questId: id, period: periodId(q.frequency, now), completedAt: now.toISOString(), xpAwarded: xp, attribute: q.attribute, questTitle: q.title, arcId: q.arcId ?? null }] };
        saveState(unlockAchievements(next, reward.levelAfter, now.toISOString()));
        notifyStorage();
        return reward;
    });
}
export { emptySystem };
