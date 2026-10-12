'use strict';
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { randomUUID, randomBytes } = require('node:crypto');
const path = require('node:path');
const { Client } = require('pg');
const { confirmationLink } = require('./mail-fixture.cjs');
const base = process.env.LIFEQUEST_TEST_URL || 'http://127.0.0.1:3102';
assert.equal(new URL(base).hostname, '127.0.0.1');
const users = []; const results = []; let db;
function pass(label) { results.push(label); console.log('PASS ' + label); }
class Browser {
  constructor() { this.jar = new Map(); }
  async request(route, body, extra = {}) {
    const headers = { cookie: [...this.jar].map(([k,v])=>k+'='+v).join('; '), ...extra };
    if (body !== undefined) { headers.origin = headers.origin || base; headers['Content-Type'] = 'application/json'; }
    const response = await fetch(base+route, { headers, method: body === undefined ? 'GET' : 'POST', body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    for (const cookie of response.headers.getSetCookie()) { const first = cookie.split(';')[0]; const eq = first.indexOf('='); const name = first.slice(0,eq),value=first.slice(eq+1); if(value)this.jar.set(name,value);else this.jar.delete(name); }
    return response;
  }
}
async function run() {
  const root = path.resolve(__dirname,'../..');
  const config = JSON.parse(execFileSync(process.execPath,[path.join(__dirname,'node_modules/supabase/dist/supabase.js'),'status','--workdir',root,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  assert.equal(new URL(config.DB_URL).hostname,'127.0.0.1'); db = new Client({connectionString:config.DB_URL}); await db.connect();
  const a=new Browser(), b=new Browser(); const password=randomBytes(24).toString('hex'); const nextPassword=randomBytes(24).toString('hex');
  const email='auth3-a-'+randomUUID()+'@example.test';
  const body={email,password,confirmPassword:password};
  assert.equal((await a.request('/api/auth/register',{...body,password:'short',confirmPassword:'short'})).status,400);
  assert.equal((await a.request('/api/auth/login',body,{origin:'https://attacker.test'})).status,403);
  pass('weak password and cross-origin command refused');
  assert.equal((await a.request('/api/auth/register',body)).status,200);
  const row=await db.query('select id from auth.users where email=$1',[email]); users.push(row.rows[0].id);
  assert.equal((await a.request('/api/auth/bootstrap')).status,401);
  assert.equal((await a.request('/api/auth/login',body)).status,401);
  pass('signup email delivered; unconfirmed user has no authenticated bootstrap');
  const link=await confirmationLink(email);
  const confirmed=await b.request(link.pathname+link.search+'&next=https://attacker.test');
  assert.equal(confirmed.status,303);assert.equal(new URL(confirmed.headers.get('location')).pathname,'/auth/loading');
  assert.equal((await b.request('/api/auth/bootstrap')).status,200);
  assert.match((await a.request(link.pathname+link.search)).headers.get('location'),/link-invalid/);
  pass('real email confirmation in another cookie jar; fixed redirect; reused link refused');
  assert.equal((await a.request('/api/auth/register',body)).status,200);
  assert.equal((await a.request('/api/auth/login',{email,password:'wrong-password'})).status,401);
  assert.equal((await a.request('/api/auth/login',body)).status,200);
  assert.equal((await a.request('/api/auth/update-password',{password:nextPassword,confirmPassword:nextPassword})).status,403);
  pass('duplicate signup concealed, incorrect login refused, valid login accepted, ordinary session cannot reset');
  const c=new Browser();
  for(const route of ['/dashboard','/quests','/quests/create','/arcs','/hunter-core','/hunter-operations','/hunter-lab','/onboarding','/activation']) {
    const anon=await c.request(route);const anonText=await anon.text(); assert.ok(anon.status===307||anonText.includes('/login'),'ANONYMOUS_ROUTE_NOT_GUARDED');
    const valid=await a.request(route);const html=await valid.text(); assert.equal(valid.status,200);assert.ok(html.includes('Vérification de votre accès'));assert.ok(!html.includes('CREATE QUEST'));assert.match(valid.headers.get('cache-control'),/no-store/);
  }
  pass('all nine business paths refuse anonymous and mount authenticated waiting screen only');
  assert.equal((await a.request('/api/auth/forgot-password',{email})).status,200);
  const recovery=await confirmationLink(email,'recovery');
  const recover=await a.request(recovery.pathname+recovery.search);assert.equal(new URL(recover.headers.get('location')).pathname,'/update-password');
  assert.equal((await a.request('/update-password')).status,200);
  const proof=a.jar.get('lifequest-recovery');assert.ok(proof);
  b.jar.set('lifequest-recovery',proof);
  assert.equal((await b.request('/api/auth/update-password',{password:nextPassword,confirmPassword:nextPassword})).status,403);
  a.jar.set('lifequest-recovery',proof.slice(0,-4)+'AAAA');
  assert.equal((await a.request('/api/auth/update-password',{password:nextPassword,confirmPassword:nextPassword})).status,403);
  a.jar.set('lifequest-recovery',proof);
  const oldSession=new Browser();oldSession.jar=new Map(a.jar);
  assert.equal((await a.request('/api/auth/update-password',{password:nextPassword,confirmPassword:nextPassword})).status,200);
  assert.equal((await oldSession.request('/api/auth/update-password',{password,confirmPassword:password})).status,401);
  assert.equal((await oldSession.request('/api/auth/bootstrap')).status,401);
  assert.match((await c.request(recovery.pathname+recovery.search)).headers.get('location'),/link-invalid/);
  assert.equal((await a.request('/api/auth/login',body)).status,401);
  assert.equal((await a.request('/api/auth/login',{email,password:nextPassword})).status,200);
  pass('real recovery email, signed recovery permission, new password, global revocation and reset-link reuse denied');
  const saved=new Browser();saved.jar=new Map(a.jar);
  assert.equal((await a.request('/api/auth/logout',{})).status,200);assert.equal((await saved.request('/api/auth/bootstrap')).status,401);assert.equal((await a.request('/api/auth/bootstrap')).status,401);
  pass('logout invalidates cookies and already issued session');
  const expiryEmail='auth3-expired-'+randomUUID()+'@example.test';
  assert.equal((await c.request('/api/auth/register',{...body,email:expiryEmail})).status,200);
  const expiryRow=await db.query('select id from auth.users where email=$1',[expiryEmail]);users.push(expiryRow.rows[0].id);
  const expiredLink=await confirmationLink(expiryEmail);
  await db.query("update auth.users set confirmation_sent_at='2000-01-01' where id=$1",[expiryRow.rows[0].id]);
  assert.match((await c.request(expiredLink.pathname+expiredLink.search)).headers.get('location'),/link-invalid/);
  assert.equal((await c.request('/api/auth/bootstrap')).status,401);
  pass('genuinely expired confirmation fixture refused without session');
  const expiredRecoveryEmail='auth3-expired-recovery-'+randomUUID()+'@example.test';
  await c.request('/api/auth/register',{...body,email:expiredRecoveryEmail});
  const recoveryRow=await db.query('select id from auth.users where email=$1',[expiredRecoveryEmail]);users.push(recoveryRow.rows[0].id);
  const initialLink=await confirmationLink(expiredRecoveryEmail);await c.request(initialLink.pathname+initialLink.search);
  assert.equal((await c.request('/api/auth/forgot-password',{email:expiredRecoveryEmail})).status,200);
  const expiredRecovery=await confirmationLink(expiredRecoveryEmail,'recovery');
  await db.query("update auth.users set recovery_sent_at='2000-01-01' where id=$1",[recoveryRow.rows[0].id]);
  assert.match((await c.request(expiredRecovery.pathname+expiredRecovery.search)).headers.get('location'),/link-invalid/);
  assert.equal((await c.request('/api/auth/update-password',{password:nextPassword,confirmPassword:nextPassword})).status,403);
  const unknown=await c.request('/api/auth/forgot-password',{email:'auth3-absent-'+randomUUID()+'@example.test'});
  assert.equal(unknown.status,200);assert.deepEqual(await unknown.json(),{code:'CHECK_EMAIL'});
  pass('genuinely expired recovery link denied; unknown address gets same generic recovery response');
  require('node:fs').mkdirSync(path.join(__dirname,'.results'),{recursive:true});require('node:fs').writeFileSync(path.join(__dirname,'.results/auth3-report.json'),JSON.stringify({groups:results.length,results},null,2));
}
run().catch(error=>{ console.error('AUTH3_CHECK_FAILED',error.name,error.code||'(private details suppressed)'); process.exitCode=1; }).finally(async()=>{if(db){if(users.length)await db.query('delete from auth.users where id=any($1::uuid[])',[users]);await db.end();}});
