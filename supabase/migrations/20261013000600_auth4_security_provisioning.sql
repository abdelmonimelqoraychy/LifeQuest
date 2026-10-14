-- Claims are supplied by verified PostgREST JWTs, never by a public actor argument.
-- Administrative DB credentials remain a trust boundary, not defeated by RLS.
create function lifequest.current_actor() returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare claims jsonb; actor uuid; sid uuid; expiry numeric;
begin
 claims := nullif(current_setting('request.jwt.claims',true),'')::jsonb;
 actor := (claims->>'sub')::uuid; sid := (claims->>'session_id')::uuid;
 expiry := (claims->>'exp')::numeric;
 if actor is null or sid is null or claims->>'role' is distinct from 'authenticated'
   or coalesce((claims->>'is_anonymous')::boolean,false)
   or jsonb_typeof(claims->'exp') is distinct from 'number' or expiry is null
   or not (expiry>'-Infinity'::numeric and expiry<'Infinity'::numeric)
   or expiry<=extract(epoch from clock_timestamp()) then return null; end if;
 if not exists(select 1 from auth.users u join auth.sessions s on s.user_id=u.id
   where u.id=actor and s.id=sid and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
   and (u.banned_until is null or u.banned_until<=clock_timestamp())
   and (s.not_after is null or s.not_after>clock_timestamp())) then return null; end if;
 return actor;
exception when invalid_text_representation or numeric_value_out_of_range then return null;
end; $$;
revoke all on function lifequest.current_actor() from public,anon,authenticated;
grant execute on function lifequest.current_actor() to lifequest_command_owner,lifequest_read_owner;

create function lifequest.lock_session() returns void
language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid; claims jsonb; sid uuid; locked uuid; previous_timeout text;
begin
 actor := lifequest.current_actor();
 if actor is null then raise exception 'SESSION_DENIED' using errcode='42501'; end if;
 claims := nullif(current_setting('request.jwt.claims',true),'')::jsonb;
 sid := (claims->>'session_id')::uuid;
 previous_timeout := current_setting('lock_timeout');
 perform set_config('lock_timeout','1000ms',true);
 select s.id into locked from auth.sessions s where s.id=sid and s.user_id=actor for key share;
 perform set_config('lock_timeout',previous_timeout,true);
 if locked is null or lifequest.current_actor() is distinct from actor then
   raise exception 'SESSION_DENIED' using errcode='42501';
 end if;
end; $$;
revoke all on function lifequest.lock_session() from public,anon,authenticated;
grant execute on function lifequest.lock_session() to lifequest_command_owner;

set local role lifequest_schema_owner;
grant usage on schema lifequest to lifequest_command_owner,lifequest_read_owner,lifequest_provision_owner;
revoke execute on function lifequest.module_counts_allowed(text,jsonb),lifequest.days_allowed(date[]),lifequest.resource_url_allowed(text) from public,anon,authenticated;
grant execute on function lifequest.resource_url_allowed(text) to lifequest_command_owner,lifequest_read_owner;
grant execute on function lifequest.module_counts_allowed(text,jsonb),lifequest.days_allowed(date[])
 to lifequest_command_owner,lifequest_read_owner,lifequest_provision_owner;
-- Every runtime policy requires a real active, confirmed session for this actor.
do $$ declare t text; cols text; begin
 for t in select tablename from pg_tables where schemaname='lifequest' loop
  execute format('create policy actor_read on lifequest.%I for select to lifequest_command_owner,lifequest_read_owner using (user_id=(select lifequest.current_actor()))',t);
  execute format('grant select on lifequest.%I to lifequest_command_owner,lifequest_read_owner',t);
  execute format('create index %I on lifequest.%I(user_id)',t||'_actor',t);
  if t not in ('xp_events','achievement_unlocks','command_receipts') then
   select string_agg(format('%I',column_name),',' order by ordinal_position) into cols
    from information_schema.columns where table_schema='lifequest' and table_name=t and column_name<>'historical';
   execute format('grant insert(%s),update(%s) on lifequest.%I to lifequest_command_owner',cols,cols,t);
   execute format('create policy actor_update on lifequest.%I for update to lifequest_command_owner using (user_id=(select lifequest.current_actor())) with check (user_id=(select lifequest.current_actor()))',t);
  else
   select string_agg(format('%I',column_name),',' order by ordinal_position) into cols
    from information_schema.columns where table_schema='lifequest' and table_name=t and column_name<>'historical';
   execute format('grant insert(%s) on lifequest.%I to lifequest_command_owner',cols,t);
  end if;
  execute format('create policy actor_insert on lifequest.%I for insert to lifequest_command_owner with check (user_id=(select lifequest.current_actor()))',t);
  if t in ('story_arcs','boss_missions','boss_subobjectives','focus_runs','ideas','mind_nodes','resources','journal_entries','creativity_challenges') then
   execute format('grant delete on lifequest.%I to lifequest_command_owner',t);
   execute format('create policy actor_delete on lifequest.%I for delete to lifequest_command_owner using (user_id=(select lifequest.current_actor()))',t);
  end if;
 end loop;
end $$;
-- Historical metadata and opening/delta are not editable by gameplay.
revoke update on lifequest.hunters from lifequest_command_owner;
-- Table-level REVOKE does not erase column grants: remove them explicitly.
revoke update(user_id,total_xp,opening_xp,legacy_roundoff_delta,timezone,timezone_confirmed_at,rules_version,revision,created_at)
 on lifequest.hunters from lifequest_command_owner;
grant update(total_xp,revision) on lifequest.hunters to lifequest_command_owner;
revoke insert(user_id,total_xp,opening_xp,legacy_roundoff_delta,timezone,timezone_confirmed_at,rules_version,revision,created_at)
 on lifequest.hunters from lifequest_command_owner;
-- Provision owner has only these fixed zero/pending INSERT paths, no SELECT/UPDATE/DELETE.
grant insert on lifequest.hunters,lifequest.hunter_setup,lifequest.hunter_modules,lifequest.hunter_settings to lifequest_provision_owner;
create policy initial_hunter on lifequest.hunters for insert to lifequest_provision_owner
 with check(total_xp=0 and opening_xp=0 and legacy_roundoff_delta=0 and revision=0 and timezone is null and timezone_confirmed_at is null and rules_version='lifequest-v1' and historical='{}');
create policy initial_setup on lifequest.hunter_setup for insert to lifequest_provision_owner
 with check(configuration_status='pending' and origin_choice is null and chosen_at is null and migration_id is null and revision=0);
create policy initial_modules on lifequest.hunter_modules for insert to lifequest_provision_owner
 with check(initialized and schema_version=1 and revision=0 and historical='{}' and collection_counts=case module_code
  when 'system' then '{"quests":0,"arcs":0,"completions":0,"achievements":0}'::jsonb
  when 'operations' then '{"bosses":0,"events":0}'::jsonb
  when 'lab' then '{"ideas":0,"nodes":0,"resources":0,"journal":0,"sessions":0,"challenges":0}'::jsonb
  else '{}'::jsonb end);
create policy initial_settings on lifequest.hunter_settings for insert to lifequest_provision_owner
 with check(version=1 and baseline_xp=0 and baseline_level=1 and historical_stability=100 and last_penalty_day is null and penalty_days='{}' and revision=0 and historical='{}');

-- Deferred structural checks, no reward calculation. Invoker retains RLS.
create function lifequest.check_actor_integrity() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare actor uuid; h record; b record; n bigint; total bigint; done bigint;
begin
 if TG_OP='DELETE' then actor:=OLD.user_id; else actor:=NEW.user_id; end if;
 -- Zero provisioning is already constrained by its separate INSERT policies.
 if current_user in ('lifequest_provision_owner','supabase_auth_admin') then return null; end if;
 select * into h from lifequest.hunters where user_id=actor;
 if not found then raise exception 'INTEGRITY_ACTOR_INVISIBLE' using errcode='23514'; end if;
 if h.timezone is not null and not exists(select 1 from pg_timezone_names where name=h.timezone) then
  raise exception 'TIMEZONE_INVALID' using errcode='23514'; end if;
 if h.total_xp<>h.opening_xp+h.legacy_roundoff_delta+coalesce((select sum(awarded_xp) from lifequest.xp_events where user_id=actor),0) then
  raise exception 'LEDGER_MISMATCH' using errcode='23514'; end if;
 if exists(select 1 from lifequest.xp_events e where e.user_id=actor and e.source_kind='quest'
  and not exists(select 1 from lifequest.quests q where q.user_id=e.user_id and q.id=e.source_id)) then
  raise exception 'QUEST_RECEIPT_ORPHAN' using errcode='23514'; end if;
 for b in select * from lifequest.boss_missions where user_id=actor loop
  select count(*),coalesce(sum(weight),0),coalesce(sum(weight) filter(where completed),0)
   into n,total,done from lifequest.boss_subobjectives where user_id=actor and boss_id=b.id;
  if (b.mode='weighted' and (n not between 1 and 20 or total>1000 or b.target<>total or b.current<>done))
    or (b.mode='counter' and n<>0) then raise exception 'BOSS_STRUCTURE_INVALID' using errcode='23514'; end if;
  if (b.reward_status='credited' and not exists(select 1 from lifequest.xp_events e where e.user_id=actor and e.source_ref='lifequest:activity:boss:'||b.id and e.awarded_xp>0))
    or (b.reward_status='resolved_without_xp' and exists(select 1 from lifequest.xp_events e where e.user_id=actor and e.source_ref='lifequest:activity:boss:'||b.id and e.awarded_xp>0)) then
    raise exception 'BOSS_CREDIT_INVALID' using errcode='23514'; end if;
  if ((b.reward_status in ('pending','credited') or exists(select 1 from lifequest.xp_events e where e.user_id=actor and e.source_ref='lifequest:activity:boss:'||b.id and e.awarded_xp>0))
     and (b.completed_at is null or b.current<>b.target))
   or (b.base_xp>0 and exists(select 1 from lifequest.xp_events e where e.user_id=actor and e.source_ref='lifequest:activity:boss:'||b.id and e.awarded_xp=0)) then
   raise exception 'BOSS_REWARD_INCONSISTENT' using errcode='23514'; end if;
 end loop;
 if exists(select 1 from lifequest.focus_sessions s where s.user_id=actor and s.reward_status='credited'
  and not exists(select 1 from lifequest.xp_events e where e.user_id=actor and e.source_ref='lifequest:activity:focus:'||s.id and e.awarded_xp>0)) then
  raise exception 'FOCUS_CREDIT_INVALID' using errcode='23514'; end if;
 if exists(select 1 from lifequest.focus_sessions s where s.user_id=actor and s.reward_status='pending'
  and exists(select 1 from lifequest.xp_events e where e.user_id=actor and e.source_ref='lifequest:activity:focus:'||s.id and e.awarded_xp=0)) then
  raise exception 'FOCUS_PENDING_ZERO_RECEIPT' using errcode='23514'; end if;
 if exists(with recursive ancestry as (
  select id,parent_id,array[id::text] trail,false cycle from lifequest.mind_nodes where user_id=actor
  union all select a.id,p.parent_id,a.trail||p.id::text,p.id::text=any(a.trail)
   from ancestry a join lifequest.mind_nodes p on p.user_id=actor and p.id=a.parent_id where not a.cycle
 ) select 1 from ancestry where cycle) then raise exception 'MIND_CYCLE' using errcode='23514'; end if;
 return null;
end; $$;
revoke all on function lifequest.check_actor_integrity() from public,anon,authenticated;
grant execute on function lifequest.check_actor_integrity() to lifequest_command_owner,lifequest_provision_owner;
do $$ declare t text; begin
 foreach t in array array['hunters','quests','xp_events','boss_missions','boss_subobjectives','focus_sessions','mind_nodes'] loop
  execute format('create constraint trigger structural_integrity after insert or update or delete on lifequest.%I deferrable initially deferred for each row execute function lifequest.check_actor_integrity()',t);
 end loop;
end $$;
grant create on schema lifequest to lifequest_provision_owner;
reset role;

create function lifequest.provision_hunter() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 insert into lifequest.hunters(user_id) values(NEW.id) on conflict do nothing;
 insert into lifequest.hunter_setup(user_id) values(NEW.id) on conflict do nothing;
 insert into lifequest.hunter_settings(user_id) values(NEW.id) on conflict do nothing;
 insert into lifequest.hunter_modules(user_id,module_code,collection_counts) values
 (NEW.id,'system','{"quests":0,"arcs":0,"completions":0,"achievements":0}'),
 (NEW.id,'operations','{"bosses":0,"events":0}'),
 (NEW.id,'lab','{"ideas":0,"nodes":0,"resources":0,"journal":0,"sessions":0,"challenges":0}'),
 (NEW.id,'settings','{}') on conflict do nothing;
 return NEW;
end; $$;
alter function lifequest.provision_hunter() owner to lifequest_provision_owner;
set local role lifequest_provision_owner;
revoke all on function lifequest.provision_hunter() from public,anon,authenticated;
grant execute on function lifequest.provision_hunter() to postgres;
reset role;
create trigger lifequest_initial_hunter after insert on auth.users for each row execute function lifequest.provision_hunter();
set local role lifequest_provision_owner;
revoke execute on function lifequest.provision_hunter() from postgres;
reset role;
set local role lifequest_schema_owner;
revoke create on schema lifequest from lifequest_provision_owner;
reset role;

-- Proof objects retained, but withdrawn from application roles and Data API profile.
revoke all on schema auth2_proof from authenticated,anon,public;
grant lifequest_auth2_command_owner to postgres with inherit false,set true;
set local role lifequest_auth2_command_owner;
revoke all on function public.auth2_award(uuid,uuid,text,boolean) from public,anon,authenticated;
reset role;
grant lifequest_auth2_command_owner to postgres with inherit false,set false;
-- Remove migration capabilities; Supabase's administrative memberships may remain
-- with SET=false/INHERIT=false, as verified by the real catalog tests.
set local role lifequest_schema_owner;
revoke create on schema lifequest from postgres;
reset role;
grant lifequest_schema_owner,lifequest_command_owner,lifequest_read_owner,lifequest_provision_owner
 to postgres with inherit false,set false;
