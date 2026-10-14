-- Explicit owner context: a successful REVOKE by a non-owner can be ineffectual.
-- Changes privileges only; no data, table, formula or function body is modified.
grant lifequest_auth2_command_owner to postgres;
set local role lifequest_auth2_command_owner;
revoke all on function public.auth2_award(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.auth2_award(uuid, uuid, text, boolean) to authenticated;
set local role postgres;
revoke lifequest_auth2_command_owner from postgres;
