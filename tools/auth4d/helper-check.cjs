'use strict';
const {Client}=require('../auth2/node_modules/pg');const {status,project}=require('../auth4c/stack.cjs');const assert=require('node:assert/strict');
(async()=>{assert.equal(project,'lifequest-auth4d-reader-20261013');const u=new URL(status().DB_URL);u.username='supabase_admin';const c=new Client({connectionString:u.href});try{await c.connect();
 const f=(await c.query("select prosrc,proargnames,proconfig from pg_proc where oid='lifequest.snapshot_row(jsonb,jsonb)'::regprocedure")).rows[0];assert.ok(f.prosrc.includes('jsonb_each($1)'));
 const one=await c.query("select lifequest.snapshot_row('{\"snake_key\":1,\"revision\":9007199254740993,\"historical\":{\"keep_key\":null}}'::jsonb) result");
 console.log('PASS snapshot helper scalar fixture '+JSON.stringify(one.rows[0].result));
 const two=await c.query("select lifequest.snapshot_row(to_jsonb(x)) from (select 1::integer as field_one) x");
 console.log('PASS snapshot helper row fixture '+JSON.stringify(two.rows[0].snapshot_row));
}finally{await c.end();}})().catch(e=>{console.error('FAIL helper check '+(e.code||'ERROR')+' '+e.message);process.exit(1)});
