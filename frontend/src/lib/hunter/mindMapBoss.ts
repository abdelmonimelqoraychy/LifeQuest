export type MindMapNode = {
  id: string;
  parentId: string | null;
  title: string;
  revision: string;
  sortPosition: string;
};

export type BossDraftStep = {
  sourceId: string;
  sourceRevision: string;
  title: string;
  weight: number;
};

export type MindMapBossDraft = {
  source: { parentId: string; parentRevision: string; children: Array<{ id: string; revision: string }> };
  sourceTitle: string;
  title: string;
  steps: BossDraftStep[];
};

const MAX_STEPS = 20;
const MAX_WEIGHT = 1000;

function compareUtf8(left: string, right: string): number {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

export function buildMindMapBossDraft(nodes: MindMapNode[], parentId: string): MindMapBossDraft | null {
  const parent = nodes.find(node => node.id === parentId);
  if (!parent || !parent.revision || !/^\d+$/.test(parent.revision)) return null;

  const directChildren = nodes
    .filter(node => node.parentId === parentId);
  if (directChildren.some(child => !/^(0|[1-9]\d*)$/.test(child.sortPosition))) return null;

  const children = directChildren
    .map((node, index) => ({ node, index }))
    .sort((left, right) => {
      const a = BigInt(left.node.sortPosition);
      const b = BigInt(right.node.sortPosition);
      return a < b ? -1 : a > b ? 1 : compareUtf8(left.node.id, right.node.id) || left.index - right.index;
    })
    .map(item => item.node);

  if (children.length < 1 || children.length > MAX_STEPS || children.some(child => !child.revision || !/^\d+$/.test(child.revision))) return null;
  return {
    source: {
      parentId: parent.id,
      parentRevision: parent.revision,
      children: children.map(child => ({ id: child.id, revision: child.revision })),
    },
    sourceTitle: parent.title,
    title: parent.title,
    steps: children.map(child => ({ sourceId: child.id, sourceRevision: child.revision, title: child.title, weight: 1 })),
  };
}

export function validateMindMapBossDraft(title: string, steps: BossDraftStep[]): string | null {
  if (!title.trim() || title.trim().length > 80) return 'Le titre du Boss doit contenir de 1 à 80 caractères.';
  if (steps.length < 1 || steps.length > MAX_STEPS) return 'La branche doit contenir de 1 à 20 étapes.';
  if (steps.some(step => !step.title.trim() || step.title.trim().length > 120)) return 'Chaque étape doit contenir de 1 à 120 caractères.';
  if (steps.some(step => !Number.isSafeInteger(step.weight) || step.weight < 1 || step.weight > MAX_WEIGHT)) return 'Chaque poids doit être un entier de 1 à 1 000.';
  if (steps.reduce((sum, step) => sum + step.weight, 0) > MAX_WEIGHT) return 'Le poids total ne peut pas dépasser 1 000.';
  return null;
}

export function mindMapBossPayload(draft: MindMapBossDraft, steps: BossDraftStep[]) {
  return {
    title: draft.title.trim(),
    subObjectives: steps.map(step => ({ title: step.title.trim(), weight: step.weight })),
    mindMapSource: draft.source,
  };
}

export function sameMindMapBranch(left: MindMapBossDraft['source'], right: MindMapBossDraft['source']): boolean {
  return left.parentId === right.parentId
    && left.parentRevision === right.parentRevision
    && left.children.length === right.children.length
    && left.children.every((child, index) => child.id === right.children[index]?.id && child.revision === right.children[index]?.revision);
}
