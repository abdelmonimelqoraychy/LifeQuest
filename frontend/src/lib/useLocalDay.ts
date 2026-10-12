'use client';
import { useSyncExternalStore } from 'react';
import { localDate } from '@/lib/questSystem';
function subscribe(change: () => void) {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => { clearTimeout(timer); change(); const now = new Date(), next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1); timer = setTimeout(refresh, next.getTime() - now.getTime() + 10); };
    timer = setTimeout(refresh, new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 1).getTime() - Date.now() + 10);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearTimeout(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
}
export function useLocalDay() { return useSyncExternalStore(subscribe, () => localDate(new Date()), () => ''); }
