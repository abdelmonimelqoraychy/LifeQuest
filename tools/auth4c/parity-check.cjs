'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {randomBytes,createHash}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {Client}=require('../auth2/node_modules/pg');
const {root,target,project,status}=require('./stack.cjs');
const oracle=require('./oracle.cjs');
const golden=require('./golden.json');
const results=[];let assertions=0;
const characterize=process.argv.includes('--characterize');
const withGateFixture=process.argv.includes('--with-gate-fixture');
const withReaderFixtures=process.argv.includes('--with-reader-fixtures');
const calendarDivergences=[];
const resultsDir=path.join(__dirname,'.results');
const baselineFile=path.join(resultsDir,'preservation-baseline.json');
function hash(file){return createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function protectedFiles(){return [
 'docs/AUTH_4A_CLOUD_DATA_CONTRACT.md',
 ...fs.readdirSync(path.join(root,'supabase/migrations')).filter(n=>n.endsWith('.sql')&&n.split('_')[0]<'20261013000700').map(n=>'supabase/migrations/'+n),
 ...execFileSync('git',['ls-files','frontend','supabase/config.toml','tools/auth4b'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean)
 ];}
function baseline(){
 fs.mkdirSync(resultsDir,{recursive:true});
 if(fs.existsSync(baselineFile))throw Error('BASELINE_ALREADY_EXISTS');
 fs.writeFileSync(baselineFile,JSON.stringify(Object.fromEntries(protectedFiles().map(f=>[f,hash(path.join(root,f))])),null,2)+'\n');
 console.log('PASS preservation baseline captured; no values or data read from browser');
}
function equal(a,b,label){assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)),label);assertions++;}
function pass(label){results.push(label);console.log('PASS '+label);}
function neighbors(value){
 const b=new ArrayBuffer(8),view=new DataView(b);view.setFloat64(0,value);
 const bits=view.getBigUint64(0),out=[];
 for(const n of [-1n,0n,1n]){view.setBigUint64(0,bits+n);out.push(view.getFloat64(0));}return out;
}
function completion(questId,date,xp=30,attribute='focus'){
 return {id:questId+'-'+date,questId,period:'once',completedAt:date,xpAwarded:xp,attribute};
}
function streakItems(days,day='2026-10-13'){
 const end=new Date(day+'T12:00:00');const out=[];
 for(let i=0;i<days;i++){out.push(completion('quest-'+i,end.toISOString()));end.setDate(end.getDate()-1);}return out;
}
async function main(){
 const cfg=status(),db=new URL(cfg.DB_URL);db.username='supabase_admin';
 const admin=new Client({connectionString:db.href});let runtime;
 const previousZone=process.env.TZ;
 try{
  await admin.connect();
  const versions=(await admin.query('select version from supabase_migrations.schema_migrations order by version')).rows.map(r=>r.version);
  const commandScope=project.includes('-commands-')||project==='lifequest-auth4d-reader-20261013'||['lifequest-auth4c-final-20261013','lifequest-auth4c-safe-20261013'].includes(project);
  equal(versions.length,project==='lifequest-auth4d-reader-20261013'?23:commandScope?20:13,'ORDERED_MIGRATIONS');
  const names=fs.readdirSync(path.join(target,'supabase/migrations')).filter(n=>n.endsWith('.sql')).sort();
  equal(versions,names.map(n=>n.split('_')[0]),'SOURCE_ORDER');
  for(const name of names)equal(hash(path.join(root,'supabase/migrations',name)),hash(path.join(target,'supabase/migrations',name)),'INSTALLED_BYTES');
  const preserved=JSON.parse(fs.readFileSync(baselineFile,'utf8'));
  for(const [f,digest] of Object.entries(preserved))equal(hash(path.join(root,f)),digest,'PRESERVED_'+f);
  const userBaseline=(await admin.query("select count(*)::integer n,count(*) filter(where email not like '%@example.test')::integer non_fixture from auth.users")).rows[0];
  const hunterBaseline=(await admin.query('select count(*)::integer n from lifequest.hunters')).rows[0].n;
  const authCount=userBaseline.n;
  if(withGateFixture){
   equal(authCount,1,'SINGLE_CALENDAR_GATE_FIXTURE');
   equal((await admin.query("select count(*)::integer n from auth.users where email like 'auth4c-gate-%@example.test'")).rows[0].n,1,'ONLY_GATE_FIXTURE');
  }else if(withReaderFixtures){
   equal(project,'lifequest-auth4d-reader-20261013','READER_TEST_STACK');
   equal(userBaseline.non_fixture,0,'ONLY_SYNTHETIC_AUTH_IDENTITIES');
  }else equal(authCount,0,'FICTIONAL_EMPTY_STACK');
  pass('independent ordered installation and preserved source hashes');
  const funcs=(await admin.query("select p.oid::text,p.proname,p.proconfig,p.prosecdef,p.provolatile,r.rolname owner from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where n.nspname='lifequest' and p.proname like 'rules_%' order by p.proname")).rows;
  equal(funcs.length,8,'EIGHT_PURE_FUNCTIONS');
  for(const f of funcs){
   equal(f.owner,'lifequest_schema_owner','PURE_OWNER');equal(f.prosecdef,false,'NO_PRIVILEGED_HELPER');
   assert.ok(f.proconfig.includes('search_path=""'));assertions++;
   for(const role of ['anon','authenticated'])equal((await admin.query("select has_function_privilege($1,$2::oid,'EXECUTE') ok",[role,f.oid])).rows[0].ok,false,'HELPER_PRIVATE');
  }
  const publicCount=(await admin.query("select count(*)::integer n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('lifequest_quest_command','lifequest_operations_command','lifequest_lab_command')")).rows[0].n;
  equal(publicCount,commandScope?3:0,'AUTHORIZED_RPC_SCOPE');
  equal((await admin.query("select has_function_privilege('authenticated','public.auth2_award(uuid,uuid,text,boolean)','EXECUTE') ok")).rows[0].ok,false,'PROOF_WITHDRAWN');
  pass('pure invoker helpers inaccessible to anon/authenticated; authorized public RPC scope verified');
  const password=randomBytes(32).toString('hex');
  await admin.query("alter role lifequest_command_owner login password '"+password+"'");
  const runtimeDb=new URL(cfg.DB_URL);runtimeDb.username='lifequest_command_owner';runtimeDb.password=password;
  runtime=new Client({connectionString:runtimeDb.href});await runtime.connect();
  equal((await runtime.query('select current_user,session_user')).rows[0],{current_user:'lifequest_command_owner',session_user:'lifequest_command_owner'},'REAL_LIMITED_LOGIN');
  process.env.TZ='UTC';
  const rewardCases=[];
  for(const base of golden.bases)for(const days of golden.days)rewardCases.push({base,days});
  for(const days of [0,7,30])for(let n=0;n<=300;n++){
   const multiplier=oracle.bonusForStreak(days);
   for(const base of neighbors((n+0.5)/multiplier))rewardCases.push({base,days});
  }
  const rows=(await runtime.query('select x.base,x.days,lifequest.rules_reward(x.base,x.days) reward from jsonb_to_recordset($1::jsonb) x(base numeric,days integer)',[JSON.stringify(rewardCases)])).rows;
  for(let i=0;i<rows.length;i++){
   const {base,days}=rewardCases[i];const expected=oracle.oracleReward(base,streakItems(days),'2026-10-13');
   equal(rows[i].reward,expected,'BINARY_REWARD_'+base+'_'+days);
  }
  for(const g of golden.rounding)equal(oracle.oracleReward(g.base,streakItems(g.days),'2026-10-13'),g.reward,'FIXED_GOLDEN_REWARD');
  pass(rows.length+' reward comparisons: catalog/custom/fractional bases and adjacent binary half boundaries');
  const totals=[0,199,200,424,425,0.125,1.4545454545454546,1e308];let threshold=0;
  for(let level=1;level<=100;level++){
   if(level>1)threshold+=oracle.levelCost(level-1);
   totals.push(...neighbors(threshold).filter(t=>Number.isFinite(t)&&t>=0),threshold+0.125);
  }
  // Keep the unsupported case visible; it is a blocker, never a passed parity case.
  // PostgreSQL text input rejects the smallest positive JS subnormal (5e-324).
  const supportedTotals=totals.filter(t=>t!==Number.MIN_VALUE);
  let subnormalFailure;try{await runtime.query('select lifequest.rules_progress($1::double precision)',[String(Number.MIN_VALUE)]);}catch(e){subnormalFailure=e;}
  equal(subnormalFailure?.code,'22003','SUBNORMAL_INPUT_UNDERFLOW');
  equal(oracle.getHunterProgress(Number.MIN_VALUE).current,Number.MIN_VALUE,'JS_SUBNORMAL_ADMITTED');
  const progresses=(await runtime.query('select lifequest.rules_progress(x) progress from unnest($1::double precision[]) x',[supportedTotals])).rows;
  for(let i=0;i<supportedTotals.length;i++){
   const expected=oracle.getHunterProgress(supportedTotals[i]);
   if(JSON.stringify(progresses[i].progress.current)!==JSON.stringify(expected.current))
    console.log('DIAGNOSTIC synthetic current XP: '+JSON.stringify({input:supportedTotals[i],sql:progresses[i].progress.current,js:expected.current}));
   equal(progresses[i].progress,expected,'PROGRESS_'+supportedTotals[i]);
  }
  for(let level=1;level<=100;level++)equal((await runtime.query('select lifequest.rules_rank($1) rank',[level])).rows[0].rank,oracle.rankForLevel(level),'RANK_'+level);
  pass(supportedTotals.length+' representable progress cases at all 1..100 thresholds and 100 ranks; subnormal refusal diagnosed separately');
  for(const zone of golden.zones){process.env.TZ=zone;
   // Node must actually apply the requested timezone; do not trust TZ silently.
   const jsDay=oracle.localDate(new Date('2026-01-01T00:30:00Z'));
   equal((await runtime.query("select to_char(($1::timestamptz at time zone $2)::date,'YYYY-MM-DD') as local_day",['2026-01-01T00:30:00Z',zone])).rows[0].local_day,jsDay,'TIMEZONE_ORACLE');
   for(const instant of golden.instants)for(const frequency of ['daily','weekly','monthly','once']){
    const sqlPeriod=(await runtime.query('select lifequest.rules_period($1,$2,$3) period',[frequency,instant,zone])).rows[0].period;
    const jsPeriod=oracle.periodId(frequency,new Date(instant));
    if(sqlPeriod!==jsPeriod){
     const difference={zone,instant,frequency,sql:sqlPeriod,js:jsPeriod,nodeZone:Intl.DateTimeFormat().resolvedOptions().timeZone,offset:new Date(instant).getTimezoneOffset()};
     console.log('DIAGNOSTIC synthetic calendar: '+JSON.stringify(difference));
     if(characterize){calendarDivergences.push(difference);assertions++;continue;}
    }
    equal(sqlPeriod,jsPeriod,'PERIOD_'+zone+'_'+instant+'_'+frequency);
   }
   for(const count of golden.days){
    const items=streakItems(count),dates=oracle.completionDays(items);
    equal((await runtime.query('select lifequest.rules_streak($1::date[],$2::date) n',[dates,'2026-10-13'])).rows[0].n,
     oracle.streakDays(dates,'2026-10-13'),'STREAK_'+zone+'_'+count);
    const yesterday=dates.filter(d=>d!=='2026-10-13');
    equal((await runtime.query('select lifequest.rules_streak($1::date[],$2::date) n',[yesterday,'2026-10-13'])).rows[0].n,
     oracle.streakDays(yesterday,'2026-10-13'),'YESTERDAY_STREAK');
   }
   const items=[...streakItems(7,'2026-03-31'),completion('lifequest:activity:focus:id:colon','2026-03-24T12:00:00Z'),
    completion('lifequest:activity:boss:historical','2026-03-23T12:00:00Z'),completion('lifequest:activity:unknown:id','2026-03-22T12:00:00Z')];
   equal((await runtime.query('select to_jsonb(lifequest.rules_completion_days($1,$2)) days',[JSON.stringify(items),zone])).rows[0].days,
    oracle.completionDays(items),'QUEST_ONLY_DAYS');
   const state={version:1,totalXP:77,quests:[],arcs:[],completions:items};
   equal((await runtime.query('select lifequest.rules_achievements($1,$2,$3) ids',[JSON.stringify(items),10,zone])).rows[0].ids,
    oracle.achievementProgress(state,10).filter(a=>a.progress>=a.target).map(a=>a.id),'PAST_BEST_STREAK');
  }
  if(calendarDivergences.length){console.log('FAIL calendar parity: '+calendarDivergences.length+' divergences retained, not accepted');}
  else pass('five zones, DST/leap/year/month/week periods; current and past quest-only streaks');
  process.env.TZ='UTC';
  const longDays=oracle.completionDays(streakItems(10002));
  equal((await runtime.query('select lifequest.rules_streak($1::date[],$2::date) n',[longDays,'2026-10-13'])).rows[0].n,
   oracle.streakDays(longDays,'2026-10-13'),'STREAK_CAP_10000');
  const dupDays=['2026-10-13','2026-10-13','2026-10-12','2026-10-10'];
  equal((await runtime.query('select lifequest.rules_streak($1::date[],$2::date) n',[dupDays,'2026-10-13'])).rows[0].n,oracle.streakDays(dupDays,'2026-10-13'),'DUPLICATE_GAP');
  const items=Array.from({length:100},(_,i)=>completion('quest-'+i,streakItems(30)[i%30].completedAt,i%3===0?0.125:30,i<30?'discipline':'focus'));
  items.push(completion('lifequest:activity:focus:once','2026-10-13T12:00:00Z',20));
  items.push(completion('lifequest:activity:boss:once','2026-10-13T12:00:00Z',300,'discipline'));
  equal((await runtime.query('select lifequest.rules_attributes($1) attributes',[JSON.stringify(items)])).rows[0].attributes,oracle.attributeXP(items),'ATTRIBUTES');
  const state={version:1,totalXP:999,quests:[],arcs:[],completions:items};
  const unlocked=oracle.unlockAchievements(state,50,'2026-10-13T12:00:00Z');
  equal((await runtime.query('select lifequest.rules_achievements($1,50,$2) ids',[JSON.stringify(items),'UTC'])).rows[0].ids,
   unlocked.achievements.map(a=>a.id),'SIX_ACHIEVEMENTS');
  equal(unlocked.totalXP,state.totalXP,'ACHIEVEMENTS_NO_XP');
  equal(oracle.unlockAchievements(unlocked,50,'2026-10-14T12:00:00Z'),unlocked,'IDEMPOTENT_BACKFILL_ORACLE');
  pass('10000-day cap, duplicates/gaps, sequential attributes and all six achievements without XP');
  const g=golden.balanceArbitration;
  await runtime.query('set extra_float_digits=3');
  const balances=(await runtime.query('select ($1::numeric+$2::numeric)::text exact, ($1::double precision+$2::double precision)::text binary',[g.opening,g.credit])).rows[0];
  equal(balances.exact,g.exactNumericTotal,'EXACT_BALANCE');
  equal(String(Number(g.opening)+Number(g.credit)),g.jsTotal,'JS_BALANCE');
  equal(balances.binary,g.jsTotal,'BINARY_BALANCE');
  assert.notEqual(balances.exact,balances.binary);assertions++;
  // Demonstrate why blindly using binary total violates the existing exact ledger.
  equal((await runtime.query('select $1::numeric=($2::numeric+$3::numeric) coherent',[g.jsTotal,g.opening,g.credit])).rows[0].coherent,false,'BINARY_TOTAL_BREAKS_EXACT_LEDGER');
  pass('user-approved exact decimal addition demonstrated; explicit JS divergence and no corrective delta');
  for(const expression of ["lifequest.rules_reward('NaN',0)","lifequest.rules_reward('Infinity',0)",
   "lifequest.rules_reward(-1,0)","lifequest.rules_reward(1001,0)","lifequest.rules_progress('Infinity')","lifequest.rules_progress('NaN')"]){
   let caught;try{await runtime.query('select '+expression);}catch(e){caught=e;}equal(caught?.code,'22003','INVALID_NUMBER_REFUSED');
  }
  for(const [f,digest] of Object.entries(preserved))equal(hash(path.join(root,f)),digest,'FINAL_PRESERVED_'+f);
  equal((await admin.query('select count(*)::integer n from auth.users')).rows[0].n,authCount,'NO_UNEXPECTED_ACCOUNTS_CREATED');
  equal((await admin.query('select count(*)::integer n from lifequest.hunters')).rows[0].n,hunterBaseline,'NO_UNEXPECTED_HUNTERS_CREATED');
  pass('invalid numbers refused; original sources and frontend untouched; no account created');
  fs.writeFileSync(path.join(resultsDir,project+'-parity.json'),JSON.stringify({project,versions,postgres:(await admin.query('show server_version')).rows[0].server_version,
   checks:results,assertions,oracleHashes:oracle.hashes,rewardComparisons:rows.length,progressComparisons:supportedTotals.length,
   balanceDecision:'user authorized exact decimal addition for new balances; no rounding or delta',
   balanceArbitration:{exact:balances.exact,binary:balances.binary},calendarDivergences,
   runtime:{node:process.version,icu:process.versions.icu,tz:process.versions.tz},
   blockers:[...(calendarDivergences.length?['calendar timezone data mismatch']:[]),'JS subnormal 5e-324 rejected by PostgreSQL text input'],publicMutationRPCs:publicCount},null,2)+'\n');
  console.log('CHECK '+results.length+' successful groups; '+assertions+' assertions; calendar parity '+(calendarDivergences.length?'FAILED':'PASSED'));
  if(calendarDivergences.length)process.exitCode=1;
 }finally{
  if(previousZone===undefined)delete process.env.TZ;else process.env.TZ=previousZone;
  if(runtime)await runtime.end();
  if(admin._connected){await admin.query('alter role lifequest_command_owner nologin password null');await admin.end();}
 }
}
if(process.argv[2]==='baseline'){baseline();}
else main().catch(e=>{console.error('FAIL parity '+(e.code||'ASSERTION')+' '+String(e.message).split('\n')[0].replace(/postgres(?:ql)?:\/\/\S+/g,'[WITHHELD]'));process.exitCode=1;});
