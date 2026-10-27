'use strict';

// Restores an unencrypted custom-format dump only into a new database inside
// an already-running, independent verification stack. It never starts a stack.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, spawnSync, execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { verifyPrivateAcl } = require('./plain-backup.cjs');
const { SqlRoleDependencyScanner } = require('./restore-role-dependencies.cjs');

const root = path.resolve(__dirname, '../..');
function personalStackConfig() {
  let stack;
  try { stack = require('./stack.cjs'); } catch { fail('RESTORE_LOCAL_CONFIG_UNAVAILABLE'); }
  const configuredTarget = String(stack?.target || '');
  if (!path.isAbsolute(configuredTarget)) fail('RESTORE_LOCAL_CONFIG_INVALID');
  const target = path.resolve(configuredTarget);
  if (!/^[a-z0-9][a-z0-9-]{2,90}$/.test(stack?.project || '')
    || path.basename(target) !== stack.project || isWithin(target, root)) {
    fail('RESTORE_LOCAL_CONFIG_INVALID');
  }
  return { project: stack.project, target, privateRoot: path.dirname(target) };
}
const expectedOwnerRoles = Object.freeze([
  'lifequest_schema_owner',
  'lifequest_command_owner',
  'lifequest_read_owner',
  'lifequest_provision_owner',
]);
const migrationHistoryPolicies = Object.freeze({
  ADMIN_DATABASE_EXACT: 'admin-database-exact',
  FRESH_DESTINATION: 'fresh-destination',
});
const trustedPlatformOwnerRoles = new Set([
  'postgres', 'supabase_admin', 'supabase_auth_admin', 'supabase_storage_admin',
  'supabase_functions_admin', 'supabase_read_only_user', 'supabase_etl_admin',
  'supabase_replication_admin', 'supabase_privileged_role', 'authenticator', 'anon', 'authenticated',
  'service_role', 'dashboard_user', 'pgbouncer', 'pg_database_owner',
  'pg_create_subscription', 'pg_monitor', 'pg_read_all_data', 'pg_signal_backend',
]);
const platformOwnerProfiles = Object.freeze({
  postgres: [true, false, true, true, true, true],
  supabase_admin: [true, true, true, true, true, true],
  supabase_auth_admin: [true, false, false, true, false, false],
  supabase_storage_admin: [true, false, false, true, false, false],
  // Supabase PostgreSQL 17.11's official pg_net setup creates this role only
  // when pg_net is enabled: CREATE USER ... NOINHERIT CREATEROLE LOGIN NOREPLICATION.
  supabase_functions_admin: [true, false, false, true, false, false],
  supabase_read_only_user: [true, false, false, false, false, true],
  supabase_etl_admin: [true, false, false, false, true, true],
  supabase_replication_admin: [true, false, false, false, true, false],
  supabase_privileged_role: [false, false, false, false, false, false],
  authenticator: [true, false, false, false, false, false],
  anon: [false, false, false, false, false, false],
  authenticated: [false, false, false, false, false, false],
  service_role: [false, false, false, false, false, true],
  dashboard_user: [false, false, true, true, true, false],
  pgbouncer: [true, false, false, false, false, false],
  pg_database_owner: [false, false, false, false, false, false],
  pg_create_subscription: [false, false, false, false, false, false],
  pg_monitor: [false, false, false, false, false, false],
  pg_read_all_data: [false, false, false, false, false, false],
  pg_signal_backend: [false, false, false, false, false, false],
});
const membershipRecord = (name, grantor, inherit, set, admin) => `${name}|${grantor}|${inherit}|${set}|${admin}`;
const noMemberships = Object.freeze({ memberOf: [], grantedTo: [] });
const platformRoleMembershipProfiles = Object.freeze({
  anon: { memberOf: [], grantedTo: [
    membershipRecord('authenticator', 'supabase_admin', false, true, false),
    membershipRecord('postgres', 'supabase_admin', true, true, true),
  ] },
  authenticated: { memberOf: [], grantedTo: [
    membershipRecord('authenticator', 'supabase_admin', false, true, false),
    membershipRecord('postgres', 'supabase_admin', true, true, true),
  ] },
  authenticator: { memberOf: [
    membershipRecord('anon', 'supabase_admin', false, true, false),
    membershipRecord('authenticated', 'supabase_admin', false, true, false),
    membershipRecord('service_role', 'supabase_admin', false, true, false),
  ], grantedTo: [
    membershipRecord('postgres', 'supabase_admin', true, true, true),
    membershipRecord('supabase_storage_admin', 'supabase_admin', false, true, false),
  ] },
  service_role: { memberOf: [], grantedTo: [
    membershipRecord('authenticator', 'supabase_admin', false, true, false),
    membershipRecord('postgres', 'supabase_admin', true, true, true),
  ] },
  dashboard_user: noMemberships,
  pgbouncer: noMemberships,
  supabase_admin: noMemberships,
  supabase_auth_admin: noMemberships,
  supabase_functions_admin: noMemberships,
  supabase_etl_admin: { memberOf: [
    membershipRecord('pg_monitor', 'supabase_admin', true, true, false),
    membershipRecord('pg_read_all_data', 'supabase_admin', true, true, false),
    membershipRecord('supabase_privileged_role', 'supabase_admin', true, true, false),
  ], grantedTo: [] },
  supabase_replication_admin: noMemberships,
  supabase_privileged_role: { memberOf: [], grantedTo: [
    membershipRecord('postgres', 'supabase_admin', true, true, false),
    membershipRecord('supabase_etl_admin', 'supabase_admin', true, true, false),
  ] },
  supabase_storage_admin: { memberOf: [membershipRecord('authenticator', 'supabase_admin', false, true, false)], grantedTo: [] },
  supabase_read_only_user: { memberOf: [
    membershipRecord('pg_monitor', 'supabase_admin', true, true, false),
    membershipRecord('pg_read_all_data', 'supabase_admin', true, true, false),
  ], grantedTo: [] },
  pg_database_owner: noMemberships,
  pg_create_subscription: { memberOf: [], grantedTo: [membershipRecord('postgres', 'supabase_admin', true, true, true)] },
  pg_monitor: { memberOf: [
    membershipRecord('pg_read_all_settings', 'supabase_admin', true, true, false),
    membershipRecord('pg_read_all_stats', 'supabase_admin', true, true, false),
    membershipRecord('pg_stat_scan_tables', 'supabase_admin', true, true, false),
  ], grantedTo: [
    membershipRecord('postgres', 'supabase_admin', true, true, true),
    membershipRecord('supabase_etl_admin', 'supabase_admin', true, true, false),
    membershipRecord('supabase_read_only_user', 'supabase_admin', true, true, false),
  ] },
  pg_read_all_data: { memberOf: [], grantedTo: [
    membershipRecord('postgres', 'supabase_admin', true, true, true),
    membershipRecord('supabase_etl_admin', 'supabase_admin', true, true, false),
    membershipRecord('supabase_read_only_user', 'supabase_admin', true, true, false),
  ] },
  pg_signal_backend: { memberOf: [], grantedTo: [membershipRecord('postgres', 'supabase_admin', true, true, true)] },
  postgres: { memberOf: [
    membershipRecord('anon', 'supabase_admin', true, true, true),
    membershipRecord('authenticated', 'supabase_admin', true, true, true),
    membershipRecord('authenticator', 'supabase_admin', true, true, true),
    membershipRecord('lifequest_auth2_command_owner', 'postgres', false, false, false),
    membershipRecord('lifequest_auth2_command_owner', 'supabase_admin', false, false, true),
    membershipRecord('lifequest_auth2_server', 'supabase_admin', false, false, true),
    membershipRecord('lifequest_command_owner', 'postgres', false, false, false),
    membershipRecord('lifequest_command_owner', 'supabase_admin', false, false, true),
    membershipRecord('lifequest_provision_owner', 'postgres', false, false, false),
    membershipRecord('lifequest_provision_owner', 'supabase_admin', false, false, true),
    membershipRecord('lifequest_read_owner', 'postgres', false, false, false),
    membershipRecord('lifequest_read_owner', 'supabase_admin', false, false, true),
    membershipRecord('lifequest_schema_owner', 'postgres', false, false, false),
    membershipRecord('lifequest_schema_owner', 'supabase_admin', false, false, true),
    membershipRecord('pg_create_subscription', 'supabase_admin', true, true, true),
    membershipRecord('pg_monitor', 'supabase_admin', true, true, true),
    membershipRecord('pg_read_all_data', 'supabase_admin', true, true, true),
    membershipRecord('pg_signal_backend', 'supabase_admin', true, true, true),
    membershipRecord('service_role', 'supabase_admin', true, true, true),
    membershipRecord('supabase_privileged_role', 'supabase_admin', true, true, false),
  ], grantedTo: [] },
});
const customRoleMembershipProfiles = Object.freeze({
  lifequest_auth2_command_owner: { memberOf: [], grantedTo: [
    membershipRecord('postgres', 'postgres', false, false, false),
    membershipRecord('postgres', 'supabase_admin', false, false, true),
  ] },
  lifequest_auth2_server: { memberOf: [], grantedTo: [membershipRecord('postgres', 'supabase_admin', false, false, true)] },
  lifequest_schema_owner: { memberOf: [], grantedTo: [
    membershipRecord('postgres', 'postgres', false, false, false),
    membershipRecord('postgres', 'supabase_admin', false, false, true),
  ] },
  lifequest_command_owner: { memberOf: [], grantedTo: [
    membershipRecord('postgres', 'postgres', false, false, false),
    membershipRecord('postgres', 'supabase_admin', false, false, true),
  ] },
  lifequest_read_owner: { memberOf: [], grantedTo: [
    membershipRecord('postgres', 'postgres', false, false, false),
    membershipRecord('postgres', 'supabase_admin', false, false, true),
  ] },
  lifequest_provision_owner: { memberOf: [], grantedTo: [
    membershipRecord('postgres', 'postgres', false, false, false),
    membershipRecord('postgres', 'supabase_admin', false, false, true),
  ] },
});
const cli = path.join(root, 'tools/auth2/node_modules/supabase/dist/supabase.js');
function fail(code) { throw Object.assign(new Error(code), { code }); }
function isWithin(candidate, parent) {
  const rel = path.relative(path.resolve(parent), path.resolve(candidate));
  return rel === '' || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${path.sep}`));
}
function assertRegularFile(file) {
  if (!path.isAbsolute(file) || !fs.existsSync(file)) fail('BACKUP_FILE_MISSING');
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) fail('BACKUP_FILE_UNSAFE');
}
async function hashFile(file) {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of fs.createReadStream(file)) { bytes += chunk.length; hash.update(chunk); }
  return { bytes, sha256: hash.digest('hex') };
}
function runPgRestore(command, args, {
  archivePath,
  streamArchive = false,
  captureStdout = false,
  scanSqlRoles = false,
  timeoutMs = 15 * 60 * 1000,
  failureCode = 'PG_RESTORE_ARCHIVE_INVALID',
} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: [streamArchive ? 'pipe' : 'ignore', captureStdout || scanSqlRoles ? 'pipe' : 'ignore', 'pipe'], windowsHide: true });
    let stderr = '';
    let stdout = '';
    let stdoutTooLarge = false;
    let scannerError;
    const roleScanner = scanSqlRoles ? new SqlRoleDependencyScanner() : null;
    if (captureStdout && child.stdout) child.stdout.on('data', chunk => {
      if (stdout.length + chunk.length > 16 * 1024 * 1024) {
        stdoutTooLarge = true;
        try { child.kill(); } catch {}
      } else stdout += chunk.toString('utf8');
    });
    if (roleScanner && child.stdout) child.stdout.on('data', chunk => {
      try { roleScanner.write(chunk); }
      catch (error) { scannerError = error; try { child.kill(); } catch {} }
    });
    if (child.stderr) child.stderr.on('data', chunk => {
      // Retain only a small diagnostic sample in memory so we can distinguish
      // corrupt archives from tool/runtime failures without exposing paths or
      // PostgreSQL diagnostics to the user or logs.
      if (stderr.length < 16 * 1024) stderr += chunk.toString('utf8').slice(0, 16 * 1024 - stderr.length);
    });
    let spawnError = false, timedOut = false, streamError = false;
    child.once('error', () => { spawnError = true; });
    const closed = new Promise(done => child.once('close', (code, signal) => done({ code, signal })));
    const timer = setTimeout(() => { timedOut = true; try { child.kill(); } catch {} }, timeoutMs);
    timer.unref?.();
    (async () => {
      try {
        if (streamArchive) {
          if (!archivePath || !child.stdin) fail('RESTORE_ARCHIVE_STREAM_UNAVAILABLE');
          try { await pipeline(fs.createReadStream(archivePath), child.stdin); }
          catch {
            streamError = true;
            try { child.kill(); } catch {}
          }
        }
        const result = await closed;
        if (timedOut) fail('PG_RESTORE_VALIDATION_TIMEOUT');
        if (spawnError) fail('PG_RESTORE_SPAWN_FAILED');
        if (streamError) fail('RESTORE_ARCHIVE_STREAM_FAILED');
        if (stdoutTooLarge) fail('PG_RESTORE_LIST_TOO_LARGE');
        if (scannerError) throw scannerError;
        if (result.signal || result.code !== 0) {
          if (failureCode === 'PG_RESTORE_ARCHIVE_INVALID') {
            const diagnostic = stderr.toLowerCase();
            const archiveDamage = /not a valid archive|did not find magic string|could not find header for|unexpected end of file|could not read from input file|could not read from archive|invalid archive|invalid compressed data|could not decompress|could not uncompress data|incorrect data check/i.test(diagnostic);
            const code = archiveDamage ? 'PG_RESTORE_ARCHIVE_INVALID' : 'PG_RESTORE_VALIDATION_FAILED';
            reject(Object.assign(new Error(code), { code, diagnostic: stderr }));
            return;
          }
          fail(failureCode);
        }
        resolve({ stdout, sqlRoleDependencies: roleScanner?.end() });
      } catch (error) {
        try { child.kill(); } catch {}
        await closed;
        reject(error?.code ? error : Object.assign(new Error('RESTORE_PROCESS_FAILED'), { code: 'RESTORE_PROCESS_FAILED' }));
      } finally { clearTimeout(timer); }
    })();
  });
}

const ownerBearingTocTypes = Object.freeze([
  'SCHEMA', 'TABLE', 'TABLE DATA', 'VIEW', 'MATERIALIZED VIEW', 'FOREIGN TABLE',
  'SEQUENCE', 'SEQUENCE SET', 'FUNCTION', 'PROCEDURE', 'AGGREGATE', 'TYPE', 'DOMAIN',
  'COLLATION', 'CONVERSION', 'OPERATOR', 'OPERATOR CLASS', 'OPERATOR FAMILY',
  'TEXT SEARCH CONFIGURATION', 'TEXT SEARCH DICTIONARY', 'TEXT SEARCH PARSER',
  'TEXT SEARCH TEMPLATE', 'TRANSFORM', 'STATISTICS', 'EXTENSION', 'INDEX',
  'CONSTRAINT', 'FK CONSTRAINT', 'CHECK CONSTRAINT', 'TRIGGER', 'RULE', 'POLICY', 'ACL',
  'EVENT TRIGGER', 'PUBLICATION', 'PUBLICATION TABLE', 'DEFAULT ACL', 'LANGUAGE',
  'CAST', 'ACCESS METHOD', 'FOREIGN DATA WRAPPER', 'SERVER', 'USER MAPPING',
]);

function parseArchiveRequirements(tocListing, sql = {}) {
  if (typeof tocListing !== 'string' || !tocListing.includes('Dumped from database version')) fail('RESTORE_ARCHIVE_TOC_INVALID');
  const owners = new Set();
  const tocAclGrantors = new Set();
  const tocDefaultPrivilegeRoles = new Set();
  const extensions = new Set();
  for (const line of tocListing.split(/\r?\n/)) {
    const match = /^\s*\d+;\s+\d+\s+\d+\s+(.+?)\s*$/.exec(line);
    if (!match) continue;
    const fields = match[1].trim().split(/\s+/);
    const type = ownerBearingTocTypes.find(candidate => fields.join(' ').startsWith(`${candidate} `));
    if (!type) continue;
    if (type === 'EXTENSION') {
      const extensionIndex = fields.indexOf('-');
      const name = fields[extensionIndex + 1];
      if (!name || !/^[A-Za-z_][A-Za-z0-9_$-]*$/.test(name)) fail('RESTORE_ARCHIVE_TOC_UNSUPPORTED');
      extensions.add(name);
      // PostgreSQL's TOC omits an owner field for some extensions (for example
      // uuid-ossp). When present, the final token is the owner and must still
      // be checked before the target database is created.
      if (fields.length > extensionIndex + 2) {
        const owner = fields.at(-1);
        if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(owner)) fail('RESTORE_ARCHIVE_TOC_UNSUPPORTED');
        owners.add(owner);
      }
      continue;
    }
    const owner = fields.at(-1);
    if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(owner)) fail('RESTORE_ARCHIVE_TOC_UNSUPPORTED');
    if (type === 'ACL') tocAclGrantors.add(owner);
    else if (type === 'DEFAULT ACL') {
      tocAclGrantors.add(owner);
      tocDefaultPrivilegeRoles.add(owner);
    } else owners.add(owner);
  }
  const objectOwners = new Set([...(sql.objectOwners || []), ...owners]);
  const aclGrantees = new Set(sql.aclGrantees || []);
  const aclGrantors = new Set([...(sql.aclGrantors || []), ...tocAclGrantors, ...tocDefaultPrivilegeRoles]);
  const membershipRoles = new Set(sql.membershipRoles || []);
  const defaultPrivilegeRoles = new Set([...(sql.defaultPrivilegeRoles || []), ...tocDefaultPrivilegeRoles]);
  const requiredApplicationRoles = new Set(expectedOwnerRoles);
  const roleDependencies = new Set([...objectOwners, ...aclGrantees, ...aclGrantors, ...membershipRoles, ...defaultPrivilegeRoles, ...requiredApplicationRoles]);
  return {
    ownerRoles: [...objectOwners].sort(),
    aclGrantees: [...aclGrantees].sort(),
    aclGrantors: [...aclGrantors].sort(),
    membershipRoles: [...membershipRoles].sort(),
    defaultPrivilegeRoles: [...defaultPrivilegeRoles].sort(),
    requiredApplicationRoles: [...requiredApplicationRoles].sort(),
    roleDependencies: [...roleDependencies].sort(),
    extensions: [...extensions].sort(),
  };
}

function buildRestoreStdinArgs({ host = '127.0.0.1', port = 5432, user = 'supabase_admin', databaseName }) {
  if (!databaseName || !/^127\.0\.0\.1$/.test(host) || !/^\d+$/.test(String(port))) fail('RESTORE_ENDPOINT_INVALID');
  return ['-h', host, '-p', String(port), '-U', user, '-d', databaseName, '--single-transaction', '--exit-on-error'];
}

function roleMembershipSignatures(rows) {
  if (!Array.isArray(rows)) fail('RESTORE_OWNER_ROLE_PRIVILEGES_INVALID');
  return rows.map(row => {
    if (typeof row?.name !== 'string' || typeof row?.grantor !== 'string'
      || typeof row.inherit !== 'boolean' || typeof row.set !== 'boolean' || typeof row.admin !== 'boolean') {
      fail('RESTORE_OWNER_ROLE_PRIVILEGES_INVALID');
    }
    return membershipRecord(row.name, row.grantor, row.inherit, row.set, row.admin);
  }).sort();
}

function assertRoleAffiliations(row, profile) {
  if (!profile || !Array.isArray(row.member_of_roles) || !Array.isArray(row.granted_to_roles)) {
    fail('RESTORE_OWNER_ROLE_PRIVILEGES_INVALID');
  }
  const actualMemberOf = roleMembershipSignatures(row.member_of_roles);
  const actualGrantedTo = roleMembershipSignatures(row.granted_to_roles);
  const expectedMemberOf = [...profile.memberOf].sort();
  const expectedGrantedTo = [...profile.grantedTo].sort();
  if (new Set(actualMemberOf).size !== actualMemberOf.length
    || new Set(actualGrantedTo).size !== actualGrantedTo.length
    || actualMemberOf.join('\n') !== expectedMemberOf.join('\n')
    || actualGrantedTo.join('\n') !== expectedGrantedTo.join('\n')) {
    fail('RESTORE_OWNER_ROLE_PRIVILEGES_INVALID');
  }
}

function assertOwnerRoleRows(rows, requiredRoles = expectedOwnerRoles) {
  const required = [...new Set(requiredRoles)];
  if (!Array.isArray(rows) || rows.length !== required.length
    || required.some(name => !rows.some(row => row.rolname === name))) fail('RESTORE_REQUIRED_ROLE_MISSING');
  for (const row of rows) {
    const lifeQuestOwner = /^(?:lifequest_|auth2_).*(?:_owner|_server|_command)$/.test(row.rolname);
    if (lifeQuestOwner) {
      if (row.rolcanlogin || row.rolsuper || row.rolcreatedb || row.rolcreaterole || row.rolreplication
        || row.rolbypassrls || row.has_role_memberships || row.has_unexpected_memberships) fail('RESTORE_OWNER_ROLE_PRIVILEGES_INVALID');
      assertRoleAffiliations(row, customRoleMembershipProfiles[row.rolname]);
      continue;
    }
    if (!trustedPlatformOwnerRoles.has(row.rolname)) fail('RESTORE_OWNER_ROLE_UNTRUSTED');
    const profile = platformOwnerProfiles[row.rolname];
    const actual = [row.rolcanlogin, row.rolsuper, row.rolcreatedb, row.rolcreaterole, row.rolreplication, row.rolbypassrls];
    if (!profile || actual.some((value, index) => value !== profile[index])) fail('RESTORE_OWNER_ROLE_PRIVILEGES_INVALID');
    assertRoleAffiliations(row, platformRoleMembershipProfiles[row.rolname]);
  }
  return true;
}

function buildContainerRestoreStdinArgs({ user = 'supabase_admin', databaseName }) {
  if (!databaseName || !/^lifequest_restore_[a-z0-9_]{1,40}$/.test(databaseName)) fail('RESTORE_DATABASE_NAME_INVALID');
  return ['--host=/var/run/postgresql', '--port=5432', '--username', user, '--dbname', databaseName, '--single-transaction', '--exit-on-error'];
}

async function verifyArchive({ archivePath, manifestPath, expectedProject, pgRestoreCommand, pgRestorePrefixArgs = [], streamArchive = false }) {
  assertRegularFile(archivePath);
  assertRegularFile(manifestPath);
  const archiveDir = path.dirname(path.resolve(archivePath));
  if (path.dirname(path.resolve(manifestPath)) !== archiveDir || path.resolve(manifestPath) !== `${path.resolve(archivePath)}.json`) fail('BACKUP_MANIFEST_PATH_MISMATCH');
  const dirStat = fs.lstatSync(archiveDir);
  if (!dirStat.isDirectory() || dirStat.isSymbolicLink()) fail('BACKUP_DIRECTORY_UNSAFE');
  verifyPrivateAcl(archiveDir);
  verifyPrivateAcl(archivePath);
  verifyPrivateAcl(manifestPath);
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { fail('BACKUP_MANIFEST_INVALID'); }
  if (manifest.schema !== 'lifequest-plain-postgres-backup-v1' || manifest.version !== 1
    || manifest.project !== expectedProject || manifest.format !== 'pg_dump-custom'
    || manifest.database !== 'postgres' || manifest.filename !== path.basename(archivePath)
    || !Number.isSafeInteger(manifest.bytes) || manifest.bytes < 1024
    || !/^[a-f0-9]{64}$/.test(manifest.sha256 || '')
    || !Array.isArray(manifest.migrationVersions)
    || manifest.migrationVersions.some(v => !/^\d{14}$/.test(v))) fail('BACKUP_MANIFEST_INVALID');
  const measured = await hashFile(archivePath);
  if (measured.bytes !== manifest.bytes || measured.sha256 !== manifest.sha256) fail('BACKUP_CHECKSUM_MISMATCH');
  const prefix = Buffer.alloc(5);
  const fd = fs.openSync(archivePath, 'r');
  try { if (fs.readSync(fd, prefix, 0, 5, 0) !== 5 || prefix.toString('ascii') !== 'PGDMP') fail('PG_RESTORE_ARCHIVE_FORMAT_INVALID'); }
  finally { fs.closeSync(fd); }
  const baseArgs = [...pgRestorePrefixArgs];
  if (streamArchive) {
    const commandPrefix = path.basename(String(pgRestoreCommand)).replace(/\.exe$/i, '').toLowerCase() === 'docker'
      ? [...baseArgs, 'pg_restore']
      : baseArgs;
    // With no archive filename pg_restore reads stdin; a literal "-" is treated
    // as a filename by PostgreSQL 17 and fails before parsing the archive.
    const listing = await runPgRestore(pgRestoreCommand, [...commandPrefix, '--list'], {
      archivePath, streamArchive: true, failureCode: 'PG_RESTORE_ARCHIVE_INVALID',
      captureStdout: true,
    });
    const sql = await runPgRestore(pgRestoreCommand, [...commandPrefix, '--exit-on-error', '--file=-'], {
      archivePath, streamArchive: true, failureCode: 'PG_RESTORE_ARCHIVE_INVALID',
      scanSqlRoles: true,
    });
    return { archivePath: path.resolve(archivePath), manifest, measured, requirements: parseArchiveRequirements(listing.stdout, sql.sqlRoleDependencies) };
  } else {
    const listing = await runPgRestore(pgRestoreCommand, ['--list', archivePath], { failureCode: 'PG_RESTORE_ARCHIVE_INVALID', captureStdout: true });
    // Extract the complete custom archive to stdout and discard it. This checks
    // payload blocks before a database is created, without writing SQL to disk.
    const sql = await runPgRestore(pgRestoreCommand, ['--exit-on-error', '--file=-', archivePath], {
      failureCode: 'PG_RESTORE_ARCHIVE_INVALID', scanSqlRoles: true,
    });
    return { archivePath: path.resolve(archivePath), manifest, measured, requirements: parseArchiveRequirements(listing.stdout, sql.sqlRoleDependencies) };
  }
}

function assertIndependentTarget({ targetWorkdir, targetProjectId, allowSyntheticTempTarget = false }) {
  const local = personalStackConfig();
  const target = path.resolve(targetWorkdir);
  const tempTarget = allowSyntheticTempTarget && isWithin(target, os.tmpdir());
  if (!/^lifequest-restore-verify-[a-z0-9-]+$/.test(targetProjectId || '')
    || targetProjectId === local.project || path.basename(target) !== targetProjectId
    || (!tempTarget && (path.dirname(target).toLowerCase() !== path.resolve(local.privateRoot).toLowerCase()
      || !isWithin(target, local.privateRoot) || isWithin(target, root)))) fail('RESTORE_TARGET_NOT_INDEPENDENT');
  const configPath = path.join(target, 'supabase/config.toml');
  const migrationsPath = path.join(target, 'supabase/migrations');
  const manifestPath = path.join(target, 'lifequest-migration-manifest.json');
  if (!fs.existsSync(configPath) || !fs.existsSync(manifestPath) || fs.existsSync(path.join(target, 'supabase/.temp/project-ref'))) fail('RESTORE_TARGET_NOT_PREPARED');
  const config = fs.readFileSync(configPath, 'utf8');
  if (!config.includes(`project_id = "${targetProjectId}"`) || !config.includes('schemas = ["public"]')) fail('RESTORE_TARGET_CONFIG_MISMATCH');
  const migrationManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const names = fs.readdirSync(migrationsPath).filter(name => name.endsWith('.sql')).sort();
  if (!Array.isArray(migrationManifest) || names.length !== migrationManifest.length || !names.length) fail('RESTORE_TARGET_MIGRATION_MANIFEST_INVALID');
  const versions = [];
  for (let i = 0; i < names.length; i++) {
    const entry = migrationManifest[i];
    const bytes = fs.readFileSync(path.join(migrationsPath, names[i]));
    if (entry.name !== names[i] || entry.sha256 !== createHash('sha256').update(bytes).digest('hex')) fail('RESTORE_TARGET_MIGRATION_SOURCE_DRIFT');
    versions.push(names[i].slice(0, 14));
  }
  return { target, config, versions };
}

async function restoreToFreshDatabase({
  archivePath, manifestPath, expectedSourceProject, targetProjectId, targetWorkdir,
  databaseName, pgRestoreCommand, pgRestorePrefixArgs = [], streamArchive = false, targetAdapter,
  allowSyntheticTempTarget = false,
}) {
  if (!/^lifequest_restore_[a-z0-9_]{1,40}$/.test(databaseName || '')
    || ['lifequest_restore_postgres', 'lifequest_restore_template0', 'lifequest_restore_template1'].includes(databaseName)) fail('RESTORE_DATABASE_NAME_INVALID');
  if (!targetAdapter || typeof targetAdapter.verifyExpectedOwnerRoles !== 'function'
    || typeof targetAdapter.databaseExists !== 'function'
    || typeof targetAdapter.createDatabase !== 'function' || typeof targetAdapter.restoreDatabase !== 'function'
    || typeof targetAdapter.verifyRestoredDatabase !== 'function') fail('RESTORE_TARGET_ADAPTER_REQUIRED');
  validateMigrationHistoryPolicy(targetAdapter);
  const target = assertIndependentTarget({ targetWorkdir, targetProjectId, allowSyntheticTempTarget });
  if (typeof targetAdapter.verifyTargetIdentity === 'function') await targetAdapter.verifyTargetIdentity();
  const verified = await verifyArchive({ archivePath, manifestPath, expectedProject: expectedSourceProject, pgRestoreCommand, pgRestorePrefixArgs, streamArchive });
  assertArchiveMatchesTarget({ targetVersions: target.versions, archiveManifest: verified.manifest, targetProjectId });
  await targetAdapter.verifyExpectedOwnerRoles(verified.requirements.roleDependencies);
  if (typeof targetAdapter.verifyAvailableExtensions === 'function') {
    await targetAdapter.verifyAvailableExtensions(verified.requirements.extensions);
  }
  await verifyMigrationHistoryPrecondition(targetAdapter, verified.manifest.migrationVersions);
  if (await targetAdapter.databaseExists(databaseName)) fail('RESTORE_DATABASE_ALREADY_EXISTS');
  try { await targetAdapter.createDatabase(databaseName); }
  catch (error) { fail(error?.code === '42P04' ? 'RESTORE_DATABASE_ALREADY_EXISTS' : 'RESTORE_DATABASE_CREATE_FAILED'); }
  try {
    await targetAdapter.restoreDatabase({ databaseName, archivePath, pgRestoreCommand, pgRestorePrefixArgs, streamArchive });
  } catch (error) {
    // Do not drop the new database automatically. It is newly created, and no
    // pre-existing database is altered; report the exact safe recovery action.
    const errors = {
      PG_RESTORE_EXEC_FAILED: 'PG_RESTORE_EXEC_FAILED_NEW_DATABASE_REMAINS',
      PG_RESTORE_SPAWN_FAILED: 'PG_RESTORE_SPAWN_FAILED_NEW_DATABASE_REMAINS',
      PG_RESTORE_VALIDATION_TIMEOUT: 'PG_RESTORE_TIMEOUT_NEW_DATABASE_REMAINS',
      RESTORE_ARCHIVE_STREAM_FAILED: 'RESTORE_ARCHIVE_STREAM_FAILED_NEW_DATABASE_REMAINS',
    };
    fail(errors[error?.code] || 'RESTORE_DATABASE_OPERATION_FAILED_NEW_DATABASE_REMAINS');
  }
  try { await targetAdapter.verifyRestoredDatabase({ databaseName, migrationVersions: verified.manifest.migrationVersions, requirements: verified.requirements }); }
  catch { fail('RESTORE_POSTCHECK_FAILED_NEW_DATABASE_REMAINS'); }
  return { databaseName, bytes: verified.measured.bytes, sha256: verified.measured.sha256 };
}

function validateMigrationHistoryPolicy(targetAdapter, policy = targetAdapter?.migrationHistoryPolicy) {
  if (policy === migrationHistoryPolicies.ADMIN_DATABASE_EXACT) {
    if (typeof targetAdapter?.verifyAppliedMigrations !== 'function') fail('RESTORE_TARGET_ADAPTER_REQUIRED');
  } else if (policy === migrationHistoryPolicies.FRESH_DESTINATION) {
    // The archive manifest and pinned migration files are compared before
    // creating the destination; its restored history is checked afterwards.
    // Require host-side Docker/PostgreSQL identity verification first.
    if (typeof targetAdapter?.verifyTargetIdentity !== 'function') fail('RESTORE_FRESH_TARGET_IDENTITY_REQUIRED');
  } else fail('RESTORE_MIGRATION_HISTORY_POLICY_INVALID');
  return policy;
}

async function verifyMigrationHistoryPrecondition(targetAdapter, expectedVersions) {
  const policy = validateMigrationHistoryPolicy(targetAdapter);
  if (policy === migrationHistoryPolicies.ADMIN_DATABASE_EXACT) {
    await targetAdapter.verifyAppliedMigrations(expectedVersions);
  }
  return policy;
}

function assertArchiveMatchesTarget({ targetVersions, archiveManifest, targetProjectId }) {
  if (!Array.isArray(targetVersions) || !Array.isArray(archiveManifest?.migrationVersions)
    || archiveManifest.project === targetProjectId
    || targetVersions.join(',') !== archiveManifest.migrationVersions.join(',')) {
    fail('RESTORE_MIGRATION_OR_PROJECT_MISMATCH');
  }
  return true;
}

function readCliStatus(workdir) {
  try {
    const value = execFileSync(process.execPath, [cli, 'status', '--output', 'json', '--workdir', workdir], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, timeout: 30000, maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1' },
    });
    return JSON.parse(value);
  } catch { fail('RESTORE_TARGET_STACK_NOT_RUNNING'); }
}
function parseDatabasePort(config) {
  const section = /^\[db\]([\s\S]*?)(?=^\[|$)/m.exec(config)?.[1] || '';
  const value = /^port\s*=\s*(\d+)\s*$/m.exec(section)?.[1];
  if (!value) fail('RESTORE_TARGET_PORT_INVALID');
  return value;
}
function exactDatabaseContainer(projectId) {
  let names;
  try {
    names = execFileSync('docker', ['ps', '--filter', `name=supabase_db_${projectId}`, '--format', '{{.Names}}'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, timeout: 15000,
    }).trim().split(/\r?\n/).filter(Boolean);
  } catch { fail('RESTORE_TARGET_CONTAINER_UNAVAILABLE'); }
  if (names.length !== 1 || names[0] !== `supabase_db_${projectId}`) fail('RESTORE_TARGET_CONTAINER_AMBIGUOUS');
  return names[0];
}

function createSupabaseTargetAdapter({ admin, targetStatus, container, Client }) {
  if (!admin || !targetStatus?.DB_URL || typeof container !== 'string' || !Client) fail('RESTORE_TARGET_ADAPTER_REQUIRED');
  return {
    migrationHistoryPolicy: migrationHistoryPolicies.ADMIN_DATABASE_EXACT,
    async verifyExpectedOwnerRoles(requiredRoles = expectedOwnerRoles) {
      const rows = (await admin.query(`
        select r.rolname::text, r.rolcanlogin, r.rolsuper, r.rolcreatedb, r.rolcreaterole,
          r.rolreplication, r.rolbypassrls,
          exists(select 1 from pg_auth_members m where m.member = r.oid) as has_role_memberships,
          exists(select 1 from pg_auth_members m where m.roleid = r.oid
            and (pg_get_userbyid(m.member) <> 'postgres' or m.inherit_option or m.set_option)) as has_unexpected_memberships,
          coalesce((select json_agg(json_build_object('name', pg_get_userbyid(m.roleid), 'grantor', pg_get_userbyid(m.grantor), 'inherit', m.inherit_option, 'set', m.set_option, 'admin', m.admin_option)
            order by pg_get_userbyid(m.roleid)) from pg_auth_members m where m.member = r.oid), '[]'::json) as member_of_roles,
          coalesce((select json_agg(json_build_object('name', pg_get_userbyid(m.member), 'grantor', pg_get_userbyid(m.grantor), 'inherit', m.inherit_option, 'set', m.set_option, 'admin', m.admin_option)
            order by pg_get_userbyid(m.member)) from pg_auth_members m where m.roleid = r.oid), '[]'::json) as granted_to_roles
        from pg_roles r where r.rolname::text = any($1::text[])
      `, [requiredRoles])).rows;
      assertOwnerRoleRows(rows, requiredRoles);
    },
    async verifyAvailableExtensions(requiredExtensions) {
      if (!requiredExtensions.length) return;
      const rows = (await admin.query('select name from pg_available_extensions where name = any($1::text[])', [requiredExtensions])).rows;
      if (rows.length !== requiredExtensions.length) fail('RESTORE_REQUIRED_EXTENSION_MISSING');
    },
    async verifyAppliedMigrations(expected) {
      const rows = (await admin.query('select version from supabase_migrations.schema_migrations order by version')).rows.map(row => row.version);
      if (rows.join(',') !== expected.join(',')) fail('RESTORE_TARGET_APPLIED_MIGRATIONS_MISMATCH');
    },
    async databaseExists(name) {
      return (await admin.query('select 1 from pg_database where datname = $1', [name])).rowCount !== 0;
    },
    async createDatabase(name) { await admin.query(`CREATE DATABASE "${name}"`); },
    async restoreDatabase({ databaseName, archivePath, streamArchive }) {
      if (streamArchive !== true) fail('RESTORE_ARCHIVE_STREAM_REQUIRED');
      const args = ['exec', '-i', container, 'pg_restore', ...buildRestoreStdinArgs({ databaseName })];
      await runPgRestore('docker', args, {
        archivePath,
        streamArchive: true,
        failureCode: 'PG_RESTORE_EXEC_FAILED',
      });
    },
    async verifyRestoredDatabase({ databaseName, migrationVersions }) {
      const url = new URL(targetStatus.DB_URL);
      url.pathname = `/${databaseName}`;
      const client = new Client({ connectionString: url.href });
      await client.connect();
      try {
        const rows = (await client.query('select version from supabase_migrations.schema_migrations order by version')).rows.map(row => row.version);
        if (rows.join(',') !== migrationVersions.join(',')) fail('RESTORE_MIGRATION_POSTCHECK_FAILED');
        const checks = (await client.query(`
          with client_roles(role_name) as (values ('anon'::text), ('authenticated'::text)),
          lifequest_tables as (
            select c.oid, c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner) as owner
            from pg_class c join pg_namespace n on n.oid=c.relnamespace
            where n.nspname='lifequest' and c.relkind in ('r','p')
          )
          select
            exists(select 1 from lifequest_tables) as tables_present,
            (select count(*) from lifequest_tables)::int as table_count,
            (select count(*) from lifequest_tables where relrowsecurity and relforcerowsecurity)::int as forced_rls_count,
            (select count(*) from lifequest_tables where owner <> 'lifequest_schema_owner')::int as wrong_owner_count,
            (select pg_get_userbyid(nspowner) from pg_namespace where nspname='lifequest') as schema_owner,
            (select count(*) from client_roles r where
              has_schema_privilege(r.role_name, 'lifequest', 'USAGE')
              or has_schema_privilege(r.role_name, 'lifequest', 'CREATE'))::int as client_schema_privileges,
            (select count(*) from lifequest_tables t cross join client_roles r where
              has_table_privilege(r.role_name, t.oid, 'SELECT')
              or has_table_privilege(r.role_name, t.oid, 'INSERT')
              or has_table_privilege(r.role_name, t.oid, 'UPDATE')
              or has_table_privilege(r.role_name, t.oid, 'DELETE')
              or has_table_privilege(r.role_name, t.oid, 'TRUNCATE')
              or has_table_privilege(r.role_name, t.oid, 'REFERENCES')
              or has_table_privilege(r.role_name, t.oid, 'TRIGGER')
              or has_any_column_privilege(r.role_name, t.oid, 'SELECT')
              or has_any_column_privilege(r.role_name, t.oid, 'INSERT')
              or has_any_column_privilege(r.role_name, t.oid, 'UPDATE')
              or has_any_column_privilege(r.role_name, t.oid, 'REFERENCES'))::int as client_table_privileges,
            (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join client_roles r
              where n.nspname='lifequest' and c.relkind='S' and
                (has_sequence_privilege(r.role_name, c.oid, 'USAGE')
                 or has_sequence_privilege(r.role_name, c.oid, 'SELECT')
                 or has_sequence_privilege(r.role_name, c.oid, 'UPDATE')))::int as client_sequence_privileges,
            (select count(*) from pg_policies where schemaname='lifequest')::int as policy_count
        `)).rows[0];
        if (!checks.tables_present || Number(checks.table_count) !== 23 || Number(checks.forced_rls_count) !== 23
          || Number(checks.wrong_owner_count) !== 0 || checks.schema_owner !== 'lifequest_schema_owner'
          || Number(checks.client_schema_privileges) !== 0 || Number(checks.client_table_privileges) !== 0
          || Number(checks.client_sequence_privileges) !== 0 || Number(checks.policy_count) !== 80) {
          fail('RESTORE_SCHEMA_RLS_OWNER_POSTCHECK_FAILED');
        }
        await this.verifyExpectedOwnerRolesForDatabase(client);

        if (migrationVersions.includes('20261015002800')) {
          const classColumn = (await client.query(`
            select is_nullable from information_schema.columns
            where table_schema='lifequest' and table_name='hunter_profiles' and column_name='class_code'
          `)).rows[0];
          const rpc = (await client.query(`
            select p.prosecdef, p.proconfig, r.rolname as owner,
              has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
            from pg_proc p join pg_namespace n on n.oid=p.pronamespace
            join pg_roles r on r.oid=p.proowner
            where n.nspname='public' and p.proname='lifequest_profile_command' and p.pronargs=4
          `)).rows;
          if (classColumn?.is_nullable !== 'YES' || rpc.length !== 1 || rpc[0].prosecdef !== true
            || rpc[0].owner !== 'lifequest_command_owner' || rpc[0].anon_execute !== false
            || rpc[0].authenticated_execute !== true
            || !(rpc[0].proconfig || []).includes('search_path=""')) fail('RESTORE_CLASS_RPC_POSTCHECK_FAILED');
        }
      } finally { await client.end(); }
    },
    async verifyExpectedOwnerRolesForDatabase(client, requiredRoles = expectedOwnerRoles) {
      const rows = (await client.query(`
        select r.rolname::text, r.rolcanlogin, r.rolsuper, r.rolcreatedb, r.rolcreaterole,
          r.rolreplication, r.rolbypassrls,
          exists(select 1 from pg_auth_members m where m.member = r.oid) as has_role_memberships,
          exists(select 1 from pg_auth_members m where m.roleid = r.oid
            and (pg_get_userbyid(m.member) <> 'postgres' or m.inherit_option or m.set_option)) as has_unexpected_memberships,
          coalesce((select json_agg(json_build_object('name', pg_get_userbyid(m.roleid), 'grantor', pg_get_userbyid(m.grantor), 'inherit', m.inherit_option, 'set', m.set_option, 'admin', m.admin_option)
            order by pg_get_userbyid(m.roleid)) from pg_auth_members m where m.member = r.oid), '[]'::json) as member_of_roles,
          coalesce((select json_agg(json_build_object('name', pg_get_userbyid(m.member), 'grantor', pg_get_userbyid(m.grantor), 'inherit', m.inherit_option, 'set', m.set_option, 'admin', m.admin_option)
            order by pg_get_userbyid(m.member)) from pg_auth_members m where m.roleid = r.oid), '[]'::json) as granted_to_roles
        from pg_roles r where r.rolname::text = any($1::text[])
      `, [requiredRoles])).rows;
      assertOwnerRoleRows(rows, requiredRoles);
    },
  };
}

function sqlLiteral(value) {
  if (typeof value !== 'string' || value.includes('\0')) fail('RESTORE_SQL_VALUE_INVALID');
  return `'${value.replaceAll("'", "''")}'`;
}

function runDockerOutput(args, { timeout = 30000, maxBuffer = 8 * 1024 * 1024 } = {}) {
  try {
    return execFileSync('docker', args, {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, timeout, maxBuffer,
      env: { ...process.env, PGHOST: '', PGPORT: '', PGUSER: '', PGDATABASE: '', PGPASSWORD: '', PGSSLMODE: '' },
    }).trim();
  } catch { fail('RESTORE_COMPOSE_INSPECTION_FAILED'); }
}

function inspectComposeTarget({ targetWorkdir, targetProjectId, expectedContainerName }) {
  const local = personalStackConfig();
  const target = assertIndependentTarget({ targetWorkdir, targetProjectId });
  if (!/^lifequest-restore-verify-[a-z0-9-]+$/.test(targetProjectId)
    || targetProjectId === local.project) fail('RESTORE_TARGET_NOT_INDEPENDENT');
  const containerName = expectedContainerName || `${targetProjectId}-db`;
  const volumeName = `${targetProjectId}-db-data`;
  const networkName = `${targetProjectId}-isolated`;
  if (containerName !== `${targetProjectId}-db`) fail('RESTORE_COMPOSE_CONTAINER_IDENTITY_MISMATCH');

  const context = runDockerOutput(['context', 'show']);
  const endpoint = runDockerOutput(['context', 'inspect', context, '--format', '{{.Endpoints.docker.Host}}']);
  const serverOs = runDockerOutput(['info', '--format', '{{.OSType}}']);
  if (!endpoint.startsWith('npipe://') || serverOs !== 'linux') fail('RESTORE_COMPOSE_LOCAL_LINUX_ENGINE_REQUIRED');

  const ids = runDockerOutput(['ps', '-aq', '--no-trunc', '--filter', `label=com.docker.compose.project=${targetProjectId}`])
    .split(/\r?\n/).filter(Boolean);
  if (ids.length !== 1) fail('RESTORE_COMPOSE_CONTAINER_IDENTITY_MISMATCH');
  let container;
  try { container = JSON.parse(runDockerOutput(['inspect', ids[0]]))[0]; }
  catch { fail('RESTORE_COMPOSE_CONTAINER_INSPECT_INVALID'); }
  if (container.Id !== ids[0] || container.Name !== `/${containerName}`
    || container.Config?.Labels?.['com.docker.compose.project'] !== targetProjectId
    || container.Config?.Labels?.['com.docker.compose.service'] !== 'db') fail('RESTORE_COMPOSE_CONTAINER_IDENTITY_MISMATCH');

  const expectedImage = 'public.ecr.aws/supabase/postgres:17.11.0.004';
  const imageId = runDockerOutput(['image', 'inspect', expectedImage, '--format', '{{.Id}}']);
  if (container.Config?.Image !== expectedImage || container.Image !== imageId) fail('RESTORE_COMPOSE_IMAGE_MISMATCH');
  if (container.State?.Status !== 'running' || container.State?.Health?.Status !== 'healthy') fail('RESTORE_COMPOSE_DATABASE_UNHEALTHY');
  const portBindings = container.HostConfig?.PortBindings || {};
  if (container.HostConfig?.PublishAllPorts === true
    || Object.values(portBindings).some(bindings => Array.isArray(bindings) && bindings.length > 0)
    || Object.values(container.NetworkSettings?.Ports || {}).some(bindings => Array.isArray(bindings) && bindings.length > 0)) {
    fail('RESTORE_COMPOSE_PORT_PUBLISHED');
  }
  const mounts = container.Mounts || [];
  if (mounts.length !== 1 || mounts[0].Type !== 'volume' || mounts[0].Name !== volumeName
    || mounts[0].Destination !== '/var/lib/postgresql/data' || mounts[0].RW !== true) fail('RESTORE_COMPOSE_VOLUME_IDENTITY_MISMATCH');
  const attached = Object.keys(container.NetworkSettings?.Networks || {});
  if (attached.length !== 1 || attached[0] !== networkName
    || container.HostConfig?.NetworkMode !== networkName) fail('RESTORE_COMPOSE_NETWORK_IDENTITY_MISMATCH');

  let network, volume;
  try {
    network = JSON.parse(runDockerOutput(['network', 'inspect', networkName]))[0];
    volume = JSON.parse(runDockerOutput(['volume', 'inspect', volumeName]))[0];
  } catch { fail('RESTORE_COMPOSE_NETWORK_OR_VOLUME_MISSING'); }
  if (network?.Name !== networkName || network.Driver !== 'bridge' || network.Internal !== true
    || network.Labels?.['com.docker.compose.project'] !== targetProjectId) fail('RESTORE_COMPOSE_NETWORK_NOT_ISOLATED');
  if (volume?.Name !== volumeName || volume.Driver !== 'local'
    || volume.Labels?.['com.docker.compose.project'] !== targetProjectId) fail('RESTORE_COMPOSE_VOLUME_IDENTITY_MISMATCH');
  return { target, projectId: targetProjectId, containerName, containerId: container.Id, volumeName, networkName, imageId };
}

function createComposeTargetAdapter({ targetWorkdir, targetProjectId, expectedContainerName, migrationDatabase = 'postgres', migrationHistoryPolicy }) {
  if (![migrationHistoryPolicies.ADMIN_DATABASE_EXACT, migrationHistoryPolicies.FRESH_DESTINATION].includes(migrationHistoryPolicy)) {
    fail('RESTORE_MIGRATION_HISTORY_POLICY_INVALID');
  }
  let identity;
  const execPsql = (database, sql, { json = false, stdin = false, args = [] } = {}) => {
    const container = identity?.containerName || expectedContainerName || `${targetProjectId}-db`;
    const commandArgs = ['exec', ...(stdin ? ['-i'] : []), '-u', 'postgres', container,
      'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '--no-password', '--host=/var/run/postgresql', '--port=5432', '--username=supabase_admin', `--dbname=${database}`,
      ...args, '-c', sql];
    if (stdin) fail('RESTORE_COMPOSE_UNSUPPORTED_PSQL_STDIN');
    return runDockerOutput(commandArgs, { timeout: 120000 });
  };
  const queryJson = (database, sql) => {
    const result = execPsql(database, `select coalesce(json_agg(row_to_json(q)), '[]'::json)::text from (${sql}) q`);
    try { return JSON.parse(result || '[]'); } catch { fail('RESTORE_COMPOSE_QUERY_RESULT_INVALID'); }
  };
  const ownerRoleRows = requiredRoles => queryJson('postgres', `
    select r.rolname::text, r.rolcanlogin, r.rolsuper, r.rolcreatedb, r.rolcreaterole,
      r.rolreplication, r.rolbypassrls,
      exists(select 1 from pg_auth_members m where m.member = r.oid) as has_role_memberships,
      exists(select 1 from pg_auth_members m where m.roleid = r.oid
        and (pg_get_userbyid(m.member) <> 'postgres' or m.inherit_option or m.set_option)) as has_unexpected_memberships,
      coalesce((select json_agg(json_build_object('name', pg_get_userbyid(m.roleid), 'grantor', pg_get_userbyid(m.grantor), 'inherit', m.inherit_option, 'set', m.set_option, 'admin', m.admin_option)
        order by pg_get_userbyid(m.roleid)) from pg_auth_members m where m.member = r.oid), '[]'::json) as member_of_roles,
      coalesce((select json_agg(json_build_object('name', pg_get_userbyid(m.member), 'grantor', pg_get_userbyid(m.grantor), 'inherit', m.inherit_option, 'set', m.set_option, 'admin', m.admin_option)
        order by pg_get_userbyid(m.member)) from pg_auth_members m where m.roleid = r.oid), '[]'::json) as granted_to_roles
    from pg_roles r where r.rolname = any(array[${requiredRoles.map(sqlLiteral).join(',')} ]::text[])
    order by r.rolname`);

  return {
    migrationHistoryPolicy,
    async verifyTargetIdentity() { identity = inspectComposeTarget({ targetWorkdir, targetProjectId, expectedContainerName }); return identity; },
    async verifyExpectedOwnerRoles(requiredRoles = expectedOwnerRoles) {
      const rows = ownerRoleRows(requiredRoles);
      assertOwnerRoleRows(rows, requiredRoles);
    },
    async verifyAvailableExtensions(requiredExtensions) {
      if (!requiredExtensions.length) return;
      const rows = queryJson('postgres', `select name from pg_available_extensions where name = any(array[${requiredExtensions.map(sqlLiteral).join(',')} ]::text[]) order by name`);
      if (rows.length !== requiredExtensions.length) fail('RESTORE_REQUIRED_EXTENSION_MISSING');
    },
    async verifyAppliedMigrations(expected) {
      if (migrationHistoryPolicy !== migrationHistoryPolicies.ADMIN_DATABASE_EXACT) fail('RESTORE_ADMIN_HISTORY_CHECK_NOT_CONFIGURED');
      const rows = queryJson(migrationDatabase, 'select version::text from supabase_migrations.schema_migrations order by version');
      if (rows.map(row => row.version).join(',') !== expected.join(',')) fail('RESTORE_TARGET_APPLIED_MIGRATIONS_MISMATCH');
    },
    async databaseExists(name) {
      const result = execPsql('postgres', `select case when exists(select 1 from pg_database where datname=${sqlLiteral(name)}) then '1' else '0' end`);
      return result === '1';
    },
    async createDatabase(name) { execPsql('postgres', `create database "${name}" template template0`); },
    async restoreDatabase({ databaseName, archivePath, streamArchive }) {
      if (streamArchive !== true) fail('RESTORE_ARCHIVE_STREAM_REQUIRED');
      const container = identity.containerName;
      const args = ['exec', '-i', '-u', 'postgres', container, 'pg_restore', ...buildContainerRestoreStdinArgs({ databaseName })];
      await runPgRestore('docker', args, { archivePath, streamArchive: true, failureCode: 'PG_RESTORE_EXEC_FAILED' });
    },
    async verifyRestoredDatabase({ databaseName, migrationVersions, requirements }) {
      const roleRowsBefore = ownerRoleRows(requirements.roleDependencies);
      assertOwnerRoleRows(roleRowsBefore, requirements.roleDependencies);
      const migrationRows = queryJson(databaseName, 'select version::text from supabase_migrations.schema_migrations order by version');
      if (migrationRows.map(row => row.version).join(',') !== migrationVersions.join(',')) fail('RESTORE_MIGRATION_POSTCHECK_FAILED');
      const surface = queryJson(databaseName, `
        select
          (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='lifequest' and c.relkind in ('r','p')) as table_count,
          (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='lifequest' and c.relkind in ('r','p') and c.relrowsecurity and c.relforcerowsecurity) as forced_rls_count,
          (select count(*)::int from pg_policies where schemaname='lifequest') as policy_count,
          (select pg_get_userbyid(nspowner) from pg_namespace where nspname='lifequest') as schema_owner,
          (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='lifequest' and c.relkind in ('r','p') and pg_get_userbyid(c.relowner)<>'lifequest_schema_owner') as wrong_table_owner_count,
          (select count(*)::int from pg_namespace n cross join (values ('anon'::text),('authenticated'::text)) r(name) where n.nspname='lifequest' and (has_schema_privilege(r.name,n.oid,'USAGE') or has_schema_privilege(r.name,n.oid,'CREATE'))) as client_schema_privilege_count,
          (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join (values ('anon'::text),('authenticated'::text)) r(name) where n.nspname='lifequest' and c.relkind in ('r','p') and (has_table_privilege(r.name,c.oid,'SELECT') or has_table_privilege(r.name,c.oid,'INSERT') or has_table_privilege(r.name,c.oid,'UPDATE') or has_table_privilege(r.name,c.oid,'DELETE') or has_table_privilege(r.name,c.oid,'TRUNCATE') or has_table_privilege(r.name,c.oid,'REFERENCES') or has_table_privilege(r.name,c.oid,'TRIGGER') or has_any_column_privilege(r.name,c.oid,'SELECT') or has_any_column_privilege(r.name,c.oid,'INSERT') or has_any_column_privilege(r.name,c.oid,'UPDATE') or has_any_column_privilege(r.name,c.oid,'REFERENCES'))) as client_table_privilege_count,
          (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join (values ('anon'::text),('authenticated'::text)) r(name) where n.nspname='lifequest' and c.relkind='S' and (has_sequence_privilege(r.name,c.oid,'USAGE') or has_sequence_privilege(r.name,c.oid,'SELECT') or has_sequence_privilege(r.name,c.oid,'UPDATE'))) as client_sequence_privilege_count,
          (select array_agg(extname::text order by extname::text) from pg_extension where extname<>'plpgsql') as extensions
      `);
      const stats = surface[0];
      if (Number(stats.table_count) !== 23 || Number(stats.forced_rls_count) !== 23 || Number(stats.policy_count) !== 80
        || stats.schema_owner !== 'lifequest_schema_owner' || Number(stats.wrong_table_owner_count) !== 0
        || Number(stats.client_schema_privilege_count) !== 0 || Number(stats.client_table_privilege_count) !== 0
        || Number(stats.client_sequence_privilege_count) !== 0) fail('RESTORE_SCHEMA_RLS_OWNER_POSTCHECK_FAILED');
      const available = queryJson('postgres', `select name from pg_available_extensions where name = any(array[${requirements.extensions.map(sqlLiteral).join(',')} ]::text[]) order by name`).map(row => row.name);
      if (available.length !== requirements.extensions.length || requirements.extensions.some(name => !stats.extensions.includes(name))) fail('RESTORE_REQUIRED_EXTENSION_MISSING');
      const roleRowsAfter = ownerRoleRows(requirements.roleDependencies);
      assertOwnerRoleRows(roleRowsAfter, requirements.roleDependencies);
      if (JSON.stringify(roleRowsBefore) !== JSON.stringify(roleRowsAfter)) fail('RESTORE_OWNER_ROLE_STATE_CHANGED');

      if (migrationVersions.includes('20261015002800')) {
        const classRpc = queryJson(databaseName, `
          select p.prosecdef, p.proconfig, r.rolname as owner,
            has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
            has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
            (select is_nullable from information_schema.columns where table_schema='lifequest' and table_name='hunter_profiles' and column_name='class_code') as class_nullable
          from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner
          where n.nspname='public' and p.proname='lifequest_profile_command' and p.pronargs=4
        `);
        const rpc = classRpc[0];
        if (classRpc.length !== 1 || rpc.prosecdef !== true || rpc.owner !== 'lifequest_command_owner'
          || rpc.anon_execute !== false || rpc.authenticated_execute !== true
          || !(rpc.proconfig || []).includes('search_path=""') || rpc.class_nullable !== 'YES') fail('RESTORE_CLASS_RPC_POSTCHECK_FAILED');
      }
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 1; i < args.length; i += 2) {
    const key = args[i];
    if (!key?.startsWith('--') || !args[i + 1] || options[key.slice(2)]) fail('RESTORE_ARGUMENTS_INVALID');
    options[key.slice(2)] = args[i + 1];
  }
  if (!['restore', 'restore-compose'].includes(args[0]) || !options.archive || !options.target || !options.database) fail('RESTORE_ARGUMENTS_INVALID');
  const archivePath = path.resolve(options.archive);
  const manifestPath = `${archivePath}.json`;
  const targetProjectId = path.basename(path.resolve(options.target));
  const target = assertIndependentTarget({ targetWorkdir: options.target, targetProjectId });
  const expectedSourceProject = personalStackConfig().project;
  if (args[0] === 'restore-compose') {
    const container = `${targetProjectId}-db`;
    const targetAdapter = createComposeTargetAdapter({ targetWorkdir: options.target, targetProjectId, expectedContainerName: container,
      migrationHistoryPolicy: migrationHistoryPolicies.FRESH_DESTINATION });
    const result = await restoreToFreshDatabase({ archivePath, manifestPath, expectedSourceProject,
      targetProjectId, targetWorkdir: options.target, databaseName: options.database,
      pgRestoreCommand: 'docker', pgRestorePrefixArgs: ['exec', '-i', '-u', 'postgres', container],
      streamArchive: true, targetAdapter });
    console.log(`PASS restored verified unencrypted dump in new isolated Compose database ${result.databaseName}; ${result.bytes} bytes; SHA-256 ${result.sha256}`);
    return;
  }
  const targetStatus = readCliStatus(target.target);
  let dbUrl, apiUrl;
  try { dbUrl = new URL(targetStatus.DB_URL); apiUrl = new URL(targetStatus.API_URL); } catch { fail('RESTORE_TARGET_STATUS_INVALID'); }
  const expectedPort = parseDatabasePort(target.config);
  if (dbUrl.hostname !== '127.0.0.1' || dbUrl.port !== expectedPort || dbUrl.pathname !== '/postgres'
    || apiUrl.hostname !== '127.0.0.1') fail('RESTORE_TARGET_ENDPOINT_MISMATCH');
  const container = exactDatabaseContainer(targetProjectId);
  const { Client } = require('../auth2/node_modules/pg');
  const admin = new Client({ connectionString: targetStatus.DB_URL });
  await admin.connect();
  const targetAdapter = createSupabaseTargetAdapter({ admin, targetStatus, container, Client });
  try {
    const result = await restoreToFreshDatabase({ archivePath, manifestPath, expectedSourceProject,
      targetProjectId, targetWorkdir: options.target, databaseName: options.database,
      pgRestoreCommand: 'docker', pgRestorePrefixArgs: ['exec', '-i', container], streamArchive: true, targetAdapter });
    console.log(`PASS restored verified unencrypted dump into new independent database ${result.databaseName}; ${result.bytes} bytes; SHA-256 ${result.sha256}`);
  } finally { await admin.end(); }
}

if (require.main === module) main().catch(error => {
  console.error(formatRestoreError(error?.code));
  process.exitCode = 1;
});

function formatRestoreError(code) {
  const messages = {
    BACKUP_FILE_MISSING: 'Le fichier .dump ou son manifeste est introuvable.',
    BACKUP_FILE_UNSAFE: 'Le fichier de sauvegarde n’est pas un fichier ordinaire sûr.',
    BACKUP_ACL_NOT_PRIVATE: 'Le fichier ou son dossier ne possède pas les permissions Windows privées attendues.',
    BACKUP_MANIFEST_INVALID: 'Le manifeste est illisible ou ne respecte pas le format attendu.',
    BACKUP_CHECKSUM_MISMATCH: 'La taille ou le SHA-256 ne correspond pas au manifeste. Aucune base n’a été créée.',
    PG_RESTORE_ARCHIVE_FORMAT_INVALID: 'Le fichier n’est pas une archive PostgreSQL custom-format valide.',
    PG_RESTORE_ARCHIVE_INVALID: 'pg_restore a détecté une archive incomplète ou endommagée. Aucune base n’a été créée.',
    PG_RESTORE_VALIDATION_FAILED: 'pg_restore a échoué pendant le contrôle préalable pour une cause autre qu’une corruption reconnue. Aucune base n’a été créée.',
    PG_RESTORE_VALIDATION_TIMEOUT: 'La vérification complète de l’archive a dépassé le délai. Aucune base n’a été créée.',
    PG_RESTORE_SPAWN_FAILED: 'pg_restore n’a pas pu être démarré pendant la validation. Aucune base n’a été créée.',
    RESTORE_REQUIRED_ROLE_MISSING: 'La cible ne contient pas un rôle propriétaire, un rôle ACL ou un rôle applicatif requis. Aucune base n’a été créée.',
    RESTORE_OWNER_ROLE_PRIVILEGES_INVALID: 'Un rôle référencé par l’archive a des attributs ou appartenances inattendus. Aucune base n’a été créée.',
    RESTORE_OWNER_ROLE_UNTRUSTED: 'L’archive référence un rôle qui ne figure pas dans les profils autorisés Supabase/LifeQuest. Aucune base n’a été créée.',
    RESTORE_REQUIRED_EXTENSION_MISSING: 'Une extension PostgreSQL requise par l’archive est indisponible dans le conteneur. Aucune base n’a été créée.',
    RESTORE_COMPOSE_PORT_PUBLISHED: 'La cible Compose publie un port sur l’hôte ; restauration refusée.',
    RESTORE_COMPOSE_NETWORK_NOT_ISOLATED: 'Le réseau Compose n’est pas interne et isolé ; restauration refusée.',
    RESTORE_COMPOSE_CONTAINER_IDENTITY_MISMATCH: 'Le conteneur ne correspond pas exactement au projet Compose de restauration attendu.',
    RESTORE_ARCHIVE_STREAM_REQUIRED: 'La restauration exige le flux d’archive vérifié vers stdin. Aucune base n’a été créée.',
    PG_RESTORE_EXEC_FAILED_NEW_DATABASE_REMAINS: 'pg_restore a échoué pendant la restauration. La nouvelle base peut être vide ou incomplète ; aucune base préexistante n’a été ciblée.',
    PG_RESTORE_SPAWN_FAILED_NEW_DATABASE_REMAINS: 'pg_restore n’a pas pu démarrer après la création de la nouvelle base. Cette base reste à vérifier ; aucune base préexistante n’a été ciblée.',
    PG_RESTORE_TIMEOUT_NEW_DATABASE_REMAINS: 'pg_restore a dépassé le délai après la création de la nouvelle base. Cette base peut être vide ou incomplète ; aucune base préexistante n’a été ciblée.',
    RESTORE_ARCHIVE_STREAM_FAILED_NEW_DATABASE_REMAINS: 'Le flux vers pg_restore a échoué après la création de la nouvelle base. Cette base peut être vide ou incomplète ; aucune base préexistante n’a été ciblée.',
    RESTORE_DATABASE_OPERATION_FAILED_NEW_DATABASE_REMAINS: 'Une erreur de restauration est survenue après la création de la nouvelle base. Celle-ci peut être vide ou incomplète ; aucune base préexistante n’a été ciblée.',
    RESTORE_POSTCHECK_FAILED_NEW_DATABASE_REMAINS: 'La restauration s’est terminée, mais les contrôles de propriétaire, rôles ou protections ont échoué. La nouvelle base reste séparée et doit être examinée.',
    RESTORE_TARGET_NOT_INDEPENDENT: 'La cible doit être une stack de vérification indépendante nommée lifequest-restore-verify-… sous le dossier privé local configuré.',
    RESTORE_TARGET_NOT_PREPARED: 'La stack cible n’a pas les fichiers d’identité et de migrations vérifiés attendus.',
    RESTORE_TARGET_STACK_NOT_RUNNING: 'Démarrez explicitement la stack indépendante de restauration avant de réessayer.',
    RESTORE_TARGET_ENDPOINT_MISMATCH: 'Les endpoints ne correspondent pas à la stack indépendante sélectionnée.',
    RESTORE_TARGET_APPLIED_MIGRATIONS_MISMATCH: 'L’historique de migrations de la cible est différent de celui de l’archive.',
    RESTORE_MIGRATION_HISTORY_POLICY_INVALID: 'La politique de contrôle de l’historique de migration de cette cible est absente ou inconnue.',
    RESTORE_FRESH_TARGET_IDENTITY_REQUIRED: 'Une cible de restauration neuve doit vérifier son identité Docker avant toute création de base.',
    RESTORE_ADMIN_HISTORY_CHECK_NOT_CONFIGURED: 'Cette cible neuve ne doit pas lire un historique de migrations dans la base administrative.',
    RESTORE_MIGRATION_OR_PROJECT_MISMATCH: 'L’archive et la cible n’ont pas le même projet source ou la même liste de migrations.',
    RESTORE_DATABASE_NAME_INVALID: 'Le nom de la base doit suivre le préfixe lifequest_restore_ et utiliser des lettres, chiffres ou soulignements.',
    RESTORE_DATABASE_ALREADY_EXISTS: 'Cette base existe déjà. Choisissez un nouveau nom ; aucune base existante n’a été modifiée.',
    RESTORE_DATABASE_CREATE_FAILED: 'PostgreSQL n’a pas pu créer la nouvelle base. Aucune restauration n’a commencé.',
    RESTORE_FAILED_NEW_DATABASE_REMAINS: 'La restauration a échoué après la création de la nouvelle base. Cette base peut être vide ou incomplète ; elle n’a pas été supprimée automatiquement. La base préexistante reste séparée.',
    RESTORE_MIGRATION_POSTCHECK_FAILED: 'La restauration ne contient pas l’historique de migrations attendu.',
    RESTORE_SCHEMA_RLS_POSTCHECK_FAILED: 'Le schéma restauré ou ses protections RLS ne correspondent pas aux contrôles attendus.',
    RESTORE_SCHEMA_RLS_OWNER_POSTCHECK_FAILED: 'Les propriétaires du schéma ou des tables, les politiques RLS ou les privilèges client restaurés ne correspondent pas aux contrôles attendus.',
    RESTORE_CLASS_RPC_POSTCHECK_FAILED: 'La classe Hunter ou la RPC SECURITY DEFINER restaurée ne respecte pas son contrat de sécurité.',
    RESTORE_CLIENT_PRIVILEGE_POSTCHECK_FAILED: 'Des privilèges client inattendus ont été trouvés après restauration.',
  };
  return `Échec de la restauration LifeQuest : ${messages[code] || 'une erreur inattendue est survenue.'} (${code || 'RESTORE_FAILED'})`;
}

module.exports = {
  verifyArchive,
  restoreToFreshDatabase,
  validateMigrationHistoryPolicy,
  verifyMigrationHistoryPrecondition,
  assertArchiveMatchesTarget,
  assertIndependentTarget,
  runPgRestore,
  buildRestoreStdinArgs,
  assertOwnerRoleRows,
  createSupabaseTargetAdapter,
  createComposeTargetAdapter,
  inspectComposeTarget,
  parseArchiveRequirements,
  buildContainerRestoreStdinArgs,
  formatRestoreError,
  expectedOwnerRoles,
  migrationHistoryPolicies,
  manifestSchema: 'lifequest-plain-postgres-backup-v1',
};
