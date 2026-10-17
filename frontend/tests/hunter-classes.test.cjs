const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const project = path.resolve(__dirname, '..');
const catalogPath = path.join(project, 'src/lib/hunter/classes.ts');
const catalogSource = fs.readFileSync(catalogPath, 'utf8');
const output = ts.transpileModule(catalogSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const catalogModule = new Module(catalogPath, module);
catalogModule.filename = catalogPath;
catalogModule.paths = Module._nodeModulePaths(project);
catalogModule._compile(output, catalogPath);
const { HUNTER_CLASSES, isHunterClassCode } = catalogModule.exports;

test('Hunter Classes V1 exposes the five stable narrative identities without progression effects', () => {
  assert.deepEqual(HUNTER_CLASSES.map(item => item.code), [
    'threshold_scout', 'obsidian_sentinel', 'archive_arcanist', 'flamebearer', 'oathweaver',
  ]);
  assert.equal(new Set(HUNTER_CLASSES.map(item => item.name)).size, 5);
  assert.equal(new Set(HUNTER_CLASSES.map(item => item.title)).size, 5);
  assert.equal(new Set(HUNTER_CLASSES.map(item => item.objective)).size, 5);
  assert.equal(new Set(HUNTER_CLASSES.map(item => item.emblem)).size, 5);
  for (const item of HUNTER_CLASSES) {
    assert.ok(item.name && item.title && item.description && item.affinity && item.objective);
    assert.equal(item.attributes.length, 2);
    assert.ok(item.accent && item.secondary);
    for (const field of ['xp', 'reward', 'level', 'rank', 'bonus', 'penalty']) assert.equal(field in item, false);
  }
  assert.deepEqual(new Set(HUNTER_CLASSES.map(item => item.attributes[0])), new Set([
    'focus', 'discipline', 'knowledge', 'energy', 'consistency',
  ]));
  assert.deepEqual(new Set(HUNTER_CLASSES.flatMap(item => item.attributes)), new Set([
    'focus', 'discipline', 'knowledge', 'energy', 'consistency',
  ]));
  assert.equal(isHunterClassCode('threshold_scout'), true);
  assert.equal(isHunterClassCode('invented_class'), false);
  assert.equal(isHunterClassCode(null), false);
});

test('class changes stay behind the verified command route and additive SQL RPC', () => {
  const route = fs.readFileSync(path.join(project, 'src/app/api/hunter/command/route.ts'), 'utf8');
  const migration = fs.readFileSync(path.resolve(project, '../supabase/migrations/20261015002800_hunter_classes_v1.sql'), 'utf8');
  assert.match(route, /profileKinds\.has\(input\.kind\) \? 'lifequest_profile_command'/);
  assert.match(migration, /alter table lifequest\.hunter_profiles add column class_code text/);
  assert.match(migration, /grant update\(class_code,revision\) on lifequest\.hunter_profiles to lifequest_command_owner/);
  assert.match(migration, /add constraint hunter_profiles_class_code_check/);
  assert.match(migration, /create function public\.lifequest_profile_command/);
  assert.match(migration, /grant execute on function public\.lifequest_profile_command\(uuid,uuid,text,jsonb\) to authenticated/);
  assert.match(migration, /revoke insert on lifequest\.hunter_profiles from lifequest_command_owner/);
  assert.match(migration, /grant update\(class_code,revision\) on lifequest\.hunter_profiles to lifequest_command_owner/);
  assert.doesNotMatch(route, /\.from\(['"]hunter_profiles['"]\)/);
});
