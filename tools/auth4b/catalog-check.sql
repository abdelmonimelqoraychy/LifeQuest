-- Read-only catalog assertions. These do NOT prove authenticated A/B behavior.
do $$
declare t record; r text; f text; count_tables integer;
begin
 select count(*) into count_tables from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='lifequest' and c.relkind='r';
 if count_tables<>20 then raise exception 'TABLE_COUNT'; end if;
 for t in select c.oid,c.relrowsecurity,c.relforcerowsecurity,c.relowner
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='lifequest' and c.relkind='r' loop
  if not t.relrowsecurity or not t.relforcerowsecurity or t.relowner<>'lifequest_schema_owner'::regrole then raise exception 'TABLE_RLS_OWNER'; end if;
  foreach r in array array['anon','authenticated'] loop
   if has_table_privilege(r,t.oid,'SELECT,INSERT,UPDATE,DELETE') then raise exception 'PUBLIC_TABLE_PRIVILEGE'; end if;
  end loop;
 end loop;
 foreach r in array array['lifequest_schema_owner','lifequest_command_owner','lifequest_read_owner','lifequest_provision_owner'] loop
  if exists(select 1 from pg_roles where rolname=r and (rolsuper or rolbypassrls or rolcanlogin or rolcreaterole or rolcreatedb or rolreplication)) then raise exception 'UNSAFE_ROLE'; end if;
  if exists(select 1 from pg_auth_members where member=r::regrole) then raise exception 'RUNTIME_INHERITANCE'; end if;
  if exists(select 1 from pg_auth_members where roleid=r::regrole and member='postgres'::regrole and (set_option or inherit_option)) then raise exception 'RESIDUAL_MIGRATION_CAPABILITY'; end if;
 end loop;
 foreach r in array array['anon','authenticated'] loop
  if has_schema_privilege(r,'lifequest','USAGE') then raise exception 'PUBLIC_SCHEMA_USAGE'; end if;
  foreach f in array array['lifequest.current_actor()','lifequest.lock_session()','lifequest.provision_hunter()','lifequest.check_actor_integrity()'] loop
   if has_function_privilege(r,f,'EXECUTE') then raise exception 'PUBLIC_HELPER_EXECUTE'; end if;
  end loop;
 end loop;
 if has_function_privilege('authenticated','public.auth2_award(uuid,uuid,text,boolean)','EXECUTE') then raise exception 'PROOF_RPC_EXPOSED'; end if;
 if has_table_privilege('lifequest_command_owner','auth.sessions','SELECT,INSERT,UPDATE,DELETE') then raise exception 'RUNTIME_AUTH_ACCESS'; end if;
 if has_table_privilege('lifequest_command_owner','lifequest.xp_events','UPDATE,DELETE') then raise exception 'LEDGER_MUTABLE'; end if;
 if has_table_privilege('lifequest_provision_owner','lifequest.hunters','SELECT,UPDATE,DELETE') then raise exception 'PROVISION_MUTABLE'; end if;
end $$;
select 'PASS catalog: 20 private FORCE RLS tables, roles and effective ACL';
