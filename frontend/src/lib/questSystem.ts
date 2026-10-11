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
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const finiteNonNegative = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const validDate = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));
export function validState(input: unknown): input is QuestSystemState {
  if (!isRecord(input)) return false;
  const x=input;
  if (x.version!==1 || !finiteNonNegative(x.totalXP) || !Array.isArray(x.quests) || !Array.isArray(x.arcs) || !Array.isArray(x.completions)) return false;
  if (!x.quests.every((q: unknown) => isRecord(q) && typeof q.id==="string" && q.id.length>0 && typeof q.title==="string" && finiteNonNegative(q.xp) && q.xp<=300 && ["daily","weekly","monthly","once"].includes(String(q.frequency)) && ATTRS.includes(q.attribute as Attribute) && validDate(q.createdAt) && (q.archived===undefined || typeof q.archived==="boolean"))) return false;
  if (!x.arcs.every((a: unknown) => isRecord(a) && typeof a.id==="string" && typeof a.title==="string" && typeof a.targetDate==="string" && validDate(a.createdAt))) return false;
  if (!x.completions.every((c: unknown) => isRecord(c) && typeof c.id==="string" && typeof c.questId==="string" && typeof c.period==="string" && validDate(c.completedAt) && finiteNonNegative(c.xpAwarded) && ATTRS.includes(c.attribute as Attribute))) return false;
  const eventKeys=new Set<string>();
  for(const c of x.completions as Completion[]){const key=`${c.questId}\u0000${c.period}`;if(eventKeys.has(key))return false;eventKeys.add(key);}
  return true;
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
    // Never interpret malformed JSON or an invalid legacy record as a fresh account.
    throw Error(`Sauvegarde LifeQuest illisible : ${error instanceof Error ? error.message : "erreur inconnue"}. Aucune modification.`);
  }
}
export function saveState(state: QuestSystemState) {
  if(!validState(state)) throw Error("Enregistrement refuse : état de progression invalide.");
  // The new save is primary; old key is only updated for level-dependent legacy widgets.
  window.localStorage.setItem(SYSTEM_KEY, JSON.stringify(state));
  const oldRaw = window.localStorage.getItem(LEGACY_KEY);
  let previous: Record<string, unknown> = {};
  try { if (oldRaw) { const parsed: unknown = JSON.parse(oldRaw); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) previous = parsed as Record<string,unknown>; } } catch { /* ignore invalid legacy data */ }
  window.localStorage.setItem(LEGACY_KEY, JSON.stringify({ ...previous, totalXP: state.totalXP, quests: Array.isArray(previous.quests) ? previous.quests : [] }));
}
