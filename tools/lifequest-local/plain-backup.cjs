'use strict';

// Plain, custom-format PostgreSQL backup. No age binary or identity is used.
// The CLI is pinned to the local LifeQuest stack and never starts it.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');
const { createHash, randomBytes } = require('node:crypto');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const root = path.resolve(__dirname, '../..');
const manifestSchema = 'lifequest-plain-postgres-backup-v1';

function fail(code) { throw Object.assign(new Error(code), { code }); }
function isWithin(candidate, parent) {
  const rel = path.relative(path.resolve(parent), path.resolve(candidate));
  return rel === '' || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${path.sep}`));
}
function personalStackConfig() {
  let stack;
  try { stack = require('./stack.cjs'); } catch { fail('LOCAL_STACK_CONFIG_UNAVAILABLE'); }
  const configuredTarget = String(stack?.target || '');
  if (!path.isAbsolute(configuredTarget)) fail('LOCAL_STACK_CONFIG_INVALID');
  const target = path.resolve(configuredTarget);
  if (!/^[a-z0-9][a-z0-9-]{2,90}$/.test(stack?.project || '')
    || path.basename(target) !== stack.project
    || isWithin(target, root) || !Number.isInteger(stack?.ports?.api) || !Number.isInteger(stack?.ports?.db)) {
    fail('LOCAL_STACK_CONFIG_INVALID');
  }
  return { project: stack.project, target, ports: stack.ports };
}
function personalWorkspaceRoot() {
  return path.dirname(personalStackConfig().target);
}
function getBackupRoot(env = process.env) {
  const stack = personalStackConfig();
  const workspace = path.dirname(stack.target);
  const configured = typeof env?.LIFEQUEST_BACKUP_DIR === 'string' && env.LIFEQUEST_BACKUP_DIR.trim()
    ? env.LIFEQUEST_BACKUP_DIR.trim()
    : path.join(workspace, 'lifequest-private-backups');
  if (!path.isAbsolute(configured)) fail('BACKUP_DIRECTORY_OUTSIDE_PRIVATE_ROOT');
  const resolved = path.resolve(configured);
  if (path.dirname(resolved).toLowerCase() !== workspace.toLowerCase()
    || isWithin(resolved, root) || isWithin(resolved, stack.target)) {
    fail('BACKUP_DIRECTORY_OUTSIDE_PRIVATE_ROOT');
  }
  return resolved;
}
function runPowerShell(script, env = {}) {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true,
    timeout: 15000, env: { ...process.env, ...env },
  });
  if (result.error || result.status !== 0) fail('WINDOWS_ACL_CHECK_FAILED');
  return (result.stdout || '').trim();
}
function currentSid() {
  const sid = runPowerShell('[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value');
  if (!/^S-1-\d+(?:-\d+)+$/.test(sid)) fail('WINDOWS_IDENTITY_UNAVAILABLE');
  return sid;
}
function hasReparsePoint(target) {
  const result = runPowerShell('$i=Get-Item -Force -LiteralPath $env:LQ_PRIVATE_PATH; [int](($i.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)', {
    LQ_PRIVATE_PATH: target,
  });
  return result === '1';
}
function assertNoReparse(target) {
  if (hasReparsePoint(target)) fail('BACKUP_PATH_REPARSE_POINT');
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) fail('BACKUP_PATH_REPARSE_POINT');
}
function setPrivateAcl(target, directory) {
  const sid = currentSid();
  const grant = directory ? '(OI)(CI)F' : 'F';
  const result = spawnSync('icacls.exe', [target, '/inheritance:r', '/grant:r', `*${sid}:${grant}`, `*S-1-5-18:${grant}`, '/Q'], {
    encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true, timeout: 15000,
  });
  if (result.error || result.status !== 0) fail('WINDOWS_ACL_SET_FAILED');
}
function verifyPrivateAcl(target) {
  const script = '$acl=Get-Acl -LiteralPath $env:LQ_PRIVATE_PATH; $sids=@($acl.Access | ForEach-Object { $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value } | Sort-Object -Unique); $rules=@($acl.Access | ForEach-Object { [pscustomobject]@{Type=$_.AccessControlType.ToString(); Rights=[int]$_.FileSystemRights} }); [pscustomobject]@{Protected=$acl.AreAccessRulesProtected; Sids=$sids; Rules=$rules} | ConvertTo-Json -Compress';
  let value;
  try { value = JSON.parse(runPowerShell(script, { LQ_PRIVATE_PATH: target })); } catch { fail('WINDOWS_ACL_CHECK_FAILED'); }
  const expected = [currentSid(), 'S-1-5-18'].sort();
  const actual = Array.isArray(value.Sids) ? value.Sids.sort() : [value.Sids].filter(Boolean).sort();
  const rules = Array.isArray(value.Rules) ? value.Rules : value.Rules ? [value.Rules] : [];
  const full = 0x1f01ff;
  if (value.Protected !== true || JSON.stringify(actual) !== JSON.stringify(expected)
    || !rules.length || rules.some(rule => rule.Type !== 'Allow' || (rule.Rights & full) !== full)) {
    fail('BACKUP_ACL_NOT_PRIVATE');
  }
}
function canonicalPrivateDirectory(directory, { allowTemp = false } = {}) {
  if (process.platform !== 'win32') fail('WINDOWS_ACL_REQUIRED');
  const resolved = path.resolve(directory);
  const stack = allowTemp ? undefined : personalStackConfig();
  const workspace = stack && path.dirname(stack.target);
  if (!path.isAbsolute(resolved) || isWithin(resolved, root)
    || (!allowTemp && (path.dirname(resolved).toLowerCase() !== workspace.toLowerCase()
      || isWithin(resolved, stack.target)))) {
    fail('BACKUP_DIRECTORY_OUTSIDE_PRIVATE_ROOT');
  }
  if (allowTemp && !isWithin(resolved, os.tmpdir())) fail('TEST_DIRECTORY_OUTSIDE_TEMP');
  return resolved;
}
function ensurePrivateDirectory(directory, { allowTemp = false } = {}) {
  const resolved = canonicalPrivateDirectory(directory, { allowTemp });
  if (fs.existsSync(resolved)) {
    assertNoReparse(resolved);
    verifyPrivateAcl(resolved); // Refuse existing loose directories; do not rewrite ACLs.
  } else {
    const parent = path.dirname(resolved);
    if (!fs.existsSync(parent)) fail('BACKUP_PARENT_MISSING');
    assertNoReparse(parent);
    fs.mkdirSync(resolved);
    try {
      assertNoReparse(resolved);
      setPrivateAcl(resolved, true);
      verifyPrivateAcl(resolved);
    } catch (error) {
      try { fs.rmdirSync(resolved); } catch {}
      throw error;
    }
  }
  return resolved;
}
function createPrivateFile(target) {
  const fd = fs.openSync(target, 'wx', 0o600);
  try {
    setPrivateAcl(target, false);
    verifyPrivateAcl(target);
  } catch (error) {
    try { fs.closeSync(fd); } catch {}
    try { fs.unlinkSync(target); } catch {}
    throw error;
  }
  return fd;
}
function protectPrivateFile(target) {
  if (!path.isAbsolute(target) || !fs.existsSync(target)) fail('BACKUP_FILE_MISSING');
  assertNoReparse(target);
  setPrivateAcl(target, false);
  verifyPrivateAcl(target);
}
async function measureFile(file) {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of fs.createReadStream(file)) {
    bytes += chunk.length;
    hash.update(chunk);
  }
  return { bytes, sha256: hash.digest('hex') };
}
function availableBytes(directory) {
  let stats;
  try { stats = fs.statfsSync(directory); } catch { fail('BACKUP_DISK_SPACE_CHECK_FAILED'); }
  const bytes = Number(stats.bavail) * Number(stats.bsize);
  if (!Number.isSafeInteger(bytes) || bytes < 0) fail('BACKUP_DISK_SPACE_CHECK_FAILED');
  return bytes;
}
function requireFreeSpace(directory, minimumBytes) {
  if (!Number.isSafeInteger(minimumBytes) || minimumBytes < 1) fail('BACKUP_SPACE_ESTIMATE_INVALID');
  if (availableBytes(directory) < minimumBytes) fail('BACKUP_DISK_SPACE_LOW');
}
function makeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomBytes(4).toString('hex');
}

// One historical installed copy has a documented, byte-exact extra final LF.
// Keep this exception pinned to both exact files and both observed digests.
const knownMigrationCopyDifference = Object.freeze({
  name: '20261014001400_auth5_onboarding.sql',
  sourceSha256: '45e5a72c4af0b0347e9ccfaa141872b1ace8b087cd10618d6998be888a118dd3',
  installedSha256: '1842b8987832b70ac16c45ecdb3d103e37237f6358211dafe7488ee874d575bc',
  sourceBytes: 19725,
  installedBytes: 19726,
});

function sha256(buffer) { return createHash('sha256').update(buffer).digest('hex'); }
function migrationNamesIn(directory, errorCode = 'MIGRATION_SOURCE_SET_CHANGED') {
  let entries;
  try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { fail(errorCode); }
  const sqlEntries = entries.filter(entry => entry.name.endsWith('.sql'));
  if (sqlEntries.some(entry => !entry.isFile())) fail(errorCode);
  const names = sqlEntries.map(entry => entry.name).sort();
  if (!names.length || names.some((name, index) => !/^\d{14}_[a-z0-9_]+\.sql$/.test(name)
    || (index > 0 && names[index - 1] >= name))) fail(errorCode);
  return names;
}
function expectedPersonalMigrationNames(sourceDirectory = path.join(root, 'supabase/migrations')) {
  // Retained for callers; this is the complete source set, not the installed
  // target's applied set. A target may safely lag behind it by an exact prefix.
  return migrationNamesIn(sourceDirectory, 'MIGRATION_SOURCE_SET_CHANGED');
}
function verifyMigrationCompatibility({ sourceDirectory, installedDirectory, manifestPath, expectedNames }) {
  if (!Array.isArray(expectedNames) || expectedNames.length === 0) fail('MIGRATION_SOURCE_SET_CHANGED');
  let previousName = '';
  for (const name of expectedNames) {
    if (typeof name !== 'string' || !/^\d{14}_[a-z0-9_]+\.sql$/.test(name) || name <= previousName) {
      fail('MIGRATION_SOURCE_SET_CHANGED');
    }
    previousName = name;
  }
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { fail('MIGRATION_MANIFEST_MISMATCH'); }
  if (!Array.isArray(manifest) || manifest.length !== expectedNames.length) fail('MIGRATION_MANIFEST_MISMATCH');
  for (let i = 0; i < expectedNames.length; i++) {
    const name = expectedNames[i];
    const entry = manifest[i];
    let source, installed;
    try {
      source = fs.readFileSync(path.join(sourceDirectory, name));
      installed = fs.readFileSync(path.join(installedDirectory, name));
    } catch { fail('MIGRATION_MANIFEST_MISMATCH'); }
    const sourceHash = sha256(source);
    const installedHash = sha256(installed);
    // The manifest remains strict against the bytes actually installed.
    if (!entry || Object.keys(entry).sort().join(',') !== 'name,sha256'
      || entry.name !== name || !/^[a-f0-9]{64}$/.test(entry.sha256 || '')
      || entry.sha256 !== installedHash) fail('MIGRATION_MANIFEST_MISMATCH');
    if (name !== knownMigrationCopyDifference.name) {
      if (sourceHash !== installedHash || !source.equals(installed)) fail('MIGRATION_MANIFEST_MISMATCH');
      continue;
    }
    const exactKnownDifference = source.length === knownMigrationCopyDifference.sourceBytes
      && installed.length === knownMigrationCopyDifference.installedBytes
      && sourceHash === knownMigrationCopyDifference.sourceSha256
      && installedHash === knownMigrationCopyDifference.installedSha256
      && installed.length === source.length + 1
      && installed.subarray(0, source.length).equals(source)
      && installed[installed.length - 1] === 0x0a;
    if (!exactKnownDifference) fail('MIGRATION_MANIFEST_MISMATCH');
  }
  return expectedNames.map(name => name.slice(0, 14));
}

function verifyInstalledMigrationPrefix({ sourceDirectory, installedDirectory, manifestPath }) {
  const sourceNames = migrationNamesIn(sourceDirectory, 'MIGRATION_SOURCE_SET_CHANGED');
  const installedNames = migrationNamesIn(installedDirectory, 'MIGRATION_MANIFEST_MISMATCH');
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { fail('MIGRATION_MANIFEST_MISMATCH'); }
  if (!Array.isArray(manifest) || manifest.length === 0 || manifest.length !== installedNames.length
    || manifest.some((entry, index) => entry?.name !== installedNames[index])
    || manifest.length > sourceNames.length
    || manifest.some((entry, index) => entry.name !== sourceNames[index])) {
    fail('MIGRATION_SOURCE_PREFIX_MISMATCH');
  }
  const migrationVersions = verifyMigrationCompatibility({
    sourceDirectory, installedDirectory, manifestPath, expectedNames: installedNames,
  });
  return { sourceNames, installedNames, migrationVersions };
}

function assertAppliedMigrationVersions(appliedVersions, installedVersions) {
  const valid = values => Array.isArray(values) && values.length > 0
    && values.every((version, index) => typeof version === 'string' && /^\d{14}$/.test(version)
      && (index === 0 || values[index - 1] < version));
  if (!valid(appliedVersions) || !valid(installedVersions)
    || appliedVersions.length !== installedVersions.length
    || appliedVersions.some((version, index) => version !== installedVersions[index])) {
    fail('MIGRATION_HISTORY_MISMATCH');
  }
  return true;
}

async function createBackupFromCommand({
  projectId, directory = getBackupRoot(), command, args, env = process.env,
  migrationVersions = [], allowTempDirectory = false, timeoutMs = 15 * 60 * 1000,
  minFreeBytes = 64 * 1024 * 1024,
}) {
  if (!/^[a-z0-9][a-z0-9-]{2,90}$/.test(projectId || '') || !command || !Array.isArray(args)
    || !Array.isArray(migrationVersions) || migrationVersions.some(v => !/^\d{14}$/.test(v))) fail('BACKUP_ARGUMENTS_INVALID');
  const privateDir = ensurePrivateDirectory(directory, { allowTemp: allowTempDirectory });
  requireFreeSpace(privateDir, minFreeBytes);
  const base = `${projectId}-${makeTimestamp()}`;
  const archive = path.join(privateDir, `${base}.dump`);
  const manifestPath = `${archive}.json`;
  const archivePartial = `${archive}.partial`;
  const manifestPartial = `${manifestPath}.partial`;
  let archiveFd, manifestFd, archivePublished = false;
  let child, timedOut = false, interrupted = false;
  const stop = () => { interrupted = true; try { child?.kill(); } catch {} };
  try {
    archiveFd = createPrivateFile(archivePartial);
    const meterHash = createHash('sha256');
    let meterBytes = 0;
    const meter = new Transform({ transform(chunk, encoding, callback) {
      meterBytes += chunk.length;
      meterHash.update(chunk);
      callback(null, chunk);
    } });
    child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env });
    let spawnError = false;
    child.once('error', () => { spawnError = true; });
    if (!child.stdout || !child.stderr) fail('PG_DUMP_SPAWN_FAILED');
    child.stderr.resume(); // Drain diagnostics without logging database details.
    const closed = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
    const onSignal = () => stop();
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
    const timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
    timer.unref?.();
    try {
      const output = fs.createWriteStream(archivePartial, { fd: archiveFd, autoClose: false });
      await pipeline(child.stdout, meter, output);
      const result = await closed;
      if (spawnError) fail('PG_DUMP_SPAWN_FAILED');
      if (timedOut) fail('PG_DUMP_TIMEOUT');
      if (interrupted) fail('BACKUP_INTERRUPTED');
      if (result.signal || result.code !== 0) fail('PG_DUMP_FAILED');
      fs.fsyncSync(archiveFd);
    } catch (error) {
      try { child.kill(); } catch {}
      await closed;
      if (timedOut) fail('PG_DUMP_TIMEOUT');
      if (interrupted) fail('BACKUP_INTERRUPTED');
      if (spawnError) fail('PG_DUMP_SPAWN_FAILED');
      if (['PG_DUMP_SPAWN_FAILED', 'PG_DUMP_TIMEOUT', 'BACKUP_INTERRUPTED', 'PG_DUMP_FAILED'].includes(error?.code)) throw error;
      fail('PG_DUMP_STREAM_FAILED');
    } finally {
      clearTimeout(timer);
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
      try { fs.closeSync(archiveFd); } catch {}
      archiveFd = undefined;
    }
    const streamed = { bytes: meterBytes, sha256: meterHash.digest('hex') };
    const actual = await measureFile(archivePartial);
    if (actual.bytes !== streamed.bytes || actual.sha256 !== streamed.sha256 || actual.bytes < 1024) fail('BACKUP_ARCHIVE_INTEGRITY_FAILED');
    const prefix = Buffer.alloc(5);
    const readFd = fs.openSync(archivePartial, 'r');
    try { if (fs.readSync(readFd, prefix, 0, 5, 0) !== 5 || prefix.toString('ascii') !== 'PGDMP') fail('PG_RESTORE_ARCHIVE_FORMAT_INVALID'); }
    finally { fs.closeSync(readFd); }
    const manifest = {
      schema: manifestSchema,
      version: 1,
      project: projectId,
      createdAt: new Date().toISOString(),
      database: 'postgres',
      format: 'pg_dump-custom',
      filename: path.basename(archive),
      bytes: actual.bytes,
      sha256: actual.sha256,
      migrationVersions,
      sha256Purpose: 'accidental-corruption-detection-not-authentication',
    };
    manifestFd = createPrivateFile(manifestPartial);
    fs.writeFileSync(manifestFd, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    fs.fsyncSync(manifestFd);
    fs.closeSync(manifestFd);
    manifestFd = undefined;
    verifyPrivateAcl(archivePartial);
    verifyPrivateAcl(manifestPartial);
    if (fs.existsSync(archive) || fs.existsSync(manifestPath)) fail('BACKUP_DESTINATION_EXISTS');
    fs.renameSync(archivePartial, archive);
    archivePublished = true;
    fs.renameSync(manifestPartial, manifestPath);
    return { archive, manifestPath, bytes: actual.bytes, sha256: actual.sha256 };
  } catch (error) {
    try { child?.kill(); } catch {}
    if (archiveFd !== undefined) try { fs.closeSync(archiveFd); } catch {}
    if (manifestFd !== undefined) try { fs.closeSync(manifestFd); } catch {}
    for (const file of [archivePartial, manifestPartial, ...(archivePublished ? [archive] : [])]) {
      try { fs.unlinkSync(file); } catch {}
    }
    throw error;
  }
}

async function runPersonalBackup() {
  if (process.argv[2] !== 'backup') fail('USAGE: node tools/lifequest-local/backup.cjs backup');
  const { project, target, ports } = personalStackConfig();
  const configFile = path.join(target, 'supabase/config.toml');
  const manifestFile = path.join(target, 'lifequest-migration-manifest.json');
  const remoteRef = path.join(target, 'supabase/.temp/project-ref');
  if (!fs.existsSync(configFile) || !fs.existsSync(manifestFile) || fs.existsSync(remoteRef)) fail('PERSONAL_TARGET_IDENTITY_INVALID');
  assertNoReparse(target);
  const config = fs.readFileSync(configFile, 'utf8');
  if (!config.includes(`project_id = "${project}"`) || !config.includes('schemas = ["public"]')
    || !config.includes(`port = ${ports.api}`) || !config.includes(`port = ${ports.db}`)) fail('PERSONAL_TARGET_CONFIG_MISMATCH');
  const migrationSet = verifyInstalledMigrationPrefix({
    sourceDirectory: path.join(root, 'supabase/migrations'),
    installedDirectory: path.join(target, 'supabase/migrations'),
    manifestPath: manifestFile,
  });
  const expectedVersions = migrationSet.migrationVersions;
  const cli = path.join(root, 'tools/auth2/node_modules/supabase/dist/supabase.js');
  let status;
  try {
    status = JSON.parse(require('node:child_process').execFileSync(process.execPath,
      [cli, 'status', '--output', 'json', '--workdir', target], {
        encoding: 'utf8', env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1' },
        stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000, maxBuffer: 8 * 1024 * 1024,
      }));
  } catch { fail('PERSONAL_STACK_NOT_RUNNING_OR_STATUS_FAILED'); }
  let apiUrl, dbUrl;
  try { apiUrl = new URL(status.API_URL); dbUrl = new URL(status.DB_URL); } catch { fail('PERSONAL_STACK_STATUS_INVALID'); }
  if (apiUrl.hostname !== '127.0.0.1' || apiUrl.port !== String(ports.api)
    || dbUrl.hostname !== '127.0.0.1' || dbUrl.port !== String(ports.db) || dbUrl.pathname !== '/postgres') fail('PERSONAL_STACK_ENDPOINT_MISMATCH');
  let containers;
  try {
    containers = require('node:child_process').execFileSync('docker', ['ps', '--filter', `name=supabase_db_${project}`, '--format', '{{.Names}}'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000,
    }).trim().split(/\r?\n/).filter(Boolean);
  } catch { fail('PERSONAL_DATABASE_CONTAINER_UNAVAILABLE'); }
  if (containers.length !== 1 || containers[0] !== `supabase_db_${project}`) fail('PERSONAL_DATABASE_CONTAINER_AMBIGUOUS');
  const { Client } = require('../auth2/node_modules/pg');
  const client = new Client({ connectionString: status.DB_URL });
  let applied;
  let minimumFreeBytes;
  let databaseBytes;
  try {
    await client.connect();
    try {
      applied = (await client.query('select version from supabase_migrations.schema_migrations order by version')).rows.map(row => row.version);
    } catch { fail('PERSONAL_MIGRATION_HISTORY_UNAVAILABLE'); }
    try { assertAppliedMigrationVersions(applied, expectedVersions); }
    catch { fail('PERSONAL_MIGRATION_HISTORY_MISMATCH'); }
    const sizeResult = await client.query('select pg_database_size(current_database())::text as bytes');
    databaseBytes = Number(sizeResult.rows[0]?.bytes);
  } catch (error) {
    if (error?.code === 'PERSONAL_MIGRATION_HISTORY_MISMATCH') throw error;
    fail(applied === undefined ? 'PERSONAL_MIGRATION_HISTORY_UNAVAILABLE' : 'BACKUP_SIZE_ESTIMATE_UNAVAILABLE');
  } finally { try { await client.end(); } catch {} }
  if (!Number.isSafeInteger(databaseBytes) || databaseBytes < 0) fail('BACKUP_SIZE_ESTIMATE_UNAVAILABLE');
  minimumFreeBytes = Math.ceil(databaseBytes * 1.2 + 64 * 1024 * 1024);
  if (!Number.isSafeInteger(minimumFreeBytes)) fail('BACKUP_SIZE_ESTIMATE_UNAVAILABLE');
  const result = await createBackupFromCommand({
    projectId: project,
    directory: getBackupRoot(),
    command: 'docker',
    // pg_dump ignores --no-owner for custom archives; keep the invocation
    // explicit and let pg_restore apply the archive's recorded ownership.
    args: ['exec', containers[0], 'pg_dump', '-h', '127.0.0.1', '-p', '5432', '-U', 'supabase_admin', '-Fc', 'postgres'],
    migrationVersions: expectedVersions, minFreeBytes: minimumFreeBytes,
  });
  console.log(`PASS PostgreSQL custom backup created: ${path.basename(result.archive)} (${result.bytes} bytes; SHA-256 ${result.sha256}). The archive is unencrypted and contains the full database.`);
}

if (require.main === module) runPersonalBackup().catch(error => {
  console.error(formatBackupError(error?.code));
  process.exitCode = 1;
});

function formatBackupError(code) {
  const messages = {
    PERSONAL_TARGET_IDENTITY_INVALID: 'La cible locale LifeQuest ne correspond pas au projet attendu. Aucune sauvegarde n’a été créée.',
    PERSONAL_TARGET_CONFIG_MISMATCH: 'La configuration locale LifeQuest ne correspond pas aux ports attendus. Aucune sauvegarde n’a été créée.',
    PERSONAL_STACK_NOT_RUNNING_OR_STATUS_FAILED: 'La stack LifeQuest n’est pas démarrée ou son statut est indisponible. Démarrez-la avec Open LifeQuest puis réessayez.',
    PERSONAL_STACK_ENDPOINT_MISMATCH: 'Les endpoints locaux ne correspondent pas à la stack LifeQuest attendue. Aucune sauvegarde n’a été créée.',
    PERSONAL_MIGRATION_HISTORY_UNAVAILABLE: 'L’historique des migrations n’a pas pu être lu. Aucune sauvegarde n’a été créée.',
    PERSONAL_DATABASE_CONTAINER_UNAVAILABLE: 'Le conteneur PostgreSQL exact de LifeQuest est indisponible. Aucune sauvegarde n’a été créée.',
    MIGRATION_SOURCE_SET_CHANGED: 'La liste des migrations a changé ; la sauvegarde est arrêtée pour éviter un état incohérent.',
    MIGRATION_SOURCE_PREFIX_MISMATCH: 'Les migrations installées ne forment pas un préfixe exact du dépôt ; ordre, doublon ou migration manquante détecté. Aucune sauvegarde n’a été créée.',
    MIGRATION_MANIFEST_MISMATCH: 'Les sources de migration ne correspondent pas au manifeste local ; aucune sauvegarde n’a été créée.',
    PERSONAL_MIGRATION_HISTORY_MISMATCH: 'La base ne contient pas exactement les migrations attendues ; aucune sauvegarde n’a été créée.',
    BACKUP_DIRECTORY_OUTSIDE_PRIVATE_ROOT: 'Le dossier de sauvegarde doit rester un dossier privé configuré hors du dépôt et de la cible PostgreSQL.',
    BACKUP_ACL_NOT_PRIVATE: 'Les permissions Windows du dossier ou du fichier ne sont pas assez strictes. Corrigez-les avant de réessayer.',
    WINDOWS_ACL_SET_FAILED: 'Windows n’a pas pu appliquer les permissions privées au fichier de sauvegarde.',
    BACKUP_DISK_SPACE_CHECK_FAILED: 'L’espace libre du disque de sauvegarde n’a pas pu être vérifié.',
    BACKUP_DISK_SPACE_LOW: 'Espace disque insuffisant pour créer la sauvegarde avec une marge de sécurité.',
    BACKUP_SIZE_ESTIMATE_UNAVAILABLE: 'La taille de la base n’a pas pu être estimée ; aucune sauvegarde n’a été créée.',
    BACKUP_INTERRUPTED: 'La sauvegarde a été interrompue ; les fichiers partiels ont été retirés.',
    PG_DUMP_TIMEOUT: 'pg_dump a dépassé le délai maximal ; la sauvegarde partielle a été retirée.',
    PG_DUMP_FAILED: 'pg_dump a échoué ; aucune archive partielle n’a été conservée.',
    BACKUP_ARCHIVE_INTEGRITY_FAILED: 'La taille ou le SHA-256 du fichier produit ne correspond pas au flux pg_dump.',
  };
  return `Échec de la sauvegarde LifeQuest : ${messages[code] || 'une erreur inattendue est survenue.'} (${code || 'BACKUP_FAILED'})`;
}

const exported = { getBackupRoot, manifestSchema, ensurePrivateDirectory, protectPrivateFile, verifyPrivateAcl, createBackupFromCommand, measureFile, availableBytes, requireFreeSpace, expectedPersonalMigrationNames, migrationNamesIn, verifyMigrationCompatibility, verifyInstalledMigrationPrefix, assertAppliedMigrationVersions, knownMigrationCopyDifference, runPersonalBackup, formatBackupError };
Object.defineProperties(exported, {
  backupRoot: { enumerable: true, get: getBackupRoot },
  project: { enumerable: true, get: () => personalStackConfig().project },
});
module.exports = exported;
