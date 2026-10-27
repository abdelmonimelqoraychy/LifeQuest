
-- Focus Quest Link V1 is additive. Existing runs and sessions remain unlinked;
-- their historical `minutes` values are not converted into measured time.
grant lifequest_schema_owner,lifequest_command_owner to postgres with inherit false,set true;
set local role lifequest_schema_owner;

do $$
declare table_name text; expected_pk name[]; actual_owner text; rls_enabled boolean; rls_forced boolean;
begin
 for table_name,expected_pk in
  select 'quests',array['user_id','id']::name[] union all
  select 'focus_runs',array['user_id','id']::name[] union all
  select 'focus_sessions',array['user_id','id']::name[] union all
  select 'boss_subobjectives',array['user_id','boss_id','id']::name[]
 loop
  select pg_get_userbyid(c.relowner),c.relrowsecurity,c.relforcerowsecurity
   into actual_owner,rls_enabled,rls_forced
   from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='lifequest' and c.relname=table_name and c.relkind='r';
  if actual_owner is distinct from 'lifequest_schema_owner' or rls_enabled is distinct from true or rls_forced is distinct from true then
   raise exception 'FOCUS_QUEST_LINK_TABLE_SECURITY_DRIFT: %',table_name;
  end if;
  if not exists(
   select 1 from pg_constraint c
   where c.conrelid=format('lifequest.%I',table_name)::regclass and c.contype='p'
    and (select array_agg(a.attname order by key_column.ordinality)
      from unnest(c.conkey) with ordinality as key_column(attnum,ordinality)
      join pg_attribute a on a.attrelid=c.conrelid and a.attnum=key_column.attnum)=expected_pk
  ) then raise exception 'FOCUS_QUEST_LINK_PRIMARY_KEY_DRIFT: %',table_name;end if;
 end loop;
end $$;

alter table lifequest.focus_runs
 add column target_kind text,
 add column quest_id lifequest.business_id,
 add column boss_id lifequest.business_id,
 add column subobjective_id lifequest.business_id,
 add column target_label_snapshot text;
alter table lifequest.focus_sessions
 add column target_kind text,
 add column quest_id lifequest.business_id,
 add column boss_id lifequest.business_id,
 add column subobjective_id lifequest.business_id,
 add column target_label_snapshot text,
 add column active_ms bigint;

alter table lifequest.focus_runs
 add constraint focus_runs_target_shape check (
  (target_kind is null and quest_id is null and boss_id is null and subobjective_id is null and target_label_snapshot is null)
  or (target_kind='quest' and quest_id is not null and boss_id is null and subobjective_id is null
      and target_label_snapshot is not null and length(btrim(target_label_snapshot)) between 1 and 240)
  or (target_kind='boss_subobjective' and quest_id is null and boss_id is not null and subobjective_id is not null
      and target_label_snapshot is not null and length(btrim(target_label_snapshot)) between 1 and 240)
 ),
 add constraint focus_runs_target_requires_focus check (target_kind is null or mode='focus'),
 add constraint focus_runs_target_quest_fk foreign key(user_id,quest_id)
   references lifequest.quests(user_id,id) on delete restrict,
 add constraint focus_runs_target_boss_step_fk foreign key(user_id,boss_id,subobjective_id)
   references lifequest.boss_subobjectives(user_id,boss_id,id) on delete restrict;

alter table lifequest.focus_sessions
 add constraint focus_sessions_target_shape check (
  (target_kind is null and quest_id is null and boss_id is null and subobjective_id is null and target_label_snapshot is null)
  or (target_kind='quest' and quest_id is not null and boss_id is null and subobjective_id is null
      and target_label_snapshot is not null and length(btrim(target_label_snapshot)) between 1 and 240)
  or (target_kind='boss_subobjective' and quest_id is null and boss_id is not null and subobjective_id is not null
      and target_label_snapshot is not null and length(btrim(target_label_snapshot)) between 1 and 240)
 ),
 add constraint focus_sessions_target_requires_run check (run_id is not null or
  (target_kind is null and quest_id is null and boss_id is null and subobjective_id is null
   and target_label_snapshot is null and active_ms is null)),
 add constraint focus_sessions_active_ms_range check (active_ms is null or active_ms between 0 and 1500000),
 add constraint focus_sessions_active_ms_requires_run check (active_ms is null or run_id is not null),
 add constraint focus_sessions_target_quest_fk foreign key(user_id,quest_id)
   references lifequest.quests(user_id,id) on delete restrict,
 add constraint focus_sessions_target_boss_step_fk foreign key(user_id,boss_id,subobjective_id)
   references lifequest.boss_subobjectives(user_id,boss_id,id) on delete restrict;

create index focus_runs_target_quest on lifequest.focus_runs(user_id,quest_id) where quest_id is not null;
create index focus_runs_target_boss_step on lifequest.focus_runs(user_id,boss_id,subobjective_id) where boss_id is not null;
create index focus_sessions_target_quest on lifequest.focus_sessions(user_id,quest_id) where quest_id is not null;
create index focus_sessions_target_boss_step on lifequest.focus_sessions(user_id,boss_id,subobjective_id) where boss_id is not null;

create function lifequest.guard_focus_run_target_immutable() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if row(new.target_kind,new.quest_id,new.boss_id,new.subobjective_id,new.target_label_snapshot)
    is distinct from row(old.target_kind,old.quest_id,old.boss_id,old.subobjective_id,old.target_label_snapshot)
  and not (old.status='idle' and new.status='running'
   and old.target_kind is null and old.quest_id is null and old.boss_id is null
   and old.subobjective_id is null and old.target_label_snapshot is null) then
  raise exception 'FOCUS_TARGET_IMMUTABLE' using errcode='PT409';
 end if;
 return new;
end; $$;
revoke all on function lifequest.guard_focus_run_target_immutable() from public,anon,authenticated;
grant execute on function lifequest.guard_focus_run_target_immutable() to lifequest_command_owner;
create trigger focus_run_target_immutable before update of target_kind,quest_id,boss_id,subobjective_id,target_label_snapshot
 on lifequest.focus_runs for each row execute function lifequest.guard_focus_run_target_immutable();

create function lifequest.check_focus_session_target_matches_run() returns trigger
language plpgsql security invoker set search_path='' as $$
declare source_run record;
begin
 if new.run_id is null then return new;end if;
 select r.target_kind,r.quest_id,r.boss_id,r.subobjective_id,r.target_label_snapshot,r.mode,r.status,r.accumulated_active_ms
  into source_run from lifequest.focus_runs r where r.user_id=new.user_id and r.id=new.run_id;
 if not found then raise exception 'FOCUS_SESSION_RUN_MISMATCH' using errcode='PT409';end if;
 if row(new.target_kind,new.quest_id,new.boss_id,new.subobjective_id,new.target_label_snapshot)
     is distinct from row(source_run.target_kind,source_run.quest_id,source_run.boss_id,source_run.subobjective_id,source_run.target_label_snapshot)
  or (new.active_ms is not null and (source_run.mode<>'focus' or source_run.status<>'completed' or new.active_ms<>source_run.accumulated_active_ms)) then
  raise exception 'FOCUS_SESSION_RUN_MISMATCH' using errcode='PT409';
 end if;
 return new;
end; $$;
revoke all on function lifequest.check_focus_session_target_matches_run() from public,anon,authenticated;
grant execute on function lifequest.check_focus_session_target_matches_run() to lifequest_command_owner;
create trigger focus_session_run_match before insert or update of run_id,target_kind,quest_id,boss_id,subobjective_id,target_label_snapshot,active_ms
 on lifequest.focus_sessions for each row execute function lifequest.check_focus_session_target_matches_run();

-- Only the command owner can set a link at start. No runtime role can change
-- target columns on a run after it starts, and clients receive no column ACLs.
grant insert(target_kind,quest_id,boss_id,subobjective_id,target_label_snapshot)
 on lifequest.focus_runs to lifequest_command_owner;
grant update(target_kind,quest_id,boss_id,subobjective_id,target_label_snapshot)
 on lifequest.focus_runs to lifequest_command_owner;
grant insert(target_kind,quest_id,boss_id,subobjective_id,target_label_snapshot,active_ms)
 on lifequest.focus_sessions to lifequest_command_owner;
revoke update(target_kind,quest_id,boss_id,subobjective_id,target_label_snapshot),
 insert(target_kind,quest_id,boss_id,subobjective_id,target_label_snapshot)
 on lifequest.focus_runs from public,anon,authenticated,lifequest_read_owner,lifequest_provision_owner;
revoke update(target_kind,quest_id,boss_id,subobjective_id,target_label_snapshot,active_ms),
 insert(target_kind,quest_id,boss_id,subobjective_id,target_label_snapshot,active_ms)
 on lifequest.focus_sessions from public,anon,authenticated,lifequest_read_owner,lifequest_provision_owner;
revoke update(target_kind,quest_id,boss_id,subobjective_id,target_label_snapshot),
 insert(target_kind,quest_id,boss_id,subobjective_id,target_label_snapshot)
 on lifequest.focus_runs from lifequest_command_owner;
grant update(target_kind,quest_id,boss_id,subobjective_id,target_label_snapshot)
 on lifequest.focus_runs to lifequest_command_owner;
grant insert(target_kind,quest_id,boss_id,subobjective_id,target_label_snapshot)
 on lifequest.focus_runs to lifequest_command_owner;
reset role;

grant create on schema public to lifequest_command_owner;
set local role lifequest_command_owner;
do $$
declare definition text; old_fragment text; new_fragment text; occurrences integer;
begin
 select pg_get_functiondef('public.lifequest_operations_command(uuid,uuid,text,jsonb)'::regprocedure) into definition;
 if definition is null then raise exception 'OPERATIONS_COMMAND_MISSING';end if;

 old_fragment:=$old$when 'focus.start' then perform lifequest.payload_shape(payload,array['mode','label']);$old$;
 occurrences:=(length(definition)-length(replace(definition,old_fragment,'')))/length(old_fragment);
 if occurrences<>1 then raise exception 'FOCUS_START_PAYLOAD_SHAPE_DRIFT';end if;
 new_fragment:=$new$when 'focus.start' then perform lifequest.payload_shape(payload,array['mode','label'],array['target']);$new$;
 definition:=replace(definition,old_fragment,new_fragment);

 old_fragment:=$old$mode text; label text; title text; goals jsonb; goal jsonb; weight integer; total integer:=0; position integer:=0;$old$;
 occurrences:=(length(definition)-length(replace(definition,old_fragment,'')))/length(old_fragment);
 if occurrences<>1 then raise exception 'FOCUS_START_DECLARATION_DRIFT';end if;
 new_fragment:=$new$mode text; label text; title text; goals jsonb; goal jsonb; weight integer; total integer:=0; position integer:=0;
 v_label text; v_target jsonb; v_target_kind text; v_quest_id text; v_boss_id text; v_subobjective_id text; v_target_label text;
 v_expected_quest_revision bigint; v_expected_boss_revision bigint; v_expected_subobjective_revision bigint; q record;$new$;
 definition:=replace(definition,old_fragment,new_fragment);

 old_fragment:=$old$if payload?'mode' then mode:=lifequest.input_text(payload,'mode',5);if mode<>all(array['focus','short','long']) then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;label:=lifequest.input_text(payload,'label',120);end if;$old$;
 occurrences:=(length(definition)-length(replace(definition,old_fragment,'')))/length(old_fragment);
 if occurrences<>1 then raise exception 'FOCUS_START_INPUT_DRIFT';end if;
 new_fragment:=$new$if payload?'mode' then mode:=lifequest.input_text(payload,'mode',5);if mode<>all(array['focus','short','long']) then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;label:=lifequest.input_text(payload,'label',120);end if;
 if kind='focus.start' then v_label:=label;end if;
 if kind='focus.start' and payload?'target' then
  v_target:=payload->'target';
  if mode<>'focus' or jsonb_typeof(v_target) is distinct from 'object' then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
  v_target_kind:=lifequest.input_text(v_target,'kind',32,true);
  if v_target_kind='quest' then
   perform lifequest.payload_shape(v_target,array['kind','questId','expectedRevision']);
   v_quest_id:=lifequest.input_text(v_target,'questId',512,true);
   v_expected_quest_revision:=lifequest.target_revision(jsonb_build_object('expectedRevision',v_target->'expectedRevision'));
  elsif v_target_kind='boss_subobjective' then
   perform lifequest.payload_shape(v_target,array['kind','bossId','subObjectiveId','expectedBossRevision','expectedSubObjectiveRevision']);
   v_boss_id:=lifequest.input_text(v_target,'bossId',512,true);
   v_subobjective_id:=lifequest.input_text(v_target,'subObjectiveId',512,true);
   v_expected_boss_revision:=lifequest.target_revision(jsonb_build_object('expectedRevision',v_target->'expectedBossRevision'));
   v_expected_subobjective_revision:=lifequest.target_revision(jsonb_build_object('expectedRevision',v_target->'expectedSubObjectiveRevision'));
  else raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
 end if;$new$;
 definition:=replace(definition,old_fragment,new_fragment);

 old_fragment:=$old$actor:=(ctx->>'actor')::uuid;instant:=(ctx->>'now')::timestamptz;zone:=ctx->>'zone';
 if kind='boss.create' then$old$;
 occurrences:=(length(definition)-length(replace(definition,old_fragment,'')))/length(old_fragment);
 if occurrences<>1 then raise exception 'FOCUS_START_TARGET_CHECK_DRIFT';end if;
 new_fragment:=$new$actor:=(ctx->>'actor')::uuid;instant:=(ctx->>'now')::timestamptz;zone:=ctx->>'zone';
 if kind='focus.start' and v_target_kind='quest' then
  select * into q from lifequest.quests where user_id=actor and id=v_quest_id for update;
  if not found then raise exception 'FOCUS_TARGET_UNAVAILABLE' using errcode='PT409';end if;
  perform lifequest.assert_revision(q.revision,jsonb_build_object('expectedRevision',v_expected_quest_revision::text));
  if q.archived then raise exception 'FOCUS_TARGET_UNAVAILABLE' using errcode='PT409';end if;
  v_target_label:=q.title;
 elsif kind='focus.start' and v_target_kind='boss_subobjective' then
  select * into b from lifequest.boss_missions where user_id=actor and id=v_boss_id for update;
  if not found then raise exception 'FOCUS_TARGET_UNAVAILABLE' using errcode='PT409';end if;
  perform lifequest.assert_revision(b.revision,jsonb_build_object('expectedRevision',v_expected_boss_revision::text));
  if b.completed_at is not null or b.current>=b.target or b.reward_status in ('credited','resolved_without_xp') then
   raise exception 'FOCUS_TARGET_UNAVAILABLE' using errcode='PT409';end if;
  select * into sub from lifequest.boss_subobjectives where user_id=actor and boss_id=v_boss_id and id=v_subobjective_id for update;
  if not found then raise exception 'FOCUS_TARGET_UNAVAILABLE' using errcode='PT409';end if;
  perform lifequest.assert_revision(sub.revision,jsonb_build_object('expectedRevision',v_expected_subobjective_revision::text));
  if sub.completed then raise exception 'FOCUS_TARGET_UNAVAILABLE' using errcode='PT409';end if;
  v_target_label:=b.title||' — '||sub.title;
 end if;
 if kind='boss.create' then$new$;
 definition:=replace(definition,old_fragment,new_fragment);

 old_fragment:=$old$elsif kind='focus.start' then
  ident:=gen_random_uuid()::text;duration:=case mode when 'focus' then 1500 when 'short' then 300 else 900 end;
  insert into lifequest.focus_runs(user_id,id,mode,status,remaining_seconds,running_since,deadline_at,label,sort_position)
   values(actor,ident,mode,'running',duration,instant,instant+duration*interval '1 second',label,lifequest.next_position(actor,'focus_runs'));
  detail:=jsonb_build_object('id',ident,'revision','0','remainingSeconds',duration,'deadline',instant+duration*interval '1 second');$old$;
 occurrences:=(length(definition)-length(replace(definition,old_fragment,'')))/length(old_fragment);
 if occurrences<>1 then raise exception 'FOCUS_START_INSERT_DRIFT';end if;
 new_fragment:=$new$elsif kind='focus.start' then
  duration:=case mode when 'focus' then 1500 when 'short' then 300 else 900 end;
  select * into r from lifequest.focus_runs where user_id=actor and status='idle' order by sort_position desc,id collate "C" desc limit 1 for update;
  if found then
   if r.mode<>mode or r.target_kind is not null or r.quest_id is not null or r.boss_id is not null or r.subobjective_id is not null or r.target_label_snapshot is not null then
    raise exception 'FOCUS_STATE_INVALID' using errcode='PT409';end if;
   ident:=r.id;
   update lifequest.focus_runs set status='running',remaining_seconds=duration,running_since=instant,
    deadline_at=instant+duration*interval '1 second',label=v_label,target_kind=v_target_kind,quest_id=v_quest_id,
    boss_id=v_boss_id,subobjective_id=v_subobjective_id,target_label_snapshot=v_target_label,revision=revision+1
    where user_id=actor and id=ident;
   detail:=jsonb_build_object('id',ident,'revision',(r.revision+1)::text,'remainingSeconds',duration,
    'deadline',instant+duration*interval '1 second','targetKind',v_target_kind,'targetLabelSnapshot',v_target_label);
  else
   ident:=gen_random_uuid()::text;
   insert into lifequest.focus_runs(user_id,id,mode,status,remaining_seconds,running_since,deadline_at,label,
    target_kind,quest_id,boss_id,subobjective_id,target_label_snapshot,sort_position)
   values(actor,ident,mode,'running',duration,instant,instant+duration*interval '1 second',v_label,
    v_target_kind,v_quest_id,v_boss_id,v_subobjective_id,v_target_label,lifequest.next_position(actor,'focus_runs'));
   detail:=jsonb_build_object('id',ident,'revision','0','remainingSeconds',duration,
    'deadline',instant+duration*interval '1 second','targetKind',v_target_kind,'targetLabelSnapshot',v_target_label);
  end if;$new$;
 definition:=replace(definition,old_fragment,new_fragment);

 old_fragment:=$old$insert into lifequest.focus_sessions(user_id,id,run_id,occurred_at,minutes,label,reward_status,sort_position)
      values(actor,ident,ident,instant,25,r.label,'pending',lifequest.next_position(actor,'focus_sessions',true)) on conflict do nothing;$old$;
 occurrences:=(length(definition)-length(replace(definition,old_fragment,'')))/length(old_fragment);
 if occurrences<>1 then raise exception 'FOCUS_SESSION_INSERT_DRIFT';end if;
 new_fragment:=$new$insert into lifequest.focus_sessions(user_id,id,run_id,occurred_at,minutes,label,reward_status,active_ms,
      target_kind,quest_id,boss_id,subobjective_id,target_label_snapshot,sort_position)
      values(actor,ident,ident,instant,25,r.label,'pending',active_ms,r.target_kind,r.quest_id,r.boss_id,r.subobjective_id,
       r.target_label_snapshot,lifequest.next_position(actor,'focus_sessions',true)) on conflict do nothing;$new$;
 definition:=replace(definition,old_fragment,new_fragment);

 old_fragment:=$old$detail:=reward||jsonb_build_object('id',ident);$old$;
 occurrences:=(length(definition)-length(replace(definition,old_fragment,'')))/length(old_fragment);
 if occurrences<>1 then raise exception 'FOCUS_FINISH_RESULT_DRIFT';end if;
 new_fragment:=$new$detail:=reward||jsonb_build_object('id',ident,'activeMs',active_ms::text,
      'targetKind',r.target_kind,'targetLabelSnapshot',r.target_label_snapshot);$new$;
 definition:=replace(definition,old_fragment,new_fragment);

 execute definition;
end $$;
reset role;
revoke create on schema public from lifequest_command_owner;
grant lifequest_schema_owner,lifequest_command_owner to postgres with inherit false,set false;
