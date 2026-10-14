grant lifequest_schema_owner,lifequest_command_owner to postgres with inherit false,set true;
set local role lifequest_schema_owner;
grant create on schema lifequest to lifequest_command_owner;
reset role;
grant create on schema public to lifequest_command_owner;
set local role lifequest_command_owner;
create function lifequest.input_date(p jsonb,key text) returns date
language plpgsql immutable set search_path='' as $$
declare v text:=lifequest.input_text(p,key,10);
begin
 if v!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or left(v,4)='0000' then raise exception 'VALIDATION_FAILED' using errcode='PT400';end if;
 return v::date;
exception when datetime_field_overflow or invalid_datetime_format then raise exception 'VALIDATION_FAILED' using errcode='PT400';end; $$;
create function lifequest.next_period(f text,day date) returns date
language sql immutable strict set search_path='' as $$
 select case f when 'weekly' then day+7-(extract(isodow from day)::integer-1)
 when 'monthly' then (date_trunc('month',day::timestamp)+interval '1 month')::date else day+1 end;
$$;
create function public.lifequest_quest_command(expected_actor uuid,request_id uuid,kind text,payload jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' set statement_timeout='5s' set extra_float_digits=3 as $$
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
revoke all on function lifequest.input_date(jsonb,text),lifequest.next_period(text,date),public.lifequest_quest_command(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.lifequest_quest_command(uuid,uuid,text,jsonb) to authenticated;
reset role;
revoke create on schema public from lifequest_command_owner;
set local role lifequest_schema_owner;
revoke create on schema lifequest from lifequest_command_owner;
reset role;
grant lifequest_schema_owner,lifequest_command_owner to postgres with inherit false,set false;
