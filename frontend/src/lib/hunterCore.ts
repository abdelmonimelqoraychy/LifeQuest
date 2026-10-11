import { loadState, saveState, newId, validState, SYSTEM_KEY, type Completion } from "@/lib/questSystem";
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
    if(c.version!==1 || !Number.isFinite(c.baselineXP) || Number(c.baselineXP) < 0 || !Number.isInteger(c.baselineLevel) || Number(c.baselineLevel) < 1 || Number(c.baselineLevel) > 100 || !Number.isFinite(c.stability) || Number(c.stability) < 0 || Number(c.stability) > 100 || !Array.isArray(c.penaltyDays) || typeof c.initializedAt!=="string" || typeof c.lastPenaltyDay!=="string") throw Error("Hunter Core: version inconnue. Aucune modification.");
    return c as CoreSettings;
  }
  return { version:1, baselineXP:(initialLevel(totalXP)-1)*300, baselineLevel:initialLevel(totalXP), stability:100, lastPenaltyDay:"", penaltyDays:[], initializedAt:new Date().toISOString() };
}
export function ensureCoreSettings(totalXP: number) {
  const settings=getCoreSettings(totalXP);
  if (!localStorage.getItem(CORE_KEY)) localStorage.setItem(CORE_KEY,JSON.stringify(settings));
  return settings;
}
export function safeHunterProgress(totalXP:number){
  try{return getHunterProgress(totalXP);}catch{return {level:initialLevel(totalXP),current:Math.max(0,totalXP%300),required:300,percent:Math.round((totalXP%300)/300*100)};}
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
export function completionDays(items: Completion[]) {return items.filter(c=>!!c.completedAt && !c.questId.startsWith(CORE_ACTIVITY_PREFIX) && !Number.isNaN(new Date(c.completedAt).getTime())).map(c=>todayLocal(new Date(c.completedAt)));}
export function bonusForStreak(days: number){return days>=30?1.25:days>=7?1.1:1;}
export function stabilityMultiplier(stability:number){return stability<50?0.8:1;}
export function rewardMultiplier(days:number,stability:number){return bonusForStreak(days)*stabilityMultiplier(stability);}
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
  const xp=Math.round(base*rewardMultiplier(streak,getCoreSettings(state.totalXP).stability));
  const event:Completion={id:newId(),questId,period:"once",completedAt:new Date().toISOString(),xpAwarded:xp,attribute};
  saveState({...state,totalXP:state.totalXP+xp,completions:[...state.completions,event]});
  window.dispatchEvent(new Event("lifequest-core-updated"));
  return {credited:true,xp,reason:"EXP crédités"};
}
export function applyDailyStability() {
  const state=loadState(); const c=ensureCoreSettings(state.totalXP);
  const today=todayLocal();
  if(c.lastPenaltyDay===today)return c;
  // Audit only dates after installation, never days before activation.
  const initialized=todayLocal(new Date(c.initializedAt));
  const prior = new Date(`${c.lastPenaltyDay}T12:00:00`);
  if(c.lastPenaltyDay) prior.setDate(prior.getDate()+1);
  const first=c.lastPenaltyDay && c.lastPenaltyDay>=initialized?todayLocal(prior):initialized;
  const firstDate=new Date(`${first}T12:00:00`);
  const endDate=new Date(`${today}T12:00:00`);
  let stability=c.stability;
  const penaltyDays=[...c.penaltyDays];
  for(let d=new Date(firstDate),i=0;d<endDate && i<3660;d.setDate(d.getDate()+1),i++){
    const day=todayLocal(d);
    const due=state.quests.filter(q=>q.frequency==="daily" && !q.archived && todayLocal(new Date(q.createdAt))<=day);
    if(!due.length)continue; // no quests => no penalty and no free recovery
    const missed=due.some(q=>!state.completions.some(x=>x.questId===q.id && x.period===day));
    if(missed){if(!penaltyDays.includes(day)){penaltyDays.push(day);stability=Math.max(0,stability-10);}}
    else stability=Math.min(100,stability+5);
  }
  const previousDay = new Date(endDate); previousDay.setDate(previousDay.getDate()-1);
  const lastAssessed=todayLocal(previousDay);
  const next={...c,stability,lastPenaltyDay:lastAssessed,penaltyDays};
  localStorage.setItem(CORE_KEY,JSON.stringify(next));
  return next;
}
export type LifeQuestBackup={format:"lifequest-backup";version:1;exportedAt:string;records:Record<string,string|null>};
const KEYS=[SYSTEM_KEY,LAB_KEY,EXTRA_KEY,CORE_KEY,"lifequest-hunter-timer-v1","lifequest-profile-v1","lifequest-v2-demo"] as const;
export function exportLifeQuest():LifeQuestBackup {return {format:"lifequest-backup",version:1,exportedAt:new Date().toISOString(),records:Object.fromEntries(KEYS.map(k=>[k,localStorage.getItem(k)]))};}
export function importLifeQuest(value:unknown) {
  if(!value||typeof value!=="object")throw Error("Fichier invalide");
  const b=value as Partial<LifeQuestBackup>;
  if(b.format!=="lifequest-backup"||b.version!==1||!b.records||typeof b.records!=="object"||Array.isArray(b.records))throw Error("Format de sauvegarde non reconnu");
  for(const [k,v] of Object.entries(b.records)) {
    if(!KEYS.includes(k as typeof KEYS[number]) || (v!==null && typeof v!=="string"))throw Error(`Donnée inconnue : ${k}`);
    if(v!==null){JSON.parse(v);}
  }
  const q=b.records[SYSTEM_KEY];
  if(typeof q==="string"){
    const s=JSON.parse(q) as {version?:number;totalXP?:number;quests?:unknown;arcs?:unknown;completions?:unknown};
    if(!validState(s))throw Error("Quêtes invalides");
  }
  const coreRaw=b.records[CORE_KEY];
  if(typeof coreRaw==="string"){
    const c=JSON.parse(coreRaw) as Partial<CoreSettings>;
    if(c.version!==1||!Number.isFinite(c.baselineXP)||typeof c.baselineLevel!=="number"||!Number.isInteger(c.baselineLevel)||c.baselineLevel<1||c.baselineLevel>100||typeof c.stability!=="number"||!Number.isFinite(c.stability)||c.stability<0||c.stability>100||!Array.isArray(c.penaltyDays)||typeof c.initializedAt!=="string"||typeof c.lastPenaltyDay!=="string")throw Error("Hunter Core invalide");
  }
  const labRaw=b.records[LAB_KEY];
  if(typeof labRaw==="string"){
    const l=JSON.parse(labRaw) as Partial<LabData>;
    if(!l||typeof l!=="object"||l.version!==1||!Array.isArray(l.ideas)||!Array.isArray(l.sessions)||!Array.isArray(l.challenges)||!Array.isArray(l.nodes)||!Array.isArray(l.resources)||!Array.isArray(l.journal))throw Error("Hunter Lab invalide");
  }
  const extraRaw=b.records[EXTRA_KEY];
  if(typeof extraRaw==="string"){
    const e=JSON.parse(extraRaw) as Partial<ExtraState>;
    if(!e||typeof e!=="object"||e.version!==1||!Array.isArray(e.bosses)||!Array.isArray(e.events))throw Error("Hunter Operations invalide");
  }
  // Snapshot all existing data BEFORE writes; automatic rollback on a storage failure.
  const before=Object.fromEntries(KEYS.map(k=>[k,localStorage.getItem(k)]));
  try{for(const k of KEYS){if(Object.prototype.hasOwnProperty.call(b.records,k)){const v=b.records[k];if(v===null)localStorage.removeItem(k);else if(typeof v==="string")localStorage.setItem(k,v);}}}
  catch(e){for(const k of KEYS){try{const v=before[k];if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v);}catch{}}throw e;}
}
