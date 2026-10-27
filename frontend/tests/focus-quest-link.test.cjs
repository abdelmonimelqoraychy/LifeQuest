'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const frontendRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(frontendRoot, '..');
const read = file => fs.readFileSync(path.join(frontendRoot, file), 'utf8');
const load = () => {
  const source = read('src/lib/hunter/focusQuestLink.ts');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports, Number, String, Array, Object, Math });
  return compiledModule.exports;
};

test('only unarchived quests and unfinished steps on active Bosses are eligible', () => {
  const { eligibleFocusQuests, eligibleFocusBossSteps } = load();
  assert.deepEqual(JSON.parse(JSON.stringify(eligibleFocusQuests([
    { id: 'q1', title: 'Write proposal', revision: '3', archived: false },
    { id: 'q2', title: 'Archived', revision: '1', archived: true },
    { id: 'bad', title: 'Bad revision', revision: '01' },
  ]))), [{ id: 'q1', title: 'Write proposal', revision: '3' }]);
  const steps = eligibleFocusBossSteps([
    { id: 'b1', title: 'Ship project', revision: '4', current: 1, target: 3, rewardStatus: 'pending', subObjectives: [
      { id: 's1', title: 'Research', revision: '2', completed: false },
      { id: 's2', title: 'Deploy', revision: '0', completed: true },
    ] },
    { id: 'b2', title: 'Claimed', revision: '0', current: 1, target: 1, rewardStatus: 'credited', subObjectives: [{ id: 's3', title: 'Done', revision: '1' }] },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(steps)), [{
    id: 's1', title: 'Research', revision: '2', bossId: 'b1', bossTitle: 'Ship project', bossRevision: '4', label: 'Ship project — Research',
  }]);
});

test('target payload binds selected identifiers to snapshot revisions and rejects stale selections locally', () => {
  const { buildFocusTarget } = load();
  const quests = [{ id: 'q1', title: 'Write proposal', revision: '9' }];
  const steps = [{ id: 's1', title: 'Research', revision: '2', bossId: 'b1', bossTitle: 'Ship project', bossRevision: '4', label: 'Ship project — Research' }];
  assert.equal(buildFocusTarget('free', '', quests, steps), null);
  assert.deepEqual(JSON.parse(JSON.stringify(buildFocusTarget('quest', 'q1', quests, steps))), {
    kind: 'quest', questId: 'q1', expectedRevision: '9',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(buildFocusTarget('boss_subobjective', 'b1:s1', quests, steps))), {
    kind: 'boss_subobjective', bossId: 'b1', subObjectiveId: 's1', expectedBossRevision: '4', expectedSubObjectiveRevision: '2',
  });
  assert.equal(buildFocusTarget('quest', 'missing', quests, steps), null);
  assert.equal(buildFocusTarget('boss_subobjective', 'b1:missing', quests, steps), null);
});

test('measured duration accepts only bounded exact milliseconds and leaves legacy minutes unknown', () => {
  const { parseMeasuredFocusMs, formatMeasuredFocusMs } = load();
  assert.equal(parseMeasuredFocusMs('1500000'), 1500000);
  assert.equal(parseMeasuredFocusMs(125050), 125050);
  assert.equal(parseMeasuredFocusMs(null), null);
  assert.equal(parseMeasuredFocusMs('25'), 25);
  assert.equal(parseMeasuredFocusMs('1.5'), null);
  assert.equal(parseMeasuredFocusMs('1500001'), null);
  assert.equal(parseMeasuredFocusMs('-1'), null);
  assert.equal(formatMeasuredFocusMs(125050), '02:05');
});

test('migration uses strict optional target contracts and preserves the one existing Focus credit path', () => {
  const migration = fs.readFileSync(path.join(repoRoot, 'supabase/migrations/20261019003200_focus_quest_link.sql'), 'utf8');
  const base = fs.readFileSync(path.join(repoRoot, 'supabase/migrations/20261013001001_auth4_command_block_scopes.sql'), 'utf8');
  const commandStart = base.indexOf('create or replace function public.lifequest_operations_command');
  const commandEnd = base.indexOf('create or replace function public.lifequest_lab_command', commandStart);
  assert.ok(commandStart >= 0 && commandEnd > commandStart, 'operations command source is present');
  let command = base.slice(commandStart, commandEnd);
  const replacements = [...migration.matchAll(/old_fragment:=\$old\$([\s\S]*?)\$old\$;[\s\S]*?new_fragment:=\$new\$([\s\S]*?)\$new\$;/g)];
  assert.equal(replacements.length, 7, 'all dynamic source replacements are versioned');
  for (const [, oldFragment, newFragment] of replacements) {
    const count = command.split(oldFragment).length - 1;
    assert.equal(count, 1, `SQL replacement fragment occurs exactly once: ${oldFragment.slice(0, 70)}`);
    command = command.replace(oldFragment, newFragment);
  }
  assert.match(command, /FOCUS_TARGET_UNAVAILABLE/);
  assert.match(command, /target_label_snapshot/);
  assert.match(command, /active_ms/);
  assert.equal((command.match(/lifequest\.credit\(actor,'focus',/g) || []).length, 1);
  assert.match(migration, /array\['mode','label'\],array\['target'\]/);
  assert.match(migration, /FOCUS_TARGET_UNAVAILABLE/);
  assert.match(migration, /expected_quest_revision|v_expected_quest_revision/);
  assert.match(migration, /expected_boss_revision|v_expected_boss_revision/);
  assert.match(migration, /on delete restrict/i);
  assert.match(migration, /relforcerowsecurity/i);
  assert.match(migration, /revoke update\(target_kind,quest_id,boss_id,subobjective_id,target_label_snapshot,active_ms\)/i);
  assert.doesNotMatch(migration, /boss\.progress|quest\.complete|lifequest\.credit\s*\(/i);
  assert.equal((base.match(/lifequest\.credit\(actor,'focus',/g) || []).length, 1);
});

test('connected UI uses the existing Focus RPC and does not complete a linked objective', () => {
  const component = read('src/components/hunter/FocusQuestLink.tsx');
  const workspace = read('src/components/hunter/HunterWorkspace.tsx');
  const route = read('src/app/api/hunter/command/route.ts');
  const css = read('src/components/hunter/FocusQuestLink.module.css');
  assert.match(component, /submit\('focus\.start'/);
  assert.match(component, /onCommand\(kind, payload\)/);
  assert.match(component, /onRetry\(\)/);
  assert.match(component, /targetLabelSnapshot/);
  assert.match(component, /parseMeasuredFocusMs/);
  assert.match(workspace, /<FocusQuestLink timer=\{timer\}/);
  assert.match(workspace, /!kind\.startsWith\('focus\.'\)/);
  assert.match(route, /FOCUS_TARGET_UNAVAILABLE: 409/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /role="alert"/);
  assert.match(css, /focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /max-width:760px/);
  assert.doesNotMatch(component, /quest\.complete|boss\.progress|localStorage|xpAwarded/);
});
