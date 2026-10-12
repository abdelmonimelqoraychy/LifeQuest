const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const root=process.cwd();
const values=new Map();
let lockTail=Promise.resolve();
const storage={getItem:k=>values.has(k)?values.get(k):null,setItem:(k,v)=>{if(storage.failKey===k){storage.failKey=null;throw Error("Quota simulé");}values.set(k,String(v));},removeItem:k=>values.delete(k),key:i=>[...values.keys()][i]??null,get length(){return values.size}};
const context={window:{localStorage:storage,dispatchEvent:()=>{}},localStorage:storage,crypto:require('node:crypto').webcrypto,Date,Math,Set,Map,JSON,Error,Number,String,Array,Object,URL,console,navigator:{locks:{request:(_name,work)=>{const result=lockTail.then(work);lockTail=result.catch(()=>{});return result;}}},Event:class Event{constructor(type){this.type=type}}};
const memo=new Map();
function load(name){
 if(memo.has(name))return memo.get(name);
 const file=path.join(root,'src','lib',name+'.ts');
 const content=fs.readFileSync(file,'utf8');
 const transpiled=ts.transpileModule(content,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};memo.set(name,m.exports);
 const deps={'@/lib/questSystem':()=>load('questSystem'),'@/lib/hunterLab':()=>load('hunterLab'),'@/lib/hunterMissions':()=>load('hunterMissions')};
 const req=id=>{if(deps[id])return deps[id]();if(id.startsWith('@/lib/'))return load(id.split('/').pop());throw new Error('Unexpected dependency: '+id)};
 vm.runInNewContext('(function(require,module,exports,window,localStorage,crypto,Event,navigator){'+transpiled+'})',{...context},{filename:name+'.js'})(req,m,m.exports,context.window,storage,context.crypto,context.Event,context.navigator);
 return m.exports;
}
const q=load('questSystem'),core=load('hunterCore');
const today=()=>new Date().toISOString();
const event=(id,period='2026-10-10')=>({id,questId:'quest-1',period,completedAt:today(),xpAwarded:30,attribute:'focus'});
const state=()=>({version:1,totalXP:450,quests:[],arcs:[],completions:[]});
function restoreFixture(frequency='daily',completed=true){
 const quest={id:'restore-quest',title:'Restore me',description:'Keep draft fields',frequency,difficulty:'HARD',attribute:'discipline',xp:77,createdAt:'2025-01-01T12:00:00.000Z',targetDate:frequency==='once'?'2025-01-02':undefined,revision:4};
 const receipt={id:'restore-receipt',questId:quest.id,period:q.periodId(frequency),completedAt:today(),xpAwarded:77,attribute:'discipline',questTitle:'Old title',arcId:null};
 const initial={...state(),quests:[quest],completions:completed?[receipt]:[],achievements:[{id:'first-clear',unlockedAt:today()}]};
 storage.setItem(q.SYSTEM_KEY,JSON.stringify(initial));return initial;
}
test('Restore preserves identity, custom XP, receipts and all quest fields through reload and v1/v2 imports',async()=>{
 const actions=load('questActions'),initial=restoreFixture('once');
 await actions.archiveQuestAction('restore-quest');
 const archived=q.loadState();assert.equal(archived.quests[0].revision,5);
 const backup=core.exportLifeQuest();await core.importLifeQuest(backup);
 await actions.restoreQuestAction('restore-quest');
 const expected={...initial,quests:[{...initial.quests[0],archived:false,revision:6}]};
 assert.equal(JSON.stringify(q.loadState()),JSON.stringify(expected));
 for(const version of [1,2]){await core.importLifeQuest({...backup,version});await actions.restoreQuestAction('restore-quest');assert.equal(JSON.stringify(q.loadState()),JSON.stringify(expected));}
 assert.equal(await actions.completeQuestAction('restore-quest'),null);
});
for(const frequency of ['daily','weekly','monthly'])test(`Restore ${frequency} completed quest does not reward it again in current period`,async()=>{
 const actions=load('questActions'),initial=restoreFixture(frequency);
 await actions.archiveQuestAction('restore-quest');await actions.restoreQuestAction('restore-quest');
 assert.equal(await actions.completeQuestAction('restore-quest'),null);
 assert.equal(q.loadState().totalXP,initial.totalXP);assert.equal(JSON.stringify(q.loadState().completions),JSON.stringify(initial.completions));
 const next=new Date();next.setMonth(next.getMonth()+2);assert.equal(q.hasCompleted(q.loadState().quests[0],initial.completions,next),false);
});
test('Concurrent restoration is idempotent and an eligible quest still receives exactly one reward',async()=>{
 const actions=load('questActions');restoreFixture('daily',false);await actions.archiveQuestAction('restore-quest');
 await Promise.all([actions.restoreQuestAction('restore-quest'),actions.restoreQuestAction('restore-quest')]);
 assert.equal(q.loadState().quests.length,1);assert.equal(q.loadState().quests[0].revision,6);assert.equal(q.loadState().totalXP,450);
 const rewards=await Promise.all([actions.completeQuestAction('restore-quest'),actions.completeQuestAction('restore-quest')]);
 assert.equal(rewards.filter(Boolean).length,1);assert.equal(q.loadState().totalXP,527);assert.equal(q.loadState().completions.length,1);
 const raw=storage.getItem(q.SYSTEM_KEY);await actions.restoreQuestAction('restore-quest');assert.equal(storage.getItem(q.SYSTEM_KEY),raw);
});
test('Archive/restore invalidates stale edits, preserves cooldown and does not overwrite a newer edit',async()=>{
 const actions=load('questActions'),initial=restoreFixture();initial.quests[0].availableAfter='2099-01-01';storage.setItem(q.SYSTEM_KEY,JSON.stringify(initial));
 await actions.archiveQuestAction('restore-quest');await actions.restoreQuestAction('restore-quest');
 const draft={...initial.quests[0],arcId:'',targetDate:'',expectedRevision:4};
 await assert.rejects(actions.updateQuestAction('restore-quest',draft),/autre onglet/);
 assert.equal(q.loadState().quests[0].availableAfter,'2099-01-01');
 await actions.updateQuestAction('restore-quest',{...draft,title:'New edit',expectedRevision:6});await actions.restoreQuestAction('restore-quest');assert.equal(q.loadState().quests[0].title,'New edit');
});
test('Restore refuses missing quests and failed storage, permits retry without losing history',async()=>{
 const actions=load('questActions');restoreFixture();await actions.archiveQuestAction('restore-quest');const raw=storage.getItem(q.SYSTEM_KEY);
 await assert.rejects(actions.restoreQuestAction('missing'),/introuvable/);assert.equal(storage.getItem(q.SYSTEM_KEY),raw);
 storage.failKey=q.SYSTEM_KEY;await assert.rejects(actions.restoreQuestAction('restore-quest'),/Quota/);assert.equal(storage.getItem(q.SYSTEM_KEY),raw);
 await actions.restoreQuestAction('restore-quest');assert.equal(q.loadState().quests[0].archived,false);assert.equal(q.loadState().totalXP,450);
});
test('F05 blocks even repeated restore and archive without modifying any stored record',async()=>{
 const actions=load('questActions');restoreFixture();await actions.archiveQuestAction('restore-quest');storage.setItem('lifequest-import-journal-v1','{broken');const before=JSON.stringify([...values]);
 await assert.rejects(actions.restoreQuestAction('restore-quest'),/journal/);await assert.rejects(actions.archiveQuestAction('restore-quest'),/journal/);assert.equal(JSON.stringify([...values]),before);
});
test.beforeEach(()=>{values.clear();storage.failKey=null;});
test('Levels recalculated from all existing XP without changing the saved total',()=>{
 const c={version:1,baselineXP:300,baselineLevel:2,stability:100,lastPenaltyDay:'',penaltyDays:[],initializedAt:today()};
 assert.equal(core.getHunterProgress(450,c).level,3);
 assert.equal(core.getHunterProgress(450,c).current,25);
 assert.equal(core.getHunterProgress(460,c).current,35);
 assert.equal(core.getHunterProgress(525,c).level,3);
});
test('Streak rewards exclude artificial focus/boss completions',()=>{
 const a=event('1');a.questId='lifequest:activity:focus:xyz';
 assert.equal(core.completionDays([a]).length,0);
 assert.equal(core.bonusForStreak(7),1.1);
 assert.equal(core.bonusForStreak(30),1.25);
 assert.equal(core.stabilityMultiplier(49),1);
});
test('Invalid JSON does not reset account',()=>{
 storage.setItem(q.SYSTEM_KEY,'{invalid');
 assert.throws(()=>q.loadState(),/Sauvegarde LifeQuest illisible/);
 assert.equal(storage.getItem(q.SYSTEM_KEY),'{invalid');
});
test('Duplicate rewards are refused on repeat request',async()=>{
 storage.setItem(q.SYSTEM_KEY,JSON.stringify(state()));
 const a=await core.awardActivityXP('focus','session-1',20,'focus');
 const b=await core.awardActivityXP('focus','session-1',20,'focus');
 assert.equal(a.credited,true);assert.equal(b.credited,false);
 assert.equal(q.loadState().totalXP,470);
});
test('Malformed completion and duplicate quest periods rejected',()=>{
 const s=state();s.completions=[event('1'),event('2')];
 assert.equal(q.validState(s),false);
 s.completions=[{...event('1'),xpAwarded:Infinity}];
 assert.equal(q.validState(s),false);
});
test('Invalid state refuses saving without altering storage',()=>{
 storage.setItem(q.SYSTEM_KEY,JSON.stringify(state()));
 const invalid={...state(),totalXP:NaN};
 assert.throws(()=>q.saveState(invalid),/invalide/);
 assert.equal(q.loadState().totalXP,450);
});
test('Rank boundaries',()=>{
 const m=load('hunterMissions');
 assert.equal(m.rankForLevel(9),'E');assert.equal(m.rankForLevel(10),'D');assert.equal(m.rankForLevel(50),'S');
});

const lab=load('hunterLab');
test('Corrupt Lab data is preserved and cannot be mistaken for a new account',()=>{storage.setItem(lab.LAB_KEY,'{broken');assert.throws(()=>lab.readLab(),/illisible/);assert.equal(storage.getItem(lab.LAB_KEY),'{broken');});
test('Legacy invalid XP is rejected without resetting it',()=>{storage.setItem(q.LEGACY_KEY,JSON.stringify({totalXP:-1}));assert.throws(()=>q.loadState(),/invalide/);assert.equal(JSON.parse(storage.getItem(q.LEGACY_KEY)).totalXP,-1);});
test('Level curve is continuous at 0, 199, 200 and 425 XP',()=>{assert.equal(core.getHunterProgress(0).required,200);assert.equal(core.getHunterProgress(199).level,1);assert.equal(core.getHunterProgress(200).level,2);assert.equal(core.getHunterProgress(425).level,3);});
test('No stability penalties or reward reduction for rest days',async()=>{storage.setItem(q.SYSTEM_KEY,JSON.stringify(state()));storage.setItem(core.CORE_KEY,JSON.stringify({version:1,baselineXP:0,baselineLevel:1,stability:20,lastPenaltyDay:'2026-10-01',penaltyDays:['2026-10-01'],initializedAt:today()}));assert.equal((await core.applyDailyStability()).stability,100);assert.equal(core.rewardMultiplier(0,20),1);assert.equal(core.getCoreSettings(450).penaltyDays.length,1);});
test('Malformed quest fields are rejected',()=>{const s=state();s.quests=[{id:'q',title:'test',description:42,xp:50,attribute:'focus',difficulty:'BAD',frequency:'daily',createdAt:today()}];assert.equal(q.validState(s),false);});
test('Incomplete import is refused before replacing data',async()=>{storage.setItem(q.SYSTEM_KEY,JSON.stringify(state()));await assert.rejects(()=>core.importLifeQuest({format:'lifequest-backup',version:1,exportedAt:today(),records:{[q.SYSTEM_KEY]:JSON.stringify({...state(),totalXP:0})}}),/incomplète/);assert.equal(q.loadState().totalXP,450);});
test('Export and restore include cinematic and transition records',async()=>{storage.setItem(q.SYSTEM_KEY,JSON.stringify(state()));storage.setItem('lifequest-cinematic-seen-v1:local-player:5','1');storage.setItem('lifequest-hunter-transition-v1','5');const backup=core.exportLifeQuest();storage.removeItem('lifequest-cinematic-seen-v1:local-player:5');await core.importLifeQuest(backup);assert.equal(storage.getItem('lifequest-cinematic-seen-v1:local-player:5'),'1');assert.equal(q.loadState().totalXP,450);});
test('Imported URL schemes are checked, not just form values',()=>{const data=lab.readLab();data.resources=[{id:'r',title:'test',notes:'',topic:'test',url:'javascript:alert(1)',mastered:false,createdAt:today()}];assert.equal(lab.validLab(data),false);});

const actions=load('questActions'),missions=load('hunterMissions'),activities=load('activityRewards');
const draft=()=>({title:'Lire',description:'Dix pages',frequency:'daily',attribute:'knowledge',difficulty:'NORMAL',xp:50,arcId:'',targetDate:''});
test('A failed legacy mirror does not report failure after a primary commit',()=>{storage.failKey=q.LEGACY_KEY;q.saveState(state());assert.equal(q.loadState().totalXP,450);});
test('Concurrent completions reward the same quest once',async()=>{const created=await actions.createQuestAction(draft());const id=created.quests[0].id;const results=await Promise.all([actions.completeQuestAction(id),actions.completeQuestAction(id)]);assert.equal(results.filter(Boolean).length,1);assert.equal(q.loadState().totalXP,50);assert.equal(q.loadState().completions.length,1);});
test('Concurrent creations keep both quests',async()=>{await Promise.all([actions.createQuestAction(draft()),actions.createQuestAction({...draft(),title:'Sport'})]);assert.equal(q.loadState().quests.length,2);});
test('Frequency changes wait for the next non-overlapping period',async()=>{const created=await actions.createQuestAction(draft());const id=created.quests[0].id;await actions.completeQuestAction(id);await actions.updateQuestAction(id,{...draft(),frequency:'weekly'});assert.equal(await actions.completeQuestAction(id),null);assert.equal(q.loadState().completions.length,1);});
test('Historical titles remain after editing the quest',async()=>{const created=await actions.createQuestAction(draft());const id=created.quests[0].id;await actions.completeQuestAction(id);await actions.updateQuestAction(id,{...draft(),title:'Autre titre'});assert.equal(q.loadState().completions[0].questTitle,'Lire');});
test('Focus session retry credits EXP once and keeps one session',async()=>{const session={id:'focus-1',date:today(),minutes:25,label:'Test'};storage.setItem('lifequest-hunter-timer-v1',JSON.stringify({mode:'focus',secondsLeft:1500,runningUntil:Date.now()-1,label:'Test',sessionId:session.id}));storage.failKey=q.SYSTEM_KEY;await assert.rejects(()=>activities.finishFocusSession(session));assert.equal(lab.readLab().sessions[0].rewardStatus,'pending');await activities.finishFocusSession(session);await activities.finishFocusSession(session);assert.equal(lab.readLab().sessions.length,1);assert.equal(lab.readLab().sessions[0].rewardStatus,'credited');assert.equal(q.loadState().totalXP,20);});
test('Boss completion survives a failed reward and can be reclaimed once',async()=>{missions.saveExtra({version:1,bosses:[{id:'boss-1',title:'Test',objective:'Une action',target:1,current:0,xp:25,createdAt:today()}],events:[]});storage.failKey=q.SYSTEM_KEY;await assert.rejects(()=>activities.progressBoss('boss-1'));assert.equal(missions.loadExtra().bosses[0].rewardStatus,'pending');await activities.claimBossReward('boss-1');await activities.claimBossReward('boss-1');assert.equal(q.loadState().totalXP,25);assert.equal(missions.loadExtra().bosses[0].rewardStatus,'credited');});
test('Restore rejects invalid Core before any writes',async()=>{q.saveState(state());const backup=core.exportLifeQuest();backup.records[core.CORE_KEY]=JSON.stringify({version:1,baselineXP:-1,baselineLevel:1,stability:100,lastPenaltyDay:'',penaltyDays:[],initializedAt:today()});await assert.rejects(()=>core.importLifeQuest(backup),/Core invalide/);assert.equal(q.loadState().totalXP,450);});
test('Restore rolls back when a storage write fails',async()=>{q.saveState(state());const backup=core.exportLifeQuest();backup.records[q.SYSTEM_KEY]=JSON.stringify({...state(),totalXP:0});storage.failKey=lab.LAB_KEY;backup.records[lab.LAB_KEY]=JSON.stringify(lab.readLab());await assert.rejects(()=>core.importLifeQuest(backup),/restaurées/);assert.equal(q.loadState().totalXP,450);});
test('Mind map cycles and duplicate journal dates are rejected',()=>{const data=lab.readLab();data.nodes=[{id:'n',title:'test',parentId:'n',x:0,y:0}];assert.equal(lab.validLab(data),false);});

test('Array values cannot impersonate enum strings in an imported quest',()=>{const s=state();s.quests=[{id:'q',title:'test',description:'',xp:50,attribute:'focus',difficulty:'NORMAL',frequency:['daily'],createdAt:today()}];assert.equal(q.validState(s),false);});
test('Impossible calendar dates are refused',()=>{assert.equal(load('validation').timestamp('2026-02-30T12:00:00Z'),false);});
test('Stored custom rewards survive title-only edits',async()=>{const s=state();s.quests=[{id:'q',title:'test',description:'',xp:120,attribute:'knowledge',difficulty:'NORMAL',frequency:'daily',createdAt:today()}];q.saveState(s);await actions.updateQuestAction('q',{...draft(),title:'Renommée'});assert.equal(q.loadState().quests[0].xp,120);});

test('Invalid periods and history greater than total EXP are rejected',()=>{const s=state();s.quests=[{id:'quest-1',title:'test',description:'',xp:50,attribute:'focus',difficulty:'NORMAL',frequency:'daily',createdAt:today()}];s.completions=[event('c','2026-99')];assert.equal(q.validState(s),false);s.completions=[event('c')];s.totalXP=0;assert.equal(q.validState(s),false);});

test('Concurrent edits refuse a stale revision instead of overwriting a draft',async()=>{const created=await actions.createQuestAction(draft());const id=created.quests[0].id;const results=await Promise.allSettled([actions.updateQuestAction(id,{...draft(),title:'Première',expectedRevision:0}),actions.updateQuestAction(id,{...draft(),title:'Deuxième',expectedRevision:0})]);assert.equal(results.filter(x=>x.status==='rejected').length,1);assert.equal(q.loadState().quests[0].title,'Première');});

test('Restore between credit and status update never creates a falsely paid Boss',async()=>{q.saveState({...state(),totalXP:0});missions.saveExtra({version:1,bosses:[{id:'boss-restore',title:'test',objective:'test',current:1,target:1,xp:25,createdAt:today(),completedAt:today(),rewardStatus:'pending'}],events:[]});const backup=core.exportLifeQuest();const results=await Promise.allSettled([activities.claimBossReward('boss-restore'),core.importLifeQuest(backup)]);assert.equal(results[0].status,'rejected');assert.equal(q.loadState().totalXP,0);assert.equal(missions.loadExtra().bosses[0].rewardStatus,'pending');await activities.claimBossReward('boss-restore');assert.equal(q.loadState().totalXP,25);});


test('An activity cannot be rewarded again under a different period',()=>{
 for(const source of ['focus','boss']){
  const s=state();
  const activity={...event('activity-1','once'),questId:'lifequest:activity:'+source+':same-id'};
  s.completions=[activity,{...activity,id:'activity-2',period:'2026-10-11'}];
  assert.equal(q.validState(s),false,source+' must have only one lifetime reward');
 }
});

test('Loading a recurring activity receipt refuses it without overwriting the save',()=>{
 const s=state();
 s.completions=[{...event('activity','2026-10-11'),questId:'lifequest:activity:focus:session'}];
 const raw=JSON.stringify(s);storage.setItem(q.SYSTEM_KEY,raw);
 assert.throws(()=>q.loadState(),/invalide/);
 assert.equal(storage.getItem(q.SYSTEM_KEY),raw);
});

test('Importing duplicate activity rewards leaves every existing record untouched',async()=>{
 q.saveState(state());
 storage.setItem(lab.LAB_KEY,JSON.stringify(lab.readLab()));
 const before=new Map(values);
 const backup=core.exportLifeQuest();
 const s=state();
 const activity={...event('boss-1','once'),questId:'lifequest:activity:boss:same-boss',attribute:'discipline'};
 s.completions=[activity,{...activity,id:'boss-2',period:'2026-10-11'}];
 backup.records[q.SYSTEM_KEY]=JSON.stringify(s);
 await assert.rejects(()=>core.importLifeQuest(backup),/invalides/);
 assert.deepEqual(values,before);
});

test('Valid activity receipts and recurring quest history retain XP, levels and attributes',async()=>{
 const s=state();
 s.quests=[{id:'quest-1',title:'Read',description:'',xp:30,attribute:'focus',difficulty:'EASY',frequency:'daily',createdAt:today()}];
 s.completions=[event('day-1','2026-10-10'),event('day-2','2026-10-11'),
  {...event('focus','once'),questId:'lifequest:activity:focus:session',xpAwarded:20},
  {...event('boss','once'),questId:'lifequest:activity:boss:boss',attribute:'discipline',xpAwarded:25}];
 q.saveState(s);const raw=storage.getItem(q.SYSTEM_KEY);
 await core.importLifeQuest(core.exportLifeQuest());
 assert.equal(storage.getItem(q.SYSTEM_KEY),raw);
 assert.equal(q.loadState().totalXP,450);
 assert.equal(core.getHunterProgress(q.loadState().totalXP).level,3);
 const totals=core.attributeXP(q.loadState().completions);
 assert.equal(totals.focus,80);assert.equal(totals.discipline,25);
});

test('Concurrent activity requests still award each Focus or Boss only once',async()=>{
 q.saveState(state());
 for(const source of ['focus','boss']){
  const attribute=source==='focus'?'focus':'discipline';
  const results=await Promise.all([core.awardActivityXP(source,'same-id',20,attribute),core.awardActivityXP(source,'same-id',20,attribute)]);
  assert.equal(results.filter(r=>r.credited).length,1);
 }
 assert.equal(q.loadState().totalXP,490);
 assert.equal(q.loadState().completions.length,2);
});


test('Before its first reward a quest can change to any frequency and be completed immediately',async()=>{
 const frequencies=['daily','weekly','monthly','once'];
 let completed=0;
 for(const from of frequencies){
  for(const to of frequencies){
   if(from===to)continue;
   const created=await actions.createQuestAction({...draft(),frequency:from});
   const original=created.quests.at(-1);
   await actions.updateQuestAction(original.id,{...draft(),frequency:to,expectedRevision:0});
   const saved=q.loadState().quests.find(x=>x.id===original.id);
   assert.equal(saved.frequency,to,from+' to '+to);
   assert.equal(saved.availableAfter,undefined,from+' to '+to+' must not add a cooldown');
   assert.equal(saved.createdAt,original.createdAt);
   assert.equal(saved.revision,1);
   const reward=await actions.completeQuestAction(saved.id);
   assert.equal(reward?.xp,50,from+' to '+to+' must be completable');
   assert.equal(await actions.completeQuestAction(saved.id),null);
   completed++;
   assert.equal(q.loadState().totalXP,completed*50);
   assert.equal(q.loadState().completions.length,completed);
  }
 }
});

test('Changing a rewarded quest frequency repeatedly keeps the anti-double-reward cooldown',async()=>{
 const created=await actions.createQuestAction(draft());
 const id=created.quests[0].id;
 await actions.completeQuestAction(id);
 const receipt=JSON.stringify(q.loadState().completions);
 await actions.updateQuestAction(id,{...draft(),frequency:'weekly'});
 const first=q.loadState().quests[0].availableAfter;
 assert.ok(first>q.localDate(new Date()));
 await actions.updateQuestAction(id,{...draft(),frequency:'monthly'});
 const second=q.loadState().quests[0].availableAfter;
 assert.ok(second>=first);
 await actions.updateQuestAction(id,{...draft(),frequency:'daily'});
 assert.ok(q.loadState().quests[0].availableAfter>=second);
 assert.equal(await actions.completeQuestAction(id),null);
 assert.equal(q.loadState().totalXP,50);
 assert.equal(JSON.stringify(q.loadState().completions),receipt);
});

test('An unrewarded quest changed to a scheduled special quest still waits for its target date',async()=>{
 const future=new Date();future.setDate(future.getDate()+2);
 const targetDate=q.localDate(future);
 const created=await actions.createQuestAction(draft());
 const id=created.quests[0].id;
 await actions.updateQuestAction(id,{...draft(),frequency:'once',targetDate});
 const saved=q.loadState().quests[0];
 assert.equal(saved.availableAfter,undefined);
 assert.equal(saved.targetDate,targetDate);
 assert.equal(q.isDue(saved,new Date()),false);
 assert.equal(q.isDue(saved,future),true);
 assert.equal(await actions.completeQuestAction(id),null);
 assert.equal(q.loadState().totalXP,0);
 assert.equal(q.loadState().completions.length,0);
});

test('An unrewarded frequency edit round-trips through backup without changing existing progress',async()=>{
 const s=state();
 s.quests=[{id:'quest-custom',title:'Read',description:'Ten pages',xp:120,attribute:'knowledge',difficulty:'NORMAL',frequency:'daily',createdAt:today()}];
 q.saveState(s);
 await actions.updateQuestAction('quest-custom',{...draft(),frequency:'monthly',title:'Read'});
 const saved=q.loadState();
 assert.equal(saved.totalXP,450);
 assert.equal(saved.quests[0].xp,120);
 assert.equal(saved.quests[0].availableAfter,undefined);
 const raw=storage.getItem(q.SYSTEM_KEY);
 await core.importLifeQuest(core.exportLifeQuest());
 assert.equal(storage.getItem(q.SYSTEM_KEY),raw);
 assert.equal((await actions.completeQuestAction('quest-custom'))?.xp,120);
 assert.equal(q.loadState().totalXP,570);
});

test('A failed unrewarded frequency edit preserves the original saved quest',async()=>{
 const created=await actions.createQuestAction(draft());
 const raw=storage.getItem(q.SYSTEM_KEY);
 storage.failKey=q.SYSTEM_KEY;
 await assert.rejects(()=>actions.updateQuestAction(created.quests[0].id,{...draft(),frequency:'monthly'}),/Quota/);
 assert.equal(storage.getItem(q.SYSTEM_KEY),raw);
 assert.equal(q.loadState().quests[0].frequency,'daily');
 assert.equal((await actions.completeQuestAction(created.quests[0].id))?.xp,50);
});

test('A completed special quest still cannot become recurring',async()=>{
 const created=await actions.createQuestAction({...draft(),frequency:'once'});
 const id=created.quests[0].id;
 await actions.completeQuestAction(id);
 const before=storage.getItem(q.SYSTEM_KEY);
 await assert.rejects(()=>actions.updateQuestAction(id,{...draft(),frequency:'daily'}),/terminée/);
 assert.equal(storage.getItem(q.SYSTEM_KEY),before);
 assert.equal(await actions.completeQuestAction(id),null);
});


test('An unrewarded frequency edit preserves an existing availability restriction',async()=>{
 const future=new Date();future.setDate(future.getDate()+3);
 const availableAfter=q.localDate(future);
 const created=await actions.createQuestAction(draft());
 const id=created.quests[0].id;
 await actions.changeQuests(s=>({...s,quests:s.quests.map(x=>({...x,availableAfter}))}));
 await actions.updateQuestAction(id,{...draft(),frequency:'monthly'});
 const saved=q.loadState().quests[0];
 assert.equal(saved.availableAfter,availableAfter);
 assert.equal(q.isDue(saved,new Date()),false);
 assert.equal(q.isDue(saved,future),true);
 assert.equal(await actions.completeQuestAction(id),null);
 assert.equal(q.loadState().totalXP,0);
});


const achievements=load('achievements');
function achievementHistory(count,disciplineCount=count){
 const s=state();
 s.quests=[{id:'quest-1',title:'Test',description:'',xp:30,attribute:'discipline',difficulty:'EASY',frequency:'daily',createdAt:today(),archived:true}];
 s.completions=Array.from({length:count},(_,i)=>{
  const day=new Date(2020,0,1+i,12);
  return {...event('history-'+i,q.localDate(day)),completedAt:day.toISOString(),attribute:i<disciplineCount?'discipline':'knowledge'};
 });
 s.totalXP=count*30;
 return s;
}

test('An empty account has no titles and synchronizing does not create a save',async()=>{
 assert.equal(achievements.unlockAchievements(state(),1,today()).achievements,undefined);
 await core.syncAchievements();
 assert.equal(storage.getItem(q.SYSTEM_KEY),null);
});

test('A first quest and its unique title are credited atomically even with concurrent calls',async()=>{
 const created=await actions.createQuestAction(draft());const id=created.quests[0].id;
 await Promise.all([actions.completeQuestAction(id),actions.completeQuestAction(id),core.syncAchievements()]);
 const saved=q.loadState();assert.equal(saved.totalXP,50);
 assert.equal(saved.achievements.filter(a=>a.id==='first-clear').length,1);
 const raw=storage.getItem(q.SYSTEM_KEY),date=saved.achievements[0].unlockedAt;
 await Promise.all([core.syncAchievements(),core.syncAchievements()]);
 assert.equal(storage.getItem(q.SYSTEM_KEY),raw);
 assert.equal(q.loadState().achievements[0].unlockedAt,date);
});

test('Quest and discipline title boundaries use recorded quest attributes',()=>{
 let s=achievementHistory(99,29);
 let result=achievements.unlockAchievements(s,1,today());
 assert.equal(result.achievements.some(a=>a.id==='quest-veteran'),false);
 assert.equal(result.achievements.some(a=>a.id==='discipline-master'),false);
 s=achievementHistory(100,30);
 result=achievements.unlockAchievements(s,1,today());
 assert.equal(result.achievements.some(a=>a.id==='quest-veteran'),true);
 assert.equal(result.achievements.some(a=>a.id==='discipline-master'),true);
});

test('Focus and Boss receipts never unlock quest, discipline or streak titles',async()=>{
 const s=achievementHistory(100);s.quests=[];
 s.completions=s.completions.map((c,i)=>({...c,questId:'lifequest:activity:'+(i%2?'boss':'focus')+':'+i,period:'once'}));
 q.saveState(s);await core.syncAchievements();
 const ids=(q.loadState().achievements??[]).map(a=>a.id);
 assert.equal(ids.includes('first-clear'),false);assert.equal(ids.includes('quest-veteran'),false);
 assert.equal(ids.includes('discipline-master'),false);assert.equal(ids.includes('seven-day-streak'),false);
 assert.equal(ids.includes('rank-d-hunter'),true);
});

test('Rank title boundaries use the existing Hunter level formula',async()=>{
 for(const [level,id] of [[10,'rank-d-hunter'],[50,'rank-s-hunter']]){
  const threshold=Array.from({length:level-1},(_,i)=>core.levelCost(i+1)).reduce((sum,n)=>sum+n,0);
  const before=achievements.unlockAchievements({...state(),totalXP:threshold-1},core.getHunterProgress(threshold-1).level,today());
  assert.equal((before.achievements??[]).some(a=>a.id===id),false);
  q.saveState({...state(),totalXP:threshold});await core.syncAchievements();
  assert.equal(q.loadState().achievements.some(a=>a.id===id),true);
 }
});

test('A historical seven-day streak is permanent and repeated days cannot inflate it',async()=>{
 let s=achievementHistory(6);q.saveState(s);await core.syncAchievements();
 assert.equal(q.loadState().achievements.some(a=>a.id==='seven-day-streak'),false);
 s=achievementHistory(7);s.completions[6].completedAt=s.completions[5].completedAt;
 assert.equal(achievements.unlockAchievements(s,1,today()).achievements.some(a=>a.id==='seven-day-streak'),false);
 s=achievementHistory(7);q.saveState(s);await core.syncAchievements();
 const saved=q.loadState(),unlock=saved.achievements.find(a=>a.id==='seven-day-streak');
 assert.ok(unlock);assert.equal(core.streakDays(core.completionDays(saved.completions)),0);
 await actions.changeQuests(current=>({...current,quests:current.quests.map(x=>({...x,title:'Renamed',attribute:'energy'}))}));
 await core.syncAchievements();
 assert.equal(q.loadState().achievements.find(a=>a.id==='seven-day-streak').unlockedAt,unlock.unlockedAt);
});

test('A streak with a gap never unlocks the seven-day title',()=>{
 const s=achievementHistory(7);const day=new Date(2020,0,9,12);
 s.completions[6].completedAt=day.toISOString();
 const result=achievements.unlockAchievements(s,1,today());
 assert.equal(result.achievements.some(a=>a.id==='seven-day-streak'),false);
});

test('Invalid achievement records are refused on save and import without overwriting data',async()=>{
 q.saveState(state());const raw=storage.getItem(q.SYSTEM_KEY);
 const valid={id:'first-clear',unlockedAt:today()};
 for(const unlocks of [[valid,valid],[{...valid,id:'unknown'}],[{...valid,unlockedAt:'2026-02-30T12:00:00Z'}],null]){
  const invalid={...state(),achievements:unlocks};assert.equal(q.validState(invalid),false);
  assert.throws(()=>q.saveState(invalid),/invalide/);
  const backup=core.exportLifeQuest();backup.records[q.SYSTEM_KEY]=JSON.stringify(invalid);
  await assert.rejects(()=>core.importLifeQuest(backup),/invalides/);
  assert.equal(storage.getItem(q.SYSTEM_KEY),raw);
 }
});

test('Achievement records round-trip through backup and old accounts can be backfilled',async()=>{
 q.saveState(achievementHistory(7));const oldBackup=core.exportLifeQuest();
 assert.equal(q.loadState().achievements,undefined);
 await core.syncAchievements();const raw=storage.getItem(q.SYSTEM_KEY),backup=core.exportLifeQuest();
 q.saveState(state());await core.importLifeQuest(backup);assert.equal(storage.getItem(q.SYSTEM_KEY),raw);
 await core.importLifeQuest(oldBackup);assert.equal(q.loadState().achievements,undefined);
 await core.syncAchievements();assert.equal(q.loadState().achievements.some(a=>a.id==='seven-day-streak'),true);
 assert.equal(q.loadState().totalXP,210);
});

test('A failed quest credit cannot persist a title independently of its XP',async()=>{
 const created=await actions.createQuestAction(draft());const raw=storage.getItem(q.SYSTEM_KEY);
 storage.failKey=q.SYSTEM_KEY;
 await assert.rejects(()=>actions.completeQuestAction(created.quests[0].id),/Quota/);
 assert.equal(storage.getItem(q.SYSTEM_KEY),raw);
 assert.equal(q.loadState().achievements,undefined);
 await actions.completeQuestAction(created.quests[0].id);
 assert.equal(q.loadState().achievements.length,1);assert.equal(q.loadState().totalXP,50);
});

test('Backfill failures preserve old saves and retry without changing earned XP',async()=>{
 q.saveState(achievementHistory(7));const raw=storage.getItem(q.SYSTEM_KEY);
 storage.failKey=q.SYSTEM_KEY;await assert.rejects(()=>core.syncAchievements(),/Quota/);
 assert.equal(storage.getItem(q.SYSTEM_KEY),raw);
 await core.syncAchievements();assert.equal(q.loadState().totalXP,210);
 const saved=storage.getItem(q.SYSTEM_KEY);await core.syncAchievements();assert.equal(storage.getItem(q.SYSTEM_KEY),saved);
 storage.setItem(q.SYSTEM_KEY,'{broken');await assert.rejects(()=>core.syncAchievements(),/illisible/);
 assert.equal(storage.getItem(q.SYSTEM_KEY),'{broken');
});


test('An activity that reaches rank D saves its title with the same XP receipt',async()=>{
 const threshold=Array.from({length:9},(_,i)=>core.levelCost(i+1)).reduce((sum,n)=>sum+n,0);
 q.saveState({...state(),totalXP:threshold-20});
 const reward=await core.awardActivityXP('focus','rank-session',20,'focus');
 assert.equal(reward.credited,true);assert.equal(reward.xp,20);
 const saved=q.loadState();assert.equal(saved.totalXP,threshold);
 assert.equal(saved.completions.length,1);
 assert.equal(saved.achievements.length,1);assert.equal(saved.achievements[0].id,'rank-d-hunter');
 assert.equal(saved.achievements[0].unlockedAt,saved.completions[0].completedAt);
 const raw=storage.getItem(q.SYSTEM_KEY);await core.awardActivityXP('focus','rank-session',20,'focus');
 assert.equal(storage.getItem(q.SYSTEM_KEY),raw);
});


const battleDraft=()=>({title:'Project Boss',subObjectives:[{title:'Build',weight:3},{title:'Review',weight:1}]});
test('Creating a weighted Boss stores zero progress and no XP',async()=>{
 const created=await missions.createBossBattle(battleDraft()),boss=created.bosses[0];
 assert.equal(boss.target,4);assert.equal(boss.current,0);assert.equal(boss.xp,40);
 assert.equal(boss.subObjectives.length,2);assert.notEqual(boss.subObjectives[0].id,boss.subObjectives[1].id);
 assert.equal(missions.bossProgress(boss).percent,0);assert.equal(boss.completedAt,undefined);
 assert.equal(q.loadState().totalXP,0);
});

test('An incomplete weighted Boss gives 75 percent and cannot claim its reward',async()=>{
 const boss=(await missions.createBossBattle(battleDraft())).bosses[0];
 assert.equal(await activities.progressBoss(boss.id,boss.subObjectives[0].id),null);
 const saved=missions.loadExtra().bosses[0];
 assert.equal(saved.current,3);assert.equal(missions.bossProgress(saved).percent,75);
 assert.equal(saved.completedAt,undefined);assert.equal(saved.rewardStatus,undefined);
 await assert.rejects(()=>activities.claimBossReward(boss.id),/pas terminé/);
 await activities.progressBoss(boss.id,boss.subObjectives[0].id);
 assert.equal(missions.loadExtra().bosses[0].current,3);
 assert.equal(missions.loadExtra().events.length,0);assert.equal(q.loadState().totalXP,0);
});

test('Completing all weighted goals grants one final reward and one event',async()=>{
 const boss=(await missions.createBossBattle(battleDraft())).bosses[0];
 await activities.progressBoss(boss.id,boss.subObjectives[0].id);
 const reward=await activities.progressBoss(boss.id,boss.subObjectives[1].id);
 assert.equal(reward.credited,true);assert.equal(reward.xp,40);
 let saved=missions.loadExtra().bosses[0];
 assert.equal(missions.bossProgress(saved).percent,100);assert.ok(saved.completedAt);
 assert.equal(saved.rewardStatus,'credited');
 const date=saved.completedAt;
 await Promise.all([activities.progressBoss(boss.id,boss.subObjectives[1].id),activities.claimBossReward(boss.id)]);
 saved=missions.loadExtra().bosses[0];assert.equal(saved.completedAt,date);
 assert.equal(missions.loadExtra().events.length,1);
 assert.equal(q.loadState().totalXP,40);assert.equal(q.loadState().completions.length,1);
});

test('Concurrent weighted goal validations retain both goals and credit only once',async()=>{
 const boss=(await missions.createBossBattle(battleDraft())).bosses[0];
 await Promise.all([activities.progressBoss(boss.id,boss.subObjectives[0].id),activities.progressBoss(boss.id,boss.subObjectives[1].id),activities.progressBoss(boss.id,boss.subObjectives[0].id)]);
 const saved=missions.loadExtra().bosses[0];
 assert.equal(saved.current,4);assert.equal(saved.subObjectives.every(g=>g.completed),true);
 assert.equal(saved.rewardStatus,'credited');assert.equal(missions.loadExtra().events.length,1);
 assert.equal(q.loadState().totalXP,40);assert.equal(q.loadState().completions.length,1);
});

test('Failed final weighted reward is recoverable without losing completed goals',async()=>{
 const boss=(await missions.createBossBattle(battleDraft())).bosses[0];
 await activities.progressBoss(boss.id,boss.subObjectives[0].id);
 storage.failKey=q.SYSTEM_KEY;
 await assert.rejects(()=>activities.progressBoss(boss.id,boss.subObjectives[1].id),/Quota/);
 assert.equal(missions.loadExtra().bosses[0].rewardStatus,'pending');
 assert.equal(missions.bossProgress(missions.loadExtra().bosses[0]).percent,100);
 assert.equal(q.loadState().totalXP,0);
 await activities.claimBossReward(boss.id);await activities.claimBossReward(boss.id);
 assert.equal(q.loadState().totalXP,40);assert.equal(missions.loadExtra().events.length,1);
});

test('Weighted Boss creation refuses empty objectives, invalid weights and excessive totals',async()=>{
 for(const subObjectives of [[],[{title:'',weight:1}],[{title:'Test',weight:0}],[{title:'Test',weight:-1}],[{title:'Test',weight:1.5}],[{title:'Test',weight:NaN}],[{title:'A',weight:700},{title:'B',weight:700}]]){
  const before=new Map(values);
  await assert.rejects(async()=>missions.createBossBattle({title:'Boss',subObjectives}));
  assert.deepEqual(values,before);
 }
});

test('Weighted Boss imports reject duplicate IDs and inconsistent progress without replacing data',async()=>{
 const boss=(await missions.createBossBattle(battleDraft())).bosses[0];
 const before=new Map(values);
 const cases=[{...boss,current:1},{...boss,target:5},{...boss,completedAt:today()},
  {...boss,subObjectives:[]},{...boss,subObjectives:[boss.subObjectives[0],boss.subObjectives[0]]},
  {...boss,subObjectives:boss.subObjectives.map(g=>({...g,weight:0}))},
  {...boss,current:4,subObjectives:boss.subObjectives.map(g=>({...g,completed:true}))}];
 for(const invalid of cases){
  const extra={version:1,bosses:[invalid],events:[]};assert.equal(missions.validExtra(extra),false);
  const backup=core.exportLifeQuest();backup.records[missions.EXTRA_KEY]=JSON.stringify(extra);
  await assert.rejects(()=>core.importLifeQuest(backup),/Operations invalide/);
  assert.deepEqual(values,before);
 }
});

test('Incomplete weighted Boss progression round-trips through the existing backup',async()=>{
 const boss=(await missions.createBossBattle(battleDraft())).bosses[0];
 await activities.progressBoss(boss.id,boss.subObjectives[0].id);
 const raw=storage.getItem(missions.EXTRA_KEY),backup=core.exportLifeQuest();
 await activities.progressBoss(boss.id,boss.subObjectives[1].id);
 await core.importLifeQuest(backup);assert.equal(storage.getItem(missions.EXTRA_KEY),raw);
 assert.equal(missions.bossProgress(missions.loadExtra().bosses[0]).percent,75);
 assert.equal(q.loadState().totalXP,0);
 await activities.progressBoss(boss.id,boss.subObjectives[1].id);assert.equal(q.loadState().totalXP,40);
});

test('Legacy Boss counters remain compatible and finish with the existing reward',async()=>{
 const legacy={id:'legacy',title:'Legacy',objective:'3 actions',target:3,current:1,xp:30,createdAt:today()};
 missions.saveExtra({version:1,bosses:[legacy],events:[]});
 const raw=storage.getItem(missions.EXTRA_KEY);missions.loadExtra();assert.equal(storage.getItem(missions.EXTRA_KEY),raw);
 await activities.progressBoss('legacy');assert.equal(q.loadState().totalXP,0);
 await activities.progressBoss('legacy');assert.equal(q.loadState().totalXP,30);
 assert.equal(missions.loadExtra().bosses[0].subObjectives,undefined);
});

test('A missing weighted sub-objective and a failed progress write preserve the Boss',async()=>{
 const boss=(await missions.createBossBattle(battleDraft())).bosses[0];const raw=storage.getItem(missions.EXTRA_KEY);
 await assert.rejects(()=>activities.progressBoss(boss.id),/Sous-objectif/);
 await assert.rejects(()=>activities.progressBoss(boss.id,'missing'),/Sous-objectif/);
 assert.equal(storage.getItem(missions.EXTRA_KEY),raw);
 storage.failKey=missions.EXTRA_KEY;
 await assert.rejects(()=>activities.progressBoss(boss.id,boss.subObjectives[0].id),/Quota/);
 assert.equal(storage.getItem(missions.EXTRA_KEY),raw);assert.equal(q.loadState().totalXP,0);
});


const legacyZeroBoss=()=>({id:'f03-zero',title:'Historical Boss',objective:'Done',target:1,current:1,xp:0,createdAt:today(),completedAt:today(),rewardStatus:'pending'});
function seedZeroBoss(boss=legacyZeroBoss()){q.saveState(state());missions.saveExtra({version:1,bosses:[boss],events:[]});return boss;}
test('F03 completed historical zero-XP Boss resolves without changing XP or receipts',async()=>{
 const boss=seedZeroBoss(),raw=storage.getItem(q.SYSTEM_KEY);
 assert.equal(missions.validExtra(missions.loadExtra()),true);
 const result=await activities.claimBossReward(boss.id);
 assert.equal(result.credited,false);assert.equal(result.xp,0);
 const saved=missions.loadExtra().bosses[0];assert.equal(saved.rewardStatus,'resolved_without_xp');assert.equal(saved.completedAt,boss.completedAt);
 assert.equal(storage.getItem(q.SYSTEM_KEY),raw);assert.equal(missions.loadExtra().events.length,0);
});
test('F03 repeated zero-XP resolution is a no-op even when another write would fail',async()=>{
 const boss=seedZeroBoss();await activities.claimBossReward(boss.id);const raw=storage.getItem(missions.EXTRA_KEY);
 storage.failKey=missions.EXTRA_KEY;await activities.claimBossReward(boss.id);
 assert.equal(storage.getItem(missions.EXTRA_KEY),raw);assert.equal(storage.failKey,missions.EXTRA_KEY);assert.equal(q.loadState().totalXP,450);
});
test('F03 concurrent zero-XP claims never create rewards or duplicate events',async()=>{
 const boss=seedZeroBoss();const results=await Promise.all([activities.claimBossReward(boss.id),activities.claimBossReward(boss.id)]);
 assert.ok(results.every(r=>!r.credited&&r.xp===0));assert.equal(missions.loadExtra().bosses[0].rewardStatus,'resolved_without_xp');assert.equal(q.loadState().completions.length,0);assert.equal(q.loadState().totalXP,450);
});
test('F03 old pending backup and new resolved backup remain readable across export/import',async()=>{
 const boss=seedZeroBoss();const old=core.exportLifeQuest();old.version=1;
 await core.importLifeQuest(old);assert.equal(missions.loadExtra().bosses[0].rewardStatus,'pending');
 await activities.claimBossReward(boss.id);const backup=core.exportLifeQuest(),raw=storage.getItem(missions.EXTRA_KEY);
 await core.importLifeQuest(old);await core.importLifeQuest(backup);
 assert.equal(storage.getItem(missions.EXTRA_KEY),raw);assert.equal(missions.loadExtra().bosses[0].rewardStatus,'resolved_without_xp');assert.equal(q.loadState().totalXP,450);
});
test('F03 resolved_without_xp is restricted to completed historical zero-XP Bosses',()=>{
 const boss={...legacyZeroBoss(),rewardStatus:'resolved_without_xp'};
 const valid=b=>missions.validExtra({version:1,bosses:[b],events:[]});
 assert.equal(valid(boss),true);assert.equal(valid({...boss,xp:25}),false);assert.equal(valid({...boss,completedAt:undefined}),false);assert.equal(valid({...boss,current:0}),false);
 assert.equal(valid({...boss,subObjectives:[{id:'goal',title:'Done',weight:1,completed:true}]}),false);
});
test('F03 an existing positive XP receipt is preserved and proves the historical credit',async()=>{
 const boss=seedZeroBoss();q.saveState({...state(),completions:[{...event('existing-credit','once'),questId:'lifequest:activity:boss:'+boss.id,xpAwarded:25,attribute:'discipline'}]});const raw=storage.getItem(q.SYSTEM_KEY);
 const result=await activities.claimBossReward(boss.id);assert.equal(result.credited,false);assert.equal(result.xp,0);assert.equal(missions.loadExtra().bosses[0].rewardStatus,'credited');
 await activities.claimBossReward(boss.id);assert.equal(storage.getItem(q.SYSTEM_KEY),raw);
});
test('F03 failed status write leaves pending data intact and permits retry',async()=>{
 const boss=seedZeroBoss(),extra=storage.getItem(missions.EXTRA_KEY),progress=storage.getItem(q.SYSTEM_KEY);
 storage.failKey=missions.EXTRA_KEY;await assert.rejects(()=>activities.claimBossReward(boss.id),/Quota/);
 assert.equal(storage.getItem(missions.EXTRA_KEY),extra);assert.equal(storage.getItem(q.SYSTEM_KEY),progress);
 await activities.claimBossReward(boss.id);assert.equal(missions.loadExtra().bosses[0].rewardStatus,'resolved_without_xp');
});
test('F03 incomplete or falsely credited historical Bosses are not resolved blindly',async()=>{
 const incomplete=seedZeroBoss({...legacyZeroBoss(),current:0,completedAt:undefined});await assert.rejects(()=>activities.claimBossReward(incomplete.id),/pas terminé/);
 const credited=seedZeroBoss({...legacyZeroBoss(),rewardStatus:'credited'}),raw=storage.getItem(missions.EXTRA_KEY);
 await assert.rejects(()=>activities.claimBossReward(credited.id));assert.equal(storage.getItem(missions.EXTRA_KEY),raw);assert.equal(q.loadState().totalXP,450);
});
test('F03 normal new Boss rewards remain positive and unique',async()=>{
 q.saveState(state());const boss=(await missions.createBossBattle(battleDraft())).bosses[0];assert.ok(boss.xp>=25);
 await activities.progressBoss(boss.id,boss.subObjectives[0].id);await activities.progressBoss(boss.id,boss.subObjectives[1].id);await activities.claimBossReward(boss.id);
 assert.equal(q.loadState().totalXP,490);assert.equal(q.loadState().completions.length,1);assert.equal(missions.loadExtra().bosses[0].rewardStatus,'credited');
});

// F04: validate the incoming account as a whole, before the first storage mutation.
const f04Boss=(changes={})=>({...legacyZeroBoss(),id:'f04-boss',xp:25,...changes});
const f04Session=(changes={})=>({id:'f04-focus',date:today(),minutes:25,label:'Focus audit',...changes});
const f04Receipt=(source,id,xp=25)=>({...event('f04-receipt-'+source,'once'),questId:core.CORE_ACTIVITY_PREFIX+source+':'+id,xpAwarded:xp,attribute:source==='boss'?'discipline':'focus'});
function f04Backup({bosses=[],sessions=[],receipts=[],totalXP=450,version=2,system=true}={}){
 const backup=core.exportLifeQuest();backup.version=version;
 backup.records[q.SYSTEM_KEY]=system?JSON.stringify({...state(),totalXP,completions:receipts}):null;
 backup.records[missions.EXTRA_KEY]=JSON.stringify({version:1,bosses,events:[]});
 backup.records[lab.LAB_KEY]=JSON.stringify({...lab.readLab(),sessions});return backup;
}
async function f04Refused(backup,pattern,preserveAccount=false){
 if(!preserveAccount)q.saveState(state());storage.setItem('lifequest-cinematic-seen-v1:local-player:5','1');
 const before=[...values.entries()];let writes=0;
 const set=storage.setItem,remove=storage.removeItem;
 storage.setItem=(...args)=>{writes++;return set(...args)};storage.removeItem=(...args)=>{writes++;return remove(...args)};
 try{await assert.rejects(()=>core.importLifeQuest(backup),pattern);}finally{storage.setItem=set;storage.removeItem=remove;}
 assert.equal(writes,0,'refused import must not write or roll back');assert.deepEqual([...values.entries()],before);
}
test('F04 credited Boss without a positive matching receipt is refused before all writes',async()=>{
 for(const system of [true,false])await f04Refused(f04Backup({bosses:[f04Boss({rewardStatus:'credited'})],system}),/Hunter Operations \/ Boss f04-boss.*sans reçu XP positif/);
});
test('F04 credited Focus without its receipt is refused without altering any existing module',async()=>{
 await f04Refused(f04Backup({sessions:[f04Session({rewardStatus:'credited'})]}),/Hunter Lab \/ Focus f04-focus.*sans reçu XP positif/);
});
test('F04 zero XP, wrong activity ID or wrong source cannot prove credited status',async()=>{
 for(const receipts of [[f04Receipt('boss','f04-boss',0)],[f04Receipt('boss','other')],[f04Receipt('focus','f04-boss')]])await f04Refused(f04Backup({bosses:[f04Boss({rewardStatus:'credited'})],receipts}),/Boss f04-boss.*sans reçu XP positif/);
 await f04Refused(f04Backup({sessions:[f04Session({rewardStatus:'credited'})],receipts:[f04Receipt('focus','f04-focus',0)]}),/Focus f04-focus.*sans reçu XP positif/);
});
test('F04 reports both inconsistent modules and their IDs in one diagnostic',async()=>{
 const backup=f04Backup({bosses:[f04Boss({rewardStatus:'credited'})],sessions:[f04Session({rewardStatus:'credited'})]});
 await f04Refused(backup,error=>error.message.includes('Boss f04-boss')&&error.message.includes('Focus f04-focus'));
});
test('F04 valid credited Boss and Focus import byte-identical XP histories in v1 and v2',async()=>{
 for(const version of [1,2]){
  const backup=f04Backup({version,bosses:[f04Boss({rewardStatus:'credited'})],sessions:[f04Session({rewardStatus:'credited'})],receipts:[f04Receipt('boss','f04-boss',31),f04Receipt('focus','f04-focus',22)]});
  await core.importLifeQuest(backup);for(const [key,raw] of Object.entries(backup.records))assert.equal(storage.getItem(key),raw);
 }
});
test('F04 pending rewards with an existing receipt are valid interrupted updates and retry once',async()=>{
 const boss=f04Boss(),session=f04Session({rewardStatus:'pending'});
 const backup=f04Backup({bosses:[boss],sessions:[session],receipts:[f04Receipt('boss',boss.id),f04Receipt('focus',session.id,20)]});
 await core.importLifeQuest(backup);assert.equal(missions.loadExtra().bosses[0].rewardStatus,'pending');assert.equal(lab.readLab().sessions[0].rewardStatus,'pending');
 const raw=storage.getItem(q.SYSTEM_KEY);await activities.claimBossReward(boss.id);await activities.finishFocusSession(session);
 assert.equal(storage.getItem(q.SYSTEM_KEY),raw);assert.equal(missions.loadExtra().bosses[0].rewardStatus,'credited');assert.equal(lab.readLab().sessions[0].rewardStatus,'credited');
});
test('F04 pending rewards without receipts remain valid and recoverable',async()=>{
 const boss=f04Boss(),session=f04Session({rewardStatus:'pending'});
 const backup=f04Backup({bosses:[boss],sessions:[session]});await core.importLifeQuest(backup);
 await activities.claimBossReward(boss.id);await activities.finishFocusSession(session);assert.equal(q.loadState().totalXP,495);
});
test('F04 F03 resolution without XP imports but a positive receipt contradicts it',async()=>{
 const boss=f04Boss({xp:0,rewardStatus:'resolved_without_xp'});
 const backup=f04Backup({bosses:[boss]});await core.importLifeQuest(backup);assert.equal(storage.getItem(q.SYSTEM_KEY),backup.records[q.SYSTEM_KEY]);
 await f04Refused(f04Backup({bosses:[boss],receipts:[f04Receipt('boss',boss.id)]}),/resolved_without_xp contredit/);
 // A historical zero receipt is retained, never changed into a positive credit.
 await core.importLifeQuest(f04Backup({bosses:[boss],receipts:[f04Receipt('boss',boss.id,0)]}));assert.equal(q.loadState().completions[0].xpAwarded,0);
});
test('F04 historical zero Boss with positive proof remains credited without changing its receipt',async()=>{
 const boss=f04Boss({xp:0,rewardStatus:'credited'}),backup=f04Backup({bosses:[boss],receipts:[f04Receipt('boss',boss.id)]});
 await core.importLifeQuest(backup);assert.equal(storage.getItem(q.SYSTEM_KEY),backup.records[q.SYSTEM_KEY]);
});
test('F04 unfinished legacy Boss cannot explicitly claim or have a positive reward',async()=>{
 const unfinished={current:0,completedAt:undefined};
 for(const rewardStatus of ['pending','credited'])await f04Refused(f04Backup({bosses:[f04Boss({...unfinished,rewardStatus})],receipts:rewardStatus==='credited'?[f04Receipt('boss','f04-boss')]:[]}),/Boss non terminé/);
 await f04Refused(f04Backup({bosses:[f04Boss({...unfinished,rewardStatus:undefined})],receipts:[f04Receipt('boss','f04-boss')]}),/Boss non terminé/);
});
test('F04 explicit Focus reward status must follow the 25-minute protocol',async()=>{
 await f04Refused(f04Backup({sessions:[f04Session({minutes:10,rewardStatus:'pending'})]}),/Focus f04-focus.*25 minutes/);
});
test('F04 pending positive rewards blocked by zero receipts are refused explicitly',async()=>{
 await f04Refused(f04Backup({bosses:[f04Boss()],receipts:[f04Receipt('boss','f04-boss',0)]}),/Boss f04-boss.*reçu de 0 XP/);
 await f04Refused(f04Backup({sessions:[f04Session({rewardStatus:'pending'})],receipts:[f04Receipt('focus','f04-focus',0)]}),/Focus f04-focus.*reçu de 0 XP/);
});
test('F04 legitimate old balances, status-less activities and orphan receipts remain compatible',async()=>{
 const backup=f04Backup({version:1,bosses:[f04Boss({rewardStatus:undefined})],sessions:[f04Session({minutes:10})],receipts:[f04Receipt('boss','deleted-boss'),f04Receipt('focus','deleted-session',20)]});
 await core.importLifeQuest(backup);assert.equal(q.loadState().totalXP,450);assert.equal(storage.getItem(q.SYSTEM_KEY),backup.records[q.SYSTEM_KEY]);
 const old=f04Backup({system:false});old.records[q.LEGACY_KEY]=JSON.stringify({totalXP:9876,quests:[]});await core.importLifeQuest(old);assert.equal(q.loadState().totalXP,9876);assert.equal(storage.getItem(q.SYSTEM_KEY),null);
});
test('F04 validation uses incoming history, never receipts from the replaced account',async()=>{
 q.saveState({...state(),completions:[f04Receipt('boss','f04-boss')]});
 await f04Refused(f04Backup({bosses:[f04Boss({rewardStatus:'credited'})]}),/sans reçu XP positif/,true);
 // The opposite direction must also work: valid incoming receipts are sufficient.
 const backup=f04Backup({bosses:[f04Boss({rewardStatus:'credited'})],receipts:[f04Receipt('boss','f04-boss')]});
 storage.removeItem(q.SYSTEM_KEY);await core.importLifeQuest(backup);assert.equal(q.loadState().totalXP,450);
});
