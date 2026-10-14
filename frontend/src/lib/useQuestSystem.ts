'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { loadState, localDate, SYSTEM_KEY, LEGACY_KEY, type QuestSystemState } from '@/lib/questSystem';
import { getCoreSettings, CORE_KEY, syncAchievements } from '@/lib/hunterCore';
import { assertBusinessStorageAccess, storageAccessRevision, subscribeStorageAccess, getStorageAccessState } from '@/lib/storageAccess';
import { useLocalDay } from '@/lib/useLocalDay';
import { changeQuests, createQuestAction, updateQuestAction, completeQuestAction, archiveQuestAction, restoreQuestAction, emptySystem, type QuestInput, type QuestReward } from '@/lib/questActions';
export type { QuestInput, QuestReward };
type Snapshot = {
    data: QuestSystemState;
    ready: boolean;
    error: string;
};
const server: Snapshot = { data: emptySystem, ready: false, error: '' };
let cached: Snapshot = server, stamp = '';
function snapshot(): Snapshot { try {
    assertBusinessStorageAccess();
    const next = JSON.stringify([storageAccessRevision(),localStorage.getItem(SYSTEM_KEY), localStorage.getItem(LEGACY_KEY), localStorage.getItem(CORE_KEY)]);
    if (next === stamp && cached.ready)
        return cached;
    stamp = next;
    try {
        const data = loadState();
        getCoreSettings(data.totalXP);assertBusinessStorageAccess();
        cached = { data, ready: true, error: '' };
    }
    catch (e) {
        const blocked=getStorageAccessState().status!=='ready';if(blocked)stamp='';cached = { data: emptySystem, ready: !blocked, error: e instanceof Error ? e.message : 'Sauvegarde illisible' };
    }
    return cached;
}
catch (e) {
    stamp='';const blocked=getStorageAccessState().status!=='ready';
    const error = String(e);
    if (cached.error !== error)
        cached = { data: emptySystem, ready: !blocked, error };
    return cached;
} }
const subscribe=subscribeStorageAccess;
export function useQuestSystem() {
    const state = useSyncExternalStore(subscribe, snapshot, () => server), today = useLocalDay();
    const [actionError, setActionError] = useState('');
    useEffect(() => {
        if (!state.ready || state.error) return;
        let active = true;
        void syncAchievements().catch(e => {
            if (active) setActionError(e instanceof Error ? e.message : 'Enregistrement des succès impossible');
        });
        return () => { active = false; };
    }, [state.ready, state.error, state.data]);
    async function run<T>(action: () => Promise<T>, fallback: T) { if (!state.ready || state.error)
        return fallback; try {
        const result = await action();
        setActionError('');
        return result;
    }
    catch (e) {
        setActionError(e instanceof Error ? e.message : 'Enregistrement impossible');
        return fallback;
    } }
    return { ...state, error: state.error || actionError, today, currentDate: new Date((today || '2000-01-01') + 'T12:00:00'),
        createQuest: (draft: QuestInput) => run(async () => { await createQuestAction(draft); return true; }, false),
        updateQuest: (id: string, draft: QuestInput) => run(async () => { await updateQuestAction(id, draft); return true; }, false),
        archiveQuest: (id: string) => run(async () => { await archiveQuestAction(id); return true; }, false),
        restoreQuest: (id: string) => run(async () => { await restoreQuestAction(id); return true; }, false),
        completeQuest: (id: string) => run(() => completeQuestAction(id), null),
        addArc: (title: string, description: string, targetDate: string) => run(async () => { const now = new Date(), limit = new Date(now.getFullYear() + 2, now.getMonth(), now.getDate()); if (!title.trim() || targetDate < localDate(now) || targetDate > localDate(limit))
            throw Error('Titre ou date invalide'); await changeQuests(prev => ({ ...prev, arcs: [...prev.arcs, { id: crypto.randomUUID(), title: title.trim(), description: description.trim(), targetDate, createdAt: now.toISOString() }] })); return true; }, false),
        deleteArc: (id: string) => run(async () => { await changeQuests(prev => ({ ...prev, arcs: prev.arcs.filter(a => a.id !== id), quests: prev.quests.map(q => q.arcId === id ? { ...q, arcId: undefined } : q) })); return true; }, false) };
}
