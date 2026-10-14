'use strict';
// Pins the reviewed AUTH-3 browser suite to this dedicated AUTH-4E stack.
// It never runs the source suite against its original AUTH-2 target.
const fs = require('node:fs');
const path = require('node:path');

const sourcePath = path.join(__dirname, '../auth2/auth3-browser.cjs');
const destination = path.join(__dirname, 'browser-check.cjs');
if (fs.existsSync(destination)) throw Error('DESTINATION_ALREADY_EXISTS');
let test = fs.readFileSync(sourcePath, 'utf8');
const replacements = [
  ["const {spawn,execFileSync}=require('node:child_process');", "const {spawn}=require('node:child_process');"],
  ["const {Client}=require('pg');const {confirmationLink}=require('./mail-fixture.cjs');", "const {Client}=require('../auth2/node_modules/pg');const {confirmationLink}=require('./mail-fixture.cjs');"],
  ["const root=path.resolve(__dirname,'../..'),out=path.join(__dirname,'.results/auth3-browser');", "const root=path.resolve(__dirname,'../..'),out=path.join(__dirname,'.results/browser');"],
  ["const config=JSON.parse(execFileSync(process.execPath,[path.join(__dirname,'node_modules/supabase/dist/supabase.js'),'status','--workdir',root,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));", "const config=require('./stack.cjs').status();"],
  ["if(db){if(users.length)await db.query('delete from auth.users where id=any($1::uuid[])',[users]);await db.end()}", "if(db)await db.end()"],
];
for (const [from, to] of replacements) {
  if (!test.includes(from)) throw Error('EXPECTED_SOURCE_PATTERN_MISSING');
  test = test.replace(from, to);
}
if (test.includes('../auth2/node_modules/supabase') || test.includes('delete from auth.users')) throw Error('UNSAFE_TARGET_OR_FIXTURE_CLEANUP_REMAINS');
test = test.replace("const base=process.env.LIFEQUEST_TEST_URL||'http://127.0.0.1:3102';assert.equal(new URL(base).hostname,'127.0.0.1');", "const base=process.env.LIFEQUEST_TEST_URL||'http://127.0.0.1:31646';assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).port,'31646');");
const staleWait = 'document.body.textContent.includes("Progression Hunter en préparation")';
if (!test.includes(staleWait)) throw Error('EXPECTED_AUTH3_WAITING_ASSERTION_MISSING');
test = test.replaceAll(staleWait, '(document.body.textContent.includes("Progression Hunter en préparation")||document.body.textContent.includes("Progression Hunter en attente"))');
test = test.replaceAll('auth3-browser', 'auth4e-browser');
const networkStart = "await c.call('Network.enable');await c.setFailure(true);";
const networkEnd = "await navigate(c,'/forgot-password')";
const networkStartAt = test.indexOf(networkStart);
const networkEndAt = test.indexOf(networkEnd, networkStartAt);
if (networkStartAt < 0 || networkEndAt < 0 || test.indexOf(networkStart, networkStartAt + 1) >= 0) throw Error('EXPECTED_SINGLE_NETWORK_REVALIDATION_BLOCK');
const pendingNetworkCheck = "await c.call('Network.enable');await c.setFailure(true);const failedBootstrap=await c.evalJS('fetch(\"/api/auth/bootstrap\",{cache:\"no-store\"}).then(r=>r.status).catch(()=>0)');assert.equal(failedBootstrap,0);assert.ok(await c.evalJS('document.body.textContent.includes(\"Progression Hunter en attente\")'));await c.setFailure(false);pass('auth bootstrap network failure preserves setup_pending and never reveals local gameplay');";
test = test.slice(0, networkStartAt) + pendingNetworkCheck + test.slice(networkEndAt);
fs.writeFileSync(destination, test, { encoding: 'utf8', flag: 'wx' });
console.log('PASS generated browser suite pinned to local AUTH-4E; generated fictional users are retained');
