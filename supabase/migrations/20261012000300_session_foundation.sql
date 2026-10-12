-- Read-only session predicate. No Hunter tables, XP or legacy data are accessed.
create function public.lifequest_session_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and coalesce((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'exp')::numeric, 0)
      > extract(epoch from now())
    and coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'is_anonymous', 'false') = 'false'
    and exists (select 1 from auth.sessions s
      where s.user_id = auth.uid()
        and s.id::text = nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'session_id');
$$;
revoke all on function public.lifequest_session_active() from public, anon;
grant execute on function public.lifequest_session_active() to authenticated;
