'use strict';
// Loads the already-pinned ICU 2026e data only into the parity child process.
const {spawnSync}=require('node:child_process');
const data=require('../auth4c/calendar-icu.cjs');
const source=process.argv[2];
if(!source||!source.startsWith('tools/lifequest-local/'))throw Error('LOCAL_CALENDAR_CHILD_REQUIRED');
for(const name of Object.keys(data.blobs))data.verify(name,require('node:fs').readFileSync(require('node:path').join(data.directory,name)));
const env={...process.env,ICU_TIMEZONE_FILES_DIR:data.directory};
const r=spawnSync(process.execPath,[source,...process.argv.slice(3)],{env,stdio:'inherit'});
if(r.error)throw Error('CALENDAR_CHILD_FAILED');
process.exitCode=r.status??1;
