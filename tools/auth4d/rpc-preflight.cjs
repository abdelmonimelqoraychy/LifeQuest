'use strict';
// Read-only target gate for the explicitly authorized AUTH-4D-R campaign.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {Client}=require('../auth2/node_modules/pg');
const stack=require('../auth4c/stack.cjs');

async function main(){
 assert.equal(process.env.LIFEQUEST_AUTH4C_STACK,'reader','READER_MODE_REQUIRED');
 assert.equal(stack.project,'lifequest-auth4d-reader-20261013','AUTHORIZED_PROJECT_ONLY');
 assert.equal(stack.target,'C:/Users/hp/myproject/lifequest-auth4d-reader-20261013','AUTHORIZED_DIRECTORY_ONLY');
 assert.deepEqual(stack.ports,{api:64521,db:64522,mail:64524,shadow:64520},'AUTHORIZED_PORTS_ONLY');
 const cfg=stack.status();
 const api=new URL(cfg.API_URL),db=new URL(cfg.DB_URL);
 assert.equal(api.origin,'http://127.0.0.1:64521','LOCAL_API_ONLY');
 assert.equal(db.hostname,'127.0.0.1','LOCAL_DATABASE_ONLY');
 assert.equal(db.port,'64522','LOCAL_DATABASE_PORT_ONLY');
 assert.equal(fs.existsSync(path.join(stack.target,'supabase/.temp/project-ref')),false,'NO_REMOTE_LINK');

 const sourceDir=path.resolve(__dirname,'../../supabase/migrations');
 const targetDir=path.join(stack.target,'supabase/migrations');
 const names=fs.readdirSync(sourceDir).filter(n=>n.endsWith('.sql')).sort();
 assert.equal(names.length,23,'EXPECTED_23_SOURCE_MIGRATIONS');
 for(const name of names){
  const source=fs.readFileSync(path.join(sourceDir,name));
  const installed=fs.readFileSync(path.join(targetDir,name));
  assert.equal(createHash('sha256').update(installed).digest('hex'),createHash('sha256').update(source).digest('hex'),'MIGRATION_MATCH_'+name);
 }

 const u=new URL(cfg.DB_URL);u.username='supabase_admin';
 const dbClient=new Client({connectionString:u.href});
 try{
  await dbClient.connect();
  const versions=(await dbClient.query('select version from supabase_migrations.schema_migrations order by version')).rows.map(r=>r.version);
  assert.equal(versions.length,23,'EXPECTED_23_APPLIED_MIGRATIONS');
  const accounts=(await dbClient.query("select count(*)::int total,count(*) filter(where email is null or email !~* '@example\\.test$')::int non_fixture from auth.users")).rows[0];
  assert.ok(accounts.total>0,'EXPECTED_EXISTING_FIXTURES');assert.equal(accounts.non_fixture,0,'NO_NON_FIXTURE_AUTH_IDENTITIES');
  const hunters=(await dbClient.query('select count(*)::int n from lifequest.hunters')).rows[0].n;
  assert.equal(hunters,accounts.total,'ALL_FIXTURES_HAVE_HUNTER_ENVELOPES');
  const clean=(await dbClient.query("select (select count(*)::int from pg_constraint where conname in ('auth4c_fixture_fault','auth4c_fixture_xp_fault')) constraints,(select count(*)::int from pg_trigger where tgname='auth4c_fixture_delay' and not tgisinternal) triggers,(select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='lifequest' and p.proname='auth4c_fixture_delay') functions,(select rolcanlogin::int from pg_roles where rolname='lifequest_command_owner') command_owner_login,(select count(*)::int from lifequest.command_receipts) receipts")).rows[0];
  assert.equal(clean.constraints,0,'NO_TEMPORARY_FAULT_CONSTRAINTS');assert.equal(clean.triggers,0,'NO_TEMPORARY_DELAY_TRIGGER');assert.equal(clean.functions,0,'NO_TEMPORARY_DELAY_FUNCTION');assert.equal(clean.command_owner_login,0,'COMMAND_OWNER_NOLOGIN');
  const expected=['UTC','Africa/Casablanca','Europe/Paris','America/New_York','Pacific/Auckland'].sort();
  const rows=(await dbClient.query('select zone,probes,expected_digest,range_start,range_end,validated_at,expires_at,oracle_version,lifequest.calendar_digest(zone,probes) actual_digest from lifequest.calendar_activation order by zone')).rows;
  assert.deepEqual(rows.map(r=>r.zone).sort(),expected,'FIVE_ZONES_ACTIVATED');
  for(const r of rows){
   assert.equal(r.expected_digest,r.actual_digest,'CALENDAR_DIGEST_MATCH_'+r.zone);
   assert.ok(new Date(r.range_start)<=new Date(),'CALENDAR_RANGE_STARTED_'+r.zone);
   assert.ok(new Date(r.range_end)>new Date(),'CALENDAR_RANGE_CURRENT_'+r.zone);
   assert.ok(new Date(r.validated_at)<=new Date(),'CALENDAR_VALIDATION_NOT_FUTURE_'+r.zone);
   assert.ok(new Date(r.expires_at)>new Date(),'CALENDAR_VALIDATION_UNEXPIRED_'+r.zone);
   assert.equal(r.oracle_version,'node24.19-icu78.3-tz2026e','CALENDAR_ORACLE_VERSION_'+r.zone);
  }
  if(process.argv.includes('--postflight')){
   const proofPath=path.resolve(__dirname,'../auth4c/.results/'+stack.project+'-rpc.json');
   const proof=JSON.parse(fs.readFileSync(proofPath,'utf8'));
   assert.equal(proof.project,stack.project,'RPC_PROOF_TARGET');assert.equal(proof.passed,21,'RPC_GROUP_COUNT');assert.equal(proof.checks.length,21,'RPC_GROUP_PROOF_COMPLETE');
   assert.ok(clean.receipts>0,'FICTIONAL_RECEIPTS_PERSISTED');
  }
  console.log('PASS read-only AUTH-4D-R '+(process.argv.includes('--postflight')?'postflight':'preflight')+': exact reader project/ports, local-only endpoints, no remote link, 23 matching migrations, '+accounts.total+' fictional accounts, '+hunters+' Hunter envelopes, five current calendar digests, '+clean.receipts+' fictional receipts; transient fault objects absent; no credentials or identities printed');
 }finally{await dbClient.end();}
}
main().catch(e=>{console.error('FAIL AUTH-4D-R preflight '+(e.code||'ASSERTION')+' '+String(e.message).split('\n')[0]);process.exitCode=1;});
