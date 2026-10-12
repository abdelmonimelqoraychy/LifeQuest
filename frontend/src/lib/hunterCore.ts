import { assertBusinessStorageAccess } from '@/lib/storageAccess';
import type { Attribute } from "@/types";
import { unlockAchievements } from '@/lib/achievements';
import {isRecord,text,nonNegative,timestamp,calendarDate} from "@/lib/validation";
import {validProfile,PROFILE_KEY} from "@/lib/profile";
import {withStorageLock,withImportStorageLock,notifyStorage} from "@/lib/storage";
import { loadState, saveState, newId, validState, legacyXP, SYSTEM_KEY, type Completion, type QuestSystemState } from "@/lib/questSystem";
import { LAB_KEY, validLab, type LabData } from "@/lib/hunterLab";
import { EXTRA_KEY, validExtra, bossProgress, type ExtraState } from "@/lib/hunterMissions";
import { IMPORT_RECORD_KEYS, readImportJournal, captureJournalSnapshot, createImportJournal,
 prepareImportJournal, inspectJournalValues, markImportJournalCommitted, clearImportJournal,
 type ImportJournal } from '@/lib/importJournal';

export const CORE_KEY = "lifequest-core-v011";
export const CORE_ACTIVITY_PREFIX = "lifequest:activity:";
export type Stat = Attribute;
export const QUEST_REWARDS = { EASY:30, NORMAL:50, HARD:80 } as const;
export type CoreSettings = { version: 1; baselineXP: number; baselineLevel: number; stability: number; lastPenaltyDay: string; penaltyDays: string[]; initializedAt: string };
export type RewardSource = "focus" | "boss";
export type RewardResult = { credited: boolean; xp: number; reason: string };
function todayLocal(now = new Date()): string { return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`; }
export function initialLevel(xp:number){return getHunterProgress(xp).level;}
export function levelCost(level:number){return 200+25*(Math.max(1,level)-1);}
export function validCoreSettings(v:unknown):v is CoreSettings {
 return isRecord(v)&&v.version===1&&nonNegative(v.baselineXP)&&typeof v.baselineLevel==='number'&&Number.isInteger(v.baselineLevel)&&v.baselineLevel>=1&&v.baselineLevel<=100&&nonNegative(v.stability)&&v.stability<=100&&text(v.lastPenaltyDay)&&(v.lastPenaltyDay===''||calendarDate(v.lastPenaltyDay))&&Array.isArray(v.penaltyDays)&&v.penaltyDays.every(calendarDate)&&timestamp(v.initializedAt);
}
export function getCoreSettings(totalXP:number):CoreSettings {assertBusinessStorageAccess();
 const raw=localStorage.getItem(CORE_KEY);assertBusinessStorageAccess();
 if(raw!==null){const v:unknown=JSON.parse(raw);if(!validCoreSettings(v))throw Error('Hunter Core invalide. Données conservées.');return {...v,stability:100};}
 return {version:1,baselineXP:totalXP,baselineLevel:initialLevel(totalXP),stability:100,lastPenaltyDay:'',penaltyDays:[],initializedAt:new Date().toISOString()};
}
export function ensureCoreSettings(totalXP:number){assertBusinessStorageAccess();const c=getCoreSettings(totalXP);const raw=JSON.stringify(c);if(localStorage.getItem(CORE_KEY)!==raw){assertBusinessStorageAccess();localStorage.setItem(CORE_KEY,raw);}return c;}
export function safeHunterProgress(totalXP:number){return getHunterProgress(totalXP);}
/** Version 2 policy: recalculate every level from total EXP, never mutate earned EXP. */
export function getHunterProgress(totalXP:number,c?:CoreSettings){
 if(!nonNegative(totalXP)||(c&&!validCoreSettings(c)))throw Error('Progression Hunter invalide');
 let level=1,earned=totalXP;
 while(level<100&&earned>=levelCost(level)){earned-=levelCost(level);level++;}
 return level>=100?{level:100,current:0,required:0,percent:100}:{level,current:earned,required:levelCost(level),percent:Math.min(99,Math.floor(earned/levelCost(level)*100))};
}
export function streakDays(dates: string[], day=todayLocal()): number {
  const seen=new Set(dates.filter(s=>/^\d{4}-\d{2}-\d{2}$/.test(s)));
  const end=new Date(`${day}T12:00:00`);
  if (!seen.has(day)) end.setDate(end.getDate()-1);
  let streak=0;
  while(seen.has(todayLocal(end)) && streak<10000){streak++;end.setDate(end.getDate()-1);}
  return streak;
}
export function completionDays(items: Completion[]) {return items.filter(c=>!!c.completedAt && !c.questId.startsWith(CORE_ACTIVITY_PREFIX) && !Number.isNaN(new Date(c.completedAt).getTime())).map(c=>todayLocal(new Date(c.completedAt)));}
export function bonusForStreak(days: number){return days>=30?1.25:days>=7?1.1:1;}
export function stabilityMultiplier(stability:number){if(!nonNegative(stability)||stability>100)throw Error("Stabilité invalide");return 1;}
export function rewardMultiplier(days:number,stability:number){return bonusForStreak(days)*stabilityMultiplier(stability);}
export function attributeXP(items: Completion[]) {
  const totals: Record<Stat,number>={focus:0,discipline:0,knowledge:0,energy:0,consistency:0};
  for(const c of items) if(c.attribute in totals && Number.isFinite(c.xpAwarded)) totals[c.attribute as Stat]+=Math.max(0,c.xpAwarded);
  return totals;
}
export async function awardActivityXP(source: RewardSource, uniqueId: string, base: number, attribute: Stat, verify?: () => void): Promise<RewardResult> {
 return withStorageLock(()=>{
  verify?.();
  if(!uniqueId || !Number.isFinite(base) || base<=0 || base>1000) return {credited:false,xp:0,reason:"Récompense invalide"};
  const state=loadState();
  ensureCoreSettings(state.totalXP);
  const questId=`${CORE_ACTIVITY_PREFIX}${source}:${uniqueId}`;
  if(state.completions.some(c=>c.questId===questId))return {credited:false,xp:0,reason:"Déjà crédité"};
  const streak=streakDays(completionDays(state.completions));
  const xp=Math.round(base*rewardMultiplier(streak,getCoreSettings(state.totalXP).stability));
  const event:Completion={id:newId(),questId,period:"once",completedAt:new Date().toISOString(),xpAwarded:xp,attribute};
  const next={...state,totalXP:state.totalXP+xp,completions:[...state.completions,event]};
  saveState(unlockAchievements(next,getHunterProgress(next.totalXP).level,event.completedAt));
  notifyStorage();
  return {credited:true,xp,reason:"EXP crédités"};
 });
}
/** Idempotent backfill for older saves, using the same inter-tab lock as rewards/import. */
export async function syncAchievements(){return withStorageLock(()=>{
 const state=loadState();
 const next=unlockAchievements(state,getHunterProgress(state.totalXP).level,new Date().toISOString());
 if(next!==state){saveState(next);notifyStorage();}
 return next;
});}
/** Rest days are never penalized. Historical penalty records remain available. */
export function applyDailyStability(){return withStorageLock(()=>{const state=loadState();return ensureCoreSettings(state.totalXP);});}
export type LifeQuestBackup={format:'lifequest-backup';version:1|2;exportedAt:string;records:Record<string,string|null>};
const KEYS=IMPORT_RECORD_KEYS;
const cinematicKey=(k:string)=>/^lifequest-cinematic-seen-v1:[^:]+:(5|10|20)$/.test(k);
function persistedKeys(){const keys:string[]=[...KEYS];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&cinematicKey(k))keys.push(k);}return keys;}
export function exportLifeQuest():LifeQuestBackup{assertBusinessStorageAccess();const backup:LifeQuestBackup={format:'lifequest-backup',version:2,exportedAt:new Date().toISOString(),records:Object.fromEntries(persistedKeys().map(k=>[k,localStorage.getItem(k)]))};assertBusinessStorageAccess();return backup;}
export function validTimer(v:unknown){return isRecord(v)&&text(v.mode)&&['focus','short','long'].includes(v.mode)&&nonNegative(v.secondsLeft)&&Number.isInteger(v.secondsLeft)&&v.secondsLeft<=86400&&(v.runningUntil===null||(nonNegative(v.runningUntil)&&Number.isSafeInteger(v.runningUntil)))&&text(v.label)&&(v.sessionId===undefined||text(v.sessionId));}
/** Read-only checks on validated incoming modules, never on the account being replaced.
 * Missing legacy history and orphan receipts are compatible; explicit contradictions are not.
 */
export function backupRewardDiagnostics(system:QuestSystemState|null, extra:ExtraState|null, lab:LabData|null):string[] {
 const receipts=new Map((system?.completions??[]).map(c=>[c.questId,c]));
 const issues:string[]=[];
 for(const boss of extra?.bosses??[]){
  const receipt=receipts.get(CORE_ACTIVITY_PREFIX+'boss:'+boss.id);
  const positive=!!receipt&&receipt.xpAwarded>0;
  const label='Hunter Operations / Boss '+boss.id;
  if(boss.rewardStatus==='credited'&&!positive)issues.push(label+' : statut credited sans reçu XP positif correspondant dans Hunter Core.');
  if((boss.rewardStatus==='pending'||boss.rewardStatus==='credited'||positive)&&(!boss.completedAt||!bossProgress(boss).complete))issues.push(label+' : récompense déclarée ou reçue pour un Boss non terminé.');
  if(boss.rewardStatus==='resolved_without_xp'&&positive)issues.push(label+' : statut resolved_without_xp contredit par un reçu XP positif dans Hunter Core.');
  // A zero receipt blocks awardActivityXP retries; it cannot prove a positive reward.
  if(boss.xp>0&&receipt&&!positive&&boss.rewardStatus!=='credited')issues.push(label+' : reçu de 0 XP incompatible avec la récupération de la récompense positive.');
 }
 for(const session of lab?.sessions??[]){
  const receipt=receipts.get(CORE_ACTIVITY_PREFIX+'focus:'+session.id);
  const positive=!!receipt&&receipt.xpAwarded>0;
  const label='Hunter Lab / Focus '+session.id;
  if(session.rewardStatus==='credited'&&!positive)issues.push(label+' : statut credited sans reçu XP positif correspondant dans Hunter Core.');
  // Status-less sessions predate the 25-minute reward protocol. Keep their metadata.
  if(session.rewardStatus!==undefined&&session.minutes!==25)issues.push(label+' : session avec statut de récompense hors du protocole Focus de 25 minutes.');
  if(session.rewardStatus==='pending'&&receipt&&!positive)issues.push(label+' : reçu de 0 XP incompatible avec la récupération de la récompense Focus.');
 }
 return issues;
}
/** Pure validation shared by import and committed recovery; no storage access. */
export function validateBackupRecords(records:Record<string,unknown>){
 let incomingSystem:QuestSystemState|null=null, incomingExtra:ExtraState|null=null, incomingLab:LabData|null=null;
 // Existing v1 exports always contained these seven records. Never merge partial accounts.
 if(!KEYS.slice(0,7).every(k=>Object.hasOwn(records,k)))throw Error('Sauvegarde incomplète : les sept modules sont obligatoires.');
 for(const [k,raw] of Object.entries(records)){
  if(!KEYS.includes(k as typeof KEYS[number])&&!cinematicKey(k))throw Error('Clé inconnue : '+k);
  if(raw===null)continue;if(!text(raw))throw Error('Valeur invalide : '+k);
  const v:unknown=JSON.parse(raw);
  if(k===SYSTEM_KEY){if(!validState(v))throw Error('Quêtes invalides');incomingSystem=v;}
  if(k===LAB_KEY){if(!validLab(v))throw Error('Hunter Lab invalide');incomingLab=v;}
  if(k===EXTRA_KEY){if(!validExtra(v))throw Error('Hunter Operations invalide');incomingExtra=v;}
  if(k===CORE_KEY&&!validCoreSettings(v))throw Error('Hunter Core invalide');
  if(k===PROFILE_KEY&&!validProfile(v))throw Error('Profil invalide');
  if(k==='lifequest-v2-demo')legacyXP(v);
  if(k==='lifequest-hunter-timer-v1'&&!validTimer(v))throw Error('Minuteur invalide');
  if(k==='lifequest-hunter-transition-v1'&&(!Number.isInteger(v)||Number(v)<1||Number(v)>100))throw Error('Transition invalide');
  if(cinematicKey(k)&&raw!=='1')throw Error('Cinématique invalide');
 }
 const issues=backupRewardDiagnostics(incomingSystem,incomingExtra,incomingLab);
 if(issues.length)throw Error('Sauvegarde incohérente — import refusé avant toute écriture :\n'+issues.join('\n'));
}
export async function importLifeQuest(value:unknown){return withImportStorageLock(()=>{try{
 const previousJournal=readImportJournal(localStorage);
 if(previousJournal.status!=='absent')throw Error('Import refusé : '+(previousJournal.status==='valid'?'un journal précédent existe ('+previousJournal.journal.phase+'). Reprise nécessaire.':previousJournal.message));
 if(!isRecord(value)||value.format!=='lifequest-backup'||(value.version!==1&&value.version!==2)||!timestamp(value.exportedAt)||!isRecord(value.records))throw Error('Format de sauvegarde non reconnu');
 const records=value.records;
 validateBackupRecords(records);
 const keys=[...new Set([...persistedKeys(),...Object.keys(records)])];
 const before=captureJournalSnapshot(localStorage,keys);
 const after=Object.fromEntries(keys.map(k=>[k,records[k]??null])) as Record<string,string|null>;
 const prepared=createImportJournal(before,after,newId());
 // Outside the rollback catch: uncertain preparation must never start business writes.
 prepareImportJournal(prepared,localStorage);
 let committed:ImportJournal;
 try{
  for(const k of keys){
   const current=localStorage.getItem(k);
   if(current!==before[k]&&current!==after[k])throw Error('État ambigu : '+k);
   if(after[k]===null)localStorage.removeItem(k);else localStorage.setItem(k,after[k]!);
  }
  const applied=inspectJournalValues(prepared,localStorage);
  if(!applied.matchesAfter)throw Error('Application non confirmée. '+applied.message);
  committed=markImportJournalCommitted(prepared,localStorage);
 }catch(error){
  const stored=readImportJournal(localStorage);
  // A commit write may have succeeded even if its read-back failed. Never roll it back.
  if(stored.status==='valid'&&JSON.stringify(stored.journal)===JSON.stringify({...prepared,phase:'committed'}))
   throw Error('Import appliqué, confirmation du commit interrompue. Journal conservé ; aucun retour à l’ancien compte.',{cause:error});
  if(stored.status!=='valid'||JSON.stringify(stored.journal)!==JSON.stringify(prepared))
   throw Error('Import interrompu : résultat incertain ou journal modifié. Aucune restauration automatique.',{cause:error});
  const state=inspectJournalValues(prepared,localStorage);
  if(state.status==='ambiguous'||state.status==='unavailable')
   throw Error('Import interrompu : '+state.message+' Journal conservé.',{cause:error});
  try{
   for(const k of keys){
    const active=readImportJournal(localStorage);
    if(active.status!=='valid'||JSON.stringify(active.journal)!==JSON.stringify(prepared))throw Error('Journal modifié pendant le rollback');
    const current=localStorage.getItem(k);
    if(current!==before[k]&&current!==after[k])throw Error('État ambigu : '+k);
    if(current!==before[k]){
     if(before[k]===null)localStorage.removeItem(k);else localStorage.setItem(k,before[k]!);
    }
    if(localStorage.getItem(k)!==before[k])throw Error('Rollback non confirmé : '+k);
   }
   if(!inspectJournalValues(prepared,localStorage).matchesBefore)throw Error('Rollback incomplet');
   clearImportJournal(prepared,localStorage);
  }catch(rollbackError){throw Error('Import interrompu : restauration incomplète ou nettoyage non confirmé. Journal éventuellement présent à vérifier ; reprise nécessaire.',{cause:rollbackError});}
  notifyStorage();
  throw Error('Import annulé : données précédentes restaurées.',{cause:error});
 }
 // Commit confirmed: cleanup failure is an error, never a reason to restore before.
 try{clearImportJournal(committed,localStorage);}
 catch(error){notifyStorage();throw Error('Import appliqué et commit confirmé ; nettoyage du journal non confirmé. Aucun retour à l’ancien compte. Reprise nécessaire.',{cause:error});}
 notifyStorage();
}finally{notifyStorage();}});}
