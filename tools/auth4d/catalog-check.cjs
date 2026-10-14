'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Client}=require('../auth2/node_modules/pg');
const {status,project,target}=require('../auth4c/stack.cjs');

async function main(){
 assert.equal(project,'lifequest-auth4d-reader-20261013','READER_STACK_REQUIRED');
 const cfg=status();assert.ok(['127.0.0.1','localhost'].includes(new URL(cfg.API_URL).hostname));
 const u=new URL(cfg.DB_URL);u.username='supabase_admin';const db=new Client({connectionString:u.href});
 try{
  await db.connect();await db.query('begin read only');
  const versions=(await db.query('select version from supabase_migrations.schema_migrations order by version')).rows.map(x=>x.version);
  const source=fs.readdirSync(path.join(__dirname,'../../supabase/migrations')).filter(x=>x.endsWith('.sql')).sort();
  assert.equal(versions.length,23);assert.deepEqual(versions,source.map(x=>x.split('_')[0]));
  for(const name of source){const a=fs.readFileSync(path.join(__dirname,'../../supabase/migrations',name));const b=fs.readFileSync(path.join(target,'supabase/migrations',name));assert.deepEqual(a,b,'INSTALLED_SOURCE_'+name);}
  const tables=(await db.query("select c.oid::text,c.relname,c.relrowsecurity,c.relforcerowsecurity,r.rolname owner from pg_class c join pg_roles r on r.oid=c.relowner where c.relnamespace='lifequest'::regnamespace and c.relkind='r' order by c.relname")).rows;
  assert.equal(tables.length,21); // twenty Hunter tables plus calendar activation
  for(const t of tables){assert.ok(t.relrowsecurity&&t.relforcerowsecurity);assert.notEqual(t.owner,'lifequest_read_owner');
   for(const role of ['anon','authenticated'])assert.equal((await db.query('select has_table_privilege($1,$2::oid,\'SELECT,INSERT,UPDATE,DELETE\') p',[role,t.oid])).rows[0].p,false);}
  for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_schema_privilege($1,'lifequest','USAGE') p",[role])).rows[0].p,false);
  const publicFns=(await db.query("select p.oid::text,p.proname,p.provolatile,p.prosecdef,p.proconfig,r.rolname owner from pg_proc p join pg_roles r on r.oid=p.proowner where p.pronamespace='public'::regnamespace and p.proname in ('lifequest_hunter_snapshot','lifequest_command_receipt') order by p.proname")).rows;
  assert.deepEqual(publicFns.map(x=>x.proname),['lifequest_command_receipt','lifequest_hunter_snapshot']);
  for(const f of publicFns){assert.equal(f.owner,'lifequest_read_owner');assert.equal(f.provolatile,'s');assert.ok(f.prosecdef);assert.ok(f.proconfig.includes('search_path=""'));assert.ok(f.proconfig.includes('statement_timeout=5s'));
   for(const role of ['public','anon'])assert.equal((await db.query('select has_function_privilege($1,$2::oid,\'EXECUTE\') p',[role,f.oid])).rows[0].p,false);
   assert.equal((await db.query('select has_function_privilege(\'authenticated\',$1::oid,\'EXECUTE\') p',[f.oid])).rows[0].p,true);}
  assert.equal((await db.query("select count(*)::int n from pg_proc where pronamespace='lifequest'::regnamespace and proname in ('snapshot_row','assert_snapshot_number') and (has_function_privilege('anon',oid,'EXECUTE') or has_function_privilege('authenticated',oid,'EXECUTE'))")).rows[0].n,0);
  for(const role of ['lifequest_schema_owner','lifequest_command_owner','lifequest_read_owner','lifequest_provision_owner']){
   const r=(await db.query('select rolsuper,rolbypassrls,rolcanlogin from pg_roles where rolname=$1',[role])).rows[0];assert.ok(r&&!r.rolsuper&&!r.rolbypassrls&&!r.rolcanlogin);
  }
  const membership=(await db.query("select coalesce(bool_or(m.set_option),false) enabled from pg_auth_members m join pg_roles g on g.oid=m.roleid join pg_roles u on u.oid=m.member where g.rolname='lifequest_read_owner' and u.rolname='postgres'")).rows[0].enabled;
  assert.equal(membership,false,'NO_MIGRATION_SET_ROLE_REMAINS');
  const users=(await db.query("select count(*)::int n,count(*) filter(where email not like '%@example.test')::int non_fixture from auth.users")).rows[0];
  assert.equal(users.non_fixture,0,'NO_NON_SYNTHETIC_AUTH_USERS');
  await db.query('commit');
  console.log('PASS reader catalog: 23 ordered migrations byte-identical; '+users.n+' synthetic Auth fixtures only; 21 FORCE-RLS tables; zero direct client privileges; two authenticated-only stable SECURITY DEFINER readers; limited owners');
 }finally{await db.end();}
}
main().catch(e=>{console.error('FAIL reader catalog '+(e.code||'ASSERTION')+' '+String(e.message).split('\n')[0]);process.exitCode=1;});
