'use strict';
// Strict, read-only target-specific calendar matrix for the AUTH-4E fixture stack.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { Client } = require('../auth2/node_modules/pg');
const stack = require('./stack.cjs');
const oracle = require('../auth4c/oracle.cjs');
const golden = require('../auth4c/golden.json');

async function main() {
  assert.equal(process.versions.tz, '2026e', 'PINNED_ICU_RUNTIME');
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
  const sourceDir = path.join(stack.root, 'supabase/migrations');
  let comparisons = 0;
  let offsets = 0;
  const previousZone = process.env.TZ;

  try {
    await client.connect();
    await client.query('begin read only');
    const versions = (await client.query('select version from supabase_migrations.schema_migrations order by version')).rows.map(row => row.version);
    assert.equal(versions.length, 23, 'EXPECTED_23_MIGRATIONS');
    const names = fs.readdirSync(sourceDir).filter(name => name.endsWith('.sql')).sort();
    assert.equal(names.length, 23, 'EXPECTED_23_SOURCE_MIGRATIONS');
    for (const name of names) {
      const installed = fs.readFileSync(path.join(stack.target, 'supabase/migrations', name));
      const source = fs.readFileSync(path.join(sourceDir, name));
      assert.equal(createHash('sha256').update(installed).digest('hex'), createHash('sha256').update(source).digest('hex'), 'COPIED_MIGRATION_' + name);
    }
    assert.equal(Number((await client.query('select count(*) n from auth.users')).rows[0].n), 0, 'NO_AUTH_FIXTURES_BEFORE_TESTS');
    assert.equal(Number((await client.query('select count(*) n from lifequest.hunters')).rows[0].n), 0, 'NO_HUNTERS_BEFORE_TESTS');

    const stamps = new Set(golden.instants);
    function addDay(day) {
      for (const time of ['00:00:00', '00:59:59', '01:00:00', '01:59:59', '02:00:00', '12:00:00', '22:59:59', '23:00:00', '23:59:59']) stamps.add(day + 'T' + time + '.000Z');
    }
    for (let time = Date.UTC(2026, 0, 1); time < Date.UTC(2027, 0, 1); time += 86400000) addDay(new Date(time).toISOString().slice(0, 10));
    for (let year = 2024; year <= 2028; year++) {
      for (let month = 0; month < 12; month++) {
        for (const delta of [-1, 0, 1]) addDay(new Date(Date.UTC(year, month, 1 + delta)).toISOString().slice(0, 10));
      }
    }
    const transitions = [];
    for (const zone of golden.zones) {
      process.env.TZ = zone;
      let previousOffset;
      for (let time = Date.UTC(2026, 0, 1); time < Date.UTC(2027, 0, 1); time += 3600000) {
        const offset = new Date(time).getTimezoneOffset();
        if (previousOffset !== undefined && offset !== previousOffset) {
          transitions.push({ zone, instant: new Date(time).toISOString(), beforeMinutes: previousOffset, afterMinutes: offset });
          for (const delta of [-1000, -1, 0, 1, 1000]) stamps.add(new Date(time + delta).toISOString());
        }
        previousOffset = offset;
      }
    }
    const instants = [...stamps].sort();
    for (const zone of golden.zones) {
      process.env.TZ = zone;
      const rows = (await client.query(
        "select to_char(timezone($2,t),'YYYY-MM-DD') local_day, extract(epoch from (timezone($2,t)-timezone('UTC',t)))/60 offset_minutes, lifequest.rules_period('daily',t,$2) daily, lifequest.rules_period('weekly',t,$2) weekly, lifequest.rules_period('monthly',t,$2) monthly, lifequest.rules_period('once',t,$2) once from unnest($1::timestamptz[]) t",
        [instants, zone]
      )).rows;
      assert.equal(rows.length, instants.length, 'MATRIX_ROWS_' + zone);
      for (let index = 0; index < rows.length; index++) {
        const date = new Date(instants[index]);
        assert.equal(rows[index].local_day, oracle.localDate(date), 'LOCAL_DAY_' + zone + '_' + instants[index]);
        const expectedOffset = -date.getTimezoneOffset();
        assert.equal(Number(rows[index].offset_minutes), expectedOffset === 0 ? 0 : expectedOffset, 'OFFSET_' + zone + '_' + instants[index]);
        offsets++;
        for (const frequency of ['daily', 'weekly', 'monthly', 'once']) {
          assert.equal(rows[index][frequency], oracle.periodId(frequency, date), 'PERIOD_' + zone + '_' + instants[index] + '_' + frequency);
          comparisons++;
        }
      }
      console.log('PASS ' + zone + ' ' + rows.length + ' instants');
    }
    process.env.TZ = 'Africa/Casablanca';
    const fixedBoundary = '2026-12-31T23:30:00.000Z';
    assert.equal(oracle.periodId('daily', new Date(fixedBoundary)), '2026-12-31');
    assert.equal(oracle.periodId('monthly', new Date(fixedBoundary)), '2026-12');
    assert.deepEqual((await client.query(
      "select lifequest.rules_period('daily',$1,'Africa/Casablanca') daily, lifequest.rules_period('monthly',$1,'Africa/Casablanca') monthly",
      [fixedBoundary]
    )).rows[0], { daily: '2026-12-31', monthly: '2026-12' });
    const counts = await client.query('select (select count(*) from auth.users)::int users, (select count(*) from lifequest.hunters)::int hunters');
    assert.deepEqual(counts.rows[0], { users: 0, hunters: 0 }, 'READ_ONLY_MATRIX_CREATED_NO_USERS');
    await client.query('commit');

    const proof = {
      project: stack.project,
      versions,
      instants: instants.length,
      probeInstants: instants,
      comparisons,
      offsets,
      transitions,
      divergences: 0,
      fixedBoundary,
      metadata: {
        node: process.version,
        icu: process.versions.icu,
        tzdata: process.versions.tz,
        postgres: (await client.query('show server_version')).rows[0].server_version,
      },
    };
    const resultDir = path.join(__dirname, '.results');
    fs.mkdirSync(resultDir, { recursive: true });
    const proofPath = path.join(resultDir, stack.project + '-calendar-v2.json');
    fs.writeFileSync(proofPath, JSON.stringify(proof, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    console.log('PASS target-specific calendar matrix ' + comparisons + ' strict periods, ' + offsets + ' offsets, ' + transitions.length + ' transitions, zero divergence');
  } finally {
    if (previousZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousZone;
    await client.end();
  }
}

main().catch(error => {
  console.error('FAIL calendar check ' + (error.code || 'ASSERTION') + ' ' + String(error.message).split('\n')[0]);
  process.exitCode = 1;
});
