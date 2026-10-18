import type { EnglishSkillId } from './english-content';

export const ENGLISH_PROGRESS_STORAGE_KEY = 'lifequest:english-academy:progress:v1';
export const ENGLISH_PROGRESS_VERSION = 1;

const validSkills = new Set<EnglishSkillId>(['listening', 'speaking', 'reading', 'writing', 'vocabulary', 'grammar']);
const validWords = new Set(['coherent', 'sustainable', 'tackle', 'outweigh', 'articulate', 'nuanced']);

export type EnglishProgress = {
  version: 1;
  completedSkills: EnglishSkillId[];
  knownWords: string[];
};

export type EnglishPersistenceState = 'ready' | 'invalid' | 'unavailable';
export type EnglishProgressSnapshot = { progress: EnglishProgress; persistenceState: EnglishPersistenceState };
export type EnglishProgressStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

export function emptyEnglishProgress(): EnglishProgress {
  return { version: ENGLISH_PROGRESS_VERSION, completedSkills: [], knownWords: [] };
}

export function parseEnglishProgress(raw: string): EnglishProgress | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.join(',') !== 'completedSkills,knownWords,version' || record.version !== ENGLISH_PROGRESS_VERSION) return null;
  if (!Array.isArray(record.completedSkills) || !Array.isArray(record.knownWords)) return null;

  const completedSkills = record.completedSkills;
  const knownWords = record.knownWords;
  if (completedSkills.some((id) => typeof id !== 'string' || !validSkills.has(id as EnglishSkillId))) return null;
  if (knownWords.some((id) => typeof id !== 'string' || !validWords.has(id))) return null;
  if (new Set(completedSkills).size !== completedSkills.length || new Set(knownWords).size !== knownWords.length) return null;

  return { version: ENGLISH_PROGRESS_VERSION, completedSkills: [...completedSkills] as EnglishSkillId[], knownWords: [...knownWords] as string[] };
}

export function serializeEnglishProgress(progress: EnglishProgress): string {
  return JSON.stringify({
    version: ENGLISH_PROGRESS_VERSION,
    completedSkills: [...new Set(progress.completedSkills)].filter((id) => validSkills.has(id)),
    knownWords: [...new Set(progress.knownWords)].filter((id) => validWords.has(id)),
  });
}

export function createEnglishProgressStore(storage: EnglishProgressStorage) {
  let loaded = false;
  let snapshot: EnglishProgressSnapshot = { progress: emptyEnglishProgress(), persistenceState: 'ready' };
  const listeners = new Set<() => void>();

  function readSnapshot(): EnglishProgressSnapshot {
    if (loaded) return snapshot;
    loaded = true;
    try {
      const raw = storage.getItem(ENGLISH_PROGRESS_STORAGE_KEY);
      if (raw === null) return snapshot;
      const progress = parseEnglishProgress(raw);
      snapshot = progress
        ? { progress, persistenceState: 'ready' }
        : { progress: emptyEnglishProgress(), persistenceState: 'invalid' };
    } catch {
      snapshot = { progress: emptyEnglishProgress(), persistenceState: 'unavailable' };
    }
    return snapshot;
  }

  function notify() {
    for (const listener of listeners) listener();
  }

  function updateProgress(update: (current: EnglishProgress) => EnglishProgress) {
    const current = readSnapshot();
    const progress = update(current.progress);
    if (progress === current.progress) return;

    let persistenceState = current.persistenceState;
    if (persistenceState === 'ready') {
      try {
        storage.setItem(ENGLISH_PROGRESS_STORAGE_KEY, serializeEnglishProgress(progress));
      } catch {
        persistenceState = 'unavailable';
      }
    }
    snapshot = { progress, persistenceState };
    notify();
  }

  return {
    getSnapshot: readSnapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reload() {
      loaded = false;
      readSnapshot();
      notify();
    },
    markSkillComplete(id: EnglishSkillId) {
      updateProgress((current) => current.completedSkills.includes(id)
        ? current
        : { ...current, completedSkills: [...current.completedSkills, id] });
    },
    toggleWordKnown(id: string) {
      updateProgress((current) => current.knownWords.includes(id)
        ? { ...current, knownWords: current.knownWords.filter((word) => word !== id) }
        : { ...current, knownWords: [...current.knownWords, id] });
    },
    reset() {
      const current = readSnapshot();
      try {
        storage.removeItem(ENGLISH_PROGRESS_STORAGE_KEY);
        snapshot = { progress: emptyEnglishProgress(), persistenceState: 'ready' };
      } catch {
        snapshot = { ...current, persistenceState: 'unavailable' };
      }
      notify();
    },
  };
}
