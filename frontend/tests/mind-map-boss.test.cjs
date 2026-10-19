'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const load = () => {
  const source = read('src/lib/hunter/mindMapBoss.ts');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports, TextEncoder, BigInt });
  return compiledModule.exports;
};

const node = (id, parentId, title, revision, sortPosition) => ({ id, parentId, title, revision, sortPosition });

test('branch preview contains only direct children in sort_position order with source revisions', () => {
  const { buildMindMapBossDraft } = load();
  const draft = buildMindMapBossDraft([
    node('child-b', 'root', 'Second step', '3', '20'),
    node('other-root', null, 'Other root', '0', '30'),
    node('root', null, 'Main objective', '4', '1'),
    node('grandchild', 'child-b', 'Not direct', '1', '1'),
    node('child-a', 'root', 'First step', '2', '10'),
  ], 'root');
  assert.deepEqual(JSON.parse(JSON.stringify(draft)), {
    source: { parentId: 'root', parentRevision: '4', children: [{ id: 'child-a', revision: '2' }, { id: 'child-b', revision: '3' }] },
    sourceTitle: 'Main objective', title: 'Main objective',
    steps: [
      { sourceId: 'child-a', sourceRevision: '2', title: 'First step', weight: 1 },
      { sourceId: 'child-b', sourceRevision: '3', title: 'Second step', weight: 1 },
    ],
  });
});

test('preview refuses empty, oversized, or malformed branches', () => {
  const { buildMindMapBossDraft } = load();
  assert.equal(buildMindMapBossDraft([node('root', null, 'Root', '0', '0')], 'root'), null);
  const tooMany = [node('root', null, 'Root', '0', '0'), ...Array.from({ length: 21 }, (_, i) => node(`c${i}`, 'root', `C${i}`, '0', String(i)))];
  assert.equal(buildMindMapBossDraft(tooMany, 'root'), null);
  assert.equal(buildMindMapBossDraft([node('root', null, 'Root', 'not-a-revision', '0'), node('c', 'root', 'Child', '0', '0')], 'root'), null);
  assert.equal(buildMindMapBossDraft([node('root', null, 'Root', '0', '0'), node('c', 'root', 'Child', '0', 'invalid')], 'root'), null);
});

test('boss draft enforces existing server limits and one-to-one source mapping', () => {
  const { buildMindMapBossDraft, validateMindMapBossDraft, mindMapBossPayload } = load();
  const draft = buildMindMapBossDraft([node('root', null, 'Root', '5', '0'), node('step-a', 'root', 'A', '2', '0'), node('step-b', 'root', 'B', '3', '1')], 'root');
  assert.ok(draft);
  const edited = draft.steps.map((step, index) => ({ ...step, title: `Edited ${index + 1}`, weight: index ? 750 : 250 }));
  assert.equal(validateMindMapBossDraft('A composed Boss', edited), null);
  const payload = mindMapBossPayload({ ...draft, title: 'A composed Boss' }, edited);
  assert.equal(payload.title, 'A composed Boss');
  assert.deepEqual(JSON.parse(JSON.stringify(payload.subObjectives)), [{ title: 'Edited 1', weight: 250 }, { title: 'Edited 2', weight: 750 }]);
  assert.deepEqual(payload.mindMapSource, draft.source);
  assert.equal(validateMindMapBossDraft('   ', edited), 'Le titre du Boss doit contenir de 1 à 80 caractères.');
  assert.match(validateMindMapBossDraft('Boss', edited.map(step => ({ ...step, weight: 1000 }))), /total/);
  assert.match(validateMindMapBossDraft('Boss', edited.map(step => ({ ...step, weight: 1.5 }))), /entier/);
  assert.match(validateMindMapBossDraft('Boss', edited.map(step => ({ ...step, title: ' '.repeat(2) }))), /étape/);
});

test('branch equality detects parent, child revision, order and membership conflicts', () => {
  const { sameMindMapBranch } = load();
  const base = { parentId: 'root', parentRevision: '4', children: [{ id: 'a', revision: '1' }, { id: 'b', revision: '2' }] };
  assert.equal(sameMindMapBranch(base, structuredClone(base)), true);
  assert.equal(sameMindMapBranch(base, { ...base, parentRevision: '5' }), false);
  assert.equal(sameMindMapBranch(base, { ...base, children: [{ id: 'a', revision: '2' }, base.children[1]] }), false);
  assert.equal(sameMindMapBranch(base, { ...base, children: [...base.children].reverse() }), false);
  assert.equal(sameMindMapBranch(base, { ...base, children: [base.children[0]] }), false);
});

test('UI uses the existing boss.create command, explicit confirmation and same-request retry without client XP', () => {
  const component = read('src/components/hunter/MindMapBossPreview.tsx');
  const workspace = read('src/components/hunter/HunterWorkspace.tsx');
  const migration = fs.readFileSync(path.join(root, '..', 'supabase/migrations/20261018002900_mind_map_boss_conversion.sql'), 'utf8');
  assert.match(component, /onCommand\('boss\.create',\s*mindMapBossPayload/);
  assert.match(component, /submitLock\.current/);
  assert.match(component, /confirmed/);
  assert.match(component, /onRetry\(\)/);
  assert.match(component, /weightPreview/);
  assert.match(workspace, /MindMapBossPreview nodes=\{nodes\}/);
  assert.doesNotMatch(component + migration, /lifequest\.credit|xpAwarded|period_key|Date\.now/);
  assert.match(migration, /SOURCE_ALREADY_CONVERTED/);
  assert.match(migration, /REVISION_CONFLICT/);
  assert.match(migration, /ON DELETE RESTRICT/i);
  assert.match(migration, /create unique index boss_missions_one_per_source_node/);
});
