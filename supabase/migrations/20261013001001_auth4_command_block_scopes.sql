-- Additive corrections after the first real RPC execution; prior migrations immutable.
grant lifequest_schema_owner,lifequest_command_owner to postgres with inherit false,set true;
grant create on schema public to lifequest_command_owner;
set local role lifequest_schema_owner;
grant create on schema lifequest to lifequest_command_owner;
reset role;
set local role lifequest_command_owner;
create or replace function public.lifequest_quest_command(expected_actor uuid,request_id uuid,kind text,payload jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' set statement_timeout='5s' set extra_float_digits=3 as $$
<<lifequest_quest_command>>
declare ctx jsonb; actor uuid; instant timestamptz; zone text; day date; ident text; q record; a record; item record;
 title text; description text; frequency text; difficulty text; attr text; arc text; target date; availability date;
 reward jsonb; base numeric; changed boolean:=true; detail jsonb; desired boolean; period text; n integer;
begin
 case kind
 when 'quest.create' then perform lifequest.payload_shape(payload,array['title','description','frequency','difficulty','attribute'],array['arcId','targetDate']);
 when 'quest.update' then perform lifequest.payload_shape(payload,array['id','expectedRevision','title','description','frequency','difficulty','attribute'],array['arcId','targetDate']);
 when 'quest.archive','quest.restore' then perform lifequest.payload_shape(payload,array['id','expectedRevision']);
 when 'quest.complete' then perform lifequest.payload_shape(payload,array['id']);
 when 'arc.create' then perform lifequest.payload_shape(payload,array['title','description','targetDate']);
 when 'arc.delete' then perform lifequest.payload_shape(payload,array['id','expectedRevision']);
 when 'achievement.sync' then perform lifequest.payload_shape(payload,array[]::text[]);
 else raise exception 'COMMAND_UNKNOWN' using errcode='PT400';end case;
 if payload?'expectedRevision' then perform lifequest.target_revision(payload);end if;
 if payload?'id' then ident:=lifequest.input_text(payload,'id',512,true);end if;
 if kind in ('quest.create','quest.update','arc.create') then
  title:=lifequest.js_trim(lifequest.input_text(payload,'title',case when kind='arc.create' then 90 else 100 end,true));
  description:=lifequest.js_trim(lifequest.input_text(payload,'description',case when kind='arc.create' then 220 else 250 end));
  if payload?'targetDate' and payload->'targetDate'<>'null'::jsonb then target:=lifequest.input_date(payload,'targetDate');end if;
 end if;
 if kind in ('quest.create','quest.update') then
  frequency:=lifequest.input_text(payload,'frequency',7);difficulty:=lifequest.input_text(payload,'difficulty',6);attr:=lifequest.input_text(payload,'attribute',11);
  if frequency<>all(array['daily','weekly','monthly','once']) or difficulty<>all(array['EASY','NORMAL','HARD']) or attr<>all(array['focus','discipline','knowledge','energy','consistency']) then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
  if payload?'arcId' and payload->'arcId'<>'null'::jsonb then arc:=lifequest.input_text(payload,'arcId',512,true);end if;
  if frequency<>'once' then target:=null;end if;
  base:=case difficulty when 'EASY' then 30 when 'NORMAL' then 50 else 80 end;
 end if;
 ctx:=lifequest.command_begin(expected_actor,request_id,kind,payload);if ctx?'replay' then return ctx->'replay';end if;
 actor:=(ctx->>'actor')::uuid;instant:=(ctx->>'now')::timestamptz;zone:=ctx->>'zone';day:=(instant at time zone zone)::date;
 if arc is not null and not exists(select 1 from lifequest.story_arcs where user_id=actor and id=arc) then raise exception 'NOT_FOUND' using errcode='PT404';end if;
 if kind like 'quest.%' and kind<>'quest.create' then
  select * into q from lifequest.quests where user_id=actor and id=ident for update;
  if not found then raise exception 'NOT_FOUND' using errcode='PT404';end if;
 end if;
 case kind
 when 'quest.create' then
  ident:=gen_random_uuid()::text;
  insert into lifequest.quests(user_id,id,title,description,frequency,difficulty,attribute,base_xp,arc_id,target_date,created_at,sort_position)
  values(actor,ident,title,description,frequency,difficulty,attr,base,arc,target,instant,lifequest.next_position(actor,'quests'));
  detail:=jsonb_build_object('id',ident,'revision','0');
 when 'quest.update' then
  perform lifequest.assert_revision(q.revision,payload);
  if q.archived then raise exception 'NOT_FOUND' using errcode='PT404';end if;
  if q.frequency='once' and frequency<>'once' and exists(select 1 from lifequest.xp_events where user_id=actor and source_ref=ident and period_key='once') then raise exception 'ONCE_TERMINAL' using errcode='PT409';end if;
  availability:=q.available_after;
  if q.frequency<>frequency and exists(select 1 from lifequest.xp_events where user_id=actor and source_ref=ident) then availability:=greatest(availability,lifequest.next_period(q.frequency,day),lifequest.next_period(frequency,day));end if;
  if q.difficulty=difficulty then base:=q.base_xp;end if;
  changed:=row(q.title,q.description,q.frequency,q.difficulty,q.attribute,q.arc_id,q.target_date,q.available_after) is distinct from row(title,description,frequency,difficulty,attr,arc,target,availability);
  if changed then update lifequest.quests set title=lifequest_quest_command.title,description=lifequest_quest_command.description,
   frequency=lifequest_quest_command.frequency,difficulty=lifequest_quest_command.difficulty,attribute=attr,base_xp=base,arc_id=arc,target_date=target,available_after=availability,revision=revision+1
   where user_id=actor and id=ident;end if;
  detail:=jsonb_build_object('id',ident,'revision',(q.revision+case when changed then 1 else 0 end)::text);
 when 'quest.archive','quest.restore' then
  desired:=kind='quest.archive';changed:=q.archived<>desired;
  if changed then perform lifequest.assert_revision(q.revision,payload);update lifequest.quests set archived=desired,revision=revision+1 where user_id=actor and id=ident;end if;
  detail:=jsonb_build_object('id',ident,'archived',desired,'revision',(q.revision+case when changed then 1 else 0 end)::text);
 when 'quest.complete' then
  period:=lifequest.rules_period(q.frequency,instant,zone);
  if exists(select 1 from lifequest.xp_events where user_id=actor and source_ref=ident and period_key=period) then
   changed:=false;select jsonb_build_object('credited',false,'receiptId',id,'xp',awarded_xp::text) into reward from lifequest.xp_events where user_id=actor and source_ref=ident and period_key=period;
  else
   if q.archived or (q.available_after is not null and q.available_after>day)
    or (q.frequency='once' and q.target_date is not null and q.target_date>day)
    or (q.frequency<>'once' and (q.created_at at time zone zone)::date>day) then raise exception 'NOT_DUE' using errcode='PT409';end if;
   reward:=lifequest.credit(actor,'quest',ident,period,q.base_xp,q.attribute,instant,zone,q.title,q.arc_id);
  end if;
  detail:=reward||jsonb_build_object('id',ident,'title',q.title,'period',period);
 when 'arc.create' then
  if target is null or target<day or target>make_date(extract(year from day)::integer+2,extract(month from day)::integer,1)+extract(day from day)::integer-1 then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
  ident:=gen_random_uuid()::text;insert into lifequest.story_arcs(user_id,id,title,description,target_date,created_at,sort_position)
   values(actor,ident,title,description,target,instant,lifequest.next_position(actor,'story_arcs'));
  detail:=jsonb_build_object('id',ident,'revision','0');
 when 'arc.delete' then
  select * into a from lifequest.story_arcs where user_id=actor and id=ident for update;
  if not found then raise exception 'NOT_FOUND' using errcode='PT404';end if;perform lifequest.assert_revision(a.revision,payload);n:=0;
  for item in select id from lifequest.quests where user_id=actor and arc_id=ident order by id for update loop
   update lifequest.quests set arc_id=null,revision=revision+1 where user_id=actor and id=item.id;n:=n+1;
  end loop;
  delete from lifequest.story_arcs where user_id=actor and id=ident;detail:=jsonb_build_object('id',ident,'detached',n);
 when 'achievement.sync' then
  n:=lifequest.sync_titles(actor,zone,instant);changed:=n>0;detail:=jsonb_build_object('unlocked',n);
 end case;
 return lifequest.command_end(ctx,changed,array['system'],detail);
end; $$;
create or replace function public.lifequest_operations_command(expected_actor uuid,request_id uuid,kind text,payload jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' set statement_timeout='5s' set extra_float_digits=3 as $$
declare ctx jsonb; actor uuid; instant timestamptz; zone text; ident text; subid text; b record; sub record; r record; s record; receipt record;
 mode text; label text; title text; goals jsonb; goal jsonb; weight integer; total integer:=0; position integer:=0;
 progressed boolean:=false; changed boolean:=true; detail jsonb; reward jsonb; duration integer; active_ms bigint; elapsed_ms bigint; remaining integer; new_id text;
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
    if changed then progressed:=true; update lifequest.boss_missions set current=b.current,completed_at=case when b.current=b.target then instant else null end,revision=revision+1 where user_id=actor and id=ident;end if;
   elsif kind='boss.claim' and b.current<b.target then raise exception 'NOT_DUE' using errcode='PT409';end if;
   if b.current=b.target then
    select * into receipt from lifequest.xp_events where user_id=actor and source_ref='lifequest:activity:boss:'||ident and period_key='once';
    if found and receipt.awarded_xp>0 then reward:=jsonb_build_object('credited',false,'xp',receipt.awarded_xp::text,'receiptId',receipt.id);
    elsif b.mode='counter' and b.base_xp=0 then
     update lifequest.boss_missions set reward_status='resolved_without_xp',completed_at=coalesce(completed_at,instant),revision=revision+case when progressed then 0 else 1 end where user_id=actor and id=ident;
     detail:=jsonb_build_object('id',ident,'status','resolved_without_xp','credited',false);
    else
     if receipt.id is not null then raise exception 'REWARD_PROOF_INVALID' using errcode='PT409';end if;
     reward:=lifequest.credit(actor,'boss',ident,'once',b.base_xp,'discipline',instant,zone,b.title);
    end if;
    if reward is not null then
     update lifequest.boss_missions set reward_status='credited',completed_at=coalesce(completed_at,instant),revision=revision+case when progressed then 0 else 1 end where user_id=actor and id=ident;
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
  if r.status='completed' and r.mode<>'focus' and kind='focus.finish' then
   changed:=false;detail:=jsonb_build_object('id',ident,'credited',false);
  elsif r.status='completed' and kind in ('focus.finish','focus.claim') and exists(select 1 from lifequest.focus_sessions where user_id=actor and id=ident and reward_status='credited') then
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
   if detail is null then detail:=jsonb_build_object('id',coalesce(new_id,ident),'revision',case when new_id is null then (r.revision+case when changed then 1 else 0 end)::text else '0' end,'remainingSeconds',case when new_id is null then remaining else duration end);end if;
  end if;
 end if;
 return lifequest.command_end(ctx,changed,(case when kind like 'boss.%' then array['operations'] else array['lab'] end)||case when coalesce((reward->>'credited')::boolean,false) then array['system'] else array[]::text[] end,detail);
end; $$;
create or replace function public.lifequest_lab_command(expected_actor uuid,request_id uuid,kind text,payload jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' set statement_timeout='5s' as $$
<<lifequest_lab_command>>
declare ctx jsonb; actor uuid; instant timestamptz; ident text; parent text; row_data record; child record;
 title text; content text; tag text; notes text; url text; topic text; day date;
 wins text; challenges text; gratitude text; tomorrow text; prompt text; response text; desired boolean;
 changed boolean:=true; detail jsonb; n integer:=0;
begin
 case kind
 when 'idea.create' then perform lifequest.payload_shape(payload,array['title','content','tag']);
 when 'idea.set_archived' then perform lifequest.payload_shape(payload,array['id','expectedRevision','archived']);
 when 'idea.delete','node.delete','resource.delete','journal.delete' then perform lifequest.payload_shape(payload,array['id','expectedRevision']);
 when 'node.create' then perform lifequest.payload_shape(payload,array['title'],array['parentId']);
 when 'resource.create' then perform lifequest.payload_shape(payload,array['title','notes','url','topic']);
 when 'resource.set_mastered' then perform lifequest.payload_shape(payload,array['id','expectedRevision','mastered']);
 when 'journal.save' then perform lifequest.payload_shape(payload,array['date','wins','challenges','gratitude','tomorrow','expectedRevision']);
 when 'creativity.submit' then perform lifequest.payload_shape(payload,array['prompt','response']);
 else raise exception 'COMMAND_UNKNOWN' using errcode='PT400';end case;
 if payload?'id' then ident:=lifequest.input_text(payload,'id',512,true);end if;
 if payload?'expectedRevision' and payload->'expectedRevision'<>'null'::jsonb then perform lifequest.target_revision(payload);end if;
 if payload?'title' then title:=lifequest.js_trim(lifequest.input_text(payload,'title',120,true));end if;
 if kind='idea.create' then content:=lifequest.input_text(payload,'content',10000);tag:=lifequest.input_text(payload,'tag',80);end if;
 if kind='node.create' and payload?'parentId' and payload->'parentId'<>'null'::jsonb then parent:=lifequest.input_text(payload,'parentId',512,true);end if;
 if kind='resource.create' then
  notes:=lifequest.input_text(payload,'notes',10000);url:=lifequest.input_text(payload,'url',2048);topic:=lifequest.input_text(payload,'topic',120);
  if not lifequest.resource_url_allowed(url) then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
 end if;
 if kind='journal.save' then
  day:=lifequest.input_date(payload,'date');wins:=lifequest.input_text(payload,'wins',10000);challenges:=lifequest.input_text(payload,'challenges',10000);
  gratitude:=lifequest.input_text(payload,'gratitude',10000);tomorrow:=lifequest.input_text(payload,'tomorrow',10000);
 end if;
 if kind='creativity.submit' then
  prompt:=lifequest.input_text(payload,'prompt',200,true);response:=lifequest.input_text(payload,'response',10000,true);
  if prompt<>all(array['Imagine dix usages inattendus pour un objet courant.','Ecris une histoire en exactement six phrases.','Propose trois solutions originales a un probleme quotidien.',
   'Dessine ou decris une invention pour economiser du temps.','Associe deux domaines sans rapport pour creer une idee.','Transforme une mauvaise habitude en mecanique de jeu.',
   'Invente un nouveau defi pour ton futur toi.','Concois une application utile en cinq fonctionnalites.','Redige une scene ou un personnage surmonte sa peur.','Trouve cinq variantes pour ameliorer un projet existant.']) then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
 end if;
 if kind in ('idea.set_archived','resource.set_mastered') then
  if jsonb_typeof(payload->case when kind='idea.set_archived' then 'archived' else 'mastered' end) is distinct from 'boolean' then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
  desired:=(payload->>case when kind='idea.set_archived' then 'archived' else 'mastered' end)::boolean;
 end if;
 ctx:=lifequest.command_begin(expected_actor,request_id,kind,payload);if ctx?'replay' then return ctx->'replay';end if;
 actor:=(ctx->>'actor')::uuid;instant:=(ctx->>'now')::timestamptz;
 case kind
 when 'idea.create' then
  ident:=gen_random_uuid()::text;insert into lifequest.ideas(user_id,id,title,content,tag,archived,created_at,sort_position)
   values(actor,ident,title,content,tag,false,instant,lifequest.next_position(actor,'ideas',true));detail:=jsonb_build_object('id',ident,'revision','0');
 when 'idea.set_archived','idea.delete' then
  select * into row_data from lifequest.ideas where user_id=actor and id=ident for update;
  if not found then raise exception 'NOT_FOUND' using errcode='PT404';end if;
  changed:=kind='idea.delete' or row_data.archived<>desired;
  if changed then perform lifequest.assert_revision(row_data.revision,payload);
   if kind='idea.delete' then delete from lifequest.ideas where user_id=actor and id=ident;
   else update lifequest.ideas set archived=desired,revision=revision+1 where user_id=actor and id=ident;end if;
  end if;detail:=jsonb_build_object('id',ident,'revision',(row_data.revision+case when changed then 1 else 0 end)::text);
 when 'node.create' then
  if parent is not null and not exists(select 1 from lifequest.mind_nodes where user_id=actor and id=parent) then parent:=null;end if;
  ident:=gen_random_uuid()::text;insert into lifequest.mind_nodes(user_id,id,title,parent_id,x,y,sort_position)
   values(actor,ident,title,parent,0,0,lifequest.next_position(actor,'mind_nodes'));detail:=jsonb_build_object('id',ident,'parentId',parent,'revision','0');
 when 'node.delete' then
  select * into row_data from lifequest.mind_nodes where user_id=actor and id=ident for update;
  if not found then raise exception 'NOT_FOUND' using errcode='PT404';end if;perform lifequest.assert_revision(row_data.revision,payload);
  for child in select id from lifequest.mind_nodes where user_id=actor and parent_id=ident order by id for update loop
   update lifequest.mind_nodes set parent_id=null,revision=revision+1 where user_id=actor and id=child.id;n:=n+1;
  end loop;
  delete from lifequest.mind_nodes where user_id=actor and id=ident;detail:=jsonb_build_object('id',ident,'rootedChildren',n);
 when 'resource.create' then
  ident:=gen_random_uuid()::text;insert into lifequest.resources(user_id,id,title,notes,url,topic,mastered,created_at,sort_position)
   values(actor,ident,title,notes,url,topic,false,instant,lifequest.next_position(actor,'resources',true));detail:=jsonb_build_object('id',ident,'revision','0');
 when 'resource.set_mastered','resource.delete' then
  select * into row_data from lifequest.resources where user_id=actor and id=ident for update;
  if not found then raise exception 'NOT_FOUND' using errcode='PT404';end if;changed:=kind='resource.delete' or row_data.mastered<>desired;
  if changed then perform lifequest.assert_revision(row_data.revision,payload);
   if kind='resource.delete' then delete from lifequest.resources where user_id=actor and id=ident;
   else update lifequest.resources set mastered=desired,revision=revision+1 where user_id=actor and id=ident;end if;
  end if;detail:=jsonb_build_object('id',ident,'revision',(row_data.revision+case when changed then 1 else 0 end)::text);
 when 'journal.save' then
  if day>(instant at time zone (ctx->>'zone'))::date then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
  select * into row_data from lifequest.journal_entries where user_id=actor and local_date=day for update;
  if found then
   if payload->'expectedRevision'='null'::jsonb then raise exception 'REVISION_CONFLICT' using errcode='PT409';end if;
   perform lifequest.assert_revision(row_data.revision,payload);ident:=row_data.id;
   changed:=row(row_data.wins,row_data.challenges,row_data.gratitude,row_data.tomorrow) is distinct from row(wins,challenges,gratitude,tomorrow);
   if changed then update lifequest.journal_entries set wins=lifequest_lab_command.wins,challenges=lifequest_lab_command.challenges,gratitude=lifequest_lab_command.gratitude,tomorrow=lifequest_lab_command.tomorrow,revision=revision+1 where user_id=actor and id=ident;end if;
   detail:=jsonb_build_object('id',ident,'revision',(row_data.revision+case when changed then 1 else 0 end)::text);
  else
   if payload->'expectedRevision'<>'null'::jsonb then raise exception 'REVISION_CONFLICT' using errcode='PT409';end if;
   ident:=gen_random_uuid()::text;insert into lifequest.journal_entries(user_id,id,local_date,wins,challenges,gratitude,tomorrow,sort_position)
    values(actor,ident,day,wins,challenges,gratitude,tomorrow,lifequest.next_position(actor,'journal_entries',true));detail:=jsonb_build_object('id',ident,'revision','0');
  end if;
 when 'journal.delete' then
  select * into row_data from lifequest.journal_entries where user_id=actor and id=ident for update;
  if not found then raise exception 'NOT_FOUND' using errcode='PT404';end if;perform lifequest.assert_revision(row_data.revision,payload);
  delete from lifequest.journal_entries where user_id=actor and id=ident;detail:=jsonb_build_object('id',ident);
 when 'creativity.submit' then
  ident:=gen_random_uuid()::text;insert into lifequest.creativity_challenges(user_id,id,prompt,response,occurred_at,completed,sort_position)
   values(actor,ident,prompt,response,instant,true,lifequest.next_position(actor,'creativity_challenges',true));detail:=jsonb_build_object('id',ident,'revision','0');
 end case;
 return lifequest.command_end(ctx,changed,array['lab'],detail);
end; $$;
create or replace function lifequest.command_end(ctx jsonb,changed boolean,modules text[],detail jsonb,outcome text default 'applied') returns jsonb
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
 result:=jsonb_build_object('actor',actor,'requestId',ctx->>'request','committedRevision',rev::text,'outcome',case when detail?'receiptId' and detail->>'credited'='false' then 'already_credited' when changed then outcome else 'noop' end,'replayed',false,'result',detail);
 insert into lifequest.command_receipts(user_id,request_id,command_kind,canonical_payload_hash,minimal_result,committed_revision,committed_at)
 values(actor,(ctx->>'request')::uuid,ctx->>'kind',ctx->>'hash',result,rev,(ctx->>'now')::timestamptz);
 -- Force deferred structural checks before the last identity/calendar validation.
 set constraints all immediate;
 if lifequest.current_actor() is distinct from actor then raise exception 'SESSION_DENIED' using errcode='42501';end if;
 perform lifequest.calendar_guard(ctx->>'zone',clock_timestamp());
 if clock_timestamp()>(ctx->>'started')::timestamptz+interval '5 seconds' then raise exception 'COMMAND_TIMEOUT' using errcode='57014';end if;
 return result;
end; $$;
revoke all on function lifequest.command_end(jsonb,boolean,text[],jsonb,text) from public,anon,authenticated;
revoke all on function public.lifequest_quest_command(uuid,uuid,text,jsonb),public.lifequest_operations_command(uuid,uuid,text,jsonb),public.lifequest_lab_command(uuid,uuid,text,jsonb) from public,anon;
reset role;
revoke create on schema public from lifequest_command_owner;
set local role lifequest_schema_owner;
revoke create on schema lifequest from lifequest_command_owner;
reset role;
grant lifequest_schema_owner,lifequest_command_owner to postgres with inherit false,set false;
