'use strict';
// Build only the isolated frontend copy, with credentials held in this process.
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const path = require('node:path');
const stack = require('./stack.cjs');

async function main() {
  if (stack.project !== 'lifequest-ui-visual-20261014') throw Error('AUTHORIZED_STACK_ONLY');
  const port = Number(process.env.UI_VISUAL_NEXT_PORT || 31780);
  if (![31780, 31781].includes(port)) throw Error('UNAPPROVED_PREVIEW_PORT');
  const cfg = stack.status();
  const api = new URL(cfg.API_URL);
  if (api.hostname !== '127.0.0.1' || api.port !== '64921') throw Error('LOCAL_API_ONLY');
  const key = cfg.PUBLISHABLE_KEY || cfg.ANON_KEY;
  if (!key) throw Error('PUBLIC_KEY_REQUIRED');
  const env = {
    ...process.env,
    APP_ORIGIN: `http://127.0.0.1:${port}`,
    AUTH_RECOVERY_SECRET: randomBytes(48).toString('base64url'),
    NEXT_PUBLIC_SUPABASE_URL: api.origin,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
  };
  const result = spawnSync(process.execPath, [path.join(stack.testFrontend, 'node_modules/next/dist/bin/next'), 'build', '--webpack'], {
    cwd: stack.testFrontend,
    env,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    const diagnostic = String(result.stderr || result.stdout || result.error || '')
      .replace(/eyJ[A-Za-z0-9._-]{20,}/g, '[credential-redacted]')
      .replace(/https?:\/\/\S+/gi, '[url-redacted]')
      .slice(-6000);
    console.error('FAIL isolated Dashboard production build\n' + diagnostic);
    process.exitCode = result.status || 1;
    return;
  }
  console.log('PASS production webpack build for the isolated visual-test frontend; target API 127.0.0.1:64921; credentials withheld');
}

main().catch(error => {
  console.error('FAIL isolated Dashboard production build ' + (error.code || error.message));
  process.exitCode = 1;
});
