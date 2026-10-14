'use strict';
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {randomBytes,randomUUID}=require('node:crypto');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const frontend=path.join(root,'frontend');
const {createServerClient}=require(path.join(frontend,'node_modules/@supabase/ssr'));
const {project,status}=require('../auth4c/stack.cjs');
assert.equal(project,'lifequest-auth4d-reader-20261013');
const cfg=status();
const base='http://127.0.0.1:3104';
const users=[];
let server;
let stage='initialize';

async function main(){
 stage='load local configuration';
 const appEnv={...process.env,NEXT_PUBLIC_SUPABASE_URL:cfg.API_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:cfg.PUBLISHABLE_KEY,APP_ORIGIN:base,PORT:'3104'};
 const nextBin=path.join(frontend,'node_modules/next/dist/bin/next');
 stage='start Next';
 server=spawn(process.execPath,[nextBin,'start','-p','3104'],{cwd:frontend,env:appEnv,stdio:['ignore','pipe','pipe']});
 let ready=false;let exited;
 server.stdout.on('data',b=>{if(/Ready in|started server/i.test(b.toString()))ready=true;});
 server.on('exit',(code)=>{exited=code;});
 for(let i=0;i<80&&!ready;i++){
  if(exited!==undefined)throw new Error('NEXT_SERVER_EXITED');
  try{await fetch(base+'/api/hunter/bootstrap',{signal:AbortSignal.timeout(1000)});ready=true;}catch{}
  if(!ready)await new Promise(r=>setTimeout(r,250));
 }
 assert.ok(ready,'NEXT_SERVER_READY');
 async function get(pathname,cookie=''){
  const response=await fetch(base+pathname,{headers:cookie?{cookie}:{}});
  return {response,data:await response.json()};
 }
 stage='anonymous bootstrap';let result=await get('/api/hunter/bootstrap');assert.equal(result.response.status,401);assert.equal(result.data.code,'AUTH_REQUIRED');
 assert.match(result.response.headers.get('cache-control')||'',/no-store/);
 console.log('PASS Next bootstrap anonymous refused, private no-store');
 async function fixture(){
  stage='signup fixture';
  const jar=new Map();
  const client=createServerClient(cfg.API_URL,cfg.PUBLISHABLE_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>{for(const v of values)jar.set(v.name,v.value);}}});
  const email=`auth4d-http-${randomUUID()}@example.test`,password=randomBytes(24).toString('hex');
  let signup=await client.auth.signUp({email,password,options:{emailRedirectTo:'http://127.0.0.1:3000/auth/confirm'}});
  if(signup.error)throw new Error('SIGNUP_HTTP_'+(signup.error.status||'unknown')+'_'+(signup.error.code||'AUTH_ERROR'));
  stage='signup response assertions';
  assert.ok(signup.data.user);users.push(signup.data.user.id);
  let user=signup.data.user;
  if(!signup.data.session){
   const mailPort=64524;let tokenHash;
   for(let i=0;i<40&&!tokenHash;i++){
    const listing=await (await fetch(`http://127.0.0.1:${mailPort}/api/v1/messages`)).json();
    for(const item of listing.messages||[]){if(!(item.To||[]).some(to=>to.Address===email))continue;
     const message=await (await fetch(`http://127.0.0.1:${mailPort}/api/v1/message/${item.ID}`)).json();
     for(const attr of message.HTML?.match(/href="([^"]+)"/g)||[]){const href=attr.slice(6,-1).replaceAll('&amp;','&');const link=new URL(href);if(link.searchParams.get('type')==='email'){tokenHash=link.searchParams.get('token_hash');break;}}
    }
    if(!tokenHash)await new Promise(r=>setTimeout(r,250));
   }
   stage='confirmation message';assert.ok(tokenHash,'LOCAL_CONFIRMATION_RECEIVED');
   stage='verify confirmation';
   const verified=await client.auth.verifyOtp({type:'email',token_hash:tokenHash});
   if(verified.error)throw new Error('VERIFY_HTTP_'+(verified.error.status||'unknown')+'_'+(verified.error.code||'AUTH_ERROR'));
   stage='verified session assertions';assert.ok(verified.data.session);user=verified.data.user;
  }
  stage='fixture server-side user validation';const current=await client.auth.getUser();if(current.error)throw new Error('FIXTURE_GET_USER_'+(current.error.status||'unknown')+'_'+(current.error.code||'AUTH_ERROR'));assert.equal(current.data.user.id,user.id);
  const active=await client.rpc('lifequest_session_active');if(active.error)throw new Error('FIXTURE_ACTIVE_ERROR_'+(active.error.code||'RPC_ERROR'));if(active.data!==true)throw new Error('FIXTURE_SESSION_INACTIVE');
  return {id:user.id,cookie:[...jar].map(([name,value])=>`${name}=${value}`).join('; '),client};
 }
 const a=await fixture(),b=await fixture();
 const snapshots=[];
 stage='bootstrap A/B/A';
 for(const actor of [a,b,a]){
  result=await get('/api/hunter/bootstrap',actor.cookie);
  if(result.response.status!==200){const old=await get('/api/auth/bootstrap',actor.cookie);throw new Error('BOOTSTRAP_HTTP_'+result.response.status+'_'+(result.data.code||'UNKNOWN')+'_AUTH_BOOTSTRAP_'+old.response.status+'_'+(old.data.code||old.data.state||'UNKNOWN')+'_COOKIE_NAMES_'+actor.cookie.split(';').map(x=>x.trim().split('=')[0]).join(','));}
  assert.equal(result.data.actor,actor.id);assert.equal(result.data.schemaVersion,1);assert.equal(result.data.state,'setup_pending');assert.equal(result.data.reason,'SETUP_PENDING');
  assert.match(result.response.headers.get('cache-control')||'',/no-store/);assert.match(result.response.headers.get('vary')||'',/Cookie/i);snapshots.push(result.data.actor);
 }
 assert.deepEqual(snapshots,[a.id,b.id,a.id]);
 console.log('PASS Next bootstrap SSR A/B/A: real confirmed identities, actor isolation, pending state and private no-store');
 stage='receipt endpoint';
 const receipt=await get('/api/hunter/receipts/'+randomUUID(),a.cookie);assert.equal(receipt.response.status,200);assert.equal(receipt.data.state,'not_found');assert.equal(receipt.data.actor,a.id);
 assert.equal((await get('/api/hunter/receipts/not-a-uuid',a.cookie)).response.status,400);
 console.log('PASS receipt HTTP route returns actor-scoped not_found and rejects malformed IDs');
 stage='forged/revoked cookie';
 const forged=a.cookie.split('; ').map(x=>x.slice(0,x.indexOf('=')+1)+'forged').join('; ');
 assert.equal((await get('/api/hunter/bootstrap',forged)).response.status,401);
 await a.client.auth.signOut();assert.equal((await get('/api/hunter/bootstrap',a.cookie)).response.status,401);
 assert.equal((await get('/api/hunter/bootstrap',b.cookie)).data.actor,b.id);
 console.log('PASS forged and revoked session cookies refused; B remains isolated');
}

main().catch(e=>{console.error('FAIL AUTH-4D HTTP '+stage+' '+(e.code||'ERROR')+' '+String(e.message||'CHECK_FAILED').split('\n')[0]);process.exitCode=1;}).finally(()=>{
 if(server)try{server.kill('SIGTERM');}catch{}
});
