'use strict';
// AUTH-4E-R3: fixed, independent, fictional target. Never print CLI credentials.
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const mode=process.env.LIFEQUEST_AUTH4C_STACK;
if(mode!==undefined&&mode!=='r3')throw Error('UNKNOWN_STACK');
const readerMode=false;
const commandMode=true;
const project='lifequest-auth4e-r3-20261013';
const target='C:/Users/hp/myproject/'+project;
const base=57620;
const ports={api:base+1,db:base+2,mail:base+4,shadow:base};
const env={...process.env,DO_NOT_TRACK:'1',SUPABASE_TELEMETRY_DISABLED:'1',PATH:'C:/Users/hp/AppData/Local/Programs/DockerDesktop/resources/bin'+path.delimiter+process.env.PATH};
const cli=path.join(root,'tools/auth2/node_modules/supabase/dist/supabase.js');
function run(args){try{return execFileSync(process.execPath,[cli,...args,'--workdir',target],
 {encoding:'utf8',env,stdio:['ignore','pipe','pipe'],timeout:240000});}
 catch(e){const stdout=String(e.stdout||''),stderr=String(e.stderr||''),raw=stdout+'\n'+stderr;const kind=/npipe|docker api|permission denied/i.test(raw)?'DOCKER_ACCESS':/address already in use|port.+(use|allocated)/i.test(raw)?'PORT_IN_USE':/pull|download|network/i.test(raw)?'IMAGE_OR_NETWORK':/already running|project.+running/i.test(raw)?'STACK_STATE':'SUPABASE_LOCAL_COMMAND';
  if(kind==='SUPABASE_LOCAL_COMMAND'){const scrub=x=>x.split(/\r?\n/).filter(y=>y.trim()&&!/anon key|service.role|jwt secret|db url|password|secret/i.test(y)).join(' ').replace(/https?:\/\/\S+/gi,'[url-redacted]').replace(/eyJ[A-Za-z0-9._-]{20,}/g,'[credential-redacted]').replace(/\b[A-Fa-f0-9]{40,}\b/g,'[credential-redacted]').replace(/\b[A-Za-z0-9_=-]{56,}\b/g,'[credential-redacted]').replace(/(password|secret|token|key)\s*[:=]\s*[^\s,;]+/ig,'$1=[redacted]').slice(0,1200);console.error('SAFE_DIAGNOSTIC stdout='+stdout.length+' '+scrub(stdout));console.error('SAFE_DIAGNOSTIC stderr='+stderr.length+' '+scrub(stderr));}
  throw Object.assign(new Error(kind),{code:kind});}}
function verify(){
 if(!fs.existsSync(path.join(target,'supabase/config.toml')))throw Error('R3_STACK_NOT_PREPARED');
 const config=fs.readFileSync(path.join(target,'supabase/config.toml'),'utf8');
 if(!config.includes('project_id = "'+project+'"')||!config.includes('port = '+ports.db)
  ||!config.includes('schemas = ["public"]'))throw Error('WRONG_LOCAL_STACK');
 if(fs.existsSync(path.join(target,'supabase/.temp/project-ref')))throw Error('REMOTE_LINK_FORBIDDEN');
}
function status(){
 verify();const cfg=JSON.parse(run(['status','--output','json']));
 for(const k of ['API_URL','DB_URL']){const u=new URL(cfg[k]);
  if(u.hostname!=='127.0.0.1'||u.port!==String(k==='DB_URL'?ports.db:ports.api))throw Error('WRONG_ENDPOINT');}
 return cfg;
}
function databaseContainer(){
 // CLI may truncate long project IDs; identify by the verified local DB port.
 verify();const names=execFileSync('docker',['ps','--format','{{.Names}}'],{encoding:'utf8',env,stdio:['ignore','pipe','pipe']}).trim().split(/\r?\n/);
 const matching=[];
 for(const name of names.filter(n=>n.startsWith('supabase_db_'))){
  const bindings=JSON.parse(execFileSync('docker',['inspect',name,'--format','{{json .NetworkSettings.Ports}}'],{encoding:'utf8',env,stdio:['ignore','pipe','pipe']}));
  if((bindings?.['5432/tcp']||[]).some(b=>b.HostPort===String(ports.db)))matching.push(name);
 }
 if(matching.length!==1)throw Error('LOCAL_DATABASE_CONTAINER_NOT_UNIQUE');return matching[0];
}
function prepare(){
 if(fs.existsSync(target))throw Error('NEW_DIRECTORY_REQUIRED');
 fs.mkdirSync(path.join(target,'supabase/migrations'),{recursive:true});
 fs.cpSync(path.join(root,'supabase/templates'),path.join(target,'supabase/templates'),{recursive:true});
 const config=fs.readFileSync(path.join(root,'supabase/config.toml'),'utf8')
  .replace('project_id = "lifequest-auth2"','project_id = "'+project+'"')
  .replace('schemas = ["public", "auth2_proof"]','schemas = ["public"]')
  .replaceAll('54321',String(ports.api)).replaceAll('54322',String(ports.db)).replaceAll('54324',String(ports.mail)).replaceAll('54320',String(ports.shadow));
 fs.writeFileSync(path.join(target,'supabase/config.toml'),config);
 const names=fs.readdirSync(path.join(root,'supabase/migrations')).filter(n=>n.endsWith('.sql')).sort();
 if(names.length!==23)throw Error('WRONG_MIGRATION_SCOPE');
 for(const name of names)fs.copyFileSync(path.join(root,'supabase/migrations',name),path.join(target,'supabase/migrations',name));
 console.log('PASS prepared '+project+' ports '+ports.api+'/'+ports.db+'/'+ports.mail);
}
if(require.main===module){try{
 const action=process.argv[2];
 if(action==='prepare')prepare();
 else if(['start','stop'].includes(action)){verify();run([action]);console.log('PASS '+action+'; credentials withheld, volumes preserved');}
 else if(action==='status'){const cfg=status();for(const key of ['API_URL','DB_URL']){const u=new URL(cfg[key]);console.log('PASS '+key+' http(s)://'+u.hostname+':'+u.port);}console.log('PASS '+project+' local target; credentials withheld');}
 else if(action==='migrate'){verify();run(['migration','up','--local']);console.log('PASS local migrations applied; credentials withheld');}
 else if(['migrate-float-correction','migrate-prefix-correction'].includes(action)){
  verify();const name=action==='migrate-float-correction'?'20261013000701_auth4_float_serialization.sql':'20261013000702_auth4_activity_prefix.sql';
  const destination=path.join(target,'supabase/migrations',name);
  if(fs.existsSync(destination))throw Error('CORRECTION_ALREADY_COPIED');
  fs.copyFileSync(path.join(root,'supabase/migrations',name),destination);
  run(['migration','up','--local']);console.log('PASS local additive float-output correction');
 }
 else if(action==='migrate-command-correction'){
  if(mode!=='commands')throw Error('COMMAND_STACK_REQUIRED');verify();
  const name='20261013001001_auth4_command_block_scopes.sql';
  const destination=path.join(target,'supabase/migrations',name);
  if(fs.existsSync(destination))throw Error('CORRECTION_ALREADY_COPIED');
  fs.copyFileSync(path.join(root,'supabase/migrations',name),destination);
  run(['migration','up','--local']);console.log('PASS additive command correction');
 }
 else throw Error('ACTION_REQUIRED');
}catch(e){console.error('FAIL local operation '+(e.code||e.status||'CHECK_FAILED'));process.exitCode=1;}}
module.exports={root,project,target,ports,status,env,databaseContainer};
