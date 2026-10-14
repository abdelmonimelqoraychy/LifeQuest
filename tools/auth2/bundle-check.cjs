'use strict';
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const config=JSON.parse(execFileSync(process.execPath,[path.join(__dirname,'node_modules/supabase/dist/supabase.js'),'status','--workdir',root,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
assert.ok(['127.0.0.1','localhost'].includes(new URL(config.API_URL).hostname));
const secrets=['JWT_SECRET','SECRET_KEY','SERVICE_ROLE_KEY'].filter(name=>typeof config[name]==='string'&&config[name].length>20);
const recovery=fs.readFileSync(path.join(root,'frontend/.env.local'),'utf8').match(/^AUTH_RECOVERY_SECRET=(.+)$/m)?.[1]?.trim();
if(recovery){config.AUTH_RECOVERY_SECRET=recovery;secrets.push('AUTH_RECOVERY_SECRET');}
assert.ok(secrets.length>=2,'Private credential controls missing');
let files=0;
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else{files++;const content=fs.readFileSync(file).toString('utf8');for(const name of secrets)assert.ok(!content.includes(config[name]),'Private credential present in client bundle');}}}
walk(path.join(root,'frontend/.next/static'));
console.log(`PASS ${files} client assets contain none of ${secrets.length} local private credential values (values suppressed)`);
