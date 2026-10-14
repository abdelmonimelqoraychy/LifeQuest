set local role lifequest_schema_owner;
create table lifequest.story_arcs (
 user_id uuid not null references lifequest.hunters(user_id), id lifequest.business_id not null,
 title text not null, description text not null, target_date date not null check (isfinite(target_date)),
 created_at timestamptz not null check (isfinite(created_at)),
 revision bigint not null default 0 check(revision>=0), sort_position bigint not null,
 historical lifequest.historical_metadata not null default '{}', primary key(user_id,id)
);
create table lifequest.quests (
 user_id uuid not null references lifequest.hunters(user_id), id lifequest.business_id not null check(id not like 'lifequest:activity:%'),
 arc_id lifequest.business_id, title text not null, description text not null,
 frequency text not null check(frequency in ('daily','weekly','monthly','once')),
 difficulty text not null check(difficulty in ('EASY','NORMAL','HARD')),
 attribute lifequest.attribute_code not null,
 base_xp lifequest.finite_numeric not null check(base_xp between 0 and 300),
 archived boolean not null default false,
 created_at timestamptz not null check(isfinite(created_at)),
 target_date date check(target_date is null or isfinite(target_date)),
 available_after date check(available_after is null or isfinite(available_after)),
 revision bigint not null default 0 check(revision>=0), sort_position bigint not null,
 historical lifequest.historical_metadata not null default '{}', primary key(user_id,id),
 foreign key(user_id,arc_id) references lifequest.story_arcs(user_id,id)
);
create table lifequest.xp_events (
 user_id uuid not null references lifequest.hunters(user_id), id lifequest.business_id not null,
 source_ref lifequest.business_id not null, source_id lifequest.business_id not null,
 source_kind text not null check(source_kind in ('quest','focus','boss','legacy_activity')),
 period_key text not null check(length(period_key)>0),
 awarded_xp lifequest.finite_numeric not null check(awarded_xp>=0), attribute lifequest.attribute_code not null,
 occurred_at timestamptz not null check(isfinite(occurred_at)), title_snapshot text, arc_id_snapshot text,
 rules_version text not null, provenance text not null check(provenance in ('cloud','legacy')),
 revision bigint not null default 0 check(revision>=0), sort_position bigint not null,
 historical lifequest.historical_metadata not null default '{}', primary key(user_id,id),
 unique(user_id,source_ref,period_key),
 check((source_kind='quest' and source_ref=source_id and source_ref not like 'lifequest:activity:%')
   or (source_kind='focus' and source_ref='lifequest:activity:focus:'||source_id and period_key='once' and attribute='focus')
   or (source_kind='boss' and source_ref='lifequest:activity:boss:'||source_id and period_key='once' and attribute='discipline')
   or (source_kind='legacy_activity' and provenance='legacy' and source_ref like 'lifequest:activity:%' and period_key='once'))
);
create table lifequest.achievement_unlocks (
 user_id uuid not null references lifequest.hunters(user_id),
 achievement_id text not null check(achievement_id in ('first-clear','quest-veteran','discipline-master','rank-d-hunter','rank-s-hunter','seven-day-streak')),
 unlocked_at timestamptz not null check(isfinite(unlocked_at)),
 revision bigint not null default 0 check(revision>=0), sort_position bigint not null,
 historical lifequest.historical_metadata not null default '{}', primary key(user_id,achievement_id)
);
create table lifequest.command_receipts (
 user_id uuid not null references lifequest.hunters(user_id), request_id uuid not null,
 command_kind text not null check(length(command_kind)>0),
 canonical_payload_hash text not null check(canonical_payload_hash ~ '^[0-9a-f]{64}$'),
 minimal_result jsonb not null check(jsonb_typeof(minimal_result)='object'),
 committed_revision bigint not null check(committed_revision>=0),
 committed_at timestamptz not null check(isfinite(committed_at)), primary key(user_id,request_id)
);
create index quests_actor_arc on lifequest.quests(user_id,arc_id);
create index quests_actor_archive_frequency on lifequest.quests(user_id,archived,frequency);
create index xp_actor_time on lifequest.xp_events(user_id,occurred_at);
create index xp_actor_period on lifequest.xp_events(user_id,period_key);
create index receipts_actor_time on lifequest.command_receipts(user_id,committed_at);
do $$ declare t text; begin
 foreach t in array array['story_arcs','quests','xp_events','achievement_unlocks','command_receipts'] loop
  execute 'set local role lifequest_schema_owner';
  execute format('alter table lifequest.%I enable row level security',t);
  execute format('alter table lifequest.%I force row level security',t);
  execute format('revoke all on lifequest.%I from public,anon,authenticated',t);
 end loop;
end $$;

reset role;
