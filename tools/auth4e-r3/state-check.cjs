'use strict';
// Fingerprint only the fictitious Hunter rows, activation and SQL metadata.
// No Auth tokens/passwords/emails or raw snapshots written to the result file.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');const {Client}=require('../auth2/node_modules/pg');
const {status,project}=require('./stack.cjs');
async function main(){
 assert.ok(['lifequest-auth4e-r3-20261013','lifequest-auth4c-final-20261013','lifequest-auth4c-safe-20261013','lifequest-auth4c-commands-gate-20261013'].includes(project));
 const u=new URL(status().DB_URL);u.username='supabase_admin';const c=new Client({connectionString:u.href});
 try{await c.connect();await c.query('begin read only');const state={};
  const identityAudit=(await c.query("select count(*)::int total,count(*) filter(where email not like '%@example.test')::int non_fixture from auth.users")).rows[0];assert.equal(identityAudit.non_fixture,0,'ONLY_SYNTHETIC_IDENTITIES');
  const ids=(await c.query("select id from auth.users where email like '%@example.test' order by id")).rows.map(r=>r.id);
  const tables=(await c.query("select tablename from pg_tables where schemaname='lifequest' and tablename<>'calendar_activation' order by tablename")).rows;assert.equal(tables.length,20);
  for(const {tablename} of tables)state[tablename]=(await c.query('select to_jsonb(t)::text row_data from lifequest."'+tablename+'" t where user_id=any($1::uuid[]) order by to_jsonb(t)::text',[ids])).rows;
  state.activation=(await c.query('select to_jsonb(t)::text row_data from lifequest.calendar_activation t order by zone')).rows;
  state.versions=(await c.query('select version from supabase_migrations.schema_migrations order by version')).rows;
  state.roles=(await c.query("select rolname,rolcanlogin,rolsuper,rolbypassrls from pg_roles where rolname in ('lifequest_command_owner','lifequest_schema_owner','lifequest_read_owner','lifequest_provision_owner') order by rolname")).rows;
  for(const r of state.roles)assert.ok(!r.rolcanlogin&&!r.rolsuper&&!r.rolbypassrls);
  state.acl=(await c.query("select p.proname,p.prosecdef,p.proconfig,p.proacl::text,r.rolname owner from pg_proc p join pg_roles r on r.oid=p.proowner where p.pronamespace='public'::regnamespace and p.proname in ('lifequest_quest_command','lifequest_operations_command','lifequest_lab_command') order by p.proname")).rows;
  assert.equal((await c.query("select count(*)::int n from pg_proc where pronamespace='lifequest'::regnamespace and proname like 'auth4c_fixture%'")).rows[0].n,0);
  const counts=(await c.query('select (select count(*)::int from auth.users) accounts,(select count(*)::int from lifequest.hunters) hunters')).rows[0];
  await c.query('commit');const digest=createHash('sha256').update(JSON.stringify(state)).digest('hex');
  const file=path.join(__dirname,'.results',project+'-state.json');
  if(process.argv[2]==='capture'){assert.ok(!fs.existsSync(file),'DO_NOT_OVERWRITE_BASELINE');fs.writeFileSync(file,JSON.stringify({project,digest,counts,tables:20,versions:state.versions.length},null,2)+'\n');}
  else if(process.argv[2]==='verify'){assert.equal(digest,JSON.parse(fs.readFileSync(file,'utf8')).digest,'PERSISTED_STATE');}
  else throw Error('ACTION_REQUIRED');
  console.log('PASS '+process.argv[2]+': twenty Hunter tables, activation, migrations and role/ACL state; '+JSON.stringify(counts));
 }finally{await c.end();}
}
main().catch(e=>{console.error('FAIL state '+(e.code||'ASSERTION')+' '+String(e.message).split('\n')[0]);process.exitCode=1;});
