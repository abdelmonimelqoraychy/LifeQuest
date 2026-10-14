grant lifequest_schema_owner,lifequest_command_owner to postgres with inherit false,set true;
set local role lifequest_schema_owner;
grant create on schema lifequest to lifequest_command_owner;
create unique index one_active_focus_run on lifequest.focus_runs(user_id) where status in ('idle','running','paused');
reset role;
grant create on schema public to lifequest_command_owner;
set local role lifequest_command_owner;
create function public.lifequest_operations_command(expected_actor uuid,request_id uuid,kind text,payload jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' set statement_timeout='5s' set extra_float_digits=3 as $$
declare ctx jsonb; actor uuid; instant timestamptz; zone text; ident text; subid text; b record; sub record; r record; s record; receipt record;
 mode text; label text; title text; goals jsonb; goal jsonb; weight integer; total integer:=0; position integer:=0;
 changed boolean:=true; detail jsonb; reward jsonb; duration integer; active_ms bigint; elapsed_ms bigint; remaining integer; new_id text;
begin
 case kind
 when 'boss.create' then perform lifequest.payload_shape(payload,array['title','subObjectives']);
 when 'boss.progress' then perform lifequest.payload_shape(payload,array['id','expectedRevision'],array['subId']);
 when 'boss.claim' then perform lifequest.payload_shape(payload,array['id','expectedRevision']);
 when 'focus.start' then perform lifequest.payload_shape(payload,array['mode','label']);
 when 'focus.pause','focus.resume','focus.cancel','focus.finish','focus.claim' then perform lifequest.payload_shape(payload,array['id','expectedRevision']);
 when 'focus.set_mode' then perform lifequest.payload_shape(payload,array['id','expectedRevision','mode','label']);
 else raise exception 'COMMAND_UNKNOWN' using errcode='PT400';end case;
 if payload?'expectedRevision' then perform lifequest.target_revision(payload);end if;
 if payload?'id' then ident:=lifequest.input_text(payload,'id',512,true);end if;
 if payload?'mode' then mode:=lifequest.input_text(payload,'mode',5);if mode<>all(array['focus','short','long']) then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;label:=lifequest.input_text(payload,'label',120);end if;
 if kind='boss.create' then
  title:=lifequest.js_trim(lifequest.input_text(payload,'title',80,true));goals:=payload->'subObjectives';
  if jsonb_typeof(goals) is distinct from 'array' or jsonb_array_length(goals) not between 1 and 20 then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
  for goal in select * from jsonb_array_elements(goals) loop
   perform lifequest.payload_shape(goal,array['title','weight']);perform lifequest.input_text(goal,'title',120,true);
   if jsonb_typeof(goal->'weight') is distinct from 'number' or (goal->>'weight')::numeric<>trunc((goal->>'weight')::numeric) or (goal->>'weight')::numeric not between 1 and 1000 then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
   total:=total+(goal->>'weight')::integer;
  end loop;
  if total>1000 then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
 end if;
 ctx:=lifequest.command_begin(expected_actor,request_id,kind,payload);if ctx?'replay' then return ctx->'replay';end if;
 actor:=(ctx->>'actor')::uuid;instant:=(ctx->>'now')::timestamptz;zone:=ctx->>'zone';
 if kind='boss.create' then
  ident:=gen_random_uuid()::text;
  insert into lifequest.boss_missions(user_id,id,title,objective,mode,target,current,base_xp,created_at,sort_position)
  values(actor,ident,title,lifequest.js_trim(goals->0->>'title'),'weighted',total,0,least(300,greatest(25,total*10)),instant,lifequest.next_position(actor,'boss_missions'));
  for goal in select * from jsonb_array_elements(goals) loop
   insert into lifequest.boss_subobjectives(user_id,boss_id,id,title,weight,completed,sort_position)
   values(actor,ident,gen_random_uuid()::text,lifequest.js_trim(goal->>'title'),(goal->>'weight')::integer,false,position);position:=position+1;
  end loop;
  select jsonb_build_object('id',ident,'revision','0','subIds',jsonb_agg(id order by sort_position)) into detail from lifequest.boss_subobjectives where user_id=actor and boss_id=ident;
 elsif kind like 'boss.%' then
  select * into b from lifequest.boss_missions where user_id=actor and id=ident for update;
  if not found then raise exception 'NOT_FOUND' using errcode='PT404';end if;
  if b.reward_status in ('credited','resolved_without_xp') then
   changed:=false;detail:=jsonb_build_object('id',ident,'status',b.reward_status,'credited',false);
  else
   perform lifequest.assert_revision(b.revision,payload);
   if kind='boss.progress' and b.current<b.target then
    if b.mode='weighted' then
     subid:=lifequest.input_text(payload,'subId',512,true);
     select * into sub from lifequest.boss_subobjectives where user_id=actor and boss_id=ident and id=subid for update;
     if not found then raise exception 'NOT_FOUND' using errcode='PT404';end if;
     if sub.completed then changed:=false;
     else update lifequest.boss_subobjectives set completed=true,revision=revision+1 where user_id=actor and boss_id=ident and id=subid;
      b.current:=b.current+sub.weight;end if;
    else
     if payload?'subId' then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;b.current:=b.current+1;
    end if;
    if changed then update lifequest.boss_missions set current=b.current,completed_at=case when b.current=b.target then instant else null end,revision=revision+1 where user_id=actor and id=ident;end if;
   elsif kind='boss.claim' and b.current<b.target then raise exception 'NOT_DUE' using errcode='PT409';end if;
   if b.current=b.target then
    select * into receipt from lifequest.xp_events where user_id=actor and source_ref='lifequest:activity:boss:'||ident and period_key='once';
    if found and receipt.awarded_xp>0 then reward:=jsonb_build_object('credited',false,'xp',receipt.awarded_xp::text,'receiptId',receipt.id);
    elsif b.mode='counter' and b.base_xp=0 then
     update lifequest.boss_missions set reward_status='resolved_without_xp',completed_at=coalesce(completed_at,instant),revision=revision+case when kind='boss.claim' then 1 else 0 end where user_id=actor and id=ident;
     detail:=jsonb_build_object('id',ident,'status','resolved_without_xp','credited',false);
    else
     if receipt.id is not null then raise exception 'REWARD_PROOF_INVALID' using errcode='PT409';end if;
     reward:=lifequest.credit(actor,'boss',ident,'once',b.base_xp,'discipline',instant,zone,b.title);
    end if;
    if reward is not null then
     update lifequest.boss_missions set reward_status='credited',completed_at=coalesce(completed_at,instant),revision=revision+case when kind='boss.claim' then 1 else 0 end where user_id=actor and id=ident;
     if (reward->>'credited')::boolean then insert into lifequest.system_events(user_id,id,kind,title,occurred_at,detail,sort_position)
      values(actor,'boss-complete:'||ident,'boss',b.title,instant,'Boss completed',lifequest.next_position(actor,'system_events',true));end if;
     detail:=reward||jsonb_build_object('id',ident,'status','credited');
    end if;
   else detail:=jsonb_build_object('id',ident,'current',b.current,'total',b.target);end if;
  end if;
 elsif kind='focus.start' then
  ident:=gen_random_uuid()::text;duration:=case mode when 'focus' then 1500 when 'short' then 300 else 900 end;
  insert into lifequest.focus_runs(user_id,id,mode,status,remaining_seconds,running_since,deadline_at,label,sort_position)
   values(actor,ident,mode,'running',duration,instant,instant+duration*interval '1 second',label,lifequest.next_position(actor,'focus_runs'));
  detail:=jsonb_build_object('id',ident,'revision','0','remainingSeconds',duration,'deadline',instant+duration*interval '1 second');
 else
  select * into r from lifequest.focus_runs where user_id=actor and id=ident for update;
  if kind='focus.claim' then
   select * into s from lifequest.focus_sessions where user_id=actor and id=ident for update;
   select * into receipt from lifequest.xp_events where user_id=actor and source_ref='lifequest:activity:focus:'||ident and period_key='once';
   if receipt.id is not null and receipt.awarded_xp>0 then
    if s.id is not null and s.reward_status='pending' then perform lifequest.assert_revision(s.revision,payload);update lifequest.focus_sessions set reward_status='credited',revision=revision+1 where user_id=actor and id=ident;
    else changed:=false;end if;
    detail:=jsonb_build_object('id',ident,'credited',false,'xp',receipt.awarded_xp::text,'receiptId',receipt.id);
    return lifequest.command_end(ctx,changed,array['lab'],detail);
   end if;
   if r.id is null or r.historical<>'{}'::jsonb or s.reward_status is null then raise exception 'HISTORICAL_FOCUS_UNVERIFIED' using errcode='PT409';end if;
  end if;
  if r.id is null then raise exception 'NOT_FOUND' using errcode='PT404';end if;
  duration:=case r.mode when 'focus' then 1500 when 'short' then 300 else 900 end;
  active_ms:=r.accumulated_active_ms;
  if r.status='running' then active_ms:=least(duration::bigint*1000,active_ms+greatest(0,floor(extract(epoch from (instant-r.running_since))*1000)::bigint));end if;
  remaining:=ceil((duration::bigint*1000-active_ms)/1000.0)::integer;
  if r.status='completed' and kind in ('focus.finish','focus.claim') and exists(select 1 from lifequest.focus_sessions where user_id=actor and id=ident and reward_status='credited') then
   changed:=false;select jsonb_build_object('id',ident,'credited',false,'xp',awarded_xp::text,'receiptId',id) into detail from lifequest.xp_events where user_id=actor and source_ref='lifequest:activity:focus:'||ident;
  else
   perform lifequest.assert_revision(r.revision,payload);
   case kind
   when 'focus.pause' then
    if r.status='paused' then changed:=false;
    elsif r.status<>'running' then raise exception 'FOCUS_STATE_INVALID' using errcode='PT409';
    else update lifequest.focus_runs set status='paused',remaining_seconds=remaining,accumulated_active_ms=active_ms,running_since=null,deadline_at=null,revision=revision+1 where user_id=actor and id=ident;end if;
   when 'focus.resume' then
    if r.status='running' then changed:=false;
    elsif r.status not in ('paused','idle') then raise exception 'FOCUS_STATE_INVALID' using errcode='PT409';
    else update lifequest.focus_runs set status='running',running_since=instant,deadline_at=instant+(duration::bigint*1000-active_ms)*interval '1 millisecond',revision=revision+1 where user_id=actor and id=ident;end if;
   when 'focus.cancel' then
    if r.status='cancelled' then changed:=false;
    elsif r.status='completed' then raise exception 'FOCUS_STATE_INVALID' using errcode='PT409';
    else update lifequest.focus_runs set status='cancelled',remaining_seconds=remaining,accumulated_active_ms=active_ms,running_since=null,deadline_at=null,revision=revision+1 where user_id=actor and id=ident;end if;
   when 'focus.set_mode' then
    if r.status in ('cancelled','completed') then raise exception 'FOCUS_STATE_INVALID' using errcode='PT409';end if;
    update lifequest.focus_runs set status='cancelled',running_since=null,deadline_at=null,revision=revision+1 where user_id=actor and id=ident;
    new_id:=gen_random_uuid()::text;duration:=case mode when 'focus' then 1500 when 'short' then 300 else 900 end;
    insert into lifequest.focus_runs(user_id,id,mode,status,remaining_seconds,label,sort_position) values(actor,new_id,mode,'idle',duration,label,lifequest.next_position(actor,'focus_runs'));
   when 'focus.finish','focus.claim' then
    if remaining<>0 or r.status not in ('running','paused','completed') or r.historical<>'{}'::jsonb then raise exception 'FOCUS_DURATION_UNVERIFIED' using errcode='PT409';end if;
    update lifequest.focus_runs set status='completed',remaining_seconds=0,accumulated_active_ms=active_ms,running_since=null,deadline_at=null,revision=revision+1 where user_id=actor and id=ident;
    if r.mode='focus' then
     insert into lifequest.focus_sessions(user_id,id,run_id,occurred_at,minutes,label,reward_status,sort_position)
      values(actor,ident,ident,instant,25,r.label,'pending',lifequest.next_position(actor,'focus_sessions',true)) on conflict do nothing;
     reward:=lifequest.credit(actor,'focus',ident,'once',20,'focus',instant,zone,r.label);
     update lifequest.focus_sessions set reward_status='credited',revision=revision+1 where user_id=actor and id=ident;
     detail:=reward||jsonb_build_object('id',ident);
    end if;
   end case;
   if detail is null then detail:=jsonb_build_object('id',coalesce(new_id,ident),'revision',case when new_id is null then (r.revision+case when changed then 1 else 0 end)::text else '0' end,'remainingSeconds',remaining);end if;
  end if;
 end if;
 return lifequest.command_end(ctx,changed,case when kind like 'boss.%' then array['operations','system'] else array['lab','system'] end,detail);
end; $$;
revoke all on function public.lifequest_operations_command(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.lifequest_operations_command(uuid,uuid,text,jsonb) to authenticated;
reset role;
revoke create on schema public from lifequest_command_owner;
set local role lifequest_schema_owner;
revoke create on schema lifequest from lifequest_command_owner;
reset role;
grant lifequest_schema_owner,lifequest_command_owner to postgres with inherit false,set false;
