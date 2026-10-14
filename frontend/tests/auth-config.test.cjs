const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../src/lib/supabase/config.ts'),'utf8');
function config(env){const context={exports:{},process:{env},URL};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);return context.exports.supabaseConfig();}
test('Auth configuration missing never falls back to local Hunter data',()=>{
 assert.throws(()=>config({}),/AUTH_CONFIGURATION_UNAVAILABLE/);
 assert.throws(()=>config({NEXT_PUBLIC_SUPABASE_URL:'https://example.test'}),/AUTH_CONFIGURATION_UNAVAILABLE/);
});
test('Auth rejects private and legacy privileged keys in public configuration',()=>{
 for(const key of ['sb_secret_fictitious','eyJfake-service-role','arbitrary'])assert.throws(()=>config({NEXT_PUBLIC_SUPABASE_URL:'https://example.test',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:key}),/AUTH_PUBLIC_KEY_REQUIRED/);
});
test('Auth only permits HTTPS or explicit local HTTP targets',()=>{
 for(const url of ['http://remote.test','file:///secret','javascript:alert(1)'])assert.throws(()=>config({NEXT_PUBLIC_SUPABASE_URL:url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fictitious'}));
 for(const url of ['https://example.test','http://127.0.0.1:54321','http://localhost:54321'])assert.equal(config({NEXT_PUBLIC_SUPABASE_URL:url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fictitious'}).url,url);
});
