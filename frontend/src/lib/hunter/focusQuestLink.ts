export type FocusQuestTarget = {
  kind: 'quest';
  questId: string;
  expectedRevision: string;
} | {
  kind: 'boss_subobjective';
  bossId: string;
  subObjectiveId: string;
  expectedBossRevision: string;
  expectedSubObjectiveRevision: string;
};

export type FocusOption = {
  id: string;
  title: string;
  revision: string;
};

export type FocusBossStepOption = FocusOption & {
  bossId: string;
  bossTitle: string;
  bossRevision: string;
  label: string;
};

type Row = Record<string, unknown>;
const REVISION = /^(0|[1-9]\d{0,18})$/;
const isRow = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value);
const stringField = (row: Row, key: string) => typeof row[key] === 'string' ? row[key] as string : '';
const validRevision = (value: string) => REVISION.test(value);

export function eligibleFocusQuests(rows: Row[]): FocusOption[] {
  return rows.flatMap(row => {
    const id = stringField(row, 'id');
    const title = stringField(row, 'title');
    const revision = stringField(row, 'revision');
    return id && title.trim() && row.archived === false && validRevision(revision)
      ? [{ id, title, revision }]
      : [];
  });
}

export function eligibleFocusBossSteps(rows: Row[]): FocusBossStepOption[] {
  const result: FocusBossStepOption[] = [];
  for (const boss of rows) {
    const bossId = stringField(boss, 'id');
    const bossTitle = stringField(boss, 'title');
    const bossRevision = stringField(boss, 'revision');
    const terminal = ['credited', 'resolved_without_xp'].includes(stringField(boss, 'rewardStatus'));
    const finished = boss.completed === true || Boolean(stringField(boss, 'completedAt'))
      || stringField(boss, 'status').toLowerCase() === 'completed';
    const current = Number(boss.current);
    const target = Number(boss.target);
    if (!bossId || !bossTitle.trim() || !validRevision(bossRevision) || terminal || finished
      || !Number.isSafeInteger(current) || !Number.isSafeInteger(target) || current >= target) continue;

    const steps = Array.isArray(boss.subObjectives) ? boss.subObjectives : [];
    for (const item of steps) {
      if (!isRow(item) || item.completed !== false) continue;
      const id = stringField(item, 'id');
      const title = stringField(item, 'title');
      const revision = stringField(item, 'revision');
      if (!id || !title.trim() || !validRevision(revision)) continue;
      result.push({
        id,
        title,
        revision,
        bossId,
        bossTitle,
        bossRevision,
        label: `${bossTitle} — ${title}`,
      });
    }
  }
  return result;
}

export function buildFocusTarget(
  kind: 'free' | 'quest' | 'boss_subobjective',
  selectedId: string,
  quests: FocusOption[],
  bossSteps: FocusBossStepOption[],
): FocusQuestTarget | null {
  if (kind === 'free') return null;
  if (kind === 'quest') {
    const quest = quests.find(item => item.id === selectedId);
    return quest ? { kind: 'quest', questId: quest.id, expectedRevision: quest.revision } : null;
  }
  const step = bossSteps.find(item => `${item.bossId}:${item.id}` === selectedId);
  return step ? {
    kind: 'boss_subobjective',
    bossId: step.bossId,
    subObjectiveId: step.id,
    expectedBossRevision: step.bossRevision,
    expectedSubObjectiveRevision: step.revision,
  } : null;
}

export function parseMeasuredFocusMs(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 1_500_000 ? parsed : null;
}

export function formatMeasuredFocusMs(value: number): string {
  const seconds = Math.floor(value / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
