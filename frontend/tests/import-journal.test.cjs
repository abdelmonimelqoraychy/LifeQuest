
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const memo=new Map();
function load(name){
 if(memo.has(name))return memo.get(name);
 const js=ts.transpileModule(fs.readFileSync(path.join(process.cwd(),'src','lib',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const compiled={exports:{}};memo.set(name,compiled.exports);
 vm.runInNewContext('(function(require,module,exports){'+js+'})',{console})(id=>load(id.split('/').pop()),compiled,compiled.exports);
 return compiled.exports;
}
const j=load('importJournal'),key=j.IMPORT_JOURNAL_KEY,system='lifequest-quest-system-v1',lab='lifequest-hunter-lab-v1';
const plain=value=>JSON.parse(JSON.stringify(value));
const snapshot=()=>Object.fromEntries(j.IMPORT_RECORD_KEYS.map(k=>[k,null]));
const pair=()=>({before:{...snapshot(),[system]:'{"totalXP":450,"receipt":"historical"}'},after:{...snapshot(),[system]:'{"totalXP":500,"receipt":"historical"}',[lab]:'{"new":true}'}});
const journal=()=>{const {before,after}=pair();return j.createImportJournal(before,after,'test-operation','2026-10-12T12:00:00.000Z')};
function storage(records={}){
 const values=new Map(Object.entries(records)),writes=[];
 return {values,writes,getItem:k=>values.get(k)??null,setItem:(k,v)=>{writes.push(['set',k]);values.set(k,v)},removeItem:k=>{writes.push(['remove',k]);values.delete(k)}};
}
const apply=(s,values)=>{for(const [k,v] of Object.entries(values))if(v===null)s.values.delete(k);else s.values.set(k,v)};
const prepare=()=>{const value=journal(),s=storage(value.before);j.prepareImportJournal(value,s);return {value,s}};
test('Journal A: creation copies raw snapshots and does not mutate historical XP or receipts',()=>{
 const {before,after}=pair();before[lab]='{historical broken JSON';after['lifequest-hunter-operations-v1']='{"xp":0,"rewardStatus":"resolved_without_xp"}';
 const value=j.createImportJournal(before,after,'copy');before[system]='changed';after[system]='changed';
 assert.equal(value.phase,'prepared');assert.equal(value.before[system],pair().before[system]);assert.equal(value.after[system],pair().after[system]);assert.equal(value.before[lab],'{historical broken JSON');assert.equal(value.after['lifequest-hunter-operations-v1'],'{"xp":0,"rewardStatus":"resolved_without_xp"}');
});
test('Journal A: allowed keys match current backups and exclude journal or foreign keys',()=>{
 for(const k of j.IMPORT_RECORD_KEYS)assert.equal(j.isAllowedImportKey(k),true);
 assert.equal(j.isAllowedImportKey('lifequest-cinematic-seen-v1:local-player:5'),true);
 for(const k of [key,'secret','__proto__','lifequest-cinematic-seen-v1:local-player:30','lifequest-cinematic-seen-v1:a:b:5'])assert.equal(j.isAllowedImportKey(k),false);
});
test('Journal A: corrupt metadata and snapshot structures are rejected without writes',()=>{
 const good=plain(journal());
 for(const mutation of [v=>v.version=2,v=>v.phase='done',v=>v.operationId='',v=>v.createdAt='2026-02-30T12:00:00Z',v=>v.extra=true,v=>v.keys.push(v.keys[0]),v=>v.keys.push('foreign'),v=>delete v.before[system],v=>v.after.extra=null,v=>v.before[system]=42,v=>v.after[lab]={},v=>v.keys.splice(v.keys.indexOf(system),1)]){
  const value=plain(good);mutation(value);assert.equal(j.validImportJournal(value),false);const s=storage(good.before);assert.throws(()=>j.prepareImportJournal(value,s),/invalide/);assert.equal(s.writes.length,0);
 }
 assert.equal(j.validImportJournal(null),false);assert.equal(j.validImportJournal([]),false);
});
test('Journal A: cinematic keys are captured and journal key count is bounded',()=>{
 const {before,after}=pair(),cinema='lifequest-cinematic-seen-v1:old-player:10';before[cinema]='1';after[cinema]=null;
 const value=j.createImportJournal(before,after,'cinema');assert.equal(j.validImportJournal(value),true);
 const s=storage(before);assert.deepEqual(plain(j.captureJournalSnapshot(s,value.keys)),before);
 for(let i=0;i<j.MAX_JOURNAL_KEYS;i++){const k='lifequest-cinematic-seen-v1:player-'+i+':5';before[k]='1';after[k]=null;}
 assert.throws(()=>j.createImportJournal(before,after,'too-many'),/invalide/);
});
test('Journal A: read absent, corrupt, unknown and valid never changes any storage',()=>{
 const s=storage();assert.equal(j.readImportJournal(s).status,'absent');
 for(const [raw,status] of [['{broken','corrupt'],['','corrupt'],['null','corrupt'],[JSON.stringify({...journal(),version:2}),'unknown'],[JSON.stringify({...journal(),format:'other'}),'unknown'],[JSON.stringify({...journal(),phase:'other'}),'corrupt'],[JSON.stringify(journal()),'valid']]){
  s.values.set(key,raw);const read=j.readImportJournal(s);assert.equal(read.status,status);assert.equal(s.getItem(key),raw);if(status!=='valid')assert.equal(read.raw,raw);
 }
 assert.equal(s.writes.length,0);
});
test('Journal A: unavailable storage produces an explicit diagnostic without initialization',()=>{
 const s=storage();s.getItem=()=>{throw Error('Access denied')};assert.equal(j.readImportJournal(s).status,'unavailable');assert.equal(j.inspectJournalValues(journal(),s).status,'unavailable');assert.throws(()=>j.captureJournalSnapshot(s,j.IMPORT_RECORD_KEYS),/indisponible/);assert.throws(()=>j.prepareImportJournal(journal(),s),/indisponible/);assert.equal(s.writes.length,0);
});
test('Journal A: before, after, mixed and third-party values are distinguished',()=>{
 const value=journal(),s=storage(value.before);assert.equal(j.inspectJournalValues(value,s).status,'before');
 s.values.set(system,value.after[system]);assert.equal(j.inspectJournalValues(value,s).status,'mixed');
 apply(s,value.after);assert.equal(j.inspectJournalValues(value,s).status,'after');
 s.values.set(system,'third-party data');const result=j.inspectJournalValues(value,s);assert.equal(result.status,'ambiguous');assert.deepEqual(plain(result.conflicts),[system]);assert.equal(s.writes.length,0);
});
test('Journal A: unchanged snapshots and null versus empty string remain distinct',()=>{
 const before=snapshot(),after={...before,[lab]:''};const value=j.createImportJournal(before,after,'empty'),s=storage();assert.equal(j.inspectJournalValues(value,s).status,'before');s.values.set(lab,'');assert.equal(j.inspectJournalValues(value,s).status,'after');
 const unchanged=j.createImportJournal(before,before,'unchanged');assert.equal(j.inspectJournalValues(unchanged,storage()).status,'unchanged');
});
test('Journal A: preparing writes and verifies only the dedicated journal key',()=>{
 const value=journal(),s=storage(value.before),before=[...s.values];j.prepareImportJournal(value,s);assert.deepEqual(s.writes,[['set',key]]);assert.deepEqual([...s.values].filter(([k])=>k!==key),before);assert.deepEqual(plain(j.readImportJournal(s).journal),plain(value));
});
test('Journal A: preparing rejects a stale initial snapshot without writes',()=>{
 const value=journal(),s=storage(value.before);s.values.set(system,'external update');assert.throws(()=>j.prepareImportJournal(value,s),/initial non confirmé/);assert.equal(s.writes.length,0);assert.equal(s.getItem(system),'external update');
});
test('Journal A: existing valid, corrupt or unknown journal is never overwritten',()=>{
 const value=journal();for(const raw of [JSON.stringify(value),'{broken',JSON.stringify({...value,version:2})]){
  const s=storage({...value.before,[key]:raw});assert.throws(()=>j.prepareImportJournal(value,s));assert.equal(s.writes.length,0);assert.equal(s.getItem(key),raw);
 }
});
test('Journal A: quota failure during preparation leaves all business records untouched',()=>{
 const value=journal(),s=storage(value.before),before=[...s.values];s.setItem=()=>{throw Error('QuotaExceededError')};assert.throws(()=>j.prepareImportJournal(value,s),/quota/);assert.deepEqual([...s.values],before);
});
test('Journal A: silent failed write and failed read-back never produce confirmed success',()=>{
 const value=journal(),s=storage(value.before);s.setItem=()=>{};assert.throws(()=>j.prepareImportJournal(value,s),/non confirmée/);
 const other=storage(value.before),set=other.setItem;let written=false;other.setItem=(k,v)=>{set(k,v);written=true};const get=other.getItem;other.getItem=k=>{if(written&&k===key)throw Error('Read unavailable');return get(k)};
 assert.throws(()=>j.prepareImportJournal(value,other),/non confirmée/);assert.equal(other.values.get(key),JSON.stringify(value));
});
test('Journal A: partial targets cannot be committed or cleaned up',()=>{
 const {value,s}=prepare();s.values.set(system,value.after[system]);const raw=s.getItem(key),count=s.writes.length;
 assert.throws(()=>j.markImportJournalCommitted(value,s),/incomplet/);assert.throws(()=>j.clearImportJournal(value,s),/non terminée/);assert.equal(s.getItem(key),raw);assert.equal(s.writes.length,count);
});
test('Journal A: complete target can be committed; repeated commit makes no additional write',()=>{
 const {value,s}=prepare();apply(s,value.after);const committed=j.markImportJournalCommitted(value,s);assert.equal(committed.phase,'committed');const count=s.writes.length;
 assert.equal(j.markImportJournalCommitted(committed,s).phase,'committed');assert.equal(s.writes.length,count);assert.equal(j.inspectJournalValues(committed,s).status,'after');
});
test('Journal A: commit quota failure retains prepared evidence and can be retried',()=>{
 const {value,s}=prepare();apply(s,value.after);const set=s.setItem;s.setItem=()=>{throw Error('Quota')};assert.throws(()=>j.markImportJournalCommitted(value,s),/non confirmée/);assert.equal(j.readImportJournal(s).journal.phase,'prepared');s.setItem=set;assert.equal(j.markImportJournalCommitted(value,s).phase,'committed');
});
test('Journal A: changed operation ID, snapshot or phase blocks later writes',()=>{
 for(const change of [v=>v.operationId='other-operation',v=>v.after[system]='external target',v=>v.phase='committed']){
  const {value,s}=prepare(),changed=plain(value);change(changed);s.values.set(key,JSON.stringify(changed));const raw=s.getItem(key),count=s.writes.length;
  assert.throws(()=>j.markImportJournalCommitted(value,s),/journal a changé/);assert.throws(()=>j.clearImportJournal(value,s),/journal a changé/);assert.equal(s.getItem(key),raw);assert.equal(s.writes.length,count);
 }
});
test('Journal A: committed state differing from target is ambiguous and cannot be cleaned up',()=>{
 const {value,s}=prepare();apply(s,value.after);const committed=j.markImportJournalCommitted(value,s);s.values.set(system,value.before[system]);assert.equal(j.inspectJournalValues(committed,s).status,'ambiguous');assert.throws(()=>j.clearImportJournal(committed,s),/non terminée/);assert.equal(j.readImportJournal(s).journal.phase,'committed');
});
test('Journal A: cleanup verifies completed target or fully restored before; never changes business data',()=>{
 const {value,s}=prepare();apply(s,value.after);const committed=j.markImportJournalCommitted(value,s),business=[...s.values].filter(([k])=>k!==key);j.clearImportJournal(committed,s);assert.equal(j.readImportJournal(s).status,'absent');assert.deepEqual([...s.values],business);
 const second=prepare();j.clearImportJournal(second.value,second.s);assert.equal(second.s.getItem(key),null);assert.equal(second.s.getItem(system),second.value.before[system]);
});
test('Journal A: failed or silent cleanup preserves journal and allows a verified retry',()=>{
 for(const silent of [true,false]){
  const {value,s}=prepare();apply(s,value.after);const committed=j.markImportJournalCommitted(value,s),remove=s.removeItem,raw=s.getItem(key);
  s.removeItem=()=>{if(!silent)throw Error('Storage denied')};assert.throws(()=>j.clearImportJournal(committed,s),/Nettoyage.*non confirmé/);assert.equal(s.getItem(key),raw);s.removeItem=remove;j.clearImportJournal(committed,s);assert.equal(s.getItem(key),null);
 }
});
test('Journal A: reload reads identical historical snapshots without any automatic recovery',()=>{
 const {value,s}=prepare();s.values.set(system,value.after[system]);const reopened=storage(Object.fromEntries(s.values)),read=j.readImportJournal(reopened);assert.equal(read.status,'valid');assert.deepEqual(plain(read.journal),plain(value));assert.equal(j.inspectJournalValues(read.journal,reopened).status,'mixed');assert.equal(reopened.writes.length,0);
});
test('Journal A: silent commit failure leaves prepared evidence; read-back failure retains committed evidence',()=>{
 const first=prepare();apply(first.s,first.value.after);first.s.setItem=()=>{};
 assert.throws(()=>j.markImportJournalCommitted(first.value,first.s),/non confirmée/);assert.equal(j.readImportJournal(first.s).journal.phase,'prepared');
 const second=prepare();apply(second.s,second.value.after);const get=second.s.getItem,set=second.s.setItem;let written=false;
 second.s.setItem=(k,v)=>{set(k,v);written=true};second.s.getItem=k=>{if(written&&k===key)throw Error('Read unavailable');return get(k)};
 assert.throws(()=>j.markImportJournalCommitted(second.value,second.s),/non confirmée/);assert.equal(JSON.parse(second.s.values.get(key)).phase,'committed');
});
test('Journal A: cleanup with failed read-back never announces confirmed deletion',()=>{
 const {value,s}=prepare();apply(s,value.after);const committed=j.markImportJournalCommitted(value,s),get=s.getItem,remove=s.removeItem;let removed=false;
 s.removeItem=k=>{remove(k);removed=true};s.getItem=k=>{if(removed&&k===key)throw Error('Read unavailable');return get(k)};
 assert.throws(()=>j.clearImportJournal(committed,s),/Nettoyage.*non confirmé/);assert.equal(s.values.has(key),false);
});
test('Journal A: ambiguous third-party data prevents any cleanup or commit',()=>{
 const {value,s}=prepare();s.values.set(system,'unrelated account data');const raw=s.getItem(key),count=s.writes.length;
 assert.throws(()=>j.markImportJournalCommitted(value,s),/ambigu/);assert.throws(()=>j.clearImportJournal(value,s),/ambigu/);assert.equal(s.getItem(system),'unrelated account data');assert.equal(s.getItem(key),raw);assert.equal(s.writes.length,count);
});
