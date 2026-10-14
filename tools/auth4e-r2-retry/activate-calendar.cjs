'use strict';
// Local-only activation after the target-specific independent matrix succeeds.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Client}=require('../auth2/node_modules/pg'); const stack=require('./stack.cjs');
async function main(){
 assert.equal(process.versions.tz,'2026e','PINNED_ICU_RUNTIME');
 const proofPath=path.join(__dirname,'.results',stack.project+'-calendar-v2.json');const proof=JSON.parse(fs.readFileSync(proofPath,'utf8'));
 assert.equal(proof.project,stack.project);assert.equal(proof.divergences,0);assert.equal(proof.metadata.tzdata,'2026e');assert.ok(proof.probeInstants.length>=4000);
 const cfg=stack.status();const db=new URL(cfg.DB_URL);db.username='supabase_admin';const c=new Client({connectionString:db.href});
 try{await c.connect();await c.query('begin');await c.query('set local role lifequest_schema_owner');
  for(const zone of ['UTC','Africa/Casablanca','Europe/Paris','America/New_York','Pacific/Auckland']){
   process.env.TZ=zone;const expected=proof.probeInstants.map(stamp=>{const date=new Date(stamp);return[stamp,require('../auth4c/oracle.cjs').periodId('daily',date),require('../auth4c/oracle.cjs').periodId('weekly',date),require('../auth4c/oracle.cjs').periodId('monthly',date),'once',String(-date.getTimezoneOffset()*60)].join('|')}).join('\n');
   const digest=require('node:crypto').createHash('sha256').update(expected).digest('hex');
   const actual=(await c.query('select lifequest.calendar_digest($1,$2::jsonb) digest',[zone,JSON.stringify(proof.probeInstants)])).rows[0].digest;assert.equal(actual,digest,'CALENDAR_ACTIVATION_DIGEST');
   await c.query("with moment as(select clock_timestamp() t) insert into lifequest.calendar_activation(zone,probes,expected_digest,range_start,range_end,validated_at,expires_at,oracle_version) select $1,$2::jsonb,$3,'2024-01-01Z'::timestamptz,'2029-01-01Z'::timestamptz,t,t+interval '24 hours','node24.19-icu78.3-tz2026e' from moment",[zone,JSON.stringify(proof.probeInstants),digest]);
  }
  await c.query('commit');console.log('PASS activated only the five zones on '+stack.project+'; expiry <=24 hours; no Cloud target');
 }finally{await c.end();}
}
main().catch(e=>{console.error('FAIL local calendar activation '+(e.code||'CHECK_FAILED'));process.exitCode=1;});
