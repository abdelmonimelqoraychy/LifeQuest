'use strict';
// Ephemeral AUTH-4E integration server. Secrets/keys stay in process memory.
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const stack = require('./stack.cjs');

const project = 'lifequest-auth4e-r2-retry-20261013';
const port = 31666;
const frontend = path.join(stack.root, 'frontend');
const nextCli = path.join(frontend, 'node_modules/next/dist/bin/next');
let child;
let stopping = false;

async function stop() {
  if (stopping) return;
  stopping = true;
  if (child && child.exitCode === null) child.kill();
  if (child) await new Promise(resolve => child.once('exit', resolve));
}

async function main() {
  if (stack.project !== project) throw Error('AUTHORIZED_STACK_ONLY');
  const cfg = stack.status();
  const api = new URL(cfg.API_URL);
  if (api.hostname !== '127.0.0.1' || api.port !== '56621') throw Error('LOCAL_AUTH4E_R2_API_ONLY');
  const publishable = cfg.PUBLISHABLE_KEY || cfg.ANON_KEY;
  if (typeof publishable !== 'string' || !publishable.startsWith('sb_publishable_')) throw Error('PUBLISHABLE_KEY_REQUIRED');
  const env = {
    ...process.env,
    APP_ORIGIN: `http://127.0.0.1:${port}`,
    AUTH_RECOVERY_SECRET: randomBytes(48).toString('base64url'),
    NEXT_PUBLIC_SUPABASE_URL: api.origin,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishable,
  };
  child = spawn(process.execPath, [nextCli, 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: frontend,
    env,
    windowsHide: true,
    stdio: 'ignore',
  });
  child.on('exit', code => {
    if (!stopping) {
      console.error('FAIL Next test server exited ' + code);
      process.exitCode = 1;
    }
  });

  let ready = false;
  for (let attempt = 0; attempt < 240; attempt++) {
    if (child.exitCode !== null) throw Error('NEXT_SERVER_EXITED');
    try {
      const response = await fetch(`http://127.0.0.1:${port}/register`, { signal: AbortSignal.timeout(1000) });
      if (response.status === 200 && (await response.text()).includes('Créer mon compte')) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) throw Error('NEXT_SERVER_NOT_READY');
  console.log(`PASS Next test server ready at http://127.0.0.1:${port}; AUTH API remains ${api.origin}; key withheld`);
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (chunk.trim() === 'stop') void stop();
  });
  await new Promise(resolve => {
    const interval = setInterval(() => {
      if (stopping || child.exitCode !== null) {
        clearInterval(interval);
        resolve();
      }
    }, 250);
  });
}

main().catch(async error => {
  console.error('FAIL Next test server ' + (error.code || error.message));
  await stop();
  process.exitCode = 1;
});
