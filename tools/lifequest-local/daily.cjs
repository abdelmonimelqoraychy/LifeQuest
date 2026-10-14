'use strict';
// Daily launcher for the explicit local-personal profile. No migrations or DB reads.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const {spawn,execFileSync}=require('node:child_process');
const stack=require('./stack.cjs');
const nextBin=path.join(stack.frontend,'node_modules','next','dist','bin','next');
const pidFile=path.join(stack.target,'.next.pid');
const appUrl=`http://127.0.0.1:${stack.ports.next}/login`;
const servicePorts=[stack.ports.api,stack.ports.db,stack.ports.studio,stack.ports.mailpit];

function processCommandLine(pid){
 try{return execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`$p=Get-CimInstance Win32_Process -Filter "ProcessId = ${Number(pid)}"; if ($p) { $p.CommandLine }`],{encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:8000}).trim();}
 catch{return '';}
}
function isPersonalNext(pid){const line=processCommandLine(pid);return !!line&&line.toLowerCase().includes(nextBin.toLowerCase())&&line.includes(`--port ${stack.ports.next}`);}
async function listening(port){return new Promise(resolve=>{const s=net.createConnection({host:'127.0.0.1',port});s.once('connect',()=>{s.destroy();resolve(true);});s.once('error',()=>resolve(false));});}
async function openBrowser(){if(process.env.LIFEQUEST_LAUNCHER_NO_BROWSER==='1'){console.log('INFO browser launch skipped for launcher check');return;}execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Start-Process '${appUrl}'`],{stdio:'ignore',timeout:10000});}
async function healthy(url=appUrl){try{const r=await fetch(url,{signal:AbortSignal.timeout(1500),redirect:'manual'});return r.status>0&&r.status<500;}catch{return false;}}
function friendly(error){const m=String(error?.code||error?.message||'');if(m==='DOCKER_ACCESS'||m==='DOCKER_LINUX_ENGINE_REQUIRED')return 'Docker Desktop/Linux n’est pas accessible. Démarrez Docker Desktop et attendez que son moteur Linux soit prêt, puis réessayez.';if(m==='SUPABASE_LOCAL_COMMAND'||m==='STACK_NOT_RUNNING')return 'La stack Supabase locale n’a pas pu démarrer. Vérifiez Docker Desktop et consultez les journaux de la cible personnelle.';if(m.startsWith('PERSONAL_PORT_ALREADY_BOUND_'))return `Un port de la stack personnelle est déjà occupé (${m.split('_').at(-1)}). Le lanceur n’a rien démarré pour éviter de toucher à un autre service.`;if(m==='NEXT_PORT_IN_USE')return `Le port Next ${stack.ports.next} est occupé par un processus qui n’appartient pas au lanceur LifeQuest. Fermez ce service ou libérez le port, puis réessayez.`;if(m==='NEXT_START_TIMEOUT')return 'Next.js n’a pas répondu sur le port 31770 après 90 secondes. Vérifiez les dépendances frontend et les journaux locaux.';if(m==='NEXT_INSTALL_MISSING')return 'Next.js est absent de frontend/node_modules. Réinstallez les dépendances du projet.';if(m==='NEXT_PROCESS_IDENTITY_MISMATCH')return 'Le PID enregistré ne correspond pas au serveur LifeQuest attendu ; arrêt refusé pour protéger les autres processus.';if(m==='NEXT_EXITED_DURING_START')return 'Next.js s’est arrêté pendant son démarrage. Vérifiez les journaux locaux.';if(m.startsWith('WRONG_ENDPOINT_')||m==='LOCAL_CONFIG_MISMATCH'||m==='REMOTE_LINK_FORBIDDEN')return 'La configuration ne correspond pas à lifequest-personal-local-20261014. Aucun service n’a été lancé.';if(m==='NEXT_PID_INVALID')return 'Le fichier PID LifeQuest est invalide ; aucun processus n’a été arrêté.';return `Impossible d’ouvrir LifeQuest : ${m.slice(0,300)||'erreur locale inconnue'}.`;}
function recordedPid(){if(!fs.existsSync(pidFile))return 0;const text=fs.readFileSync(pidFile,'utf8').trim(),pid=Number(text);if(!/^\d+$/.test(text)||!Number.isSafeInteger(pid)||pid<1)throw Object.assign(new Error('NEXT_PID_INVALID'),{code:'NEXT_PID_INVALID'});return pid;}
async function open(){
 stack.verify();
 // Reuse only a process whose PID and command line both match this Next server.
 const old=recordedPid();
 if(old&&isPersonalNext(old)&&await healthy()){await openBrowser();console.log('PASS serveur Next personnel déjà actif ; instance réutilisée.');return;}
 // A listener without our verified PID is never adopted or killed.
 if(await listening(stack.ports.next))throw Object.assign(new Error('NEXT_PORT_IN_USE'),{code:'NEXT_PORT_IN_USE'});
 if(fs.existsSync(nextBin)===false)throw Object.assign(new Error('NEXT_INSTALL_MISSING'),{code:'NEXT_INSTALL_MISSING'});
 let cfg;
 try{cfg=stack.status();}
 catch(e){
  if(!['SUPABASE_LOCAL_COMMAND','STACK_NOT_RUNNING'].includes(e.code))throw e;
  stack.engine();
  for(const port of servicePorts)if(await listening(port))throw Object.assign(new Error(`PERSONAL_PORT_ALREADY_BOUND_${port}`),{code:`PERSONAL_PORT_ALREADY_BOUND_${port}`});
  // This path starts only this project's containers; it never runs migration up.
  ({cfg}=await stack.startServices());
 }
 const appEnv=stack.ensureFrontendEnv(cfg);
 if(appEnv.LIFEQUEST_LOCAL_PROFILE!==stack.project||appEnv.APP_ORIGIN!==`http://127.0.0.1:${stack.ports.next}`)throw new Error('PERSONAL_PROFILE_ENV_MISMATCH');
 const logDir=path.join(stack.target,'logs');fs.mkdirSync(logDir,{recursive:true});const logFd=fs.openSync(path.join(logDir,'next.log'),'a');const child=spawn(process.execPath,[nextBin,'dev','--webpack','--hostname','127.0.0.1','--port',String(stack.ports.next)],{cwd:stack.frontend,env:{...process.env,...appEnv,NODE_ENV:'development',NEXT_TELEMETRY_DISABLED:'1'},detached:true,stdio:['ignore',logFd,logFd],windowsHide:true});fs.closeSync(logFd);
 child.unref();fs.writeFileSync(pidFile,String(child.pid)+'\n',{flag:'w'});
 try{const deadline=Date.now()+90000;let ready=false;while(Date.now()<deadline){if(child.exitCode!==null)throw Object.assign(new Error('NEXT_EXITED_DURING_START'),{code:'NEXT_EXITED_DURING_START'});if(await healthy()){ready=true;break;}await new Promise(r=>setTimeout(r,700));}if(!ready)throw Object.assign(new Error('NEXT_START_TIMEOUT'),{code:'NEXT_START_TIMEOUT'});}
 catch(e){try{if(isPersonalNext(child.pid))process.kill(child.pid);}catch{}throw e;}
 await openBrowser();console.log(`PASS LifeQuest ouverte sur ${appUrl} ; stack ${stack.project} ; aucun changement de migration.`);
}
function stopNext(){const pid=recordedPid();if(!pid){console.log('INFO aucun PID Next personnel enregistré.');return;}const line=processCommandLine(pid);if(!line){fs.rmSync(pidFile,{force:true});console.log('INFO ancien PID Next absent retiré ; aucun autre processus arrêté.');return;}if(!line.toLowerCase().includes(nextBin.toLowerCase())||!line.includes(`--port ${stack.ports.next}`))throw Object.assign(new Error('NEXT_PROCESS_IDENTITY_MISMATCH'),{code:'NEXT_PROCESS_IDENTITY_MISMATCH'});process.kill(pid);fs.rmSync(pidFile,{force:true});console.log('PASS serveur Next personnel identifié arrêté.');}
async function stop(){stopNext();stack.verify();let any=false;for(const port of servicePorts)any=any||await listening(port);if(any){stack.status();stack.stop();}else console.log('INFO stack Supabase personnelle déjà arrêtée ; volumes conservés.');}
function main(){const action=process.argv[2];if(action==='open')return open();if(action==='stop-next')return stopNext();if(action==='stop')return stop();throw new Error('ACTION_REQUIRED');}
if(require.main===module)main().catch(e=>{console.error('ERREUR '+friendly(e));process.exitCode=1;});
module.exports={open,stop,stopNext};
