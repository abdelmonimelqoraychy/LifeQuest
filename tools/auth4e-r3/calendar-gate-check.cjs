'use strict';
// Prove that a new installation cannot issue a command before calendar parity
// is activated. Uses one fictional, locally confirmed Auth identity only.
const assert=require('node:assert/strict');
const {randomUUID,randomBytes}=require('node:crypto');
const {Client}=require('../auth2/node_modules/pg');
const {status,project,ports}=require('./stack.cjs');

async function main(){
 assert.ok(['lifequest-auth4e-r3-20261013','lifequest-auth4c-commands-gate-20261013','lifequest-auth4d-reader-20261013'].includes(project),'FRESH_GATE_STACK_REQUIRED');
 const cfg=status(),api=cfg.API_URL,key=cfg.PUBLISHABLE_KEY||cfg.ANON_KEY;
 const u=new URL(cfg.DB_URL);u.username='supabase_admin';const admin=new Client({connectionString:u.href});
 const request=async(route,token,body)=>{
  const headers={apikey:key};if(token)headers.Authorization='Bearer '+token;
  if(body!==undefined)headers['Content-Type']='application/json';
  const response=await fetch(api+route,{method:body===undefined?'GET':'POST',headers,
   body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  let data;try{data=await response.json();}catch{}return{status:response.status,data};
 };
 let actorId;
 try{
  await admin.connect();
  const versions=(await admin.query('select version from supabase_migrations.schema_migrations order by version')).rows.map(r=>r.version);
  assert.equal(versions.length,project==='lifequest-auth4d-reader-20261013'?23:20,'ALL_AUTH4C_MIGRATIONS_INSTALLED');
  assert.equal((await admin.query('select count(*)::int n from lifequest.calendar_activation')).rows[0].n,0,'NO_CALENDAR_ACTIVATION');

  const email='auth4c-gate-'+randomUUID()+'@example.test',password=randomBytes(24).toString('hex');
  const created=await request('/auth/v1/signup',null,{email,password});
  assert.equal(created.status,200,'LOCAL_FAKE_SIGNUP');assert.ok(!created.data.access_token,'CONFIRMATION_REQUIRED');
  let tokenHash;
  for(let attempt=0;attempt<50&&!tokenHash;attempt++){
   const box=await(await fetch('http://127.0.0.1:'+ports.mail+'/api/v1/messages')).json();
   for(const message of box.messages||[]){
    if(!(message.To||[]).some(to=>to.Address===email))continue;
    const detail=await(await fetch('http://127.0.0.1:'+ports.mail+'/api/v1/message/'+message.ID)).json();
    for(const match of (detail.HTML||'').matchAll(/href="([^"]+)"/g)){
     const link=new URL(match[1].replaceAll('&amp;','&'));
     if(link.searchParams.get('type')==='email')tokenHash=link.searchParams.get('token_hash');
    }
   }
   if(!tokenHash)await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(tokenHash,'LOCAL_SMTP_CONFIRMATION');
  const confirmed=await request('/auth/v1/verify',null,{token_hash:tokenHash,type:'email'});
  assert.equal(confirmed.status,200,'LOCAL_EMAIL_CONFIRMATION');
  actorId=confirmed.data.user.id;const token=confirmed.data.access_token;

  await admin.query('begin');
  await admin.query("update lifequest.hunters set timezone='Africa/Casablanca',timezone_confirmed_at=clock_timestamp() where user_id=$1",[actorId]);
  await admin.query("update lifequest.hunter_setup set origin_choice='new',chosen_at=clock_timestamp(),configuration_status='ready' where user_id=$1",[actorId]);
  await admin.query("insert into lifequest.hunter_profiles(user_id,name,age,gender,avatar,goals,onboarding_completed,original_created_at) values($1,'Fictional gate fixture',25,'other','male','{}',true,clock_timestamp())",[actorId]);
  await admin.query('commit');

  const before=(await admin.query("select total_xp::text xp,revision::text revision,(select count(*) from lifequest.quests where user_id=$1)::text quests,(select count(*) from lifequest.command_receipts where user_id=$1)::text receipts from lifequest.hunters where user_id=$1",[actorId])).rows[0];
  const denied=await request('/rest/v1/rpc/lifequest_quest_command',token,{expected_actor:actorId,request_id:randomUUID(),kind:'quest.create',payload:{title:'Calendar gate test',description:'Synthetic',frequency:'daily',difficulty:'EASY',attribute:'focus'}});
  assert.equal(denied.status,503,'CREDIT_BLOCKED_WITHOUT_CLOUD_PARITY');
  const after=(await admin.query("select total_xp::text xp,revision::text revision,(select count(*) from lifequest.quests where user_id=$1)::text quests,(select count(*) from lifequest.command_receipts where user_id=$1)::text receipts from lifequest.hunters where user_id=$1",[actorId])).rows[0];
  assert.deepEqual(after,before,'DENIED_COMMAND_HAS_NO_PARTIAL_WRITES');

  const privateRead=await fetch(api+'/rest/v1/calendar_activation?select=zone',{headers:{apikey:key,Authorization:'Bearer '+token,'Accept-Profile':'lifequest'}});
  assert.notEqual(privateRead.status,200,'ACTIVATION_TABLE_NOT_EXPOSED_TO_CLIENT');
  const counts=(await admin.query('select (select count(*)::int from auth.users) accounts,(select count(*)::int from lifequest.hunters) hunters')).rows[0];
  assert.equal(counts.accounts,1);assert.equal(counts.hunters,1);
  console.log('PASS fresh calendar gate: no activation, command denied 503, no partial Hunter/quest/receipt writes, activation table private; one fictional account');
 }finally{await admin.end();}
}
main().catch(error=>{console.error('FAIL calendar gate '+(error.code||'ASSERTION')+' '+String(error.message).split('\n')[0]);process.exitCode=1;});
