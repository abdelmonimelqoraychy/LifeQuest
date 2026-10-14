-- AUTH-5 additive correction: count JSON object keys with supported PostgreSQL functions.
grant lifequest_read_owner to postgres with inherit false,set true;
grant create on schema public to lifequest_read_owner;
set local role lifequest_read_owner;create or replace function public.lifequest_auth5_command(expected_actor uuid,request_id uuid,kind text,payload jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' set statement_timeout='5s' as $$
declare actor uuid; h record; s record; o record; old_receipt record; now_at timestamptz:=date_trunc('milliseconds',clock_timestamp());
        result jsonb; digest text; step_name text; draft_value jsonb; name_value text; age_value integer;
        gender_value text; avatar_value text; goals_value text[]; next_step text; seconds_value numeric; name_units integer;
begin
 if expected_actor is null or request_id is null or kind is null or payload is null or jsonb_typeof(payload)<>'object'
   or octet_length(payload::text)>32768 then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
 perform lifequest.lock_session(); actor:=lifequest.current_actor();
 if actor is distinct from expected_actor then raise exception 'ACTOR_MISMATCH' using errcode='PT403';end if;
 select * into h from lifequest.hunters where user_id=actor for update;
 if not found then raise exception 'ACCOUNT_MISSING' using errcode='PT409';end if;
 if kind='onboarding.complete' then
   select * into old_receipt from lifequest.command_receipts cr where cr.user_id=actor and cr.request_id=$2;
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
   if jsonb_typeof(payload)<>'object' or (select array_agg(k order by k) from jsonb_object_keys(payload) k)<>array['seconds'] then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
   if kind='activation.checkpoint' and not (s.configuration_status='ready' and o.completed_at is not null and exists(select 1 from lifequest.hunter_profiles where user_id=actor and onboarding_completed)) then raise exception 'SETUP_PENDING' using errcode='PT409';end if;
   if jsonb_typeof(payload->'seconds')<>'number' then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
   seconds_value:=(payload->>'seconds')::numeric;
   if seconds_value<0 or seconds_value>3600 or seconds_value::text in ('NaN','Infinity','-Infinity') then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
   insert into lifequest.cinematic_progress(user_id,cinematic_code,resume_seconds) values(actor,case when kind='activation.checkpoint' then 'activation-v1' else 'intro-v1' end,seconds_value)
   on conflict(user_id,cinematic_code) do update set resume_seconds=excluded.resume_seconds,revision=lifequest.cinematic_progress.revision+1
   where lifequest.cinematic_progress.consumed_at is null;
   result:=jsonb_build_object('actor',actor,'state','onboarding_pending','saved',true);
 elsif kind in ('video.finish','activation.finish') then
   if jsonb_typeof(payload)<>'object' or (select array_agg(k order by k) from jsonb_object_keys(payload) k)<>array['outcome'] then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
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
   if jsonb_typeof(payload)<>'object' or (select array_agg(k order by k) from jsonb_object_keys(payload) k)<>array['draft','step'] then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
   if not exists(select 1 from lifequest.cinematic_progress where user_id=actor and cinematic_code='intro-v1' and consumed_at is not null) then raise exception 'ONBOARDING_STEP_LOCKED' using errcode='PT409';end if;
   step_name:=payload->>'step'; draft_value:=payload->'draft';
   if step_name not in ('identity','avatar','goals','review') or jsonb_typeof(draft_value)<>'object'
     or octet_length(draft_value::text)>16384 then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
   if exists(select 1 from jsonb_object_keys(draft_value) k where k not in ('name','age','gender','avatar','goals','timezone')) then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
   if array_position(array['identity','avatar','goals','review'],step_name)>array_position(array['identity','avatar','goals','review'],o.step)
      and array_position(array['identity','avatar','goals','review'],step_name)>array_position(array['identity','avatar','goals','review'],o.step)+1 then
     raise exception 'ONBOARDING_STEP_LOCKED' using errcode='PT409';end if;
   if step_name<>'identity' then
     if jsonb_typeof(draft_value->'name')<>'string' then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
     name_value:=regexp_replace(draft_value->>'name',U&'^[\0009-\000d\0020\00a0\1680\2000-\200a\2028\2029\202f\205f\3000\feff]+|[\0009-\000d\0020\00a0\1680\2000-\200a\2028\2029\202f\205f\3000\feff]+$','','g');
     select coalesce(sum(case when ascii(ch)>65535 then 2 else 1 end),0) into name_units from regexp_split_to_table(name_value,'') ch;
     if name_units not between 1 and 40 then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
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
   if jsonb_typeof(payload)<>'object' or (select array_agg(k order by k) from jsonb_object_keys(payload) k)<>array['draft'] then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if; draft_value:=payload->'draft';
   if o.step<>'review' or draft_value is distinct from o.draft or not exists(select 1 from lifequest.cinematic_progress where user_id=actor and cinematic_code='intro-v1' and consumed_at is not null) then raise exception 'ONBOARDING_INCOMPLETE' using errcode='PT409';end if;
   if (select count(*) from jsonb_object_keys(draft_value))<>6 then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
   if exists(select 1 from jsonb_object_keys(draft_value) k where k not in ('name','age','gender','avatar','goals','timezone')) then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
   if jsonb_typeof(draft_value->'name')<>'string' then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
   name_value:=regexp_replace(draft_value->>'name',U&'^[\0009-\000d\0020\00a0\1680\2000-\200a\2028\2029\202f\205f\3000\feff]+|[\0009-\000d\0020\00a0\1680\2000-\200a\2028\2029\202f\205f\3000\feff]+$','','g');
   select coalesce(sum(case when ascii(ch)>65535 then 2 else 1 end),0) into name_units from regexp_split_to_table(name_value,'') ch;
   if name_units not between 1 and 40 then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
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