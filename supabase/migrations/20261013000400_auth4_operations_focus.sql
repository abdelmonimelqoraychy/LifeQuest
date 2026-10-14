set local role lifequest_schema_owner;
create table lifequest.boss_missions (
 user_id uuid not null references lifequest.hunters(user_id), id lifequest.business_id not null,
 title text not null check(length(btrim(title))>0), objective text not null,
 mode text not null check(mode in ('counter','weighted')),
 target integer not null check(target between 1 and 1000), current integer not null check(current between 0 and target),
 base_xp lifequest.finite_numeric not null check(base_xp between 0 and 300),
 created_at timestamptz not null check(isfinite(created_at)),
 completed_at timestamptz check(completed_at is null or isfinite(completed_at)),
 reward_status text check(reward_status in ('pending','credited','resolved_without_xp')),
 revision bigint not null default 0 check(revision>=0), sort_position bigint not null,
 historical lifequest.historical_metadata not null default '{}', primary key(user_id,id),
 check(completed_at is null or current=target),
 check(reward_status is distinct from 'resolved_without_xp' or (mode='counter' and base_xp=0 and completed_at is not null and current=target)),
 check(mode<>'weighted' or base_xp>=25)
);
create table lifequest.boss_subobjectives (
 user_id uuid not null, boss_id lifequest.business_id not null, id lifequest.business_id not null,
 title text not null check(length(btrim(title))>0), weight integer not null check(weight between 1 and 1000), completed boolean not null,
 revision bigint not null default 0 check(revision>=0), sort_position bigint not null,
 historical lifequest.historical_metadata not null default '{}', primary key(user_id,boss_id,id),
 foreign key(user_id,boss_id) references lifequest.boss_missions(user_id,id)
);
create table lifequest.system_events (
 user_id uuid not null references lifequest.hunters(user_id), id lifequest.business_id not null,
 kind text not null check(kind in ('boss','rank','evolution')), title text not null,
 occurred_at timestamptz not null check(isfinite(occurred_at)), detail text,
 revision bigint not null default 0 check(revision>=0), sort_position bigint not null,
 historical lifequest.historical_metadata not null default '{}', primary key(user_id,id)
);
create table lifequest.focus_runs (
 user_id uuid not null references lifequest.hunters(user_id), id lifequest.business_id not null,
 mode text not null check(mode in ('focus','short','long')),
 status text not null check(status in ('idle','running','paused','completed','cancelled')),
 remaining_seconds integer not null check(remaining_seconds>=0),
 running_since timestamptz check(running_since is null or isfinite(running_since)),
 deadline_at timestamptz check(deadline_at is null or isfinite(deadline_at)),
 accumulated_active_ms bigint not null default 0 check(accumulated_active_ms>=0), label text not null,
 revision bigint not null default 0 check(revision>=0), sort_position bigint not null,
 historical lifequest.historical_metadata not null default '{}', primary key(user_id,id),
 check(remaining_seconds<=case mode when 'focus' then 1500 when 'short' then 300 else 900 end),
 check((status='running' and running_since is not null and deadline_at is not null and deadline_at>=running_since) or
       (status<>'running' and running_since is null and deadline_at is null)),
 check(status<>'completed' or remaining_seconds=0)
);
create table lifequest.focus_sessions (
 user_id uuid not null references lifequest.hunters(user_id), id lifequest.business_id not null,
 run_id lifequest.business_id,
 occurred_at timestamptz not null check(isfinite(occurred_at)),
 minutes lifequest.finite_numeric not null check(minutes between 0 and 1440), label text not null,
 reward_status text check(reward_status in ('pending','credited')),
 revision bigint not null default 0 check(revision>=0), sort_position bigint not null,
 historical lifequest.historical_metadata not null default '{}', primary key(user_id,id),
 foreign key(user_id,run_id) references lifequest.focus_runs(user_id,id),
 check(reward_status is null or minutes=25), check(run_id is null or run_id=id)
);
create index focus_session_run on lifequest.focus_sessions(user_id,run_id);
do $$ declare t text; begin
 foreach t in array array['boss_missions','boss_subobjectives','system_events','focus_runs','focus_sessions'] loop
  execute 'set local role lifequest_schema_owner';
  execute format('alter table lifequest.%I enable row level security',t);
  execute format('alter table lifequest.%I force row level security',t);
  execute format('revoke all on lifequest.%I from public,anon,authenticated',t);
 end loop;
end $$;

reset role;
