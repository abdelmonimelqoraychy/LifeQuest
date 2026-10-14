-- AUTH-4C only. New private activation state; no browser-driven timezone changes.
grant lifequest_schema_owner,lifequest_command_owner to postgres with inherit false,set true;
set local role lifequest_schema_owner;
create table lifequest.calendar_activation (
 zone text primary key, probes jsonb not null check(jsonb_typeof(probes)='array' and jsonb_array_length(probes) between 1 and 8192),
 expected_digest text not null check(expected_digest~'^[0-9a-f]{64}$'),
 range_start timestamptz not null,range_end timestamptz not null,
 validated_at timestamptz not null,expires_at timestamptz not null,
 oracle_version text not null, check(range_end>range_start),
 check(expires_at>validated_at and expires_at<=validated_at+interval '24 hours')
);
alter table lifequest.calendar_activation enable row level security;
alter table lifequest.calendar_activation force row level security;
revoke all on lifequest.calendar_activation from public,anon,authenticated;
grant select on lifequest.calendar_activation to lifequest_command_owner;
create policy internal_calendar_read on lifequest.calendar_activation for select to lifequest_command_owner using(true);
-- No mutation policy/grant for any runtime role. Activation is administration only.
grant create on schema lifequest to lifequest_command_owner;
reset role;
set local role lifequest_command_owner;
alter default privileges revoke execute on functions from public;

create function lifequest.canonical_json(v jsonb) returns text
language plpgsql immutable strict set search_path='' as $$
declare t text;
begin
 case jsonb_typeof(v)
 when 'object' then select '{'||coalesce(string_agg(to_jsonb(key)::text||':'||lifequest.canonical_json(value),',' order by key collate "C"),'')||'}' into t from jsonb_each(v);
 when 'array' then select '['||coalesce(string_agg(lifequest.canonical_json(value),',' order by ord),'')||']' into t from jsonb_array_elements(v) with ordinality x(value,ord);
 when 'number' then t:=trim_scale(v::text::numeric)::text;
 else t:=v::text;end case;return t;
end; $$;
create function lifequest.intent_hash(kind text,payload jsonb) returns text
language sql immutable strict set search_path='' as $$
 select encode(sha256(convert_to(lifequest.canonical_json(jsonb_build_object('version',1,'kind',kind,'payload',payload)),'UTF8')),'hex');
$$;
create function lifequest.calendar_digest(zone text,probes jsonb) returns text
language sql stable strict set search_path='' as $$
 select encode(sha256(convert_to(string_agg(
  stamp||'|'||lifequest.rules_period('daily',stamp::timestamptz,zone)||'|'||
  lifequest.rules_period('weekly',stamp::timestamptz,zone)||'|'||lifequest.rules_period('monthly',stamp::timestamptz,zone)||'|once|'||
  trunc(extract(epoch from (timezone(zone,stamp::timestamptz)-timezone('UTC',stamp::timestamptz))))::text,
  E'\n' order by ord),'UTF8')),'hex')
 from jsonb_array_elements_text(probes) with ordinality x(stamp,ord);
$$;
create function lifequest.calendar_guard(zone text,instant timestamptz) returns void
language plpgsql volatile set search_path='' as $$
declare p record;
begin
 select * into p from lifequest.calendar_activation a where a.zone=calendar_guard.zone;
 if not found or instant<p.range_start or instant>=p.range_end or clock_timestamp()>=p.expires_at
  or lifequest.calendar_digest(zone,p.probes)<>p.expected_digest then
  raise exception 'CALENDAR_UNVERIFIED' using errcode='PT503';end if;
end; $$;
create function lifequest.payload_shape(p jsonb,required text[],optional text[] default '{}') returns void
language plpgsql immutable set search_path='' as $$
begin
 if p is null or jsonb_typeof(p)<>'object' or not p?&required
  or exists(select 1 from jsonb_object_keys(p) k where not k=any(required||optional)) then
  raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
end; $$;
create function lifequest.js_trim(t text) returns text
language sql immutable strict set search_path='' as $$
 select regexp_replace(t,U&'^[\0009-\000d\0020\00a0\1680\2000-\200a\2028\2029\202f\205f\3000\feff]+|[\0009-\000d\0020\00a0\1680\2000-\200a\2028\2029\202f\205f\3000\feff]+$','','g');
$$;
create function lifequest.input_text(p jsonb,key text,bound integer,nonempty boolean default false) returns text
language plpgsql immutable set search_path='' as $$
declare t text; size integer;
begin
 if jsonb_typeof(p->key) is distinct from 'string' then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
 t:=p->>key;
 select coalesce(sum(case when ascii(ch)>65535 then 2 else 1 end),0) into size from regexp_split_to_table(t,'') ch;
 if size>bound or (nonempty and length(lifequest.js_trim(t))=0) then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
 return t;
end; $$;
create function lifequest.target_revision(p jsonb) returns bigint
language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(p->'expectedRevision') is distinct from 'string' or (p->>'expectedRevision')!~'^(0|[1-9][0-9]{0,18})$' then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
 return (p->>'expectedRevision')::bigint;
exception when numeric_value_out_of_range then raise exception 'VALIDATION_FAILED' using errcode='PT400';
end; $$;
create function lifequest.assert_revision(actual bigint,p jsonb) returns void
language plpgsql immutable set search_path='' as $$
begin if actual<>lifequest.target_revision(p) then raise exception 'REVISION_CONFLICT' using errcode='PT409';end if;end; $$;
create function lifequest.module_counts(actor uuid,module text) returns jsonb
language plpgsql volatile set search_path='' as $$
begin
 case module
 when 'system' then return jsonb_build_object('quests',(select count(*) from lifequest.quests where user_id=actor),
  'arcs',(select count(*) from lifequest.story_arcs where user_id=actor),'completions',(select count(*) from lifequest.xp_events where user_id=actor),'achievements',(select count(*) from lifequest.achievement_unlocks where user_id=actor));
 when 'operations' then return jsonb_build_object('bosses',(select count(*) from lifequest.boss_missions where user_id=actor),'events',(select count(*) from lifequest.system_events where user_id=actor));
 when 'lab' then return jsonb_build_object('ideas',(select count(*) from lifequest.ideas where user_id=actor),'nodes',(select count(*) from lifequest.mind_nodes where user_id=actor),
  'resources',(select count(*) from lifequest.resources where user_id=actor),'journal',(select count(*) from lifequest.journal_entries where user_id=actor),
  'sessions',(select count(*) from lifequest.focus_sessions where user_id=actor),'challenges',(select count(*) from lifequest.creativity_challenges where user_id=actor));
 when 'settings' then return '{}'::jsonb;
 else raise exception 'MODULE_INVALID' using errcode='PT409';end case;
end; $$;
create function lifequest.command_begin(expected_actor uuid,request_id uuid,kind text,payload jsonb) returns jsonb
language plpgsql volatile set search_path='' as $$
declare actor uuid; h record; m record; receipt record; instant timestamptz; digest text;
begin
 if request_id is null or expected_actor is null or kind is null or payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>1048576 then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
 perform set_config('lock_timeout','1000ms',true);
 perform lifequest.lock_session();actor:=lifequest.current_actor();
 if actor is distinct from expected_actor then raise exception 'ACTOR_MISMATCH' using errcode='PT403';end if;
 select * into h from lifequest.hunters where user_id=actor for update;
 if not found then raise exception 'ACCOUNT_MISSING' using errcode='PT409';end if;
 instant:=date_trunc('milliseconds',clock_timestamp());
 if lifequest.current_actor() is distinct from actor then raise exception 'SESSION_DENIED' using errcode='42501';end if;
 if h.timezone is null or h.timezone_confirmed_at is null or not exists(select 1 from lifequest.hunter_setup where user_id=actor and configuration_status='ready' and migration_id is null)
  or not exists(select 1 from lifequest.hunter_profiles where user_id=actor and onboarding_completed) then raise exception 'SETUP_PENDING' using errcode='PT409';end if;
 perform lifequest.calendar_guard(h.timezone,instant);
 if (select count(*) from lifequest.hunter_modules where user_id=actor and initialized and schema_version=1)<>4 then raise exception 'MODULE_INVALID' using errcode='PT409';end if;
 for m in select * from lifequest.hunter_modules where user_id=actor loop
  if m.collection_counts<>lifequest.module_counts(actor,m.module_code) then raise exception 'MODULE_INVALID' using errcode='PT409';end if;
 end loop;
 digest:=lifequest.intent_hash(kind,payload);
 select * into receipt from lifequest.command_receipts r where r.user_id=actor and r.request_id=command_begin.request_id;
 if found then
  if receipt.canonical_payload_hash<>digest or receipt.command_kind<>kind then raise exception 'REQUEST_ID_CONFLICT' using errcode='PT409';end if;
  return jsonb_build_object('replay',receipt.minimal_result||jsonb_build_object('replayed',true));
 end if;
 return jsonb_build_object('actor',actor,'request',request_id,'kind',kind,'hash',digest,'now',instant,'zone',h.timezone,'revision',h.revision::text,'started',clock_timestamp());
end; $$;
create function lifequest.command_end(ctx jsonb,changed boolean,modules text[],detail jsonb,outcome text default 'applied') returns jsonb
language plpgsql volatile set search_path='' as $$
declare actor uuid:=(ctx->>'actor')::uuid; rev bigint; module text; result jsonb;
begin
 if lifequest.current_actor() is distinct from actor then raise exception 'SESSION_DENIED' using errcode='42501';end if;
 if clock_timestamp()>(ctx->>'started')::timestamptz+interval '5 seconds' then raise exception 'COMMAND_TIMEOUT' using errcode='57014';end if;
 perform lifequest.calendar_guard(ctx->>'zone',clock_timestamp());
 if changed then
  update lifequest.hunters set revision=revision+1 where user_id=actor returning revision into rev;
  foreach module in array modules loop
   update lifequest.hunter_modules set collection_counts=lifequest.module_counts(actor,module),revision=revision+1 where user_id=actor and module_code=module;
  end loop;
 else rev:=(ctx->>'revision')::bigint;end if;
 result:=jsonb_build_object('actor',actor,'requestId',ctx->>'request','committedRevision',rev::text,'outcome',case when changed then outcome else 'noop' end,'replayed',false,'result',detail);
 insert into lifequest.command_receipts(user_id,request_id,command_kind,canonical_payload_hash,minimal_result,committed_revision,committed_at)
 values(actor,(ctx->>'request')::uuid,ctx->>'kind',ctx->>'hash',result,rev,(ctx->>'now')::timestamptz);
 -- Force deferred structural checks before the last identity/calendar validation.
 set constraints all immediate;
 if lifequest.current_actor() is distinct from actor then raise exception 'SESSION_DENIED' using errcode='42501';end if;
 perform lifequest.calendar_guard(ctx->>'zone',clock_timestamp());
 return result;
end; $$;
create function lifequest.next_position(actor uuid,collection text,prepend boolean default false) returns bigint
language plpgsql volatile set search_path='' as $$
declare n bigint;
begin
 if collection<>all(array['quests','story_arcs','xp_events','achievement_unlocks','boss_missions','system_events','focus_runs','focus_sessions','ideas','mind_nodes','resources','journal_entries','creativity_challenges']) then raise exception 'COLLECTION_INVALID';end if;
 execute format('select coalesce(%s(sort_position),0)%s1 from lifequest.%I where user_id=$1',case when prepend then 'min' else 'max' end,case when prepend then '-' else '+' end,collection) into n using actor;
 return n;
end; $$;
create function lifequest.sync_titles(actor uuid,zone text,instant timestamptz) returns integer
language plpgsql volatile set search_path='' as $$
declare items jsonb; ids text[]; title text; n integer:=0; lvl integer;
begin
 select coalesce(jsonb_agg(jsonb_build_object('questId',source_ref,'completedAt',occurred_at,'attribute',attribute,'xpAwarded',awarded_xp) order by sort_position,id),'[]') into items from lifequest.xp_events where user_id=actor;
 select (lifequest.rules_progress(total_xp::double precision)->>'level')::integer into lvl from lifequest.hunters where user_id=actor;
 ids:=lifequest.rules_achievements(items,lvl,zone);
 foreach title in array ids loop
  if not exists(select 1 from lifequest.achievement_unlocks where user_id=actor and achievement_id=title) then
   insert into lifequest.achievement_unlocks(user_id,achievement_id,unlocked_at,sort_position) values(actor,title,instant,lifequest.next_position(actor,'achievement_unlocks'));n:=n+1;
  end if;
 end loop;return n;
end; $$;
create function lifequest.credit(actor uuid,source text,source_id text,period text,base numeric,attribute text,instant timestamptz,zone text,title text,arc text default null) returns jsonb
language plpgsql volatile set search_path='' as $$
declare receipt record; days date[]; streak integer; reward integer; before_level integer; after_level integer; ident text:=gen_random_uuid()::text;
 ref text:=case when source='quest' then source_id else 'lifequest:activity:'||source||':'||source_id end;
begin
 if source<>all(array['quest','boss','focus']) then raise exception 'SOURCE_INVALID';end if;
 select * into receipt from lifequest.xp_events where user_id=actor and source_ref=ref and period_key=period;
 if found then return jsonb_build_object('credited',false,'xp',receipt.awarded_xp::text,'receiptId',receipt.id);end if;
 -- Refuse finite numeric values not representable by the tested JS/float8 path.
 select (lifequest.rules_progress(total_xp::double precision)->>'level')::integer into before_level from lifequest.hunters where user_id=actor;
 select coalesce(array_agg((occurred_at at time zone zone)::date),'{}') into days from lifequest.xp_events where user_id=actor and source_kind='quest';
 streak:=lifequest.rules_streak(days,(instant at time zone zone)::date);reward:=lifequest.rules_reward(base,streak);
 insert into lifequest.xp_events(user_id,id,source_ref,source_id,source_kind,period_key,awarded_xp,attribute,occurred_at,title_snapshot,arc_id_snapshot,rules_version,provenance,sort_position)
 values(actor,ident,ref,source_id,source,period,reward,attribute,instant,title,arc,'lifequest-v1','cloud',lifequest.next_position(actor,'xp_events'));
 update lifequest.hunters set total_xp=total_xp+reward where user_id=actor;
 select (lifequest.rules_progress(total_xp::double precision)->>'level')::integer into after_level from lifequest.hunters where user_id=actor;
 perform lifequest.sync_titles(actor,zone,instant);
 return jsonb_build_object('credited',true,'xp',reward::text,'receiptId',ident,'levelBefore',before_level,'levelAfter',after_level);
end; $$;

-- New helpers are never callable by browser roles, including future default ACLs.
do $$ declare f record;begin for f in select oid::regprocedure signature from pg_proc where pronamespace='lifequest'::regnamespace and proowner='lifequest_command_owner'::regrole loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);end loop;end $$;
reset role;
set local role lifequest_schema_owner;
revoke create on schema lifequest from lifequest_command_owner;
reset role;
grant lifequest_schema_owner,lifequest_command_owner to postgres with inherit false,set false;
