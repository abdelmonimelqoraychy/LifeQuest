'use strict';
// Read-only diagnostics on fixed synthetic numeric/calendar cases, no Auth data.
const {Client}=require('../auth2/node_modules/pg');
const {status,project}=require('./stack.cjs');
const {execFileSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {env}=require('./stack.cjs');
async function main(){
 const u=new URL(status().DB_URL);u.username='supabase_admin';const c=new Client({connectionString:u.href});
 try{await c.connect();
  const time='2026-12-31T23:30:00Z',zone='Africa/Casablanca';
  const sql=(await c.query("select current_setting('extra_float_digits') as float_digits, current_setting('TimeZone') as session_zone, to_char(timezone($2,$1::timestamptz),'YYYY-MM-DD HH24:MI:SS') as local_stamp, extract(epoch from (timezone($2,$1::timestamptz)-timezone('UTC',$1::timestamptz))) as offset_seconds, lifequest.rules_period('daily',$1::timestamptz,$2) as helper_day, (select version from supabase_migrations.schema_migrations order by version desc limit 1) as last_version",[time,zone])).rows[0];
  const before=process.env.TZ;process.env.TZ=zone;
  const zoneFiles=[];
  for(const file of ['/nix/var/nix/profiles/default/share/postgresql/timezone/Africa/Casablanca','/usr/share/zoneinfo/Africa/Casablanca']){
   const bytes=execFileSync('docker',['exec','supabase_db_'+project,'cat',file],{env,stdio:['ignore','pipe','pipe']});
   const footer=bytes.subarray(bytes.lastIndexOf(10,bytes.length-2)+1,bytes.length-1).toString('ascii');
   zoneFiles.push({file,bytes:bytes.length,hash:createHash('sha256').update(bytes).digest('hex'),footer:/^[ -~]+$/.test(footer)?footer:'NON_ASCII'});
  }
  console.log(JSON.stringify({project,syntheticCalendar:{time,zone,sql,node:{localDate:new Date(time).toString(),offsetMinutes:new Date(time).getTimezoneOffset(),tzVersion:process.versions.tz,icuVersion:process.versions.icu}},zoneFiles}));
  if(before===undefined)delete process.env.TZ;else process.env.TZ=before;
 }finally{await c.end();}
}
main().catch(e=>{console.error('FAIL diagnostic '+(e.code||'CHECK_FAILED'));process.exitCode=1;});
