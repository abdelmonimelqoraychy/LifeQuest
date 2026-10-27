'use strict';

const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const restore = require('./plain-restore.cjs');
const { parseSqlRoleDependencies, SqlRoleDependencyScanner } = require('./restore-role-dependencies.cjs');

const sql = `
ALTER TABLE lifequest.hunters OWNER TO lifequest_schema_owner;
GRANT SELECT ON TABLE lifequest.hunters TO anon, authenticated, supabase_functions_admin WITH GRANT OPTION;
GRANT USAGE, SELECT ON SEQUENCE public.fixture_id TO service_role GRANTED BY supabase_admin;
ALTER DEFAULT PRIVILEGES FOR ROLE dashboard_user IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO default_acl_only_role;
CREATE POLICY fixture_policy ON lifequest.hunters TO authenticated, "Fixture ACL Role" USING (true);
GRANT lifequest_command_owner TO postgres WITH INHERIT FALSE, SET FALSE;
CREATE FUNCTION public.fixture_note() RETURNS text LANGUAGE sql AS $$
  SELECT 'GRANT FICTIONAL_SECRET TO not_a_role';
$$;
COPY public.fixture_notes (value) FROM stdin;
GRANT SHOULD_NOT_BE_SCANNED TO synthetic_private_data;
\\.
REVOKE UPDATE ON TABLE lifequest.hunters FROM service_role;
`;

const parsed = parseSqlRoleDependencies(sql);
assert.deepEqual(parsed.objectOwners, ['lifequest_schema_owner']);
assert.deepEqual(parsed.aclGrantees, ['Fixture ACL Role', 'anon', 'authenticated', 'default_acl_only_role', 'postgres', 'service_role', 'supabase_functions_admin']);
assert.deepEqual(parsed.aclGrantors, ['dashboard_user', 'supabase_admin']);
assert.deepEqual(parsed.membershipRoles, ['lifequest_command_owner']);
assert.deepEqual(parsed.defaultPrivilegeRoles, ['dashboard_user']);

const chunked = new SqlRoleDependencyScanner();
for (let offset = 0; offset < Buffer.byteLength(sql); offset += 7) {
  chunked.write(Buffer.from(sql).subarray(offset, Math.min(offset + 7, Buffer.byteLength(sql))));
}
assert.deepEqual(chunked.end(), parsed);

const toc = [
  'Dumped from database version: 17.11',
  '1; 2615 2200 SCHEMA - lifequest lifequest_schema_owner',
  '2; 0 0 EXTENSION - pgcrypto postgres',
  '3; 0 0 ACL TABLE public fixture supabase_functions_admin',
  '4; 0 0 DEFAULT ACL SCHEMA public dashboard_user',
].join('\n');
const requirements = restore.parseArchiveRequirements(toc, parsed);
assert.deepEqual(requirements.ownerRoles, ['lifequest_schema_owner', 'postgres']);
assert.deepEqual(requirements.requiredApplicationRoles, [
  'lifequest_command_owner', 'lifequest_provision_owner', 'lifequest_read_owner', 'lifequest_schema_owner',
]);
assert.ok(requirements.roleDependencies.includes('supabase_functions_admin'));
assert.ok(requirements.roleDependencies.includes('supabase_admin'));
assert.ok(requirements.aclGrantors.includes('supabase_functions_admin'));
assert.ok(requirements.roleDependencies.includes('dashboard_user'));
assert.ok(requirements.roleDependencies.includes('Fixture ACL Role'));
assert.ok(!requirements.roleDependencies.includes('synthetic_private_data'));
assert.deepEqual(requirements.extensions, ['pgcrypto']);

assert.throws(() => parseSqlRoleDependencies('GRANT SELECT ON TABLE fixture.t TO "unterminated;'),
  error => error.code === 'RESTORE_ARCHIVE_ROLE_REFERENCE_UNSUPPORTED');

async function checkRestoreBootstrapPolicies() {
  const versions31 = Array.from({ length: 31 }, (_, index) => String(20261012000100 + index));
  const targetProjectId = 'lifequest-restore-verify-fictional-target';
  assert.equal(restore.assertArchiveMatchesTarget({
    targetVersions: versions31,
    archiveManifest: { project: 'lifequest-personal-local-fictional', migrationVersions: versions31 },
    targetProjectId,
  }), true);
  assert.throws(() => restore.assertArchiveMatchesTarget({
    targetVersions: versions31,
    archiveManifest: { project: 'lifequest-personal-local-fictional', migrationVersions: [...versions31, '20261019003200'] },
    targetProjectId,
  }), error => error.code === 'RESTORE_MIGRATION_OR_PROJECT_MISMATCH');
  assert.throws(() => restore.assertArchiveMatchesTarget({
    targetVersions: versions31,
    archiveManifest: { project: 'lifequest-personal-local-fictional', migrationVersions: [...versions31.slice(0, 30), '20261019003200'] },
    targetProjectId,
  }), error => error.code === 'RESTORE_MIGRATION_OR_PROJECT_MISMATCH');
  assert.throws(() => restore.assertArchiveMatchesTarget({
    targetVersions: versions31,
    archiveManifest: { project: targetProjectId, migrationVersions: versions31 },
    targetProjectId,
  }), error => error.code === 'RESTORE_MIGRATION_OR_PROJECT_MISMATCH');

  const calls = [];
  const alreadyMigratedTarget = {
    migrationHistoryPolicy: restore.migrationHistoryPolicies.ADMIN_DATABASE_EXACT,
    async verifyAppliedMigrations(expected) { calls.push([...expected]); },
  };
  assert.equal(await restore.verifyMigrationHistoryPrecondition(alreadyMigratedTarget, versions31), restore.migrationHistoryPolicies.ADMIN_DATABASE_EXACT);
  assert.deepEqual(calls, [versions31]);

  const freshTarget = {
    migrationHistoryPolicy: restore.migrationHistoryPolicies.FRESH_DESTINATION,
    verifyTargetIdentity() {},
    async verifyAppliedMigrations() { throw new Error('must not query admin history for a fresh target'); },
  };
  assert.equal(await restore.verifyMigrationHistoryPrecondition(freshTarget, versions31), restore.migrationHistoryPolicies.FRESH_DESTINATION);
  assert.equal(calls.length, 1, 'fresh destination policy must not request administrative migration history');
  assert.throws(() => restore.validateMigrationHistoryPolicy({ migrationHistoryPolicy: 'skip-all-checks' }),
    error => error.code === 'RESTORE_MIGRATION_HISTORY_POLICY_INVALID');
  assert.throws(() => restore.validateMigrationHistoryPolicy({
    migrationHistoryPolicy: restore.migrationHistoryPolicies.ADMIN_DATABASE_EXACT,
  }), error => error.code === 'RESTORE_TARGET_ADAPTER_REQUIRED');
  assert.throws(() => restore.validateMigrationHistoryPolicy({
    migrationHistoryPolicy: restore.migrationHistoryPolicies.FRESH_DESTINATION,
  }), error => error.code === 'RESTORE_FRESH_TARGET_IDENTITY_REQUIRED');

  assert.throws(() => restore.createComposeTargetAdapter({}),
    error => error.code === 'RESTORE_MIGRATION_HISTORY_POLICY_INVALID');
  const composeFresh = restore.createComposeTargetAdapter({
    targetWorkdir: path.join(os.tmpdir(), targetProjectId),
    targetProjectId,
    expectedContainerName: `${targetProjectId}-db`,
    migrationHistoryPolicy: restore.migrationHistoryPolicies.FRESH_DESTINATION,
  });
  assert.equal(composeFresh.migrationHistoryPolicy, restore.migrationHistoryPolicies.FRESH_DESTINATION);
  await assert.rejects(composeFresh.verifyAppliedMigrations(versions31),
    error => error.code === 'RESTORE_ADMIN_HISTORY_CHECK_NOT_CONFIGURED');
  const composePreloaded = restore.createComposeTargetAdapter({
    targetWorkdir: path.join(os.tmpdir(), targetProjectId),
    targetProjectId,
    migrationHistoryPolicy: restore.migrationHistoryPolicies.ADMIN_DATABASE_EXACT,
    expectedContainerName: `${targetProjectId}-db`,
  });
  assert.equal(composePreloaded.migrationHistoryPolicy, restore.migrationHistoryPolicies.ADMIN_DATABASE_EXACT);
}

checkRestoreBootstrapPolicies().then(() => {
  console.log('PASS SQL role dependency scanner, COPY exclusion, ACL-only roles, explicit grantors, quoted identifiers, chunk boundaries, fresh-target bootstrap policy, exact archive migration matching and fail-closed policy refusals');
}).catch(error => {
  console.error(`FAIL restore bootstrap policy tests: ${error?.code || error?.name || 'ASSERTION_FAILED'}`);
  process.exitCode = 1;
});
