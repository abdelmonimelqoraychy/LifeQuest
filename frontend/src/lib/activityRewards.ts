import { readLab, mutateLab, type Session } from '@/lib/hunterLab';
import { loadExtra, saveExtra, mutateExtra, hunterEvent, bossProgress } from '@/lib/hunterMissions';
import {loadState} from '@/lib/questSystem';
import {withStorageLock,notifyStorage} from '@/lib/storage';
import { awardActivityXP, validTimer } from '@/lib/hunterCore';
export async function finishFocusSession(session: Session) {
    const recorded=await mutateLab(d => { if (d.sessions.some(s => s.id === session.id))
        return d; const timer: unknown = JSON.parse(localStorage.getItem('lifequest-hunter-timer-v1') || 'null'); if (!validTimer(timer))
        throw Error('Minuteur absent ou invalide'); const t = timer as {
        mode: string;
        runningUntil: number | null;
        sessionId?: string;
    }; if (t.mode !== 'focus' || t.runningUntil === null || t.runningUntil > Date.now() || (t.sessionId || String(t.runningUntil)) !== session.id || session.minutes !== 25)
        throw Error('Cette session ne correspond pas au minuteur terminé.'); return { ...d, sessions: [...d.sessions, { ...session, rewardStatus: 'pending' }] }; });
    const saved = recorded.sessions.find(s => s.id === session.id)!;
    const reward = await awardActivityXP('focus', saved.id, 20, 'focus', () => { if (!readLab().sessions.some(s => s.id === saved.id && s.minutes === 25))
        throw Error('La session a changé pendant la récupération.'); });
    await mutateLab(d => {if(!loadState().completions.some(c=>c.questId==='lifequest:activity:focus:'+saved.id))throw Error('La sauvegarde a changé. Réessaie la récupération.');return {...d,sessions:d.sessions.map(s=>s.id===saved.id?{...s,rewardStatus:'credited'}:s)};});
    return reward;
}
export async function claimBossReward(id: string) {
    const boss = loadExtra().bosses.find(b => b.id === id);
    if (!boss?.completedAt || !bossProgress(boss).complete)
        throw Error('Ce Boss n’est pas terminé.');
    if (boss.xp === 0) return withStorageLock(() => {
        const extra = loadExtra(), current = extra.bosses.find(b => b.id === id);
        if (!current?.completedAt || !bossProgress(current).complete || current.xp !== 0 || current.subObjectives !== undefined)
            throw Error('Le Boss historique a changé pendant la finalisation.');
        const receipt = loadState().completions.find(c => c.questId === 'lifequest:activity:boss:' + id);
        const hasCredit = !!receipt && receipt.xpAwarded > 0;
        // Do not silently repair a falsely claimed credit (F04 is a separate issue).
        if (current.rewardStatus === 'credited' && !hasCredit)
            throw Error('Crédit historique sans reçu XP positif : sauvegarde à vérifier.');
        const rewardStatus = hasCredit ? 'credited' as const : 'resolved_without_xp' as const;
        if (current.rewardStatus !== rewardStatus) {
            saveExtra({ ...extra, bosses: extra.bosses.map(b => b.id === id ? { ...b, rewardStatus } : b) });
            notifyStorage();
        }
        // Resolution writes no XP, no receipt, no new event and grants no achievement.
        return { credited: false, xp: 0, reason: hasCredit ? 'Déjà crédité (reçu conservé)' : 'Boss résolu sans XP' };
    });
    const reward = await awardActivityXP('boss', id, boss.xp, 'discipline', () => { const current = loadExtra().bosses.find(b => b.id === id); if (!current?.completedAt || !bossProgress(current).complete || current.xp !== boss.xp)
        throw Error('Le Boss a changé pendant la récupération.'); });
    await mutateExtra(s => {if(!loadState().completions.some(c=>c.questId==='lifequest:activity:boss:'+id))throw Error('La sauvegarde a changé. Réessaie la récupération.');return {...s,bosses:s.bosses.map(b=>b.id===id?{...b,rewardStatus:'credited'}:b)};});
    return reward;
}
export async function progressBoss(id: string, subObjectiveId?: string) {
    const next = await mutateExtra(s => {
        const boss = s.bosses.find(b => b.id === id);
        if (!boss)
            throw Error('Boss introuvable');
        if (boss.completedAt)
            return s;
        let updated = { ...boss, current: Math.min(boss.target, boss.current + 1) };
        if (boss.subObjectives) {
            const goalId = subObjectiveId ?? (boss.subObjectives.length === 1 ? boss.subObjectives[0].id : undefined);
            const goal = boss.subObjectives.find(g => g.id === goalId);
            if (!goal) throw Error('Sous-objectif introuvable : choisis celui à valider.');
            if (goal.completed) return s;
            updated = { ...boss, subObjectives: boss.subObjectives.map(g => g.id === goalId ? { ...g, completed: true } : g) };
            updated.current = bossProgress(updated).current;
        } else if (subObjectiveId !== undefined) throw Error('Ce Boss utilise le compteur historique.');
        const done = bossProgress(updated).complete;
        return { ...s, bosses: s.bosses.map(b => b.id === id ? { ...updated, completedAt: done ? new Date().toISOString() : undefined, rewardStatus: done ? 'pending' : undefined } : b), events: done ? [...s.events, hunterEvent('boss', 'BOSS CLEARED: ' + boss.title)] : s.events };
    });
    if (next.bosses.find(b => b.id === id)?.completedAt)
        return claimBossReward(id);
    return null;
}
