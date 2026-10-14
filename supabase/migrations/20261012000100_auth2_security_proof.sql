-- Disposable local proof. No Hunter data or production reward formula is used.
create schema auth2_proof;
create role lifequest_auth2_server nologin nosuperuser nobypassrls;
create role lifequest_auth2_command_owner nologin nosuperuser nobypassrls;
revoke all on schema auth2_proof from public, anon;
grant usage on schema auth2_proof to authenticated, lifequest_auth2_server, lifequest_auth2_command_owner;
grant usage on schema auth to lifequest_auth2_server, lifequest_auth2_command_owner;

create table auth2_proof.progress (
  user_id uuid primary key references auth.users(id),
  xp integer not null default 0 check (xp >= 0 and xp <= 10000)
);
create table auth2_proof.receipts (
  user_id uuid not null references auth.users(id),
  request_id uuid not null,
  reward_id text not null check (length(reward_id) between 1 and 100),
  xp integer not null check (xp = 7),
  primary key (user_id, request_id),
  unique (user_id, reward_id)
);
alter table auth2_proof.progress enable row level security;
alter table auth2_proof.progress force row level security;
alter table auth2_proof.receipts enable row level security;
alter table auth2_proof.receipts force row level security;
revoke all on auth2_proof.progress, auth2_proof.receipts from public, anon, authenticated;
grant select on auth2_proof.progress, auth2_proof.receipts to authenticated;
grant select, update on auth2_proof.progress to lifequest_auth2_server, lifequest_auth2_command_owner;
grant select, insert on auth2_proof.receipts to lifequest_auth2_server, lifequest_auth2_command_owner;

-- Narrow privileged helper: never returns session rows or accepts an actor argument.
create function auth2_proof.session_allowed() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and coalesce((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'exp')::numeric, 0)
      > extract(epoch from now())
    and coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'is_anonymous', 'false') = 'false'
    and exists (select 1 from auth.sessions s
      where s.user_id = auth.uid()
        and s.id::text = nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'session_id');
$$;
revoke all on function auth2_proof.session_allowed() from public, anon;
grant execute on function auth2_proof.session_allowed() to authenticated, lifequest_auth2_server, lifequest_auth2_command_owner;

create policy progress_read on auth2_proof.progress for select
to authenticated, lifequest_auth2_server, lifequest_auth2_command_owner
using (user_id = (select auth.uid()) and (select auth2_proof.session_allowed()));
create policy progress_update on auth2_proof.progress for update
to lifequest_auth2_server, lifequest_auth2_command_owner
using (user_id = (select auth.uid()) and (select auth2_proof.session_allowed()))
with check (user_id = (select auth.uid()) and (select auth2_proof.session_allowed()));
create policy receipt_read on auth2_proof.receipts for select
to authenticated, lifequest_auth2_server, lifequest_auth2_command_owner
using (user_id = (select auth.uid()) and (select auth2_proof.session_allowed()));
create policy receipt_insert on auth2_proof.receipts for insert
to lifequest_auth2_server, lifequest_auth2_command_owner
with check (user_id = (select auth.uid()) and (select auth2_proof.session_allowed()));

-- A fixed fictitious award, deliberately unrelated to LifeQuest RPG formulas.
create function public.auth2_award(
  expected_actor uuid, request_id uuid, reward_id text, simulate_failure boolean default false
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid := auth.uid(); existing auth2_proof.receipts;
begin
  if not auth2_proof.session_allowed() or actor is distinct from expected_actor then
    raise exception 'AUTH2_UNAUTHORIZED' using errcode = '42501';
  end if;
  if request_id is null or reward_id is null or length(reward_id) not between 1 and 100 then
    raise exception 'AUTH2_INVALID_COMMAND';
  end if;
  perform 1 from auth2_proof.progress p where p.user_id = actor for update;
  if not found then raise exception 'AUTH2_ACCOUNT_MISSING'; end if;
  select * into existing from auth2_proof.receipts r where r.user_id = actor and r.request_id = auth2_award.request_id;
  if found then
    if existing.reward_id <> reward_id then raise exception 'AUTH2_REQUEST_CONFLICT'; end if;
    return to_jsonb(existing);
  end if;
  select * into existing from auth2_proof.receipts r where r.user_id = actor and r.reward_id = auth2_award.reward_id;
  if found then return to_jsonb(existing); end if;
  update auth2_proof.progress set xp = xp + 7 where user_id = actor;
  if simulate_failure then raise exception 'AUTH2_SIMULATED_FAILURE'; end if;
  insert into auth2_proof.receipts values (actor, request_id, reward_id, 7) returning * into existing;
  return to_jsonb(existing);
end;
$$;
-- Managed postgres is not a superuser: explicit temporary ownership-transfer rights.
grant lifequest_auth2_command_owner to postgres;
grant create on schema public to lifequest_auth2_command_owner;
alter function public.auth2_award(uuid, uuid, text, boolean) owner to lifequest_auth2_command_owner;
revoke create on schema public from lifequest_auth2_command_owner;
revoke lifequest_auth2_command_owner from postgres;
revoke all on function public.auth2_award(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.auth2_award(uuid, uuid, text, boolean) to authenticated;
