'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type { EnglishSkillId } from '@/lib/english/english-content';
import { createEnglishProgressStore, emptyEnglishProgress, ENGLISH_PROGRESS_STORAGE_KEY, type EnglishProgressStorage } from '@/lib/english/english-progress';

const serverSnapshot = { progress: emptyEnglishProgress(), persistenceState: 'ready' as const };
let browserStore: ReturnType<typeof createEnglishProgressStore> | undefined;

function getBrowserStore() {
  if (!browserStore) {
    const storage: EnglishProgressStorage = {
      getItem: (key) => window.localStorage.getItem(key),
      setItem: (key, value) => window.localStorage.setItem(key, value),
      removeItem: (key) => window.localStorage.removeItem(key),
    };
    browserStore = createEnglishProgressStore(storage);
  }
  return browserStore;
}

export function useEnglishProgress() {
  const snapshot = useSyncExternalStore(
    (listener) => {
      const store = getBrowserStore();
      const unsubscribe = store.subscribe(listener);
      const onStorage = (event: StorageEvent) => {
        if (event.key === ENGLISH_PROGRESS_STORAGE_KEY) store.reload();
      };
      window.addEventListener('storage', onStorage);
      return () => {
        unsubscribe();
        window.removeEventListener('storage', onStorage);
      };
    },
    () => getBrowserStore().getSnapshot(),
    () => serverSnapshot,
  );
  const markSkillComplete = useCallback((id: EnglishSkillId) => getBrowserStore().markSkillComplete(id), []);
  const toggleWordKnown = useCallback((id: string) => getBrowserStore().toggleWordKnown(id), []);
  const resetProgress = useCallback(() => getBrowserStore().reset(), []);
  return { ...snapshot, markSkillComplete, toggleWordKnown, resetProgress };
}
