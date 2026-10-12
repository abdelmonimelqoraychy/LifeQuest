'use client';
import { useMemo, useSyncExternalStore } from 'react';
import { assertBusinessStorageAccess, storageAccessRevision, subscribeStorageAccess, getStorageAccessState } from '@/lib/storageAccess';
type Snapshot<T> = {
    data: T;
    ready: boolean;
    error: string;
};
function createStore<T>(key: string, read: () => T, empty: T) {
    const server: Snapshot<T> = { data: empty, ready: false, error: '' };
    let snapshot = server, stamp: string | undefined;
    return { server, get: () => { try {
            assertBusinessStorageAccess();
            const raw = JSON.stringify([storageAccessRevision(),localStorage.getItem(key)]);
            if (snapshot.ready && raw === stamp)
                return snapshot;
            stamp = raw;
            try {
                const data=read();assertBusinessStorageAccess();
                snapshot = { data, ready: true, error: '' };
            }
            catch (e) {
                const blocked=getStorageAccessState().status!=='ready';if(blocked)stamp=undefined;snapshot = { data: empty, ready: !blocked, error: e instanceof Error ? e.message : 'Sauvegarde illisible' };
            }
        }
        catch (e) {
            stamp=undefined;const blocked=getStorageAccessState().status!=='ready';
            const error = String(e);
            if (snapshot.error !== error)
                snapshot = { data: empty, ready: !blocked, error };
        } return snapshot; }, subscribe: subscribeStorageAccess };
}
export function useStoredData<T>(key: string, read: () => T, empty: T) {
    const store = useMemo(() => createStore(key, read, empty), [key, read, empty]);
    return useSyncExternalStore(store.subscribe, store.get, () => store.server);
}
