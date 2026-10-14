'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{randomUUID}=require('node:crypto');
const out=path.join(__dirname,'.results','visual-origin');fs.mkdirSync(out,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(fn,label){for(let i=0;i<240;i++){try{if(await fn())return}catch{}await sleep(100)}throw Error('WAIT_'+label)}
async function main(){
 const profile=path.join(out,'chrome-profile-'+randomUUID()),proc=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let ws;
 try{
  await wait(()=>{try{return !!fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8')}catch{return false}},'CHROME');
  const port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split(/\r?\n/)[0]);
  const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();if(!target.webSocketDebuggerUrl)throw Error('CHROME_PAGE_TARGET_MISSING');ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true})});
  let seq=0;const pending=new Map();const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP_TIMEOUT_'+method))},60000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}))});ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error('CDP_FAILED')):p.resolve(m.result)}}});
  const evalJS=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error('PAGE_EVALUATION_FAILED');return r.result.value};
  const today=new Date().toISOString().slice(0,10),now=new Date().toISOString(),ids={arc:'origin-arc',daily:'origin-daily',once:'origin-once',boss:'origin-boss',root:'origin-root',child:'origin-child'};
  const seed={
   'lifequest-profile-v1':{name:'Synthetic Reference Hunter',age:25,gender:'other',avatar:'male',goals:['Create','Learn'],onboardingCompleted:true,createdAt:now},
   'lifequest-quest-system-v1':{version:1,totalXP:320,arcs:[{id:ids.arc,title:'Synthetic Arc',description:'A visual comparison fixture',targetDate:`${new Date().getUTCFullYear()+1}-06-30`,createdAt:now}],quests:[{id:ids.daily,title:'Daily focus',description:'A fictional daily task for layout comparison.',xp:50,frequency:'daily',difficulty:'NORMAL',attribute:'focus',createdAt:now,arcId:ids.arc,revision:0},{id:ids.once,title:'Read a chapter',description:'A fictional completed task.',xp:80,frequency:'once',difficulty:'HARD',attribute:'knowledge',createdAt:now,arcId:ids.arc,targetDate:today,revision:0}],completions:[{id:'origin-completion',questId:ids.once,period:'once',completedAt:now,xpAwarded:80,attribute:'knowledge',questTitle:'Read a chapter',arcId:ids.arc}],achievements:[]},
   'lifequest-hunter-lab-v1':{version:1,ideas:[{id:'origin-idea',title:'A synthetic idea',content:'Fictional notes for visual comparison.',tag:'UI',createdAt:now,archived:false}],nodes:[{id:ids.root,title:'Build a routine',parentId:null,x:180,y:120},{id:ids.child,title:'Read daily',parentId:ids.root,x:460,y:260}],resources:[{id:'origin-resource',title:'Design notes',notes:'Fictional reference.',url:'',topic:'UI',mastered:false,createdAt:now}],journal:[{id:'origin-journal',date:today,wins:'Finished a sample task',challenges:'None',gratitude:'A good day',tomorrow:'Continue'}],sessions:[{id:'origin-focus',date:now,minutes:25,label:'Visual fixture',rewardStatus:'credited'}],challenges:[{id:'origin-challenge',prompt:'Describe a useful invention.',response:'A fictional response.',date:now,completed:true}]},
   'lifequest-hunter-operations-v1':{version:1,bosses:[{id:ids.boss,title:'Synthetic Boss',objective:'Complete one step',target:2,current:1,xp:50,createdAt:now,subObjectives:[{id:'origin-sub-1',title:'Plan',weight:1,completed:true},{id:'origin-sub-2',title:'Review',weight:1,completed:false}]}],events:[{id:'origin-event',kind:'boss',title:'Synthetic event',at:now}]}
  };
  const source='if(location.hostname==="127.0.0.1"&&location.port==="31780"){const seed='+JSON.stringify(seed)+';for(const [k,v] of Object.entries(seed))localStorage.setItem(k,JSON.stringify(v));}';
  console.log('PASS connected to isolated Chrome reference profile');await call('Page.enable');await call('Runtime.enable');await call('Page.addScriptToEvaluateOnNewDocument',{source});
  const base='http://127.0.0.1:31780';
  async function nav(route,needle){await call('Page.navigate',{url:base+route});await wait(()=>evalJS(`document.readyState==="complete"&&document.body.innerText.includes(${JSON.stringify(needle)})`),'ROUTE_'+route);await sleep(600);}
  async function capture(name){for(const [device,width,height,mobile] of [['desktop',1440,1000,false],['mobile',390,844,true]]){await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});await sleep(400);const image=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});fs.writeFileSync(path.join(out,`${name}-${device}.png`),Buffer.from(image.data,'base64'));}await call('Emulation.clearDeviceMetricsOverride');}
  await nav('/dashboard','STATUS WINDOW');await capture('dashboard');
  await nav('/quests','QUEST LOG');await capture('quests');
  await nav('/arcs','STORY ARCS');await capture('story-arcs');
  await nav('/hunter-operations','HUNTER COMMAND CENTER');await capture('operations-boss');
  await nav('/hunter-core','HUNTER SYSTEM ENGINE');await capture('hunter-core');
  await nav('/hunter-lab','PRODUCTIVITY & CREATIVITY');
  for(const [button,name,heading] of [['FOCUS DUNGEON','focus','[ FOCUS DUNGEON ]'],['IDEA VAULT','hunter-lab-ideas','[ IDEA VAULT ]'],['CREATIVITY','hunter-lab-creativity','[ CREATIVITY DUNGEON ]'],['MIND MAP','hunter-lab-mind','[ MIND MAP ]'],['LIBRARY','hunter-lab-library','[ KNOWLEDGE LIBRARY ]'],['JOURNAL','hunter-lab-journal','[ HUNTER JOURNAL ]'],['ANALYTICS','hunter-lab-analytics','[ DEEP WORK ANALYTICS ]']]){await evalJS(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===${JSON.stringify(button)});if(!b)throw Error('MISSING_TAB');b.click();return true})()`);await wait(()=>evalJS(`document.body.innerText.includes(${JSON.stringify(heading)})`),'TAB_'+name);await capture(name);}
  console.log('PASS historical Git reference screenshots: desktop/mobile, seven routes and all seven Lab tabs; synthetic localStorage fixture in a dedicated Chrome profile only');
 }finally{if(ws)ws.close();proc.kill();}
}
main().catch(e=>{console.error('ORIGIN_CAPTURE_FAILED '+e.message);process.exitCode=1});
