'use strict';
// Derive the previously reviewed AUTH-4D regression suite without altering it.
const fs=require('node:fs');const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../auth4c/rpc-check.cjs'),'utf8');
let test=source;
const substitutions=[
  ["assert.equal(project,'lifequest-auth4d-reader-20261013','AUTHORIZED_READER_STACK_ONLY')", "assert.equal(project,'lifequest-auth4e-frontend-20261013','AUTHORIZED_AUTH4E_STACK_ONLY')"],
  ["assert.equal(new URL(api).port,'64521','READER_API_PORT_ONLY')", "assert.equal(new URL(api).port,'64621','AUTH4E_API_PORT_ONLY')"],
  ["path.join('C:/Users/hp/myproject/lifequest-auth4d-reader-20261013/supabase/migrations',name)", "path.join(require('./stack.cjs').target,'supabase/migrations',name)"],
  ["assert.ok(fixtureAudit.total>0,'FICTIONAL_FIXTURES_PRESENT');assert.equal(fixtureAudit.non_fixture,0,'NO_NON_FIXTURE_AUTH_USERS');assert.equal(fixtureAudit.hunters,fixtureAudit.total,'FIXTURE_HUNTER_ACCOUNT_PARITY');", "assert.equal(fixtureAudit.total,0,'NEW_STACK_HAS_NO_AUTH_IDENTITIES');assert.equal(fixtureAudit.non_fixture,0,'NO_NON_FIXTURE_AUTH_USERS');assert.equal(fixtureAudit.hunters,0,'NEW_STACK_HAS_NO_HUNTERS');"],
];
for(const [from,to] of substitutions){if(!test.includes(from))throw Error('EXPECTED_SOURCE_PATTERN_MISSING');test=test.replace(from,to);}
if(test.includes('lifequest-auth4d-reader-20261013')||test.includes("'64521'"))throw Error('OLD_STACK_REFERENCE_REMAINS');
const destination=path.join(__dirname,'rpc-check.cjs');if(fs.existsSync(destination))throw Error('DESTINATION_ALREADY_EXISTS');
fs.writeFileSync(destination,test,{encoding:'utf8',flag:'wx'});console.log('PASS generated AUTH-4E-pinned copy of the reviewed RPC regression suite');
