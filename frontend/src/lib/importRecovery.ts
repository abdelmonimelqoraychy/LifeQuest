import { withImportStorageLock, notifyStorage } from '@/lib/storage';
import { validateBackupRecords } from '@/lib/hunterCore';
import { IMPORT_JOURNAL_KEY, IMPORT_RECORD_KEYS, isAllowedImportKey, readImportJournal,
  validImportJournal, inspectJournalValues, clearImportJournal,
  type ImportJournal } from '@/lib/importJournal';

export type RecoveryAction = 'restore-before' | 'finalize';
export type RecoveryInspection = { code: string; message: string; phase: 'prepared' | 'committed' | null;
  action: RecoveryAction | null; canExport: boolean; journal?: ImportJournal };
const messages: Record<string,string> = {
  D_NONE: 'Aucun import en attente.', D_PREPARED: 'Import non confirmé. Vous pouvez restaurer la sauvegarde locale précédente.',
  D_COMMITTED: 'Import confirmé. Vous pouvez finaliser son nettoyage sans revenir aux anciennes données.',
  D_CORRUPT: 'Le journal est illisible ou incomplet. Aucune restauration sûre ne peut être proposée.',
  D_UNKNOWN: 'Le format du journal est inconnu. Aucune restauration automatique ne sera effectuée.',
  D_AMBIGUOUS: 'Les données contredisent le journal. Aucune donnée ne sera écrasée.',
  D_UNAVAILABLE: 'Le stockage est inaccessible. Réessayez lorsque son accès est disponible.',
  D_TARGET_INVALID: 'La cible enregistrée ne respecte pas les règles de sauvegarde. Récupération bloquée.',
  D_CHANGED: 'Le journal ou les données ont changé. Réévaluez la situation avant de confirmer.',
  D_CONFIRM: 'Une confirmation explicite est nécessaire.',
  D_WRITE: 'Restauration non confirmée. Les preuves disponibles sont conservées ; vous pouvez réévaluer et réessayer.',
  D_CLEANUP: 'Données vérifiées, mais nettoyage non confirmé. Réévaluez avant de réessayer.',
  D_UNSTABLE: 'Les données ont changé pendant la capture. Aucun fichier diagnostic n’a été produit.',
};
export class RecoveryError extends Error {
  constructor(readonly code: string) { super(messages[code] ?? messages.D_UNAVAILABLE); }
}
function report(code: string, phase: RecoveryInspection['phase']=null,
  action: RecoveryAction|null=null, canExport=true, journal?:ImportJournal):RecoveryInspection {
  return {code,message:messages[code],phase,action,canExport,...(journal?{journal}:{})};
}
function allowedLocalKeys() {
  const keys=new Set<string>(IMPORT_RECORD_KEYS);
  for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key&&isAllowedImportKey(key))keys.add(key);}
  return [...keys].sort();
}
function inspect():RecoveryInspection {
  const read=readImportJournal(localStorage);
  if(read.status==='absent')return report('D_NONE',null,null,false);
  if(read.status==='unavailable')return report('D_UNAVAILABLE',null,null,false);
  if(read.status!=='valid')return report(read.status==='unknown'?'D_UNKNOWN':'D_CORRUPT');
  const journal=read.journal;
  try {
    if(allowedLocalKeys().some(k=>!journal.keys.includes(k)))return report('D_AMBIGUOUS',journal.phase);
    const state=inspectJournalValues(journal,localStorage);
    if(state.status==='unavailable')return report('D_UNAVAILABLE',journal.phase,null,false);
    if(state.status==='ambiguous')return report('D_AMBIGUOUS',journal.phase);
    // Reuse the exact F03/F04 import validator. Never expose its potentially private errors.
    try{validateBackupRecords(journal.after);}catch{return report('D_TARGET_INVALID',journal.phase);}
    return report(journal.phase==='prepared'?'D_PREPARED':'D_COMMITTED',journal.phase,
      journal.phase==='prepared'?'restore-before':'finalize',true,journal);
  }catch{return report('D_UNAVAILABLE',journal.phase,null,false);}
}
export function inspectImportRecovery(){return withImportStorageLock(inspect);}
function sameJournal(a:ImportJournal,b:ImportJournal){return JSON.stringify(a)===JSON.stringify(b);}
/** Confirmation is explicit; UI inspection is never permission to skip locked revalidation. */
export function recoverImportJournal(expected:ImportJournal,confirmed:boolean){
  return withImportStorageLock(()=>{try{
    if(confirmed!==true)throw new RecoveryError('D_CONFIRM');
    if(!validImportJournal(expected))throw new RecoveryError('D_CORRUPT');
    const read=readImportJournal(localStorage),target=expected.phase==='prepared'?expected.before:expected.after;
    if(read.status==='absent'){
      // Repeated recovery or another tab completed it: no writes, only verify the same result.
      try{if(allowedLocalKeys().some(k=>!expected.keys.includes(k))||expected.keys.some(k=>localStorage.getItem(k)!==target[k]))throw new RecoveryError('D_CHANGED');}
      catch(error){if(error instanceof RecoveryError)throw error;throw new RecoveryError('D_UNAVAILABLE');}
      return {status:'already-resolved' as const};
    }
    const current=inspect();
    if(!current.action||!current.journal)throw new RecoveryError(current.code);
    if(!sameJournal(current.journal,expected))throw new RecoveryError('D_CHANGED');
    if(expected.phase==='prepared'){
      for(const key of expected.keys){
        const active=readImportJournal(localStorage);
        if(active.status!=='valid'||!sameJournal(active.journal,expected))throw new RecoveryError('D_CHANGED');
        try{
          const raw=localStorage.getItem(key);
          if(raw!==expected.before[key]&&raw!==expected.after[key])throw new RecoveryError('D_AMBIGUOUS');
          if(raw!==expected.before[key]){
            if(expected.before[key]===null)localStorage.removeItem(key);else localStorage.setItem(key,expected.before[key]!);
          }
          if(localStorage.getItem(key)!==expected.before[key])throw new RecoveryError('D_WRITE');
        }catch(error){if(error instanceof RecoveryError)throw error;throw new RecoveryError('D_WRITE');}
      }
    }
    // A final inspection also catches new authorized keys or changes during restoration.
    const final=inspect();
    if(!final.journal||!sameJournal(final.journal,expected)||!final.action)throw new RecoveryError(final.code==='D_NONE'?'D_CHANGED':final.code);
    const state=inspectJournalValues(expected,localStorage);
    if(expected.phase==='prepared'?!state.matchesBefore:!state.matchesAfter)throw new RecoveryError('D_CHANGED');
    try{clearImportJournal(expected,localStorage);}catch{throw new RecoveryError('D_CLEANUP');}
    return {status:'resolved' as const};
  }finally{notifyStorage();}});
}

export type RecoveryDiagnostic = { format:'lifequest-recovery-diagnostic'; version:1; exportedAt:string;
  code:string; phase:RecoveryInspection['phase']; journalRaw:string|null; journalRawOmitted:boolean;
  records:Record<string,string|null>; recordKeysOmitted:string[]; stability:'two-captures-identical' };
/** Conservative filtering for diagnostics only; never edits the stored originals. */
function containsCredentials(value:unknown,depth=0):boolean {
  if(depth>32)return true;
  if(typeof value==='string'){
    if(/\b(?:Bearer\s+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/.test(value))return true;
    if(/^[\s]*[\[{]/.test(value)){try{return containsCredentials(JSON.parse(value),depth+1);}catch{return true;}}
    return false;
  }
  if(Array.isArray(value))return value.some(v=>containsCredentials(v,depth+1));
  if(value&&typeof value==='object')return Object.entries(value).some(([key,v])=>
    ['token','accesstoken','refreshtoken','apikey','secret','password','authorization','credentials'].includes(key.toLowerCase().replace(/[-_]/g,''))||containsCredentials(v,depth+1));
  return false;
}
function safeRawJournal(raw:string|null){
  if(raw===null)return true;
  try{const value:unknown=JSON.parse(raw);
    if(containsCredentials(value))return false;
    if(validImportJournal(value))return true;
    // Unknown numeric versions with otherwise recognized structure contain no foreign snapshot keys.
    return typeof value==='object'&&value!==null&&!Array.isArray(value)
      &&typeof (value as {version?:unknown}).version==='number'
      &&validImportJournal({...value,version:1});
  }catch{return false;}
}
function diagnosticKeys(raw:string|null){
 const keys=new Set(allowedLocalKeys());
 if(raw!==null&&safeRawJournal(raw)){const journal=JSON.parse(raw) as ImportJournal;for(const key of journal.keys)keys.add(key);}
 return [...keys].sort();
}
export function exportRecoveryDiagnostic():Promise<RecoveryDiagnostic>{return withImportStorageLock(()=>{
  try{
    const raw=localStorage.getItem(IMPORT_JOURNAL_KEY),firstKeys=diagnosticKeys(raw);
    const first=Object.fromEntries(firstKeys.map(k=>[k,localStorage.getItem(k)]));
    const code=inspect();
    const secondRaw=localStorage.getItem(IMPORT_JOURNAL_KEY),secondKeys=diagnosticKeys(secondRaw);
    const second=Object.fromEntries(secondKeys.map(k=>[k,localStorage.getItem(k)]));
    if(raw!==secondRaw||JSON.stringify(firstKeys)!==JSON.stringify(secondKeys)||JSON.stringify(first)!==JSON.stringify(second))throw new RecoveryError('D_UNSTABLE');
    const safe=safeRawJournal(raw);
    const recordKeysOmitted:string[]=[];
    const records=Object.fromEntries(Object.entries(first).filter(([key,raw])=>{
      if(raw===null)return true;
      try{if(!containsCredentials(JSON.parse(raw)))return true;}catch{/* Unparseable content cannot be checked. */}
      recordKeysOmitted.push(key);return false;
    }));
    return {format:'lifequest-recovery-diagnostic',version:1,exportedAt:new Date().toISOString(),code:code.code,
      phase:code.phase,journalRaw:safe?raw:null,journalRawOmitted:!safe,records,recordKeysOmitted,stability:'two-captures-identical'};
  }catch(error){if(error instanceof RecoveryError)throw error;throw new RecoveryError('D_UNAVAILABLE');}
});}
