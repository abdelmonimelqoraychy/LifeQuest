import type { Attribute } from '@/types';

export const HUNTER_CLASSES = [
  {
    code: 'threshold_scout',
    name: 'Éclaireur du Seuil',
    title: 'Cartographe des seuils',
    description: 'Repère la prochaine étape et garde le regard sur l’essentiel.',
    affinity: 'Une voie tournée vers l’attention, la préparation et les premiers pas décisifs.',
    objective: 'Identifier une prochaine action claire avant d’ouvrir un nouveau front.',
    attributes: ['focus', 'energy'],
    attributeLabel: 'Concentration · Énergie',
    emblem: 'compass',
    accent: '#78dff2',
    secondary: '#b4c8df',
  },
  {
    code: 'obsidian_sentinel',
    name: 'Sentinelle d’Obsidienne',
    title: 'Gardienne du rempart',
    description: 'Tient la ligne lorsque l’effort demande du temps et de la constance.',
    affinity: 'Une voie de maîtrise, de stabilité et d’engagement tenu.',
    objective: 'Protéger un engagement essentiel jusqu’à son terme.',
    attributes: ['discipline', 'consistency'],
    attributeLabel: 'Discipline · Régularité',
    emblem: 'shield',
    accent: '#d5b779',
    secondary: '#c4c8d4',
  },
  {
    code: 'archive_arcanist',
    name: 'Arcaniste des Archives',
    title: 'Archiviste des savoirs',
    description: 'Transforme les découvertes en repères que l’on peut retrouver et transmettre.',
    affinity: 'Une voie d’apprentissage, de curiosité et de réflexion profonde.',
    objective: 'Transformer une découverte en note ou en geste réutilisable.',
    attributes: ['knowledge', 'focus'],
    attributeLabel: 'Savoir · Concentration',
    emblem: 'book',
    accent: '#b6a0ff',
    secondary: '#d0c1f2',
  },
  {
    code: 'flamebearer',
    name: 'Porte-Flamme',
    title: 'Cœur de braise',
    description: 'Ravive l’élan et donne une forme concrète aux idées en mouvement.',
    affinity: 'Une voie d’énergie, de création et de mise en action.',
    objective: 'Relancer une intention par une petite action visible.',
    attributes: ['energy', 'knowledge'],
    attributeLabel: 'Énergie · Savoir',
    emblem: 'flame',
    accent: '#f29b72',
    secondary: '#e9c7ab',
  },
  {
    code: 'oathweaver',
    name: 'Tisseur de Serments',
    title: 'Veilleur des cycles',
    description: 'Relie les promesses aux habitudes qui prennent racine dans la durée.',
    affinity: 'Une voie de régularité, de confiance et de liens solides.',
    objective: 'Tenir un cycle simple assez longtemps pour en observer l’effet.',
    attributes: ['consistency', 'discipline'],
    attributeLabel: 'Régularité · Discipline',
    emblem: 'knot',
    accent: '#8fd5b4',
    secondary: '#c4ddce',
  },
] as const satisfies readonly {
  code: string;
  name: string;
  title: string;
  description: string;
  affinity: string;
  objective: string;
  attributes: readonly [Attribute, Attribute];
  attributeLabel: string;
  emblem: 'compass' | 'shield' | 'book' | 'flame' | 'knot';
  accent: string;
  secondary: string;
}[];

export type HunterClassCode = (typeof HUNTER_CLASSES)[number]['code'];
export type HunterClass = (typeof HUNTER_CLASSES)[number];
export const HUNTER_CLASS_CODES = HUNTER_CLASSES.map(item => item.code) as HunterClassCode[];

export function isHunterClassCode(value: unknown): value is HunterClassCode {
  return typeof value === 'string' && HUNTER_CLASS_CODES.includes(value as HunterClassCode);
}

export function hunterClassFor(code: unknown): HunterClass | null {
  return isHunterClassCode(code) ? HUNTER_CLASSES.find(item => item.code === code) || null : null;
}
