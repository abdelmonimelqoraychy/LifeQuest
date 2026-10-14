-- Auth references created by migration login, not a runtime role.
set local role lifequest_schema_owner;
grant usage, create on schema lifequest to postgres;
reset role;
create table lifequest.hunters (
  user_id uuid primary key references auth.users(id),
  total_xp lifequest.finite_numeric not null default 0 check (total_xp >= 0),
  opening_xp lifequest.finite_numeric not null default 0 check (opening_xp >= 0),
  legacy_roundoff_delta lifequest.finite_numeric not null default 0,
  timezone text, timezone_confirmed_at timestamptz,
  rules_version text not null default 'lifequest-v1',
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default clock_timestamp() check (isfinite(created_at)),
  historical lifequest.historical_metadata not null default '{}',
  check ((timezone is null) = (timezone_confirmed_at is null)),
  check (timezone_confirmed_at is null or isfinite(timezone_confirmed_at))
);
create table lifequest.hunter_setup (
  user_id uuid primary key references lifequest.hunters(user_id),
  origin_choice text check (origin_choice in ('new','legacy')),
  chosen_at timestamptz check (chosen_at is null or isfinite(chosen_at)), migration_id uuid,
  configuration_status text not null default 'pending' check (configuration_status in ('pending','ready','migration_pending','recovery_required')),
  revision bigint not null default 0 check (revision >= 0),
  check ((origin_choice is null) = (chosen_at is null)),
  check (migration_id is null or coalesce(origin_choice = 'legacy',false))
);
create table lifequest.hunter_modules (
  user_id uuid not null references lifequest.hunters(user_id),
  module_code text not null check (module_code in ('system','operations','lab','settings')),
  schema_version integer not null default 1 check (schema_version = 1),
  initialized boolean not null default true,
  revision bigint not null default 0 check (revision >= 0),
  collection_counts jsonb not null check (lifequest.module_counts_allowed(module_code,collection_counts)),
  historical lifequest.historical_metadata not null default '{}',
  primary key(user_id,module_code)
);
create table lifequest.hunter_profiles (
  user_id uuid primary key references lifequest.hunters(user_id),
  name text not null check (length(name) between 1 and 40 and length(btrim(name)) > 0),
  age integer not null check (age between 13 and 120),
  gender text not null check (gender in ('male','female','other','prefer_not_to_say')),
  avatar text not null check (avatar in ('male','female')),
  goals text[] not null check (array_position(goals,null) is null),
  onboarding_completed boolean not null check (onboarding_completed),
  original_created_at timestamptz not null check (isfinite(original_created_at)),
  revision bigint not null default 0 check (revision >= 0),
  historical lifequest.historical_metadata not null default '{}'
);
create table lifequest.hunter_settings (
  user_id uuid primary key references lifequest.hunters(user_id),
  version integer not null default 1 check (version = 1),
  baseline_xp lifequest.finite_numeric not null default 0 check (baseline_xp >= 0),
  baseline_level integer not null default 1 check (baseline_level between 1 and 100),
  historical_stability lifequest.finite_numeric not null default 100 check (historical_stability between 0 and 100),
  last_penalty_day date check (last_penalty_day is null or isfinite(last_penalty_day)),
  penalty_days date[] not null default '{}' check (lifequest.days_allowed(penalty_days)),
  initialized_at timestamptz not null default clock_timestamp() check (isfinite(initialized_at)),
  revision bigint not null default 0 check (revision >= 0),
  historical lifequest.historical_metadata not null default '{}'
);
-- Default deny until complete policies in migration 6; no exposure between migrations.
do $$ declare t text; begin
  foreach t in array array['hunters','hunter_setup','hunter_modules','hunter_profiles','hunter_settings'] loop
    execute format('alter table lifequest.%I owner to lifequest_schema_owner', t);
    execute 'set local role lifequest_schema_owner';
    execute format('alter table lifequest.%I enable row level security', t);
    execute format('alter table lifequest.%I force row level security', t);
    execute format('revoke all on lifequest.%I from public, anon, authenticated', t);
    execute 'reset role';
  end loop;
end $$;
reset role;
