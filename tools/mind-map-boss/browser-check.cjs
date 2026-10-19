'use strict';
// Desktop/mobile production-browser check against only the fixed fictional stack.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomBytes, randomUUID } = require('node:crypto');
const { Client } = require('../auth2/node_modules/pg');
const stack = require('./stack.cjs');

const webPort = 31791;
const cdpPort = 65025;
const frontend = 'C:/Users/hp/myproject/lifequest-mind-map-boss-frontend-check-20261018-f/frontend';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const output = path.join(__dirname, '.results');
let next;
let chromeProcess;
let pageSocket;
let browserSocket;
let db;
let idCounter = 0;
const pending = new Map();

function checkPortFree(port) {
  return new Promise(resolve => {
    const socket = require('node:net').createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => resolve(true));
  });
}
function connectCdp(url) {
  const socket = new WebSocket(url);
  return new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve(socket), { once: true });
    socket.addEventListener('error', () => reject(new Error('CHROME_CDP_CONNECT_FAILED')), { once: true });
  });
}
function listen(socket) {
  socket.addEventListener('message', event => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(`CDP_${message.error.code}`));
    else resolve(message.result || {});
  });
}
function call(method, params = {}, socket = pageSocket) {
  const id = ++idCounter;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('CDP_TIMEOUT')); } }, 10000).unref();
  });
}
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (result.exceptionDetails) throw new Error('BROWSER_EVALUATION_FAILED');
  return result.result?.value;
}
async function waitFor(expression, label, attempts = 160) {
  for (let index = 0; index < attempts; index += 1) {
    try { if (await evaluate(expression)) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  let detail = '';
  try { detail = JSON.stringify(await evaluate("({path:location.pathname,title:document.querySelector('h1')?.textContent||'',buttons:[...document.querySelectorAll('button')].map(b=>b.textContent.trim()).slice(0,12),labels:[...document.querySelectorAll('[aria-label]')].map(e=>e.getAttribute('aria-label')).filter(Boolean).slice(0,12),forms:document.forms.length,inputs:[...document.querySelectorAll('input')].map(e=>({id:e.id,name:e.name,type:e.type})),status:[...document.querySelectorAll('[role=alert],[role=status]')].map(e=>e.textContent.trim()).slice(0,4)})")); } catch {}
  throw new Error(`WAIT_${label}${detail ? ` ${detail}` : ''}`);
}
async function navigate(url) {
  await call('Page.navigate', { url });
  await waitFor("document.readyState==='complete'", 'DOCUMENT_READY');
}
async function screenshot(name) {
  const result = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, fromSurface: true });
  fs.writeFileSync(path.join(output, name), Buffer.from(result.data, 'base64'));
}
async function clickButton(label) {
  const result = await evaluate(`(()=>{const normalize=x=>(x||'').replace(/\\s+/g,' ').trim().toLowerCase();const buttons=[...document.querySelectorAll('button')];const b=buttons.find(x=>normalize(x.innerText||x.textContent)===${JSON.stringify(label.toLowerCase())});if(!b)return{found:false,buttons:buttons.map(x=>normalize(x.innerText||x.textContent)).slice(-14)};b.click();return{found:true}})()`);
  assert.equal(result?.found, true, `BUTTON_${label}${result?.buttons ? ` ${JSON.stringify(result.buttons)}` : ''}`);
}
async function setInput(selector, value) {
  const result = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;const p=e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return e.value===${JSON.stringify(value)}})()`);
  assert.equal(result, true, `INPUT_${selector}`);
}
async function clickCreateNode(title, parentId) {
  const selectResult = await evaluate(`(()=>{const e=document.querySelector('select[aria-label="Parent idea"]');if(!e)return false;const s=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;s.call(e,${JSON.stringify(parentId || '')});e.dispatchEvent(new Event('change',{bubbles:true}));return e.value===${JSON.stringify(parentId || '')}})()`);
  assert.equal(selectResult, true, 'PARENT_SELECTOR');
  await setInput('input[aria-label="Nouvelle branche"]', title);
  await clickButton('ADD NODE');
  await waitFor(`fetch('/api/hunter/bootstrap',{cache:'no-store'}).then(r=>r.json()).then(x=>x.state==='ready'&&x.data.lab.nodes.some(n=>n.title===${JSON.stringify(title)}))`, 'NODE_CREATED');
  const snapshot = await evaluate("fetch('/api/hunter/bootstrap',{cache:'no-store'}).then(r=>r.json())");
  return snapshot.data.lab.nodes.find(row => row.title === title);
}
async function makeReadyFixture(client, actorId) {
  await client.query('begin');
  try {
    await client.query("update lifequest.hunters set timezone='UTC',timezone_confirmed_at=clock_timestamp(),opening_xp=0,total_xp=0 where user_id=$1", [actorId]);
    await client.query("update lifequest.hunter_setup set origin_choice='new',chosen_at=clock_timestamp(),configuration_status='ready' where user_id=$1", [actorId]);
    await client.query("insert into lifequest.hunter_profiles(user_id,name,age,gender,avatar,goals,onboarding_completed,original_created_at) values($1,'Fictional Browser Hunter',25,'other','male','{}',true,clock_timestamp())", [actorId]);
    await client.query('commit');
  } catch (error) { await client.query('rollback'); throw error; }
}
async function createConfirmedFixture(cfg, client) {
  const api = new URL(cfg.API_URL).origin;
  const key = cfg.PUBLISHABLE_KEY || cfg.ANON_KEY;
  const email = `mindmap-browser-${randomUUID()}@example.test`;
  const password = randomBytes(24).toString('hex');
  const signup = await fetch(`${api}/auth/v1/signup`, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  assert.equal(signup.status, 200, 'SYNTHETIC_SIGNUP');
  assert.equal((await signup.json()).access_token, undefined, 'EMAIL_CONFIRMATION_REQUIRED');
  const inbox = `http://127.0.0.1:${stack.ports.mail}`;
  let tokenHash;
  for (let attempt = 0; attempt < 80 && !tokenHash; attempt += 1) {
    const listResponse = await fetch(`${inbox}/api/v1/messages`);
    if (listResponse.ok) {
      const list = await listResponse.json();
      for (const message of list.messages || []) {
        if (!(message.To || []).some(recipient => recipient.Address === email)) continue;
        const body = await (await fetch(`${inbox}/api/v1/message/${message.ID}`)).json();
        for (const match of String(body.HTML || '').matchAll(/href="([^"]+)"/g)) {
          const link = new URL(match[1].replaceAll('&amp;', '&'));
          if (link.searchParams.get('type') === 'email') tokenHash = link.searchParams.get('token_hash');
        }
      }
    }
    if (!tokenHash) await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(tokenHash, 'SYNTHETIC_CONFIRMATION_EMAIL');
  const verifiedResponse = await fetch(`${api}/auth/v1/verify`, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ token_hash: tokenHash, type: 'email' }) });
  assert.equal(verifiedResponse.status, 200, 'SYNTHETIC_EMAIL_CONFIRMED');
  const verified = await verifiedResponse.json();
  await makeReadyFixture(client, verified.user.id);
  return { actor: verified.user.id, email, password };
}
async function main() {
  assert.equal(stack.project, 'lifequest-mind-map-boss-v1-20261018');
  assert.ok(fs.existsSync(frontend) && fs.existsSync(path.join(frontend, '.next/BUILD_ID')), 'ISOLATED_PRODUCTION_BUILD_EXISTS');
  assert.ok(fs.existsSync(chrome), 'CHROME_INSTALLED');
  for (const port of [webPort, cdpPort]) if (!(await checkPortFree(port))) throw new Error(`BROWSER_TEST_PORT_BUSY_${port}`);

  const cfg = stack.status();
  const api = new URL(cfg.API_URL);
  assert.equal(api.hostname, '127.0.0.1');
  assert.equal(api.port, String(stack.ports.api));
  const key = cfg.PUBLISHABLE_KEY || cfg.ANON_KEY;
  const databaseUrl = new URL(cfg.DB_URL);
  databaseUrl.username = 'supabase_admin';
  db = new Client({ connectionString: databaseUrl.href, connectionTimeoutMillis: 5000, query_timeout: 15000 });
  await db.connect();
  const fixture = await createConfirmedFixture(cfg, db);

  const env = {
    ...process.env,
    APP_ORIGIN: `http://127.0.0.1:${webPort}`,
    AUTH_RECOVERY_SECRET: randomBytes(48).toString('base64url'),
    NEXT_PUBLIC_SUPABASE_URL: api.origin,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
  };
  const nextCli = path.join(frontend, 'node_modules/next/dist/bin/next');
  next = spawn(process.execPath, [nextCli, 'start', '--hostname', '127.0.0.1', '--port', String(webPort)], { cwd: frontend, env, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'] });
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (next.exitCode !== null) throw new Error('ISOLATED_NEXT_EXITED');
    try { const response = await fetch(`http://127.0.0.1:${webPort}/login`, { signal: AbortSignal.timeout(1000) }); if (response.status === 200) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.equal(ready, true, 'ISOLATED_NEXT_LOGIN');

  fs.mkdirSync(output, { recursive: true });
  const profile = path.join(output, `chrome-profile-${process.pid}`);
  chromeProcess = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--disable-background-networking', '--disable-component-update', '--disable-sync',
    '--disable-extensions', '--no-first-run', '--no-default-browser-check', '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'] });
  const cdpOrigin = `http://127.0.0.1:${cdpPort}`;
  let version;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { const response = await fetch(`${cdpOrigin}/json/version`); if (response.ok) { version = await response.json(); break; } } catch {}
    if (chromeProcess.exitCode !== null) throw new Error('CHROME_EXITED');
    await new Promise(resolve => setTimeout(resolve, 125));
  }
  assert.ok(version?.webSocketDebuggerUrl, 'CHROME_CDP_READY');
  browserSocket = await connectCdp(version.webSocketDebuggerUrl); listen(browserSocket);
  const targetResponse = await fetch(`${cdpOrigin}/json/new?${encodeURIComponent('http://127.0.0.1:' + webPort + '/login')}`, { method: 'PUT' });
  assert.equal(targetResponse.ok, true, 'CHROME_TEST_TAB_CREATED');
  const targetInfo = await targetResponse.json();
  pageSocket = await connectCdp(targetInfo.webSocketDebuggerUrl); listen(pageSocket);
  await call('Page.enable');
  await call('Runtime.enable');
  await call('Network.enable');
  await call('Page.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await waitFor("location.pathname==='/login'&&!!document.querySelector('#email')", 'LOGIN_PAGE');
  await waitFor("(()=>{const input=document.querySelector('#email');return !!input&&Object.keys(input).some(key=>key.startsWith('__reactProps$'))})()", 'LOGIN_HYDRATED');
  await setInput('#email', fixture.email);
  await setInput('#password', fixture.password);
  await evaluate("document.querySelector('form').requestSubmit()");
  await waitFor("fetch('/api/hunter/bootstrap',{cache:'no-store'}).then(r=>r.json()).then(x=>x.state==='ready'&&x.actor)", 'VERIFIED_LOGIN_BOOTSTRAP');
  await waitFor("location.pathname==='/dashboard'", 'AUTH_LOADING_REDIRECT');
  await navigate(`http://127.0.0.1:${webPort}/hunter-lab`);
  await waitFor("fetch('/api/hunter/bootstrap',{cache:'no-store'}).then(r=>r.json()).then(x=>x.state==='ready'&&x.actor)", 'LAB_READY');
  await waitFor("[...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='MIND MAP')", 'LAB_HYDRATED');
  await clickButton('MIND MAP');
  await waitFor("!!document.querySelector('input[aria-label=\"Nouvelle branche\"]')", 'MIND_MAP_TAB');

  const root = await clickCreateNode('Browser conversion source', '');
  const first = await clickCreateNode('Browser first child', root.id);
  const second = await clickCreateNode('Browser second child', root.id);
  const selectedBranchPreview = await evaluate(`(()=>{const panel=document.querySelector('section[aria-labelledby="mind-boss-title"]');const button=[...panel.querySelectorAll('button')].find(x=>(x.innerText||x.textContent).replace(/\\s+/g,' ').trim()==='Prévisualiser en Boss');return{exists:!!button,enabled:!!button&&!button.disabled}})()`);
  assert.deepEqual(selectedBranchPreview, { exists: true, enabled: true }, 'SELECTED_BRANCH_CAN_OPEN_PREVIEW');
  await clickButton('Prévisualiser en Boss');
  await waitFor("!!document.querySelector('section[aria-labelledby=\"mind-boss-title\"] form')", 'PREVIEW_RENDERED');
  await evaluate("document.querySelector('section[aria-labelledby=\"mind-boss-title\"]').scrollIntoView({block:'start'})");
  await screenshot('mind-map-boss-desktop-preview.png');

  // Simulate a concurrent edit after preview. The RPC must reject the stale branch.
  await db.query("update lifequest.mind_nodes set title=title||' refreshed',revision=revision+1 where user_id=$1 and id=$2", [fixture.actor, first.id]);
  await evaluate("document.querySelector('section[aria-labelledby=\"mind-boss-title\"] input[type=checkbox]').click()");
  await evaluate("document.querySelector('section[aria-labelledby=\"mind-boss-title\"] form').requestSubmit()");
  await waitFor("document.querySelector('section[aria-labelledby=\"mind-boss-title\"]')?.innerText.includes('La branche a changé depuis')", 'STALE_BRANCH_CONFLICT');
  assert.equal((await db.query('select count(*)::int n from lifequest.boss_missions where user_id=$1 and source_mind_node_id=$2', [fixture.actor, root.id])).rows[0].n, 0, 'STALE_BRANCH_NO_BOSS');
  await clickButton('Actualiser l’aperçu');
  await waitFor("!!document.querySelector('section[aria-labelledby=\"mind-boss-title\"] form')", 'REFRESHED_PREVIEW');

  const captureRequestIds = await evaluate(`(()=>{window.__bossRequests=[];const original=window.fetch.bind(window);window.fetch=(input,init)=>{const url=typeof input==='string'?input:input.url;if(url==='/api/hunter/command'&&init?.body){try{window.__bossRequests.push(JSON.parse(init.body).requestId)}catch{}}return original(input,init)};return true})()`);
  assert.equal(captureRequestIds, true);
  await evaluate(`(()=>{const p=document.querySelector('section[aria-labelledby="mind-boss-title"]'),f=p.querySelector('form'),i=f.querySelectorAll('input');const set=(e,v)=>{const d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');d.set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))};set(i[0],'Branch to Boss — edited');set(i[1],'Refined child one');set(i[2],'30');set(i[4],'70');i[5].click();return true})()`);
  await call('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0, connectionType: 'none' });
  await evaluate("document.querySelector('section[aria-labelledby=\"mind-boss-title\"] form').requestSubmit()");
  await waitFor("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Réessayer la même création'))", 'UNCERTAIN_COMMAND_RETRY');
  const firstRequest = await evaluate('window.__bossRequests.at(-1)');
  assert.ok(firstRequest, 'FIRST_REQUEST_ID_CAPTURED');
  await call('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1, connectionType: 'wifi' });
  await clickButton('Réessayer la même création');
  await waitFor("document.querySelector('section[aria-labelledby=\"mind-boss-title\"]')?.innerText.includes('Boss créé')", 'SAME_INTENT_RETRY_SUCCESS');
  const requestIds = await evaluate('window.__bossRequests');
  assert.ok(requestIds.length >= 2 && requestIds[0] === requestIds[1], 'NETWORK_RETRY_USES_SAME_REQUEST_ID');
  const linkedBosses = await db.query('select id,source_mind_node_id from lifequest.boss_missions where user_id=$1 and source_mind_node_id=$2', [fixture.actor, root.id]);
  assert.equal(linkedBosses.rows.length, 1, 'NETWORK_RETRY_ONE_BOSS');
  const snapshot = await evaluate("fetch('/api/hunter/bootstrap',{cache:'no-store'}).then(r=>r.json())");
  assert.equal(snapshot.state, 'ready');
  assert.equal(snapshot.data.extra.bosses.filter(row => row.sourceMindNodeId === root.id).length, 1);
  assert.ok(snapshot.data.extra.bosses.some(row => row.sourceMindNodeId === root.id && row.title === 'Branch to Boss — edited'));
  const xpAfter = await db.query('select total_xp::text xp,(select count(*)::int from lifequest.xp_events where user_id=$1) ledger from lifequest.hunters where user_id=$1', [fixture.actor]);
  assert.deepEqual(xpAfter.rows[0], { xp: '0', ledger: 0 }, 'BROWSER_CREATION_NO_XP');
  const successState = await evaluate("(()=>{const p=document.querySelector('section[aria-labelledby=\"mind-boss-title\"]');return{success:p?.innerText.includes('Boss créé et confirmé par son reçu serveur.'),duplicateAlert:[...p.querySelectorAll('[role=alert]')].some(e=>e.innerText.includes('déjà été convertie')),confirmationVisible:!!p.querySelector('input[type=checkbox]')}})()");
  assert.deepEqual(successState, { success: true, duplicateAlert: false, confirmationVisible: false }, 'CREATED_STATE_IS_CLEAR');

  await call('Page.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate("document.querySelector('section[aria-labelledby=\"mind-boss-title\"]').scrollIntoView({block:'start'})");
  const mobileLayout = await evaluate("(()=>{const p=document.querySelector('section[aria-labelledby=\"mind-boss-title\"]'),step=p.querySelector('fieldset'),rect=p.getBoundingClientRect();return{overflow:document.documentElement.scrollWidth>innerWidth,columns:getComputedStyle(step).gridTemplateColumns.split(' ').length,width:rect.width,viewport:innerWidth}})()");
  assert.equal(mobileLayout.overflow, false, 'MOBILE_NO_HORIZONTAL_OVERFLOW');
  assert.equal(mobileLayout.columns, 1, 'MOBILE_STEPS_STACK_VERTICALLY');
  assert.ok(mobileLayout.width <= mobileLayout.viewport);
  await screenshot('mind-map-boss-mobile-created.png');

  // Second branch: two synchronous submit events must create exactly one Boss.
  await clickButton('Annuler');
  await call('Page.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  const secondRoot = await clickCreateNode('Browser double-click source', '');
  await clickCreateNode('Browser double-click child', secondRoot.id);
  const secondBranchPreview = await evaluate(`(()=>{const panel=document.querySelector('section[aria-labelledby="mind-boss-title"]');const button=[...panel.querySelectorAll('button')].find(x=>(x.innerText||x.textContent).replace(/\\s+/g,' ').trim()==='Prévisualiser en Boss');return{exists:!!button,enabled:!!button&&!button.disabled}})()`);
  assert.deepEqual(secondBranchPreview, { exists: true, enabled: true }, 'SECOND_SELECTED_BRANCH_CAN_OPEN_PREVIEW');
  await clickButton('Prévisualiser en Boss');
  await waitFor("!!document.querySelector('section[aria-labelledby=\"mind-boss-title\"] form')", 'DOUBLE_CLICK_PREVIEW');
  await evaluate("document.querySelector('section[aria-labelledby=\"mind-boss-title\"] input[type=checkbox]').click()");
  await evaluate("(()=>{const f=document.querySelector('section[aria-labelledby=\"mind-boss-title\"] form');f.requestSubmit();f.requestSubmit();return true})()");
  await waitFor("fetch('/api/hunter/bootstrap',{cache:'no-store'}).then(r=>r.json()).then(x=>x.state==='ready'&&x.data.extra.bosses.some(b=>b.sourceMindNodeId===" + JSON.stringify(secondRoot.id) + '))', 'DOUBLE_CLICK_COMMITTED');
  assert.equal((await db.query('select count(*)::int n from lifequest.boss_missions where user_id=$1 and source_mind_node_id=$2', [fixture.actor, secondRoot.id])).rows[0].n, 1, 'DOUBLE_SUBMIT_CREATES_ONE_BOSS');
  assert.equal((await db.query('select count(*)::int n from lifequest.xp_events where user_id=$1', [fixture.actor])).rows[0].n, 0, 'BOTH_BOSSES_NO_LEDGER');

  console.log('PASS Chrome production browser: login, Mind Map selection, editable Boss preview, stale-revision refusal, network uncertainty and same-request retry, double-submit lock, desktop/mobile layout, one linked Boss per branch and zero XP');
  fs.writeFileSync(path.join(output, 'browser-report.json'), `${JSON.stringify({ project: stack.project, viewport: '1440x1000 / 390x844', checks: ['verified synthetic login','Mind Map parent selection','editable title/objectives/weights','stale revision conflict without Boss','offline retry with same requestId','double submit creates one Boss','snapshot source link','no XP or ledger delta','mobile vertical layout without overflow'], screenshots: ['mind-map-boss-desktop-preview.png','mind-map-boss-mobile-created.png'] }, null, 2)}\n`);
}

async function cleanup() {
  if (pageSocket?.readyState === WebSocket.OPEN) { try { pageSocket.close(); } catch {} }
  if (browserSocket?.readyState === WebSocket.OPEN) { try { await call('Browser.close', {}, browserSocket); } catch {} }
  if (chromeProcess && chromeProcess.exitCode === null) await new Promise(resolve => {
    const timer = setTimeout(() => { try { chromeProcess.kill(); } catch {} resolve(); }, 5000);
    chromeProcess.once('exit', () => { clearTimeout(timer); resolve(); });
  });
  if (next && next.exitCode === null) await new Promise(resolve => {
    const timer = setTimeout(() => { try { next.kill(); } catch {} resolve(); }, 5000);
    next.once('exit', () => { clearTimeout(timer); resolve(); });
  });
  if (db) await db.end().catch(() => {});
}
main().catch(error => { console.error(`FAIL Chrome fictional browser test ${error.message || error.code || 'CHECK_FAILED'}`); process.exitCode = 1; }).finally(cleanup);
