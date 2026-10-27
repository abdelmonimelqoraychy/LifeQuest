'use strict';

// Pure filesystem fixtures. This test never reads a database or starts Docker.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const backup = require('./plain-backup.cjs');
const restore = require('./plain-restore.cjs');
const localStack = require('./stack.cjs');

const repoRoot = path.resolve(__dirname, '../..');
const sourceDirectory = path.join(repoRoot, 'supabase/migrations');
const names = backup.expectedPersonalMigrationNames(sourceDirectory);
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lifequest-migration-preflight-'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
let checks = 0;

function assert(condition, message) { if (!condition) throw new Error(message); checks++; }
function makeFixture(label, { count = names.length, edit } = {}) {
  const root = path.join(tempRoot, label);
  const source = path.join(root, 'source');
  const installed = path.join(root, 'installed');
  fs.mkdirSync(source, { recursive: true });
  fs.mkdirSync(installed, { recursive: true });
  const entries = [];
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const sourceBytes = fs.readFileSync(path.join(sourceDirectory, name));
    fs.writeFileSync(path.join(source, name), sourceBytes);
    if (i >= count) continue;
    const installedBytes = name === backup.knownMigrationCopyDifference.name
      ? Buffer.concat([sourceBytes, Buffer.from([0x0a])]) : Buffer.from(sourceBytes);
    fs.writeFileSync(path.join(installed, name), installedBytes);
    entries.push({ name, sha256: hash(installedBytes) });
  }
  const manifest = path.join(root, 'manifest.json');
  const value = { root, source, installed, manifest, entries };
  edit?.(value);
  fs.writeFileSync(manifest, JSON.stringify(entries), 'utf8');
  return value;
}
function accepted(label, fixture, count) {
  const result = backup.verifyInstalledMigrationPrefix({
    sourceDirectory: fixture.source, installedDirectory: fixture.installed, manifestPath: fixture.manifest,
  });
  assert(result.sourceNames.length === names.length && result.installedNames.length === count
    && result.migrationVersions.length === count, `${label}: source/installed/history dimensions differ`);
  assert(JSON.stringify(result.installedNames) === JSON.stringify(names.slice(0, count)),
    `${label}: installed files must match the exact ordered source prefix`);
  assert(JSON.stringify(result.migrationVersions) === JSON.stringify(names.slice(0, count).map(name => name.slice(0, 14))),
    `${label}: installed versions must match that prefix exactly`);
}
function rejected(label, fixture, code) {
  let didReject = false;
  try {
    backup.verifyInstalledMigrationPrefix({
      sourceDirectory: fixture.source, installedDirectory: fixture.installed, manifestPath: fixture.manifest,
    });
  } catch (error) { didReject = error.code === code; }
  assert(didReject, `${label}: expected ${code}`);
}

try {
  assert(names.length === 32 && names[27].startsWith('20261015002800')
    && names[28].startsWith('20261018002900') && names[29].startsWith('20261018003000')
    && names[30].startsWith('20261018003100') && names[31].startsWith('20261019003200'),
  'current source set must contain the exact ordered migrations 001–032');
  accepted('current source with installed 28 prefix', makeFixture('positive-28', { count: 28 }), 28);
  const personal31 = makeFixture('positive-personal-31', { count: 31 });
  accepted('current source 32 and personal installed prefix 31', personal31, 31);
  const installed31Names = backup.verifyInstalledMigrationPrefix({
    sourceDirectory: personal31.source, installedDirectory: personal31.installed, manifestPath: personal31.manifest,
  }).installedNames;
  assert(!installed31Names.some(name => name.startsWith('20261019003200_')),
    'migration 032 must remain outside the personal installed directory before activation');
  accepted('current source and installed 32', makeFixture('positive-32', { count: 32 }), 32);

  rejected('029 absent while 030 exists', makeFixture('negative-gap', { count: 28, edit(fixture) {
    const name = names[29];
    const bytes = fs.readFileSync(path.join(fixture.source, name));
    fs.writeFileSync(path.join(fixture.installed, name), bytes);
    fixture.entries.push({ name, sha256: hash(bytes) });
  } }), 'MIGRATION_SOURCE_PREFIX_MISMATCH');

  rejected('manifest is incomplete', makeFixture('negative-manifest-short', { count: 28, edit(fixture) {
    fixture.entries.pop();
  } }), 'MIGRATION_SOURCE_PREFIX_MISMATCH');

  rejected('manifest digest is incorrect', makeFixture('negative-manifest-digest', { count: 28, edit(fixture) {
    fixture.entries[0].sha256 = '0'.repeat(64);
  } }), 'MIGRATION_MANIFEST_MISMATCH');

  rejected('installed bytes changed even with matching manifest digest', makeFixture('negative-installed-altered', { count: 28, edit(fixture) {
    const file = path.join(fixture.installed, names[27]);
    const bytes = fs.readFileSync(file); bytes[100] ^= 1; fs.writeFileSync(file, bytes);
    fixture.entries[27].sha256 = hash(bytes);
  } }), 'MIGRATION_MANIFEST_MISMATCH');

  rejected('only the pinned AUTH-5 final LF is accepted', makeFixture('negative-auth5-extra-lf', { count: 28, edit(fixture) {
    const file = path.join(fixture.installed, backup.knownMigrationCopyDifference.name);
    const bytes = Buffer.concat([fs.readFileSync(file), Buffer.from([0x0a])]); fs.writeFileSync(file, bytes);
    fixture.entries.find(entry => entry.name === backup.knownMigrationCopyDifference.name).sha256 = hash(bytes);
  } }), 'MIGRATION_MANIFEST_MISMATCH');

  const versions28 = names.slice(0, 28).map(name => name.slice(0, 14));
  const versions31 = names.slice(0, 31).map(name => name.slice(0, 14));
  const versions32 = names.map(name => name.slice(0, 14));
  assert(backup.assertAppliedMigrationVersions(versions28, versions28), '28-entry SQL history matches its installed prefix');
  assert(backup.assertAppliedMigrationVersions(versions31, versions31), '31-entry SQL history matches the personal installed prefix');
  assert(!versions31.includes('20261019003200'), 'migration 032 is absent from the expected personal SQL history');
  assert(backup.assertAppliedMigrationVersions(versions32, versions32), '32-entry SQL history remains valid when all files are installed');
  for (const [wrong, installed] of [
    [versions32, versions31], // 032 is in SQL history but absent from installed files.
    [versions31.slice(0, 30), versions31],
    [versions28, versions31],
    [versions28.slice(0, 27), versions28],
    [[...versions28].reverse(), versions28],
  ]) {
    let rejectedHistory = false;
    try { backup.assertAppliedMigrationVersions(wrong, installed); }
    catch (error) { rejectedHistory = error.code === 'MIGRATION_HISTORY_MISMATCH'; }
    assert(rejectedHistory, 'SQL history that differs from installed files, including applied 032, must be refused');
  }

  const wrongProject = path.join(tempRoot, localStack.project);
  let wrongTargetRejected = false;
  try { restore.assertIndependentTarget({ targetWorkdir: wrongProject, targetProjectId: path.basename(wrongProject), allowSyntheticTempTarget: true }); }
  catch (error) { wrongTargetRejected = error.code === 'RESTORE_TARGET_NOT_INDEPENDENT'; }
  assert(wrongTargetRejected, 'personal project identity must never qualify as an independent restore target');

  const privateRoot = path.dirname(localStack.target);
  const expectedBackupDirectory = path.join(privateRoot, 'lifequest-private-backups');
  assert(backup.project === localStack.project, 'backup project identity comes from the existing local stack configuration');
  assert(backup.getBackupRoot({}) === expectedBackupDirectory, 'default backup location preserves the configured private sibling directory');
  const configuredBackupDirectory = path.join(privateRoot, 'lifequest-private-backups-test');
  assert(backup.getBackupRoot({ LIFEQUEST_BACKUP_DIR: configuredBackupDirectory }) === configuredBackupDirectory,
    'existing LIFEQUEST_BACKUP_DIR setting accepts a private sibling directory');
  let outsideBackupDirectoryRejected = false;
  try { backup.getBackupRoot({ LIFEQUEST_BACKUP_DIR: tempRoot }); }
  catch (error) { outsideBackupDirectoryRejected = error.code === 'BACKUP_DIRECTORY_OUTSIDE_PRIVATE_ROOT'; }
  assert(outsideBackupDirectoryRejected, 'backup directory outside the private sibling location is rejected');
  let relativeBackupDirectoryRejected = false;
  try { backup.getBackupRoot({ LIFEQUEST_BACKUP_DIR: 'relative-backup-folder' }); }
  catch (error) { relativeBackupDirectoryRejected = error.code === 'BACKUP_DIRECTORY_OUTSIDE_PRIVATE_ROOT'; }
  assert(relativeBackupDirectoryRejected, 'relative backup directory configuration is rejected');
  let stackDirectoryRejected = false;
  try { backup.getBackupRoot({ LIFEQUEST_BACKUP_DIR: localStack.target }); }
  catch (error) { stackDirectoryRejected = error.code === 'BACKUP_DIRECTORY_OUTSIDE_PRIVATE_ROOT'; }
  assert(stackDirectoryRejected, 'the PostgreSQL project directory cannot be used as the backup directory');

  process.stdout.write(`PASS migration preflight: ${checks} assertions; source=32, exact installed prefixes=28/31/32, personal prefix excludes 032, strict hashes/history, AUTH-5 pinned LF, local backup settings preserved, personal restore target refused\n`);
} finally {
  const resolvedTemp = path.resolve(tempRoot);
  if (!path.basename(resolvedTemp).startsWith('lifequest-migration-preflight-')
    || !resolvedTemp.startsWith(path.resolve(os.tmpdir()) + path.sep)) {
    throw new Error('Refusing to remove unexpected temporary test path');
  }
  fs.rmSync(resolvedTemp, { recursive: true, force: true });
}
