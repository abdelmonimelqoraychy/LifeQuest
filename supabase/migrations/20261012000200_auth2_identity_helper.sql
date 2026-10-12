-- Managed postgres cannot grant USAGE on the Auth-owned schema to custom roles.
-- Expose only the UID from the transaction context, never Auth records.
create function auth2_proof.current_actor() returns uuid
language sql stable security definer set search_path = '' as $$ select auth.uid(); $$;
revoke all on function auth2_proof.current_actor() from public, anon;
grant execute on function auth2_proof.current_actor() to authenticated, lifequest_auth2_server, lifequest_auth2_command_owner;
alter policy progress_read on auth2_proof.progress
using (user_id = (select auth2_proof.current_actor()) and (select auth2_proof.session_allowed()));
alter policy progress_update on auth2_proof.progress
using (user_id = (select auth2_proof.current_actor()) and (select auth2_proof.session_allowed()))
with check (user_id = (select auth2_proof.current_actor()) and (select auth2_proof.session_allowed()));
alter policy receipt_read on auth2_proof.receipts
using (user_id = (select auth2_proof.current_actor()) and (select auth2_proof.session_allowed()));
alter policy receipt_insert on auth2_proof.receipts
with check (user_id = (select auth2_proof.current_actor()) and (select auth2_proof.session_allowed()));
grant lifequest_auth2_command_owner to postgres;
-- Migration-only rewrite of one fixed function; no user payload or arbitrary name.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.auth2_award(uuid,uuid,text,boolean)'::regprocedure) into definition;
  execute replace(definition, 'auth.uid()', 'auth2_proof.current_actor()');
end;
$$;
revoke lifequest_auth2_command_owner from postgres;
