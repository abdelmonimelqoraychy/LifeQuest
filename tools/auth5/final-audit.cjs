'use strict';
// Read-only, target-pinned closure audit. Prints counts only, never identities.
const {Client}=require('../auth2/node_modules/pg');
const stack=require('./stack.cjs');

async function main(){
  if(stack.project!=='lifequest-auth5-intro-20261014')throw Error('UNAUTHORIZED_STACK_ONLY');
  const cfg=stack.status();
  const api=new URL(cfg.API_URL),dbUrl=new URL(cfg.DB_URL);
  if(api.hostname!=='127.0.0.1'||api.port!=='59721'||dbUrl.hostname!=='127.0.0.1'||dbUrl.port!=='59722')throw Error('WRONG_TARGET');
  dbUrl.username='supabase_admin';
  const db=new Client({connectionString:dbUrl.href});
  await db.connect();
  try{
    const result=await db.query(`
      select
        (select count(*)::int from supabase_migrations.schema_migrations) migrations,
        (select count(*)::int from auth.users) users,
        (select count(*)::int from auth.users where email not like '%@example.test') non_fixture_users,
        (select count(*)::int from lifequest.hunters) hunters,
        (select count(*)::int from lifequest.hunter_profiles) profiles,
        (select count(*)::int from lifequest.hunter_setup where configuration_status='pending') pending,
        (select count(*)::int from lifequest.hunter_setup where configuration_status='ready') ready,
        (select count(*)::int from lifequest.xp_events) xp_events,
        (select count(*)::int from lifequest.command_receipts) receipts,
        (select count(*)::int from lifequest.calendar_activation) calendar_activations
    `);
    const row=result.rows[0];
    if(row.migrations!==27||row.users!==row.hunters||row.non_fixture_users!==0)throw Error('FIXTURE_OR_MIGRATION_AUDIT_FAILED');
    console.log(`PASS read-only final audit: migrations=${row.migrations} fictional users=${row.users} hunters=${row.hunters} profiles=${row.profiles} pending=${row.pending} ready=${row.ready} XP events=${row.xp_events} receipts=${row.receipts} calendar activations=${row.calendar_activations}`);
  }finally{await db.end();}
}
main().catch(e=>{console.error('FAIL final audit '+(e.code||e.message||'AUDIT_FAILED'));process.exitCode=1;});
