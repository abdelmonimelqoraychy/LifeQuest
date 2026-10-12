import { assertBusinessStorageAccess } from '@/lib/storageAccess';
import {isRecord,text,id,timestamp,nonNegative,uniqueIds} from "@/lib/validation";
import {withStorageLock,notifyStorage} from "@/lib/storage";
export type HunterRank = "E" | "D" | "C" | "B" | "A" | "S";
export function rankForLevel(level: number): HunterRank {
  return level >= 50 ? "S" : level >= 40 ? "A" : level >= 30 ? "B" : level >= 20 ? "C" : level >= 10 ? "D" : "E";
}
export type BossSubObjective = { id: string; title: string; weight: number; completed: boolean };
export type BossMission = { id: string; title: string; objective: string; target: number; current: number; xp: number; createdAt: string; completedAt?: string; rewardStatus?: "pending" | "credited" | "resolved_without_xp"; subObjectives?: BossSubObjective[] };
export type HunterEvent = { id: string; kind: "boss" | "rank" | "evolution"; title: string; at: string; detail?: string };
export type ExtraState = { version: 1; bosses: BossMission[]; events: HunterEvent[] };
export const EXTRA_KEY = "lifequest-hunter-operations-v1";
export const extraDefault = (): ExtraState => ({ version: 1, bosses: [], events: [] });
export function loadExtra(): ExtraState {assertBusinessStorageAccess();
  const raw = localStorage.getItem(EXTRA_KEY);assertBusinessStorageAccess();
  if (!raw) return extraDefault();
  const input: unknown = JSON.parse(raw);
  if (!input || typeof input !== "object") throw Error("Sauvegarde Hunter Operations illisible; aucune modification.");
  if(!validExtra(input))throw Error('Format Hunter Operations invalide. Données conservées.');
  assertBusinessStorageAccess();return input;
}
export function bossProgress(boss: BossMission) {
 const total = boss.subObjectives ? boss.subObjectives.reduce((sum,s)=>sum+s.weight,0) : boss.target;
 const current = boss.subObjectives ? boss.subObjectives.reduce((sum,s)=>sum+(s.completed?s.weight:0),0) : boss.current;
 return { total, current, complete: current===total, percent: Math.floor(current/total*100) };
}
function validWeightedBoss(b: Record<string,unknown>) {
 if(b.subObjectives===undefined)return true;
 const items=b.subObjectives;
 if(!Array.isArray(items)||items.length<1||items.length>20)return false;
 if(!items.every(s=>isRecord(s)&&id(s.id)&&text(s.title)&&!!s.title.trim()&&s.title.length<=120&&typeof s.weight==='number'&&Number.isInteger(s.weight)&&s.weight>=1&&s.weight<=1000&&typeof s.completed==='boolean'))return false;
 const goals=items as BossSubObjective[];
 const total=goals.reduce((sum,s)=>sum+s.weight,0),current=goals.reduce((sum,s)=>sum+(s.completed?s.weight:0),0);
 return uniqueIds(goals)&&total<=1000&&b.target===total&&b.current===current
  && (current===total)===(b.completedAt!==undefined)
  && (b.rewardStatus===undefined||current===total)&&typeof b.xp==='number'&&b.xp>=25;
}
export function createBossBattle(draft: {title:string;subObjectives:{title:string;weight:number}[]}) {
 if(!draft.title.trim()||draft.title.length>80||!draft.subObjectives.length||draft.subObjectives.length>20)throw Error('Titre requis et 1 à 20 sous-objectifs autorisés.');
 if(draft.subObjectives.some(s=>!s.title.trim()||s.title.length>120||!Number.isInteger(s.weight)||s.weight<1||s.weight>1000))throw Error('Chaque sous-objectif doit avoir un titre et un poids entier positif.');
 const target=draft.subObjectives.reduce((sum,s)=>sum+s.weight,0);
 if(target>1000)throw Error('Le poids total ne peut pas dépasser 1000.');
 const boss:BossMission={id:crypto.randomUUID(),title:draft.title.trim(),objective:draft.subObjectives[0].title.trim(),target,current:0,xp:Math.min(300,Math.max(25,target*10)),createdAt:new Date().toISOString(),subObjectives:draft.subObjectives.map(s=>({id:crypto.randomUUID(),title:s.title.trim(),weight:s.weight,completed:false}))};
 return mutateExtra(state=>({...state,bosses:[...state.bosses,boss]}));
}
export function validExtra(v:unknown):v is ExtraState {
 if(!isRecord(v)||v.version!==1||!Array.isArray(v.bosses)||!Array.isArray(v.events))return false;
 if(!v.bosses.every(b=>isRecord(b)&&id(b.id)&&text(b.title)&&!!b.title.trim()&&text(b.objective)&&typeof b.target==='number'&&Number.isInteger(b.target)&&b.target>=1&&b.target<=1000&&nonNegative(b.current)&&Number.isInteger(b.current)&&b.current<=b.target&&nonNegative(b.xp)&&b.xp<=300&&timestamp(b.createdAt)&&(b.completedAt===undefined||(timestamp(b.completedAt)&&b.current===b.target))&&(b.rewardStatus===undefined||(text(b.rewardStatus)&&['pending','credited','resolved_without_xp'].includes(b.rewardStatus)))))return false;
 // No-XP resolution is a terminal state for completed legacy counters only.
 if(v.bosses.some(b=>isRecord(b)&&b.rewardStatus==='resolved_without_xp'&&(b.subObjectives!==undefined||b.xp!==0||b.completedAt===undefined||b.current!==b.target)))return false;
 if(!v.events.every(e=>isRecord(e)&&id(e.id)&&text(e.kind)&&['boss','rank','evolution'].includes(e.kind)&&text(e.title)&&timestamp(e.at)&&(e.detail===undefined||text(e.detail))))return false;
 if(!v.bosses.every(b=>validWeightedBoss(b as Record<string,unknown>)))return false;
 return uniqueIds(v.bosses as BossMission[])&&uniqueIds(v.events as HunterEvent[]);
}
export function saveExtra(state:ExtraState){assertBusinessStorageAccess();if(!validExtra(state))throw Error('Hunter Operations invalide');assertBusinessStorageAccess();localStorage.setItem(EXTRA_KEY,JSON.stringify(state));}
export async function mutateExtra(update:(s:ExtraState)=>ExtraState){return withStorageLock(()=>{const next=update(loadExtra());saveExtra(next);notifyStorage();return next;});}
export function hunterEvent(kind: HunterEvent["kind"], title: string, detail?: string): HunterEvent {
  return { id: crypto.randomUUID(), kind, title, detail, at: new Date().toISOString() };
}
export const RANKS: HunterRank[] = ["E", "D", "C", "B", "A", "S"];
