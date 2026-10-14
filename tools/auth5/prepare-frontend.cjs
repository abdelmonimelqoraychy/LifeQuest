'use strict';
// Isolated working copy for AUTH-5 browser tests; never copies .env*, .next or data.
const fs=require('node:fs'),path=require('node:path');
const source=path.resolve(__dirname,'../../frontend'),target='C:/Users/hp/myproject/lifequest-auth5-frontend-isolated-v2-20261014';
if(fs.existsSync(target))throw Error('FRONTEND_COPY_ALREADY_EXISTS');
fs.cpSync(source,target,{recursive:true,filter:from=>{const rel=path.relative(source,from).replaceAll('\\','/');if(!rel)return true;return !/(^|\/)(?:node_modules|\.next|\.browser-check|\.results|\.temp|\.git)(?:\/|$)/.test(rel)&&!/(^|\/)\.env(?:\.|$)/.test(rel)&&!/(^|\/)[^/]+\.backup(?:_|\.)/.test(rel);}});
fs.symlinkSync(path.join(source,'node_modules'),path.join(target,'node_modules'),'junction');
if(fs.existsSync(path.join(target,'.env.local'))||fs.existsSync(path.join(target,'.next')))throw Error('EXCLUDED_FRONTEND_STATE_COPIED');
console.log('PASS isolated frontend copy created outside repository; node_modules junction only; .env*, .next and browser artifacts excluded');
