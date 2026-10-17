'use strict';
// Read-only, aggregate-only postflight for the one synthetic Hunter Classes stack.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Client}=require('../auth2/node_modules/pg'),stack=require('./stack.cjs');

async function main(){
  assert.equal(stack.project,'lifequest-hunter-classes-v1-20261015');
  stack.verifySources(28);
  const cfg=stack.status(),url=new URL(cfg.DB_URL);
  assert.equal(new URL(cfg.API_URL).hostname,'127.0.0.1');
  assert.equal(new URL(cfg.API_URL).port,String(stack.ports.api));
  url.username='supabase_admin';
  const db=new Client({connectionString:url.href});
  await db.connect();
  try{
    await db.query('begin read only');
    const versions=(await db.query('select version from supabase_migrations.schema_migrations order by version')).rows.map(row=>row.version);
    const expected=[...stack.historicalMigrations().map(name=>name.slice(0,14)),'20261015002800'];
    assert.deepEqual(versions,expected,'EXACT_27_PLUS_CLASS_MIGRATION_HISTORY');
    const counts=(await db.query(`
      select
        (select count(*)::int from auth.users) as auth_users,
        (select count(*)::int from auth.users where email is null or email not like '%@example.test') as non_fixture_users,
        (select count(*)::int from lifequest.hunters) as hunters,
        (select count(*)::int from lifequest.hunter_profiles) as profiles,
        (select count(*)::int from lifequest.hunter_setup where configuration_status='ready') as ready,
        (select count(*)::int from lifequest.hunter_setup where configuration_status<>'ready') as pending,
        (select count(*)::int from lifequest.xp_events) as xp_events,
        (select count(*)::int from lifequest.command_receipts) as command_receipts,
        (select count(*)::int from lifequest.command_receipts where command_kind='profile.class.select') as class_receipts,
        (select count(*)::int from lifequest.hunters where total_xp<>0 or opening_xp<>0 or legacy_roundoff_delta<>0) as nonzero_progression,
        (select count(*)::int from lifequest.hunters h where h.total_xp<>h.opening_xp+h.legacy_roundoff_delta+coalesce((select sum(x.awarded_xp) from lifequest.xp_events x where x.user_id=h.user_id),0)) as ledger_mismatches,
        (select count(*)::int from lifequest.hunter_profiles where class_code is not null and class_code not in ('threshold_scout','obsidian_sentinel','archive_arcanist','flamebearer','oathweaver')) as invalid_classes
    `)).rows[0];
    assert.equal(counts.non_fixture_users,0,'ALL_IDENTITIES_ARE_SYNTHETIC');
    assert.equal(counts.auth_users,counts.hunters,'AUTH_HUNTER_PROVISIONING_COUNTS');
    assert.equal(counts.xp_events,0,'NO_XP_LEDGER_EVENTS');
    assert.equal(counts.nonzero_progression,0,'NO_XP_PROGRESS');
    assert.equal(counts.ledger_mismatches,0,'XP_LEDGER_RECONCILES');
    assert.equal(counts.invalid_classes,0,'CLASS_CATALOG_CONSTRAINT');
    const classDistribution=(await db.query(`select coalesce(class_code,'(none)') class,count(*)::int count from lifequest.hunter_profiles group by class_code order by class_code nulls first`)).rows;
    await db.query('commit');
    const report={project:stack.project,migrations:versions.length,versions,counts,classDistribution,readOnly:true,identityValuesOmitted:true};
    const out=path.join(__dirname,'.results');fs.mkdirSync(out,{recursive:true});
    fs.writeFileSync(path.join(out,'postflight-report.json'),JSON.stringify(report,null,2)+'\n');
    console.log(`PASS read-only postflight: ${versions.length} migrations; ${counts.auth_users} synthetic users/Hunters; ${counts.non_fixture_users} non-fixture identities; ${counts.xp_events} XP events; ${counts.class_receipts} class receipts; progression and ledger consistent`);
  }finally{await db.end();}
}
main().catch(error=>{console.error('FAIL target-scoped postflight '+String(error.code||error.message||'ASSERTION').replace(/[\r\n]+/g,' ').slice(0,300));process.exitCode=1;});
