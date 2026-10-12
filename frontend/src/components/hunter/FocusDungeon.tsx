'use client';
import { assertBusinessStorageAccess } from '@/lib/storageAccess';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Clock3, Pause, Play, RotateCcw } from 'lucide-react';
import { validTimer } from '@/lib/hunterCore';
import { finishFocusSession } from '@/lib/activityRewards';
import { useStoredData } from '@/lib/useStoredData';
import { withStorageLock, notifyStorage } from '@/lib/storage';
import css from '@/app/hunter-lab/HunterLab.module.css';
type Timer = {
    mode: 'focus' | 'short' | 'long';
    secondsLeft: number;
    runningUntil: number | null;
    label: string;
    sessionId?: string;
};
const KEY = 'lifequest-hunter-timer-v1', DURATIONS = { focus: 1500, short: 300, long: 900 };
const EMPTY: Timer = { mode: 'focus', secondsLeft: 1500, runningUntil: null, label: 'Deep Work' };
function read(): Timer {assertBusinessStorageAccess(); const raw = localStorage.getItem(KEY); if (raw === null)
    return EMPTY; const value: unknown = JSON.parse(raw); if (!validTimer(value))
    throw Error('Minuteur invalide. Aucune donnée écrasée.'); return value as Timer; }
function subscribeTick(change: () => void) { const id = setInterval(change, 1000); return () => clearInterval(id); }
export default function FocusDungeon() {
    const { data: timer, ready, error } = useStoredData(KEY, read, EMPTY);
    const now = useSyncExternalStore(subscribeTick, () => Math.floor(Date.now() / 1000), () => 0);
    const [retry, setRetry] = useState(0);
    const [draft, setDraft] = useState<string | null>(null), [notice, setNotice] = useState(''), [failure, setFailure] = useState('');
    const finishing = useRef(false);
    const left = timer.runningUntil === null ? timer.secondsLeft : Math.max(0, Math.ceil(timer.runningUntil / 1000 - now));
    async function write(update: (t: Timer) => Timer) { await withStorageLock(() => { const next = update(read()); localStorage.setItem(KEY, JSON.stringify(next)); notifyStorage(); }); }
    async function action(update: (t: Timer) => Timer) { try {
        await write(update);
        setFailure('');
    }
    catch (e) {
        setFailure(String(e));
    } }
    useEffect(() => {
        if (!ready || error || timer.runningUntil === null || left > 0 || finishing.current)
            return;
        const completed = timer;
        finishing.current = true;
        async function finish() {
            try {
                if (Date.now() < completed.runningUntil!)
                    return;
                if (completed.mode === 'focus') {
                    const result = await finishFocusSession({ id: completed.sessionId || String(completed.runningUntil), date: new Date(completed.runningUntil!).toISOString(), minutes: 25, label: completed.label.trim() || 'Deep Work' });
                    setNotice(result.credited ? 'FOCUS COMPLETE : +' + result.xp + ' EXP' : 'FOCUS : EXP déjà crédités');
                }
                else
                    setNotice('PAUSE TERMINÉE');
                await write(t => t.runningUntil === completed.runningUntil ? { ...t, runningUntil: null, secondsLeft: DURATIONS[t.mode], sessionId: undefined } : t);
                setFailure('');
            }
            catch (e) {
                setFailure('Session conservée. Tu peux réessayer : ' + String(e));
            }
            finally {
                finishing.current = false;
            }
        }
        void finish();
    }, [ready, error, left, timer, retry]);
    const disabled = !ready || !!error;
    return <section className={css.panel}><h2><Clock3 /> [ FOCUS DUNGEON ]</h2>{(error || failure) && <p role='alert' className={css.error}>{error || failure}</p>}{notice && <p role='status'>{notice}</p>}
 <div className={css.modeRow}>{(['focus', 'short', 'long'] as const).map(mode => <button disabled={disabled} aria-pressed={timer.mode === mode} key={mode} className={css.mode} onClick={() => void action(t => ({ ...t, mode, secondsLeft: DURATIONS[mode], runningUntil: null, sessionId: undefined }))}>{mode === 'focus' ? 'FOCUS · 25 MIN' : mode === 'short' ? 'SHORT REST · 5 MIN' : 'LONG REST · 15 MIN'}</button>)}</div>
 <div className={css.timer}>{String(Math.floor(left / 60)).padStart(2, '0')}:{String(left % 60).padStart(2, '0')}</div>
 <label className={css.field}>SESSION LABEL<input disabled={disabled} maxLength={80} value={draft ?? timer.label} onChange={e => setDraft(e.target.value)} onBlur={() => { if (draft !== null)
        void action(t => ({ ...t, label: draft })); }}/></label>
 <div className={css.actions}>{failure && <button className={css.primary} onClick={()=>setRetry(n=>n+1)}>RÉESSAYER LA SESSION</button>}<button disabled={disabled || left === 0} className={css.primary} onClick={() => void action(t => t.runningUntil === null ? { ...t, label: draft ?? t.label, sessionId: t.sessionId || crypto.randomUUID(), runningUntil: Date.now() + t.secondsLeft * 1000 } : { ...t, secondsLeft: Math.max(0, Math.ceil((t.runningUntil - Date.now()) / 1000)), runningUntil: null })}>{timer.runningUntil ? <><Pause size={18}/> PAUSE</> : <><Play size={18}/> START / RESUME</>}</button>
 <button disabled={disabled} className={css.secondary} onClick={() => void action(t => ({ ...t, runningUntil: null, secondsLeft: DURATIONS[t.mode], sessionId: undefined }))}><RotateCcw size={17}/> RESET</button></div>
 <p className={css.hint}>Une session Focus terminée rapporte 20 EXP avant bonus de régularité. Une session interrompue ne rapporte aucun EXP.</p></section>;
}
