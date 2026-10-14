-- Six Lab collections: focus_sessions was defined in migration 4.
set local role lifequest_schema_owner;
create table lifequest.ideas (
 user_id uuid not null references lifequest.hunters(user_id), id lifequest.business_id not null,
 title text not null, content text not null, tag text not null, archived boolean not null,
 created_at timestamptz not null check(isfinite(created_at)),
 revision bigint not null default 0 check(revision>=0), sort_position bigint not null,
 historical lifequest.historical_metadata not null default '{}', primary key(user_id,id)
);
create table lifequest.mind_nodes (
 user_id uuid not null references lifequest.hunters(user_id), id lifequest.business_id not null,
 parent_id lifequest.business_id, title text not null,
 x double precision not null check(x>'-Infinity'::float8 and x<'Infinity'::float8),
 y double precision not null check(y>'-Infinity'::float8 and y<'Infinity'::float8),
 revision bigint not null default 0 check(revision>=0), sort_position bigint not null,
 historical lifequest.historical_metadata not null default '{}', primary key(user_id,id),
 foreign key(user_id,parent_id) references lifequest.mind_nodes(user_id,id) deferrable initially deferred,
 check(parent_id is null or parent_id<>id)
);
create table lifequest.resources (
 user_id uuid not null references lifequest.hunters(user_id), id lifequest.business_id not null,
 title text not null, notes text not null, url text not null default '' check(lifequest.resource_url_allowed(url)),
 topic text not null, mastered boolean not null,
 created_at timestamptz not null check(isfinite(created_at)),
 revision bigint not null default 0 check(revision>=0), sort_position bigint not null,
 historical lifequest.historical_metadata not null default '{}', primary key(user_id,id)
);
create table lifequest.journal_entries (
 user_id uuid not null references lifequest.hunters(user_id), id lifequest.business_id not null,
 local_date date not null check(isfinite(local_date)), wins text not null, challenges text not null, gratitude text not null, tomorrow text not null,
 revision bigint not null default 0 check(revision>=0), sort_position bigint not null,
 historical lifequest.historical_metadata not null default '{}', primary key(user_id,id), unique(user_id,local_date)
);
create table lifequest.creativity_challenges (
 user_id uuid not null references lifequest.hunters(user_id), id lifequest.business_id not null,
 prompt text not null, response text not null, occurred_at timestamptz not null check(isfinite(occurred_at)), completed boolean not null,
 revision bigint not null default 0 check(revision>=0), sort_position bigint not null,
 historical lifequest.historical_metadata not null default '{}', primary key(user_id,id)
);
create index mind_actor_parent on lifequest.mind_nodes(user_id,parent_id);
do $$ declare t text; begin
 foreach t in array array['ideas','mind_nodes','resources','journal_entries','creativity_challenges'] loop
  execute 'set local role lifequest_schema_owner';
  execute format('alter table lifequest.%I enable row level security',t);
  execute format('alter table lifequest.%I force row level security',t);
  execute format('revoke all on lifequest.%I from public,anon,authenticated',t);
 end loop;
end $$;

reset role;
