'use strict';
// Dedicated fictional AUTH-4E stack. It never targets a previous stack or Cloud.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const project = 'lifequest-auth4e-frontend-20261013';
const target = 'C:/Users/hp/myproject/' + project;
const ports = { api: 64621, db: 64622, mail: 64624, shadow: 64620 };
const env = { ...process.env, DO_NOT_TRACK: '1', SUPABASE_TELEMETRY_DISABLED: '1', PATH: 'C:/Users/hp/AppData/Local/Programs/DockerDesktop/resources/bin' + path.delimiter + process.env.PATH };
const cli = path.join(root, 'tools/auth2/node_modules/supabase/dist/supabase.js');
function run(args) {
  try { return execFileSync(process.execPath, [cli, ...args, '--workdir', target], { encoding: 'utf8', env, stdio: ['ignore','pipe','pipe'], timeout: 240000 }); }
  catch (error) { const raw = String(error.stdout || '') + '\n' + String(error.stderr || ''); const code = /npipe|docker api|permission denied/i.test(raw) ? 'DOCKER_ACCESS' : /address already in use|port.+(use|allocated)/i.test(raw) ? 'PORT_IN_USE' : /pull|download|network/i.test(raw) ? 'IMAGE_OR_NETWORK' : 'SUPABASE_LOCAL_COMMAND'; throw Object.assign(new Error(code), { code }); }
}
function verify() {
  const config = fs.readFileSync(path.join(target, 'supabase/config.toml'), 'utf8');
  if (!config.includes(`project_id = "${project}"`) || !config.includes(`port = ${ports.db}`) || !config.includes('schemas = ["public"]')) throw Error('WRONG_LOCAL_STACK');
  if (fs.existsSync(path.join(target, 'supabase/.temp/project-ref'))) throw Error('REMOTE_LINK_FORBIDDEN');
}
function status() {
  verify(); const cfg = JSON.parse(run(['status', '--output', 'json']));
  for (const key of ['API_URL','DB_URL']) { const url = new URL(cfg[key]); if (url.hostname !== '127.0.0.1' || url.port !== String(key === 'DB_URL' ? ports.db : ports.api)) throw Error('WRONG_ENDPOINT'); }
  return cfg;
}
function databaseContainer() {
  verify();
  const names = execFileSync('docker', ['ps','--format','{{.Names}}'], { encoding:'utf8', env, stdio:['ignore','pipe','pipe'] }).trim().split(/\r?\n/);
  const matching = [];
  for (const name of names.filter(n => n.startsWith('supabase_db_'))) {
    const bindings = JSON.parse(execFileSync('docker',['inspect',name,'--format','{{json .NetworkSettings.Ports}}'],{encoding:'utf8',env,stdio:['ignore','pipe','pipe']}));
    if ((bindings?.['5432/tcp'] || []).some(binding => binding.HostPort === String(ports.db))) matching.push(name);
  }
  if (matching.length !== 1) throw Error('LOCAL_DATABASE_CONTAINER_NOT_UNIQUE');
  return matching[0];
}
function prepare() {
  if (fs.existsSync(target)) throw Error('NEW_DIRECTORY_REQUIRED');
  fs.mkdirSync(path.join(target, 'supabase/migrations'), { recursive: true });
  fs.cpSync(path.join(root, 'supabase/templates'), path.join(target, 'supabase/templates'), { recursive: true });
  const config = fs.readFileSync(path.join(root, 'supabase/config.toml'), 'utf8')
    .replace('project_id = "lifequest-auth2"', `project_id = "${project}"`)
    .replace('schemas = ["public", "auth2_proof"]', 'schemas = ["public"]')
    .replaceAll('54321', String(ports.api)).replaceAll('54322', String(ports.db)).replaceAll('54324', String(ports.mail)).replaceAll('54320', String(ports.shadow));
  fs.writeFileSync(path.join(target, 'supabase/config.toml'), config);
  const names = fs.readdirSync(path.join(root, 'supabase/migrations')).filter(name => name.endsWith('.sql')).sort();
  if (names.length !== 23) throw Error('WRONG_MIGRATION_SCOPE');
  for (const name of names) fs.copyFileSync(path.join(root, 'supabase/migrations', name), path.join(target, 'supabase/migrations', name));
  console.log(`PASS prepared ${project}; ports ${ports.api}/${ports.db}/${ports.mail}; 23 source migrations copied`);
}
if (require.main === module) {
  try {
    const action = process.argv[2];
    if (action === 'prepare') prepare();
    else if (action === 'start' || action === 'stop') { verify(); run([action]); console.log(`PASS ${action}; credentials withheld, volumes preserved`); }
    else if (action === 'migrate') { verify(); run(['migration','up','--local']); console.log('PASS local migrations applied; credentials withheld'); }
    else if (action === 'status') { const s = status(); console.log(`PASS ${project} API ${new URL(s.API_URL).origin}; DB localhost:${ports.db}; no credentials printed`); }
    else throw Error('ACTION_REQUIRED');
  } catch (error) { console.error('FAIL local operation ' + (error.code || 'CHECK_FAILED')); process.exitCode = 1; }
}
module.exports = { root, project, target, ports, env, status, verify, databaseContainer };
