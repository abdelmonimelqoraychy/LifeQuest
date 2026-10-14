'use strict';
// Administrative activation only after real read-only calendar validation.
// Never a runtime RPC; no user/XP writes, no privileged HTTP key.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');const {Client}=require('../auth2/node_modules/pg');
const {status,project}=require('./stack.cjs');const oracle=require('./oracle.cjs');
async function main(){
 assert.ok(project==='lifequest-auth4e-r3-20261013'||['lifequest-auth4c-commands-20261013','lifequest-auth4c-commands-verified-20261013','lifequest-auth4c-final-20261013','lifequest-auth4c-safe-20261013','lifequest-auth4c-commands-gate-20261013','lifequest-auth4d-reader-20261013'].includes(project));assert.equal(process.versions.tz,'2026e');
 const proof=JSON.parse(fs.readFileSync(path.join(__dirname,'.results',project+'-calendar.json'),'utf8'));
 assert.equal(proof.divergences,0);assert.equal(proof.metadata.node.effectiveTz,'2026e');
 const probes=proof.probeInstants;assert.ok(probes.length>4000&&probes.length<=8192);
 const u=new URL(status().DB_URL);u.username='supabase_admin';const c=new Client({connectionString:u.href});const old=process.env.TZ;
 try{await c.connect();await c.query('begin');await c.query('set local role lifequest_schema_owner');
  for(const zone of ['UTC','Africa/Casablanca','Europe/Paris','America/New_York','Pacific/Auckland']){
   process.env.TZ=zone;
   const input=probes.map(stamp=>{const d=new Date(stamp);return [stamp,oracle.periodId('daily',d),oracle.periodId('weekly',d),oracle.periodId('monthly',d),'once',String(-d.getTimezoneOffset()*60)].join('|');}).join('\n');
   const expected=createHash('sha256').update(input,'utf8').digest('hex');
   const sql=(await c.query('select lifequest.calendar_digest($1,$2::jsonb) digest',[zone,JSON.stringify(probes)])).rows[0].digest;
   assert.equal(sql,expected,'INDEPENDENT_CALENDAR_DIGEST');
   await c.query("with moment as (select clock_timestamp() t) insert into lifequest.calendar_activation(zone,probes,expected_digest,range_start,range_end,validated_at,expires_at,oracle_version) select $1,$2::jsonb,$3,'2024-01-01Z'::timestamptz,'2029-01-01Z'::timestamptz,t,t+interval '24 hours','node24.19-icu78.3-tz2026e' from moment on conflict(zone) do update set probes=excluded.probes,expected_digest=excluded.expected_digest,validated_at=excluded.validated_at,expires_at=excluded.expires_at,oracle_version=excluded.oracle_version",[zone,JSON.stringify(probes),expected]);
  }
  await c.query('commit');console.log('PASS five zones activated for <=24h with independent oracle SHA-256 digests');
 }finally{if(old===undefined)delete process.env.TZ;else process.env.TZ=old;await c.end();}
}
main().catch(e=>{console.error('FAIL activation '+(e.code||'ASSERTION')+' '+String(e.message).split('\n')[0]);process.exitCode=1;});
