'use client';

import { useCallback, useSyncExternalStore } from 'react';
import {
  createEnglishProgressStore,
  emptyEnglishProgress,
  ENGLISH_PROGRESS_KEYS,
  type EnglishProgressStorage,
  type VocabularyGrade,
} from '@/lib/english/english-progress';

const serverSnapshot = { progress: emptyEnglishProgress(new Date(0)), persistenceState: 'ready' as const };
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
        if (event.key === null || ENGLISH_PROGRESS_KEYS.includes(event.key as typeof ENGLISH_PROGRESS_KEYS[number])) store.reload();
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
  const completeLesson = useCallback((id: string) => getBrowserStore().completeLesson(id), []);
  const reviewVocabulary = useCallback((id: string, grade: VocabularyGrade) => getBrowserStore().reviewVocabulary(id, grade), []);
  const setDailyPlanMinutes = useCallback((minutes: 20 | 25 | 30) => getBrowserStore().setDailyPlanMinutes(minutes), []);
  const completeStudyDay = useCallback((day: string) => getBrowserStore().completeStudyDay(day), []);
  const completeWeeklyChallenge = useCallback((week: string) => getBrowserStore().completeWeeklyChallenge(week), []);
  const resetProgress = useCallback(() => getBrowserStore().reset(), []);
  return {
    ...snapshot,
    completeLesson,
    reviewVocabulary,
    setDailyPlanMinutes,
    completeStudyDay,
    completeWeeklyChallenge,
    resetProgress,
  };
}
