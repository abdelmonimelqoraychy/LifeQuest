'use strict';
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {randomUUID,randomBytes,createHmac}=require('node:crypto');
const path=require('node:path');
const {Client}=require('pg');
const root=path.resolve(__dirname,'../..');
const {createServerClient}=require(path.join(root,'frontend/node_modules/@supabase/ssr'));
const base=process.env.LIFEQUEST_TEST_URL||'http://127.0.0.1:3102';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
let db;
const users=[];
async function run(){
 const config=JSON.parse(execFileSync(process.execPath,[path.join(__dirname,'node_modules/supabase/dist/supabase.js'),'status','--workdir',root,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
 assert.ok(['127.0.0.1','localhost'].includes(new URL(config.API_URL).hostname));
 db=new Client({connectionString:config.DB_URL});await db.connect();
 const endpoint=base+'/api/auth/bootstrap';
 async function bootstrap(cookie=''){const response=await fetch(endpoint,{headers:{cookie}});return {response,data:await response.json()};}
 assert.equal((await bootstrap()).response.status,401);
 console.log('PASS bootstrap anonymous refused');
 async function fixture(){
  const jar=new Map();const client=createServerClient(config.API_URL,config.PUBLISHABLE_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>{for(const v of values)jar.set(v.name,v.value);}}});
  const result=await client.auth.signUp({email:`auth2-app-${randomUUID()}@example.test`,password:randomBytes(24).toString('hex')});
  assert.equal(result.error,null);assert.ok(result.data.session);users.push(result.data.user.id);
  return {client,jar,id:result.data.user.id,cookie:()=>[...jar].map(([name,value])=>`${name}=${value}`).join('; ')};
 }
 const a=await fixture(),b=await fixture();
 for(const actor of [a,b,a]){const result=await bootstrap(actor.cookie());assert.equal(result.response.status,200);assert.deepEqual(result.data,{actor:actor.id,state:'cloud_not_connected'});assert.match(result.response.headers.get('cache-control'),/no-store/);assert.match(result.response.headers.get('vary'),/Cookie/i);}
 console.log('PASS real SSR cookies: A/B/A identities isolated, no RPG fallback, private no-store responses');
 const bad=[...a.jar.keys()].map(name=>name+'=forged').join('; ');assert.equal((await bootstrap(bad)).response.status,401);
 console.log('PASS forged cookie refused by server');
 const session=(await a.client.auth.getSession()).data.session;
 const cookieName=[...a.jar.keys()].find(name=>/^sb-.*-auth-token(?:\.\d+)?$/.test(name)).replace(/\.\d+$/,'');
 const docker=process.env.LIFEQUEST_DOCKER||path.join(process.env.LOCALAPPDATA,'Programs/DockerDesktop/resources/bin/docker.exe');
 const inspect=JSON.parse(execFileSync(docker,['inspect','supabase_auth_lifequest-auth2'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
 const secret=inspect[0].Config.Env.find(v=>v.startsWith('GOTRUE_JWT_SECRET=')).slice('GOTRUE_JWT_SECRET='.length);
 const claims=JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url'));
 const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
 const payload=Buffer.from(JSON.stringify({...claims,iat:Math.floor(Date.now()/1000)-120,exp:Math.floor(Date.now()/1000)-60})).toString('base64url');
 const unsigned=header+'.'+payload;const expired=unsigned+'.'+createHmac('sha256',secret).update(unsigned).digest('base64url');
 const stale={...session,access_token:expired,expires_at:1,expires_in:0};
 const staleCookie=cookieName+'=base64-'+Buffer.from(JSON.stringify(stale)).toString('base64url');
 const refreshed=await bootstrap(staleCookie);if(refreshed.response.status!==200)console.error('Refresh diagnostic:',refreshed.response.status,refreshed.data.code);assert.equal(refreshed.response.status,200);assert.equal(refreshed.data.actor,a.id);assert.ok(refreshed.response.headers.getSetCookie().length);
 console.log('PASS stale SSR session refresh propagates Set-Cookie');
 const original=a.cookie();await a.client.auth.signOut();assert.equal((await bootstrap(original)).response.status,401);assert.equal((await bootstrap(b.cookie())).data.actor,b.id);
 console.log('PASS revoked A session refused; B remains isolated');
}
run().catch(error=>{console.error('AUTH2_APP_CHECK_FAILED',error.code||error.name,'(private details suppressed)');process.exitCode=1;}).finally(async()=>{if(db){if(users.length)await db.query('delete from auth.users where id=any($1::uuid[])',[users]);await db.end();}});
