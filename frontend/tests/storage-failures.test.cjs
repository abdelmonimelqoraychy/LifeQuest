const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const assert=require('node:assert/strict');
const SYSTEM='lifequest-quest-system-v1',LAB='lifequest-hunter-lab-v1',EXTRA='lifequest-hunter-operations-v1';
// Raw observations in failure tests are diagnostic snapshots, not application reads.
const rawState=h=>JSON.parse(h.values.get(SYSTEM)), rawLab=h=>JSON.parse(h.values.get(LAB)), rawExtra=h=>JSON.parse(h.values.get(EXTRA));
const stamp='2026-10-12T12:00:00.000Z';
function harness(entries=[]){
 const values=new Map(entries);let tail=Promise.resolve();
 const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k),key:i=>[...values.keys()][i]??null,get length(){return values.size}};
 const target=()=>{const events=new Map();return {addEventListener:(name,fn)=>{if(!events.has(name))events.set(name,new Set());events.get(name).add(fn)},removeEventListener:(name,fn)=>events.get(name)?.delete(fn),dispatchEvent:event=>{for(const fn of events.get(event.type)??[])fn()}}};
 const window={...target(),localStorage:storage};const document={...target(),visibilityState:'visible'};const stores=[];
 const react={useMemo:f=>f(),useEffect:()=>{},useState:value=>[value,()=>{}],useSyncExternalStore:(subscribe,get,server)=>{stores.push({subscribe,get,server});return get()}};
 const navigator={locks:{request:(_name,work)=>{const result=tail.then(work);tail=result.catch(()=>{});return result}}};
 const context={window,document,localStorage:storage,navigator,crypto:require('node:crypto').webcrypto,Event:class{constructor(type){this.type=type}},Date,Math,Set,Map,JSON,Error,Number,String,Array,Object,URL,console};
 const memo=new Map();
 function load(name){
  if(memo.has(name))return memo.get(name);
  const source=fs.readFileSync(path.join(process.cwd(),'src','lib',name+'.ts'),'utf8');
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const compiledModule={exports:{}};memo.set(name,compiledModule.exports);
  const requireLocal=id=>{if(id==='react')return react;if(id.startsWith('@/lib/'))return load(id.split('/').pop());throw Error('Unexpected dependency '+id)};
  vm.runInNewContext('(function(require,module,exports){'+js+'})',context,{filename:name+'.js'})(requireLocal,compiledModule,compiledModule.exports);
  return compiledModule.exports;
 }
 return {values,storage,load,window,document,stores,q:load('questSystem'),core:load('hunterCore'),lab:load('hunterLab'),missions:load('hunterMissions'),activities:load('activityRewards')};
}
const system=xp=>({version:1,totalXP:xp,quests:[],arcs:[],completions:[]});
const boss=(status='pending')=>({id:'f05-boss',title:'Fictitious Boss',objective:'One action',target:1,current:1,xp:25,createdAt:stamp,completedAt:stamp,rewardStatus:status});
const profile=name=>({name,age:22,gender:'prefer_not_to_say',avatar:'male',goals:['Lecture'],onboardingCompleted:true,createdAt:stamp});
function importFixture(h){
 h.q.saveState({...system(450),completions:[{id:'f05-old-receipt',questId:'lifequest:activity:boss:f05-boss',period:'once',completedAt:stamp,xpAwarded:25,attribute:'discipline'}]});
 h.missions.saveExtra({version:1,bosses:[boss('credited')],events:[]});h.lab.saveLab(h.lab.readLab());
 h.storage.setItem('lifequest-profile-v1',JSON.stringify(profile('Fictitious account A')));
 const backup=h.core.exportLifeQuest();backup.records[SYSTEM]=JSON.stringify(system(100));
 backup.records[EXTRA]=JSON.stringify({version:1,bosses:[],events:[]});
 backup.records[LAB]=JSON.stringify({...h.lab.readLab(),ideas:[{id:'f05-new-idea',title:'Account B idea',content:'Fictitious',tag:'test',archived:false,createdAt:stamp}]});
 backup.records['lifequest-v2-demo']=JSON.stringify({totalXP:100,quests:[]});
 backup.records['lifequest-profile-v1']=JSON.stringify(profile('Fictitious account B'));
 return backup;
}
function failOnce(h,key){const set=h.storage.setItem;let failed=false;h.storage.setItem=(k,v)=>{if(k===key&&!failed){failed=true;throw Error('Simulated quota failure on '+key)}return set(k,v)};return()=>{h.storage.setItem=set};}
if(process.argv.includes('--f05-interruption-worker')){
 // Real child-process termination, with a file-backed fake storage; never a browser profile.
 const h=harness(),backup=importFixture(h),file=process.argv[process.argv.length-1];
 fs.writeFileSync(file,JSON.stringify([...h.values]));const set=h.storage.setItem;
 h.storage.setItem=(k,v)=>{set(k,v);fs.writeFileSync(file,JSON.stringify([...h.values]));if(k===LAB||(process.argv.includes('--after-prepare')&&k==='lifequest-import-journal-v1'))process.exit(42)};
 h.core.importLifeQuest(backup).catch(error=>{console.error(error);process.exitCode=1});
}else{
 const test=require('node:test');
 test('F05 characterization: normal import restores the complete fictitious account',async()=>{
  const h=harness(),backup=importFixture(h);await h.core.importLifeQuest(backup);
  for(const [key,raw] of Object.entries(backup.records))assert.equal(h.storage.getItem(key),raw);
 });
 test('F05 characterization: failure before the first import write leaves all records intact',async()=>{
  const h=harness(),backup=importFixture(h),before=[...h.values];failOnce(h,SYSTEM);
  await assert.rejects(()=>h.core.importLifeQuest(backup),/précédentes restaurées/);assert.deepEqual([...h.values],before);
 });
 test('F05 characterization: failure after the first import write rolls back byte-identically',async()=>{
  const h=harness(),backup=importFixture(h),before=[...h.values];failOnce(h,LAB);
  await assert.rejects(()=>h.core.importLifeQuest(backup),/précédentes restaurées/);assert.deepEqual([...h.values],before);
 });
 test('F05 characterization: middle-of-import failure rolls back and allows a complete retry',async()=>{
  const h=harness(),backup=importFixture(h),before=[...h.values];failOnce(h,'lifequest-profile-v1');
  await assert.rejects(()=>h.core.importLifeQuest(backup),/précédentes restaurées/);assert.deepEqual([...h.values],before);
  await h.core.importLifeQuest(backup);for(const [key,raw] of Object.entries(backup.records))assert.equal(h.storage.getItem(key),raw);
 });
 test('F05 reproduced limitation: failed rollback retains durable snapshots and blocks the next import',async()=>{
  const h=harness(),backup=importFixture(h),before=[...h.values],set=h.storage.setItem;let failed=false;
  h.storage.setItem=(k,v)=>{if(k===LAB&&!failed){failed=true;throw Error('Simulated quota')}if(failed&&k===SYSTEM)throw Error('Simulated rollback failure');return set(k,v)};
  await assert.rejects(()=>h.core.importLifeQuest(backup),/restauration incomplète/);
  assert.notDeepEqual([...h.values],before);assert.equal(rawState(h).totalXP,100);
  assert.equal(rawExtra(h).bosses[0].rewardStatus,'credited');
  assert.ok(h.core.backupRewardDiagnostics(rawState(h),rawExtra(h),rawLab(h)).some(x=>x.includes('sans reçu XP positif')));
  const restarted=harness([...h.values]);assert.equal(JSON.parse(restarted.values.get(SYSTEM)).totalXP,100);assert.equal(JSON.parse(restarted.values.get(EXTRA)).bosses[0].rewardStatus,'credited');
  // Phase C recovery is not implemented; even a valid manual import must be blocked.
  h.storage.setItem=set;const original={...backup,records:Object.fromEntries(Object.keys(backup.records).map(k=>[k,new Map(before).get(k)??null]))};
  const raw=h.storage.getItem('lifequest-import-journal-v1');assert.equal(JSON.parse(raw).phase,'prepared');
  await assert.rejects(()=>h.core.importLifeQuest(original),/journal précédent/);assert.equal(h.storage.getItem('lifequest-import-journal-v1'),raw);
 });
 test('F05 real process interruption with fake durable storage: prepared journal survives restart and blocks another import',async()=>{
  const os=require('node:os'),{spawnSync}=require('node:child_process');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lifequest-f05-')),file=path.join(dir,'fictitious-storage.json');
  try{
   const child=spawnSync(process.execPath,[__filename,'--f05-interruption-worker',file],{cwd:process.cwd(),encoding:'utf8',timeout:30000});
   assert.equal(child.status,42,child.stderr||String(child.error));
   const h=harness(JSON.parse(fs.readFileSync(file,'utf8')));
   assert.equal(rawState(h).totalXP,100);assert.equal(rawLab(h).ideas[0].title,'Account B idea');
   assert.equal(JSON.parse(h.storage.getItem('lifequest-profile-v1')).name,'Fictitious account A');
   assert.equal(rawExtra(h).bosses[0].rewardStatus,'credited');
   assert.ok(h.core.backupRewardDiagnostics(rawState(h),rawExtra(h),rawLab(h)).length);
   const fresh=harness(),backup=importFixture(fresh),raw=h.storage.getItem('lifequest-import-journal-v1');assert.equal(JSON.parse(raw).phase,'prepared');
   await assert.rejects(()=>h.core.importLifeQuest(backup),/journal précédent/);assert.equal(h.storage.getItem('lifequest-import-journal-v1'),raw);
  }finally{if(fs.existsSync(file))fs.unlinkSync(file);fs.rmdirSync(dir);}
 });

 const JOURNAL='lifequest-import-journal-v1';
 test('B: import v1/v2 preserves every raw record and clears only its completed journal',async()=>{
  for(const version of [1,2]){const h=harness(),backup=importFixture(h);backup.version=version;const log=[],set=h.storage.setItem;h.storage.setItem=(k,v)=>{log.push(k);return set(k,v)};await h.core.importLifeQuest(backup);assert.equal(log[0],JOURNAL);assert.equal(log.at(-1),JOURNAL);assert.equal(h.storage.getItem(JOURNAL),null);for(const [k,raw] of Object.entries(backup.records))assert.equal(h.storage.getItem(k),raw);}
 });
 test('B: capture failure before preparation writes nothing',async()=>{
  const h=harness(),backup=importFixture(h),before=[...h.values],get=h.storage.getItem;h.storage.getItem=k=>{if(k===SYSTEM)throw Error('Unavailable');return get(k)};
  await assert.rejects(()=>h.core.importLifeQuest(backup),/instantané impossible/);assert.deepEqual([...h.values],before);
 });
 test('B: preparation quota failure never touches business records',async()=>{
  const h=harness(),backup=importFixture(h),before=[...h.values];failOnce(h,JOURNAL);await assert.rejects(()=>h.core.importLifeQuest(backup),/non confirmée/);assert.deepEqual([...h.values],before);
 });
 test('B: preparation silently ignored is refused before first business write',async()=>{
  const h=harness(),backup=importFixture(h),before=[...h.values],set=h.storage.setItem;h.storage.setItem=(k,v)=>k===JOURNAL?undefined:set(k,v);
  await assert.rejects(()=>h.core.importLifeQuest(backup),/non confirmée/);assert.deepEqual([...h.values],before);
 });
 test('B: read-back failure after preparation retains prepared evidence and unchanged account',async()=>{
  const h=harness(),backup=importFixture(h),before=[...h.values],set=h.storage.setItem,get=h.storage.getItem;let prepared=false;
  h.storage.setItem=(k,v)=>{set(k,v);if(k===JOURNAL)prepared=true};h.storage.getItem=k=>{if(k===JOURNAL&&prepared)throw Error('Unavailable');return get(k)};
  await assert.rejects(()=>h.core.importLifeQuest(backup),/non confirmée/);assert.deepEqual([...h.values].filter(([k])=>k!==JOURNAL),before);assert.equal(JSON.parse(h.values.get(JOURNAL)).phase,'prepared');
 });
 test('B: existing prepared, committed, corrupt or unknown journal blocks even invalid imports without writes',async()=>{
  for(const kind of ['prepared','committed','corrupt','unknown']){
   const h=harness(),backup=importFixture(h),j=h.load('importJournal');const prepared=j.createImportJournal(Object.fromEntries(j.IMPORT_RECORD_KEYS.map(k=>[k,h.storage.getItem(k)])),backup.records,'existing',stamp);
   const raw=kind==='corrupt'?'{broken':JSON.stringify({...prepared,phase:kind==='committed'?'committed':'prepared',version:kind==='unknown'?999:1});h.storage.setItem(JOURNAL,raw);const before=[...h.values];
   await assert.rejects(()=>h.core.importLifeQuest(null),/Import refusé/);assert.deepEqual([...h.values],before);
  }
 });
 test('B: F04 incoherent target rejected before any journal or account write',async()=>{
  const h=harness(),backup=importFixture(h);backup.records[EXTRA]=JSON.stringify({version:1,bosses:[boss('credited')],events:[]});const before=[...h.values];await assert.rejects(()=>h.core.importLifeQuest(backup),/Sauvegarde incohérente/);assert.deepEqual([...h.values],before);
 });
 test('B: silent business write failure detected; rollback verified and journal removed',async()=>{
  const h=harness(),backup=importFixture(h),before=[...h.values],set=h.storage.setItem;let ignored=false;h.storage.setItem=(k,v)=>{if(k===LAB&&!ignored){ignored=true;return}return set(k,v)};
  await assert.rejects(()=>h.core.importLifeQuest(backup),/précédentes restaurées/);assert.deepEqual([...h.values],before);
 });
 test('B: unavailable target verification leaves evidence and does not blindly roll back',async()=>{
  const h=harness(),backup=importFixture(h),set=h.storage.setItem,get=h.storage.getItem;let applied=false;h.storage.setItem=(k,v)=>{set(k,v);if(k==='lifequest-profile-v1')applied=true};h.storage.getItem=k=>{if(applied&&k===SYSTEM)throw Error('Unavailable');return get(k)};
  await assert.rejects(()=>h.core.importLifeQuest(backup),/indisponible/);assert.equal(JSON.parse(h.values.get(JOURNAL)).phase,'prepared');assert.equal(h.values.get(SYSTEM),backup.records[SYSTEM]);
 });
 test('B: commit exception or silent failure rolls back before and clears prepared journal',async()=>{
  for(const silent of [true,false]){const h=harness(),backup=importFixture(h),before=[...h.values],set=h.storage.setItem;h.storage.setItem=(k,v)=>{if(k===JOURNAL&&JSON.parse(v).phase==='committed'){if(silent)return;throw Error('Quota')}return set(k,v)};
   await assert.rejects(()=>h.core.importLifeQuest(backup),/précédentes restaurées/);assert.deepEqual([...h.values],before);
  }
 });
 test('B: commit write succeeds but throws; committed target is never rolled back',async()=>{
  const h=harness(),backup=importFixture(h),set=h.storage.setItem;h.storage.setItem=(k,v)=>{set(k,v);if(k===JOURNAL&&JSON.parse(v).phase==='committed')throw Error('Uncertain acknowledgement')};
  await assert.rejects(()=>h.core.importLifeQuest(backup),/confirmation du commit interrompue/);assert.equal(JSON.parse(h.storage.getItem(JOURNAL)).phase,'committed');for(const [k,v] of Object.entries(backup.records))assert.equal(h.storage.getItem(k),v);
 });
 test('B: commit read-back remains unavailable; neither automatic rollback nor new import is allowed',async()=>{
  const h=harness(),backup=importFixture(h),set=h.storage.setItem,get=h.storage.getItem;let committed=false;h.storage.setItem=(k,v)=>{set(k,v);if(k===JOURNAL&&JSON.parse(v).phase==='committed')committed=true};h.storage.getItem=k=>{if(k===JOURNAL&&committed)throw Error('Unavailable');return get(k)};
  await assert.rejects(()=>h.core.importLifeQuest(backup),/résultat incertain/);assert.equal(JSON.parse(h.values.get(JOURNAL)).phase,'committed');assert.equal(h.values.get(SYSTEM),backup.records[SYSTEM]);
  await assert.rejects(()=>h.core.importLifeQuest(backup),/Import refusé/);
 });
 test('B: failed cleanup after confirmed commit keeps target, receipts and committed evidence',async()=>{
  for(const silent of [true,false]){const h=harness(),backup=importFixture(h),remove=h.storage.removeItem;h.storage.removeItem=k=>{if(k===JOURNAL){if(silent)return;throw Error('Denied')}return remove(k)};
   await assert.rejects(()=>h.core.importLifeQuest(backup),/commit confirmé.*nettoyage/);for(const [k,v] of Object.entries(backup.records))assert.equal(h.storage.getItem(k),v);const raw=h.storage.getItem(JOURNAL);assert.equal(JSON.parse(raw).phase,'committed');await assert.rejects(()=>h.core.importLifeQuest(backup),/journal précédent/);assert.equal(h.storage.getItem(JOURNAL),raw);
  }
 });
 test('B: cleanup read-back failure reports uncertainty even if deletion took effect',async()=>{
  const h=harness(),backup=importFixture(h),remove=h.storage.removeItem,get=h.storage.getItem;let removed=false;h.storage.removeItem=k=>{remove(k);if(k===JOURNAL)removed=true};h.storage.getItem=k=>{if(k===JOURNAL&&removed)throw Error('Unavailable');return get(k)};
  await assert.rejects(()=>h.core.importLifeQuest(backup),/commit confirmé.*nettoyage/);assert.equal(h.values.has(JOURNAL),false);assert.equal(h.values.get(SYSTEM),backup.records[SYSTEM]);
 });
 test('B: failed cleanup after verified rollback preserves before and prepared evidence',async()=>{
  const h=harness(),backup=importFixture(h),before=[...h.values];failOnce(h,LAB);const remove=h.storage.removeItem;h.storage.removeItem=k=>{if(k===JOURNAL)throw Error('Denied');return remove(k)};
  await assert.rejects(()=>h.core.importLifeQuest(backup),/nettoyage non confirmé/);assert.deepEqual([...h.values].filter(([k])=>k!==JOURNAL),before);assert.equal(JSON.parse(h.storage.getItem(JOURNAL)).phase,'prepared');
 });
 test('B: unrecognized third-party business data is not overwritten during application or rollback',async()=>{
  const h=harness(),backup=importFixture(h),set=h.storage.setItem;h.storage.setItem=(k,v)=>{set(k,v);if(k===SYSTEM)h.values.set(LAB,'third party edit')};
  await assert.rejects(()=>h.core.importLifeQuest(backup),/ambigu/);assert.equal(h.storage.getItem(LAB),'third party edit');assert.equal(JSON.parse(h.storage.getItem(JOURNAL)).phase,'prepared');
 });
 test('B: cinematic deletions and absent optional v1 transition are journalized and verified',async()=>{
  const h=harness(),backup=importFixture(h);h.storage.setItem('lifequest-cinematic-seen-v1:old:5','1');backup.version=1;delete backup.records['lifequest-hunter-transition-v1'];
  await h.core.importLifeQuest(backup);assert.equal(h.storage.getItem('lifequest-cinematic-seen-v1:old:5'),null);assert.equal(h.storage.getItem('lifequest-hunter-transition-v1'),null);assert.equal(h.storage.getItem(JOURNAL),null);
 });
 test('B: importing preserved receipts does not reward Boss or Focus twice',async()=>{
  const h=harness();importFixture(h);h.q.saveState({...rawState(h),completions:[...rawState(h).completions,{id:'b-focus-receipt',questId:'lifequest:activity:focus:b-focus',period:'once',completedAt:stamp,xpAwarded:20,attribute:'focus'}]});const session={id:'b-focus',date:stamp,minutes:25,label:'Test',rewardStatus:'credited'};h.lab.saveLab({...h.lab.readLab(),sessions:[session]});const backup=h.core.exportLifeQuest(),raw=backup.records[SYSTEM];await h.core.importLifeQuest(backup);await h.activities.claimBossReward('f05-boss');await h.activities.finishFocusSession(session);assert.equal(h.storage.getItem(SYSTEM),raw);assert.equal(rawState(h).completions.length,2);
 });

 test('B: real worker termination immediately after preparation preserves before and blocks restart import',async()=>{
  const os=require('node:os'),{spawnSync}=require('node:child_process'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'lifequest-b-')),file=path.join(dir,'fake.json');
  try{const child=spawnSync(process.execPath,[__filename,'--f05-interruption-worker','--after-prepare',file],{cwd:process.cwd(),encoding:'utf8',timeout:30000});assert.equal(child.status,42,child.stderr);const h=harness(JSON.parse(fs.readFileSync(file,'utf8'))),raw=h.storage.getItem(JOURNAL),j=h.load('importJournal');assert.equal(rawState(h).totalXP,450);assert.equal(j.inspectJournalValues(JSON.parse(raw),h.storage).matchesBefore,true);const fresh=harness(),backup=importFixture(fresh);await assert.rejects(()=>h.core.importLifeQuest(backup),/journal précédent/);assert.equal(h.storage.getItem(JOURNAL),raw);}finally{if(fs.existsSync(file))fs.unlinkSync(file);fs.rmdirSync(dir);}
 });
 test('B: silently refused rollback write retains prepared journal and incomplete state',async()=>{
  const h=harness(),backup=importFixture(h),set=h.storage.setItem,original=h.storage.getItem(SYSTEM);let failed=false;h.storage.setItem=(k,v)=>{if(k===LAB&&!failed){failed=true;throw Error('Fail')}if(k===SYSTEM&&failed&&v===original)return;return set(k,v)};await assert.rejects(()=>h.core.importLifeQuest(backup),/restauration incomplète/);assert.equal(JSON.parse(h.storage.getItem(JOURNAL)).phase,'prepared');assert.equal(rawState(h).totalXP,100);
 });
 test('C: pending journal blocks quest mutations under the same lock',async()=>{
  const h=harness(),backup=importFixture(h),set=h.storage.setItem;let failed=false;h.storage.setItem=(k,v)=>{if(k===LAB&&!failed){failed=true;throw Error('Fail')}if(k===SYSTEM&&failed)throw Error('Rollback denied');return set(k,v)};await assert.rejects(()=>h.core.importLifeQuest(backup));h.storage.setItem=set;const raw=h.storage.getItem(JOURNAL);await assert.rejects(()=>h.load('questActions').createQuestAction({title:'Phase C guarded',description:'',frequency:'daily',attribute:'focus',difficulty:'NORMAL',xp:50,arcId:'',targetDate:''}),/Récupération requise/);assert.equal(rawState(h).quests.length,0);assert.equal(h.storage.getItem(JOURNAL),raw);await assert.rejects(()=>h.core.importLifeQuest(backup),/journal précédent/);
 });

 test('C: all journal variants block business mutations and exports without any write',async()=>{
  for(const raw of ['{"phase":"prepared"}','{"phase":"committed"}','{broken','{"version":999}','']){
   const h=harness();importFixture(h);const exported=h.core.exportLifeQuest(),profile=JSON.parse(h.values.get('lifequest-profile-v1')),extra=rawExtra(h),data=rawLab(h),state=rawState(h);
   h.values.set(JOURNAL,raw);const before=[...h.values],actions=h.load('questActions');
   for(const action of [()=>actions.createQuestAction({title:'Blocked',description:'',frequency:'daily',attribute:'focus',difficulty:'NORMAL',xp:50,arcId:'',targetDate:''}),()=>actions.changeQuests(s=>s),()=>actions.completeQuestAction('x'),()=>h.core.awardActivityXP('focus','blocked',20,'focus'),()=>h.core.syncAchievements(),()=>h.core.applyDailyStability(),()=>h.missions.createBossBattle({title:'Boss',subObjectives:[{title:'One',weight:1}]}),()=>h.activities.progressBoss('f05-boss'),()=>h.activities.claimBossReward('f05-boss'),()=>h.activities.finishFocusSession({id:'session',date:stamp,minutes:25,label:'Test'}),()=>h.lab.mutateLab(d=>d),()=>h.load('profile').saveProfile(profile)])await assert.rejects(action,/Récupération requise/);
   for(const read of [()=>h.q.loadState(),()=>h.missions.loadExtra(),()=>h.lab.readLab(),()=>h.load('profile').readProfile(),()=>h.core.getCoreSettings(450),()=>h.core.ensureCoreSettings(450),()=>h.core.exportLifeQuest(),()=>h.q.saveState(state),()=>h.lab.saveLab(data),()=>h.missions.saveExtra(extra)])assert.throws(read,/Récupération requise/);
   await assert.rejects(()=>h.core.importLifeQuest(exported),/Import refusé/);assert.deepEqual([...h.values],before);
  }
 });
 test('C: journal read failure blocks every mutation and export, never initializes empty data',async()=>{
  const h=harness(),before=[...h.values],get=h.storage.getItem;h.storage.getItem=k=>{if(k===JOURNAL)throw Error('Denied');return get(k)};
  assert.equal(h.load('storageAccess').getStorageAccessState().status,'unavailable');assert.throws(()=>h.q.loadState(),/inaccessible/);assert.throws(()=>h.load('profile').readProfile(),/inaccessible/);assert.throws(()=>h.core.exportLifeQuest(),/inaccessible/);await assert.rejects(()=>h.core.syncAchievements(),/inaccessible/);await assert.rejects(()=>h.core.applyDailyStability(),/inaccessible/);assert.deepEqual([...h.values],before);
 });
 test('C: queued mutation rechecks journal inside lock, after its caller started',async()=>{
  const h=harness();importFixture(h);let release,locked;const started=new Promise(r=>locked=r);
  const holding=h.load('storage').withImportStorageLock(async()=>{locked();await new Promise(r=>release=r);h.values.set(JOURNAL,'{pending')});await started;
  const pending=h.core.awardActivityXP('focus','queued',20,'focus');release();await holding;await assert.rejects(()=>pending,/Récupération requise/);assert.equal(rawState(h).totalXP,450);
 });
 test('C: normal mutations and journalized import share one lock without nesting or deadlock',async()=>{
  const h=harness(),backup=importFixture(h);await Promise.race([h.core.importLifeQuest(backup),new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('Deadlock')),2000);t.unref()})]);await h.core.awardActivityXP('focus','normal',20,'focus');assert.equal(rawState(h).totalXP,120);assert.equal(h.values.has(JOURNAL),false);
 });
 test('C: subscriptions react to other tabs, focus and visibility without changing any persisted data',()=>{
  const h=harness();importFixture(h);const access=h.load('storageAccess');let calls=0;const stop=access.subscribeStorageAccess(()=>calls++),before=[...h.values];const revision=access.storageAccessRevision();
  h.window.dispatchEvent({type:'storage'});h.window.dispatchEvent({type:'focus'});h.document.dispatchEvent({type:'visibilitychange'});assert.equal(calls,3);assert.ok(access.storageAccessRevision()>revision);stop();h.window.dispatchEvent({type:'focus'});assert.equal(calls,3);assert.deepEqual([...h.values],before);
 });
 test('C: generic store invalidates cached data on journal presence and reloads even identical business bytes',()=>{
  const h=harness();importFixture(h);let reads=0;h.load('useStoredData').useStoredData(SYSTEM,()=>{reads++;return JSON.parse(h.storage.getItem(SYSTEM))},null);const store=h.stores.at(-1);assert.equal(store.get().data.totalXP,450);const initialReads=reads;
  h.values.set(JOURNAL,'{blocked');assert.equal(store.get().ready,false);assert.equal(store.get().data,null);assert.equal(reads,initialReads);
  h.values.delete(JOURNAL);assert.equal(store.get().data.totalXP,450);assert.ok(reads>initialReads);
 });
 test('C: quest store clears old XP and stays unready while journal is present',()=>{
  const h=harness();importFixture(h);h.load('useQuestSystem').useQuestSystem();const store=h.stores.find(s=>s.get()?.data?.version===1);assert.ok(store);assert.equal(store.get().data.totalXP,450);
  h.values.set(JOURNAL,'{blocked');assert.equal(store.get().ready,false);assert.equal(store.get().data.totalXP,0);assert.match(store.get().error,/Récupération requise/);h.values.delete(JOURNAL);assert.equal(store.get().data.totalXP,450);
 });
 test('C: guard snapshot objects are stable and server never reads browser storage',()=>{
  const h=harness(),access=h.load('storageAccess');assert.equal(access.getStorageAccessState(),access.getStorageAccessState());assert.equal(access.storageAccessServerSnapshot().status,'checking');h.values.set(JOURNAL,'');assert.equal(access.getStorageAccessState().status,'recovery-required');assert.equal(access.getStorageAccessState(),access.getStorageAccessState());assert.equal(h.values.size,1);
 });

 function recoveryFixture(phase='prepared'){
  const h=harness(),backup=importFixture(h),engine=h.load('importJournal');
  const before=Object.fromEntries(engine.IMPORT_RECORD_KEYS.map(k=>[k,h.storage.getItem(k)]));
  const prepared=engine.createImportJournal(before,backup.records,'d-operation',stamp),expected={...prepared,phase};
  if(phase==='committed'){for(const [k,v] of Object.entries(backup.records)){if(v===null)h.values.delete(k);else h.values.set(k,v)}}
  else{h.values.set(SYSTEM,backup.records[SYSTEM]);h.values.set(LAB,backup.records[LAB]);}
  h.values.set(JOURNAL,JSON.stringify(expected));return {h,expected,recovery:h.load('importRecovery')};
 }
 test('D: prepared recovery restores byte-identical before including XP and historical receipts',async()=>{
  const {h,expected,recovery}=recoveryFixture();assert.equal((await recovery.inspectImportRecovery()).action,'restore-before');await recovery.recoverImportJournal(expected,true);for(const [k,v] of Object.entries(expected.before))assert.equal(h.storage.getItem(k),v);assert.equal(h.values.has(JOURNAL),false);assert.equal(h.q.loadState().totalXP,450);assert.equal(h.q.loadState().completions.length,1);
 });
 test('D: prepared with fully applied after still restores before, never treats it as committed',async()=>{
  const {h,expected,recovery}=recoveryFixture();for(const [k,v] of Object.entries(expected.after)){if(v===null)h.values.delete(k);else h.values.set(k,v)}await recovery.recoverImportJournal(expected,true);assert.equal(h.q.loadState().totalXP,450);assert.equal(h.q.loadState().completions.length,1);
 });
 test('D: explicit confirmation required before any mutation',async()=>{
  const {h,expected,recovery}=recoveryFixture(),before=[...h.values];await assert.rejects(()=>recovery.recoverImportJournal(expected,false),e=>e.code==='D_CONFIRM');assert.deepEqual([...h.values],before);
 });
 test('D: ambiguous values or extra authorized keys block recovery without overwrite',async()=>{
  for(const extra of [true,false]){const {h,expected,recovery}=recoveryFixture();if(extra)h.values.set('lifequest-cinematic-seen-v1:unexpected:5','1');else h.values.set(LAB,'PRIVATE CONTENT');const before=[...h.values];assert.equal((await recovery.inspectImportRecovery()).code,'D_AMBIGUOUS');await assert.rejects(()=>recovery.recoverImportJournal(expected,true),e=>e.code==='D_AMBIGUOUS');assert.deepEqual([...h.values],before);}
 });
 test('D: committed finalization preserves after and removes only journal',async()=>{
  const {h,expected,recovery}=recoveryFixture('committed'),before=[...h.values].filter(([k])=>k!==JOURNAL);assert.equal((await recovery.inspectImportRecovery()).action,'finalize');await recovery.recoverImportJournal(expected,true);assert.deepEqual([...h.values],before);assert.equal(h.q.loadState().totalXP,100);
 });
 test('D: contradictory committed or invalid F04 target never unlocks data',async()=>{
  for(const contradiction of [true,false]){const {h,expected,recovery}=recoveryFixture('committed');if(contradiction)h.values.set(SYSTEM,expected.before[SYSTEM]);else{const changed={...expected,after:{...expected.after,[EXTRA]:JSON.stringify({version:1,bosses:[boss('credited')],events:[]})}};h.values.set(EXTRA,changed.after[EXTRA]);h.values.set(JOURNAL,JSON.stringify(changed));}const before=[...h.values];const report=await recovery.inspectImportRecovery();assert.equal(report.action,null);await assert.rejects(()=>recovery.recoverImportJournal(expected,true));assert.deepEqual([...h.values],before);}
 });
 test('D: corrupt, incomplete, forbidden-key and unknown journals only permit diagnosis',async()=>{
  const {h,expected,recovery}=recoveryFixture();for(const raw of ['{private',JSON.stringify({...expected,version:99}),JSON.stringify({...expected,keys:[...expected.keys,'TOKEN']}),JSON.stringify({...expected,before:{}})]){h.values.set(JOURNAL,raw);const before=[...h.values];const report=await recovery.inspectImportRecovery();assert.equal(report.action,null);assert.ok(['D_CORRUPT','D_UNKNOWN'].includes(report.code));await assert.rejects(()=>recovery.recoverImportJournal(expected,true));assert.deepEqual([...h.values],before);}
 });
 test('D: journal read failure yields safe code and prevents recovery/export',async()=>{
  const {h,expected,recovery}=recoveryFixture(),get=h.storage.getItem;h.storage.getItem=k=>{if(k===JOURNAL)throw Error('PRIVATE ACCESS TOKEN');return get(k)};assert.equal((await recovery.inspectImportRecovery()).code,'D_UNAVAILABLE');await assert.rejects(()=>recovery.recoverImportJournal(expected,true),e=>!e.message.includes('TOKEN'));await assert.rejects(()=>recovery.exportRecoveryDiagnostic(),e=>e.code==='D_UNAVAILABLE');assert.equal(h.values.has(JOURNAL),true);
 });
 test('D: interrupted restore retains journal and permits a safe retry',async()=>{
  const {h,expected,recovery}=recoveryFixture();const undo=failOnce(h,SYSTEM);await assert.rejects(()=>recovery.recoverImportJournal(expected,true),e=>e.code==='D_WRITE');assert.equal(h.values.has(JOURNAL),true);assert.equal((await recovery.inspectImportRecovery()).action,'restore-before');undo();await recovery.recoverImportJournal(expected,true);assert.equal(h.q.loadState().totalXP,450);
 });
 test('D: cleanup refusal keeps verified data and retries without extra rewards',async()=>{
  for(const phase of ['prepared','committed']){const {h,expected,recovery}=recoveryFixture(phase),remove=h.storage.removeItem;h.storage.removeItem=k=>{if(k===JOURNAL)throw Error('Denied');return remove(k)};await assert.rejects(()=>recovery.recoverImportJournal(expected,true),e=>e.code==='D_CLEANUP');assert.equal(h.values.has(JOURNAL),true);h.storage.removeItem=remove;await recovery.recoverImportJournal(expected,true);assert.equal(h.q.loadState().totalXP,phase==='prepared'?450:100);}
 });
 test('D: repeated recovery and two queued tabs are idempotent after exact result verification',async()=>{
  for(const phase of ['prepared','committed']){const {h,expected,recovery}=recoveryFixture(phase);const results=await Promise.all([recovery.recoverImportJournal(expected,true),recovery.recoverImportJournal(expected,true)]);assert.equal(results[0].status,'resolved');assert.equal(results[1].status,'already-resolved');const before=[...h.values];assert.equal((await recovery.recoverImportJournal(expected,true)).status,'already-resolved');assert.deepEqual([...h.values],before);}
 });
 test('D: journal changed after inspection invalidates confirmation',async()=>{
  const {h,expected,recovery}=recoveryFixture();h.values.set(JOURNAL,JSON.stringify({...expected,operationId:'different'}));const before=[...h.values];await assert.rejects(()=>recovery.recoverImportJournal(expected,true),e=>e.code==='D_CHANGED');assert.deepEqual([...h.values],before);
 });
 test('D: diagnostics omit unrelated keys and preserve recognized raw journal without any write',async()=>{
  const {h,expected,recovery}=recoveryFixture();h.values.set('access_token','SECRET-TOKEN');h.values.set('other-app','PRIVATE');const before=[...h.values];const file=await recovery.exportRecoveryDiagnostic();assert.equal(file.format,'lifequest-recovery-diagnostic');assert.equal(file.journalRaw,JSON.stringify(expected));assert.equal(file.journalRawOmitted,false);assert.equal(file.records.access_token,undefined);assert.equal(JSON.stringify(file).includes('SECRET-TOKEN'),false);assert.deepEqual([...h.values],before);await assert.rejects(()=>h.core.importLifeQuest(file),/Import refusé/);
 });
 test('D: untrusted raw journal containing foreign keys is omitted without deleting evidence',async()=>{
  const {h,recovery}=recoveryFixture(),raw='{"access_token":"SECRET","before":{"foreign":"SECRET"}}';h.values.set(JOURNAL,raw);const file=await recovery.exportRecoveryDiagnostic();assert.equal(file.journalRaw,null);assert.equal(file.journalRawOmitted,true);assert.equal(JSON.stringify(file).includes('SECRET'),false);assert.equal(h.values.get(JOURNAL),raw);
 });
 test('D: numeric unknown version with recognized safe structure can be preserved in diagnostic only',async()=>{
  const {h,expected,recovery}=recoveryFixture(),raw=JSON.stringify({...expected,version:99});h.values.set(JOURNAL,raw);const file=await recovery.exportRecoveryDiagnostic();assert.equal(file.journalRaw,raw);assert.equal(file.code,'D_UNKNOWN');assert.equal((await recovery.inspectImportRecovery()).action,null);
 });
 test('D: unstable capture returns a safe error instead of a misleading export',async()=>{
  const {h,recovery}=recoveryFixture(),get=h.storage.getItem;let count=0;h.storage.getItem=k=>{if(k===SYSTEM&&++count===2)h.values.set(SYSTEM,'changed');return get(k)};await assert.rejects(()=>recovery.exportRecoveryDiagnostic(),e=>e.code==='D_UNSTABLE');assert.equal(h.values.has(JOURNAL),true);
 });
 test('D: rollback preserves legitimate legacy balances and historical zero-XP F03 state',async()=>{
  const h=harness();h.values.set('lifequest-v2-demo',JSON.stringify({totalXP:1234,quests:[]}));h.missions.saveExtra({version:1,bosses:[{...boss('resolved_without_xp'),xp:0}],events:[]});const engine=h.load('importJournal'),before=Object.fromEntries(engine.IMPORT_RECORD_KEYS.map(k=>[k,h.storage.getItem(k)])),after={...before,[SYSTEM]:JSON.stringify(system(100)),[EXTRA]:JSON.stringify({version:1,bosses:[],events:[]})},expected=engine.createImportJournal(before,after,'legacy',stamp);h.values.set(SYSTEM,after[SYSTEM]);h.values.set(JOURNAL,JSON.stringify(expected));await h.load('importRecovery').recoverImportJournal(expected,true);assert.equal(h.q.loadState().totalXP,1234);assert.equal(h.missions.loadExtra().bosses[0].rewardStatus,'resolved_without_xp');assert.equal(h.values.has(SYSTEM),false);
 });
 test('D: recovery messages never contain private activity IDs or content from F04 errors',async()=>{
  const {h,expected,recovery}=recoveryFixture('committed'),privateBoss={...boss('credited'),id:'PRIVATE-HUNTER-ID'},changed={...expected,after:{...expected.after,[EXTRA]:JSON.stringify({version:1,bosses:[privateBoss],events:[]})}};h.values.set(EXTRA,changed.after[EXTRA]);h.values.set(JOURNAL,JSON.stringify(changed));const report=await recovery.inspectImportRecovery();assert.equal(report.code,'D_TARGET_INVALID');assert.equal(report.message.includes('PRIVATE'),false);await assert.rejects(()=>recovery.recoverImportJournal(changed,true),e=>e.code==='D_TARGET_INVALID'&&!e.message.includes('PRIVATE'));
 });

 test('D: diagnostic omits embedded credential fields and lists omissions without modifying originals',async()=>{
  const {h,expected,recovery}=recoveryFixture();const unsafe=JSON.stringify({version:1,access_token:'SECRET-EMBEDDED-TOKEN'});h.values.set(LAB,unsafe);h.values.set(JOURNAL,JSON.stringify({...expected,before:{...expected.before,[LAB]:unsafe}}));const before=[...h.values];const file=await recovery.exportRecoveryDiagnostic();assert.equal(file.records[LAB],undefined);assert.ok(file.recordKeysOmitted.includes(LAB));assert.equal(file.journalRawOmitted,true);assert.equal(JSON.stringify(file).includes('SECRET-EMBEDDED-TOKEN'),false);assert.deepEqual([...h.values],before);
 });
 test('F05 Boss: status-write failure after XP credit preserves receipt and retry cannot double credit',async()=>{
  const h=harness();h.q.saveState(system(450));h.missions.saveExtra({version:1,bosses:[boss()],events:[]});
  const restore=failOnce(h,EXTRA);await assert.rejects(()=>h.activities.claimBossReward('f05-boss'));restore();
  assert.equal(rawState(h).totalXP,475);assert.equal(rawExtra(h).bosses[0].rewardStatus,'pending');
  const restarted=harness([...h.values]);await restarted.activities.claimBossReward('f05-boss');await restarted.activities.claimBossReward('f05-boss');
  assert.equal(restarted.q.loadState().totalXP,475);assert.equal(restarted.q.loadState().completions.length,1);assert.equal(restarted.missions.loadExtra().bosses[0].rewardStatus,'credited');
 });
 test('F05 Focus: status-write failure after credit remains idempotent after restart',async()=>{
  const h=harness();h.q.saveState(system(450));const session={id:'f05-focus',date:stamp,minutes:25,label:'Fictitious'};
  h.storage.setItem('lifequest-hunter-timer-v1',JSON.stringify({mode:'focus',secondsLeft:1500,runningUntil:Date.now()-1000,label:session.label,sessionId:session.id}));
  const set=h.storage.setItem;h.storage.setItem=(k,v)=>{if(k===LAB&&JSON.parse(v).sessions.some(s=>s.rewardStatus==='credited'))throw Error('Simulated status failure');return set(k,v)};
  await assert.rejects(()=>h.activities.finishFocusSession(session));h.storage.setItem=set;
  assert.equal(rawState(h).totalXP,470);assert.equal(h.lab.readLab().sessions[0].rewardStatus,'pending');
  const restarted=harness([...h.values]);await restarted.activities.finishFocusSession(session);await restarted.activities.finishFocusSession(session);
  assert.equal(restarted.q.loadState().totalXP,470);assert.equal(restarted.q.loadState().completions.length,1);assert.equal(restarted.lab.readLab().sessions.length,1);assert.equal(restarted.lab.readLab().sessions[0].rewardStatus,'credited');
 });
 test('F05 XP: failed primary credit may initialize settings but grants no XP; retry grants once',async()=>{
  const h=harness();h.q.saveState(system(450));failOnce(h,SYSTEM);
  await assert.rejects(()=>h.core.awardActivityXP('focus','f05-xp',20,'focus'));
  assert.equal(rawState(h).totalXP,450);assert.equal(rawState(h).completions.length,0);assert.notEqual(h.storage.getItem(h.core.CORE_KEY),null);
  await h.core.awardActivityXP('focus','f05-xp',20,'focus');await h.core.awardActivityXP('focus','f05-xp',20,'focus');assert.equal(rawState(h).totalXP,470);assert.equal(rawState(h).completions.length,1);
 });
 test('F05 compatibility mirror failure keeps authoritative XP and receipt committed exactly once',async()=>{
  const h=harness();h.q.saveState(system(450));failOnce(h,'lifequest-v2-demo');
  await h.core.awardActivityXP('focus','f05-mirror',20,'focus');assert.equal(JSON.parse(h.storage.getItem('lifequest-v2-demo')).totalXP,450);
  const restarted=harness([...h.values]);await restarted.core.awardActivityXP('focus','f05-mirror',20,'focus');assert.equal(restarted.q.loadState().totalXP,470);assert.equal(restarted.q.loadState().completions.length,1);
 });
}
