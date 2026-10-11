import { loadState, saveState, newId, SYSTEM_KEY, type Completion } from "@/lib/questSystem";
import { LAB_KEY, type LabData } from "@/lib/hunterLab";
import { EXTRA_KEY, type ExtraState } from "@/lib/hunterMissions";

export const CORE_KEY = "lifequest-core-v011";
export const CORE_ACTIVITY_PREFIX = "lifequest:activity:";
export type Stat = "focus" | "discipline" | "knowledge" | "energy" | "consistency";
export type CoreSettings = { version: 1; baselineXP: number; baselineLevel: number; stability: number; lastPenaltyDay: string; penaltyDays: string[]; initializedAt: string };
export type RewardSource = "focus" | "boss";
export type RewardResult = { credited: boolean; xp: number; reason: string };
const DAY_MS = 86_400_000;
function todayLocal(now = new Date()): string { return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`; }
function safeJson(text: string | null): unknown { return text === null ? null : JSON.parse(text); }
export function initialLevel(xp: number) { return Math.min(100, Math.floor(Math.max(0,xp)/300)+1); }
export function levelCost(level: number) { return 200 + 25 * (Math.max(1,level)-1); }
export function getCoreSettings(totalXP: number): CoreSettings {
  const raw = localStorage.getItem(CORE_KEY);
  if (raw) {
    const x: unknown = safeJson(raw);
    if (!x || typeof x!=="object") throw Error("Hunter Core: données invalides. Aucune modification.");
    const c=x as Partial<CoreSettings>;
    if (c.version!==1 || !Number.isFinite(c.baselineXP) || !Number.isInteger(c.baselineLevel) || !Number.isFinite(c.stability) || !Array.isArray(c.penaltyDays)) throw Error("Hunter Core: version inconnue. Aucune modification.");
    return c as CoreSettings;
  }
  return { version:1, baselineXP:totalXP, baselineLevel:initialLevel(totalXP), stability:100, lastPenaltyDay:"", penaltyDays:[], initializedAt:new Date().toISOString() };
}
export function ensureCoreSettings(totalXP: number) {
  const settings=getCoreSettings(totalXP);
  if (!localStorage.getItem(CORE_KEY)) localStorage.setItem(CORE_KEY,JSON.stringify(settings));
  return settings;
}
export function getHunterProgress(totalXP: number, c?: CoreSettings) {
  const baseline=c ?? (typeof window!=="undefined"?getCoreSettings(totalXP):undefined);
  if (!baseline || totalXP<=baseline.baselineXP) {
    const lv=initialLevel(totalXP);
    return {level:lv, current:Math.max(0,totalXP%300), required:300, percent:lv>=100?100:Math.round((totalXP%300)/300*100)};
  }
  let level=baseline.baselineLevel;
  let earned=totalXP-baseline.baselineXP;
  if (level>=100) return {level:100,current:0,required:0,percent:100};
  while(level<100 && earned>=levelCost(level)){earned-=levelCost(level);level++;}
  return level>=100?{level:100,current:0,required:0,percent:100}:{level,current:earned,required:levelCost(level),percent:Math.min(100,Math.round(earned/levelCost(level)*100))};
}
export function streakDays(dates: string[], day=todayLocal()): number {
  const seen=new Set(dates.filter(s=>/^\d{4}-\d{2}-\d{2}$/.test(s)));
  let end=new Date(`${day}T12:00:00`);
  if (!seen.has(day)) end=new Date(end.getTime()-DAY_MS);
  let streak=0;
  while(seen.has(todayLocal(end)) && streak<10000){streak++;end=new Date(end.getTime()-DAY_MS);}
  return streak;
}
export function completionDays(items: Completion[]) {return items.filter(c=>!!c.completedAt).map(c=>todayLocal(new Date(c.completedAt)));}
export function bonusForStreak(days: number){return days>=30?1.25:days>=7?1.1:1;}
export function attributeXP(items: Completion[]) {
  const totals: Record<Stat,number>={focus:0,discipline:0,knowledge:0,energy:0,consistency:0};
  for(const c of items) if(c.attribute in totals && Number.isFinite(c.xpAwarded)) totals[c.attribute as Stat]+=Math.max(0,c.xpAwarded);
  return totals;
}
export function awardActivityXP(source: RewardSource, uniqueId: string, base: number, attribute: Stat): RewardResult {
  if(!uniqueId || !Number.isFinite(base) || base<=0 || base>1000) return {credited:false,xp:0,reason:"Récompense invalide"};
  const state=loadState();
  ensureCoreSettings(state.totalXP);
  const questId=`${CORE_ACTIVITY_PREFIX}${source}:${uniqueId}`;
  if(state.completions.some(c=>c.questId===questId))return {credited:false,xp:0,reason:"Déjà crédité"};
  const streak=streakDays(completionDays(state.completions));
  const xp=Math.round(base*bonusForStreak(streak));
  const event:Completion={id:newId(),questId,period:"once",completedAt:new Date().toISOString(),xpAwarded:xp,attribute};
  saveState({...state,totalXP:state.totalXP+xp,completions:[...state.completions,event]});
  window.dispatchEvent(new Event("lifequest-core-updated"));
  return {credited:true,xp,reason:"EXP crédités"};
}
export function applyDailyStability() {
  const state=loadState();const c=ensureCoreSettings(state.totalXP);
  const day=todayLocal();
  if(c.lastPenaltyDay===day)return c;
  // Only assess YESTERDAY; never penalize on initial setup or for days before installation.
  const yesterday=todayLocal(new Date(new Date(`${day}T12:00:00`).getTime()-DAY_MS));
  const activeSince=todayLocal(new Date(c.initializedAt));
  const missed=activeSince<=yesterday && state.quests.some(q=>q.frequency==="daily" && !q.archived && todayLocal(new Date(q.createdAt))<=yesterday && !state.completions.some(x=>x.questId===q.id && x.period===yesterday));
  const penaltyDays=missed && !c.penaltyDays.includes(yesterday)?[...c.penaltyDays,yesterday]:c.penaltyDays;
  const next={...c,stability:Math.max(0,Math.min(100,c.stability+(missed?-10:5))),lastPenaltyDay:day,penaltyDays};
  localStorage.setItem(CORE_KEY,JSON.stringify(next));return next;
}
export type LifeQuestBackup={format:"lifequest-backup";version:1;exportedAt:string;records:Record<string,string|null>};
const KEYS=[SYSTEM_KEY,LAB_KEY,EXTRA_KEY,CORE_KEY,"lifequest-hunter-timer-v1","lifequest-profile-v1","lifequest-v2-demo"] as const;
export function exportLifeQuest():LifeQuestBackup {return {format:"lifequest-backup",version:1,exportedAt:new Date().toISOString(),records:Object.fromEntries(KEYS.map(k=>[k,localStorage.getItem(k)]))};}
export function importLifeQuest(value:unknown) {
  if(!value||typeof value!=="object")throw Error("Fichier invalide");
  const b=value as Partial<LifeQuestBackup>;
  if(b.format!=="lifequest-backup"||b.version!==1||!b.records||typeof b.records!=="object")throw Error("Format de sauvegarde non reconnu");
  for(const [k,v] of Object.entries(b.records)) {
    if(!KEYS.includes(k as typeof KEYS[number]) || (v!==null && typeof v!=="string"))throw Error(`Donnée inconnue : ${k}`);
    if(v!==null){JSON.parse(v);}
  }
  const q=b.records[SYSTEM_KEY];
  if(typeof q==="string"){
    const s=JSON.parse(q) as {version?:number;totalXP?:number;quests?:unknown;arcs?:unknown;completions?:unknown};
    if(s.version!==1||!Number.isFinite(s.totalXP)||!Array.isArray(s.quests)||!Array.isArray(s.arcs)||!Array.isArray(s.completions))throw Error("Quêtes invalides");
  }
  // Snapshot all existing data BEFORE writes; automatic rollback on a storage failure.
  const before=Object.fromEntries(KEYS.map(k=>[k,localStorage.getItem(k)]));
  try{for(const k of KEYS){if(Object.prototype.hasOwnProperty.call(b.records,k)){const v=b.records[k];if(v===null)localStorage.removeItem(k);else if(typeof v==="string")localStorage.setItem(k,v);}}}
  catch(e){for(const k of KEYS){try{const v=before[k];if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v);}catch{}}throw e;}
}
