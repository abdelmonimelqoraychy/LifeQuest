-- Hunter Classes V1. Additive only: keep every existing migration immutable.
grant lifequest_schema_owner,lifequest_command_owner,lifequest_read_owner to postgres with inherit false,set true;

set local role lifequest_schema_owner;
alter table lifequest.hunter_profiles add column class_code text;
alter table lifequest.hunter_profiles add constraint hunter_profiles_class_code_check
 check(class_code is null or class_code in ('threshold_scout','obsidian_sentinel','archive_arcanist','flamebearer','oathweaver'));

-- The command role may update only the class choice and profile revision.
revoke insert on lifequest.hunter_profiles from lifequest_command_owner;
revoke insert(user_id,name,age,gender,avatar,goals,onboarding_completed,original_created_at,revision,class_code)
 on lifequest.hunter_profiles from lifequest_command_owner;
revoke update on lifequest.hunter_profiles from lifequest_command_owner;
revoke update(user_id,name,age,gender,avatar,goals,onboarding_completed,original_created_at,revision,class_code)
 on lifequest.hunter_profiles from lifequest_command_owner;
grant update(class_code,revision) on lifequest.hunter_profiles to lifequest_command_owner;
grant insert(class_code) on lifequest.hunter_profiles to lifequest_read_owner;
reset role;

-- Extend the deployed AUTH-5 command in-place through this additive migration.
-- Refuse to install if the expected final AUTH-5 body has drifted.
grant create on schema public to lifequest_read_owner;
set local role lifequest_read_owner;
do $$
declare
  definition text;
  old_fragment text;
  new_fragment text;
  occurrences integer;
begin
  select pg_get_functiondef('public.lifequest_auth5_command(uuid,uuid,text,jsonb)'::regprocedure) into definition;
  if definition is null then raise exception 'AUTH5_COMMAND_MISSING'; end if;

  old_fragment := $old$k not in ('name','age','gender','avatar','goals','timezone')$old$;
  occurrences := (length(definition)-length(replace(definition,old_fragment,''))) / length(old_fragment);
  if occurrences<>2 then raise exception 'AUTH5_COMMAND_SHAPE_DRIFT'; end if;
  definition := replace(definition,old_fragment,$new$k not in ('name','age','gender','avatar','goals','timezone','classCode')$new$);

  old_fragment := $old$draft_value:=payload->'draft';$old$;
  occurrences := (length(definition)-length(replace(definition,old_fragment,''))) / length(old_fragment);
  if occurrences<>2 then raise exception 'AUTH5_COMMAND_DRAFT_DRIFT'; end if;
  new_fragment := $new$draft_value:=payload->'draft';
   if draft_value?'classCode' and draft_value->'classCode'<>'null'::jsonb and
     (jsonb_typeof(draft_value->'classCode') is distinct from 'string' or not (draft_value->>'classCode'=any(array['threshold_scout','obsidian_sentinel','archive_arcanist','flamebearer','oathweaver']))) then
     raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;$new$;
  definition := replace(definition,old_fragment,new_fragment);

  old_fragment := $old$(select count(*) from jsonb_object_keys(draft_value))<>6$old$;
  if position(old_fragment in definition)=0 then raise exception 'AUTH5_COMMAND_COUNT_DRIFT'; end if;
  definition := replace(definition,old_fragment,$new$(select count(*) from jsonb_object_keys(draft_value)) not in (6,7)$new$);

  old_fragment := $old$insert into lifequest.hunter_profiles(user_id,name,age,gender,avatar,goals,onboarding_completed,original_created_at)$old$;
  if position(old_fragment in definition)=0 then raise exception 'AUTH5_COMMAND_INSERT_DRIFT'; end if;
  definition := replace(definition,old_fragment,$new$insert into lifequest.hunter_profiles(user_id,name,age,gender,avatar,goals,class_code,onboarding_completed,original_created_at)$new$);

  old_fragment := $old$values(actor,name_value,age_value,gender_value,avatar_value,array(select jsonb_array_elements_text(draft_value->'goals')),true,now_at);$old$;
  if position(old_fragment in definition)=0 then raise exception 'AUTH5_COMMAND_VALUES_DRIFT'; end if;
  definition := replace(definition,old_fragment,$new$values(actor,name_value,age_value,gender_value,avatar_value,array(select jsonb_array_elements_text(draft_value->'goals')),draft_value->>'classCode',true,now_at);$new$);
  execute definition;
end $$;
reset role;
revoke create on schema public from lifequest_read_owner;

-- Publish the nullable value as profile.classCode in the coherent snapshot.
grant create on schema public to lifequest_read_owner;
set local role lifequest_read_owner;
do $$
declare definition text; old_fragment text; new_fragment text;
begin
  select pg_get_functiondef('public.lifequest_hunter_snapshot(uuid)'::regprocedure) into definition;
  old_fragment := $old$'{"original_created_at":"createdAt"}'$old$;
  if (length(definition)-length(replace(definition,old_fragment,''))) / length(old_fragment)<>1 then
    raise exception 'HUNTER_SNAPSHOT_PROFILE_SHAPE_DRIFT';
  end if;
  new_fragment := $new$'{"original_created_at":"createdAt","class_code":"classCode"}'$new$;
  execute replace(definition,old_fragment,new_fragment);
end $$;
reset role;
revoke create on schema public from lifequest_read_owner;

-- The dedicated class command deliberately does not depend on calendar activation:
-- it changes profile presentation only and cannot write XP or progression data.
grant create on schema public to lifequest_command_owner;
set local role lifequest_command_owner;
create function public.lifequest_profile_command(expected_actor uuid,request_id uuid,kind text,payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' set statement_timeout='5s' as $$
declare
  actor uuid;
  h record;
  p record;
  receipt record;
  requested_revision bigint;
  desired_code text;
  digest text;
  changed boolean;
  committed_revision bigint;
  profile_revision bigint;
  result jsonb;
begin
  if expected_actor is null or request_id is null or kind is distinct from 'profile.class.select'
    or payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>8192
    or not (payload ?& array['classCode','expectedRevision'])
    or exists(select 1 from jsonb_object_keys(payload) key where key not in ('classCode','expectedRevision')) then
    raise exception 'VALIDATION_FAILED' using errcode='PT400';
  end if;
  requested_revision:=lifequest.target_revision(payload);
  if jsonb_typeof(payload->'classCode')='null' then
    desired_code:=null;
  else
    desired_code:=lifequest.input_text(payload,'classCode',40,true);
    if desired_code not in ('threshold_scout','obsidian_sentinel','archive_arcanist','flamebearer','oathweaver') then
      raise exception 'VALIDATION_FAILED' using errcode='PT400';
    end if;
  end if;

  perform set_config('lock_timeout','1000ms',true);
  perform lifequest.lock_session();
  actor:=lifequest.current_actor();
  if actor is distinct from expected_actor then raise exception 'ACTOR_MISMATCH' using errcode='PT403'; end if;
  select * into h from lifequest.hunters where user_id=actor for update;
  if not found then raise exception 'ACCOUNT_MISSING' using errcode='PT409'; end if;
  if not exists(select 1 from lifequest.hunter_setup s where s.user_id=actor and s.configuration_status='ready' and s.migration_id is null) then
    raise exception 'SETUP_PENDING' using errcode='PT409';
  end if;

  digest:=lifequest.intent_hash(kind,payload);
  select * into receipt from lifequest.command_receipts r where r.user_id=actor and r.request_id=lifequest_profile_command.request_id;
  if found then
    if receipt.command_kind<>kind or receipt.canonical_payload_hash<>digest then raise exception 'REQUEST_ID_CONFLICT' using errcode='PT409'; end if;
    return receipt.minimal_result||jsonb_build_object('replayed',true);
  end if;

  select profile_row.class_code,profile_row.revision,profile_row.onboarding_completed into p
   from lifequest.hunter_profiles profile_row where profile_row.user_id=actor for update;
  if not found or not p.onboarding_completed then raise exception 'SETUP_PENDING' using errcode='PT409'; end if;
  if p.revision<>requested_revision then raise exception 'REVISION_CONFLICT' using errcode='PT409'; end if;

  changed:=p.class_code is distinct from desired_code;
  if changed then
    update lifequest.hunter_profiles set class_code=desired_code,revision=revision+1 where user_id=actor returning revision into profile_revision;
    update lifequest.hunters set revision=revision+1 where user_id=actor returning revision into committed_revision;
  else
    profile_revision:=p.revision;
    committed_revision:=h.revision;
  end if;

  result:=jsonb_build_object('actor',actor,'requestId',request_id,'committedRevision',committed_revision::text,
    'outcome',case when changed then 'applied' else 'noop' end,'replayed',false,
    'result',jsonb_build_object('classCode',desired_code,'profileRevision',profile_revision::text));
  insert into lifequest.command_receipts(user_id,request_id,command_kind,canonical_payload_hash,minimal_result,committed_revision,committed_at)
   values(actor,request_id,kind,digest,result,committed_revision,date_trunc('milliseconds',clock_timestamp()));
  set constraints all immediate;
  if lifequest.current_actor() is distinct from actor then raise exception 'SESSION_DENIED' using errcode='42501'; end if;
  return result;
end; $$;
revoke all on function public.lifequest_profile_command(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.lifequest_profile_command(uuid,uuid,text,jsonb) to authenticated;
reset role;
revoke create on schema public from lifequest_command_owner;
grant lifequest_schema_owner,lifequest_command_owner,lifequest_read_owner to postgres with inherit false,set false;
