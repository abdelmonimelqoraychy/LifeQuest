'use strict';
const fs = require('node:fs'); const path = require('node:path'); const { spawnSync } = require('node:child_process');
const verified = require('../auth4c/calendar-icu.cjs');
const directory = verified.directory;
function run(args) {
  for (const name of Object.keys(verified.blobs)) verified.verify(name, fs.readFileSync(path.join(directory, name)));
  const result = spawnSync(process.execPath, args, { env: { ...process.env, ICU_TIMEZONE_FILES_DIR: directory }, stdio: 'inherit' });
  if (result.error) throw Error('CHILD_PROCESS_FAILED');
  if (result.status !== 0) process.exitCode = result.status || 1;
}
try { run(process.argv.slice(2)); } catch (error) { console.error('FAIL verified calendar runtime ' + (error.code || error.message)); process.exitCode = 1; }
