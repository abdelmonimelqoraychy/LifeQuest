'use strict';
// Official Unicode timezone *data* only; scoped to child test processes.
// No application .env, Node installation, database image or existing stack changed.
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {spawnSync}=require('node:child_process');
const pinned=require('./calendar-resources.json');
const commit=pinned.commit;
const blobs={
 'metaZones.res':'79b4c6bca4e8b0cac6cfc190f06cb71ae66a9c06',
 'timezoneTypes.res':'8cc23114c5d29b03b01bf2359940e94d00e14d5c',
 'windowsZones.res':'5d8a978952cb0bc075ce07a09b94fb402c28464b',
 'zoneinfo64.res':'5608fdda237b438641858cc6525b7b7dd0b1a58b',
};
const directory=path.join(__dirname,'.results','icu-2026e-le');
function verify(name,bytes){
 const blob=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
 if(blob!==blobs[name])throw Error('DATA_INTEGRITY_FAILURE');
 const digest=createHash('sha256').update(bytes).digest('hex');
 if(digest!==pinned.sha256[name])throw Error('SHA256_INTEGRITY_FAILURE');
 return digest;
}
async function download(){
 fs.mkdirSync(directory,{recursive:true});const files=[];
 for(const name of Object.keys(blobs)){
  const source='https://raw.githubusercontent.com/unicode-org/icu-data/'+commit+'/tzdata/icunew/2026e/44/le/'+name;
  const r=await fetch(source,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('PUBLIC_SOURCE_HTTP_'+r.status);
  const bytes=Buffer.from(await r.arrayBuffer());const sha256=verify(name,bytes);
  const file=path.join(directory,name);
  if(fs.existsSync(file)&&verify(name,fs.readFileSync(file))!==sha256)throw Error('EXISTING_DATA_DIFFERS');
  if(!fs.existsSync(file))fs.writeFileSync(file,bytes);
  files.push({name,bytes:bytes.length,sha256,gitBlob:blobs[name],source});
 }
 fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify({version:'2026e',commit,files},null,2)+'\n');
 console.log('PASS four pinned official ICU timezone resources downloaded and verified');
}
function child(args){
 for(const name of Object.keys(blobs))verify(name,fs.readFileSync(path.join(directory,name)));
 const requested=process.env.LIFEQUEST_AUTH4C_STACK;
 const env={...process.env,LIFEQUEST_AUTH4C_STACK:['commands','commands_verified','commands_final','commands_safe','commands_gate','reader'].includes(requested)?requested:'calendar',ICU_TIMEZONE_FILES_DIR:directory};
 const result=spawnSync(process.execPath,args,{env,stdio:'inherit'});
 if(result.error)throw Error('CHILD_PROCESS_FAILED');process.exitCode=result.status??1;
}
if(require.main===module){
 if(process.argv[2]==='download')download().catch(e=>{console.error('FAIL timezone data '+e.message);process.exitCode=1;});
 else try{child(process.argv.slice(2));}catch(e){console.error('FAIL timezone data '+e.message);process.exitCode=1;}
}
module.exports={directory,commit,blobs,verify};
