'use strict';
// Read-only counts for the dedicated AUTH-4E fictional stack; never prints identities.
const assert = require('node:assert/strict');
const { Client } = require('../auth2/node_modules/pg');
const stack = require('./stack.cjs');

async function main() {
  assert.equal(stack.project, 'lifequest-auth4e-frontend-20261013', 'AUTHORIZED_STACK_ONLY');
  const cfg = stack.status();
  const api = new URL(cfg.API_URL);
  assert.equal(api.hostname, '127.0.0.1');
  assert.equal(api.port, '64621');
  const db = new URL(cfg.DB_URL);
  assert.equal(db.hostname, '127.0.0.1');
  assert.equal(db.port, '64622');
  db.username = 'supabase_admin';
  const client = new Client({ connectionString: db.href });
  try {
    await client.connect();
    const versions = Number((await client.query('select count(*) n from supabase_migrations.schema_migrations')).rows[0].n);
    const counts = (await client.query(`
      select
        (select count(*) from auth.users)::int total_auth,
        (select count(*) from auth.users where email not like '%@example.test')::int non_fixture_auth,
        (select count(*) from lifequest.hunters)::int hunters,
        (select count(*) from lifequest.xp_events)::int xp_receipts,
        (select count(*) from lifequest.command_receipts)::int command_receipts,
        (select count(*) from lifequest.calendar_activation)::int calendar_activations,
        (select count(*) from lifequest.hunter_profiles where onboarding_completed)::int synthetic_onboarding_flags
    `)).rows[0];
    assert.equal(versions, 23);
    assert.equal(counts.non_fixture_auth, 0);
    assert.equal(Number(counts.total_auth), Number(counts.hunters));
    console.log('PASS AUTH-4E read-only audit ' + JSON.stringify({ project: stack.project, versions, ...counts }));
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error('FAIL AUTH-4E audit ' + (error.code || 'CHECK_FAILED'));
  process.exitCode = 1;
});
