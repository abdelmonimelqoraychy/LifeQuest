// E: real termination of owned Chrome process trees; exclusively synthetic disposable profiles.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process'),crypto=require('node:crypto');
const base=process.env.LIFEQUEST_TEST_URL||'http://127.0.0.1:3102',out=path.resolve('.browser-check');
const chrome=process.env.LIFEQUEST_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const J='lifequest-import-journal-v1',MAIN='lifequest-quest-system-v1';
const keys=[MAIN,'lifequest-hunter-lab-v1','lifequest-hunter-operations-v1','lifequest-core-v011','lifequest-hunter-timer-v1','lifequest-profile-v1','lifequest-v2-demo','lifequest-hunter-transition-v1'];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){for(let i=0;i<150;i++){if(await fn())return;await sleep(100);}throw Error('Timeout '+label);}
async function launch(profile){
 const active=path.join(profile,'DevToolsActivePort');if(fs.existsSync(active))fs.unlinkSync(active);
 const process=spawn(chrome,['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let port;await until(()=>{try{port=Number(fs.readFileSync(active,'utf8').split(/\r?\n/)[0]);return port>0;}catch{return false;}},'owned Chrome startup');
 const clients=[],errors=[];
 async function tab(route){
  const info=await(await fetch('http://127.0.0.1:'+port+'/json/new?'+encodeURIComponent(base+route),{method:'PUT'})).json();
  const ws=new WebSocket(info.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
  let id=0;const pending=new Map();const c={ws,paused:false,targetId:info.id};
  c.call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,t=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},15000);pending.set(n,{resolve,reject,t});ws.send(JSON.stringify({id:n,method,params}));});
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){clearTimeout(p.t);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}else if(m.method==='Debugger.paused')c.paused=true;else if(m.method==='Page.javascriptDialogOpening')void c.call('Page.handleJavaScriptDialog',{accept:true});else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);else if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push('console.error');});
  ws.addEventListener('close',()=>{for(const p of pending.values()){clearTimeout(p.t);p.reject(Error('Owned Chrome terminated'));}pending.clear();});
  c.eval=async expression=>{const r=await c.call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  clients.push(c);await c.call('Page.enable');await c.call('Runtime.enable');await until(()=>c.eval('location.origin==='+JSON.stringify(new URL(base).origin)+'&&document.readyState==="complete"&&!!navigator.locks'),'origin loaded');return c;
 }
 async function terminate(){
  assert.ok(Number.isInteger(process.pid)&&process.pid>0,'Only an owned PID may be terminated');
  const result=spawnSync('taskkill.exe',['/PID',String(process.pid),'/T','/F'],{windowsHide:true,encoding:'utf8'});
  // taskkill may report vanished child PIDs despite having terminated the owning process.
  await until(()=>process.exitCode!==null||process.signalCode!==null,'owned Chrome exit (taskkill '+result.status+')');for(const c of clients)c.ws.close();
 }
 async function close(){if(process.exitCode!==null||process.signalCode!==null){for(const c of clients)c.ws.close();return;}try{if(clients[0])await clients.find(c=>c.ws.readyState===WebSocket.OPEN)?.call('Browser.close');}catch{}for(const c of clients)c.ws.close();try{await until(()=>process.exitCode!==null||process.signalCode!==null,'graceful Chrome exit');}catch{await terminate();}}
 return {tab,terminate,close,errors};
}
const now='2026-10-12T12:00:00.000Z',state={version:1,totalXP:450,quests:[],arcs:[],completions:[{id:'historical-receipt-e',questId:'lifequest:activity:boss:historical-orphan',period:'once',completedAt:now,xpAwarded:30,attribute:'discipline'}],achievements:[]};
const before=Object.fromEntries(keys.map(k=>[k,null]));
before[MAIN]=JSON.stringify(state);
before[keys[1]]=JSON.stringify({version:1,ideas:[],nodes:[],resources:[],journal:[],sessions:[],challenges:[]});
before[keys[2]]=JSON.stringify({version:1,bosses:[],events:[]});
before[keys[3]]=JSON.stringify({version:1,baselineXP:450,baselineLevel:1,stability:100,lastPenaltyDay:'',penaltyDays:[],initializedAt:now});
before[keys[5]]=JSON.stringify({name:'Synthetic E',age:25,gender:'male',avatar:'male',goals:[],onboardingCompleted:true,createdAt:now});
before[keys[6]]=JSON.stringify({totalXP:450,quests:[]});before[keys[7]]='3';
const after={...before,[MAIN]:JSON.stringify({...state,totalXP:900}),[keys[6]]:JSON.stringify({totalXP:900,quests:[]}),[keys[7]]:'4'};
const journal={format:'lifequest-import-journal',version:1,operationId:'synthetic-e',createdAt:now,phase:'prepared',keys:[...keys].sort(),before,after};
const snapshot=c=>c.eval('Object.fromEntries('+JSON.stringify(keys)+'.map(k=>[k,localStorage.getItem(k)]))');
async function button(c,label){await c.eval('Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim()==='+JSON.stringify(label)+').click()');}
async function recovery(c,phase){await until(()=>c.eval('document.body.innerText.includes('+JSON.stringify(phase==='prepared'?'D_PREPARED':'D_COMMITTED')+')'),'recovery diagnostic');await button(c,phase==='prepared'?'Restaurer les données précédentes':'Finaliser l’import');await until(()=>c.eval('!!document.querySelector("dialog[open]")'),'confirmation');await button(c,phase==='prepared'?'Confirmer la restauration':'Confirmer la finalisation');}
const stages=process.env.LIFEQUEST_CRASH_STAGES?.split(',')||['before-journal','prepared','first-write','middle-write','before-commit','committed','restore-write','finalize-before-cleanup','cleanup-after-delete','tab-loss'];
async function check(stage){
 const profile=path.join(out,'e-profile-'+crypto.randomUUID());fs.mkdirSync(profile,{recursive:true});let b=await launch(profile);
 try{
  let c=await b.tab('/hunter-core');await until(()=>c.eval('document.readyState==="complete"'),'seed page');
  const recoverStage=stage.startsWith('restore')||stage.startsWith('finalize');
  const phase=stage.startsWith('finalize')?'committed':'prepared';
  await c.eval('navigator.locks.request("lifequest-storage",()=>{for(const [k,v] of Object.entries('+JSON.stringify(recoverStage?after:before)+')){if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v)}'+(recoverStage?'localStorage.setItem('+JSON.stringify(J)+','+JSON.stringify(JSON.stringify({...journal,phase}))+');':'')+'dispatchEvent(new Event("lifequest-core-updated"))})');
  await c.call('Page.reload');await until(()=>c.eval(recoverStage?'!!document.querySelector("#storage-recovery-title")':'!!document.querySelector("input[type=file]")'),'seed hydrated');
  assert.deepEqual(await snapshot(c),recoverStage?after:before);
  // Persist the fixture with a graceful close/reopen first. A new, unflushed profile
  // must not be mistaken for a previously saved user's durable account.
  await b.close();b=await launch(profile);c=await b.tab('/hunter-core');
  await until(()=>c.eval(recoverStage?'!!document.querySelector("#storage-recovery-title")':'!!document.querySelector("input[type=file]")'),'durable baseline reloaded');
  assert.deepEqual(await snapshot(c),recoverStage?after:before);
  const other=await b.tab('/dashboard');await until(()=>other.eval('document.readyState==="complete"'),'second tab');
  await c.call('Debugger.enable');
  // The debugger pauses the real production import/recovery at a synchronous boundary.
  // It throws no JS exception: the owning Node process then forcibly terminates Chrome.
  await c.eval('(()=>{const set=Storage.prototype.setItem,remove=Storage.prototype.removeItem;let business=0;const stage='+JSON.stringify(stage)+',j='+JSON.stringify(J)+',keys='+JSON.stringify(keys)+';Storage.prototype.setItem=function(k,v){if(k===j&&stage==="before-journal")debugger;if(k===j&&stage==="before-commit"&&JSON.parse(v).phase==="committed")debugger;const r=set.call(this,k,v);if(k===j&&((stage==="prepared"&&JSON.parse(v).phase==="prepared")||(stage==="committed"&&JSON.parse(v).phase==="committed")))debugger;if(keys.includes(k)){business++;if((["first-write","tab-loss"].includes(stage)&&business===1)||(stage==="middle-write"&&business===3)||(stage==="restore-write"&&business===1))debugger;}return r;};Storage.prototype.removeItem=function(k){if(k===j&&stage==="finalize-before-cleanup")debugger;const r=remove.call(this,k);if(k===j&&stage==="cleanup-after-delete")debugger;return r;};})()');
  if(recoverStage)await recovery(c,phase);else{
   const file=path.join(out,'e-incoming-'+stage+'.json');fs.writeFileSync(file,JSON.stringify({format:'lifequest-backup',version:2,exportedAt:now,records:after}));
   const doc=await c.call('DOM.getDocument'),field=await c.call('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'input[type=file]'});await c.call('DOM.setFileInputFiles',{nodeId:field.nodeId,files:[file]});
  }
  await until(()=>c.paused,'production boundary '+stage);
  const expectJournal=!['before-journal','cleanup-after-delete'].includes(stage);
  if(expectJournal){await until(()=>other.eval('!!document.querySelector("#storage-recovery-title")'),'native second tab detection');assert.equal(await other.eval('document.querySelectorAll("form,[role=meter],input[type=file]").length'),0);}
  // Separate browser renderer remains alive: actual UI mutation is absent while import A is paused.
  const preTermination={stage,records:await snapshot(other),journalRaw:await other.eval('localStorage.getItem('+JSON.stringify(J)+')')};
  fs.writeFileSync(path.join(profile,'pre-termination.json'),JSON.stringify(preTermination,null,2));
  await sleep(Number(process.env.LIFEQUEST_CRASH_SETTLE_MS||7000));
  if(stage==='tab-loss'){await other.call('Target.closeTarget',{targetId:c.targetId});c=other;}
  else {await b.terminate();b=await launch(profile);c=await b.tab('/hunter-core');}
  await until(()=>c.eval('document.readyState==="complete"'),'restart');
  const raw=await c.eval('localStorage.getItem('+JSON.stringify(J)+')');
  fs.writeFileSync(path.join(profile,'post-restart.json'),JSON.stringify({stage,records:await snapshot(c),journalRaw:raw},null,2));
  const tabCompleted=stage==='tab-loss'&&raw===null;
  if(expectJournal&&!tabCompleted){
   assert.notEqual(raw,null,'Expected durable journal after restart');const persisted=JSON.parse(raw);assert.equal(persisted.phase,['committed','finalize-before-cleanup'].includes(stage)?'committed':'prepared');
   assert.deepEqual(persisted.before,before);assert.deepEqual(persisted.after,after);
   const observed=await snapshot(c);for(const k of keys)assert.ok(observed[k]===before[k]||observed[k]===after[k]);
   await until(()=>c.eval('!!document.querySelector("#storage-recovery-title")'),'restart boundary');assert.equal(await c.eval('document.querySelectorAll("form,input[type=file]").length'),0);
   await recovery(c,persisted.phase);await until(()=>c.eval('localStorage.getItem('+JSON.stringify(J)+')===null'),'recovery finished');
  }else assert.equal(raw,null);
  const expected=tabCompleted||stage==='cleanup-after-delete'||['committed','finalize-before-cleanup'].includes(stage)?after:before;
  assert.deepEqual(await snapshot(c),expected);
  const final=JSON.parse((await snapshot(c))[MAIN]);assert.deepEqual(final.completions,state.completions);assert.equal(final.totalXP,JSON.parse(expected[MAIN]).totalXP);
  await until(()=>c.eval(stage==='tab-loss'?'document.querySelectorAll("[role=meter]").length===5':'!!document.querySelector("input[type=file]")'),'business remounted');assert.deepEqual(await snapshot(c),expected);
  assert.deepEqual(b.errors,[]);return {stage,termination:stage==='tab-loss'?'CDP closes import tab; second real tab remains alive':'taskkill owned Chrome process tree',journal:raw===null?'absent':JSON.parse(raw).phase,recoveredTo:expected===after?'after':'before',tabCompleted,exactRecords:true,settleMs:Number(process.env.LIFEQUEST_CRASH_SETTLE_MS||7000),profile};
 }finally{await b.close().catch(e=>console.error('Harness cleanup: '+e.message));}
}
(async()=>{fs.mkdirSync(out,{recursive:true});const passed=[],failed=[];const suffix=process.env.LIFEQUEST_CRASH_STAGES==='tab-loss'?'-tab-loss':'';const report=path.join(out,'e-crash-report-'+Number(process.env.LIFEQUEST_CRASH_SETTLE_MS||7000)+suffix+'.json');for(const stage of stages){try{const r=await check(stage);passed.push(r);console.log('PASS '+stage);}catch(e){failed.push({stage,error:e.message});console.error('FAIL '+stage+': '+e.message);process.exitCode=1;}fs.writeFileSync(report,JSON.stringify({passed,failed},null,2));}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
