'use strict';
const {execFileSync}=require('node:child_process');
if(process.env.LIFEQUEST_AUTH4C_STACK!=='reader')throw Error('READER_STACK_REQUIRED');
const path=require('node:path');
const cli=path.resolve(__dirname,'../auth4c/stack.cjs');
const action=process.argv[2];
if(!['prepare','start','migrate','stop'].includes(action))throw Error('ACTION_REQUIRED');
execFileSync(process.execPath,[cli,action],{stdio:'inherit',env:process.env});
