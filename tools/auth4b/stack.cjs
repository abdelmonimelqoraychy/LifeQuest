'use strict';
// Independent local stack only. CLI credentials are captured, never printed.
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const mode=process.env.LIFEQUEST_AUTH4B_STACK || 'initial';
if(!['initial','rebuild','final','verified','release'].includes(mode))throw Error('UNKNOWN_STACK');
const project=mode==='initial'?'lifequest-auth4b-20261013':'lifequest-auth4b-'+mode+'-20261013';
const target='C:/Users/hp/myproject/'+project;
const base=mode==='initial'?56320:mode==='rebuild'?57320:mode==='final'?58320:mode==='verified'?59320:60320;
const ports={api:base+1,db:base+2,shadow:base,mail:base+4};
const cli = path.join(root, 'tools/auth2/node_modules/supabase/dist/supabase.js');
const dockerDir = 'C:/Users/hp/AppData/Local/Programs/DockerDesktop/resources/bin';
const env = {...process.env, PATH: dockerDir + path.delimiter + process.env.PATH};
function run(args) {
  return execFileSync(process.execPath, [cli, ...args, '--workdir', target],
    {encoding:'utf8', env, stdio:['ignore','pipe','pipe'], timeout:240000});
}
function verify() {
  const config = fs.readFileSync(path.join(target,'supabase/config.toml'),'utf8');
  if (!config.includes('project_id = "'+project+'"') || !config.includes('port = '+ports.db)) throw Error('WRONG_LOCAL_STACK');
  if (fs.existsSync(path.join(target,'supabase/.temp/project-ref'))) throw Error('REMOTE_LINK_FORBIDDEN');
}
function status() {
  verify();
  const data = JSON.parse(run(['status','--output','json']));
  for (const key of ['API_URL','DB_URL']) {
    const url = new URL(data[key]);
    if (url.hostname !== '127.0.0.1' || url.port !== String(key === 'DB_URL'?ports.db:ports.api)) throw Error('NON_LOCAL_ENDPOINT');
  }
  return data;
}
function prepare() {
  if (fs.existsSync(target)) throw Error('NEW_DIRECTORY_REQUIRED');
  fs.mkdirSync(path.join(target,'supabase/migrations'),{recursive:true});
  fs.cpSync(path.join(root,'supabase/templates'),path.join(target,'supabase/templates'),{recursive:true});
  let config = fs.readFileSync(path.join(root,'supabase/config.toml'),'utf8')
    .replace('project_id = "lifequest-auth2"','project_id = "'+project+'"')
    .replace('schemas = ["public", "auth2_proof"]','schemas = ["public"]')
    .replaceAll('54321',String(ports.api)).replaceAll('54322',String(ports.db))
    .replaceAll('54320',String(ports.shadow)).replaceAll('54324',String(ports.mail));
  fs.writeFileSync(path.join(target,'supabase/config.toml'),config);
  for (const name of fs.readdirSync(path.join(root,'supabase/migrations')).filter(n=>n.endsWith('.sql'))) {
    fs.copyFileSync(path.join(root,'supabase/migrations',name),path.join(target,'supabase/migrations',name));
  }
  console.log('PASS independent project prepared: '+project+'; ports '+ports.api+'/'+ports.db+'/'+ports.mail);
}
if (require.main === module) {
  try {
    const action=process.argv[2];
    if (action==='prepare') prepare();
    else if (['start','stop'].includes(action)) { verify();run([action]);console.log('PASS local '+action+' (credentials suppressed; data preserved)'); }
    else if(action==='migrate') {verify();run(['migration','up','--local']);console.log('PASS local ordered migrations');}
    else throw Error('ACTION_REQUIRED');
  } catch (error) {
    const diagnostic=String(error.stderr||'').match(/(?:ERROR:|SQLSTATE)[^\r\n]*/g)||[];
    console.error('FAIL local stack operation: '+(error.code || error.status || 'CHECK_FAILED'));
    // Only migration diagnostics, never arbitrary CLI status or credentials.
    if(process.argv[2]==='migrate') for(const line of diagnostic) console.error(line.replace(/postgres(?:ql)?:\/\/\S+/g,'[REDACTED]'));
    process.exitCode=1;
  }
}
module.exports={root,target,project,ports,status,env};
