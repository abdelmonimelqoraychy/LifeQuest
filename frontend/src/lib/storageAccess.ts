import { IMPORT_JOURNAL_KEY } from '@/lib/importJournal';

export type StorageAccessState = { status: 'checking' | 'ready' | 'recovery-required' | 'unavailable'; message: string };
const CHECKING: StorageAccessState = { status: 'checking', message: 'Vérification de la sauvegarde locale…' };
const READY: StorageAccessState = { status: 'ready', message: '' };
const RECOVERY: StorageAccessState = { status: 'recovery-required', message: 'Un journal d’import est présent. Récupération requise : les lectures, modifications et exports de données sont bloqués.' };
const UNAVAILABLE: StorageAccessState = { status: 'unavailable', message: 'Le stockage local est inaccessible. Les lectures, modifications et exports sont bloqués jusqu’à une vérification possible.' };
let previous: string | null | undefined, revision = 0;
export function getStorageAccessState(): StorageAccessState {
  if (typeof window === 'undefined') return CHECKING;
  try {
    const raw = localStorage.getItem(IMPORT_JOURNAL_KEY);
    if (raw !== previous) { previous = raw; revision++; }
    // Any presence blocks, even empty, malformed, unknown or committed journals.
    return raw === null ? READY : RECOVERY;
  } catch { previous = undefined; return UNAVAILABLE; }
}
export function assertBusinessStorageAccess() {
  const state = getStorageAccessState();
  if (state.status !== 'ready') throw Error(state.message);
}
export function storageAccessRevision() { getStorageAccessState(); return revision; }
export function storageAccessServerSnapshot() { return CHECKING; }
const listeners = new Set<() => void>();
function changed() { revision++; for (const listener of listeners) listener(); }
function visibilityChanged() { if (document.visibilityState === 'visible') changed(); }
export function subscribeStorageAccess(listener: () => void) {
  if (!listeners.size) {
    window.addEventListener('lifequest-core-updated', changed);
    window.addEventListener('storage', changed);
    window.addEventListener('focus', changed);
    document.addEventListener('visibilitychange', visibilityChanged);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      window.removeEventListener('lifequest-core-updated', changed);
      window.removeEventListener('storage', changed);
      window.removeEventListener('focus', changed);
      document.removeEventListener('visibilitychange', visibilityChanged);
    }
  };
}
