'use client';
import { assertBusinessStorageAccess } from '@/lib/storageAccess';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { rankForLevel, hunterEvent, loadExtra, saveExtra } from '@/lib/hunterMissions';
import { getCharacterEvolution } from '@/lib/characterEvolution';
import { useStoredData } from '@/lib/useStoredData';
import {loadState} from '@/lib/questSystem';
import {getHunterProgress} from '@/lib/hunterCore';
import { withStorageLock, notifyStorage } from '@/lib/storage';
import Modal from '@/components/ui/Modal';
import styles from './HunterTransition.module.css';
const KEY = 'lifequest-hunter-transition-v1';
function read() {assertBusinessStorageAccess(); const raw = localStorage.getItem(KEY); if (raw === null)
    return null; const n = Number(raw); if (!Number.isInteger(n) || n < 1 || n > 100)
    throw Error('Transition invalide'); return n; }
export default function HunterTransition({ level, ready }: {
    level: number;
    ready: boolean;
    portrait: string;
}) {
    const previous = useStoredData(KEY, read, null), [dismissed, setDismissed] = useState(0);
    useEffect(() => { if (!ready || !previous.ready || previous.error || (previous.data !== null && previous.data <= level))
        return; void withStorageLock(() => { const currentLevel=getHunterProgress(loadState().totalXP).level;const raw=localStorage.getItem(KEY);
            if (raw === null || Number(raw)>currentLevel) {
        localStorage.setItem(KEY, String(currentLevel));
        notifyStorage();
    } }).catch(() => { }); }, [ready, previous.ready, previous.error, previous.data, level]);
    if (!ready || previous.data === null || previous.error)
        return null;
    let milestone = 0;
    for (let n = Math.max(previous.data, dismissed) + 1; n <= level; n++) {
        if (n % 5 === 0) {
            milestone = n;
            break;
        }
    }
    if (!milestone)
        return null;
    const rank = rankForLevel(milestone), isRank = rank !== rankForLevel(milestone - 1), form = getCharacterEvolution(milestone), title = isRank ? 'RANK UP!' : 'HUNTER EVOLUTION';
    async function complete() { try {
        await withStorageLock(() => { const extra = loadExtra(); const event = { ...hunterEvent(isRank ? 'rank' : 'evolution', isRank ? 'Rank ' + rank : 'Level ' + milestone + ' evolution', 'Level ' + milestone), id: 'milestone-' + milestone }; saveExtra({ ...extra, events: extra.events.some(e => e.id === event.id) ? extra.events : [...extra.events, event] }); localStorage.setItem(KEY, String(milestone)); notifyStorage(); });
    }
    finally {
        setDismissed(milestone);
    } }
    return <Modal className={styles.overlay} label={title} onClose={() => void complete().catch(() => { })}><div className={styles.scene}><div className={styles.crest}>{isRank ? rank : <Image src={form.image} width={165} height={165} alt={'Évolution niveau ' + milestone}/>}</div><h2>{title}</h2><p>{isRank ? 'HUNTER RANK ' + rank + ' UNLOCKED' : 'NEW FORM UNLOCKED · LEVEL ' + milestone}</p><button onClick={() => void complete().catch(() => { })}>CONTINUE</button></div></Modal>;
}
