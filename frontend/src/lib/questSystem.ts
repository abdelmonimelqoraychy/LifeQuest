import type { Attribute, Quest } from "@/types";

export type Frequency = "daily" | "weekly" | "monthly" | "once";
export type SystemQuest = Omit<Quest, "completed"> & {
  frequency: Frequency;
  createdAt: string;
  arcId?: string;
  targetDate?: string;
  archived?: boolean;
};
export type StoryArc = { id: string; title: string; description: string; targetDate: string; createdAt: string };
export type Completion = { id: string; questId: string; period: string; completedAt: string; xpAwarded: number; attribute: Attribute };
export type QuestSystemState = { version: 1; totalXP: number; quests: SystemQuest[]; arcs: StoryArc[]; completions: Completion[] };
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
  if (q.archived) return false;
  if (q.frequency === "once") return !q.targetDate || q.targetDate <= localDate(now);
  return localDate(new Date(q.createdAt)) <= localDate(now);
}
export function hasCompleted(q: SystemQuest, completions: Completion[], now: Date = new Date()) {
  const p = periodId(q.frequency, now);
  return completions.some(c => c.questId === q.id && c.period === p);
}
export function newId() { return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
const ATTRS: Attribute[] = ["focus", "discipline", "knowledge", "energy", "consistency"];
export function validState(input: unknown): input is QuestSystemState {
  if (!input || typeof input !== "object") return false;
  const x = input as Partial<QuestSystemState>;
  return x.version === 1 && typeof x.totalXP === "number" && Number.isFinite(x.totalXP) && x.totalXP >= 0 && Array.isArray(x.quests) && Array.isArray(x.arcs) && Array.isArray(x.completions)
    && x.quests.every(q => typeof q.id === "string" && typeof q.title === "string" && typeof q.xp === "number" && Number.isFinite(q.xp) && q.xp >= 0 && q.xp <= 300 && ["daily","weekly","monthly","once"].includes(q.frequency) && ATTRS.includes(q.attribute))
    && x.completions.every(c => typeof c.questId === "string" && typeof c.period === "string" && typeof c.xpAwarded === "number");
}
export function loadState(): QuestSystemState {
  try {
    const current = window.localStorage.getItem(SYSTEM_KEY);
    if (current) {
      const parsed: unknown = JSON.parse(current);
      if (validState(parsed)) return parsed;
      // Do not overwrite an unrecognized or damaged save.
      throw Error("Sauvegarde LifeQuest invalide : aucune modification effectuée.");
    }
    const oldRaw = window.localStorage.getItem(LEGACY_KEY);
    const old: unknown = oldRaw ? JSON.parse(oldRaw) : null;
    const xp = old && typeof old === "object" && "totalXP" in old && typeof old.totalXP === "number" && Number.isFinite(old.totalXP) && old.totalXP >= 0 ? old.totalXP : 0;
    // Legacy demo quests are not imported: past EXP is retained and default tasks disappear.
    return { ...emptySystem, totalXP: xp };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Sauvegarde LifeQuest")) throw error;
    return { ...emptySystem };
  }
}
export function saveState(state: QuestSystemState) {
  // The new save is primary; old key is only updated for level-dependent legacy widgets.
  window.localStorage.setItem(SYSTEM_KEY, JSON.stringify(state));
  const oldRaw = window.localStorage.getItem(LEGACY_KEY);
  let previous: Record<string, unknown> = {};
  try { if (oldRaw) { const parsed: unknown = JSON.parse(oldRaw); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) previous = parsed as Record<string,unknown>; } } catch { /* ignore invalid legacy data */ }
  window.localStorage.setItem(LEGACY_KEY, JSON.stringify({ ...previous, totalXP: state.totalXP, quests: Array.isArray(previous.quests) ? previous.quests : [] }));
}
