-- AUTH-5: durable onboarding and introduction checkpoints; no reward path.
grant lifequest_schema_owner to postgres with inherit false, set true;
set local role lifequest_schema_owner;

create table lifequest.onboarding_progress (
  user_id uuid primary key references lifequest.hunters(user_id),
  schema_version integer not null default 1 check(schema_version=1),
  step text not null default 'intro' check(step in ('intro','identity','avatar','goals','review','complete')),
  draft jsonb not null default '{}'::jsonb check(jsonb_typeof(draft)='object' and octet_length(draft::text)<=16384),
  revision bigint not null default 0 check(revision>=0),
  updated_at timestamptz not null default clock_timestamp() check(isfinite(updated_at)),
  completed_at timestamptz check(completed_at is null or isfinite(completed_at)),
  check((step='complete')=(completed_at is not null))
);
create table lifequest.cinematic_progress (
  user_id uuid not null references lifequest.hunters(user_id),
  cinematic_code text not null check(cinematic_code in ('intro-v1','activation-v1','level-5-v1','level-10-v1','level-20-v1')),
  resume_seconds numeric not null default 0 check(resume_seconds between 0 and 3600),
  outcome text check(outcome in ('ended','skipped','error_dismissed','legacy_acknowledged')),
  consumed_at timestamptz check(consumed_at is null or isfinite(consumed_at)),
  watched_completed_at timestamptz check(watched_completed_at is null or isfinite(watched_completed_at)),
  revision bigint not null default 0 check(revision>=0),
  primary key(user_id,cinematic_code),
  check((outcome is null)=(consumed_at is null)),
  check((watched_completed_at is null) or outcome='ended')
);
alter table lifequest.onboarding_progress enable row level security;
alter table lifequest.onboarding_progress force row level security;
alter table lifequest.cinematic_progress enable row level security;
alter table lifequest.cinematic_progress force row level security;
revoke all on lifequest.onboarding_progress,lifequest.cinematic_progress from public,anon,authenticated;
create policy auth5_onboarding_actor on lifequest.onboarding_progress for all to lifequest_read_owner
 using(user_id=(select lifequest.current_actor())) with check(user_id=(select lifequest.current_actor()));
create policy auth5_cinematic_actor on lifequest.cinematic_progress for all to lifequest_read_owner
 using(user_id=(select lifequest.current_actor())) with check(user_id=(select lifequest.current_actor()));
grant select,insert,update on lifequest.onboarding_progress,lifequest.cinematic_progress to lifequest_read_owner;
create policy auth5_hunter_update on lifequest.hunters for update to lifequest_read_owner
 using(user_id=(select lifequest.current_actor())) with check(user_id=(select lifequest.current_actor()));
create policy auth5_setup_update on lifequest.hunter_setup for update to lifequest_read_owner
 using(user_id=(select lifequest.current_actor())) with check(user_id=(select lifequest.current_actor()));
create policy auth5_profile_insert on lifequest.hunter_profiles for insert to lifequest_read_owner
 with check(user_id=(select lifequest.current_actor()));
create policy auth5_receipt_insert on lifequest.command_receipts for insert to lifequest_read_owner
 with check(user_id=(select lifequest.current_actor()));
grant update(timezone,timezone_confirmed_at,revision) on lifequest.hunters to lifequest_read_owner;
grant update(origin_choice,chosen_at,configuration_status,revision) on lifequest.hunter_setup to lifequest_read_owner;
grant insert(user_id,name,age,gender,avatar,goals,onboarding_completed,original_created_at) on lifequest.hunter_profiles to lifequest_read_owner;
grant insert(user_id,request_id,command_kind,canonical_payload_hash,minimal_result,committed_revision,committed_at) on lifequest.command_receipts to lifequest_read_owner;
grant execute on function lifequest.check_actor_integrity() to lifequest_read_owner;
reset role;
grant execute on function lifequest.lock_session() to lifequest_read_owner;
set local role lifequest_schema_owner;
revoke create on schema lifequest from lifequest_read_owner;
reset role;
grant lifequest_read_owner to postgres with inherit false,set true;
grant create on schema public to lifequest_read_owner;
set local role lifequest_read_owner;
alter default privileges revoke execute on functions from public;

create function public.lifequest_auth5_state(expected_actor uuid) returns jsonb
language plpgsql stable security definer set search_path='' set statement_timeout='5s' as $$
declare actor uuid; h record; s record; p record; o record; c record;
begin
 actor:=lifequest.current_actor();
 if actor is null then raise exception 'SESSION_EXPIRED' using errcode='42501';end if;
 if expected_actor is null or actor<>expected_actor then raise exception 'ACTOR_MISMATCH' using errcode='42501';end if;
 select * into h from lifequest.hunters where user_id=actor;
 if not found then raise exception 'ACCOUNT_MISSING' using errcode='PT409';end if;
 select * into s from lifequest.hunter_setup where user_id=actor;
 if not found then raise exception 'SNAPSHOT_INCONSISTENT' using errcode='PT409';end if;
 select * into p from lifequest.hunter_profiles where user_id=actor;
 if s.configuration_status='ready' and found and p.onboarding_completed then
   select * into c from lifequest.cinematic_progress where user_id=actor and cinematic_code='activation-v1';
   select * into o from lifequest.onboarding_progress where user_id=actor;
   return jsonb_build_object('schemaVersion',1,'actor',actor,'state','ready','step','complete',
     'activationRequired',o.completed_at is not null and c.consumed_at is null,
     'activation',jsonb_build_object('resumeSeconds',coalesce(c.resume_seconds,0)::text,'consumed',c.consumed_at is not null));
 end if;
 if s.configuration_status<>'pending' or found then
   return jsonb_build_object('schemaVersion',1,'actor',actor,'state',case when s.configuration_status='pending' then 'onboarding_pending' else s.configuration_status end);
 end if;
 select * into o from lifequest.onboarding_progress where user_id=actor;
 select * into c from lifequest.cinematic_progress where user_id=actor and cinematic_code='intro-v1';
 return jsonb_build_object('schemaVersion',1,'actor',actor,'state','onboarding_pending',
   'step',coalesce(o.step,'intro'),'draft',coalesce(o.draft,'{}'::jsonb),
   'revision',coalesce(o.revision,0)::text,'video',jsonb_build_object(
    'resumeSeconds',coalesce(c.resume_seconds,0)::text,'consumed',c.consumed_at is not null,
    'outcome',c.outcome));
end; $$;
revoke all on function public.lifequest_auth5_state(uuid) from public,anon,authenticated;
grant execute on function public.lifequest_auth5_state(uuid) to authenticated;

create function public.lifequest_auth5_command(expected_actor uuid,request_id uuid,kind text,payload jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' set statement_timeout='5s' as $$
declare actor uuid; h record; s record; o record; old_receipt record; now_at timestamptz:=date_trunc('milliseconds',clock_timestamp());
        result jsonb; digest text; step_name text; draft_value jsonb; name_value text; age_value integer;
        gender_value text; avatar_value text; goals_value text[]; next_step text; seconds_value numeric;
begin
 if expected_actor is null or request_id is null or kind is null or payload is null or jsonb_typeof(payload)<>'object'
   or octet_length(payload::text)>32768 then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
 perform lifequest.lock_session(); actor:=lifequest.current_actor();
 if actor is distinct from expected_actor then raise exception 'ACTOR_MISMATCH' using errcode='PT403';end if;
 select * into h from lifequest.hunters where user_id=actor for update;
 if not found then raise exception 'ACCOUNT_MISSING' using errcode='PT409';end if;
 if kind='onboarding.complete' then
   select * into old_receipt from lifequest.command_receipts where user_id=actor and request_id=lifequest_auth5_command.request_id;
   if found then
     digest:=encode(sha256(convert_to(jsonb_build_object('version',1,'kind',kind,'payload',payload)::text,'UTF8')),'hex');
     if old_receipt.command_kind<>kind or old_receipt.canonical_payload_hash<>digest then raise exception 'REQUEST_ID_CONFLICT' using errcode='PT409';end if;
     return old_receipt.minimal_result||jsonb_build_object('replayed',true);
   end if;
 end if;
 select * into s from lifequest.hunter_setup where user_id=actor for update;
 if not found then raise exception 'SNAPSHOT_INCONSISTENT' using errcode='PT409';end if;
 if s.configuration_status='ready' and exists(select 1 from lifequest.hunter_profiles where user_id=actor and onboarding_completed) then
   if kind not in ('activation.checkpoint','activation.finish') then
     if kind='onboarding.complete' then raise exception 'REQUEST_ID_CONFLICT' using errcode='PT409';end if;
     return jsonb_build_object('actor',actor,'state','ready','existing',true);
   end if;
 end if;
 if kind not in ('activation.checkpoint','activation.finish') then
   if s.configuration_status<>'pending' or exists(select 1 from lifequest.hunter_profiles where user_id=actor) then raise exception 'SETUP_PENDING' using errcode='PT409';end if;
   insert into lifequest.onboarding_progress(user_id) values(actor) on conflict(user_id) do nothing;
 end if;
 select * into o from lifequest.onboarding_progress where user_id=actor for update;
 if kind in ('video.checkpoint','activation.checkpoint') then
   perform lifequest.payload_shape(payload,array['seconds']);
   if kind='activation.checkpoint' and not (s.configuration_status='ready' and o.completed_at is not null and exists(select 1 from lifequest.hunter_profiles where user_id=actor and onboarding_completed)) then raise exception 'SETUP_PENDING' using errcode='PT409';end if;
   if jsonb_typeof(payload->'seconds')<>'number' then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
   seconds_value:=(payload->>'seconds')::numeric;
   if seconds_value<0 or seconds_value>3600 or seconds_value::text in ('NaN','Infinity','-Infinity') then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
   insert into lifequest.cinematic_progress(user_id,cinematic_code,resume_seconds) values(actor,case when kind='activation.checkpoint' then 'activation-v1' else 'intro-v1' end,seconds_value)
   on conflict(user_id,cinematic_code) do update set resume_seconds=excluded.resume_seconds,revision=lifequest.cinematic_progress.revision+1
   where lifequest.cinematic_progress.consumed_at is null;
   result:=jsonb_build_object('actor',actor,'state','onboarding_pending','saved',true);
 elsif kind in ('video.finish','activation.finish') then
   perform lifequest.payload_shape(payload,array['outcome']);
   if kind='activation.finish' and not (s.configuration_status='ready' and o.completed_at is not null and exists(select 1 from lifequest.hunter_profiles where user_id=actor and onboarding_completed)) then raise exception 'SETUP_PENDING' using errcode='PT409';end if;
   if payload->>'outcome' not in ('ended','skipped','error_dismissed') then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
   insert into lifequest.cinematic_progress(user_id,cinematic_code,outcome,consumed_at,watched_completed_at)
   values(actor,case when kind='activation.finish' then 'activation-v1' else 'intro-v1' end,payload->>'outcome',now_at,case when payload->>'outcome'='ended' then now_at else null end)
   on conflict(user_id,cinematic_code) do update set outcome=coalesce(lifequest.cinematic_progress.outcome,excluded.outcome),
    consumed_at=coalesce(lifequest.cinematic_progress.consumed_at,excluded.consumed_at),
    watched_completed_at=coalesce(lifequest.cinematic_progress.watched_completed_at,excluded.watched_completed_at),
    revision=lifequest.cinematic_progress.revision+1;
   if kind='video.finish' then
     update lifequest.onboarding_progress set step=case when step='intro' then 'identity' else step end,revision=revision+1,updated_at=now_at where user_id=actor;
     result:=jsonb_build_object('actor',actor,'state','onboarding_pending','step',case when o.step='intro' then 'identity' else o.step end);
   else result:=jsonb_build_object('actor',actor,'state','ready','activationConsumed',true);end if;
 elsif kind='draft.save' then
   perform lifequest.payload_shape(payload,array['step','draft']);
   if not exists(select 1 from lifequest.cinematic_progress where user_id=actor and cinematic_code='intro-v1' and consumed_at is not null) then raise exception 'ONBOARDING_STEP_LOCKED' using errcode='PT409';end if;
   step_name:=payload->>'step'; draft_value:=payload->'draft';
   if step_name not in ('identity','avatar','goals','review') or jsonb_typeof(draft_value)<>'object'
     or octet_length(draft_value::text)>16384 then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
   if exists(select 1 from jsonb_object_keys(draft_value) k where k not in ('name','age','gender','avatar','goals','timezone')) then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
   if array_position(array['identity','avatar','goals','review'],step_name)>array_position(array['identity','avatar','goals','review'],o.step)
      and array_position(array['identity','avatar','goals','review'],step_name)>array_position(array['identity','avatar','goals','review'],o.step)+1 then
     raise exception 'ONBOARDING_STEP_LOCKED' using errcode='PT409';end if;
   if step_name<>'identity' then
     name_value:=lifequest.js_trim(lifequest.input_text(draft_value,'name',40,true));
     if jsonb_typeof(draft_value->'age')<>'number' or (draft_value->>'age')!~'^(1[3-9]|[2-9][0-9]|1[01][0-9]|120)$' then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
     age_value:=(draft_value->>'age')::integer;
     gender_value:=draft_value->>'gender';
     if gender_value not in ('male','female','other','prefer_not_to_say') then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
   end if;
   if step_name in ('goals','review') and draft_value->>'avatar' not in ('male','female') then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
   if step_name='review' then
     if jsonb_typeof(draft_value->'goals')<>'array' or jsonb_array_length(draft_value->'goals') not between 1 and 6
       or exists(select 1 from jsonb_array_elements_text(draft_value->'goals') g where g not in ('Études & apprentissage','Développement de projets','Sport & bien-être','Lecture','Concentration','Gestion du temps'))
       or (select count(*) from jsonb_array_elements_text(draft_value->'goals'))<>(select count(distinct g) from jsonb_array_elements_text(draft_value->'goals') g)
       or jsonb_typeof(draft_value->'timezone')<>'string' or not exists(select 1 from pg_timezone_names where name=draft_value->>'timezone') then
       raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
   end if;
   update lifequest.onboarding_progress set step=step_name,draft=draft_value,revision=revision+1,updated_at=now_at where user_id=actor returning * into o;
   result:=jsonb_build_object('actor',actor,'state','onboarding_pending','step',o.step,'revision',o.revision::text,'saved',true);
 elsif kind='onboarding.complete' then
   perform lifequest.payload_shape(payload,array['draft']); draft_value:=payload->'draft';
   if o.step<>'review' or draft_value is distinct from o.draft or not exists(select 1 from lifequest.cinematic_progress where user_id=actor and cinematic_code='intro-v1' and consumed_at is not null) then raise exception 'ONBOARDING_INCOMPLETE' using errcode='PT409';end if;
   if jsonb_object_length(draft_value)<>6 then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
   if exists(select 1 from jsonb_object_keys(draft_value) k where k not in ('name','age','gender','avatar','goals','timezone')) then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
   name_value:=lifequest.js_trim(lifequest.input_text(draft_value,'name',40,true));
   if jsonb_typeof(draft_value->'age')<>'number' or (draft_value->>'age')!~'^(1[3-9]|[2-9][0-9]|1[01][0-9]|120)$' then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
   age_value:=(draft_value->>'age')::integer;gender_value:=draft_value->>'gender';avatar_value:=draft_value->>'avatar';
   if gender_value not in ('male','female','other','prefer_not_to_say') or avatar_value not in ('male','female')
     or jsonb_typeof(draft_value->'goals')<>'array' or jsonb_array_length(draft_value->'goals') not between 1 and 6
     or exists(select 1 from jsonb_array_elements_text(draft_value->'goals') g where g not in ('Études & apprentissage','Développement de projets','Sport & bien-être','Lecture','Concentration','Gestion du temps'))
     or (select count(*) from jsonb_array_elements_text(draft_value->'goals'))<>(select count(distinct g) from jsonb_array_elements_text(draft_value->'goals') g)
     or jsonb_typeof(draft_value->'timezone')<>'string' or not exists(select 1 from pg_timezone_names where name=draft_value->>'timezone') then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
   if h.total_xp<>0 or h.opening_xp<>0 or h.legacy_roundoff_delta<>0 or exists(select 1 from lifequest.xp_events where user_id=actor)
     or exists(select 1 from lifequest.quests where user_id=actor) or exists(select 1 from lifequest.story_arcs where user_id=actor)
     or exists(select 1 from lifequest.boss_missions where user_id=actor) or exists(select 1 from lifequest.focus_sessions where user_id=actor)
     then raise exception 'SNAPSHOT_INCONSISTENT' using errcode='PT409';end if;
   insert into lifequest.hunter_profiles(user_id,name,age,gender,avatar,goals,onboarding_completed,original_created_at)
    values(actor,name_value,age_value,gender_value,avatar_value,array(select jsonb_array_elements_text(draft_value->'goals')),true,now_at);
   update lifequest.hunters set timezone=draft_value->>'timezone',timezone_confirmed_at=now_at,revision=revision+1 where user_id=actor;
   update lifequest.hunter_setup set origin_choice='new',chosen_at=now_at,configuration_status='ready',revision=revision+1 where user_id=actor;
   update lifequest.onboarding_progress set step='complete',completed_at=now_at,revision=revision+1,updated_at=now_at where user_id=actor;
   insert into lifequest.cinematic_progress(user_id,cinematic_code) values(actor,'activation-v1') on conflict do nothing;
   result:=jsonb_build_object('actor',actor,'state','ready','requestId',request_id,'committedRevision',(h.revision+1)::text,'replayed',false,
     'initial',jsonb_build_object('totalXP','0','progress',jsonb_build_object('level',1,'current',0,'required',200,'percent',0),'rank','E'));
   digest:=encode(sha256(convert_to(jsonb_build_object('version',1,'kind',kind,'payload',payload)::text,'UTF8')),'hex');
   insert into lifequest.command_receipts(user_id,request_id,command_kind,canonical_payload_hash,minimal_result,committed_revision,committed_at)
    values(actor,request_id,kind,digest,result,(h.revision+1),now_at);
   set constraints all immediate;
 else raise exception 'COMMAND_UNKNOWN' using errcode='PT400';
 end if;
 if lifequest.current_actor() is distinct from actor then raise exception 'SESSION_DENIED' using errcode='42501';end if;
 return result;
end; $$;
revoke all on function public.lifequest_auth5_command(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.lifequest_auth5_command(uuid,uuid,text,jsonb) to authenticated;
reset role;
revoke create on schema public from lifequest_read_owner;
grant lifequest_read_owner to postgres with inherit false,set false;
grant lifequest_schema_owner to postgres with inherit false,set false;
