'use strict';
// Small, read-safe-output concurrency proof on the isolated fictional R3 stack.
const assert=require('node:assert/strict');
const {randomUUID,randomBytes}=require('node:crypto');
const {Client}=require('../auth2/node_modules/pg');
const {status,project,ports}=require('./stack.cjs');

async function main(){
 assert.equal(project,'lifequest-auth4e-r3-20261013');
 const cfg=status(),api=cfg.API_URL,key=cfg.PUBLISHABLE_KEY||cfg.ANON_KEY;
 assert.equal(new URL(api).hostname,'127.0.0.1');assert.equal(new URL(api).port,'57621');
 const u=new URL(cfg.DB_URL);u.username='supabase_admin';const admin=new Client({connectionString:u.href});
 const request=async(route,token,body)=>{const headers={apikey:key};if(token)headers.Authorization='Bearer '+token;if(body!==undefined)headers['Content-Type']='application/json';const r=await fetch(api+route,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});let data;try{data=await r.json()}catch{}return{status:r.status,data};};
 const races=[];
 try{
  await admin.connect();
  const email='auth4e-r3-race-'+randomUUID()+'@example.test',password=randomBytes(24).toString('hex');
  const created=await request('/auth/v1/signup',null,{email,password});assert.equal(created.status,200);assert.ok(!created.data.access_token);
  let tokenHash;
  for(let attempt=0;attempt<40&&!tokenHash;attempt++){
   const list=await(await fetch('http://127.0.0.1:'+ports.mail+'/api/v1/messages')).json();
   for(const m of list.messages||[]){if(!(m.To||[]).some(t=>t.Address===email))continue;const body=await(await fetch('http://127.0.0.1:'+ports.mail+'/api/v1/message/'+m.ID)).json();for(const match of(body.HTML||'').matchAll(/href="([^"]+)"/g)){const link=new URL(match[1].replaceAll('&amp;','&'));if(link.searchParams.get('type')==='email')tokenHash=link.searchParams.get('token_hash');}}
   if(!tokenHash)await new Promise(r=>setTimeout(r,100));
  }
  assert.ok(tokenHash);const confirmed=await request('/auth/v1/verify',null,{token_hash:tokenHash,type:'email'});assert.equal(confirmed.status,200);
  const actor=confirmed.data.user.id,jwt=confirmed.data.access_token;
  await admin.query('begin');
  await admin.query("update lifequest.hunters set timezone='Africa/Casablanca',timezone_confirmed_at=clock_timestamp() where user_id=$1",[actor]);
  await admin.query("update lifequest.hunter_setup set origin_choice='new',chosen_at=clock_timestamp(),configuration_status='ready' where user_id=$1",[actor]);
  await admin.query("insert into lifequest.hunter_profiles(user_id,name,age,gender,avatar,goals,onboarding_completed,original_created_at) values($1,'R3 synthetic ready fixture',25,'other','male','{}',true,clock_timestamp())",[actor]);
  await admin.query('commit');
  const rpc=async(kind,payload,id)=>request('/rest/v1/rpc/'+(kind.startsWith('boss.')||kind.startsWith('focus.')?'lifequest_operations_command':'lifequest_quest_command'),jwt,{expected_actor:actor,request_id:id,kind,payload});
  const ok=async(kind,payload)=>{const id=randomUUID(),r=await rpc(kind,payload,id);assert.equal(r.status,200,'RPC_'+kind);return r.data;};
  const retryRace=async(kind,payload,ids,replies)=>{
   const retries=[];for(let i=0;i<replies.length;i++)if(replies[i].status!==200){assert.equal(replies[i].data?.code,'55P03');assert.equal((await admin.query('select count(*)::int n from lifequest.command_receipts where user_id=$1 and request_id=$2',[actor,ids[i]])).rows[0].n,0);const r=await rpc(kind,payload,ids[i]);assert.equal(r.status,200,'SAME_REQUEST_RETRY_'+kind);retries.push(r.data);}
   const results=replies.filter(r=>r.status===200).map(r=>r.data).concat(retries);assert.equal(results.length,2);
   assert.equal((await admin.query('select count(*)::int n from lifequest.command_receipts where user_id=$1 and request_id=any($2::uuid[])',[actor,ids])).rows[0].n,2);
   return {results,retries:retries.length};
  };
  const checkRace=async(kind,payload,sourceRef)=>{
   const ids=[randomUUID(),randomUUID()],replies=await Promise.all(ids.map(id=>rpc(kind,payload,id)));
   for(const r of replies)assert.ok(r.status===200||(r.status>=400&&r.data?.code==='55P03'),'ONLY_COMMIT_OR_BOUNDED_LOCK_TIMEOUT_'+kind);
   assert.ok(replies.some(r=>r.status===200),'AT_LEAST_ONE_'+kind);
   const finished=await retryRace(kind,payload,ids,replies);
   assert.equal(finished.results.filter(r=>r.result?.credited).length,1,'ONE_CREDIT_'+kind);
   const events=(await admin.query('select count(*)::int n from lifequest.xp_events where user_id=$1 and source_ref=$2',[actor,sourceRef])).rows[0].n;assert.equal(events,1,'ONE_LEDGER_EVENT_'+kind);
   const snap=await request('/rest/v1/rpc/lifequest_hunter_snapshot',jwt,{expected_actor:actor});assert.equal(snap.status,200);assert.equal(snap.data.state,'ready');
   const total=(await admin.query('select total_xp::text xp from lifequest.hunters where user_id=$1',[actor])).rows[0].xp;assert.equal(snap.data.exactXP.total,total,'READER_COHERENT_'+kind);
   races.push({kind,initialHttp:replies.map(r=>r.status),lockTimeouts:replies.filter(r=>r.status!==200).length,retries:finished.retries,credits:1,ledgerEvents:events,receipts:2,reader:'coherent'});
  };
  const quest=(await ok('quest.create',{title:'R3 concurrent quest',description:'Synthetic fixture',frequency:'once',difficulty:'EASY',attribute:'focus'})).result.id;
  await checkRace('quest.complete',{id:quest},quest);
  const boss=(await ok('boss.create',{title:'R3 concurrent Boss',subObjectives:[{title:'one',weight:1},{title:'two',weight:1}]})).result;
  await ok('boss.progress',{id:boss.id,expectedRevision:'0',subId:boss.subIds[0]});
  await checkRace('boss.progress',{id:boss.id,expectedRevision:'1',subId:boss.subIds[1]},'lifequest:activity:boss:'+boss.id);
  const focus=(await ok('focus.start',{mode:'focus',label:'R3 concurrent Focus'})).result.id;
  await admin.query("update lifequest.focus_runs set running_since=clock_timestamp()-interval '1501 seconds',deadline_at=clock_timestamp()-interval '1 second' where user_id=$1 and id=$2",[actor,focus]);
  await checkRace('focus.finish',{id:focus,expectedRevision:'0'},'lifequest:activity:focus:'+focus);
  console.log('PASS concurrent synthetic credits '+JSON.stringify(races));
 }finally{await admin.end();}
}
main().catch(e=>{console.error('FAIL concurrency '+(e.code||'ASSERTION')+' '+String(e.message).split('\n')[0]);process.exitCode=1;});
