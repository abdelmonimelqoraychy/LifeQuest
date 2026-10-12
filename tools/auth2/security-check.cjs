'use strict';
// Local-only integration proof. Never logs credentials, JWTs, SQL payloads or emails.
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {randomUUID, randomBytes, createHmac} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {Client, Pool} = require('pg');
const root = path.resolve(__dirname, '../..');
const cli = path.join(__dirname, 'node_modules/supabase/dist/supabase.js');
const docker = process.env.LIFEQUEST_DOCKER || path.join(process.env.LOCALAPPDATA, 'Programs/DockerDesktop/resources/bin/docker.exe');
const checks = [];
const pools = [];
let admin;
let fixtureUsers = [];
function check(label) { checks.push(label); console.log('PASS '+label); }
function localURL(value) { const url = new URL(value); assert.ok(['127.0.0.1','localhost'].includes(url.hostname), 'LOCAL_TARGET_REQUIRED'); return url; }
async function run() {
  const config = JSON.parse(execFileSync(process.execPath, [cli,'status','--workdir',root,'--output','json'], {encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  const api = localURL(config.API_URL).origin;
  const db = localURL(config.DB_URL);
  const apiKey = config.ANON_KEY || config.PUBLISHABLE_KEY;
  assert.ok(apiKey, 'LOCAL_PUBLIC_KEY_REQUIRED');
  admin = new Client({connectionString:db.href}); await admin.connect();
  const schema = await admin.query("select to_regclass('auth2_proof.progress') as table_name");
  assert.ok(schema.rows[0].table_name, 'MIGRATION_REQUIRED');
  const password = randomBytes(24).toString('hex');
  await admin.query(`alter role lifequest_auth2_server login password '${password}'`);
  const runtimeURL = new URL(db); runtimeURL.username='lifequest_auth2_server'; runtimeURL.password=password;
  const pool = new Pool({connectionString:runtimeURL.href,max:1}); pools.push(pool);
  async function request(route, token, body, method='GET', schemaName) {
    const headers = {apikey:apiKey};
    if(token) headers.Authorization='Bearer '+token;
    if(body !== undefined) headers['Content-Type']='application/json';
    if(schemaName) headers[method==='GET'?'Accept-Profile':'Content-Profile']=schemaName;
    const response = await fetch(api+route,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
    const text=await response.text(); let data; try {data=JSON.parse(text);} catch {data=null;}
    return {status:response.status,data};
  }
  async function signup(label) {
    const result = await request('/auth/v1/signup',null,{email:`auth2-${label}-${randomUUID()}@example.test`,password:randomBytes(24).toString('hex')},'POST');
    assert.equal(result.status,200,'FICTITIOUS_SIGNUP_FAILED');
    assert.ok(result.data.access_token && result.data.user.id,'LOCAL_CONFIRMATION_CONFIG_REQUIRED');
    fixtureUsers.push(result.data.user.id);
    await admin.query('insert into auth2_proof.progress(user_id) values ($1)',[result.data.user.id]);
    return {id:result.data.user.id,token:result.data.access_token,claims:JSON.parse(Buffer.from(result.data.access_token.split('.')[1],'base64url'))};
  }
  const a = await signup('a'), b = await signup('b');
  check('two real fictitious Auth identities provisioned locally');
  const actorRows = token=>request('/rest/v1/progress?select=user_id,xp',token,undefined,'GET','auth2_proof');
  const anon=await actorRows(null); assert.ok(anon.status>=400); check('anonymous table access denied');
  for(const actor of [a,b]) {const result=await actorRows(actor.token); assert.equal(result.status,200);assert.deepEqual(result.data,[{user_id:actor.id,xp:0}]);}
  check('A and B SELECT are restricted to their own rows');
  const other=await request('/rest/v1/progress?user_id=eq.'+b.id,a.token,undefined,'GET','auth2_proof');assert.deepEqual(other.data,[]);
  for(const actor of [a,b]) {
    const result=await request('/rest/v1/progress?user_id=eq.'+(actor===a?b.id:a.id),actor.token,{xp:999},'PATCH','auth2_proof'); assert.ok(result.status>=400);
    const own=await request('/rest/v1/progress?user_id=eq.'+actor.id,actor.token,{xp:999},'PATCH','auth2_proof'); assert.ok(own.status>=400);
    const insert=await request('/rest/v1/receipts',actor.token,{user_id:actor.id,request_id:randomUUID(),reward_id:'forged',xp:7},'POST','auth2_proof');assert.ok(insert.status>=400);
  }
  check('direct table mutation and receipt fabrication denied, even for owner');
  async function rpc(actor, params) {return request('/rest/v1/rpc/auth2_award',actor.token,{expected_actor:actor.id,...params},'POST');}
  const unauthorized=await rpc(a,{expected_actor:b.id,request_id:randomUUID(),reward_id:'other'});assert.ok(unauthorized.status>=400);
  assert.ok((await request('/rest/v1/rpc/auth2_award',null,{expected_actor:a.id,request_id:randomUUID(),reward_id:'anon'},'POST')).status>=400);
  check('direct RPC denies anonymous and actor substitution');
  const invalid=a.token.slice(0,-10)+'AAAAAAAAAA';
  assert.ok((await actorRows(invalid)).status>=400);
  assert.ok((await rpc({id:a.id,token:invalid},{request_id:randomUUID(),reward_id:'invalid'})).status>=400);
  // A correctly signed but expired LOCAL token: local signing secret stays in memory.
  const inspected=JSON.parse(execFileSync(docker,['inspect','supabase_auth_lifequest-auth2'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  const entry=inspected[0].Config.Env.find(v=>v.startsWith('GOTRUE_JWT_SECRET=')); assert.ok(entry,'LOCAL_SIGNING_SECRET_REQUIRED');
  const signingSecret=entry.slice('GOTRUE_JWT_SECRET='.length);
  const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
  const payload=Buffer.from(JSON.stringify({...a.claims,iat:Math.floor(Date.now()/1000)-120,exp:Math.floor(Date.now()/1000)-60})).toString('base64url');
  const unsigned=header+'.'+payload; const expired=unsigned+'.'+createHmac('sha256',signingSecret).update(unsigned).digest('base64url');
  const expiration=await actorRows(expired);assert.equal(expiration.status,401); assert.match(JSON.stringify(expiration.data),/expired/i);
  assert.ok((await rpc({id:a.id,token:expired},{request_id:randomUUID(),reward_id:'expired'})).status>=400);
  check('invalid signature and genuinely signed expired token refused');
  const id=randomUUID(), command={request_id:id,reward_id:'rpc-once'};
  const result=await Promise.all([rpc(a,command),rpc(a,command)]);for(const r of result){
    if(r.status!==200)console.error('RPC diagnostic:',r.status,r.data?.code,
      /ambiguous/i.test(r.data?.message||'')?'ambiguous SQL reference':(r.data?.message||'').match(/permission denied for (?:table|schema|function|relation) [a-z0-9_.]+/i)?.[0] || 'command refused');
    assert.equal(r.status,200);
  }
  assert.deepEqual(result[0].data,result[1].data);assert.deepEqual((await rpc(a,command)).data,result[0].data);
  assert.deepEqual((await rpc(a,{...command,request_id:randomUUID()})).data,result[0].data);
  assert.ok((await rpc(a,{...command,reward_id:'different'})).status>=400);
  assert.equal((await actorRows(a.token)).data[0].xp,7);
  check('RPC concurrency, lost-response retry and reward identity credit once');
  const failed=await rpc(a,{request_id:randomUUID(),reward_id:'rpc-failure',simulate_failure:true});assert.ok(failed.status>=400);
  assert.equal((await actorRows(a.token)).data[0].xp,7);
  assert.equal((await admin.query('select count(*)::int as n from auth2_proof.receipts where user_id=$1',[a.id])).rows[0].n,1);
  check('RPC exception after XP update rolls back XP and receipt');
  async function direct(actor, command, fail=false) {
    const verified=await request('/auth/v1/user',actor.token);assert.equal(verified.status,200,'AUTH_REQUIRED');assert.equal(verified.data.id,actor.id);
    const claims=JSON.parse(Buffer.from(actor.token.split('.')[1],'base64url'));
    assert.ok(claims.exp>Date.now()/1000);assert.equal(claims.sub,verified.data.id);
    const client=await pool.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(claims)]);
      const rows=await client.query('select * from auth2_proof.progress order by user_id');assert.deepEqual(rows.rows.map(r=>r.user_id),[actor.id]);
      const foreign=await client.query('update auth2_proof.progress set xp=xp where user_id=$1',[actor.id===a.id?b.id:a.id]);assert.equal(foreign.rowCount,0);
      await client.query('select 1 from auth2_proof.progress where user_id=$1 for update',[actor.id]);
      const receipt=await client.query('select * from auth2_proof.receipts where user_id=$1 and (request_id=$2 or reward_id=$3)',[actor.id,command.request_id,command.reward_id]);
      if(receipt.rowCount) {if(receipt.rows[0].request_id===command.request_id)assert.equal(receipt.rows[0].reward_id,command.reward_id);}
      else {
        await client.query('update auth2_proof.progress set xp=xp+$2 where user_id=$1',[actor.id,7]);
        if(fail)throw Error('SIMULATED_TRANSACTION_FAILURE');
        await client.query('insert into auth2_proof.receipts values ($1,$2,$3,7)',[actor.id,command.request_id,command.reward_id]);
      }
      await client.query('commit');
    } catch(error) {await client.query('rollback');throw error;} finally {client.release();}
  }
  const directCommand={request_id:randomUUID(),reward_id:'direct-once'};
  await Promise.all([direct(b,directCommand),direct(b,directCommand)]);
  await assert.rejects(direct(a,{request_id:randomUUID(),reward_id:'direct-failure'},true));
  await direct(b,directCommand);
  await assert.rejects(direct({id:a.id,token:invalid},{request_id:randomUUID(),reward_id:'invalid'}));
  await assert.rejects(direct({id:a.id,token:expired},{request_id:randomUUID(),reward_id:'expired'}));
  const context=await pool.query('select auth2_proof.current_actor() as actor');assert.equal(context.rows[0].actor,null);
  assert.deepEqual((await pool.query('select * from auth2_proof.progress')).rows,[]);
  assert.equal((await actorRows(a.token)).data[0].xp,7); assert.equal((await actorRows(b.token)).data[0].xp,7);
  check('limited PostgreSQL transaction isolates pooled A/B after commit and rollback; no residual identity');
  const roles=await admin.query("select rolname,rolsuper,rolbypassrls from pg_roles where rolname in ('lifequest_auth2_server','lifequest_auth2_command_owner')");
  assert.equal(roles.rowCount,2);for(const role of roles.rows){assert.equal(role.rolsuper,false);assert.equal(role.rolbypassrls,false);}
  const owned=await admin.query("select c.relname from pg_class c join pg_roles r on c.relowner=r.oid where r.rolname in ('lifequest_auth2_server','lifequest_auth2_command_owner') and c.relkind in ('r','p')");assert.equal(owned.rowCount,0);
  check('runtime and RPC owner lack superuser, BYPASSRLS and table ownership');
  const functions=await admin.query("select p.proname,has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='auth2_proof' and p.proname in ('current_actor','session_allowed')) or (n.nspname='public' and p.proname in ('auth2_award','lifequest_session_active'))");
  assert.equal(functions.rowCount,4);
  for(const fn of functions.rows){assert.equal(fn.anon_execute,false);assert.equal(fn.authenticated_execute,true);assert.ok(fn.proconfig.includes('search_path=""'));}
  const membership=await admin.query("select m.inherit_option,m.set_option from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles member on member.oid=m.member where r.rolname='lifequest_auth2_command_owner' and member.rolname='postgres'");
  for(const grant of membership.rows){assert.equal(grant.inherit_option,false);assert.equal(grant.set_option,false);}
  check('effective function grants deny anon and temporary SET/INHERIT rights are revoked');
  const logout=await request('/auth/v1/logout',a.token,{},'POST');assert.ok([200,204].includes(logout.status));
  const revoked=await rpc(a,{request_id:randomUUID(),reward_id:'revoked'});assert.ok(revoked.status>=400);
  assert.deepEqual((await actorRows(a.token)).data,[]);
  check('revoked session denied despite an unexpired access token');
  const out=path.join(__dirname,'.results');fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,'security-report.json'),JSON.stringify({checks,passed:checks.length,targets:'localhost only'},null,2));
}
run().catch(error=>{console.error('AUTH2_SECURITY_CHECK_FAILED', error.code || error.name, 'after',checks.length,'checks (details suppressed)');process.exitCode=1;}).finally(async()=>{
  for(const pool of pools)await pool.end();
  // Remove only accounts created by this run; never reset a database or another project.
  if(admin){if(fixtureUsers.length)await admin.query('delete from auth2_proof.receipts where user_id=any($1::uuid[])',[fixtureUsers]);
    if(fixtureUsers.length)await admin.query('delete from auth2_proof.progress where user_id=any($1::uuid[])',[fixtureUsers]);
    if(fixtureUsers.length)await admin.query('delete from auth.users where id=any($1::uuid[])',[fixtureUsers]);
    await admin.query('alter role lifequest_auth2_server nologin');await admin.end();}
});
