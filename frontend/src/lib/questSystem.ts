import { assertBusinessStorageAccess } from '@/lib/storageAccess';
import type { Attribute, Quest } from "@/types";
import { validAchievementUnlocks, type AchievementUnlock } from '@/lib/achievements';
import { isRecord, text, id, nonNegative, timestamp, calendarDate, uniqueIds } from "@/lib/validation";

export type Frequency = "daily" | "weekly" | "monthly" | "once";
export type SystemQuest = Omit<Quest, "completed"> & {
  frequency: Frequency;
  createdAt: string;
  arcId?: string;
  targetDate?: string;
  archived?: boolean;
  availableAfter?: string;
  revision?: number;
};
export type StoryArc = { id: string; title: string; description: string; targetDate: string; createdAt: string };
export type Completion = { id: string; questId: string; period: string; completedAt: string; xpAwarded: number; attribute: Attribute; questTitle?: string; arcId?: string | null };
export type QuestSystemState = { version: 1; totalXP: number; quests: SystemQuest[]; arcs: StoryArc[]; completions: Completion[]; achievements?: AchievementUnlock[] };
export const SYSTEM_KEY = "lifequest-quest-system-v1";
export const LEGACY_KEY = "lifequest-v2-demo";
export const emptySystem: QuestSystemState = { version: 1, totalXP: 0, quests: [], arcs: [], completions: [] };

function pad(n: number) { return String(n).padStart(2, "0"); }
export function localDate(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
export function periodId(f: Frequency, date: Date = new Date()) {
  if (f === "once") return "once";
  if (f === "daily") return localDate(date);
  if (f === "monthly") return localDate(date).slice(0, 7);
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return `week:${localDate(monday)}`;
}
export function isDue(q: SystemQuest, now: Date = new Date()) {
  if (q.archived || (q.availableAfter && q.availableAfter > localDate(now))) return false;
  if (q.frequency === "once") return !q.targetDate || q.targetDate <= localDate(now);
  return localDate(new Date(q.createdAt)) <= localDate(now);
}
export function completionIndex(items:Completion[]):ReadonlySet<string>{return new Set(items.map(c=>JSON.stringify([c.questId,c.period])));}
export function hasCompleted(q: SystemQuest, completions: Completion[]|ReadonlySet<string>, now: Date = new Date()) {
  const p = periodId(q.frequency, now);
  return "has" in completions ? completions.has(JSON.stringify([q.id,p])) : completions.some(c => c.questId === q.id && c.period === p);
}
export function newId() { return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
const ATTRS: Attribute[] = ["focus", "discipline", "knowledge", "energy", "consistency"];
function validPeriod(p:unknown){
 if(!text(p))return false;if(p==='once'||calendarDate(p as unknown))return true;
 if(/^\d{4}-\d{2}$/.test(p))return calendarDate(p+'-01');
 return p.startsWith('week:')&&calendarDate(p.slice(5))&&new Date(p.slice(5)+'T12:00:00Z').getUTCDay()===1;
}
export function validState(input: unknown): input is QuestSystemState {
  if (!isRecord(input) || input.version!==1 || !nonNegative(input.totalXP) || !Array.isArray(input.quests) || !Array.isArray(input.arcs) || !Array.isArray(input.completions)) return false;
  if (!input.quests.every(q => isRecord(q) && id(q.id) && !q.id.startsWith('lifequest:activity:') && text(q.title) && !!q.title.trim() && text(q.description) && nonNegative(q.xp) && q.xp<=300 && text(q.frequency) && ['daily','weekly','monthly','once'].includes(q.frequency) && text(q.difficulty) && ['EASY','NORMAL','HARD'].includes(q.difficulty) && ATTRS.includes(q.attribute as Attribute) && timestamp(q.createdAt) && (q.archived===undefined || typeof q.archived==='boolean') && (q.arcId===undefined || id(q.arcId)) && (q.targetDate===undefined || calendarDate(q.targetDate)) && (q.availableAfter===undefined || calendarDate(q.availableAfter)) && (q.revision===undefined || (nonNegative(q.revision)&&Number.isInteger(q.revision))))) return false;
  if (!input.arcs.every(a => isRecord(a) && id(a.id) && text(a.title) && !!a.title.trim() && text(a.description) && calendarDate(a.targetDate) && timestamp(a.createdAt))) return false;
  if (!input.completions.every(c => isRecord(c) && id(c.id) && id(c.questId) && validPeriod(c.period) && timestamp(c.completedAt) && nonNegative(c.xpAwarded) && ATTRS.includes(c.attribute as Attribute) && (c.questTitle===undefined || text(c.questTitle)) && (c.arcId===undefined || c.arcId===null || id(c.arcId)))) return false;
  if(input.achievements!==undefined && !validAchievementUnlocks(input.achievements))return false;
  const quests=input.quests as SystemQuest[], arcs=input.arcs as StoryArc[], completions=input.completions as Completion[];
  if(!uniqueIds(quests)||!uniqueIds(arcs)||!uniqueIds(completions))return false;
  const questIds=new Set(quests.map(q=>q.id)),arcIds=new Set(arcs.map(a=>a.id));
  if(quests.some(q=>q.arcId && !arcIds.has(q.arcId)) || completions.some(c=>!questIds.has(c.questId) && !c.questId.startsWith('lifequest:activity:')))return false;
  // Activities have one lifetime reward; only quests can recur across periods.
  // Together with the duplicate (questId, period) check, this also protects imports.
  if(completions.some(c=>c.questId.startsWith('lifequest:activity:') && c.period!=='once'))return false;
  const earned=completions.reduce((sum,c)=>sum+c.xpAwarded,0);
  if(earned>input.totalXP+Number.EPSILON*Math.max(1,earned)*4)return false;
  return new Set(completions.map(c=>JSON.stringify([c.questId,c.period]))).size===completions.length;
}
export function legacyXP(input:unknown):number {
  if(!isRecord(input)||!nonNegative(input.totalXP))throw Error('Ancienne sauvegarde invalide. Les données sont conservées.');
  return input.totalXP;
}
export function loadState(): QuestSystemState {assertBusinessStorageAccess();
  try {
    const current = window.localStorage.getItem(SYSTEM_KEY);assertBusinessStorageAccess();
    if (current !== null) {
      const parsed: unknown = JSON.parse(current);
      if (validState(parsed)) {assertBusinessStorageAccess();return parsed;}
      // Do not overwrite an unrecognized or damaged save.
      throw Error("Sauvegarde LifeQuest invalide : aucune modification effectuée.");
    }
    const oldRaw = window.localStorage.getItem(LEGACY_KEY);assertBusinessStorageAccess();
    const old: unknown = oldRaw ? JSON.parse(oldRaw) : null;
    const xp = oldRaw !== null ? legacyXP(old) : 0;
    // Legacy demo quests are not imported: past EXP is retained and default tasks disappear.
    assertBusinessStorageAccess();return { ...emptySystem, totalXP: xp };
  } catch (error) {
    // Never interpret malformed JSON or an invalid legacy record as a fresh account.
    throw Error(`Sauvegarde LifeQuest illisible : ${error instanceof Error ? error.message : "erreur inconnue"}. Aucune modification.`);
  }
}
export function saveState(state: QuestSystemState) {assertBusinessStorageAccess();
  if(!validState(state)) throw Error("Enregistrement refuse : état de progression invalide.");
  // The new save is primary; old key is only updated for level-dependent legacy widgets.
  assertBusinessStorageAccess();window.localStorage.setItem(SYSTEM_KEY, JSON.stringify(state));
  try {
  const oldRaw = window.localStorage.getItem(LEGACY_KEY);
  let previous: Record<string, unknown> = {};
  try { if (oldRaw) { const parsed: unknown = JSON.parse(oldRaw); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) previous = parsed as Record<string,unknown>; } } catch { /* ignore invalid legacy data */ }
  window.localStorage.setItem(LEGACY_KEY, JSON.stringify({ ...previous, totalXP: state.totalXP, quests: Array.isArray(previous.quests) ? previous.quests : [] }));
  } catch { /* Primary save is committed; compatibility mirror must not report a false failure. */ }
}
