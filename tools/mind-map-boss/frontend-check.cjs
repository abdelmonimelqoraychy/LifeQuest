'use strict';
// Isolated frontend copy: never reads .env files or shares the project's .next output.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const stack = require('./stack.cjs');

const source = path.join(stack.root, 'frontend');
const targetRoot = 'C:/Users/hp/myproject/lifequest-mind-map-boss-frontend-check-20261018-f';
const target = path.join(targetRoot, 'frontend');

function copyFrontend() {
  if (fs.existsSync(targetRoot)) throw new Error('ISOLATED_FRONTEND_TARGET_EXISTS');
  fs.mkdirSync(path.join(targetRoot, 'supabase', 'migrations'), { recursive: true });
  for (const name of fs.readdirSync(path.join(stack.root, 'supabase/migrations')).filter(name => name.endsWith('.sql'))) {
    fs.copyFileSync(path.join(stack.root, 'supabase/migrations', name), path.join(targetRoot, 'supabase/migrations', name));
  }
  fs.cpSync(source, target, { recursive: true, filter: file => {
    const name = path.basename(file);
    return name !== '.next' && name !== 'node_modules' && name !== '.git' && name !== '.results' && name !== '.browser-check'
      && name !== '.env' && !name.startsWith('.env.');
  } });
  fs.symlinkSync(path.join(source, 'node_modules'), path.join(target, 'node_modules'), 'junction');
  if (fs.existsSync(path.join(target, '.env.local')) || fs.existsSync(path.join(target, '.next'))) throw new Error('ISOLATED_FRONTEND_COPY_NOT_CLEAN');
  console.log('PASS isolated frontend copied without .env files, .next, generated results, or local credentials');
}

function command(args, env) {
  const npmCli = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  const result = spawnSync(process.execPath, [npmCli, ...args], { cwd: target, env, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    const output = `${result.stdout || ''}\n${result.stderr || ''}`.replace(/https?:\/\/[^\s]+/gi, '[url]').slice(-7000);
    console.error(`FAIL ${args.join(' ')}\n${output}`);
    throw new Error(`FRONTEND_COMMAND_FAILED_${args[1] || args[0]}`);
  }
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  console.log(`PASS ${args.slice(1).join(' ')}${/tests\s+\d+|pass\s+\d+/i.test(output) ? ` (${(output.match(/# pass (\d+)/i) || [])[1] || 'completed'} tests)` : ''}`);
}

async function main() {
  if (!fs.existsSync(targetRoot)) copyFrontend();
  else throw new Error('ISOLATED_FRONTEND_TARGET_EXISTS');
  const cfg = stack.status();
  const api = new URL(cfg.API_URL);
  if (api.hostname !== '127.0.0.1' || api.port !== String(stack.ports.api)) throw new Error('FRONTEND_BUILD_WRONG_API');
  const key = cfg.PUBLISHABLE_KEY || cfg.ANON_KEY;
  if (!key) throw new Error('FRONTEND_PUBLIC_KEY_MISSING');
  const env = {
    ...process.env,
    APP_ORIGIN: 'http://127.0.0.1:31791',
    AUTH_RECOVERY_SECRET: randomBytes(48).toString('base64url'),
    NEXT_PUBLIC_SUPABASE_URL: api.origin,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
  };
  command(['run', 'typecheck'], env);
  command(['run', 'lint'], env);
  command(['run', 'test'], env);
  command(['run', 'build', '--', '--webpack'], env);
  console.log('PASS isolated production build targets only the fictional local API; .next is confined to the isolated copy');
}

main().catch(error => { console.error(`FAIL isolated frontend validation ${error.code || error.message || 'CHECK_FAILED'}`); process.exitCode = 1; });
