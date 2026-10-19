'use strict';
// Synthetic-only RPC/catalog checks against the fixed local project in stack.cjs.
const assert = require('node:assert/strict');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { Client } = require('../auth2/node_modules/pg');
const oracle = require('../auth4c/oracle.cjs');
const stack = require('./stack.cjs');

const checks = [];
let admin;
let api;
let key;
let actor;
function pass(label) { checks.push(label); console.log(`PASS ${label}`); }
function endpoint(kind) { return kind.startsWith('boss.') ? 'lifequest_operations_command' : 'lifequest_lab_command'; }
async function request(route, token, body, method = 'POST') {
  const headers = { apikey: key };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${api}${route}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(10000) });
  let data;
  try { data = await response.json(); } catch {}
  return { status: response.status, data };
}
async function rpc(kind, payload, requestId = randomUUID(), token = actor.token) {
  return request(`/rest/v1/rpc/${endpoint(kind)}`, token, { expected_actor: actor.id, request_id: requestId, kind, payload });
}
async function ok(kind, payload, requestId) {
  const result = await rpc(kind, payload, requestId);
  if (result.status !== 200) console.error(`RPC_DIAGNOSTIC ${kind} status=${result.status} code=${result.data?.code || 'unknown'} message=${String(result.data?.message || '').slice(0, 240)}`);
  assert.equal(result.status, 200, `RPC_${kind}_${result.data?.code || result.data?.message || 'FAILED'}`);
  assert.equal(result.data.actor, actor.id);
  return result.data;
}
async function expectError(kind, payload, expectedMessage) {
  const requestId = randomUUID();
  const before = await admin.query('select count(*)::int n from lifequest.boss_missions where user_id=$1', [actor.id]);
  const result = await rpc(kind, payload, requestId);
  assert.ok(result.status >= 400, `EXPECTED_${expectedMessage}`);
  assert.equal(result.data?.message, expectedMessage, `ERROR_${expectedMessage}`);
  const after = await admin.query('select count(*)::int n from lifequest.boss_missions where user_id=$1', [actor.id]);
  assert.equal(after.rows[0].n, before.rows[0].n, `${expectedMessage}_NO_BOSS_WRITE`);
  const receipt = await admin.query('select count(*)::int n from lifequest.command_receipts where user_id=$1 and request_id=$2', [actor.id, requestId]);
  assert.equal(receipt.rows[0].n, 0, `${expectedMessage}_NO_RECEIPT`);
  return result;
}
async function readFixtureInbox(email) {
  const inboxUrl = `http://127.0.0.1:${stack.ports.mail}`;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const listResponse = await fetch(`${inboxUrl}/api/v1/messages`, { signal: AbortSignal.timeout(5000) });
    if (listResponse.ok) {
      const list = await listResponse.json();
      for (const message of list.messages || []) {
        if (!(message.To || []).some(recipient => recipient.Address === email)) continue;
        const body = await (await fetch(`${inboxUrl}/api/v1/message/${message.ID}`, { signal: AbortSignal.timeout(5000) })).json();
        for (const match of String(body.HTML || '').matchAll(/href="([^"]+)"/g)) {
          const link = new URL(match[1].replaceAll('&amp;', '&'));
          if (link.searchParams.get('type') === 'email' && link.searchParams.get('token_hash')) return link.searchParams.get('token_hash');
        }
      }
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('FIXTURE_CONFIRMATION_NOT_RECEIVED');
}
async function signupFixture() {
  const email = `mindmap-${randomUUID()}@example.test`;
  const password = randomBytes(24).toString('hex');
  const signup = await request('/auth/v1/signup', null, { email, password });
  assert.equal(signup.status, 200, 'FIXTURE_SIGNUP');
  assert.ok(!signup.data.access_token, 'FIXTURE_MUST_CONFIRM_EMAIL');
  const tokenHash = await readFixtureInbox(email);
  const verified = await request('/auth/v1/verify', null, { token_hash: tokenHash, type: 'email' });
  assert.equal(verified.status, 200, 'FIXTURE_EMAIL_CONFIRMATION');
  return { id: verified.data.user.id, token: verified.data.access_token };
}
async function activateUtcFixture() {
  const probes = [];
  const start = Date.UTC(2025, 0, 1);
  const stop = Date.UTC(2028, 0, 1);
  for (let instant = start; instant < stop; instant += 4 * 60 * 60 * 1000) probes.push(new Date(instant).toISOString());
  assert.ok(probes.length > 4000 && probes.length <= 8192);
  const oldTz = process.env.TZ;
  process.env.TZ = 'UTC';
  try {
    assert.equal(new Date('2026-10-18T12:00:00.000Z').getTimezoneOffset(), 0, 'NODE_UTC_TEST_ORACLE');
    const input = probes.map(stamp => {
      const date = new Date(stamp);
      return [stamp, oracle.periodId('daily', date), oracle.periodId('weekly', date), oracle.periodId('monthly', date), 'once', String(-date.getTimezoneOffset() * 60)].join('|');
    }).join('\n');
    const expected = createHash('sha256').update(input, 'utf8').digest('hex');
    await admin.query('begin');
    await admin.query('set local role lifequest_schema_owner');
    const actual = (await admin.query("select lifequest.calendar_digest('UTC',$1::jsonb) digest", [JSON.stringify(probes)])).rows[0].digest;
    assert.equal(actual, expected, 'UTC_SERVER_CALENDAR_PARITY');
    await admin.query("insert into lifequest.calendar_activation(zone,probes,expected_digest,range_start,range_end,validated_at,expires_at,oracle_version) values('UTC',$1::jsonb,$2,'2025-01-01Z','2028-01-01Z',clock_timestamp(),clock_timestamp()+interval '24 hours','fictional-UTC-parity') on conflict(zone) do update set probes=excluded.probes,expected_digest=excluded.expected_digest,range_start=excluded.range_start,range_end=excluded.range_end,validated_at=excluded.validated_at,expires_at=excluded.expires_at,oracle_version=excluded.oracle_version", [JSON.stringify(probes), expected]);
    await admin.query('commit');
  } catch (error) {
    try { await admin.query('rollback'); } catch {}
    throw error;
  } finally {
    if (oldTz === undefined) delete process.env.TZ;
    else process.env.TZ = oldTz;
  }
}
async function prepareReadyFixture() {
  await admin.query('begin');
  try {
    await admin.query("update lifequest.hunters set timezone='UTC',timezone_confirmed_at=clock_timestamp(),opening_xp=0,total_xp=0 where user_id=$1", [actor.id]);
    await admin.query("update lifequest.hunter_setup set origin_choice='new',chosen_at=clock_timestamp(),configuration_status='ready' where user_id=$1", [actor.id]);
    await admin.query("insert into lifequest.hunter_profiles(user_id,name,age,gender,avatar,goals,onboarding_completed,original_created_at) values($1,'Fictional Mind Map Hunter',25,'other','male','{}',true,clock_timestamp())", [actor.id]);
    await admin.query('commit');
  } catch (error) {
    try { await admin.query('rollback'); } catch {}
    throw error;
  }
}
async function makeBranch(title) {
  const parent = await ok('node.create', { title, parentId: null });
  const first = await ok('node.create', { title: `${title} / first`, parentId: parent.result.id });
  const second = await ok('node.create', { title: `${title} / second`, parentId: parent.result.id });
  const rows = (await admin.query('select id,parent_id,title,revision::text,sort_position::text from lifequest.mind_nodes where user_id=$1 and (id=$2 or parent_id=$2) order by case when id=$2 then 0 else 1 end,sort_position,id collate "C"', [actor.id, parent.result.id])).rows;
  const parentRow = rows.find(row => row.id === parent.result.id);
  const children = rows.filter(row => row.parent_id === parent.result.id);
  return {
    parent: parentRow,
    children,
    source: { parentId: parentRow.id, parentRevision: parentRow.revision, children: children.map(row => ({ id: row.id, revision: row.revision })) },
    stepIds: [first.result.id, second.result.id],
  };
}
async function bossPayload(branch, title = 'Synthetic Branch Boss') {
  return {
    title,
    subObjectives: branch.children.map((row, index) => ({ title: `Edited synthetic step ${index + 1}`, weight: index === 0 ? 30 : 70 })),
    mindMapSource: branch.source,
  };
}
async function catalogChecks(versions) {
  const sourceNames = require('node:fs').readdirSync(require('node:path').resolve(__dirname, '../../supabase/migrations')).filter(name => name.endsWith('.sql')).sort();
  assert.equal(sourceNames.length, 31);
  assert.deepEqual(versions, sourceNames.map(name => name.slice(0, 14)));
  const sourceColumn = await admin.query("select is_nullable,data_type from information_schema.columns where table_schema='lifequest' and table_name='boss_missions' and column_name='source_mind_node_id'");
  assert.deepEqual(sourceColumn.rows[0], { is_nullable: 'YES', data_type: 'text' });
  const fk = await admin.query("select c.confdeltype from pg_constraint c where c.conname='boss_missions_source_mind_node_fk'");
  assert.equal(fk.rows[0]?.confdeltype, 'r');
  const index = await admin.query("select i.indisunique,pg_get_expr(i.indpred,i.indrelid) predicate from pg_index i join pg_class c on c.oid=i.indexrelid where c.relname='boss_missions_one_per_source_node'");
  assert.equal(index.rows[0]?.indisunique, true);
  assert.match(index.rows[0]?.predicate || '', /source_mind_node_id IS NOT NULL/i);
  assert.equal((await admin.query("select has_column_privilege('lifequest_command_owner','lifequest.boss_missions','source_mind_node_id','INSERT') ok")).rows[0].ok, true, 'COMMAND_OWNER_HAS_ONLY_ADDED_SOURCE_COLUMN_GRANT');
  assert.equal((await admin.query("select has_column_privilege('lifequest_command_owner','lifequest.boss_missions','historical','INSERT') ok")).rows[0].ok, false, 'HISTORICAL_COLUMN_REMAINS_NON_WRITABLE');
  const tables = await admin.query("select count(*)::int total,count(*) filter(where c.relrowsecurity and c.relforcerowsecurity)::int protected from pg_class c where c.relnamespace='lifequest'::regnamespace and c.relkind='r'");
  assert.ok(tables.rows[0].total >= 20);
  assert.equal(tables.rows[0].protected, tables.rows[0].total, 'ALL_PRIVATE_TABLES_FORCE_RLS');
  const direct = await admin.query("select count(*)::int n from pg_class c where c.relnamespace='lifequest'::regnamespace and c.relkind='r' and (has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE'))");
  assert.equal(direct.rows[0].n, 0, 'NO_DIRECT_PRIVATE_TABLE_ACCESS');
  const roles = await admin.query("select bool_and(not rolsuper and not rolcanlogin and not rolbypassrls and not rolcreatedb and not rolcreaterole and not rolreplication) ok from pg_roles where rolname in ('lifequest_schema_owner','lifequest_command_owner','lifequest_read_owner','lifequest_provision_owner')");
  assert.equal(roles.rows[0].ok, true, 'LIMITED_LIFEQUEST_ROLES');
  const policyCount = await admin.query("select count(*)::int n from pg_policies where schemaname='lifequest'");
  assert.ok(policyCount.rows[0].n >= 80, 'RLS_POLICIES_RETAINED');
  const helper = await admin.query("select p.prosecdef,r.rolname owner,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where n.nspname='lifequest' and p.proname='validate_mind_map_boss_source'");
  assert.equal(helper.rows.length, 1);
  assert.equal(helper.rows[0].prosecdef, false);
  assert.equal(helper.rows[0].owner, 'lifequest_schema_owner');
  assert.ok(helper.rows[0].proconfig.includes('search_path=""'));
  for (const role of ['anon', 'authenticated']) assert.equal((await admin.query('select has_function_privilege($1,$2::regprocedure,\'EXECUTE\') ok', [role, 'lifequest.validate_mind_map_boss_source(uuid,jsonb,integer)'])).rows[0].ok, false);
  const publicExec = await admin.query("select not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') ok from pg_proc p where p.oid='lifequest.validate_mind_map_boss_source(uuid,jsonb,integer)'::regprocedure");
  assert.equal(publicExec.rows[0].ok, true, 'HELPER_NOT_PUBLIC_EXECUTABLE');
  assert.equal((await admin.query("select has_function_privilege('lifequest_command_owner','lifequest.validate_mind_map_boss_source(uuid,jsonb,integer)','EXECUTE') ok")).rows[0].ok, true);
  const command = await admin.query("select p.prosecdef,r.rolname owner,p.prosrc from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid='public.lifequest_operations_command(uuid,uuid,text,jsonb)'::regprocedure");
  assert.equal(command.rows[0].prosecdef, true);
  assert.equal(command.rows[0].owner, 'lifequest_command_owner');
  assert.match(command.rows[0].prosrc, /validate_mind_map_boss_source/);
  assert.match(command.rows[0].prosrc, /source_mind_node_id/);
  assert.equal((await admin.query("select has_function_privilege('authenticated','public.lifequest_operations_command(uuid,uuid,text,jsonb)','EXECUTE') ok")).rows[0].ok, true);
  assert.equal((await admin.query("select has_function_privilege('anon','public.lifequest_operations_command(uuid,uuid,text,jsonb)','EXECUTE') ok")).rows[0].ok, false);
  pass('31 migrations, nullable source FK/unique index, limited source-column grant, private helper, locked-down roles/RLS and existing public RPC ownership');
}
async function main() {
  assert.equal(stack.project, 'lifequest-mind-map-boss-v1-20261018');
  const versions = await stack.ensureMigrations();
  const cfg = stack.status();
  api = cfg.API_URL;
  key = cfg.PUBLISHABLE_KEY || cfg.ANON_KEY;
  assert.ok(key && new URL(api).hostname === '127.0.0.1');
  const dbUrl = new URL(cfg.DB_URL);
  assert.equal(dbUrl.hostname, '127.0.0.1');
  assert.equal(dbUrl.port, String(stack.ports.db));
  dbUrl.username = 'supabase_admin';
  admin = new Client({ connectionString: dbUrl.href, connectionTimeoutMillis: 5000, query_timeout: 15000 });
  await admin.connect();
  const fixtureAudit = await admin.query("select count(*)::int users,count(*) filter(where split_part(email,'@',2)<>'example.test')::int non_fixture,(select count(*)::int from lifequest.hunters) hunters,(select count(*)::int from lifequest.boss_missions) bosses,(select count(*)::int from lifequest.xp_events) ledger from auth.users");
  assert.equal(fixtureAudit.rows[0].non_fixture, 0, 'NO_NON_FIXTURE_IDENTITIES');
  assert.equal(fixtureAudit.rows[0].hunters, fixtureAudit.rows[0].users, 'ONLY_SYNTHETIC_PROVISIONED_HUNTERS');
  await catalogChecks(versions);

  await activateUtcFixture();
  actor = await signupFixture();
  await prepareReadyFixture();
  const initialSnapshot = await request('/rest/v1/rpc/lifequest_hunter_snapshot', actor.token, { expected_actor: actor.id });
  assert.equal(initialSnapshot.status, 200, 'READY_SYNTHETIC_SNAPSHOT');
  assert.equal(initialSnapshot.data.state, 'ready');
  assert.equal(initialSnapshot.data.data.profile.classCode, null, 'CLASS_REMAINS_UNSELECTED');
  const before = await admin.query('select h.total_xp::text xp,h.opening_xp::text opening,(select count(*)::int from lifequest.xp_events e where e.user_id=h.user_id) ledger from lifequest.hunters h where h.user_id=$1', [actor.id]);
  await makeBranch('Synthetic branch');
  const branch = await makeBranch('Conversion source');
  const payload = await bossPayload(branch);
  const requestId = randomUUID();
  const created = await ok('boss.create', payload, requestId);
  const replayed = await ok('boss.create', payload, requestId);
  assert.equal(replayed.result.id, created.result.id, 'SAME_REQUEST_ID_REPLAYS_IMMUTABLE_RECEIPT');
  assert.equal(replayed.replayed, true, 'RETRY_MARKED_AS_REPLAY');
  const linked = await admin.query('select id,title,source_mind_node_id,target,current,base_xp from lifequest.boss_missions where user_id=$1 and source_mind_node_id=$2', [actor.id, branch.parent.id]);
  assert.equal(linked.rows.length, 1);
  const bossId = linked.rows[0].id;
  assert.equal(Number(linked.rows[0].target), 100);
  const steps = await admin.query('select title,weight,sort_position from lifequest.boss_subobjectives where user_id=$1 and boss_id=$2 order by sort_position', [actor.id, bossId]);
  assert.deepEqual(steps.rows.map(row => [row.title, Number(row.weight)]), [['Edited synthetic step 1', 30], ['Edited synthetic step 2', 70]]);
  assert.equal((await admin.query('select count(*)::int n from lifequest.xp_events where user_id=$1', [actor.id])).rows[0].n, Number(before.rows[0].ledger));
  const after = await admin.query('select h.total_xp::text xp,h.opening_xp::text opening,(select count(*)::int from lifequest.xp_events e where e.user_id=h.user_id) ledger from lifequest.hunters h where h.user_id=$1', [actor.id]);
  assert.deepEqual(after.rows[0], before.rows[0], 'NO_XP_OR_LEDGER_CHANGE');
  pass('real Auth-confirmed fictional actor converts an ordered branch; same request retry returns one Boss with edited weights and zero XP');

  await expectError('boss.create', payload, 'SOURCE_ALREADY_CONVERTED');
  await expectError('node.delete', { id: branch.parent.id, expectedRevision: branch.parent.revision }, 'MIND_MAP_SOURCE_IN_USE');
  const fresh = await makeBranch('Conflict source');
  await expectError('boss.create', { ...await bossPayload(fresh), mindMapSource: { ...fresh.source, parentRevision: '999' } }, 'REVISION_CONFLICT');
  await expectError('boss.create', { ...await bossPayload(fresh), mindMapSource: { ...fresh.source, children: [{ id: 'not-a-direct-child', revision: '0' }, fresh.source.children[1]] } }, 'REVISION_CONFLICT');
  await expectError('boss.create', { ...await bossPayload(fresh), mindMapSource: { ...fresh.source, children: fresh.source.children.map(child => ({ ...child, revision: '999' })) } }, 'REVISION_CONFLICT');
  pass('second conversion, source deletion, stale parent, changed child membership and stale child revision all fail atomically');

  const ordinary = await ok('boss.create', { title: 'Legacy-style Boss', subObjectives: [{ title: 'Unlinked step', weight: 5 }] });
  assert.equal((await admin.query('select source_mind_node_id from lifequest.boss_missions where user_id=$1 and id=$2', [actor.id, ordinary.result.id])).rows[0].source_mind_node_id, null, 'LEGACY_BOSS_STAYS_UNLINKED');
  const directPatch = await fetch(`${api}/rest/v1/boss_missions?id=eq.${encodeURIComponent(bossId)}`, { method: 'PATCH', headers: { apikey: key, Authorization: `Bearer ${actor.token}`, 'Content-Type': 'application/json', 'Content-Profile': 'lifequest' }, body: JSON.stringify({ title: 'forbidden' }) });
  assert.ok(directPatch.status >= 400, 'DIRECT_PRIVATE_DML_DENIED');
  const snapshot = await request('/rest/v1/rpc/lifequest_hunter_snapshot', actor.token, { expected_actor: actor.id });
  assert.equal(snapshot.status, 200);
  assert.equal(snapshot.data.state, 'ready');
  assert.ok(snapshot.data.data.extra.bosses.some(row => row.id === bossId && row.sourceMindNodeId === branch.parent.id));
  assert.ok(snapshot.data.data.extra.bosses.some(row => row.id === ordinary.result.id && row.sourceMindNodeId === null));
  const afterAll = await admin.query('select h.total_xp::text xp,(select count(*)::int from lifequest.xp_events e where e.user_id=h.user_id) ledger from lifequest.hunters h where h.user_id=$1', [actor.id]);
  assert.equal(afterAll.rows[0].xp, before.rows[0].xp);
  assert.equal(afterAll.rows[0].ledger, Number(before.rows[0].ledger));
  pass('unlinked Boss compatibility, snapshot exposes source association, direct table mutation denied, all Boss creation leaves XP/ledger unchanged');

  console.log(`PASS ${checks.length} SQL/Auth/RPC groups; only generated example.test identity and synthetic rows were used`);
  require('node:fs').mkdirSync(require('node:path').join(__dirname, '.results'), { recursive: true });
  require('node:fs').writeFileSync(require('node:path').join(__dirname, '.results', `${stack.project}-rpc.json`), `${JSON.stringify({ project: stack.project, migrationCount: versions.length, groups: checks, result: 'pass' }, null, 2)}\n`);
}

main().catch(error => {
  const location = String(error.stack || '').split('\n').find(line => line.includes('check.cjs:')) || '';
  console.error(`FAIL fictional RPC check ${error.code || 'ASSERTION'} ${String(error.message).split('\n')[0]} ${location.trim()}`);
  process.exitCode = 1;
}).finally(async () => { if (admin) await admin.end(); });
