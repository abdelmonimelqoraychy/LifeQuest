'use strict';
// All commands below go through real PostgREST with actual signed fictional JWTs.
// Administrative SQL is confined to fixture setup, fault injection and verification.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {randomUUID,randomBytes,createHash,createHmac}=require('node:crypto');
const {execFileSync}=require('node:child_process');const {Client}=require('../auth2/node_modules/pg');
const {status,project,ports,env,databaseContainer}=require('./stack.cjs');
const checks=[];let admin,api,key;const actors=[];
function pass(name){checks.push(name);console.log('PASS '+name);}
function canonical(v){if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';return JSON.stringify(v);}
async function request(route,token,body){
 const headers={apikey:key};if(token)headers.Authorization='Bearer '+token;if(body!==undefined)headers['Content-Type']='application/json';
 const response=await fetch(api+route,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
 let data;try{data=await response.json();}catch{}return{status:response.status,data};
}
async function signup(label){
 const email='auth4c-'+label+'-'+randomUUID()+'@example.test',password=randomBytes(24).toString('hex');
 const initial=await request('/auth/v1/signup',null,{email,password});assert.equal(initial.status,200,'SIGNUP');assert.ok(!initial.data.access_token);
 let hash;
 for(let i=0;i<40&&!hash;i++){
  const list=await(await fetch('http://127.0.0.1:'+ports.mail+'/api/v1/messages')).json();
  for(const m of list.messages||[]){if(!(m.To||[]).some(t=>t.Address===email))continue;
   const body=await(await fetch('http://127.0.0.1:'+ports.mail+'/api/v1/message/'+m.ID)).json();
   for(const match of (body.HTML||'').matchAll(/href="([^"]+)"/g)){const u=new URL(match[1].replaceAll('&amp;','&'));if(u.searchParams.get('type')==='email')hash=u.searchParams.get('token_hash');}
  }if(!hash)await new Promise(r=>setTimeout(r,100));
 }
 assert.ok(hash,'SMTP_CONFIRMATION');const result=await request('/auth/v1/verify',null,{token_hash:hash,type:'email'});assert.equal(result.status,200,'VERIFY');
 const a={id:result.data.user.id,token:result.data.access_token,email,password,claims:JSON.parse(Buffer.from(result.data.access_token.split('.')[1],'base64url'))};actors.push(a);return a;
}
function endpoint(kind){return kind.startsWith('boss.')||kind.startsWith('focus.')?'lifequest_operations_command':/^(idea|node|resource|journal|creativity)\./.test(kind)?'lifequest_lab_command':'lifequest_quest_command';}
async function call(a,kind,payload={},id=randomUUID(),extra={}){return request('/rest/v1/rpc/'+endpoint(kind),a.token,{expected_actor:a.id,request_id:id,kind,payload,...extra});}
async function ok(a,kind,payload={},id){const r=await call(a,kind,payload,id);if(r.status!==200)console.log('DIAGNOSTIC '+kind+' HTTP '+r.status+' SQL '+(r.data?.code||'UNKNOWN'));
 assert.equal(r.status,200,'RPC_'+kind);assert.equal(r.data.actor,a.id);return r.data;}
async function no(a,kind,payload={},id,extra){const r=await call(a,kind,payload,id,extra);assert.ok(r.status>=400,'EXPECTED_RPC_REFUSAL_'+kind);return r;}
async function totals(a){return (await admin.query('select total_xp::text xp,revision::text revision from lifequest.hunters where user_id=$1',[a.id])).rows[0];}
async function snapshot(a){const r=await request('/rest/v1/rpc/lifequest_hunter_snapshot',a.token,{expected_actor:a.id});if(r.status!==200||r.data?.state!=='ready')console.error('SAFE_SNAPSHOT_DIAGNOSTIC status='+r.status+' code='+(r.data?.code||'')+' message='+(r.data?.message||'')+' state='+(r.data?.state||''));assert.equal(r.status,200,'SNAPSHOT_AFTER_COMMAND');assert.equal(r.data.actor,a.id);assert.equal(r.data.state,'ready');return r.data;}
async function refreshCounts(a){await admin.query("update lifequest.hunter_modules set collection_counts=lifequest.module_counts($1,module_code) where user_id=$1",[a.id]);}
const draft=(title='Quest')=>({title,description:'Synthetic fixture',frequency:'daily',difficulty:'EASY',attribute:'focus'});
async function main(){
 assert.equal(project,'lifequest-auth4d-reader-20261013','AUTHORIZED_READER_STACK_ONLY');const cfg=status();api=cfg.API_URL;key=cfg.PUBLISHABLE_KEY||cfg.ANON_KEY;
 assert.equal(new URL(api).hostname,'127.0.0.1','LOCAL_API_ONLY');assert.equal(new URL(api).port,'64521','READER_API_PORT_ONLY');
 const u=new URL(cfg.DB_URL);u.username='supabase_admin';admin=new Client({connectionString:u.href});await admin.connect();
 const versions=(await admin.query('select version from supabase_migrations.schema_migrations order by version')).rows.map(r=>r.version);
 assert.equal(versions.length,23,'READER_MIGRATION_COUNT');
 const migrationNames=fs.readdirSync(path.resolve(__dirname,'../../supabase/migrations')).filter(n=>n.endsWith('.sql')).sort();
 assert.equal(migrationNames.length,23,'SOURCE_MIGRATION_COUNT');
 for(const name of migrationNames){const source=fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations',name));const installed=fs.readFileSync(path.join('C:/Users/hp/myproject/lifequest-auth4d-reader-20261013/supabase/migrations',name));assert.equal(createHash('sha256').update(installed).digest('hex'),createHash('sha256').update(source).digest('hex'),'MIGRATION_SOURCE_MATCH_'+name);}
 const fixtureAudit=(await admin.query("select count(*)::int total,count(*) filter(where email not like '%@example.test')::int non_fixture,(select count(*)::int from lifequest.hunters) hunters from auth.users")).rows[0];
 assert.ok(fixtureAudit.total>0,'FICTIONAL_FIXTURES_PRESENT');assert.equal(fixtureAudit.non_fixture,0,'NO_NON_FIXTURE_AUTH_USERS');assert.equal(fixtureAudit.hunters,fixtureAudit.total,'FIXTURE_HUNTER_ACCOUNT_PARITY');
 const zones=['UTC','Africa/Casablanca','Europe/Paris','America/New_York','Pacific/Auckland'];
 const activations=(await admin.query("select zone,probes,expected_digest,range_start,range_end,validated_at,expires_at,oracle_version,lifequest.calendar_digest(zone,probes) actual_digest from lifequest.calendar_activation order by zone")).rows;
 assert.deepEqual(activations.map(x=>x.zone).sort(),zones.slice().sort(),'FIVE_CALENDAR_ZONES_ACTIVE');
 for(const row of activations){assert.equal(row.expected_digest,row.actual_digest,'CALENDAR_DIGEST_CURRENT_'+row.zone);assert.ok(new Date(row.range_start)<=new Date(),'CALENDAR_RANGE_STARTED_'+row.zone);assert.ok(new Date(row.range_end)>new Date(),'CALENDAR_RANGE_CURRENT_'+row.zone);assert.ok(new Date(row.validated_at)<=new Date(),'CALENDAR_VALIDATED_'+row.zone);assert.ok(new Date(row.expires_at)>new Date(),'CALENDAR_ACTIVATION_UNEXPIRED_'+row.zone);assert.equal(row.oracle_version,'node24.19-icu78.3-tz2026e','CALENDAR_ORACLE_VERSION_'+row.zone);}
 const functions=(await admin.query("select p.oid::text,p.proname,p.prosecdef,p.proconfig,r.rolname owner from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where n.nspname='public' and p.proname in ('lifequest_quest_command','lifequest_operations_command','lifequest_lab_command')")).rows;
 assert.equal(functions.length,3);for(const f of functions){assert.equal(f.owner,'lifequest_command_owner');assert.equal(f.prosecdef,true);assert.ok(f.proconfig.includes('search_path=""'));assert.ok(f.proconfig.includes('statement_timeout=5s'));
  for(const role of ['anon','authenticated'])assert.equal((await admin.query("select has_function_privilege($1,$2::oid,'EXECUTE') ok",[role,f.oid])).rows[0].ok,role==='authenticated');}
 for(const f of (await admin.query("select oid::text from pg_proc where pronamespace='lifequest'::regnamespace")).rows)for(const role of ['anon','authenticated'])assert.equal((await admin.query("select has_function_privilege($1,$2::oid,'EXECUTE') ok",[role,f.oid])).rows[0].ok,false);
 for(const t of (await admin.query("select c.oid::text,c.relrowsecurity,c.relforcerowsecurity from pg_class c where c.relnamespace='lifequest'::regnamespace and c.relkind='r'")).rows){assert.ok(t.relrowsecurity&&t.relforcerowsecurity);for(const role of ['anon','authenticated'])assert.equal((await admin.query("select has_table_privilege($1,$2::oid,'SELECT,INSERT,UPDATE,DELETE') ok",[role,t.oid])).rows[0].ok,false);}
 assert.equal((await admin.query("select has_table_privilege('lifequest_command_owner','lifequest.calendar_activation','INSERT,UPDATE,DELETE') ok")).rows[0].ok,false);
 const role=(await admin.query("select rolsuper,rolbypassrls,rolcanlogin from pg_roles where rolname='lifequest_command_owner'")).rows[0];assert.ok(!role.rolsuper&&!role.rolbypassrls&&!role.rolcanlogin);
 pass('three allowlisted limited SECURITY DEFINER RPCs, helpers private, FORCE RLS and immutable activation');
 const a=await signup('a'),b=await signup('b'),pending=await signup('pending');
 await no(pending,'quest.create',draft());
 for(const x of [a,b]){
  await admin.query('begin');
  await admin.query("update lifequest.hunters set timezone='Africa/Casablanca',timezone_confirmed_at=clock_timestamp(),opening_xp=$2,total_xp=$2 where user_id=$1",[x.id,x===a?'0.45454545454545453':'0']);
  await admin.query("update lifequest.hunter_setup set origin_choice='new',chosen_at=clock_timestamp(),configuration_status='ready' where user_id=$1",[x.id]);
  await admin.query("insert into lifequest.hunter_profiles(user_id,name,age,gender,avatar,goals,onboarding_completed,original_created_at) values($1,'Fictional Hunter',25,'other','male','{}',true,clock_timestamp())",[x.id]);
  await admin.query('commit');
 }
 pass('real signup/SMTP for A/B; pending remains protected; ready fixtures administrative only');
 const intention=randomUUID(),created=await Promise.all([ok(a,'quest.create',draft('Same title'),intention),ok(a,'quest.create',draft('Same title'),intention)]);
 assert.equal(created[0].result.id,created[1].result.id);assert.equal(created.filter(r=>r.replayed).length,1);
 const q=created[0].result.id;
 await no(a,'quest.create',draft('Changed title'),intention);
 const replay=await ok(a,'quest.create',Object.fromEntries(Object.entries(draft('Same title')).reverse()),intention);assert.equal(replay.result.id,q);
 const hash=(await admin.query('select canonical_payload_hash from lifequest.command_receipts where user_id=$1 and request_id=$2',[a.id,intention])).rows[0].canonical_payload_hash;
 assert.equal(hash,createHash('sha256').update(canonical({version:1,kind:'quest.create',payload:draft('Same title')})).digest('hex'));
 const separate=await ok(a,'quest.create',draft('Same title'));assert.notEqual(separate.result.id,q);
 pass('concurrent creation retry, canonical key order/hash, payload conflict and distinct same-title intentions');
 const credits=await Promise.all([ok(a,'quest.complete',{id:q}),ok(a,'quest.complete',{id:q})]);
 assert.equal(credits.filter(r=>r.result.credited).length,1);assert.equal((await totals(a)).xp,'30.45454545454545453');
 const questSnapshot=await snapshot(a);assert.equal(questSnapshot.exactXP.total,(await totals(a)).xp);assert.equal(questSnapshot.entityRevisions.quests[q],'0');assert.ok(questSnapshot.data.system.completions.some(row=>row.questId===q&&row.xpAwarded==='30'));
 const ledgerBefore=(await admin.query('select to_jsonb(e)::text data from lifequest.xp_events e where user_id=$1 order by id',[a.id])).rows;
 await ok(a,'quest.archive',{id:q,expectedRevision:'0'});await ok(a,'quest.archive',{id:q,expectedRevision:'99'});
 await ok(a,'quest.restore',{id:q,expectedRevision:'1'});await ok(a,'quest.complete',{id:q});
 assert.deepEqual((await admin.query('select to_jsonb(e)::text data from lifequest.xp_events e where user_id=$1 order by id',[a.id])).rows,ledgerBefore);
 await no(a,'quest.update',{...draft(),id:q,expectedRevision:'0'});
 await ok(a,'quest.update',{...draft(),id:q,expectedRevision:'2',frequency:'weekly'});await no(a,'quest.complete',{id:q});
 pass('one exact fractional-balance credit, archive/restore identity and receipts, stale edits and cooldown');
 const once=await ok(a,'quest.create',{...draft(),frequency:'once'});await ok(a,'quest.complete',{id:once.result.id});
 await no(a,'quest.update',{...draft(),id:once.result.id,expectedRevision:'0',frequency:'daily'});
 const day=(await admin.query("select to_char(clock_timestamp() at time zone 'Africa/Casablanca','YYYY-MM-DD') d")).rows[0].d;
 const arc=await ok(a,'arc.create',{title:'Arc',description:'Fixture',targetDate:day});
 const linked=await ok(a,'quest.create',{...draft(),arcId:arc.result.id});await ok(a,'quest.complete',{id:linked.result.id});
 const detached=await ok(a,'arc.delete',{id:arc.result.id,expectedRevision:'0'});assert.equal(detached.result.detached,1);
 const link=(await admin.query('select arc_id,revision::text from lifequest.quests where user_id=$1 and id=$2',[a.id,linked.result.id])).rows[0];assert.equal(link.arc_id,null);assert.equal(link.revision,'1');
 assert.equal((await admin.query('select arc_id_snapshot from lifequest.xp_events where user_id=$1 and source_ref=$2',[a.id,linked.result.id])).rows[0].arc_id_snapshot,arc.result.id);
 pass('once terminal; Arc delete only detaches actual links and preserves XP snapshots');
 const bq=await ok(b,'quest.create',draft('Private B'));await no(a,'quest.complete',{id:bq.result.id});await no(a,'quest.create',draft(),undefined,{expected_actor:b.id});
 for(const bad of [{...draft(),xp:999},{...draft(),period_key:'once'},{...draft(),timezone:'UTC'},{...draft(),title:'\u00a0\ufeff'}])await no(a,'quest.create',bad);
 const anon=await request('/rest/v1/rpc/lifequest_quest_command',null,{expected_actor:a.id,request_id:randomUUID(),kind:'quest.complete',payload:{id:q}});assert.ok(anon.status>=400);
 const direct=await fetch(api+'/rest/v1/hunters',{method:'PATCH',headers:{apikey:key,Authorization:'Bearer '+a.token,'Content-Type':'application/json','Content-Profile':'lifequest'},body:JSON.stringify({total_xp:999})});assert.ok(direct.status>=400);
 pass('direct JWT A/B, expected_actor substitution, anon, forged reward/calendar payloads and private DML denied');
 const boss=await ok(a,'boss.create',{title:'Boss',subObjectives:[{title:'Step 1',weight:1},{title:'Step 2',weight:2}]});
 await ok(a,'boss.progress',{id:boss.result.id,expectedRevision:'0',subId:boss.result.subIds[0]});
 const last=await Promise.all([ok(a,'boss.progress',{id:boss.result.id,expectedRevision:'1',subId:boss.result.subIds[1]}),ok(a,'boss.progress',{id:boss.result.id,expectedRevision:'1',subId:boss.result.subIds[1]})]);
 assert.equal(last.filter(r=>r.result.credited).length,1);
 assert.equal((await admin.query('select count(*)::int n from lifequest.xp_events where user_id=$1 and source_ref=$2',[a.id,'lifequest:activity:boss:'+boss.result.id])).rows[0].n,1);
 await admin.query("insert into lifequest.boss_missions(user_id,id,title,objective,mode,target,current,base_xp,created_at,completed_at,reward_status,sort_position) values($1,'historical-zero','Zero','Fixture','counter',1,1,0,clock_timestamp(),clock_timestamp(),'pending',999)",[a.id]);await refreshCounts(a);
 const beforeZero=await totals(a);const zero=await ok(a,'boss.claim',{id:'historical-zero',expectedRevision:'0'});assert.equal(zero.result.status,'resolved_without_xp');assert.equal((await totals(a)).xp,beforeZero.xp);
 await ok(a,'boss.claim',{id:'historical-zero',expectedRevision:'0'});
 pass('concurrent last Boss objective credits once; F03 historical zero resolves without fictitious XP');
 const run=await ok(a,'focus.start',{mode:'focus',label:'Fixture'});await no(a,'focus.finish',{id:run.result.id,expectedRevision:'0'});
 await no(a,'focus.pause',{id:run.result.id,expectedRevision:'0',deadline:'2000-01-01Z'});
 await ok(a,'focus.pause',{id:run.result.id,expectedRevision:'0'});await ok(a,'focus.resume',{id:run.result.id,expectedRevision:'1'});await ok(a,'focus.cancel',{id:run.result.id,expectedRevision:'2'});
 const full=await ok(a,'focus.start',{mode:'focus',label:'Elapsed server fixture'});
 await admin.query("update lifequest.focus_runs set running_since=clock_timestamp()-interval '1501 seconds',deadline_at=clock_timestamp()-interval '1 second' where user_id=$1 and id=$2",[a.id,full.result.id]);
 const focus=await Promise.all([ok(a,'focus.finish',{id:full.result.id,expectedRevision:'0'}),ok(a,'focus.finish',{id:full.result.id,expectedRevision:'0'})]);assert.equal(focus.filter(r=>r.result.credited).length,1);
 await admin.query("insert into lifequest.focus_sessions(user_id,id,occurred_at,minutes,label,sort_position) values($1,'history-no-run',clock_timestamp(),10.25,'Historical',999)",[a.id]);await refreshCounts(a);
 await no(a,'focus.claim',{id:'history-no-run',expectedRevision:'0'});
 const rest=await ok(a,'focus.start',{mode:'short',label:'Rest'});const beforeRest=(await totals(a)).xp;
 await admin.query("update lifequest.focus_runs set running_since=clock_timestamp()-interval '301 seconds',deadline_at=clock_timestamp()-interval '1 second' where user_id=$1 and id=$2",[a.id,rest.result.id]);await ok(a,'focus.finish',{id:rest.result.id,expectedRevision:'0'});assert.equal((await totals(a)).xp,beforeRest);
 pass('Focus server duration, pause/resume stable ID, concurrent finish, rest without XP, unproved history refused');
 const beforeLab=(await totals(a)).xp;
 const idea=await ok(a,'idea.create',{title:'Idea',content:'Text',tag:'Tag'});await ok(a,'idea.set_archived',{id:idea.result.id,expectedRevision:'0',archived:true});await ok(a,'idea.delete',{id:idea.result.id,expectedRevision:'1'});
 const parent=await ok(a,'node.create',{title:'Root'});const node=await ok(a,'node.create',{title:'Child',parentId:parent.result.id});await ok(a,'node.delete',{id:parent.result.id,expectedRevision:'0'});
 assert.equal((await admin.query('select parent_id from lifequest.mind_nodes where user_id=$1 and id=$2',[a.id,node.result.id])).rows[0].parent_id,null);
 const resource=await ok(a,'resource.create',{title:'Resource',notes:'',url:'',topic:'Topic'});await ok(a,'resource.set_mastered',{id:resource.result.id,expectedRevision:'0',mastered:true});await ok(a,'resource.delete',{id:resource.result.id,expectedRevision:'1'});
 await no(a,'resource.create',{title:'Unsafe',notes:'',url:'javascript:alert(1)',topic:'Topic'});
 const journal=await ok(a,'journal.save',{date:day,wins:'Win',challenges:'',gratitude:'',tomorrow:'',expectedRevision:null});
 const revised=await ok(a,'journal.save',{date:day,wins:'Updated',challenges:'',gratitude:'',tomorrow:'',expectedRevision:'0'});assert.equal(revised.result.id,journal.result.id);await no(a,'journal.save',{date:day,wins:'Stale',challenges:'',gratitude:'',tomorrow:'',expectedRevision:'0'});await ok(a,'journal.delete',{id:journal.result.id,expectedRevision:'1'});
 const creative={prompt:'Imagine dix usages inattendus pour un objet courant.',response:'Synthetic answer'};
 const creativity=await Promise.all([ok(a,'creativity.submit',creative),ok(a,'creativity.submit',creative)]);assert.notEqual(creativity[0].result.id,creativity[1].result.id);
 assert.equal((await totals(a)).xp,beforeLab);await ok(a,'achievement.sync',{});assert.equal((await totals(a)).xp,beforeLab);
 pass('all Lab collections, F02 re-root, optional safe URL, journal revision conflict and repeated daily creativity without XP');
 // Fault after business writes, on receipt insertion: no public fault parameter.
 const fault=randomUUID(),beforeFault=await totals(a),countsBefore=(await admin.query('select count(*)::int n from lifequest.quests where user_id=$1',[a.id])).rows[0].n;
 await admin.query("alter table lifequest.command_receipts add constraint auth4c_fixture_fault check(request_id<>'"+fault+"'::uuid) not valid");
 try{await no(a,'quest.create',draft('Rollback'),fault);assert.deepEqual(await totals(a),beforeFault);assert.equal((await admin.query('select count(*)::int n from lifequest.quests where user_id=$1',[a.id])).rows[0].n,countsBefore);}
 finally{await admin.query('alter table lifequest.command_receipts drop constraint auth4c_fixture_fault');}
 pass('injected receipt failure rolls back entity, revision and counters atomically');
 const lease=(await admin.query("select zone,probes,expected_digest,range_start,range_end,validated_at,expires_at,oracle_version from lifequest.calendar_activation where zone='Africa/Casablanca'")).rows[0];
 const beforeMissingGate=await totals(a);await admin.query("delete from lifequest.calendar_activation where zone='Africa/Casablanca'");
 try{const missing=await no(a,'quest.create',draft());assert.equal(missing.status,503);assert.deepEqual(await totals(a),beforeMissingGate);}
 finally{await admin.query("insert into lifequest.calendar_activation(zone,probes,expected_digest,range_start,range_end,validated_at,expires_at,oracle_version) values($1,$2::jsonb,$3,$4,$5,$6,$7,$8)",[lease.zone,JSON.stringify(lease.probes),lease.expected_digest,lease.range_start,lease.range_end,lease.validated_at,lease.expires_at,lease.oracle_version]);}
 await admin.query("update lifequest.calendar_activation set expected_digest=repeat('0',64) where zone='Africa/Casablanca'");
 const beforeGate=await totals(a);try{const denied=await no(a,'quest.create',draft());assert.equal(denied.status,503);assert.deepEqual(await totals(a),beforeGate);}
 finally{await admin.query("update lifequest.calendar_activation set expected_digest=$1 where zone='Africa/Casablanca'",[lease.expected_digest]);}
 await admin.query("with moment as (select clock_timestamp() t) update lifequest.calendar_activation set validated_at=moment.t-interval '2 days',expires_at=moment.t-interval '1 day' from moment where zone='Africa/Casablanca'");
 try{assert.equal((await no(a,'quest.create',draft())).status,503);}finally{await admin.query("update lifequest.calendar_activation set validated_at=$1,expires_at=$2 where zone='Africa/Casablanca'",[lease.validated_at,lease.expires_at]);}
 pass('missing, drifted and expired calendar activation fail closed without partial write; original lease restored');
 // A Hunter lock does not block B. All locks have the same bounded order.
 const blocker=new Client({connectionString:u.href});await blocker.connect();await blocker.query('begin');await blocker.query('select user_id from lifequest.hunters where user_id=$1 for update',[a.id]);
 try{const started=Date.now();const waiting=call(a,'quest.create',draft());await ok(b,'quest.create',draft('B independent'));const timed=await waiting;assert.ok(timed.status>=400);assert.equal(timed.data.code,'55P03');assert.ok(Date.now()-started<3500);}
 finally{await blocker.query('rollback');await blocker.end();}
 pass('bounded Hunter contention, A/B independent locks, no receipt on timeout');
 // A local bridge forwards the real signed request, then drops its committed response.
 const lostQuest=await ok(a,'quest.create',{...draft('Lost reply'),frequency:'once'}),lostId=randomUUID();
 const proxy=http.createServer((req,res)=>{const upstream=http.request(new URL('/rest/v1/rpc/lifequest_quest_command',api),{method:'POST',headers:req.headers},reply=>{reply.resume();res.destroy();});upstream.on('error',()=>res.destroy());req.pipe(upstream);});
 await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));let networkFailed=false;
 try{await fetch('http://127.0.0.1:'+proxy.address().port,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+a.token,'Content-Type':'application/json'},body:JSON.stringify({expected_actor:a.id,request_id:lostId,kind:'quest.complete',payload:{id:lostQuest.result.id}})});}catch{networkFailed=true;}finally{await new Promise(resolve=>proxy.close(resolve));}
 assert.ok(networkFailed);const saved=(await admin.query('select minimal_result from lifequest.command_receipts where user_id=$1 and request_id=$2',[a.id,lostId])).rows[0];assert.ok(saved);const retried=await ok(a,'quest.complete',{id:lostQuest.result.id},lostId);assert.deepEqual(retried,{...saved.minimal_result,replayed:true});
 pass('real HTTP response lost after commit; same request finds immutable receipt without double credit');
 const authContainer=databaseContainer().replace('supabase_db_','supabase_auth_');
 const jwtSecret=JSON.parse(execFileSync('docker',['inspect',authContainer,'--format','{{json .Config.Env}}'],{encoding:'utf8',env,stdio:['ignore','pipe','pipe']})).find(s=>s.startsWith('GOTRUE_JWT_SECRET=')).slice('GOTRUE_JWT_SECRET='.length);
 function sign(claims){const head=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),body=Buffer.from(JSON.stringify(claims)).toString('base64url');return head+'.'+body+'.'+createHmac('sha256',jwtSecret).update(head+'.'+body).digest('base64url');}
 // Same business ID in A and B, with custom historical XP preserved on edit.
 const shared='same-business-id';
 for(const x of [a,b])await admin.query("insert into lifequest.quests(user_id,id,title,description,frequency,difficulty,attribute,base_xp,created_at,sort_position) values($1,$2,'Shared','','daily','NORMAL','focus',$3,clock_timestamp(),9000)",[x.id,shared,x===a?'77':'80']);
 await refreshCounts(a);await refreshCounts(b);
 await ok(a,'quest.update',{...draft('Custom'),id:shared,expectedRevision:'0',difficulty:'NORMAL'});
 assert.equal((await admin.query('select base_xp::text from lifequest.quests where user_id=$1 and id=$2',[a.id,shared])).rows[0].base_xp,'77');
 assert.equal((await admin.query('select title,revision::text from lifequest.quests where user_id=$1 and id=$2',[b.id,shared])).rows[0].title,'Shared');
 await admin.query('begin');
 for(let i=1;i<=7;i++){
  const source='streak-history-'+randomUUID();
  await admin.query("insert into lifequest.quests(user_id,id,title,description,frequency,difficulty,attribute,base_xp,created_at,sort_position) values($1,$2,'History','','daily','EASY','focus',30,clock_timestamp()-interval '1 year',9100+$3)",[a.id,source,i]);
  await admin.query("insert into lifequest.xp_events(user_id,id,source_ref,source_id,source_kind,period_key,awarded_xp,attribute,occurred_at,rules_version,provenance,sort_position) select $1,$2,$3,$3,'quest',to_char((clock_timestamp() at time zone 'Africa/Casablanca')::date-$4::integer,'YYYY-MM-DD'),1,'focus',(((clock_timestamp() at time zone 'Africa/Casablanca')::date-$4::integer)+time '12:00') at time zone 'Africa/Casablanca','lifequest-v1','legacy',9200+$4::integer",[a.id,randomUUID(),source,i]);
 }
 const fractional='fractional-base-'+randomUUID();await admin.query("insert into lifequest.quests(user_id,id,title,description,frequency,difficulty,attribute,base_xp,created_at,sort_position) values($1,$2,'Fraction','','daily','EASY','focus',0.45454545454545453,clock_timestamp(),9300)",[a.id,fractional]);
 await admin.query('update lifequest.hunters set total_xp=opening_xp+legacy_roundoff_delta+(select coalesce(sum(awarded_xp),0) from lifequest.xp_events where user_id=$1) where user_id=$1',[a.id]);await refreshCounts(a);await admin.query('commit');
 const fractionReward=await ok(a,'quest.complete',{id:fractional});assert.equal(fractionReward.result.xp,'1');
 const customReward=await ok(a,'quest.complete',{id:shared});assert.equal(customReward.result.xp,'85');
 pass('same ID A/B isolated, customized base retained, real RPC streak bonus and binary fractional rounding');
 const tiny='minimum-subnormal-'+randomUUID();
 await admin.query("insert into lifequest.quests(user_id,id,title,description,frequency,difficulty,attribute,base_xp,created_at,sort_position) values($1,$2,'Unsupported minimum','','once','EASY','focus','5e-324'::numeric,clock_timestamp(),9301)",[b.id,tiny]);await refreshCounts(b);
 const beforeTiny=await totals(b);const tinyResult=await no(b,'quest.complete',{id:tiny});assert.equal(tinyResult.status,409);assert.equal(tinyResult.data.message,'UNSUPPORTED_NUMBER');assert.deepEqual(await totals(b),beforeTiny);
 assert.equal((await admin.query('select count(*)::int n from lifequest.xp_events where user_id=$1 and source_ref=$2',[b.id,tiny])).rows[0].n,0);
 assert.equal((await admin.query("select base_xp='5e-324'::numeric unchanged from lifequest.quests where user_id=$1 and id=$2",[b.id,tiny])).rows[0].unchanged,true);
 pass('real RPC explicitly refuses 5e-324 before credit; original numeric amount unchanged, no receipt');
 // F04 positive proof is immutable; status-less or unproved pending history is not credited.
 await admin.query('begin');
 const paidBoss='legacy:paid:boss',paidFocus='legacy:paid:focus';
 await admin.query("insert into lifequest.boss_missions(user_id,id,title,objective,mode,target,current,base_xp,created_at,completed_at,reward_status,sort_position) values($1,$2,'Old Boss','','counter',1,1,0,clock_timestamp(),clock_timestamp(),'pending',9400)",[a.id,paidBoss]);
 await admin.query("insert into lifequest.focus_sessions(user_id,id,occurred_at,minutes,label,reward_status,sort_position) values($1,$2,clock_timestamp(),25,'Old Focus','pending',9400),($1,'legacy-unproved',clock_timestamp(),25,'Unproved','pending',9401)",[a.id,paidFocus]);
 for(const [id,source,attribute] of [[paidBoss,'boss','discipline'],[paidFocus,'focus','focus']])await admin.query("insert into lifequest.xp_events(user_id,id,source_ref,source_id,source_kind,period_key,awarded_xp,attribute,occurred_at,rules_version,provenance,sort_position) values($1,$2,$3,$4,$5,'once',7,$6,clock_timestamp(),'lifequest-v1','legacy',9500)",[a.id,randomUUID(),'lifequest:activity:'+source+':'+id,id,source,attribute]);
 await admin.query('update lifequest.hunters set total_xp=opening_xp+legacy_roundoff_delta+(select sum(awarded_xp) from lifequest.xp_events where user_id=$1) where user_id=$1',[a.id]);await refreshCounts(a);await admin.query('commit');
 const proofTotal=(await totals(a)).xp;
 assert.equal((await ok(a,'boss.claim',{id:paidBoss,expectedRevision:'0'})).result.credited,false);
 assert.equal((await ok(a,'focus.claim',{id:paidFocus,expectedRevision:'0'})).result.credited,false);
 await no(a,'focus.claim',{id:'legacy-unproved',expectedRevision:'0'});assert.equal((await totals(a)).xp,proofTotal);
 pass('F03 positive historical Boss proof and F04 paid Focus recovered without new credit; unproved pending denied');
 const modeRun=await ok(a,'focus.start',{mode:'focus',label:'Mode test'});
 const newMode=await ok(a,'focus.set_mode',{id:modeRun.result.id,expectedRevision:'0',mode:'long',label:'Rest'});assert.notEqual(newMode.result.id,modeRun.result.id);assert.equal(newMode.result.remainingSeconds,900);
 await ok(a,'focus.resume',{id:newMode.result.id,expectedRevision:'0'});await ok(a,'focus.cancel',{id:newMode.result.id,expectedRevision:'1'});
 const wide='wide-revision-'+randomUUID();await admin.query("insert into lifequest.quests(user_id,id,title,description,frequency,difficulty,attribute,base_xp,created_at,revision,sort_position) values($1,$2,'Revision','','daily','EASY','focus',30,clock_timestamp(),9007199254740993,9600)",[a.id,wide]);await refreshCounts(a);
 const wideResult=await ok(a,'quest.archive',{id:wide,expectedRevision:'9007199254740993'});assert.equal(wideResult.result.revision,'9007199254740994');
 pass('Focus set_mode creates distinct controlled run; bigint revisions stay exact beyond JS safe integers');
 // Rollback after *XP* writes, not only a creation. Fault remains private fixture SQL.
 const faultQuest=await ok(a,'quest.create',{...draft('XP rollback'),frequency:'once'}),xpFault=randomUUID();
 const beforeXPFailure=await totals(a),beforeLedger=(await admin.query('select count(*)::int n from lifequest.xp_events where user_id=$1',[a.id])).rows[0].n;
 await admin.query("alter table lifequest.command_receipts add constraint auth4c_fixture_xp_fault check(request_id<>'"+xpFault+"'::uuid) not valid");
 try{await no(a,'quest.complete',{id:faultQuest.result.id},xpFault);assert.deepEqual(await totals(a),beforeXPFailure);assert.equal((await admin.query('select count(*)::int n from lifequest.xp_events where user_id=$1',[a.id])).rows[0].n,beforeLedger);}
 finally{await admin.query('alter table lifequest.command_receipts drop constraint auth4c_fixture_xp_fault');}
 pass('failure after reward/ledger write rolls back XP, achievements, receipt, revision and counters');
 // Test expiry during execution and real PostgREST statement timeout with targeted delay.
 async function delayedReceipt(id,seconds,work){
  await admin.query('begin');
  await admin.query("create function lifequest.auth4c_fixture_delay() returns trigger language plpgsql security invoker set search_path='' as $$begin if NEW.request_id='"+id+"'::uuid then perform pg_sleep("+seconds+");end if;return NEW;end;$$");
  await admin.query('revoke all on function lifequest.auth4c_fixture_delay() from public,anon,authenticated');await admin.query('grant execute on function lifequest.auth4c_fixture_delay() to lifequest_command_owner');
  await admin.query('create trigger auth4c_fixture_delay before insert on lifequest.command_receipts for each row execute function lifequest.auth4c_fixture_delay()');await admin.query('commit');
  try{await work();}finally{await admin.query('drop trigger auth4c_fixture_delay on lifequest.command_receipts');await admin.query('drop function lifequest.auth4c_fixture_delay()');}
 }
 const expiresDuring=randomUUID(),beforeExpiry=await totals(a);
 await delayedReceipt(expiresDuring,2.5,async()=>{
  const short={...a,token:sign({...a.claims,exp:Math.floor(Date.now()/1000)+2})};await no(short,'quest.create',draft('Expires during transaction'),expiresDuring);assert.deepEqual(await totals(a),beforeExpiry);
 });
 const timedId=randomUUID(),beforeTimeout=await totals(a);let elapsed;
 await delayedReceipt(timedId,6,async()=>{const start=Date.now();const result=await no(a,'quest.create',draft('Statement timeout'),timedId);elapsed=Date.now()-start;assert.equal(result.data.code,'57014');assert.ok(elapsed<6500);assert.deepEqual(await totals(a),beforeTimeout);});
 pass('signed JWT expires during transaction with full rollback; real POST statement timeout bounded ('+elapsed+' ms)');
 const concurrent=await signup('concurrent');
 await admin.query('begin');await admin.query("update lifequest.hunters set timezone='Africa/Casablanca',timezone_confirmed_at=clock_timestamp() where user_id=$1",[concurrent.id]);
 await admin.query("update lifequest.hunter_setup set origin_choice='new',chosen_at=clock_timestamp(),configuration_status='ready' where user_id=$1",[concurrent.id]);
 await admin.query("insert into lifequest.hunter_profiles(user_id,name,age,gender,avatar,goals,onboarding_completed,original_created_at) values($1,'Concurrent Fixture',25,'other','male','{}',true,clock_timestamp())",[concurrent.id]);await admin.query('commit');
 const concurrentId=randomUUID();
 await delayedReceipt(concurrentId,1,async()=>{
  const inFlight=call(concurrent,'quest.create',draft('Before logout'),concurrentId);let held=false;
  for(let i=0;i<30&&!held;i++){held=(await admin.query("select count(*)::int n from pg_stat_activity where wait_event='PgSleep' and query like '%lifequest_quest_command%'")).rows[0].n>0;if(!held)await new Promise(r=>setTimeout(r,25));}
  assert.ok(held,'RPC_SESSION_LOCK_HELD');let loggedOut=false;
  const logout=request('/auth/v1/logout',concurrent.token,{}).then(r=>{loggedOut=true;return r;});
  await new Promise(r=>setTimeout(r,100));assert.equal(loggedOut,false,'LOGOUT_WAITS_FOR_AUTHORIZED_COMMAND');
  assert.equal((await inFlight).status,200);assert.equal((await logout).status,204);await no(concurrent,'quest.create',draft('After logout'));
 });
 pass('real concurrent logout waits for already authorized RPC; later command with old JWT denied');
 const expired={...a,token:sign({...a.claims,exp:Math.floor(Date.now()/1000)-60})};assert.ok((await no(expired,'quest.create',draft())).status>=400);
 const forged={...a,token:a.token.slice(0,-8)+'AAAAAAAA'};await no(forged,'quest.create',draft());
 const beforeLogout=await totals(a);assert.equal((await request('/auth/v1/logout',a.token,{})).status,204);await no(a,'quest.create',draft());assert.deepEqual(await totals(a),beforeLogout);await ok(b,'quest.create',draft('B valid after logout A'));
 const login=await request('/auth/v1/token?grant_type=password',null,{email:a.email,password:a.password});assert.equal(login.status,200);a.token=login.data.access_token;const unchanged=await totals(a);await ok(a,'quest.complete',{id:once.result.id});assert.equal((await totals(a)).xp,unchanged.xp);
 const receiptAfterReconnect=await request('/rest/v1/rpc/lifequest_command_receipt',a.token,{expected_actor:a.id,request_id:lostId});assert.equal(receiptAfterReconnect.status,200);assert.equal(receiptAfterReconnect.data.state,'found');assert.deepEqual(receiptAfterReconnect.data.receipt.minimalResult,saved.minimal_result);
 const replayAfterReconnect=await ok(a,'quest.complete',{id:lostQuest.result.id},lostId);assert.deepEqual(replayAfterReconnect,retried);assert.deepEqual(await totals(a),unchanged);
 const reconnectedSnapshot=await snapshot(a);assert.equal(reconnectedSnapshot.exactXP.total,unchanged.xp);assert.equal(reconnectedSnapshot.entityRevisions.quests[lostQuest.result.id],'0');
 pass('real signed expired/forged JWT, revoked session rejected, B valid; reconnect preserves XP, reader snapshot and immutable receipt replay');
 fs.mkdirSync(path.join(__dirname,'.results'),{recursive:true});fs.writeFileSync(path.join(__dirname,'.results',project+'-rpc.json'),JSON.stringify({project,checks,actors:actors.map(a=>a.id),rpcFunctions:functions.map(f=>f.proname),passed:checks.length},null,2)+'\n');
 console.log('PASS '+checks.length+' RPC/Auth groups; no credentials or personal data printed');
}
main().catch(e=>{const frame=String(e.stack||'').split('\n').find(x=>x.includes('rpc-check.cjs:'))||'';console.error('FAIL RPC '+(e.code||'ASSERTION')+' '+String(e.message).split('\n')[0]+' '+frame.trim());process.exitCode=1;}).finally(async()=>{if(admin)await admin.end();});
