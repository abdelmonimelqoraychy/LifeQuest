'use strict';
// Temporary bootstrap tracing is applied only to frontend-isolated and can be removed with restore.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),stack=require('./stack.cjs');
const targets=['src/lib/hunter/cloud.tsx','src/proxy.ts','src/lib/auth/session.ts','src/lib/hunter/read.ts','src/app/api/hunter/bootstrap/route.ts'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function sourcePath(relative,isolated=false){return path.join(isolated?stack.testFrontend:path.join(stack.root,'frontend'),relative);}
function replaceOnce(text,from,to,label){const count=text.split(from).length-1;if(count!==1)throw Error('INSTRUMENT_ANCHOR_'+label+'_'+count);return text.replace(from,to);}
function restore(){stack.refreshFrontend();for(const relative of targets){const a=fs.readFileSync(sourcePath(relative)),b=fs.readFileSync(sourcePath(relative,true));if(hash(a)!==hash(b))throw Error('RESTORE_HASH_MISMATCH_'+path.basename(relative));if(b.toString('utf8').includes('[HC_TEST]'))throw Error('INSTRUMENTATION_REMAINS_'+path.basename(relative));}console.log('PASS isolated frontend restored byte-for-byte for 5 bootstrap sources; no HC_TEST markers');}
function instrument(){restore();const replacements={
  'src/lib/hunter/cloud.tsx':[
    ['const current = ++epoch.current; actorRef.current = actor;','const current = ++epoch.current; actorRef.current = actor; console.info(\'[HC_TEST] client.refresh.start\');'],
    ["const response = await fetch('/api/hunter/bootstrap', { cache: 'no-store', signal: controller.signal });","const response = await fetch('/api/hunter/bootstrap', { cache: 'no-store', signal: controller.signal }); console.info('[HC_TEST] client.refresh.response', response.status);"],
  ],
  'src/proxy.ts':[
    ['export const proxy = (request: NextRequest) => refreshAuthSession(request);',"export const proxy = (request: NextRequest) => { console.info('[HC_TEST] proxy.enter', request.nextUrl.pathname); return refreshAuthSession(request); };"],
  ],
  'src/lib/auth/session.ts':[
    ['const { data, error } = await client.auth.getUser();',"console.info('[HC_TEST] auth.getUser.start'); const { data, error } = await client.auth.getUser(); console.info('[HC_TEST] auth.getUser.done', error ? 'error' : 'ok');"],
    ["const active = await client.rpc('lifequest_session_active');","console.info('[HC_TEST] auth.active.start'); const active = await client.rpc('lifequest_session_active'); console.info('[HC_TEST] auth.active.done', active.error ? 'error' : 'ok');"],
  ],
  'src/lib/hunter/read.ts':[
    ['const { data, error } = await session.client.rpc(name, {',"console.info('[HC_TEST] snapshot.rpc.start', name); const { data, error } = await session.client.rpc(name, {"],
    ['    expected_actor: session.user.id,\n  });','    expected_actor: session.user.id,\n  }); console.info(\'[HC_TEST] snapshot.rpc.done\', name, error ? \'error\' : \'ok\');'],
  ],
  'src/app/api/hunter/bootstrap/route.ts':[
    ["  return readHunterRpc('lifequest_hunter_snapshot', {});","  console.info('[HC_TEST] bootstrap.route.start'); const response = await readHunterRpc('lifequest_hunter_snapshot', {}); console.info('[HC_TEST] bootstrap.route.done', response.status); return response;"],
  ],
};
for(const relative of targets){let text=fs.readFileSync(sourcePath(relative,true),'utf8');for(const [from,to] of replacements[relative]||[])text=replaceOnce(text,from,to,relative+':'+from.slice(0,32));fs.writeFileSync(sourcePath(relative,true),text);}
for(const relative of targets)if(!fs.readFileSync(sourcePath(relative,true),'utf8').includes('[HC_TEST]'))throw Error('INSTRUMENTATION_MISSING_'+path.basename(relative));
console.log('PASS temporary bootstrap markers applied only to isolated frontend; five files; no identifiers or credentials logged');}
try{stack.verifySources(28);if(process.argv[2]==='restore')restore();else if(process.argv[2]==='instrument')instrument();else throw Error('ACTION_REQUIRED');}catch(e){console.error('FAIL isolated bootstrap instrumentation '+(e.code||e.message||'UNKNOWN'));process.exitCode=1;}
