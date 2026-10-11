const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const root=process.cwd();
const values=new Map();
const storage={getItem:k=>values.has(k)?values.get(k):null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
const context={window:{localStorage:storage,dispatchEvent:()=>{}},localStorage:storage,crypto:require('node:crypto').webcrypto,Date,Math,Set,Map,JSON,Error,Number,String,Array,Object,console,Event:class Event{constructor(type){this.type=type}}};
const memo=new Map();
function load(name){
 if(memo.has(name))return memo.get(name);
 const file=path.join(root,'src','lib',name+'.ts');
 const content=fs.readFileSync(file,'utf8');
 const transpiled=ts.transpileModule(content,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};memo.set(name,m.exports);
 const deps={'@/lib/questSystem':()=>load('questSystem'),'@/lib/hunterLab':()=>load('hunterLab'),'@/lib/hunterMissions':()=>load('hunterMissions')};
 const req=id=>{if(deps[id])return deps[id]();throw new Error('Unexpected dependency: '+id)};
 vm.runInNewContext('(function(require,module,exports,window,localStorage,crypto,Event){'+transpiled+'})',{...context},{filename:name+'.js'})(req,m,m.exports,context.window,storage,context.crypto,context.Event);
 return m.exports;
}
const q=load('questSystem'),core=load('hunterCore');
const today=()=>new Date().toISOString();
const event=(id,period='2026-10-10')=>({id,questId:'quest-1',period,completedAt:today(),xpAwarded:30,attribute:'focus'});
const state=()=>({version:1,totalXP:450,quests:[],arcs:[],completions:[]});
test.beforeEach(()=>values.clear());
test('Progression preserved at migration boundary',()=>{
 const c={version:1,baselineXP:300,baselineLevel:2,stability:100,lastPenaltyDay:'',penaltyDays:[],initializedAt:today()};
 assert.equal(core.getHunterProgress(450,c).level,2);
 assert.equal(core.getHunterProgress(450,c).current,150);
 assert.equal(core.getHunterProgress(460,c).current,160);
 assert.equal(core.getHunterProgress(525,c).level,3);
});
test('Streak rewards exclude artificial focus/boss completions',()=>{
 const a=event('1');a.questId='lifequest:activity:focus:xyz';
 assert.equal(core.completionDays([a]).length,0);
 assert.equal(core.bonusForStreak(7),1.1);
 assert.equal(core.bonusForStreak(30),1.25);
 assert.equal(core.stabilityMultiplier(49),.8);
});
test('Invalid JSON does not reset account',()=>{
 storage.setItem(q.SYSTEM_KEY,'{invalid');
 assert.throws(()=>q.loadState(),/Sauvegarde LifeQuest illisible/);
 assert.equal(storage.getItem(q.SYSTEM_KEY),'{invalid');
});
test('Duplicate rewards are refused on repeat request',()=>{
 storage.setItem(q.SYSTEM_KEY,JSON.stringify(state()));
 const a=core.awardActivityXP('focus','session-1',20,'focus');
 const b=core.awardActivityXP('focus','session-1',20,'focus');
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
