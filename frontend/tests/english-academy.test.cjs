'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const loadProgress = () => {
  const source = read('src/lib/english/english-progress.ts');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports });
  return compiledModule.exports;
};

test('English Academy exposes the six requested paths and marks nested skill pages in the shared menu', () => {
  const shell = read('src/components/system/SystemShell.tsx');
  const page = read('src/app/english/page.tsx');
  const skillPage = read('src/app/english/[skill]/page.tsx');
  const content = read('src/lib/english/english-content.ts');

  for (const id of ['listening', 'speaking', 'reading', 'writing', 'vocabulary', 'grammar']) {
    assert.ok(content.includes(`'${id}'`), `content defines ${id}`);
    assert.ok(fs.existsSync(path.join(root, 'src/app/english/[skill]/page.tsx')), `dynamic route serves /english/${id}`);
  }
  assert.match(shell, /href:\s*'\/english'.*ENGLISH ACADEMY/);
  assert.match(shell, /pathname\.startsWith\('\/english\/'\)/);
  assert.match(page, /EnglishAcademyHome/);
  assert.match(skillPage, /isEnglishSkillId\(requestedSkill\)/);
  assert.match(skillPage, /notFound\(\)/);
});

test('progress storage accepts only the versioned English Academy allow-list', () => {
  const { parseEnglishProgress, serializeEnglishProgress, emptyEnglishProgress, ENGLISH_PROGRESS_STORAGE_KEY } = loadProgress();
  assert.equal(ENGLISH_PROGRESS_STORAGE_KEY, 'lifequest:english-academy:progress:v1');
  assert.deepEqual(JSON.parse(serializeEnglishProgress({ version: 1, completedSkills: ['reading', 'reading', 'grammar'], knownWords: ['nuanced', 'nuanced', 'unknown'] })), {
    version: 1,
    completedSkills: ['reading', 'grammar'],
    knownWords: ['nuanced'],
  });
  assert.deepEqual(JSON.parse(JSON.stringify(parseEnglishProgress(JSON.stringify({ version: 1, completedSkills: ['speaking'], knownWords: ['coherent'] })))), {
    version: 1,
    completedSkills: ['speaking'],
    knownWords: ['coherent'],
  });
  assert.deepEqual(JSON.parse(JSON.stringify(emptyEnglishProgress())), { version: 1, completedSkills: [], knownWords: [] });
  for (const invalid of [
    'not-json',
    JSON.stringify({ version: 2, completedSkills: [], knownWords: [] }),
    JSON.stringify({ version: 1, completedSkills: ['dashboard'], knownWords: [] }),
    JSON.stringify({ version: 1, completedSkills: ['reading', 'reading'], knownWords: [] }),
    JSON.stringify({ version: 1, completedSkills: [], knownWords: ['private-note'] }),
    JSON.stringify({ version: 1, completedSkills: [], knownWords: [], writingDraft: 'must not be persisted' }),
  ]) assert.equal(parseEnglishProgress(invalid), null);
});

test('English progress reset targets its own key and never clears other browser data', () => {
  const hook = read('src/components/english/useEnglishProgress.ts');
  const storeSource = read('src/lib/english/english-progress.ts');
  const lesson = read('src/components/english/EnglishAcademy.tsx');
  assert.match(hook, /removeItem: \(key\) => window\.localStorage\.removeItem\(key\)/);
  assert.match(storeSource, /storage\.removeItem\(ENGLISH_PROGRESS_STORAGE_KEY\)/);
  assert.doesNotMatch(hook + storeSource, /localStorage\.clear\(/);
  assert.doesNotMatch(lesson, /fetch\(|localStorage|lifequest_.*command|xpAwarded/i);
  assert.match(lesson, /Your draft remains unsaved/);
});

test('corrupt browser progress is never overwritten until the user explicitly resets English Academy', () => {
  const { createEnglishProgressStore, ENGLISH_PROGRESS_STORAGE_KEY } = loadProgress();
  const values = new Map([[ENGLISH_PROGRESS_STORAGE_KEY, '{bad json'], ['unrelated-app-data', 'preserve']]);
  const writes = [];
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { writes.push(key); values.set(key, value); },
    removeItem: key => { values.delete(key); },
  };
  const store = createEnglishProgressStore(storage);
  assert.equal(store.getSnapshot().persistenceState, 'invalid');
  store.markSkillComplete('reading');
  assert.equal(writes.length, 0);
  assert.equal(store.getSnapshot().persistenceState, 'invalid');
  store.reset();
  assert.equal(values.has(ENGLISH_PROGRESS_STORAGE_KEY), false);
  assert.equal(values.get('unrelated-app-data'), 'preserve');
  store.markSkillComplete('reading');
  assert.deepEqual(writes, [ENGLISH_PROGRESS_STORAGE_KEY]);
  assert.equal(JSON.parse(values.get(ENGLISH_PROGRESS_STORAGE_KEY)).completedSkills[0], 'reading');
});
