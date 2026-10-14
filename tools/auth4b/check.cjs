'use strict';
// Real local SQL/Auth checks. No fixture cleanup DELETE, no secret output.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID,randomBytes,createHmac}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {Client}=require('../auth2/node_modules/pg');
const {status,project,ports}=require('./stack.cjs');
const {stateHash}=require('./state.cjs');
const checks=[]; const connections=[]; const logins=[];
let admin;
function pass(name){checks.push(name);console.log('PASS '+name);}
async function connect(url){const c=new Client({connectionString:url});await c.connect();connections.push(c);return c;}
async function denied(run,codes=['42501','23514','23503','23505','22003','22008']){
 let caught;try{await run();}catch(e){caught=e;}assert.ok(caught,'EXPECTED_REFUSAL');assert.ok(codes.includes(caught.code),'UNEXPECTED_SQL_CODE_'+caught.code);
}
async function main(){
 const cfg=status();const db=new URL(cfg.DB_URL);db.username='supabase_admin';admin=await connect(db.href);
 assert.equal((await admin.query('select rolsuper from pg_roles where rolname=current_user')).rows[0].rolsuper,true,'LOCAL_FIXTURE_ADMIN_REQUIRED');
 const api=new URL(cfg.API_URL).origin,key=cfg.PUBLISHABLE_KEY||cfg.ANON_KEY;
 async function request(route,token,body){const headers={apikey:key};if(token)headers.Authorization='Bearer '+token;if(body)headers['Content-Type']='application/json';
  const r=await fetch(api+route,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(5000)});
  let data;try{data=await r.json();}catch{}return{status:r.status,data};}
 async function signup(label){
  const email='auth4b-'+label+'-'+randomUUID()+'@example.test',password=randomBytes(24).toString('hex');
  const initial=await request('/auth/v1/signup',null,{email,password});
  if(initial.status!==200)console.error('Signup status '+initial.status+' code '+(/^[a-z_]+$/.test(initial.data?.error_code||'')?initial.data.error_code:'WITHHELD'));
  assert.equal(initial.status,200,'SIGNUP_FAILED');assert.ok(!initial.data.access_token);
  let hash;
  for(let i=0;i<40&&!hash;i++){
   const list=await(await fetch('http://127.0.0.1:'+ports.mail+'/api/v1/messages')).json();
   for(const m of list.messages||[]){if(!(m.To||[]).some(t=>t.Address===email))continue;
    const body=await(await fetch('http://127.0.0.1:'+ports.mail+'/api/v1/message/'+m.ID)).json();
    for(const match of (body.HTML||'').matchAll(/href="([^"]+)"/g)){const u=new URL(match[1].replaceAll('&amp;','&'));if(u.searchParams.get('type')==='email')hash=u.searchParams.get('token_hash');}
   }if(!hash)await new Promise(r=>setTimeout(r,250));
  }
  assert.ok(hash,'FICTIONAL_MAIL_REQUIRED');const confirmed=await request('/auth/v1/verify',null,{token_hash:hash,type:'email'});
  assert.equal(confirmed.status,200,'CONFIRMATION_FAILED');const token=confirmed.data.access_token;
  return{id:confirmed.data.user.id,token,refresh:confirmed.data.refresh_token,claims:JSON.parse(Buffer.from(token.split('.')[1],'base64url')),password,email};
 }
 const versions=(await admin.query('select version from supabase_migrations.schema_migrations order by version')).rows.map(r=>r.version);
 assert.equal(versions.length,10);assert.deepEqual(versions.slice(-6),Array.from({length:6},(_,i)=>'20261013000'+(i+1)+'00'));pass('ten migrations in order, six AUTH-4B');
 const roles=['lifequest_schema_owner','lifequest_command_owner','lifequest_read_owner','lifequest_provision_owner'];
 for(const role of roles){const r=(await admin.query('select * from pg_roles where rolname=$1',[role])).rows[0];assert.ok(!r.rolsuper&&!r.rolbypassrls&&!r.rolcanlogin&&!r.rolcreaterole&&!r.rolcreatedb);
  assert.equal((await admin.query('select count(*)::int n from pg_auth_members where member=(select oid from pg_roles where rolname=$1)',[role])).rows[0].n,0);}
 const memberships=await admin.query("select m.set_option,m.inherit_option from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member where r.rolname like 'lifequest_%owner' and u.rolname='postgres'");
 for(const m of memberships.rows)assert.ok(!m.set_option&&!m.inherit_option);pass('minimal NOLOGIN roles, no runtime inheritance or migration SET residue');
 const tables=(await admin.query("select c.relname,c.relrowsecurity,c.relforcerowsecurity,r.rolname owner from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_roles r on r.oid=c.relowner where n.nspname='lifequest' and c.relkind='r'")).rows;
 assert.equal(tables.length,20);for(const t of tables){assert.ok(t.relrowsecurity&&t.relforcerowsecurity);assert.equal(t.owner,'lifequest_schema_owner');
  for(const role of ['anon','authenticated']){assert.equal((await admin.query('select has_table_privilege($1,$2,$3) ok',[role,'lifequest.'+t.relname,'SELECT,INSERT,UPDATE,DELETE'])).rows[0].ok,false);}}
 for(const role of ['anon','authenticated'])assert.equal((await admin.query("select has_schema_privilege($1,'lifequest','USAGE') ok",[role])).rows[0].ok,false);
 for(const f of ['lifequest.current_actor()','lifequest.lock_session()','lifequest.provision_hunter()','lifequest.check_actor_integrity()','lifequest.module_counts_allowed(text,jsonb)','lifequest.days_allowed(date[])','lifequest.resource_url_allowed(text)']){
  for(const role of ['anon','authenticated'])assert.equal((await admin.query('select has_function_privilege($1,$2,\'EXECUTE\') ok',[role,f])).rows[0].ok,false);
  const r=(await admin.query("select proconfig from pg_proc where oid=$1::regprocedure",[f])).rows[0];assert.ok(r.proconfig.includes('search_path=""'));}
 assert.equal((await admin.query("select has_function_privilege('authenticated','public.auth2_award(uuid,uuid,text,boolean)','EXECUTE') ok")).rows[0].ok,false);
 pass('twenty private FORCE RLS tables, helpers private, AUTH-2 proof withdrawn');
 for(const column of ['opening_xp','legacy_roundoff_delta','historical'])assert.equal((await admin.query("select has_column_privilege('lifequest_command_owner','lifequest.hunters',$1,'INSERT,UPDATE') ok",[column])).rows[0].ok,false);
 for(const t of tables.filter(t=>!['command_receipts','hunter_setup'].includes(t.relname)))assert.equal((await admin.query("select has_column_privilege('lifequest_command_owner',$1,'historical','INSERT,UPDATE') ok",['lifequest.'+t.relname])).rows[0].ok,false);
 pass('gameplay role cannot write historical metadata, opening balance or roundoff delta');
 const a=await signup('a'),b=await signup('b');
 for(const actor of [a,b]){
  const h=(await admin.query('select * from lifequest.hunters where user_id=$1',[actor.id])).rows[0];assert.equal(h.total_xp,'0');assert.equal(h.opening_xp,'0');assert.equal(h.legacy_roundoff_delta,'0');assert.equal(h.timezone,null);
  assert.equal((await admin.query('select configuration_status from lifequest.hunter_setup where user_id=$1',[actor.id])).rows[0].configuration_status,'pending');
  assert.equal((await admin.query('select count(*)::int n from lifequest.hunter_modules where user_id=$1 and initialized',[actor.id])).rows[0].n,4);
  for(const t of ['hunter_profiles','xp_events','achievement_unlocks','command_receipts'])assert.equal((await admin.query('select count(*)::int n from lifequest.'+t+' where user_id=$1',[actor.id])).rows[0].n,0);
 }
 pass('real confirmed A/B signup provisions zero pending, no profile or artificial receipts');
 // Temporary real logins exercise the role itself, not postgres followed by SET ROLE.
 async function runtime(role){const password=randomBytes(24).toString('hex');await admin.query('alter role '+role+" login password '"+password+"'");logins.push(role);const u=new URL(cfg.DB_URL);u.username=role;u.password=password;return connect(u.href);}
 const command=await runtime('lifequest_command_owner'),reader=await runtime('lifequest_read_owner'),owner=await runtime('lifequest_schema_owner');
 async function tx(c,actor,fn,rollback=false){await c.query('begin');try{await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(actor?.claims||{})]);const result=await fn();await c.query(rollback?'rollback':'commit');return result;}catch(e){await c.query('rollback');throw e;}}
 // Operational prerequisite: guard lock must allow normal refresh and bounded logout ordering.
 await command.query('begin');await command.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(a.claims)]);
 await command.query('select lifequest.lock_session()');
 let finished=false;const logout=request('/auth/v1/logout',a.token,{}).then(r=>{finished=true;return r;});
 await new Promise(r=>setTimeout(r,300));assert.equal(finished,false,'LOGOUT_DID_NOT_WAIT_FOR_SESSION_LOCK');
 await command.query('commit');assert.equal((await logout).status,204,'LOGOUT_FAILED_AFTER_RELEASE');
 assert.equal(await tx(reader,a,async()=> (await reader.query('select count(*)::int n from lifequest.hunters')).rows[0].n),0);
 await denied(()=>tx(command,a,()=>command.query('select lifequest.lock_session()')));
 pass('session KEY SHARE serializes real logout; revoked actor denied after commit');
 // A has been revoked; a new confirmed session is obtained via actual password login.
 const signed=await request('/auth/v1/token?grant_type=password',null,{email:a.email,password:a.password});assert.equal(signed.status,200);
 a.token=signed.data.access_token;a.claims=JSON.parse(Buffer.from(a.token.split('.')[1],'base64url'));
 // Refresh Auth is tested while a valid session guard is held, then released.
 await command.query('begin');await command.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(b.claims)]);await command.query('select lifequest.lock_session()');
 const refresh=request('/auth/v1/token?grant_type=refresh_token',null,{refresh_token:b.refresh});
 await new Promise(r=>setTimeout(r,200));await command.query('commit');
 const refreshed=await refresh;assert.equal(refreshed.status,200,'REFRESH_UNSAFE_WITH_GUARD');
 b.token=refreshed.data.access_token;b.refresh=refreshed.data.refresh_token;b.claims=JSON.parse(Buffer.from(b.token.split('.')[1],'base64url'));
 // This expiry context is synthetic SQL, not a claim of cryptographic validation.
 await admin.query('begin');await admin.query('select id from auth.sessions where id=$1 for update',[b.claims.session_id]);
 const expiring=tx(command,{claims:{...b.claims,exp:Date.now()/1000+0.15}},()=>command.query('select lifequest.lock_session()'));
 const expiredDenial=denied(()=>expiring,['42501']);
 await new Promise(r=>setTimeout(r,350));await admin.query('rollback');await expiredDenial;
 // A contested guard aborts within its own lock timeout, without modifying Auth.
 await admin.query('begin');await admin.query('select id from auth.sessions where id=$1 for update',[b.claims.session_id]);
 const timeoutStart=Date.now();await denied(()=>tx(command,b,()=>command.query('select lifequest.lock_session()')),['55P03']);
 assert.ok(Date.now()-timeoutStart<2500,'GUARD_TIMEOUT_UNBOUNDED');await admin.query('rollback');
 pass('Auth refresh survives guard; expiration after waiting refused; contested guard timeout bounded');
 for(const actor of [a,b]){const rows=await tx(reader,actor,async()=> (await reader.query('select user_id from lifequest.hunters')).rows);assert.deepEqual(rows,[{user_id:actor.id}]);}
 assert.equal(await tx(owner,a,async()=> (await owner.query('select count(*)::int n from lifequest.hunters')).rows[0].n),0);
 assert.equal(await tx(command,a,async()=> (await command.query('update lifequest.hunters set total_xp=1 where user_id=$1',[b.id])).rowCount),0);
 pass('A/B isolation and table owner FORCE RLS denies private reads');
 for(const claims of [{},{...a.claims,exp:0},{...a.claims,exp:'NaN'},{...a.claims,exp:'Infinity'},{...a.claims,session_id:randomUUID()},{...a.claims,is_anonymous:true},{...a.claims,sub:b.id}]){
  const count=await tx(reader,{claims},async()=> (await reader.query('select count(*)::int n from lifequest.hunters')).rows[0].n);assert.equal(count,0);
 }
 const bad=a.token.slice(0,-12)+'AAAAAAAAAAAA';assert.equal((await request('/auth/v1/user',bad)).status,403);
 const docker='C:/Users/hp/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe';
 const info=JSON.parse(execFileSync(docker,['inspect','supabase_auth_'+project],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
 const secretEntry=info[0].Config.Env.find(v=>v.startsWith('GOTRUE_JWT_SECRET='));assert.ok(secretEntry,'LOCAL_SIGNING_SECRET_REQUIRED');
 const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
 const payload=Buffer.from(JSON.stringify({...a.claims,exp:Math.floor(Date.now()/1000)-60})).toString('base64url');
 const unsigned=header+'.'+payload;const expiredToken=unsigned+'.'+createHmac('sha256',secretEntry.slice('GOTRUE_JWT_SECRET='.length)).update(unsigned).digest('base64url');
 const expiredAPI=await request('/rest/v1/rpc/lifequest_session_active',expiredToken,{});assert.equal(expiredAPI.status,401);assert.match(JSON.stringify(expiredAPI.data),/expired/i);
 const rest=await fetch(api+'/rest/v1/hunters',{headers:{apikey:key,Authorization:'Bearer '+a.token,'Accept-Profile':'lifequest'}});assert.ok(rest.status>=400);
 const proof=await fetch(api+'/rest/v1/progress',{headers:{apikey:key,Authorization:'Bearer '+a.token,'Accept-Profile':'auth2_proof'}});assert.ok(proof.status>=400);
 pass('absent, expired, anonymous, mismatched and invalid sessions refused; API schemas unexposed');
 const publicProof=await request('/rest/v1/rpc/auth2_award',a.token,{expected_actor:a.id,request_id:randomUUID(),reward_id:'forbidden'});assert.ok(publicProof.status>=400);
 for(const role of ['anon','authenticated'])await denied(()=>tx(admin,a,async()=>{await admin.query('set local role '+role);await admin.query('select * from lifequest.hunters');}));
 await denied(()=>tx(admin,a,async()=>{await admin.query('set local role authenticated');await admin.query('select lifequest.lock_session()');}));
 await denied(()=>tx(command,a,()=>command.query('update lifequest.hunters set legacy_roundoff_delta=1 where user_id=$1',[a.id])));
 await denied(()=>tx(command,a,()=>command.query("update lifequest.hunter_modules set historical='{}' where user_id=$1",[a.id])));
 assert.equal(await tx(reader,null,async()=> (await reader.query('select count(*)::int n from lifequest.hunters')).rows[0].n),0);
 pass('direct anon/authenticated SQL, helper misuse, proof RPC and historical writes denied');
 // Idempotent trigger re-entry without updating any Auth identity or resetting a Hunter.
 await admin.query('begin');await admin.query('update lifequest.hunters set revision=17 where user_id=$1',[a.id]);
 await admin.query('create temporary table provision_reentry(id uuid) on commit drop');
 await admin.query('create trigger provision_test after insert on provision_reentry for each row execute function lifequest.provision_hunter()');
 await admin.query('insert into provision_reentry values($1)',[a.id]);await admin.query('commit');
 assert.equal((await admin.query('select revision from lifequest.hunters where user_id=$1',[a.id])).rows[0].revision,'17');
 assert.equal((await admin.query('select count(*)::int n from lifequest.hunter_modules where user_id=$1',[a.id])).rows[0].n,4);pass('provision re-entry preserves existing envelope and revisions');
 // Signup fault injection is a temporary CHECK on this isolated fictional database only.
 const beforeFault=(await admin.query('select count(*)::int n from auth.users')).rows[0].n;
 await admin.query('alter table lifequest.hunters add constraint auth4b_test_fault check(total_xp<>0) not valid');
 try{const failed=await request('/auth/v1/signup',null,{email:'auth4b-fault-'+randomUUID()+'@example.test',password:randomBytes(24).toString('hex')});assert.equal(failed.status,500);
  assert.equal((await admin.query('select count(*)::int n from auth.users')).rows[0].n,beforeFault);
 }finally{await admin.query('alter table lifequest.hunters drop constraint auth4b_test_fault');}
 pass('provisioning error makes signup fail atomically, no partial identity');
 // Synthetic constraints use rollback-only fixtures. No reward algorithm is invoked.
 async function fixture(sql,params=[],codes){await denied(()=>tx(admin,a,()=>admin.query(sql,params)),codes);}
 for(const value of ['NaN','Infinity','-Infinity','-1'])await fixture('update lifequest.hunters set total_xp=$1 where user_id=$2',[value,a.id]);
 await fixture('update lifequest.hunters set revision=-1 where user_id=$1',[a.id]);
 await fixture('update lifequest.hunters set total_xp=1 where user_id=$1',[a.id]);
 await fixture("insert into lifequest.xp_events(user_id,id,source_ref,source_kind,source_id,period_key,awarded_xp,attribute,occurred_at,rules_version,provenance,sort_position) values($1,'missing','missing','quest','missing','once',0,'focus',now(),'v1','cloud',0)",[a.id]);
 pass('finite numeric, nonnegative revision, ledger coherence and normal-quest orphan constraints');
 await fixture("update lifequest.hunter_modules set collection_counts='{\"quests\":-1,\"arcs\":0,\"completions\":0,\"achievements\":0}' where user_id=$1 and module_code='system'",[a.id]);
 await fixture('update lifequest.hunter_setup set migration_id=$1 where user_id=$2',[randomUUID(),a.id]);
 await fixture("update lifequest.hunter_settings set penalty_days=array['infinity'::date] where user_id=$1",[a.id]);
 await fixture("update lifequest.hunters set timezone='Invalid/Zone',timezone_confirmed_at=now() where user_id=$1",[a.id]);
 await fixture("insert into lifequest.focus_runs(user_id,id,mode,status,remaining_seconds,running_since,label,sort_position) values($1,'bad-run','focus','running',1500,now(),'',0)",[a.id]);
 await fixture("insert into lifequest.hunter_profiles(user_id,name,age,gender,avatar,goals,onboarding_completed,original_created_at) values($1,'',13,'male','male','{}',true,now())",[a.id]);
 pass('module count shape, finite historical dates, IANA timezone, Focus timestamps and profile constraints');
 await tx(admin,a,async()=>{
  await admin.query("insert into lifequest.story_arcs(user_id,id,title,description,target_date,created_at,sort_position) values($1,'b-only','b','','2026-10-13',now(),0)",[b.id]);
  await denied(()=>admin.query("insert into lifequest.quests(user_id,id,arc_id,title,description,frequency,difficulty,attribute,base_xp,created_at,sort_position) values($1,'q','b-only','','','once','EASY','focus',0,now(),0)",[a.id]),['23503']);
 },true).catch(e=>{assert.equal(e.code,'25P02');});
 // Subobjective IDs can repeat between bosses; never link a different actor's Boss.
 await tx(admin,a,async()=>{
  for(const id of ['one','two']){
   await admin.query("insert into lifequest.boss_missions(user_id,id,title,objective,mode,target,current,base_xp,created_at,sort_position) values($1,$2,'Boss','','weighted',1,0,25,now(),0)",[a.id,id]);
   await admin.query("insert into lifequest.boss_subobjectives(user_id,boss_id,id,title,weight,completed,sort_position) values($1,$2,'same','Goal',1,false,0)",[a.id,id]);
  }
  await admin.query('set constraints all immediate');
 },true);pass('composite Arc FK and Boss-scoped subobjective IDs');
 // Actual mutation role: same IDs in A/B remain isolated, all FK scopes tested.
 await tx(admin,b,async()=>{
  await admin.query("insert into lifequest.story_arcs(user_id,id,title,description,target_date,created_at,sort_position) values($1,'foreign','B','','2026-10-13',now(),0)",[b.id]);
  await admin.query("insert into lifequest.mind_nodes(user_id,id,parent_id,title,x,y,sort_position) values($1,'foreign',null,'B',0,0,0)",[b.id]);
  await admin.query("insert into lifequest.boss_missions(user_id,id,title,objective,mode,target,current,base_xp,created_at,sort_position) values($1,'foreign','B','','counter',1,0,0,now(),0)",[b.id]);
  await admin.query("insert into lifequest.focus_runs(user_id,id,mode,status,remaining_seconds,label,sort_position) values($1,'foreign','focus','idle',1500,'B',0)",[b.id]);
 });
 for(const sql of [
  "insert into lifequest.quests(user_id,id,arc_id,title,description,frequency,difficulty,attribute,base_xp,created_at,sort_position) values($1,'cross','foreign','','','once','EASY','focus',0,now(),0)",
  "insert into lifequest.boss_subobjectives(user_id,boss_id,id,title,weight,completed,sort_position) values($1,'foreign','cross','X',1,false,0)",
  "insert into lifequest.mind_nodes(user_id,id,parent_id,title,x,y,sort_position) values($1,'cross','foreign','X',0,0,0)",
  "insert into lifequest.focus_sessions(user_id,id,run_id,occurred_at,minutes,label,sort_position) values($1,'foreign','foreign',now(),25,'X',0)"
 ])await denied(()=>tx(command,a,()=>command.query(sql,[a.id])),['23503']);
 await denied(()=>tx(command,a,()=>command.query("insert into lifequest.ideas(user_id,id,title,content,tag,archived,created_at,sort_position) values($1,'cross','','','',false,now(),0)",[b.id])),['42501']);
 for(const actor of [a,b])await tx(command,actor,()=>command.query("insert into lifequest.ideas(user_id,id,title,content,tag,archived,created_at,sort_position) values($1,'same-id','Fiction','','',false,now(),7)",[actor.id]));
 for(const actor of [a,b])assert.deepEqual(await tx(reader,actor,async()=> (await reader.query("select user_id,id,sort_position from lifequest.ideas where id='same-id'")).rows),[{user_id:actor.id,id:'same-id',sort_position:'7'}]);
 pass('actual role composite FK refusal for Arc/Boss/Mind/Focus; same IDs and order preserved in A/B');
 await fixture("insert into lifequest.boss_missions(user_id,id,title,objective,mode,target,current,base_xp,created_at,completed_at,reward_status,sort_position) values($1,'false-credit','Boss','','counter',1,1,0,now(),now(),'credited',0)",[a.id]);
 await tx(admin,a,async()=>{
  await admin.query("insert into lifequest.boss_missions(user_id,id,title,objective,mode,target,current,base_xp,created_at,completed_at,reward_status,sort_position) values($1,'zero','Boss','','counter',1,1,0,now(),now(),'resolved_without_xp',0)",[a.id]);
  await admin.query("insert into lifequest.focus_sessions(user_id,id,occurred_at,minutes,label,sort_position) values($1,'historical',now(),12.125,'Historical',-7)",[a.id]);
  await admin.query('set constraints all immediate');
 },true);
 await fixture("insert into lifequest.focus_sessions(user_id,id,occurred_at,minutes,label,reward_status,sort_position) values($1,'false-focus',now(),25,'','credited',0)",[a.id]);
 pass('F03 zero resolution and fractional status-less Focus preserved; false F04 credits rejected');
 await fixture("insert into lifequest.boss_missions(user_id,id,title,objective,mode,target,current,base_xp,created_at,reward_status,sort_position) values($1,'unfinished','Boss','','counter',1,0,25,now(),'pending',0)",[a.id]);
 // Fractional orphan activity receipts are legitimate; uniqueness does not require a source FK.
 const orphanSQL="insert into lifequest.xp_events(user_id,id,source_ref,source_kind,source_id,period_key,awarded_xp,attribute,occurred_at,rules_version,provenance,sort_position) values($1,$2,'lifequest:activity:focus:orphan:with:colon','focus','orphan:with:colon','once',0.125,'focus',now(),'legacy','legacy',2)";
 await tx(admin,a,async()=>{
  await admin.query(orphanSQL,[a.id,'orphan1']);await admin.query('update lifequest.hunters set total_xp=total_xp+0.125 where user_id=$1',[a.id]);
 });
 assert.equal((await admin.query('select total_xp from lifequest.hunters where user_id=$1',[a.id])).rows[0].total_xp,'0.125');
 await fixture(orphanSQL,[a.id,'orphan2'],['23505']);
 assert.equal((await admin.query("select count(*)::int n from lifequest.xp_events where user_id=$1 and source_id='orphan:with:colon'",[a.id])).rows[0].n,1);
 await denied(()=>tx(command,a,()=>command.query("delete from lifequest.xp_events where user_id=$1",[a.id])),['42501']);
 pass('fractional XP stored exactly, orphan activity accepted, receipt uniqueness and immutable ledger enforced');
 // Ledger survives source/Arc removal; no cascade can erase a historical credit.
 await tx(admin,a,async()=>{
  await admin.query("insert into lifequest.story_arcs(user_id,id,title,description,target_date,created_at,sort_position) values($1,'removed-arc','','','2026-10-13',now(),0)",[a.id]);
  await admin.query("insert into lifequest.quests(user_id,id,arc_id,title,description,frequency,difficulty,attribute,base_xp,created_at,sort_position) values($1,'kept-quest','removed-arc','','','daily','NORMAL','focus',77.125,now(),0)",[a.id]);
  await admin.query("insert into lifequest.xp_events(user_id,id,source_ref,source_kind,source_id,period_key,awarded_xp,attribute,occurred_at,arc_id_snapshot,rules_version,provenance,sort_position) values($1,'kept-receipt','kept-quest','quest','kept-quest','2026-10-13',0,'focus',now(),'removed-arc','legacy','legacy',3)",[a.id]);
  await denied(()=>admin.query("delete from lifequest.story_arcs where user_id=$1 and id='removed-arc'",[a.id]),['23503']);
 },true);
 await tx(admin,a,async()=>{
  const receiptId=randomUUID();
  await admin.query("insert into lifequest.command_receipts(user_id,request_id,command_kind,canonical_payload_hash,minimal_result,committed_revision,committed_at) values($1,$2,'fixture',repeat('a',64),'{}',17,now())",[a.id,receiptId]);
  await admin.query('savepoint duplicate_receipt');
  await denied(()=>admin.query("insert into lifequest.command_receipts(user_id,request_id,command_kind,canonical_payload_hash,minimal_result,committed_revision,committed_at) values($1,$2,'fixture',repeat('b',64),'{}',17,now())",[a.id,receiptId]),['23505']);
  await admin.query('rollback to savepoint duplicate_receipt');
 },true);
 await denied(()=>tx(command,a,()=>command.query('update lifequest.command_receipts set committed_revision=18 where user_id=$1',[a.id])),['42501']);
 pass('no cascading ledger loss and immutable unique command receipt key (no RPG command implemented)');
 await tx(admin,a,async()=>{
  await admin.query("insert into lifequest.resources(user_id,id,title,notes,url,topic,mastered,created_at,sort_position,historical) values($1,'optional','','','','',false,now(),3,'{\"absent\":[\"legacy\"],\"extras\":{\"x\":null}}')",[a.id]);
  await admin.query("insert into lifequest.creativity_challenges(user_id,id,prompt,response,occurred_at,completed,sort_position) values($1,'c1','','',now(),false,0),($1,'c2','','',now(),false,1)",[a.id]);
 },true);
 for(const url of ['javascript:alert(1)','https://user:password@example.test','https://example.test:99999','https://'])await fixture("insert into lifequest.resources(user_id,id,title,notes,url,topic,mastered,created_at,sort_position) values($1,'bad','','',$2,'',false,now(),0)",[a.id,url]);
 await fixture("insert into lifequest.mind_nodes(user_id,id,parent_id,title,x,y,sort_position) values($1,'a','b','',0,0,0),($1,'b','a','',0,0,1)",[a.id]);
 pass('optional URLs, metadata, ordered collections, no creative daily uniqueness and cycle refusal');
 // Reconnect via Auth does not reset a modified fictional Hunter.
 const reconnected=await request('/auth/v1/token?grant_type=password',null,{email:a.email,password:a.password});assert.equal(reconnected.status,200);
 const h=(await admin.query('select total_xp,revision from lifequest.hunters where user_id=$1',[a.id])).rows[0];assert.deepEqual(h,{total_xp:'0.125',revision:'17'});
 // Reconcile synthetic module counts before restart; this is a fixture, not a reader RPC.
 for(const actor of [a,b])for(const [module,map] of Object.entries({system:{quests:'quests',arcs:'story_arcs',completions:'xp_events',achievements:'achievement_unlocks'},operations:{bosses:'boss_missions',events:'system_events'},lab:{ideas:'ideas',nodes:'mind_nodes',resources:'resources',journal:'journal_entries',sessions:'focus_sessions',challenges:'creativity_challenges'},settings:{}})){
  const counts={};for(const [field,table] of Object.entries(map))counts[field]=(await admin.query('select count(*)::int n from lifequest.'+table+' where user_id=$1',[actor.id])).rows[0].n;
  await admin.query('update lifequest.hunter_modules set collection_counts=$1 where user_id=$2 and module_code=$3',[JSON.stringify(counts),actor.id,module]);
 }
 pass('real reconnection preserves Hunter XP/revision; fictional module counts reconciled');
 fs.mkdirSync(path.join(__dirname,'.results'),{recursive:true});
 const hash=await stateHash(admin,[a.id,b.id]);
 fs.writeFileSync(path.join(__dirname,'.results/'+project+'-report.json'),JSON.stringify({project,checks,fixtureIds:[a.id,b.id],stateHash:hash,migrations:versions},null,2));
 console.log('PASS '+checks.length+' groups; fictional fixtures retained for restart proof');
}
main().catch(e=>{const label=String(e.message||'').match(/^[A-Z][A-Z_0-9]+/);console.error('FAIL '+(e.code||'CHECK_FAILED')+(label?' '+label[0]:''));process.exitCode=1;}).finally(async()=>{
 for(const c of connections.reverse())if(c!==admin){await c.query('rollback').catch(()=>{});await c.end().catch(()=>{});}
 if(admin){await admin.query('rollback').catch(()=>{});for(const role of logins)await admin.query('alter role '+role+' nologin password null').catch(()=>{});await admin.end().catch(()=>{});}
});
