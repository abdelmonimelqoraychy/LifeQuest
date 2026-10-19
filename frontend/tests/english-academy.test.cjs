'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const loadTsModule = (file) => {
  const source = read(file);
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports, Date, JSON, Math, Number, Object, Array, Set, String, RegExp, isFinite });
  return compiledModule.exports;
};
const loadProgress = () => loadTsModule('src/lib/english/english-progress.ts');
const loadCurriculum = () => loadTsModule('src/lib/english/english-curriculum.ts');

function createMemoryStorage(initial = new Map()) {
  const writes = [];
  const removes = [];
  const storage = {
    values: initial,
    writes,
    removes,
    getItem(key) { return initial.has(key) ? initial.get(key) : null; },
    setItem(key, value) { writes.push([key, value]); initial.set(key, value); },
    removeItem(key) { removes.push(key); initial.delete(key); },
  };
  return storage;
}

test('English Academy keeps its seven routes, existing navigation and protected dynamic skill route', () => {
  const shell = read('src/components/system/SystemShell.tsx');
  const home = read('src/app/english/page.tsx');
  const skillPage = read('src/app/english/[skill]/page.tsx');
  const layout = read('src/app/english/layout.tsx');
  for (const id of ['listening', 'speaking', 'reading', 'writing', 'vocabulary', 'grammar']) {
    assert.ok(fs.existsSync(path.join(root, 'src/app/english/[skill]/page.tsx')));
    assert.ok(shell.includes('/english'));
    assert.ok(read('src/lib/english/english-content.ts').includes("'" + id + "'"));
  }
  assert.match(shell, /href:\s*'\/english'.*ENGLISH ACADEMY/);
  assert.ok(shell.includes("pathname.startsWith('/english/')"));
  assert.match(home, /EnglishAcademyHome/);
  assert.match(skillPage, /isEnglishSkillId\(requestedSkill\)/);
  assert.match(skillPage, /notFound\(\)/);
  assert.match(layout, /<ProtectedHunter>/);
});

test('V1 progress migrates deterministically to V2 and leaves the original key untouched', () => {
  const {
    ENGLISH_PROGRESS_V1_KEY, ENGLISH_PROGRESS_STORAGE_KEY, parseEnglishProgressV1,
    migrateEnglishProgressV1, createEnglishProgressStore,
  } = loadProgress();
  const v1 = JSON.stringify({ version: 1, completedSkills: ['reading', 'grammar'], knownWords: ['coherent', 'nuanced'] });
  const previous = parseEnglishProgressV1(v1);
  assert.ok(previous);
  const fixedNow = new Date('2026-10-19T10:00:00.000Z');
  const first = migrateEnglishProgressV1(previous, fixedNow);
  const second = migrateEnglishProgressV1(previous, fixedNow);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(second)));
  assert.deepEqual(JSON.parse(JSON.stringify(first.completedLessonIds)), []);
  assert.deepEqual(JSON.parse(JSON.stringify(first.legacyCompletedSkills)), ['reading', 'grammar']);
  assert.deepEqual(JSON.parse(JSON.stringify(first.legacyKnownWords)), ['coherent', 'nuanced']);
  assert.equal(first.vocabularyReviews.coherent.dueAt, fixedNow.toISOString());

  const storage = createMemoryStorage(new Map([[ENGLISH_PROGRESS_V1_KEY, v1]]));
  const store = createEnglishProgressStore(storage, () => fixedNow);
  const snapshot = store.getSnapshot();
  assert.equal(snapshot.persistenceState, 'migrated');
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot.progress.legacyCompletedSkills)), ['reading', 'grammar']);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot.progress.legacyKnownWords)), ['coherent', 'nuanced']);
  assert.equal(storage.values.get(ENGLISH_PROGRESS_V1_KEY), v1);
  assert.equal(JSON.parse(storage.values.get(ENGLISH_PROGRESS_STORAGE_KEY)).version, 2);
});

test('V2 parser rejects unknown fields, ids, duplicates, malformed dates and invalid schedules', () => {
  const { emptyEnglishProgress, parseEnglishProgress } = loadProgress();
  const base = emptyEnglishProgress(new Date('2026-10-19T10:00:00.000Z'));
  const valid = JSON.stringify(base);
  assert.deepEqual(JSON.parse(JSON.stringify(parseEnglishProgress(valid))), JSON.parse(valid));
  const invalidValues = [
    'not-json',
    JSON.stringify({ ...base, version: 1 }),
    JSON.stringify({ ...base, extra: true }),
    JSON.stringify({ ...base, completedLessonIds: ['dashboard'] }),
    JSON.stringify({ ...base, completedLessonIds: ['b2-reading-claims-evidence', 'b2-reading-claims-evidence'] }),
    JSON.stringify({ ...base, dailyPlanMinutes: 35 }),
    JSON.stringify({ ...base, completedStudyDays: ['2026-02-30'] }),
    JSON.stringify({ ...base, completedWeeklyChallenges: ['2026-W54'] }),
    JSON.stringify({ ...base, updatedAt: 'yesterday' }),
    JSON.stringify({ ...base, vocabularyReviews: { private: { intervalDays: 1, dueAt: '2026-10-20T10:00:00.000Z', repetitions: 1, lapses: 0, lastReviewedAt: null } } }),
    JSON.stringify({ ...base, vocabularyReviews: { coherent: { intervalDays: -1, dueAt: '2026-10-20T10:00:00.000Z', repetitions: 1, lapses: 0, lastReviewedAt: null } } }),
    JSON.stringify({ ...base, legacyKnownWords: ['coherent'] }),
  ];
  for (const invalid of invalidValues) assert.equal(parseEnglishProgress(invalid), null, invalid);
});

test('invalid V1 or V2 data is preserved and is never overwritten automatically', () => {
  const {
    ENGLISH_PROGRESS_V1_KEY, ENGLISH_PROGRESS_STORAGE_KEY, createEnglishProgressStore,
  } = loadProgress();
  for (const initial of [
    new Map([[ENGLISH_PROGRESS_V1_KEY, '{broken'], ['unrelated-app-data', 'preserve']]),
    new Map([[ENGLISH_PROGRESS_STORAGE_KEY, '{broken'], [ENGLISH_PROGRESS_V1_KEY, JSON.stringify({ version: 1, completedSkills: [], knownWords: [] })]]),
  ]) {
    const storage = createMemoryStorage(initial);
    const before = new Map(initial);
    const store = createEnglishProgressStore(storage, () => new Date('2026-10-19T10:00:00.000Z'));
    assert.equal(store.getSnapshot().persistenceState, 'invalid');
    store.completeLesson('b2-reading-claims-evidence');
    assert.equal(storage.writes.length, 0);
    assert.deepEqual([...storage.values], [...before]);
  }
});

test('migration interruption and failed readback preserve V1 and disable persistence', () => {
  const { ENGLISH_PROGRESS_V1_KEY, ENGLISH_PROGRESS_STORAGE_KEY, createEnglishProgressStore } = loadProgress();
  const legacy = JSON.stringify({ version: 1, completedSkills: ['speaking'], knownWords: ['articulate'] });
  const values = new Map([[ENGLISH_PROGRESS_V1_KEY, legacy]]);
  const interrupted = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key) => { if (key === ENGLISH_PROGRESS_STORAGE_KEY) throw new Error('quota'); },
    removeItem: (key) => values.delete(key),
  };
  const store = createEnglishProgressStore(interrupted, () => new Date('2026-10-19T10:00:00.000Z'));
  assert.equal(store.getSnapshot().persistenceState, 'unavailable');
  assert.equal(values.get(ENGLISH_PROGRESS_V1_KEY), legacy);

  const badReadbackValues = new Map([[ENGLISH_PROGRESS_V1_KEY, legacy]]);
  const badReadback = {
    getItem: (key) => badReadbackValues.get(key) ?? null,
    setItem: (key) => { if (key === ENGLISH_PROGRESS_STORAGE_KEY) badReadbackValues.set(key, '{"partial":'); },
    removeItem: (key) => badReadbackValues.delete(key),
  };
  const secondStore = createEnglishProgressStore(badReadback, () => new Date('2026-10-19T10:00:00.000Z'));
  assert.equal(secondStore.getSnapshot().persistenceState, 'unavailable');
  assert.equal(badReadbackValues.get(ENGLISH_PROGRESS_V1_KEY), legacy);
  assert.equal(badReadbackValues.get(ENGLISH_PROGRESS_STORAGE_KEY), '{"partial":');
});

test('reset removes only the two English Academy keys and preserves unrelated browser data', () => {
  const { ENGLISH_PROGRESS_V1_KEY, ENGLISH_PROGRESS_STORAGE_KEY, createEnglishProgressStore } = loadProgress();
  const storage = createMemoryStorage(new Map([
    [ENGLISH_PROGRESS_V1_KEY, JSON.stringify({ version: 1, completedSkills: [], knownWords: [] })],
    ['lifequest:english-academy:progress:v2', JSON.stringify(loadProgress().emptyEnglishProgress(new Date('2026-10-19T10:00:00.000Z')))],
    ['unrelated-app-data', 'preserve'],
  ]));
  const store = createEnglishProgressStore(storage, () => new Date('2026-10-19T10:00:00.000Z'));
  store.reset();
  assert.deepEqual(storage.removes.sort(), [ENGLISH_PROGRESS_STORAGE_KEY, ENGLISH_PROGRESS_V1_KEY].sort());
  assert.equal(storage.values.get('unrelated-app-data'), 'preserve');
  assert.equal(storage.values.has(ENGLISH_PROGRESS_STORAGE_KEY), false);
  assert.equal(storage.values.has(ENGLISH_PROGRESS_V1_KEY), false);
});

test('scheduler intervals, due dates and retries are deterministic with a fixed clock', () => {
  const { scheduleVocabularyReview } = loadProgress();
  const now = new Date('2026-10-19T10:00:00.000Z');
  const firstGood = scheduleVocabularyReview(undefined, 'good', now);
  assert.equal(firstGood.intervalDays, 1);
  assert.equal(firstGood.dueAt, '2026-10-20T10:00:00.000Z');
  const nextGood = scheduleVocabularyReview(firstGood, 'good', new Date(firstGood.dueAt));
  assert.equal(nextGood.intervalDays, 3);
  assert.equal(nextGood.dueAt, '2026-10-23T10:00:00.000Z');
  const hard = scheduleVocabularyReview(nextGood, 'hard', new Date(nextGood.dueAt));
  assert.equal(hard.intervalDays, 4);
  const again = scheduleVocabularyReview(hard, 'again', new Date(hard.dueAt));
  assert.equal(again.intervalDays, 0);
  assert.equal(again.dueAt, '2026-10-27T10:10:00.000Z');
  assert.equal(again.lapses, 1);
  assert.equal(again.repetitions, 0);
});

test('day and ISO week boundaries are validated and completed once per key', () => {
  const { getIsoWeekKey, getLocalDayKey, isValidWeekKey, isValidDayKey, createEnglishProgressStore, ENGLISH_PROGRESS_STORAGE_KEY } = loadProgress();
  assert.equal(getIsoWeekKey(new Date(2026, 0, 1)), '2026-W01');
  assert.equal(getIsoWeekKey(new Date(2026, 11, 31)), '2026-W53');
  assert.equal(isValidWeekKey('2026-W53'), true);
  assert.equal(isValidWeekKey('2026-W54'), false);
  assert.equal(isValidDayKey('2026-02-28'), true);
  assert.equal(isValidDayKey('2026-02-30'), false);
  const now = new Date(2026, 9, 19, 12);
  const storage = createMemoryStorage();
  const store = createEnglishProgressStore(storage, () => now);
  const day = getLocalDayKey(now);
  const week = getIsoWeekKey(now);
  store.completeStudyDay(day);
  store.completeStudyDay(day);
  store.completeWeeklyChallenge(week);
  assert.deepEqual(JSON.parse(storage.values.get(ENGLISH_PROGRESS_STORAGE_KEY)).completedStudyDays, [day]);
  assert.deepEqual(JSON.parse(storage.values.get(ENGLISH_PROGRESS_STORAGE_KEY)).completedWeeklyChallenges, [week]);
});

test('curriculum has 18 complete lessons, three per skill, unique IDs and valid exercises', () => {
  const { ENGLISH_CURRICULUM, WEEKLY_CHALLENGES } = loadCurriculum();
  assert.equal(ENGLISH_CURRICULUM.length, 18);
  assert.equal(new Set(ENGLISH_CURRICULUM.map((lesson) => lesson.id)).size, 18);
  for (const skill of ['listening', 'speaking', 'reading', 'writing', 'vocabulary', 'grammar']) {
    const lessons = ENGLISH_CURRICULUM.filter((lesson) => lesson.skill === skill);
    assert.equal(lessons.length, 3, skill);
    for (const lesson of lessons) {
      assert.ok(lesson.id && lesson.objective.length > 30 && lesson.teaching.length > 100);
      assert.ok(lesson.successCriterion.length > 30);
      assert.ok(lesson.minutes >= 15 && lesson.minutes <= 30);
      const activity = lesson.activity;
      if (activity.type === 'reading' || activity.type === 'grammar') {
        assert.ok(activity.questions.length >= 3);
        for (const question of activity.questions) {
          assert.equal(new Set(question.options).size, question.options.length);
          assert.ok(question.answer >= 0 && question.answer < question.options.length);
          assert.ok(question.explanation.length > 20);
        }
      }
      if (activity.type === 'writing') {
        assert.equal(activity.rubric.length, 5);
        assert.ok(activity.modelResponse.length >= 400);
        assert.ok(activity.minimumWords < activity.maximumWords);
      }
      if (activity.type === 'listening') assert.match(activity.resourceUrl, /^https:\/\/learnenglish\.britishcouncil\.org\/free-resources\/listening\/(b2|c1)$/);
    }
  }
  const cardIds = ENGLISH_CURRICULUM.flatMap((lesson) => lesson.activity.type === 'vocabulary' ? lesson.activity.cards.map((card) => card.id) : []);
  assert.equal(cardIds.length, 12);
  assert.equal(new Set(cardIds).size, 12);
  assert.equal(WEEKLY_CHALLENGES.length, 4);
  assert.ok(WEEKLY_CHALLENGES.every((challenge) => challenge.tasks.length >= 3));
});

test('interactive module stays local, drafts are not persisted, and no Hunter XP or API calls are introduced', () => {
  const component = read('src/components/english/EnglishAcademy.tsx');
  const store = read('src/lib/english/english-progress.ts');
  const hook = read('src/components/english/useEnglishProgress.ts');
  const css = read('src/components/english/EnglishAcademy.module.css');
  assert.doesNotMatch(component, /\bfetch\s*\(|navigator\.mediaDevices|SpeechRecognition|xpAwarded|lifequest_.*command/i);
  assert.match(component, /This draft is not saved/);
  assert.match(component, /target="_blank" rel="noreferrer"/);
  assert.match(hook, /window\.localStorage/);
  assert.match(hook, /ENGLISH_PROGRESS_KEYS/);
  assert.doesNotMatch(store + hook, /localStorage\.clear\s*\(/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(max-width: 620px\)/);
});

test('English Academy UI includes keyboard-accessible controls and avoids Dashboard/Hunter Core edits', () => {
  const component = read('src/components/english/EnglishAcademy.tsx');
  const css = read('src/components/english/EnglishAcademy.module.css');
  assert.match(component, /aria-pressed/);
  assert.match(component, /aria-label/);
  assert.match(component, /<fieldset/);
  assert.match(component, /<label/);
  assert.match(css, /:focus-visible/);
  assert.doesNotMatch(component, /Dashboard|Hunter Core/);
});

test('seven routes preserve existing route modules and use only Academy paths', () => {
  const paths = [
    'src/app/english/page.tsx',
    'src/app/english/[skill]/page.tsx',
  ];
  for (const route of paths) assert.ok(fs.existsSync(path.join(root, route)));
  const source = read('src/components/english/EnglishAcademy.tsx');
  assert.ok(source.includes("'/english/' + task.skill"));
  assert.ok(source.includes("'/english/' + item.id"));
});
