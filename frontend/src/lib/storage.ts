import { assertBusinessStorageAccess } from '@/lib/storageAccess';
/** All gameplay writes, including restore, share a browser-wide lock. */
export const STORAGE_EVENT = 'lifequest-core-updated';
export function notifyStorage() { window.dispatchEvent(new Event(STORAGE_EVENT)); }
export async function withStorageLock<T>(work: () => T | Promise<T>): Promise<T> {
    return withImportStorageLock(() => { assertBusinessStorageAccess(); return work(); });
}
/** Reserved for the import/recovery protocol. No business guard or nested lock. */
export async function withImportStorageLock<T>(work: () => T | Promise<T>): Promise<T> {
    if (typeof navigator === 'undefined' || !navigator.locks)
        throw Error('Ce navigateur ne peut pas protéger les sauvegardes entre onglets. Utilise un navigateur récent sur localhost ou HTTPS.');
    return navigator.locks.request('lifequest-storage', work);
}
