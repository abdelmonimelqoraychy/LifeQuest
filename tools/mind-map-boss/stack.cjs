'use strict';
// Fixed, independent, fictional target for Mind Map -> Boss validation.
// This tool has no reset or volume deletion action.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '../..');
const project = 'lifequest-mind-map-boss-v1-20261018';
const target = `C:/Users/hp/myproject/${project}`;
const ports = { shadow: 65020, api: 65021, db: 65022, mail: 65024 };
const docker = 'C:/Users/hp/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe';
const supabase = path.join(root, 'tools/auth2/node_modules/supabase/dist/supabase.js');
const manifestPath = path.join(target, 'mind-map-boss-migrations.json');
const env = {
  ...process.env,
  DO_NOT_TRACK: '1',
  SUPABASE_TELEMETRY_DISABLED: '1',
  PATH: `C:/Users/hp/AppData/Local/Programs/DockerDesktop/resources/bin${path.delimiter}${process.env.PATH || ''}`,
};

function safeError(stdout, stderr) {
  const raw = `${stdout}\n${stderr}`;
  if (/npipe|docker api|permission denied/i.test(raw)) return 'DOCKER_ACCESS';
  if (/address already in use|port.+(use|allocated)/i.test(raw)) return 'PORT_IN_USE';
  if (/pull|download|network/i.test(raw)) return 'IMAGE_OR_NETWORK';
  return 'LOCAL_STACK_COMMAND';
}

function runSupabase(args) {
  try {
    return execFileSync(process.execPath, [supabase, ...args, '--workdir', target], {
      encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000,
    });
  } catch (error) {
    throw Object.assign(new Error(safeError(String(error.stdout || ''), String(error.stderr || ''))), { code: safeError(String(error.stdout || ''), String(error.stderr || '')) });
  }
}

function dockerCall(args) {
  return execFileSync(docker, args, { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 }).trim();
}

function sourceMigrations() {
  const directory = path.join(root, 'supabase/migrations');
  return fs.readdirSync(directory).filter(name => name.endsWith('.sql')).sort();
}

function sha256(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function verifyTarget() {
  if (!fs.existsSync(path.join(target, 'supabase/config.toml'))) throw new Error('TARGET_NOT_PREPARED');
  const config = fs.readFileSync(path.join(target, 'supabase/config.toml'), 'utf8');
  if (!config.includes(`project_id = "${project}"`)
    || !config.includes(`port = ${ports.api}`)
    || !config.includes(`port = ${ports.db}`)
    || !config.includes(`port = ${ports.mail}`)
    || !config.includes('schemas = ["public"]')) throw new Error('WRONG_LOCAL_TARGET');
  if (fs.existsSync(path.join(target, 'supabase/.temp/project-ref'))) throw new Error('REMOTE_LINK_FORBIDDEN');

  const names = sourceMigrations();
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!Array.isArray(manifest) || manifest.length < 29 || manifest.length > names.length) throw new Error('MIGRATION_MANIFEST_MISMATCH');
  for (let index = 0; index < manifest.length; index += 1) {
    const entry = manifest[index];
    const source = path.join(root, 'supabase/migrations', names[index]);
    const copy = path.join(target, 'supabase/migrations', names[index]);
    const expected = sha256(source);
    if (!entry || entry.name !== names[index] || entry.sha256 !== expected || !fs.existsSync(copy) || sha256(copy) !== expected) {
      throw new Error('MIGRATION_SOURCE_DRIFT');
    }
  }
  const targetNames = fs.readdirSync(path.join(target, 'supabase/migrations')).filter(name => name.endsWith('.sql')).sort();
  if (targetNames.length !== manifest.length || targetNames.some((name, index) => name !== manifest[index].name)) throw new Error('MIGRATION_SET_MISMATCH');
}

function checkExactResourcesAbsent() {
  const containers = dockerCall(['ps', '-a', '--filter', `name=${project}`, '--format', '{{.Names}}']);
  const volumes = dockerCall(['volume', 'ls', '--filter', `name=${project}`, '--format', '{{.Name}}']);
  const networks = dockerCall(['network', 'ls', '--filter', `name=${project}`, '--format', '{{.Name}}']);
  if (containers || volumes || networks) throw new Error('TARGET_RESOURCES_ALREADY_EXIST');
}

function portOpen(port) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

async function prepare() {
  if (fs.existsSync(target)) throw new Error('NEW_TARGET_DIRECTORY_REQUIRED');
  for (const port of Object.values(ports)) if (await portOpen(port)) throw new Error('TARGET_PORT_IN_USE');
  if (!fs.existsSync(docker) || !fs.existsSync(supabase)) throw new Error('LOCAL_TOOLS_MISSING');
  const engine = dockerCall(['version', '--format', '{{.Server.Os}}/{{.Server.Version}}']);
  if (!engine.startsWith('linux/')) throw new Error('DOCKER_LINUX_ENGINE_REQUIRED');
  checkExactResourcesAbsent();

  const names = sourceMigrations();
  if (names.length !== 31 || names.at(-1) !== '20261018003100_mind_map_boss_source_insert_grant.sql') throw new Error('SOURCE_MIGRATION_SCOPE_MISMATCH');
  const migrationDir = path.join(target, 'supabase/migrations');
  fs.mkdirSync(migrationDir, { recursive: true });
  fs.cpSync(path.join(root, 'supabase/templates'), path.join(target, 'supabase/templates'), { recursive: true });
  const original = fs.readFileSync(path.join(root, 'supabase/config.toml'), 'utf8');
  let config = original.replace(/^project_id = "[^"]+"$/m, `project_id = "${project}"`)
    .replace('schemas = ["public", "auth2_proof"]', 'schemas = ["public"]')
    .replace(/^port = 54321$/m, `port = ${ports.api}`)
    .replace(/^port = 54322$/m, `port = ${ports.db}`)
    .replace(/^port = 54324$/m, `port = ${ports.mail}`)
    .replace(/^shadow_port = 54320$/m, `shadow_port = ${ports.shadow}`);
  if (config === original || !config.includes(`project_id = "${project}"`) || config.includes('auth2_proof')) throw new Error('CONFIG_ISOLATION_FAILED');
  fs.writeFileSync(path.join(target, 'supabase/config.toml'), config, { flag: 'wx' });
  const manifest = [];
  for (const name of names) {
    const source = path.join(root, 'supabase/migrations', name);
    const destination = path.join(migrationDir, name);
    fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
    manifest.push({ name, sha256: sha256(source) });
  }
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  verifyTarget();
  console.log(`PASS prepared ${project}; 29 migrations copied and hash-verified; no existing target resources reused`);
}

function status() {
  verifyTarget();
  const config = JSON.parse(runSupabase(['status', '--output', 'json']));
  for (const [key, port] of [['API_URL', ports.api], ['DB_URL', ports.db]]) {
    const url = new URL(config[key]);
    if (url.hostname !== '127.0.0.1' || url.port !== String(port)) throw new Error('WRONG_SERVICE_ENDPOINT');
  }
  return config;
}

async function appliedVersions() {
  const cfg = status();
  const { Client } = require('../auth2/node_modules/pg');
  const url = new URL(cfg.DB_URL);
  url.username = 'supabase_admin';
  const client = new Client({ connectionString: url.href, connectionTimeoutMillis: 5000, query_timeout: 10000 });
  await client.connect();
  try {
    return (await client.query('select version from supabase_migrations.schema_migrations order by version')).rows.map(row => row.version);
  } finally { await client.end(); }
}

async function ensureMigrations() {
  verifyTarget();
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const expected = manifest.map(entry => entry.name.slice(0, 14));
  let actual = await appliedVersions();
  if (actual.length === 0) {
    runSupabase(['migration', 'up', '--local']);
    actual = await appliedVersions();
  }
  if (actual.length !== expected.length || actual.some((version, index) => version !== expected[index])) throw new Error('MIGRATION_HISTORY_MISMATCH');
  return actual;
}

async function appendLatestMigration() {
  verifyTarget();
  const names = sourceMigrations();
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (names.length !== 31 || manifest.length !== names.length - 1 || names.at(-1) !== '20261018003100_mind_map_boss_source_insert_grant.sql') throw new Error('APPEND_MIGRATION_SCOPE_MISMATCH');
  const before = await appliedVersions();
  const expectedBefore = names.slice(0, -1).map(name => name.slice(0, 14));
  if (before.length !== expectedBefore.length || before.some((version, index) => version !== expectedBefore[index])) throw new Error('PRE_APPEND_HISTORY_MISMATCH');
  const name = names.at(-1);
  const source = path.join(root, 'supabase/migrations', name);
  const destination = path.join(target, 'supabase/migrations', name);
  if (fs.existsSync(destination)) throw new Error('MIGRATION_ALREADY_COPIED');
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
  manifest.push({ name, sha256: sha256(source) });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  verifyTarget();
  runSupabase(['migration', 'up', '--local']);
  const after = await appliedVersions();
  const expectedAfter = names.map(item => item.slice(0, 14));
  if (after.length !== expectedAfter.length || after.some((version, index) => version !== expectedAfter[index])) throw new Error('APPENDED_HISTORY_MISMATCH');
  console.log(`PASS appended only ${name}; ${expectedBefore.length} earlier migrations and existing fictional data preserved`);
}

if (require.main === module) {
  (async () => {
    const action = process.argv[2];
    if (action === 'prepare') await prepare();
    else if (action === 'start') {
      verifyTarget();
      runSupabase(['start']);
      status();
      console.log(`PASS started ${project}; credentials withheld`);
    } else if (action === 'status') {
      status();
      const versions = await appliedVersions();
      console.log(`PASS ${project}; API=${ports.api} DB=${ports.db}; migrations=${versions.length}; credentials withheld`);
    } else if (action === 'migrate') {
      const versions = await ensureMigrations();
      console.log(`PASS migration history ${versions.length}; no reset or prior migration replay`);
    } else if (action === 'append-latest') {
      await appendLatestMigration();
    } else if (action === 'stop') {
      verifyTarget();
      runSupabase(['stop']);
      console.log(`PASS stopped ${project}; volumes retained`);
    } else throw new Error('ACTION_REQUIRED');
  })().catch(error => { console.error(`FAIL ${error.code || error.message || 'STACK_CHECK'}`); process.exitCode = 1; });
}

module.exports = { root, project, target, ports, env, status, verifyTarget, appliedVersions, ensureMigrations, appendLatestMigration, dockerCall, runSupabase };
