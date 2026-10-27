'use strict';

// Fully offline restore orchestration test. pg_restore and all PostgreSQL
// adapter calls are fakes; no Docker daemon, SQL server, or personal archive is
// contacted. Private ACLs are applied only to this unique temporary fixture.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash, randomUUID } = require('node:crypto');
const restore = require('./plain-restore.cjs');
const backup = require('./plain-backup.cjs');

const independentTargetError = restore.formatRestoreError('RESTORE_TARGET_NOT_INDEPENDENT');
assert.match(independentTargetError, /dossier privé local configuré/);
assert.doesNotMatch(independentTargetError, /[A-Za-z]:\\/,
  'user-facing restore errors must not embed a machine-specific Windows path');

function digest(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function check(condition, code) { if (!condition) throw Object.assign(new Error(code), { code }); }

async function main() {
  if (process.platform !== 'win32') {
    console.log('SKIP plain-restore-bootstrap-check: Windows ACL verifier requires Windows');
    return;
  }

  const id = randomUUID();
  const root = path.join(os.tmpdir(), `lifequest-restore-bootstrap-${id}`);
  const projectId = `lifequest-restore-verify-${id.replaceAll('-', '')}`;
  const target = path.join(root, projectId);
  const archivePath = path.join(root, 'fixture.dump');
  const manifestPath = `${archivePath}.json`;
  const pgRestoreStub = path.join(root, 'fake-pg-restore.cjs');
  const sourceProject = 'lifequest-source-synthetic';
  const versions = Array.from({ length: 31 }, (_, index) => String(20261012000100 + index));
  const calls = [];

  try {
    backup.ensurePrivateDirectory(root, { allowTemp: true });
    fs.writeFileSync(path.join(root, '.fixture-owner'), id, { flag: 'wx' });
    const migrationDir = path.join(target, 'supabase', 'migrations');
    fs.mkdirSync(migrationDir, { recursive: true });
    fs.writeFileSync(path.join(target, 'supabase', 'config.toml'),
      `project_id = "${projectId}"\nschemas = ["public"]\n`);
    const targetManifest = [];
    for (let index = 0; index < versions.length; index++) {
      const name = `${versions[index]}_synthetic_${String(index + 1).padStart(3, '0')}.sql`;
      const bytes = Buffer.from(`-- offline synthetic migration ${index + 1}\n`);
      fs.writeFileSync(path.join(migrationDir, name), bytes);
      targetManifest.push({ name, sha256: digest(bytes) });
    }
    fs.writeFileSync(path.join(target, 'lifequest-migration-manifest.json'), JSON.stringify(targetManifest));

    const archiveBytes = Buffer.alloc(2048, 0x5a);
    Buffer.from('PGDMP').copy(archiveBytes, 0);
    fs.writeFileSync(archivePath, archiveBytes, { flag: 'wx' });
    backup.protectPrivateFile(archivePath);
    const archiveManifest = {
      schema: restore.manifestSchema,
      version: 1,
      project: sourceProject,
      format: 'pg_dump-custom',
      database: 'postgres',
      filename: path.basename(archivePath),
      bytes: archiveBytes.length,
      sha256: digest(archiveBytes),
      migrationVersions: versions,
    };
    fs.writeFileSync(manifestPath, JSON.stringify(archiveManifest), { flag: 'wx' });
    backup.protectPrivateFile(manifestPath);

    const toc = [
      'Dumped from database version: 17.11',
      '1; 2615 2200 SCHEMA - lifequest lifequest_schema_owner',
      '2; 0 0 EXTENSION - pgcrypto postgres',
    ].join('\n');
    fs.writeFileSync(pgRestoreStub, [
      "'use strict';",
      'const args=process.argv.slice(2);',
      'process.stdin.resume();',
      "process.stdin.on('end',()=>{if(args.includes('--list'))process.stdout.write(" + JSON.stringify(toc + String.fromCharCode(10)) + ");});",
    ].join('\n'));

    const adapter = (overrides = {}) => ({
      migrationHistoryPolicy: restore.migrationHistoryPolicies.FRESH_DESTINATION,
      async verifyTargetIdentity() { calls.push('identity'); },
      async verifyExpectedOwnerRoles(required) { calls.push('roles'); check(Array.isArray(required) && required.includes('lifequest_schema_owner'), 'FAKE_ROLE_REQUIREMENTS_INVALID'); },
      async verifyAvailableExtensions(required) { calls.push('extensions'); check(required.includes('pgcrypto'), 'FAKE_EXTENSION_REQUIREMENTS_INVALID'); },
      async verifyAppliedMigrations() { calls.push('admin-history-must-not-be-read'); throw new Error('unexpected administrative history check'); },
      async databaseExists() { calls.push('destination-exists-check'); return false; },
      async createDatabase(name) { calls.push(`create:${name}`); },
      async restoreDatabase(args) { calls.push('restore'); check(args.streamArchive === true, 'ARCHIVE_STREAM_NOT_USED'); },
      async verifyRestoredDatabase(args) {
        calls.push('postcheck');
        assert.deepEqual(args.migrationVersions, versions);
      },
      ...overrides,
    });
    const run = (targetAdapter, db = 'lifequest_restore_synthetic') => restore.restoreToFreshDatabase({
      archivePath,
      manifestPath,
      expectedSourceProject: sourceProject,
      targetProjectId: projectId,
      targetWorkdir: target,
      databaseName: db,
      pgRestoreCommand: process.execPath,
      pgRestorePrefixArgs: [pgRestoreStub],
      streamArchive: true,
      targetAdapter,
      allowSyntheticTempTarget: true,
    });

    const successAdapter = adapter();
    const result = await run(successAdapter);
    assert.equal(result.databaseName, 'lifequest_restore_synthetic');
    assert.deepEqual(calls, [
      'identity', 'roles', 'extensions', 'destination-exists-check',
      'create:lifequest_restore_synthetic', 'restore', 'postcheck',
    ]);
    assert.ok(!calls.includes('admin-history-must-not-be-read'));

    calls.length = 0;
    const existingAdminHistory = adapter({
      migrationHistoryPolicy: restore.migrationHistoryPolicies.ADMIN_DATABASE_EXACT,
      async verifyAppliedMigrations(expected) { calls.push('admin-history-check'); assert.deepEqual(expected, versions); },
    });
    await run(existingAdminHistory, 'lifequest_restore_preloaded_mode');
    assert.deepEqual(calls, [
      'identity', 'roles', 'extensions', 'admin-history-check', 'destination-exists-check',
      'create:lifequest_restore_preloaded_mode', 'restore', 'postcheck',
    ]);

    calls.length = 0;
    await assert.rejects(run(adapter({ async databaseExists() { calls.push('destination-exists-check'); return true; } }),
      'lifequest_restore_preexisting'), error => error.code === 'RESTORE_DATABASE_ALREADY_EXISTS');
    assert.deepEqual(calls, ['identity', 'roles', 'extensions', 'destination-exists-check']);

    calls.length = 0;
    await assert.rejects(run(adapter({ async verifyExpectedOwnerRoles() { calls.push('roles'); throw Object.assign(new Error('missing role'), { code: 'RESTORE_REQUIRED_ROLE_MISSING' }); } }),
      'lifequest_restore_missing_role'), error => error.code === 'RESTORE_REQUIRED_ROLE_MISSING');
    assert.deepEqual(calls, ['identity', 'roles']);

    calls.length = 0;
    await assert.rejects(run(adapter({ async verifyAvailableExtensions() { calls.push('extensions'); throw Object.assign(new Error('extension absent'), { code: 'RESTORE_REQUIRED_EXTENSION_MISSING' }); } }),
      'lifequest_restore_missing_extension'), error => error.code === 'RESTORE_REQUIRED_EXTENSION_MISSING');
    assert.deepEqual(calls, ['identity', 'roles', 'extensions']);

    calls.length = 0;
    const mismatchedManifest = { ...archiveManifest, migrationVersions: [...versions.slice(0, 30), '20261019003200'] };
    // The on-disk manifest is authoritative; create a separately authenticated
    // synthetic archive/manifest pair to test a valid but incompatible version set.
    const mismatchArchive = path.join(root, 'mismatch.dump');
    const mismatchManifestPath = `${mismatchArchive}.json`;
    fs.writeFileSync(mismatchArchive, archiveBytes, { flag: 'wx' }); backup.protectPrivateFile(mismatchArchive);
    fs.writeFileSync(mismatchManifestPath, JSON.stringify({ ...mismatchedManifest, filename: path.basename(mismatchArchive) }), { flag: 'wx' });
    backup.protectPrivateFile(mismatchManifestPath);
    const mismatchAttempt = restore.restoreToFreshDatabase({
      archivePath: mismatchArchive, manifestPath: mismatchManifestPath, expectedSourceProject: sourceProject,
      targetProjectId: projectId, targetWorkdir: target, databaseName: 'lifequest_restore_wrong_versions',
      pgRestoreCommand: process.execPath, pgRestorePrefixArgs: [pgRestoreStub], streamArchive: true,
      targetAdapter: adapter(), allowSyntheticTempTarget: true,
    });
    await assert.rejects(mismatchAttempt, error => error.code === 'RESTORE_MIGRATION_OR_PROJECT_MISMATCH');
    assert.deepEqual(calls, ['identity']);

    const adminCalls = [];
    const legacyPolicy = {
      migrationHistoryPolicy: restore.migrationHistoryPolicies.ADMIN_DATABASE_EXACT,
      async verifyAppliedMigrations(expected) { adminCalls.push([...expected]); },
    };
    await restore.verifyMigrationHistoryPrecondition(legacyPolicy, versions);
    assert.deepEqual(adminCalls, [versions]);
    await assert.rejects(restore.verifyMigrationHistoryPrecondition({
      migrationHistoryPolicy: restore.migrationHistoryPolicies.ADMIN_DATABASE_EXACT,
    }, versions), error => error.code === 'RESTORE_TARGET_ADAPTER_REQUIRED');

    console.log('PASS fresh Compose restore bootstrap: no admin migration-history dependency; 31-version archive/source match; identity, role, extension and destination refusals before CREATE; restore and post-history checks ordered; legacy pre-migrated mode retained');
  } finally {
    const resolved = path.resolve(root);
    const marker = path.join(resolved, '.fixture-owner');
    if (path.dirname(resolved) !== path.resolve(os.tmpdir())
      || !path.basename(resolved).startsWith('lifequest-restore-bootstrap-')
      || !fs.existsSync(marker) || fs.readFileSync(marker, 'utf8') !== id) {
      throw new Error('TEST_TEMP_CLEANUP_IDENTITY_FAILED');
    }
    fs.rmSync(resolved, { recursive: true, force: false });
  }
}

main().catch(error => {
  console.error(`FAIL plain-restore-bootstrap-check ${error?.code || error?.name || 'ASSERTION_FAILED'}`);
  process.exitCode = 1;
});
