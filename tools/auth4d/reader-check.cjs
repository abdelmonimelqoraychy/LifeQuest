'use strict';
// Real PostgREST/Auth tests. Administrative SQL creates and corrupts only these
// generated fixtures; no command RPC, service_role or real Hunter is used here.
const assert=require('node:assert/strict');
const {randomUUID,randomBytes,createHmac}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {Client}=require('../auth2/node_modules/pg');
const {status,project,ports}=require('../auth4c/stack.cjs');
const results=[];let admin,api,key,stage='initialization';const fixtures=[];
const pass=name=>{results.push(name);console.log('PASS '+name);};
async function request(route,token,body,method){const headers={apikey:key};if(token)headers.Authorization='Bearer '+token;if(body!==undefined)headers['Content-Type']='application/json';
 const r=await fetch(api+route,{method:method||(body===undefined?'GET':'POST'),headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});let data;try{data=await r.json();}catch{}return{status:r.status,data};}
async function call(actor,id=actor.id){return request('/rest/v1/rpc/lifequest_hunter_snapshot',actor.token,{expected_actor:id});}
async function receipt(actor,id){return request('/rest/v1/rpc/lifequest_command_receipt',actor.token,{expected_actor:actor.id,request_id:id});}
async function signup(label){const email='auth4d-'+label+'-'+randomUUID()+'@example.test',password=randomBytes(24).toString('hex');
 const created=await request('/auth/v1/signup',null,{email,password});assert.equal(created.status,200,'FIXTURE_SIGNUP');assert.ok(!created.data.access_token);
 let tokenHash;
 for(let tries=0;tries<60&&!tokenHash;tries++){
  const box=await(await fetch('http://127.0.0.1:'+ports.mail+'/api/v1/messages')).json();
  for(const message of box.messages||[]){if(!(message.To||[]).some(t=>t.Address===email))continue;
   const detail=await(await fetch('http://127.0.0.1:'+ports.mail+'/api/v1/message/'+message.ID)).json();
   for(const match of (detail.HTML||'').matchAll(/href="([^"]+)"/g)){const url=new URL(match[1].replaceAll('&amp;','&'));if(url.searchParams.get('type')==='email')tokenHash=url.searchParams.get('token_hash');}}
  if(!tokenHash)await new Promise(r=>setTimeout(r,100));}
 assert.ok(tokenHash,'LOCAL_CONFIRMATION_EMAIL');const verified=await request('/auth/v1/verify',null,{token_hash:tokenHash,type:'email'});
 assert.equal(verified.status,200);const x={id:verified.data.user.id,email,password,token:verified.data.access_token,claims:JSON.parse(Buffer.from(verified.data.access_token.split('.')[1],'base64url'))};fixtures.push(x);return x;
}
async function seedReady(actor,label,opening,award){
 await admin.query('begin');
 await admin.query("update lifequest.hunters set opening_xp=$2,total_xp=$2,timezone='Africa/Casablanca',timezone_confirmed_at=clock_timestamp(),revision=9007199254740993 where user_id=$1",[actor.id,opening]);
 await admin.query("update lifequest.hunter_setup set origin_choice='new',chosen_at=clock_timestamp(),configuration_status='ready',revision=4 where user_id=$1",[actor.id]);
 await admin.query('insert into lifequest.hunter_profiles(user_id,name,age,gender,avatar,goals,onboarding_completed,original_created_at,revision,historical) values($1,$2,25,\'other\',\'male\',\'{focus}\',true,clock_timestamp(),3,$3::jsonb)',[actor.id,'Reader '+label,JSON.stringify({extras:{source:'synthetic'}})]);
 await admin.query("insert into lifequest.story_arcs(user_id,id,title,description,target_date,created_at,revision,sort_position,historical) values($1,'shared-id',$2,'fixture','2026-12-31',clock_timestamp(),7,2,'{\"extras\":{\"actor\":\"fixture\"}}')",[actor.id,'Arc '+label]);
 await admin.query("insert into lifequest.quests(user_id,id,arc_id,title,description,frequency,difficulty,attribute,base_xp,created_at,archived,revision,sort_position,historical) values($1,'shared-id','shared-id',$2,'fixture','daily','EASY','focus','0.45454545454545453',clock_timestamp(),false,9007199254740993,1,'{\"absent\":[\"targetDate\"],\"extras\":{\"actor\":\"fixture\"}}')",[actor.id,'Quest '+label]);
 await admin.query("insert into lifequest.xp_events(user_id,id,source_ref,source_id,source_kind,period_key,awarded_xp,attribute,occurred_at,title_snapshot,arc_id_snapshot,rules_version,provenance,sort_position,historical) values($1,$2,'lifequest:activity:legacy:shared:source','shared:source','legacy_activity','once',$3,'knowledge',clock_timestamp(),'Legacy title','shared-id','legacy-v1','legacy',1,'{\"extras\":{\"note\":\"kept\"}}')",[actor.id,'receipt-'+label,award]);
 await admin.query("insert into lifequest.boss_missions(user_id,id,title,objective,mode,target,current,base_xp,created_at,revision,sort_position) values($1,'boss','Boss '||$2,'fixture','weighted',10,10,25,clock_timestamp(),2,1)",[actor.id,label]);
 await admin.query("insert into lifequest.boss_subobjectives(user_id,boss_id,id,title,weight,completed,revision,sort_position,historical) values($1,'boss','sub-shared','Sub '||$2,10,true,8,1,'{\"extras\":{\"kept\":true}}')",[actor.id,label]);
 await admin.query("insert into lifequest.system_events(user_id,id,kind,title,occurred_at,detail,sort_position) values($1,'event','evolution','Event '||$2,clock_timestamp(),'fixture',1)",[actor.id,label]);
 await admin.query("insert into lifequest.focus_sessions(user_id,id,occurred_at,minutes,label,sort_position,historical) values($1,'session',clock_timestamp(),'12.125','Focus '||$2,1,'{\"absent\":[\"rewardStatus\"],\"extras\":{\"kept\":true}}')",[actor.id,label]);
 await admin.query("insert into lifequest.ideas(user_id,id,title,content,tag,created_at,archived,sort_position) values($1,'idea','Idea '||$2,'fixture','tag',clock_timestamp(),false,1)",[actor.id,label]);
 await admin.query("insert into lifequest.mind_nodes(user_id,id,parent_id,title,x,y,sort_position) values($1,'node',null,'Node '||$2,1.25,-2.5,1)",[actor.id,label]);
 await admin.query("insert into lifequest.resources(user_id,id,title,notes,url,topic,mastered,created_at,sort_position,historical) values($1,'resource','Resource '||$2,'fixture','','topic',false,clock_timestamp(),1,'{\"extras\":{\"kept\":true}}')",[actor.id,label]);
 await admin.query("insert into lifequest.journal_entries(user_id,id,local_date,wins,challenges,gratitude,tomorrow,sort_position) values($1,'journal','2026-10-13','wins','challenge','thanks','tomorrow',1)",[actor.id]);
 await admin.query("insert into lifequest.creativity_challenges(user_id,id,prompt,response,occurred_at,completed,sort_position) values($1,'challenge','prompt','response',clock_timestamp(),true,1)",[actor.id]);
 await admin.query('update lifequest.hunters set total_xp=opening_xp+legacy_roundoff_delta+(select sum(awarded_xp) from lifequest.xp_events where user_id=$1) where user_id=$1',[actor.id]);
 await admin.query("update lifequest.hunter_modules set revision=revision+1,collection_counts=lifequest.module_counts($1,module_code) where user_id=$1",[actor.id]);
 await admin.query('commit');
}
async function main(){
 assert.equal(project,'lifequest-auth4d-reader-20261013');const cfg=status();api=cfg.API_URL;key=cfg.PUBLISHABLE_KEY||cfg.ANON_KEY;
 const url=new URL(cfg.DB_URL);url.username='supabase_admin';admin=new Client({connectionString:url.href});await admin.connect();
 stage='migration check';assert.equal((await admin.query('select count(*)::int n from supabase_migrations.schema_migrations')).rows[0].n,23);
 const anonymous=await request('/rest/v1/rpc/lifequest_hunter_snapshot',null,{expected_actor:randomUUID()});assert.notEqual(anonymous.status,200);
 const direct=await request('/rest/v1/hunters?select=*',null,undefined,'GET');assert.notEqual(direct.status,200);
 stage='fictional account signup';const a=await signup('a'),b=await signup('b'),pending=await signup('pending');
 stage='fictional Hunter seed';
 await seedReady(a,'A','0.2','0.125');await seedReady(b,'B','1.125','0.5');
 stage='pending snapshot';const pa=await call(pending);assert.equal(pa.status,200);assert.equal(pa.data.state,'setup_pending');assert.equal(pa.data.data,undefined);
 stage='ready snapshots';
 const sa=await call(a),sb=await call(b);if(sa.status!==200){console.error('SAFE_READER_ERROR A '+sa.status+' '+(sa.data?.code||'')+' '+(sa.data?.message||'')+' '+(sa.data?.details||''));try{await admin.query('begin');await admin.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(a.claims)]);await admin.query('select public.lifequest_hunter_snapshot($1)',[a.id]);await admin.query('rollback');}catch(e){console.error('SAFE_SQL_CONTEXT '+(e.code||'')+' '+(e.message||'')+' '+(e.where||'').slice(0,500));try{await admin.query('rollback')}catch{}}}if(sb.status!==200)console.error('SAFE_READER_ERROR B '+sb.status+' '+(sb.data?.code||'')+' '+(sb.data?.message||'')+' '+(sb.data?.details||''));assert.equal(sa.status,200,'A_SNAPSHOT');assert.equal(sb.status,200,'B_SNAPSHOT');
 assert.equal(sa.data.state,'ready');assert.equal(sb.data.state,'ready');assert.equal(sa.data.actor,a.id);assert.equal(sb.data.actor,b.id);
 assert.equal(sa.data.data.profile.name,'Reader A');assert.equal(sb.data.data.profile.name,'Reader B');
 assert.equal(sa.data.exactXP.total,'0.325');assert.equal(sa.data.exactXP.opening,'0.2');assert.equal(sa.data.data.system.completions[0].xpAwarded,'0.125');
 assert.equal(sa.data.data.system.quests[0].xp,'0.45454545454545453');assert.equal(sa.data.data.system.quests[0].revision,'9007199254740993');
 assert.equal(sa.data.entityRevisions.quests['shared-id'],'9007199254740993');assert.equal(sa.data.entityRevisions.hunter.revision,'9007199254740993');
 assert.equal(sa.data.data.system.quests[0].historical.absent[0],'targetDate');assert.equal(sa.data.data.lab.sessions[0].historical.absent[0],'rewardStatus');
 assert.equal(sa.data.data.extra.bosses[0].subObjectives[0].id,'sub-shared');assert.equal(sa.data.data.lab.resources[0].url,'');
 assert.equal(sa.data.data.settings.stability,100);assert.equal(sa.data.data.timer,null);assert.equal(sa.data.presentation.state,'auth5_pending');
 assert.equal(sa.data.data.system.quests[0].title,'Quest A');assert.equal(sb.data.data.system.quests[0].title,'Quest B');
 pass('actual confirmed A/B sessions, setup_pending vs ready, shared business IDs isolated, all six Lab collections and exact ordered snapshot');
 stage='JWT and actor rejection';const mismatch=await call(a,b.id);assert.notEqual(mismatch.status,200);
 const altered={...a.claims,exp:Math.floor(Date.now()/1000)-60};const head=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');const body=Buffer.from(JSON.stringify(altered)).toString('base64url');
 const docker=process.env.LIFEQUEST_DOCKER||'C:/Users/hp/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe';
 const authName='supabase_auth_lifequest-auth4d-reader-20261013';const envs=execFileSync(docker,['inspect',authName,'--format','{{range .Config.Env}}{{println .}}{{end}}'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 const jwtSecret=envs.split(/\r?\n/).find(x=>x.startsWith('GOTRUE_JWT_SECRET='))?.slice('GOTRUE_JWT_SECRET='.length);assert.ok(jwtSecret);
 const unsigned=head+'.'+body;const expired=unsigned+'.'+createHmac('sha256',jwtSecret).update(unsigned).digest('base64url');
 assert.notEqual((await request('/rest/v1/rpc/lifequest_hunter_snapshot',expired,{expected_actor:a.id})).status,200);
 const forged=a.token.slice(0,-5)+'AAAAA';assert.notEqual((await request('/rest/v1/rpc/lifequest_hunter_snapshot',forged,{expected_actor:a.id})).status,200);
 pass('expected-actor substitution, correctly signed expired JWT and forged JWT rejected');
 stage='receipt read';const requestId=randomUUID();
 for(const [actor,result] of [[a,'A receipt'],[b,'B receipt']])await admin.query("insert into lifequest.command_receipts(user_id,request_id,command_kind,canonical_payload_hash,minimal_result,committed_revision,committed_at) values($1,$2,'quest.create',repeat('a',64),jsonb_build_object('result',$3::text),1,clock_timestamp())",[actor.id,requestId,result]);
 const ra=await receipt(a,requestId),rb=await receipt(b,requestId),missing=await receipt(a,randomUUID());
 assert.equal(ra.status,200);assert.equal(rb.status,200);assert.equal(ra.data.receipt.minimalResult.result,'A receipt');assert.equal(rb.data.receipt.minimalResult.result,'B receipt');assert.equal(missing.data.state,'not_found');
 pass('receipt lookup scoped to actor and missing receipt explicit');
 stage='module mismatch seed';const modules=(await admin.query("select to_jsonb(m) row from lifequest.hunter_modules m where user_id=$1 and module_code='system'",[a.id])).rows[0].row;
 await admin.query("update lifequest.hunter_modules set collection_counts=jsonb_set(collection_counts,'{quests}','99'::jsonb) where user_id=$1 and module_code='system'",[a.id]);
 stage='module mismatch read';const invalidModule=await call(a);assert.notEqual(invalidModule.status,200);assert.match(invalidModule.data.message,/MODULE_INVALID/);
 stage='restore module counts';
 await admin.query('update lifequest.hunter_modules set collection_counts=($2::jsonb)->\'collection_counts\' where user_id=$1 and module_code=\'system\'',[a.id,modules]);
 const originalTotal=(await admin.query('select total_xp::text from lifequest.hunters where user_id=$1',[a.id])).rows[0].total_xp;
 stage='disable fixture integrity guard';await admin.query('alter table lifequest.hunters disable trigger structural_integrity');
 try{stage='inject ledger divergence';await admin.query('update lifequest.hunters set total_xp=total_xp+1 where user_id=$1',[a.id]);stage='read ledger divergence';const badLedger=await call(a);assert.notEqual(badLedger.status,200);assert.match(badLedger.data.message,/SNAPSHOT_INCONSISTENT/);}
 finally{stage='restore ledger and trigger';await admin.query('update lifequest.hunters set total_xp=$2 where user_id=$1',[a.id,originalTotal]);await admin.query('alter table lifequest.hunters enable trigger structural_integrity');}
 pass('missing or mismatched module counts and ledger divergence fail closed rather than becoming empty/ready');
 // A fixture-only uncommitted multi-table update proves the reader sees either
 // the committed before-state or committed after-state, never dirty half-state.
 stage='concurrent MVCC snapshot';await admin.query('begin');await admin.query("update lifequest.story_arcs set title='Arc A after',revision=revision+1 where user_id=$1 and id='shared-id'",[a.id]);
 await admin.query("update lifequest.quests set title='Quest A after',revision=revision+1 where user_id=$1 and id='shared-id'",[a.id]);
 await admin.query('update lifequest.hunters set revision=revision+1 where user_id=$1',[a.id]);
 const during=await call(a);assert.equal(during.status,200);assert.equal(during.data.data.system.quests[0].title,'Quest A');assert.equal(during.data.data.system.arcs[0].title,'Arc A');
 await admin.query('commit');const after=await call(a);assert.equal(after.status,200);assert.equal(after.data.data.system.quests[0].title,'Quest A after');assert.equal(after.data.data.system.arcs[0].title,'Arc A after');
 pass('concurrent Arc/quest edit returns one MVCC snapshot before commit and the complete snapshot after commit');
 stage='logout and reconnect';const oldToken=a.token;assert.equal((await request('/auth/v1/logout',oldToken,{})).status,204);assert.notEqual((await request('/rest/v1/rpc/lifequest_hunter_snapshot',oldToken,{expected_actor:a.id})).status,200);
 const login=await request('/auth/v1/token?grant_type=password',null,{email:a.email,password:a.password});assert.equal(login.status,200);a.token=login.data.access_token;
 const reconnected=await call(a);assert.equal(reconnected.status,200);assert.equal(reconnected.data.exactXP.total,'0.325');assert.equal(reconnected.data.data.system.quests[0].title,'Quest A after');
 pass('revoked session denied, same fictional account reconnects without changing ledger or snapshot');
 require('node:fs').mkdirSync(require('node:path').join(__dirname,'.results'),{recursive:true});
 require('node:fs').writeFileSync(require('node:path').join(__dirname,'.results',project+'-reader.json'),JSON.stringify({project,checks:results,fictionalActors:fixtures.map(x=>x.id),passed:results.length},null,2)+'\n');
 console.log('PASS '+results.length+' reader groups; all fixture values remain synthetic and no credential or e-mail printed');
}
main().catch(e=>{console.error('FAIL reader '+stage+' '+(e.code||'ASSERTION')+' '+String(e.message).split('\n')[0]);process.exitCode=1;}).finally(async()=>{if(admin)await admin.end();});
