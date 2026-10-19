import type { EnglishSkillId } from './english-content';

export const ENGLISH_PROGRESS_V1_KEY = 'lifequest:english-academy:progress:v1';
export const ENGLISH_PROGRESS_STORAGE_KEY = 'lifequest:english-academy:progress:v2';
export const ENGLISH_PROGRESS_VERSION = 2;
export const ENGLISH_PROGRESS_KEYS = [ENGLISH_PROGRESS_V1_KEY, ENGLISH_PROGRESS_STORAGE_KEY] as const;

const VALID_SKILLS = new Set<EnglishSkillId>(['listening', 'speaking', 'reading', 'writing', 'vocabulary', 'grammar']);
const LEGACY_WORDS = new Set(['coherent', 'sustainable', 'tackle', 'outweigh', 'articulate', 'nuanced']);
const LESSON_IDS = new Set([
  'b2-listening-signposts', 'b2plus-listening-qualifications', 'c1-listening-stance',
  'b2-speaking-structured-answer', 'b2plus-speaking-counterargument', 'c1-speaking-register',
  'b2-reading-claims-evidence', 'b2plus-reading-inference', 'c1-reading-synthesis',
  'b2-writing-formal-email', 'b2plus-writing-opinion-essay', 'c1-writing-policy-report',
  'b2-vocabulary-collocations', 'c1-vocabulary-precision', 'c1-vocabulary-register',
  'b2-grammar-conditionals', 'c1-grammar-inversion', 'c1-grammar-participles',
]);
const VOCABULARY_IDS = new Set([
  ...LEGACY_WORDS,
  'drawback', 'feasible', 'widespread', 'substantiate', 'compelling', 'evidence-based',
]);
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_WEEK = /^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/;

export type VocabularyGrade = 'again' | 'hard' | 'good' | 'easy';
export type VocabularyReview = {
  intervalDays: number;
  dueAt: string;
  repetitions: number;
  lapses: number;
  lastReviewedAt: string | null;
};

export type EnglishProgress = {
  version: 2;
  completedLessonIds: string[];
  legacyCompletedSkills: EnglishSkillId[];
  legacyKnownWords: string[];
  vocabularyReviews: Record<string, VocabularyReview>;
  dailyPlanMinutes: 20 | 25 | 30;
  completedStudyDays: string[];
  completedWeeklyChallenges: string[];
  updatedAt: string;
};

export type EnglishPersistenceState = 'ready' | 'migrated' | 'invalid' | 'unavailable';
export type EnglishProgressSnapshot = { progress: EnglishProgress; persistenceState: EnglishPersistenceState };
export type EnglishProgressStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

export type EnglishProgressV1 = {
  version: 1;
  completedSkills: EnglishSkillId[];
  knownWords: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}

function isUniqueAllowedArray(value: unknown, allowed: Set<string>, maximum: number): value is string[] {
  return Array.isArray(value)
    && value.length <= maximum
    && value.every((item) => typeof item === 'string' && allowed.has(item))
    && new Set(value).size === value.length;
}

function isValidIsoInstant(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_INSTANT.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

export function isValidDayKey(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DAY.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isValidWeekKey(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_WEEK.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const week = Number(value.slice(6));
  const target = new Date(Date.UTC(year, 0, 4 + (week - 1) * 7));
  const check = getIsoWeekKeyFromUtc(target);
  return check === value;
}

export function getLocalDayKey(date: Date): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

export function getIsoWeekKey(date: Date): string {
  return getIsoWeekKeyFromUtc(new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())));
}

function getIsoWeekKeyFromUtc(date: Date): string {
  const normalized = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = normalized.getUTCDay() || 7;
  normalized.setUTCDate(normalized.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(normalized.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((normalized.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return normalized.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
}

export function emptyEnglishProgress(now = new Date()): EnglishProgress {
  return {
    version: ENGLISH_PROGRESS_VERSION,
    completedLessonIds: [],
    legacyCompletedSkills: [],
    legacyKnownWords: [],
    vocabularyReviews: {},
    dailyPlanMinutes: 25,
    completedStudyDays: [],
    completedWeeklyChallenges: [],
    updatedAt: now.toISOString(),
  };
}

export function parseEnglishProgressV1(raw: string): EnglishProgressV1 | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value) || !hasExactKeys(value, ['version', 'completedSkills', 'knownWords']) || value.version !== 1) return null;
  if (!Array.isArray(value.completedSkills) || !Array.isArray(value.knownWords)) return null;
  if (value.completedSkills.some((id) => typeof id !== 'string' || !VALID_SKILLS.has(id as EnglishSkillId))) return null;
  if (value.knownWords.some((id) => typeof id !== 'string' || !LEGACY_WORDS.has(id))) return null;
  if (new Set(value.completedSkills).size !== value.completedSkills.length || new Set(value.knownWords).size !== value.knownWords.length) return null;
  return { version: 1, completedSkills: [...value.completedSkills] as EnglishSkillId[], knownWords: [...value.knownWords] as string[] };
}

export function parseEnglishProgress(raw: string): EnglishProgress | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const keys = ['version', 'completedLessonIds', 'legacyCompletedSkills', 'legacyKnownWords', 'vocabularyReviews', 'dailyPlanMinutes', 'completedStudyDays', 'completedWeeklyChallenges', 'updatedAt'];
  if (!isRecord(value) || !hasExactKeys(value, keys) || value.version !== ENGLISH_PROGRESS_VERSION) return null;
  if (!isUniqueAllowedArray(value.completedLessonIds, LESSON_IDS, LESSON_IDS.size)) return null;
  if (!isUniqueAllowedArray(value.legacyCompletedSkills, VALID_SKILLS, VALID_SKILLS.size)) return null;
  if (!isUniqueAllowedArray(value.legacyKnownWords, LEGACY_WORDS, LEGACY_WORDS.size)) return null;
  if (value.dailyPlanMinutes !== 20 && value.dailyPlanMinutes !== 25 && value.dailyPlanMinutes !== 30) return null;
  if (!isUniqueAllowedArray(value.completedStudyDays, new Set(Array.isArray(value.completedStudyDays) ? value.completedStudyDays.filter((item): item is string => typeof item === 'string') : []), 400)) return null;
  if (!value.completedStudyDays.every(isValidDayKey)) return null;
  if (!isUniqueAllowedArray(value.completedWeeklyChallenges, new Set(Array.isArray(value.completedWeeklyChallenges) ? value.completedWeeklyChallenges.filter((item): item is string => typeof item === 'string') : []), 120)) return null;
  if (!value.completedWeeklyChallenges.every(isValidWeekKey) || !isValidIsoInstant(value.updatedAt)) return null;
  if (!isRecord(value.vocabularyReviews)) return null;

  const vocabularyReviews: Record<string, VocabularyReview> = {};
  for (const [id, candidate] of Object.entries(value.vocabularyReviews)) {
    if (!VOCABULARY_IDS.has(id) || !isRecord(candidate)
      || !hasExactKeys(candidate, ['intervalDays', 'dueAt', 'repetitions', 'lapses', 'lastReviewedAt'])) return null;
    if (!Number.isInteger(candidate.intervalDays) || (candidate.intervalDays as number) < 0 || (candidate.intervalDays as number) > 365) return null;
    if (!isValidIsoInstant(candidate.dueAt)) return null;
    if (!Number.isInteger(candidate.repetitions) || (candidate.repetitions as number) < 0 || (candidate.repetitions as number) > 100000) return null;
    if (!Number.isInteger(candidate.lapses) || (candidate.lapses as number) < 0 || (candidate.lapses as number) > 100000) return null;
    if (candidate.lastReviewedAt !== null && !isValidIsoInstant(candidate.lastReviewedAt)) return null;
    vocabularyReviews[id] = {
      intervalDays: candidate.intervalDays as number,
      dueAt: candidate.dueAt,
      repetitions: candidate.repetitions as number,
      lapses: candidate.lapses as number,
      lastReviewedAt: candidate.lastReviewedAt as string | null,
    };
  }
  if (!value.legacyKnownWords.every((id) => Object.prototype.hasOwnProperty.call(vocabularyReviews, id))) return null;

  return {
    version: 2,
    completedLessonIds: [...value.completedLessonIds],
    legacyCompletedSkills: [...value.legacyCompletedSkills] as EnglishSkillId[],
    legacyKnownWords: [...value.legacyKnownWords],
    vocabularyReviews,
    dailyPlanMinutes: value.dailyPlanMinutes,
    completedStudyDays: [...value.completedStudyDays],
    completedWeeklyChallenges: [...value.completedWeeklyChallenges],
    updatedAt: value.updatedAt,
  };
}

export function serializeEnglishProgress(progress: EnglishProgress): string {
  return JSON.stringify(progress);
}

export function migrateEnglishProgressV1(previous: EnglishProgressV1, now = new Date()): EnglishProgress {
  const instant = now.toISOString();
  const vocabularyReviews: Record<string, VocabularyReview> = {};
  for (const id of previous.knownWords) {
    vocabularyReviews[id] = { intervalDays: 0, dueAt: instant, repetitions: 0, lapses: 0, lastReviewedAt: null };
  }
  return {
    ...emptyEnglishProgress(now),
    legacyCompletedSkills: [...previous.completedSkills],
    legacyKnownWords: [...previous.knownWords],
    vocabularyReviews,
  };
}

function addDays(instant: string, days: number): string {
  return new Date(Date.parse(instant) + days * 86400000).toISOString();
}

export function scheduleVocabularyReview(
  previous: VocabularyReview | undefined,
  grade: VocabularyGrade,
  now = new Date(),
): VocabularyReview {
  const instant = now.toISOString();
  const intervals: Record<VocabularyGrade, number[]> = {
    again: [0, 0, 0, 0, 0, 0],
    hard: [1, 2, 4, 8, 16, 30],
    good: [1, 3, 7, 14, 30, 60],
    easy: [3, 7, 14, 30, 60, 90],
  };
  const box = Math.min(5, Math.max(0, previous?.repetitions ?? 0));
  const intervalDays = intervals[grade][box];
  return {
    intervalDays,
    dueAt: grade === 'again' ? new Date(now.getTime() + 10 * 60000).toISOString() : addDays(instant, intervalDays),
    repetitions: grade === 'again' ? 0 : Math.min(100000, (previous?.repetitions ?? 0) + (grade === 'easy' ? 2 : 1)),
    lapses: Math.min(100000, (previous?.lapses ?? 0) + (grade === 'again' ? 1 : 0)),
    lastReviewedAt: instant,
  };
}

export function createEnglishProgressStore(storage: EnglishProgressStorage, getNow: () => Date = () => new Date()) {
  let loaded = false;
  let snapshot: EnglishProgressSnapshot = { progress: emptyEnglishProgress(), persistenceState: 'ready' };
  const listeners = new Set<() => void>();

  function notify() {
    for (const listener of listeners) listener();
  }

  function writeAndVerify(progress: EnglishProgress): boolean {
    const serialized = serializeEnglishProgress(progress);
    try {
      storage.setItem(ENGLISH_PROGRESS_STORAGE_KEY, serialized);
      const written = storage.getItem(ENGLISH_PROGRESS_STORAGE_KEY);
      return written !== null && JSON.stringify(parseEnglishProgress(written)) === JSON.stringify(progress);
    } catch {
      return false;
    }
  }

  function readSnapshot(): EnglishProgressSnapshot {
    if (loaded) return snapshot;
    loaded = true;
    try {
      const current = storage.getItem(ENGLISH_PROGRESS_STORAGE_KEY);
      if (current !== null) {
        const progress = parseEnglishProgress(current);
        snapshot = progress
          ? { progress, persistenceState: 'ready' }
          : { progress: emptyEnglishProgress(getNow()), persistenceState: 'invalid' };
        return snapshot;
      }

      const legacy = storage.getItem(ENGLISH_PROGRESS_V1_KEY);
      if (legacy === null) {
        snapshot = { progress: emptyEnglishProgress(getNow()), persistenceState: 'ready' };
        return snapshot;
      }
      const parsedLegacy = parseEnglishProgressV1(legacy);
      if (!parsedLegacy) {
        snapshot = { progress: emptyEnglishProgress(getNow()), persistenceState: 'invalid' };
        return snapshot;
      }
      const migrated = migrateEnglishProgressV1(parsedLegacy, getNow());
      snapshot = { progress: migrated, persistenceState: writeAndVerify(migrated) ? 'migrated' : 'unavailable' };
    } catch {
      snapshot = { progress: emptyEnglishProgress(getNow()), persistenceState: 'unavailable' };
    }
    return snapshot;
  }

  function updateProgress(update: (current: EnglishProgress) => EnglishProgress) {
    const current = readSnapshot();
    const progress = update(current.progress);
    if (progress === current.progress) return;
    const updated = { ...progress, updatedAt: getNow().toISOString() };
    let persistenceState = current.persistenceState;
    if (persistenceState === 'ready' || persistenceState === 'migrated') {
      persistenceState = writeAndVerify(updated) ? (current.persistenceState === 'migrated' ? 'migrated' : 'ready') : 'unavailable';
    }
    snapshot = { progress: updated, persistenceState };
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
    completeLesson(id: string) {
      if (!LESSON_IDS.has(id)) return;
      updateProgress((current) => current.completedLessonIds.includes(id)
        ? current
        : { ...current, completedLessonIds: [...current.completedLessonIds, id] });
    },
    reviewVocabulary(id: string, grade: VocabularyGrade, now = getNow()) {
      if (!VOCABULARY_IDS.has(id) || !['again', 'hard', 'good', 'easy'].includes(grade)) return;
      updateProgress((current) => ({
        ...current,
        vocabularyReviews: { ...current.vocabularyReviews, [id]: scheduleVocabularyReview(current.vocabularyReviews[id], grade, now) },
      }));
    },
    setDailyPlanMinutes(minutes: 20 | 25 | 30) {
      if (minutes !== 20 && minutes !== 25 && minutes !== 30) return;
      updateProgress((current) => current.dailyPlanMinutes === minutes ? current : { ...current, dailyPlanMinutes: minutes });
    },
    completeStudyDay(day: string) {
      if (!isValidDayKey(day)) return;
      updateProgress((current) => current.completedStudyDays.includes(day)
        ? current
        : { ...current, completedStudyDays: [...current.completedStudyDays, day].sort().slice(-400) });
    },
    completeWeeklyChallenge(week: string) {
      if (!isValidWeekKey(week)) return;
      updateProgress((current) => current.completedWeeklyChallenges.includes(week)
        ? current
        : { ...current, completedWeeklyChallenges: [...current.completedWeeklyChallenges, week].sort().slice(-120) });
    },
    reset() {
      const current = readSnapshot();
      try {
        storage.removeItem(ENGLISH_PROGRESS_STORAGE_KEY);
        storage.removeItem(ENGLISH_PROGRESS_V1_KEY);
        snapshot = { progress: emptyEnglishProgress(getNow()), persistenceState: 'ready' };
      } catch {
        snapshot = { ...current, persistenceState: 'unavailable' };
      }
      notify();
    },
  };
}
