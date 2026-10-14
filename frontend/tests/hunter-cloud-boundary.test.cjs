'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('protected Hunter pages mount only after a server-verified ready snapshot', () => {
  const guard = read('src/components/auth/ProtectedHunter.tsx');
  assert.match(guard, /verifiedSession\(\)/);
  assert.match(guard, /lifequest_hunter_snapshot/);
  assert.match(guard, /snapshot\.state !== 'ready'/);
  assert.match(guard, /HunterCloudProvider[^\n]*\{children\}/);
  assert.match(guard, /Aucune donnée locale ne sera affichée/);
});

test('pending onboarding route is protected by its page without a self-redirecting Hunter wrapper', () => {
  const layout = read('src/app/onboarding/layout.tsx');
  const page = read('src/app/onboarding/page.tsx');
  assert.doesNotMatch(layout, /import\s+ProtectedHunter|<ProtectedHunter/);
  assert.match(layout, /return children/);
  assert.match(page, /verifiedSession\(\)/);
  assert.match(page, /lifequest_auth5_state/);
});

test('connected Hunter page entrypoints contain no local readers or storage-backed mutations', () => {
  const pages = [
    'src/app/dashboard/page.tsx','src/app/quests/page.tsx','src/app/quests/create/page.tsx',
    'src/app/arcs/page.tsx','src/app/hunter-core/page.tsx','src/app/hunter-operations/page.tsx','src/app/hunter-lab/page.tsx',
  ];
  for (const page of pages) {
    const source = read(page);
    assert.match(source, /HunterWorkspace/);
    assert.doesNotMatch(source, /localStorage|useStoredData|useQuestSystem|importLifeQuest|exportLifeQuest/);
  }
  const shell = read('src/components/system/SystemShell.tsx');
  assert.doesNotMatch(shell, /localStorage|useStoredData|readProfile/);
});

test('command API accepts only known intents and injects the authenticated actor server-side', () => {
  const source = read('src/app/api/hunter/command/route.ts');
  assert.match(source, /verifiedSession\(true\)/);
  assert.match(source, /expected_actor: session\.user\.id/);
  assert.match(source, /lifequest_quest_command/);
  assert.match(source, /lifequest_operations_command/);
  assert.match(source, /lifequest_lab_command/);
  assert.match(source, /request\.headers\.get\('origin'\) !== appOrigin\(\)/);
  assert.doesNotMatch(source, /service_role|from\(['"]lifequest\./i);
});

test('cloud client sends no period, XP award, or client timestamp to reward commands', () => {
  const source = read('src/components/hunter/HunterWorkspace.tsx');
  assert.match(source, /onComplete=\{id => \{ void act\('quest\.complete', \{ id \}\); \}\}/);
  const createPayload = source.match(/const questPayload = [\s\S]*?function toQuestState/);
  assert.ok(createPayload, 'quest payload builder is present');
  assert.doesNotMatch(createPayload[0], /period|award|xp|completedAt|Date\.now/);
  assert.match(source, /expectedRevision: revision\('quests'/);
});
