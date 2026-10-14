'use strict';
// Pure read-only calendar matrix on the new independent stack. Original oracle intact.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {Client}=require('../auth2/node_modules/pg');
const {status,project,target,root,env,databaseContainer}=require('./stack.cjs');
const oracle=require('./oracle.cjs');
const golden=require('./golden.json');
const {directory,commit}=require('./calendar-icu.cjs');
const out=path.join(__dirname,'.results',project+'-calendar.json');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function docker(args){return execFileSync('docker',args,{env,stdio:['ignore','pipe','pipe']});}
function fileInfo(file){const bytes=docker(['exec',databaseContainer(),'cat',file]);
 return{file,sha256:sha(bytes),bytes:bytes.length};}
async function main(){
 const commandScope=project==='lifequest-auth4e-r3-20261013'||['lifequest-auth4c-commands-20261013','lifequest-auth4c-commands-verified-20261013','lifequest-auth4c-final-20261013','lifequest-auth4c-safe-20261013','lifequest-auth4c-commands-gate-20261013','lifequest-auth4d-reader-20261013'].includes(project);
 assert.ok(commandScope||project==='lifequest-auth4c-calendar-20261013','NEW_STACK_REQUIRED');
 assert.equal(process.versions.tz,'2026e','EFFECTIVE_ICU_DATA_REQUIRED');
 assert.equal(process.env.ICU_TIMEZONE_FILES_DIR,directory,'VERIFIED_RESOURCE_DIRECTORY');
 const protectedNames=['tools/auth4c/oracle.cjs','tools/auth4c/golden.json','docs/AUTH_4A_CLOUD_DATA_CONTRACT.md',
  ...fs.readdirSync(path.join(root,'supabase/migrations')).filter(f=>f.endsWith('.sql')).map(f=>'supabase/migrations/'+f)];
 const hashes=Object.fromEntries(protectedNames.map(f=>[f,sha(fs.readFileSync(path.join(root,f)))]));
 const u=new URL(status().DB_URL);u.username='supabase_admin';const c=new Client({connectionString:u.href});
 const previousZone=process.env.TZ;let comparisons=0,offsetChecks=0;
 try{await c.connect();await c.query('begin read only');
  const versions=(await c.query('select version from supabase_migrations.schema_migrations order by version')).rows.map(r=>r.version);
  assert.equal(versions.length,project==='lifequest-auth4d-reader-20261013'||project==='lifequest-auth4e-r3-20261013'?23:commandScope?20:13);
  for(const name of protectedNames.filter(n=>n.endsWith('.sql')))assert.equal(sha(fs.readFileSync(path.join(root,name))),sha(fs.readFileSync(path.join(target,name))),'INSTALLED_MIGRATION_IDENTICAL');
  if(!commandScope)await c.query(fs.readFileSync(path.join(root,'tools/auth4b/catalog-check.sql'),'utf8'));
  const before=(await c.query('select count(*)::int n from auth.users')).rows[0].n;
  const huntersBefore=(await c.query('select count(*)::int n from lifequest.hunters')).rows[0].n;
  const withReaderFixtures=process.argv.includes('--with-reader-fixtures');
  if(process.argv.includes('--with-fixtures')){
   assert.equal((await c.query("select count(*)::int n from auth.users where email like 'auth4c-%@example.test'")).rows[0].n,before,'ONLY_GENERATED_FIXTURES');
  }else if(withReaderFixtures){
   assert.equal(project,'lifequest-auth4d-reader-20261013','READER_TEST_STACK');
   assert.equal((await c.query("select count(*)::int n from auth.users where email not like '%@example.test'")).rows[0].n,0,'ONLY_SYNTHETIC_AUTH_IDENTITIES');
  }else assert.equal(before,0);
  const stamps=new Set(golden.instants);
  // Every UTC day throughout 2026, plus month/leap boundaries in 2024..2028.
  // Anchors bracket local midnight in all five zones without timezone-specific math.
  function addDay(day){for(const h of ['00:00:00','00:59:59','01:00:00','01:59:59','02:00:00','12:00:00','22:59:59','23:00:00','23:59:59'])stamps.add(day+'T'+h+'.000Z');}
  for(let t=Date.UTC(2026,0,1);t<Date.UTC(2027,0,1);t+=86400000)addDay(new Date(t).toISOString().slice(0,10));
  for(let y=2024;y<=2028;y++)for(let m=0;m<12;m++)for(const delta of [-1,0,1])addDay(new Date(Date.UTC(y,m,1+delta)).toISOString().slice(0,10));
  const transitions=[];
  // Discover actual runtime offset transitions generically at hourly intervals;
  // then test immediately before/at/after them, rather than guess DST dates.
  for(const zone of golden.zones){process.env.TZ=zone;let prior;
   for(let t=Date.UTC(2026,0,1);t<Date.UTC(2027,0,1);t+=3600000){const offset=new Date(t).getTimezoneOffset();
    if(prior!==undefined&&offset!==prior){transitions.push({zone,instant:new Date(t).toISOString(),beforeMinutes:prior,afterMinutes:offset});
     for(const delta of [-1000,-1,0,1,1000])stamps.add(new Date(t+delta).toISOString());}
    prior=offset;
   }
  }
  const instants=[...stamps].sort();
  for(const zone of golden.zones){process.env.TZ=zone;
   const rows=(await c.query("select t::text as input_time,to_char(timezone($2,t),'YYYY-MM-DD') as local_day,extract(epoch from (timezone($2,t)-timezone('UTC',t)))/60 as offset_minutes,lifequest.rules_period('daily',t,$2) as daily,lifequest.rules_period('weekly',t,$2) as weekly,lifequest.rules_period('monthly',t,$2) as monthly,lifequest.rules_period('once',t,$2) as once from unnest($1::timestamptz[]) t",[instants,zone])).rows;
   assert.equal(rows.length,instants.length);
   for(let i=0;i<rows.length;i++){const date=new Date(instants[i]);
    const offset=-date.getTimezoneOffset();
    // Signed zero has the same timezone offset; strict JS Object.is differs.
    assert.equal(Number(rows[i].offset_minutes),offset===0?0:offset,'OFFSET_'+zone+'_'+instants[i]);offsetChecks++;
    assert.equal(rows[i].local_day,oracle.localDate(date),'LOCAL_DAY_'+zone+'_'+instants[i]);
    for(const f of ['daily','weekly','monthly','once']){
     assert.equal(rows[i][f],oracle.periodId(f,date),'PERIOD_'+zone+'_'+instants[i]+'_'+f);comparisons++;
    }
   }
   console.log('PASS '+zone+': '+rows.length+' instants, offsets and four periods exact');
  }
  // Fixed expectations from IANA 2026c+; not calculated from either implementation.
  process.env.TZ='Africa/Casablanca';
  const exact='2026-12-31T23:30:00.000Z';
  assert.equal(oracle.periodId('daily',new Date(exact)),'2026-12-31');
  assert.equal(oracle.periodId('monthly',new Date(exact)),'2026-12');
  assert.equal((await c.query("select lifequest.rules_period('daily',$1,'Africa/Casablanca') as d,lifequest.rules_period('monthly',$1,'Africa/Casablanca') as m",[exact])).rows[0].d,'2026-12-31');
  assert.equal((await c.query("select lifequest.rules_period('monthly',$1,'Africa/Casablanca') as m",[exact])).rows[0].m,'2026-12');
  for(const [file,hash] of Object.entries(hashes))assert.equal(sha(fs.readFileSync(path.join(root,file))),hash,'SOURCE_UNCHANGED');
  assert.equal((await c.query('select count(*)::int n from auth.users')).rows[0].n,before);
  assert.equal((await c.query('select count(*)::int n from lifequest.hunters')).rows[0].n,huntersBefore);
  const metadata={
   node:{version:process.version,icu:process.versions.icu,effectiveTz:process.versions.tz,unicodeCommit:commit},
   postgres:(await c.query('show server_version')).rows[0].server_version,
   pgConfigure:docker(['exec',databaseContainer(),'pg_config','--configure']).toString('utf8'),
   linux:docker(['exec',databaseContainer(),'cat','/etc/os-release']).toString('utf8'),
   // Read exact package records, not apk's potentially ambiguous search results.
   systemTzPackages:docker(['exec',databaseContainer(),'cat','/lib/apk/db/installed']).toString('utf8').split(/\n\n/).filter(block=>/^P:tzdata$/m.test(block)).map(block=>({name:'tzdata',version:block.match(/^V:(.+)$/m)?.[1]})),
   zoneFiles:[fileInfo('/nix/var/nix/profiles/default/share/postgresql/timezone/Africa/Casablanca'),fileInfo('/usr/share/zoneinfo/Africa/Casablanca')],
   image:JSON.parse(docker(['inspect',databaseContainer(),'--format','{"image":{{json .Config.Image}},"id":{{json .Image}}}']).toString('utf8')),
  };
  await c.query('commit');
  fs.writeFileSync(out,JSON.stringify({project,versions,metadata,instants:instants.length,probeInstants:instants,comparisons,offsetChecks,transitions,divergences:0,protectedHashes:hashes,accounts:before,hunters:huntersBefore},null,2)+'\n');
  console.log('PASS calendar '+comparisons+' strict period comparisons, '+offsetChecks+' native offsets; '+transitions.length+' transition neighborhoods; zero divergence');
  console.log('PASS metadata '+JSON.stringify({node:metadata.node,postgres:metadata.postgres,systemTzPackages:metadata.systemTzPackages,image:metadata.image}));
 }finally{
  if(previousZone===undefined)delete process.env.TZ;else process.env.TZ=previousZone;
  await c.end();
 }
}
main().catch(e=>{console.error('FAIL calendar '+(e.code||'ASSERTION')+' '+String(e.message).split('\n')[0]);process.exitCode=1;});
